<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import { writable, type Writable } from "svelte/store";
    import {
        useWhiteboardYDoc,
        type DrawPath,
        type WhiteboardCard,
        type WhiteboardFrame,
        type WhiteboardImage,
        type WhiteboardFigure,
    } from "./useWhiteboardYDoc";
    import { loadConfig } from "$lib/config";
    import { getNip07Pubkey, signAndPublishNip07 } from "$lib/nostrUtils";
    import { theme } from "$lib/stores/theme.svelte";
    import * as Y from "yjs";
    import EncryptedImage from "$lib/components/EncryptedImage.svelte";
    import MarkdownText from "$lib/components/MarkdownText.svelte";
    import { resizeImage } from "$lib/imageUtils";
    import { encryptFile, arrayBufferToHex } from "$lib/cryptoUtils";
    import { uploadFile } from "$lib/blossomClient";
    import { appState } from "$lib/stores/appState.svelte";

    // Action to auto-focus an element
    function focus(node: HTMLElement) {
        node.focus();
        return {};
    }

    let {
        documentId,
        user = { name: "Anon", color: "#ff0000" },
        mode = "local",
        activeTool = $bindable("hand"),
        currentColor = $bindable("#000000"),
        currentWidth = $bindable(3),
        cardColor = $bindable("#fff9c4"),
        title = $bindable(""),
        awareness = $bindable(null),
    } = $props<{
        documentId: string;
        user?: { name: string; color: string };
        mode?: "local" | "nostr" | "group";
        activeTool?: "hand" | "pen" | "card" | "frame" | "select" | "figure";
        currentColor?: string;
        currentWidth?: number;
        cardColor?: string;
        title?: string;
        awareness?: any;
    }>();

    let paths: Writable<DrawPath[]> = $state(writable([]));
    let cards: Writable<WhiteboardCard[]> = $state(writable([]));
    let frames: Writable<WhiteboardFrame[]> = $state(writable([]));
    let images: Writable<WhiteboardImage[]> = $state(writable([]));
    let figures: Writable<WhiteboardFigure[]> = $state(writable([]));
    let cleanup: (() => void) | null = null;
    let actions: any = {};
    let ydoc: Y.Doc | null = $state(null);

    const CARD_COLORS = [
        { name: "Yellow", value: "#fff9c4" },
        { name: "Post-It", value: "#fff176" },
        { name: "Pink", value: "#f8bbd0" },
        { name: "Green", value: "#c8e6c9" },
        { name: "Orange", value: "#ffe0b2" },
        { name: "Purple", value: "#e1bee7" },
        { name: "Blue", value: "#bbdefb" },
    ];

    // Interaction State
    let isDrawing = false;
    let currentPathId: string | null = null;
    let draggingCardId: string | null = null;
    let resizingCardId: string | null = null;
    let draggingFrameId: string | null = null;
    let resizingFrameId: string | null = null;
    let draggingImageId: string | null = null;
    let resizingImageId: string | null = null;
    let draggingFigureId: string | null = null;
    let attachedCardIds: Set<string> = new Set();
    let attachedImageIds: Set<string> = new Set();
    let dragOffset = { x: 0, y: 0 };
    let resizeStart = { x: 0, y: 0, width: 0, height: 0 };
    let editingCardId: string | null = $state(null);
    
    // Multi-Selection State
    let isSelecting = $state(false);
    let selectionBox = $state({ startX: 0, startY: 0, endX: 0, endY: 0 });
    let selectedElementIds = $state(new Set<string>());
    let isDraggingSelection = $state(false);
    let dragStartOffsets = new Map<string, {x: number, y: number}>();
    
    // Clipboard State
    let clipboard: any[] = [];
    
    // Trigger reactive updates when selection changes
    let selectionVersion = $state(0);
    
    // Panning State
    let isPanning = $state(false);
    let panOffset = $state({ x: 0, y: 0 });
    let panStart = { x: 0, y: 0, startOffsetX: 0, startOffsetY: 0 };
    let isShiftPressed = $state(false);
    
    // Zoom State
    let zoomLevel = $state(1); // 1 = 100% (1:1 Pixel mapping)
    const MIN_ZOOM = 0.1;
    const MAX_ZOOM = 20;
    const ZOOM_STEP = 0.1;
    
    // Container dimensions for dynamic viewBox
    let containerWidth = $state(1920);
    let containerHeight = $state(1080);
    
    // Persistence Key
    const VIEW_STORAGE_KEY = `whiteboard_view_${documentId}`;
    
    let initialFitDone = false;

    $effect(() => {
        const hasData = $cards.length > 0 || $frames.length > 0 || $images.length > 0 || $paths.length > 0;
        if (hasData && !initialFitDone && svgElement) {
            // Wait for DOM to update with new elements
            setTimeout(() => {
                fitToContent();
                initialFitDone = true;
            }, 50);
        }
    });

    function saveViewState() {
        try {
            const state = {
                zoom: zoomLevel,
                pan: panOffset
            };
            localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn("Failed to save view state", e);
        }
    }

    function loadViewState() {
        try {
            const stored = localStorage.getItem(VIEW_STORAGE_KEY);
            if (stored) {
                const state = JSON.parse(stored);
                if (state.zoom && !isNaN(state.zoom)) zoomLevel = state.zoom;
                if (state.pan && typeof state.pan.x === 'number' && typeof state.pan.y === 'number') {
                    panOffset = state.pan;
                }
            }
        } catch (e) {
            console.warn("Failed to load view state", e);
        }
    }
    
    function updateSelectionVersion() {
        selectionVersion++;
    }
    
    // ViewBox für Panning und Zoom
    // Wir nutzen die tatsächliche Container-Größe, damit 100% Zoom = 1:1 Pixel-Mapping ist.
    // Das verhindert auch Verzerrungen/Letterboxing, da die Aspect Ratio stimmt.
    let viewBox = $derived(`${-panOffset.x} ${-panOffset.y} ${containerWidth / zoomLevel} ${containerHeight / zoomLevel}`);

    const MAX_CARD_HEIGHT = 300;

    // Derived State for Z-Index Sorting
    let sortedElements = $derived.by(() => {
        const allCards = $cards.map((c) => ({ ...c, type: "card" as const }));
        const allImages = $images.map((i) => ({
            ...i,
            type: "image" as const,
        }));
        const allFigures = $figures.map((f) => ({ ...f, type: "figure" as const }));
        return [...allCards, ...allImages, ...allFigures].sort(
            (a, b) => (a.zIndex || 0) - (b.zIndex || 0),
        );
    });

    function isCard(
        element: any,
    ): element is WhiteboardCard & { type: "card" } {
        return element.type === "card";
    }

    function isFigure(
        element: any,
    ): element is WhiteboardFigure & { type: "figure" } {
        return element.type === "figure";
    }

    function bringToFront(element: WhiteboardCard | WhiteboardImage | WhiteboardFigure) {
        const maxZ = Math.max(
            ...$cards.map((c) => c.zIndex || 0),
            ...$images.map((i) => i.zIndex || 0),
            ...$figures.map((f) => f.zIndex || 0),
            0,
        );
        const newZ = maxZ + 1;

        if ("text" in element) {
            actions.updateCard(element.id, { zIndex: newZ });
        } else if ("url" in element) {
            actions.updateImage(element.id, { zIndex: newZ });
        } else if ("name" in element) {
            actions.updateFigure(element.id, { zIndex: newZ });
        }
    }

    // Canvas Ref
    let svgElement: SVGSVGElement;

    export function undo() {
        actions.undo();
    }

    export function clearDrawings() {
        actions.clearDrawings();
    }

    export function deleteSelected() {
        const cardIds = Array.from(selectedElementIds).filter(id => 
            $cards.some(c => c.id === id)
        );
        const imageIds = Array.from(selectedElementIds).filter(id => 
            $images.some(i => i.id === id)
        );
        const frameIds = Array.from(selectedElementIds).filter(id => 
            $frames.some(f => f.id === id)
        );
        const figureIds = Array.from(selectedElementIds).filter(id => 
            $figures.some(f => f.id === id)
        );
        
        actions.deleteMultiple(cardIds, imageIds, frameIds, figureIds);
        selectedElementIds.clear();
        updateSelectionVersion();
    }

    export function getSelectedCount() {
        // Force reactivity by accessing selectionVersion
        selectionVersion;
        return selectedElementIds.size;
    }
    
    export function copySelected() {
        clipboard = [];
        selectedElementIds.forEach(id => {
             const card = $cards.find(c => c.id === id);
             if (card) { clipboard.push({ ...card, type: 'card' }); return; }
             const image = $images.find(i => i.id === id);
             if (image) { clipboard.push({ ...image, type: 'image' }); return; }
             const frame = $frames.find(f => f.id === id);
             if (frame) { clipboard.push({ ...frame, type: 'frame' }); return; }
        });
    }

    export function paste() {
        if (clipboard.length === 0) return;
        
        // Deselect current
        selectedElementIds.clear();
        
        // Offset for paste
        const offset = 20;
        
        clipboard.forEach(item => {
            if (item.type === 'card') {
                const newId = actions.addCard(item.x + offset, item.y + offset, item.color);
                actions.updateCard(newId, { 
                    text: item.text, 
                    width: item.width, 
                    height: item.height, 
                    zIndex: Date.now() 
                });
                selectedElementIds.add(newId);
            } else if (item.type === 'frame') {
                const newId = actions.addFrame(item.x + offset, item.y + offset);
                actions.updateFrame(newId, { 
                    label: item.label, 
                    width: item.width, 
                    height: item.height 
                });
                selectedElementIds.add(newId);
            } else if (item.type === 'image') {
                const newId = actions.addImage(
                    item.x + offset, 
                    item.y + offset, 
                    item.url, 
                    item.iv, 
                    item.mimetype, 
                    item.width, 
                    item.height
                );
                actions.updateImage(newId, { 
                    width: item.width, 
                    height: item.height, 
                    zIndex: Date.now() 
                });
                selectedElementIds.add(newId);
            }
        });
        updateSelectionVersion();
    }
    
    export function duplicateSelected() {
        copySelected();
        paste();
    }
    
    export function zoomIn() {
        const oldZoom = zoomLevel;
        const newZoom = Math.min(MAX_ZOOM, oldZoom * 1.2);
        
        if (newZoom === oldZoom) return;
        
        // Zoom towards center of screen
        const centerX = containerWidth / 2;
        const centerY = containerHeight / 2;
        
        const scaleChange = (1/newZoom - 1/oldZoom);
        const newPanX = panOffset.x + centerX * scaleChange;
        const newPanY = panOffset.y + centerY * scaleChange;
        
        zoomLevel = newZoom;
        panOffset = { x: newPanX, y: newPanY };
        saveViewState();
    }
    
    export function zoomOut() {
        const oldZoom = zoomLevel;
        const newZoom = Math.max(MIN_ZOOM, oldZoom / 1.2);
        
        if (newZoom === oldZoom) return;
        
        // Zoom towards center of screen
        const centerX = containerWidth / 2;
        const centerY = containerHeight / 2;
        
        const scaleChange = (1/newZoom - 1/oldZoom);
        const newPanX = panOffset.x + centerX * scaleChange;
        const newPanY = panOffset.y + centerY * scaleChange;
        
        zoomLevel = newZoom;
        panOffset = { x: newPanX, y: newPanY };
        saveViewState();
    }
    
    export function resetZoom() {
        zoomLevel = 1.5; // 150% für bessere Lesbarkeit
        panOffset = { x: 0, y: 0 };
        saveViewState();
    }
    
    export function getZoomLevel() {
        return Math.round(zoomLevel * 100);
    }
    
    export function fitToContent() {
        if (!svgElement) {
            resetZoom();
            return;
        }
        
        // Berechne Bounding Box aller Elemente
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasElements = false;
        
        // Paths (points are [x, y] arrays)
        $paths.forEach(path => {
            if (path.points && path.points.length > 0) {
                path.points.forEach(point => {
                    const [x, y] = point;
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                    hasElements = true;
                });
            }
        });
        
        // Cards
        $cards.forEach(card => {
            minX = Math.min(minX, card.x);
            minY = Math.min(minY, card.y);
            maxX = Math.max(maxX, card.x + card.width);
            maxY = Math.max(maxY, card.y + card.height);
            hasElements = true;
        });
        
        // Frames
        $frames.forEach(frame => {
            minX = Math.min(minX, frame.x);
            minY = Math.min(minY, frame.y);
            maxX = Math.max(maxX, frame.x + frame.width);
            maxY = Math.max(maxY, frame.y + frame.height);
            hasElements = true;
        });
        
        // Images
        $images.forEach(image => {
            minX = Math.min(minX, image.x);
            minY = Math.min(minY, image.y);
            maxX = Math.max(maxX, image.x + image.width);
            maxY = Math.max(maxY, image.y + image.height);
            hasElements = true;
        });

        // Figures
        $figures.forEach(figure => {
            minX = Math.min(minX, figure.x);
            minY = Math.min(minY, figure.y);
            maxX = Math.max(maxX, figure.x + 50);
            maxY = Math.max(maxY, figure.y + 100);
            hasElements = true;
        });
        
        if (!hasElements || minX === Infinity) {
            resetZoom();
            return;
        }
        
        // Berechne Content-Größe
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        
        if (contentWidth <= 0 || contentHeight <= 0) {
            resetZoom();
            return;
        }
        
        // Füge minimales Padding hinzu (10% für etwas Luft)
        const padding = 0.1;
        const paddedWidth = contentWidth * (1 + 2 * padding);
        const paddedHeight = contentHeight * (1 + 2 * padding);
        
        // Hole Viewport-Größe
        const rect = svgElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return;
        }

        const viewportAspect = rect.width / rect.height;
        const contentAspect = paddedWidth / paddedHeight;
        
        // Berechne ViewBox-Größe die dem Viewport-Aspect entspricht
        let targetViewBoxWidth, targetViewBoxHeight;
        
        if (viewportAspect > contentAspect) {
            // Viewport breiter als Content - expandiere Width
            targetViewBoxHeight = paddedHeight;
            targetViewBoxWidth = paddedHeight * viewportAspect;
        } else {
            // Viewport höher als Content - expandiere Height
            targetViewBoxWidth = paddedWidth;
            targetViewBoxHeight = paddedWidth / viewportAspect;
        }
        
        // Berechne Zoom: wie oft passt targetViewBox in Container
        const zoomX = containerWidth / targetViewBoxWidth;
        const zoomY = containerHeight / targetViewBoxHeight;
        let optimalZoom = Math.min(zoomX, zoomY);
        
        // Begrenze nur nach unten (Min 10%), nach oben kein Limit
        optimalZoom = Math.max(MIN_ZOOM, optimalZoom);
        
        if (isNaN(optimalZoom) || !isFinite(optimalZoom)) {
            resetZoom();
            return;
        }
        
        zoomLevel = optimalZoom;
        
        // Berechne ViewBox und zentriere Content
        const viewBoxWidth = containerWidth / zoomLevel;
        const viewBoxHeight = containerHeight / zoomLevel;
        
        const contentCenterX = (minX + maxX) / 2;
        const contentCenterY = (minY + maxY) / 2;
        
        // ViewBox startet bei (-panOffset.x, -panOffset.y)
        // Mitte der ViewBox: -panOffset.x + viewBoxWidth/2
        // Soll sein: contentCenterX
        // => panOffset.x = viewBoxWidth/2 - contentCenterX
        panOffset = {
            x: viewBoxWidth / 2 - contentCenterX,
            y: viewBoxHeight / 2 - contentCenterY
        };
        
        saveViewState();
    }

    onMount(async () => {
        // Keyboard listeners for Shift key
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                isShiftPressed = true;
            }
            
            // Copy/Paste/Duplicate shortcuts
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'c') {
                    copySelected();
                } else if (e.key === 'v') {
                    paste();
                } else if (e.key === 'd') {
                    e.preventDefault(); // Prevent bookmark dialog
                    duplicateSelected();
                }
            }
            
            // Delete shortcut
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Only delete if not editing text
                if (!editingCardId && selectedElementIds.size > 0) {
                    deleteSelected();
                }
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                isShiftPressed = false;
                // Stop panning if we were panning with shift
                if (isPanning) {
                    isPanning = false;
                }
            }
        };
        
        // Mouse wheel listener for zoom
        const handleWheel = (e: WheelEvent) => {
            // Only zoom if Ctrl is pressed or if we're in hand/select tool
            if (e.ctrlKey || activeTool === 'hand' || activeTool === 'select') {
                e.preventDefault();
                
                const rect = svgElement.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                const oldZoom = zoomLevel;
                // Multiplicative zoom for better feel
                const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
                let newZoom = oldZoom * zoomFactor;
                
                // Clamp
                newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
                
                if (newZoom === oldZoom) return;
                
                // Adjust pan to zoom towards mouse pointer
                // Formula: newPan = oldPan + mousePos * (1/newZoom - 1/oldZoom)
                const scaleChange = (1/newZoom - 1/oldZoom);
                const newPanX = panOffset.x + mouseX * scaleChange;
                const newPanY = panOffset.y + mouseY * scaleChange;
                
                zoomLevel = newZoom;
                panOffset = { x: newPanX, y: newPanY };
                saveViewState();
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        
        // Add wheel listener to SVG element (will be set after mount)
        const addWheelListener = () => {
            if (svgElement) {
                svgElement.addEventListener('wheel', handleWheel, { passive: false });
            }
        };
        setTimeout(addWheelListener, 0);
        
        // Load persisted view state
        // loadViewState(); // Disabled in favor of auto-fit on load
        
        let pubkey = "";
        let relays: string[] = [];
        let signAndPublish: any = null;

        if (mode === "nostr" || mode === "group") {
            try {
                const config = await loadConfig();
                relays = config.docRelays;

                if (mode === "group") {
                    // Group mode: use private key from appState
                    const { appState } = await import(
                        "$lib/stores/appState.svelte"
                    );
                    const { signWithPrivateKey } = await import(
                        "$lib/groupAuth"
                    );
                    const { getPubkeyFromPrivateKey } = await import(
                        "$lib/groupAuth"
                    );

                    // CRITICAL: Wait for group initialization to complete
                    await appState.ensureInitialized();

                    if (!appState.groupPrivateKey) {
                        console.error("No group private key found");
                        return;
                    }

                    pubkey = getPubkeyFromPrivateKey(appState.groupPrivateKey);
                    signAndPublish = (evt: any) =>
                        signWithPrivateKey(
                            evt,
                            appState.groupPrivateKey!,
                            relays,
                        );
                } else {
                    // Nostr mode: use NIP-07
                    pubkey = await getNip07Pubkey();
                    signAndPublish = (evt: any) =>
                        signAndPublishNip07(evt, relays);
                }
            } catch (e) {
                console.error("Failed to init Nostr/Group:", e);
            }
        }

        const result = useWhiteboardYDoc(
            documentId,
            mode,
            user,
            pubkey,
            signAndPublish,
            relays,
        );

        paths = result.paths;
        cards = result.cards;
        frames = result.frames;
        images = result.images;
        figures = result.figures;
        cleanup = result.cleanup;
        ydoc = result.ydoc;
        awareness = result.awareness;
        actions = {
            startPath: result.startPath,
            updatePath: result.updatePath,
            endPath: result.endPath,
            addCard: result.addCard,
            updateCard: result.updateCard,
            deleteCard: result.deleteCard,
            addFrame: result.addFrame,
            updateFrame: result.updateFrame,
            deleteFrame: result.deleteFrame,
            addImage: result.addImage,
            updateImage: result.updateImage,
            deleteImage: result.deleteImage,
            addFigure: result.addFigure,
            updateFigure: result.updateFigure,
            deleteFigure: result.deleteFigure,
            deleteMultiple: result.deleteMultiple,
            clearDrawings: result.clearDrawings,
            undo: result.undo,
        };

        // Title Sync Logic
        const metaMap = ydoc.getMap("metadata");

        const handleMetaUpdate = (event: Y.YMapEvent<any>) => {
            if (event.transaction.local) return;
            const storedTitle = metaMap.get("whiteboard-title") as string;
            if (storedTitle !== undefined && storedTitle !== title) {
                title = storedTitle;
            }
        };

        metaMap.observe(handleMetaUpdate);

        // Initial sync
        const storedTitle = metaMap.get("whiteboard-title") as string;
        untrack(() => {
            if (storedTitle !== undefined && storedTitle !== title) {
                title = storedTitle;
            } else if (
                storedTitle === undefined &&
                title &&
                title !== documentId
            ) {
                metaMap.set("whiteboard-title", title);
            }
        });

        // Wrap cleanup to include unobserve, keyboard listeners, and wheel listener
        const originalCleanup = cleanup;
        cleanup = () => {
            metaMap.unobserve(handleMetaUpdate);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (svgElement) {
                svgElement.removeEventListener('wheel', handleWheel);
            }
            if (originalCleanup) originalCleanup();
        };
    });

    // Write title changes to Yjs
    $effect(() => {
        if (!ydoc) return;
        const metaMap = ydoc.getMap("metadata");
        const storedTitle = metaMap.get("whiteboard-title") as string;

        if (title && title !== storedTitle) {
            metaMap.set("whiteboard-title", title);
        }
    });

    // Sync user state with awareness
    $effect(() => {
        if (awareness && user) {
            const currentState = awareness.getLocalState() as any;
            const newUser = {
                name: user.name,
                color: user.color,
            };

            if (
                !currentState ||
                currentState.user?.name !== newUser.name ||
                currentState.user?.color !== newUser.color
            ) {
                awareness.setLocalStateField("user", newUser);
            }
        }
    });

    onDestroy(() => {
        if (cleanup) cleanup();
    });

    function getPoint(e: MouseEvent | TouchEvent): { x: number; y: number } {
        const rect = svgElement.getBoundingClientRect();
        let clientX, clientY;

        if (window.TouchEvent && e instanceof TouchEvent) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }

        // Transform from screen coordinates to SVG coordinates (accounting for pan offset and zoom)
        const viewBoxWidth = containerWidth / zoomLevel;
        const viewBoxHeight = containerHeight / zoomLevel;
        const relX = (clientX - rect.left) / rect.width * viewBoxWidth;
        const relY = (clientY - rect.top) / rect.height * viewBoxHeight;

        return {
            x: relX - panOffset.x,
            y: relY - panOffset.y,
        };
    }

    function checkElementInSelection(x: number, y: number, width: number, height: number): boolean {
        const minX = Math.min(selectionBox.startX, selectionBox.endX);
        const maxX = Math.max(selectionBox.startX, selectionBox.endX);
        const minY = Math.min(selectionBox.startY, selectionBox.endY);
        const maxY = Math.max(selectionBox.startY, selectionBox.endY);

        // Check if element intersects with selection box
        return !(x + width < minX || x > maxX || y + height < minY || y > maxY);
    }

    function updateSelection() {
        const newSelection = new Set<string>();

        $cards.forEach(card => {
            if (checkElementInSelection(card.x, card.y, card.width, card.height)) {
                newSelection.add(card.id);
            }
        });

        $images.forEach(image => {
            if (checkElementInSelection(image.x, image.y, image.width, image.height)) {
                newSelection.add(image.id);
            }
        });

        $frames.forEach(frame => {
            if (checkElementInSelection(frame.x, frame.y, frame.width, frame.height)) {
                newSelection.add(frame.id);
            }
        });

        selectedElementIds = newSelection;
        updateSelectionVersion();
    }

    function handleStart(e: MouseEvent | TouchEvent) {
        const { x, y } = getPoint(e);
        
        // Shift+Drag: Always enable panning (override current tool)
        if (isShiftPressed) {
            isPanning = true;
            panStart = { 
                x: e instanceof MouseEvent ? e.clientX : e.touches[0].clientX, 
                y: e instanceof MouseEvent ? e.clientY : e.touches[0].clientY,
                startOffsetX: panOffset.x,
                startOffsetY: panOffset.y
            };
            return;
        }
        
        // Hand Tool: Enable panning only on empty canvas (no element underneath)
        // If an element is clicked, the specific element handlers will take over
        if (activeTool === "hand") {
            // This will be reached only if clicking on empty canvas
            // (element handlers call stopPropagation)
            isPanning = true;
            panStart = { 
                x: e instanceof MouseEvent ? e.clientX : e.touches[0].clientX, 
                y: e instanceof MouseEvent ? e.clientY : e.touches[0].clientY,
                startOffsetX: panOffset.x,
                startOffsetY: panOffset.y
            };
            return;
        }

        if (activeTool === "select") {
            // Clear existing selection and start new selection box
            if (selectedElementIds.size > 0) {
                selectedElementIds.clear();
                updateSelectionVersion();
            }
            
            isSelecting = true;
            selectionBox = { startX: x, startY: y, endX: x, endY: y };
            return;
        }

        if (activeTool === "pen") e.preventDefault();

        if (activeTool === "pen") {
            isDrawing = true;
            currentPathId = actions.startPath(x, y, currentColor, currentWidth);
        } else if (activeTool === "card") {
            actions.addCard(x - 100, y - 75, cardColor);
            activeTool = "hand";
        } else if (activeTool === "frame") {
            actions.addFrame(x, y);
            activeTool = "hand";
        } else if (activeTool === "figure") {
            actions.addFigure(x, y, user.name, user.color);
            activeTool = "hand";
        }
    }

    function handleMove(e: MouseEvent | TouchEvent) {
        e.preventDefault();
        const { x, y } = getPoint(e);
        
        // Handle panning
        if (isPanning) {
            const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
            const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;
            
            const dx = clientX - panStart.x;
            const dy = clientY - panStart.y;
            
            panOffset = {
                x: panStart.startOffsetX + dx,
                y: panStart.startOffsetY + dy
            };
            return;
        }

        if (isSelecting) {
            selectionBox.endX = x;
            selectionBox.endY = y;
            updateSelection();
            return;
        }
        
        // Handle Multi-Selection Drag
        if (isDraggingSelection) {
            dragStartOffsets.forEach((offset, id) => {
                const newX = x - offset.x;
                const newY = y - offset.y;
                
                if ($cards.some(c => c.id === id)) {
                    actions.updateCard(id, { x: newX, y: newY });
                } else if ($images.some(i => i.id === id)) {
                    actions.updateImage(id, { x: newX, y: newY });
                } else if ($frames.some(f => f.id === id)) {
                    actions.updateFrame(id, { x: newX, y: newY });
                    
                    // If dragging a frame, we might need to update attached items too?
                    // But if attached items are ALSO selected, they will be moved by this loop anyway.
                    // If attached items are NOT selected, they should move with the frame?
                    // Current logic for single frame drag handles attached items.
                    // For multi-drag, it's complicated. 
                    // If I select a frame AND a card inside it, both move.
                    // If I select ONLY the frame, the card inside should move too.
                    // Let's handle attached items for frames here too.
                    
                    // Check if this frame has attached items that are NOT in selection
                    // (If they are in selection, they are moved by the loop)
                    const frame = $frames.find(f => f.id === id);
                    if (frame) {
                        const dx = newX - frame.x;
                        const dy = newY - frame.y;
                        
                        // Find items inside this frame
                        $cards.forEach(c => {
                            if (!selectedElementIds.has(c.id)) {
                                const cx = c.x + c.width / 2;
                                const cy = c.y + c.height / 2;
                                // Use old frame position for check? No, frame is already updated in Yjs? 
                                // No, we are calculating new position.
                                // We need to know if card WAS inside frame.
                                // This is getting complex for multi-drag.
                                // Let's simplify: If dragging selection, only move selected items.
                                // Users can select frame + content if they want to move both.
                                // OR: We can keep the single-frame logic if ONLY one frame is selected?
                            }
                        });
                    }
                } else if ($figures.some(f => f.id === id)) {
                    actions.updateFigure(id, { x: newX, y: newY });
                }
            });
            return;
        }

        if (isDrawing && currentPathId) {
            actions.updatePath(currentPathId, x, y);
        } else if (draggingCardId) {
            actions.updateCard(draggingCardId, {
                x: x - dragOffset.x,
                y: y - dragOffset.y,
            });
        } else if (resizingCardId) {
            const dx = x - resizeStart.x;
            const dy = y - resizeStart.y;
            actions.updateCard(resizingCardId, {
                width: Math.max(150, resizeStart.width + dx),
                height: Math.max(100, resizeStart.height + dy),
            });
        } else if (draggingFrameId) {
            // ... (existing frame drag logic)
            const frame = $frames.find((f) => f.id === draggingFrameId);
            if (frame) {
                const newX = x - dragOffset.x;
                const newY = y - dragOffset.y;
                const dx = newX - frame.x;
                const dy = newY - frame.y;

                actions.updateFrame(draggingFrameId, {
                    x: newX,
                    y: newY,
                });

                attachedCardIds.forEach((cardId) => {
                    const card = $cards.find((c) => c.id === cardId);
                    if (card) {
                        actions.updateCard(cardId, {
                            x: card.x + dx,
                            y: card.y + dy,
                        });
                    }
                });

                attachedImageIds.forEach((imageId) => {
                    const image = $images.find((i) => i.id === imageId);
                    if (image) {
                        actions.updateImage(imageId, {
                            x: image.x + dx,
                            y: image.y + dy,
                        });
                    }
                });
            }
        } else if (resizingFrameId) {
            const dx = x - resizeStart.x;
            const dy = y - resizeStart.y;
            actions.updateFrame(resizingFrameId, {
                width: Math.max(100, resizeStart.width + dx),
                height: Math.max(100, resizeStart.height + dy),
            });
        } else if (draggingImageId) {
            actions.updateImage(draggingImageId, {
                x: x - dragOffset.x,
                y: y - dragOffset.y,
            });
        } else if (resizingImageId) {
            const dx = x - resizeStart.x;
            const dy = y - resizeStart.y;
            actions.updateImage(resizingImageId, {
                width: Math.max(50, resizeStart.width + dx),
                height: Math.max(50, resizeStart.height + dy),
            });
        } else if (draggingFigureId) {
            actions.updateFigure(draggingFigureId, {
                x: x - dragOffset.x,
                y: y - dragOffset.y,
            });
        }
    }

    function handleEnd(e: MouseEvent | TouchEvent) {
        if (isDrawing && currentPathId) {
            actions.endPath(currentPathId);
        }
        if (isSelecting) {
            isSelecting = false;
        }
        if (isPanning) {
            isPanning = false;
            saveViewState(); // Save state after panning
        }
        if (isDraggingSelection) {
            isDraggingSelection = false;
            dragStartOffsets.clear();
        }
        
        isDrawing = false;
        currentPathId = null;
        draggingCardId = null;
        resizingCardId = null;
        draggingFrameId = null;
        resizingFrameId = null;
        draggingImageId = null;
        resizingImageId = null;
        draggingFigureId = null;
        attachedCardIds.clear();
        attachedImageIds.clear();
    }

    function handleCardDragStart(
        e: MouseEvent | TouchEvent,
        card: WhiteboardCard,
    ) {
        if (activeTool !== "select" && activeTool !== "hand") return;
        e.stopPropagation();
        
        // Auto-switch to select when dragging an element from hand tool
        if (activeTool === "hand") {
            activeTool = "select";
        }
        
        const { x, y } = getPoint(e);
        
        // Multi-Selection Logic
        if (e.shiftKey || e.ctrlKey) {
            // Toggle selection
            if (selectedElementIds.has(card.id)) {
                selectedElementIds.delete(card.id);
            } else {
                selectedElementIds.add(card.id);
            }
            updateSelectionVersion();
            // If deselected, don't drag
            if (!selectedElementIds.has(card.id)) return;
        } else {
            // If clicking an unselected item without modifier, select ONLY it
            if (!selectedElementIds.has(card.id)) {
                selectedElementIds.clear();
                selectedElementIds.add(card.id);
                updateSelectionVersion();
            }
            // If clicking an ALREADY selected item, keep selection (to allow moving group)
        }
        
        // Prepare for dragging all selected items
        isDraggingSelection = true;
        dragStartOffsets.clear();
        
        selectedElementIds.forEach(id => {
            const item = $cards.find(c => c.id === id) || 
                         $images.find(i => i.id === id) || 
                         $frames.find(f => f.id === id);
            if (item) {
                dragStartOffsets.set(id, {
                    x: x - item.x,
                    y: y - item.y
                });
            }
        });
        
        // Also set single drag ID for z-index
        draggingCardId = card.id;
        bringToFront(card);
    }

    function handleCardResizeStart(
        e: MouseEvent | TouchEvent,
        card: WhiteboardCard,
    ) {
        if (activeTool !== "select" && activeTool !== "hand") return;
        e.stopPropagation();
        
        // Auto-switch to select when resizing an element from hand tool
        if (activeTool === "hand") {
            activeTool = "select";
        }
        const { x, y } = getPoint(e);
        resizingCardId = card.id;
        resizeStart = { x, y, width: card.width, height: card.height };
        bringToFront(card);
    }

    function handleFrameDragStart(
        e: MouseEvent | TouchEvent,
        frame: WhiteboardFrame,
    ) {
        if (activeTool !== "select" && activeTool !== "hand") return;
        e.stopPropagation();
        
        // Auto-switch to select when dragging an element from hand tool
        if (activeTool === "hand") {
            activeTool = "select";
        }
        
        const { x, y } = getPoint(e);
        
        // Multi-Selection Logic
        if (e.shiftKey || e.ctrlKey) {
            if (selectedElementIds.has(frame.id)) {
                selectedElementIds.delete(frame.id);
            } else {
                selectedElementIds.add(frame.id);
            }
            updateSelectionVersion();
            if (!selectedElementIds.has(frame.id)) return;
        } else {
            if (!selectedElementIds.has(frame.id)) {
                selectedElementIds.clear();
                selectedElementIds.add(frame.id);
                updateSelectionVersion();
            }
        }
        
        // Prepare for dragging all selected items
        isDraggingSelection = true;
        dragStartOffsets.clear();
        
        selectedElementIds.forEach(id => {
            const item = $cards.find(c => c.id === id) || 
                         $images.find(i => i.id === id) || 
                         $frames.find(f => f.id === id);
            if (item) {
                dragStartOffsets.set(id, {
                    x: x - item.x,
                    y: y - item.y
                });
            }
        });
        
        // Fallback to single drag logic if only this frame is selected (to handle attached items)
        if (selectedElementIds.size === 1 && selectedElementIds.has(frame.id)) {
            isDraggingSelection = false; // Disable generic multi-drag
            draggingFrameId = frame.id;  // Enable specific frame drag
            dragOffset = { x: x - frame.x, y: y - frame.y };
    
            attachedCardIds.clear();
            $cards.forEach((card) => {
                const cx = card.x + card.width / 2;
                const cy = card.y + card.height / 2;
                if (
                    cx >= frame.x &&
                    cx <= frame.x + frame.width &&
                    cy >= frame.y &&
                    cy <= frame.y + frame.height
                ) {
                    attachedCardIds.add(card.id);
                }
            });
    
            attachedImageIds.clear();
            $images.forEach((image) => {
                const cx = image.x + image.width / 2;
                const cy = image.y + image.height / 2;
                if (
                    cx >= frame.x &&
                    cx <= frame.x + frame.width &&
                    cy >= frame.y &&
                    cy <= frame.y + frame.height
                ) {
                    attachedImageIds.add(image.id);
                }
            });
        }
    }

    function handleFrameResizeStart(
        e: MouseEvent | TouchEvent,
        frame: WhiteboardFrame,
    ) {
        if (activeTool !== "select" && activeTool !== "hand") return;
        e.stopPropagation();
        
        // Auto-switch to select when resizing an element from hand tool
        if (activeTool === "hand") {
            activeTool = "select";
        }
        const { x, y } = getPoint(e);
        resizingFrameId = frame.id;
        resizeStart = { x, y, width: frame.width, height: frame.height };
    }

    function handleImageDragStart(
        e: MouseEvent | TouchEvent,
        image: WhiteboardImage,
    ) {
        if (activeTool !== "select" && activeTool !== "hand") return;
        e.stopPropagation();
        
        // Auto-switch to select when dragging an element from hand tool
        if (activeTool === "hand") {
            activeTool = "select";
        }
        
        const { x, y } = getPoint(e);
        
        // Multi-Selection Logic
        if (e.shiftKey || e.ctrlKey) {
            if (selectedElementIds.has(image.id)) {
                selectedElementIds.delete(image.id);
            } else {
                selectedElementIds.add(image.id);
            }
            updateSelectionVersion();
            if (!selectedElementIds.has(image.id)) return;
        } else {
            if (!selectedElementIds.has(image.id)) {
                selectedElementIds.clear();
                selectedElementIds.add(image.id);
                updateSelectionVersion();
            }
        }
        
        // Prepare for dragging all selected items
        isDraggingSelection = true;
        dragStartOffsets.clear();
        
        selectedElementIds.forEach(id => {
            const item = $cards.find(c => c.id === id) || 
                         $images.find(i => i.id === id) || 
                         $frames.find(f => f.id === id);
            if (item) {
                dragStartOffsets.set(id, {
                    x: x - item.x,
                    y: y - item.y
                });
            }
        });
        
        draggingImageId = image.id;
        bringToFront(image);
    }

    function handleImageResizeStart(
        e: MouseEvent | TouchEvent,
        image: WhiteboardImage,
    ) {
        if (activeTool !== "select" && activeTool !== "hand") return;
        e.stopPropagation();
        
        // Auto-switch to select when resizing an element from hand tool
        if (activeTool === "hand") {
            activeTool = "select";
        }
        const { x, y } = getPoint(e);
        resizingImageId = image.id;
        resizeStart = { x, y, width: image.width, height: image.height };
        bringToFront(image);
    }

    function autoResizeTextarea(e: Event) {
        const target = e.target as HTMLTextAreaElement;
        target.style.height = "auto";
        target.style.height = target.scrollHeight + "px";
    }

    function updateCardHeight(id: string, height: number) {
        actions.updateCard(id, {
            height: Math.min(MAX_CARD_HEIGHT, Math.max(150, height + 40)),
        });
    }

    function pointsToPath(points: number[][]): string {
        if (points.length === 0) return "";
        if (points.length === 1)
            return `M ${points[0][0]} ${points[0][1]} L ${points[0][0]} ${points[0][1]}`;
        return (
            `M ${points[0][0]} ${points[0][1]} ` +
            points
                .slice(1)
                .map((p) => `L ${p[0]} ${p[1]}`)
                .join(" ")
        );
    }

    export async function uploadImage() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";

        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;

            const key = appState.groupPrivateKey;
            if (!key) {
                alert("Fehler: Kein Gruppen-Key gefunden.");
                return;
            }

            try {
                const resizedBlob = await resizeImage(file, 800, 800);
                const { encryptedBlob, iv } = await encryptFile(
                    resizedBlob,
                    key,
                );
                const ivHex = arrayBufferToHex(iv.buffer as ArrayBuffer);
                const config = await loadConfig();
                const result = await uploadFile(
                    encryptedBlob,
                    key,
                    config.blossomServer || "https://cdn.satellite.earth",
                    config.blossomRequireAuth ?? false,
                );

                const img = new Image();
                img.src = URL.createObjectURL(resizedBlob);
                await new Promise((resolve) => {
                    img.onload = resolve;
                });

                actions.addImage(
                    100,
                    100,
                    result.url,
                    ivHex,
                    file.type,
                    img.width,
                    img.height,
                );

                URL.revokeObjectURL(img.src);
                console.log("Image uploaded successfully:", result.url);
            } catch (e) {
                console.error("Image upload failed:", e);
                alert(
                    `Upload fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
                );
            }
        };

        input.click();
    }

    function handleFigureDragStart(
        e: MouseEvent | TouchEvent,
        figure: WhiteboardFigure,
    ) {
        if (activeTool !== "select" && activeTool !== "hand") return;
        e.stopPropagation();
        
        // Auto-switch to select when dragging an element from hand tool
        if (activeTool === "hand") {
            activeTool = "select";
        }
        
        const { x, y } = getPoint(e);
        
        // Multi-Selection Logic
        if (e.shiftKey || e.ctrlKey) {
            if (selectedElementIds.has(figure.id)) {
                selectedElementIds.delete(figure.id);
            } else {
                selectedElementIds.add(figure.id);
            }
            updateSelectionVersion();
            if (!selectedElementIds.has(figure.id)) return;
        } else {
            if (!selectedElementIds.has(figure.id)) {
                selectedElementIds.clear();
                selectedElementIds.add(figure.id);
                updateSelectionVersion();
            }
        }
        
        // Prepare for dragging all selected items
        isDraggingSelection = true;
        dragStartOffsets.clear();
        
        selectedElementIds.forEach(id => {
            const item = $cards.find(c => c.id === id) || 
                         $images.find(i => i.id === id) || 
                         $frames.find(f => f.id === id) ||
                         $figures.find(f => f.id === id);
            if (item) {
                dragStartOffsets.set(id, {
                    x: x - item.x,
                    y: y - item.y
                });
            }
        });
        
        draggingFigureId = figure.id;
        bringToFront(figure);
    }
</script>

<div class="flex flex-col h-full w-full bg-white dark:bg-gray-900">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        class="flex-1 relative overflow-hidden touch-none bg-gray-100 dark:bg-gray-900 outline-none {isPanning ? 'cursor-grabbing!' : (isShiftPressed || activeTool === 'hand' ? 'cursor-grab' : (activeTool === 'pen' ? 'cursor-crosshair' : 'cursor-default'))}"
        role="application"
        aria-label="Whiteboard drawing area"
        tabindex="0"
        onmousedown={handleStart}
        onmousemove={handleMove}
        onmouseup={handleEnd}
        onmouseleave={handleEnd}
        ontouchstart={handleStart}
        ontouchmove={handleMove}
        ontouchend={handleEnd}
        bind:clientWidth={containerWidth}
        bind:clientHeight={containerHeight}
    >
        <svg 
            bind:this={svgElement} 
            class="w-full h-full block"
            viewBox={viewBox}
            preserveAspectRatio="none"
        >
            <!-- Selection Box -->
            {#if isSelecting}
                {@const minX = Math.min(selectionBox.startX, selectionBox.endX)}
                {@const minY = Math.min(selectionBox.startY, selectionBox.endY)}
                {@const width = Math.abs(selectionBox.endX - selectionBox.startX)}
                {@const height = Math.abs(selectionBox.endY - selectionBox.startY)}
                <rect
                    x={minX}
                    y={minY}
                    width={width}
                    height={height}
                    fill="rgba(59, 130, 246, 0.1)"
                    stroke="rgb(59, 130, 246)"
                    stroke-width="2"
                    stroke-dasharray="5,5"
                    pointer-events="none"
                />
            {/if}

            <!-- Layer 0: Frames (Background) -->
            {#each $frames as frame (frame.id)}
                <foreignObject
                    x={frame.x}
                    y={frame.y}
                    width={frame.width}
                    height={frame.height}
                    class="overflow-visible pointer-events-none"
                >
                    <div
                        class="w-full h-full border-2 border-dashed rounded-lg flex flex-col relative pointer-events-auto bg-gray-500/10 hover:bg-gray-500/50 transition-colors {selectedElementIds.has(frame.id) ? 'border-blue-500' : 'border-gray-400'}"
                    >
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="h-8 bg-gray-200/80 rounded-t-md flex items-center px-2 cursor-move"
                            onmousedown={(e) => handleFrameDragStart(e, frame)}
                            ontouchstart={(e) => handleFrameDragStart(e, frame)}
                        >
                            <input
                                type="text"
                                class="bg-transparent border-none outline-none text-sm font-bold text-gray-700 w-full"
                                value={frame.label}
                                oninput={(e) =>
                                    actions.updateFrame(frame.id, {
                                        label: e.currentTarget.value,
                                    })}
                                onmousedown={(e) => e.stopPropagation()}
                                aria-label="Frame label"
                            />
                            <button
                                aria-label="Delete frame"
                                class="ml-2 text-gray-500 hover:text-red-500"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    actions.deleteFrame(frame.id);
                                }}
                                onmousedown={(e) => e.stopPropagation()}
                            >
                                ×
                            </button>
                        </div>
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                            class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-gray-400/50 rounded-tl"
                            onmousedown={(e) =>
                                handleFrameResizeStart(e, frame)}
                            ontouchstart={(e) =>
                                handleFrameResizeStart(e, frame)}
                        ></div>
                    </div>
                </foreignObject>
            {/each}

            <!-- Layer 1: Paths (Drawings) -->
            {#each $paths as path (path.id)}
                <path
                    d={pointsToPath(path.points)}
                    stroke={path.color}
                    stroke-width={path.width}
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            {/each}

            <!-- Layer 2: Cards and Images (Sorted by Z-Index) -->
            {#each sortedElements as element (element.id)}
                {#if isCard(element)}
                    <foreignObject
                        x={element.x}
                        y={element.y}
                        width={element.width}
                        height={element.height}
                        class="overflow-visible pointer-events-none"
                    >
                        <div
                            class="w-full h-full shadow-md rounded flex flex-col relative group pointer-events-auto transition-shadow hover:shadow-lg {selectedElementIds.has(element.id) ? 'ring-2 ring-blue-500' : ''}"
                            style="background-color: {element.color};"
                        >
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="h-6 w-full cursor-move opacity-0 group-hover:opacity-100 transition-opacity bg-black/5 rounded-t flex items-center justify-end px-1"
                                onmousedown={(e) =>
                                    handleCardDragStart(e, element)}
                                ontouchstart={(e) =>
                                    handleCardDragStart(e, element)}
                            >
                                <div class="flex gap-1 mr-auto">
                                    {#each CARD_COLORS.slice(0, 4) as color}
                                        <button
                                            class="w-3 h-3 rounded-full border border-black/10"
                                            style="background-color: {color.value}"
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                actions.updateCard(element.id, {
                                                    color: color.value,
                                                });
                                            }}
                                            onmousedown={(e) =>
                                                e.stopPropagation()}
                                            aria-label="Set color {color.name}"
                                        ></button>
                                    {/each}
                                </div>
                                <button
                                    aria-label="Delete card"
                                    class="text-black/50 hover:text-red-600 font-bold px-1"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        actions.deleteCard(element.id);
                                    }}
                                    onmousedown={(e) => e.stopPropagation()}
                                >
                                    ×
                                </button>
                            </div>
                            
                            {#if editingCardId === element.id}
                                <textarea
                                    class="w-full h-full bg-transparent resize-none outline-none text-gray-900 font-medium font-sans p-2 pt-0"
                                    value={element.text}
                                    oninput={(e) => {
                                        actions.updateCard(element.id, {
                                            text: e.currentTarget.value,
                                        });
                                    }}
                                    onblur={() => {
                                        editingCardId = null;
                                    }}
                                    onmousedown={(e) => {
                                        e.stopPropagation();
                                    }}
                                    use:focus
                                    aria-label="Card text"
                                ></textarea>
                            {:else}
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <!-- svelte-ignore a11y_click_events_have_key_events -->
                                <div
                                    class="w-full h-full overflow-auto text-gray-900 font-medium font-sans p-2 pt-0 cursor-text"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        // Clear selection when clicking on an element
                                        if (selectedElementIds.size > 0) {
                                            selectedElementIds.clear();
                                            updateSelectionVersion();
                                        }
                                        editingCardId = element.id;
                                        bringToFront(element);
                                    }}
                                    onmousedown={(e) => {
                                        e.stopPropagation();
                                    }}
                                    aria-label="Card text (click to edit)"
                                >
                                    {#if element.text.trim()}
                                        <MarkdownText text={element.text} darkText={true} />
                                    {:else}
                                        <span class="text-gray-400 italic">Click to add text...</span>
                                    {/if}
                                </div>
                            {/if}

                            <!-- Resize Handle for Card -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-black/10 rounded-tl opacity-0 group-hover:opacity-100 transition-opacity"
                                onmousedown={(e) =>
                                    handleCardResizeStart(e, element)}
                                ontouchstart={(e) =>
                                    handleCardResizeStart(e, element)}
                            ></div>
                        </div>
                    </foreignObject>
                {:else if isFigure(element)}
                    <!-- Figure Element -->
                    <g
                        transform="translate({element.x}, {element.y})"
                        class="group cursor-move"
                        onmousedown={(e) => handleFigureDragStart(e, element)}
                        ontouchstart={(e) => handleFigureDragStart(e, element)}
                        role="group"
                        aria-label="Figure {element.name}"
                    >
                        <!-- Selection Ring -->
                        {#if selectedElementIds.has(element.id)}
                            <rect
                                x="-5"
                                y="-5"
                                width="60"
                                height="110"
                                fill="none"
                                stroke="rgb(59, 130, 246)"
                                stroke-width="2"
                                rx="5"
                            />
                        {/if}

                        <!-- Body -->
                        <path
                            d="M 5 90 L 5 45 Q 25 30 45 45 L 45 90 Z"
                            fill={element.color}
                            stroke="black"
                            stroke-width="2"
                        />
                        
                        <!-- Head -->
                        <circle
                            cx="25"
                            cy="20"
                            r="15"
                            fill={element.color}
                            stroke="black"
                            stroke-width="2"
                        />

                        <!-- Name Label (Editable) -->
                        <foreignObject x="-25" y="95" width="100" height="30">
                            <input
                                type="text"
                                class="w-full bg-transparent text-center text-sm font-bold outline-none text-gray-900 dark:text-gray-100"
                                value={element.name}
                                oninput={(e) => actions.updateFigure(element.id, { name: e.currentTarget.value })}
                                onmousedown={(e) => e.stopPropagation()}
                                aria-label="Figure name"
                            />
                        </foreignObject>

                        <!-- Delete Button -->
                        <foreignObject x="35" y="-10" width="20" height="20" class="opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                class="w-full h-full bg-white rounded-full shadow-md text-red-500 flex items-center justify-center hover:bg-red-50"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    actions.deleteFigure(element.id);
                                }}
                                onmousedown={(e) => e.stopPropagation()}
                                aria-label="Delete figure"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </foreignObject>
                    </g>
                {:else}
                    <!-- Image Element -->
                    <foreignObject
                        x={element.x}
                        y={element.y}
                        width={element.width}
                        height={element.height}
                        class="overflow-visible pointer-events-none"
                    >
                        <div
                            class="w-full h-full relative group pointer-events-auto"
                        >
                            <!-- Drag Handle (Overlay) -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="absolute inset-0 cursor-move border-2 transition-colors {selectedElementIds.has(element.id) ? 'border-blue-500' : 'border-transparent group-hover:border-blue-400'}"
                                onmousedown={(e) =>
                                    handleImageDragStart(e, element)}
                                ontouchstart={(e) =>
                                    handleImageDragStart(e, element)}
                            ></div>

                            <!-- Image Content -->
                            <div class="w-full h-full overflow-hidden">
                                <EncryptedImage
                                    src={element.url}
                                    iv={element.iv}
                                    mimetype={element.mimetype}
                                    alt="Whiteboard Image"
                                    class="w-full h-full object-contain pointer-events-none select-none"
                                />
                            </div>

                            <!-- Delete Button -->
                            <button
                                class="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-md text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 z-10"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    actions.deleteImage(element.id);
                                }}
                                onmousedown={(e) => e.stopPropagation()}
                                aria-label="Delete image"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    ><path d="M18 6 6 18" /><path
                                        d="m6 6 12 12"
                                    /></svg
                                >
                            </button>

                            <!-- Resize Handle -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-blue-400/50 rounded-tl opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                onmousedown={(e) =>
                                    handleImageResizeStart(e, element)}
                                ontouchstart={(e) =>
                                    handleImageResizeStart(e, element)}
                            ></div>
                        </div>
                    </foreignObject>
                {/if}
            {/each}
        </svg>
    </div>
</div>
