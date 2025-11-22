<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import { writable, type Writable } from "svelte/store";
    import {
        useWhiteboardYDoc,
        type DrawPath,
        type WhiteboardCard,
        type WhiteboardFrame,
        type WhiteboardImage,
    } from "./useWhiteboardYDoc";
    import { loadConfig } from "$lib/config";
    import { getNip07Pubkey, signAndPublishNip07 } from "$lib/nostrUtils";
    import { theme } from "$lib/stores/theme.svelte";
    import * as Y from "yjs";
    import EncryptedImage from "$lib/components/EncryptedImage.svelte";
    import { resizeImage } from "$lib/imageUtils";
    import { encryptFile, arrayBufferToHex } from "$lib/cryptoUtils";
    import { uploadFile } from "$lib/blossomClient";
    import { appState } from "$lib/stores/appState.svelte";

    let {
        documentId,
        user = { name: "Anon", color: "#ff0000" },
        mode = "local",
        activeTool = $bindable("select"),
        currentColor = $bindable("#000000"),
        currentWidth = $bindable(3),
        cardColor = $bindable("#fff9c4"),
        title = $bindable(""),
        awareness = $bindable(null),
    } = $props<{
        documentId: string;
        user?: { name: string; color: string };
        mode?: "local" | "nostr" | "group";
        activeTool?: "pen" | "card" | "frame" | "select";
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
    let attachedCardIds: Set<string> = new Set();
    let attachedImageIds: Set<string> = new Set();
    let dragOffset = { x: 0, y: 0 };
    let resizeStart = { x: 0, y: 0, width: 0, height: 0 };

    const MAX_CARD_HEIGHT = 300;

    // Derived State for Z-Index Sorting
    let sortedElements = $derived.by(() => {
        const allCards = $cards.map((c) => ({ ...c, type: "card" as const }));
        const allImages = $images.map((i) => ({
            ...i,
            type: "image" as const,
        }));
        return [...allCards, ...allImages].sort(
            (a, b) => (a.zIndex || 0) - (b.zIndex || 0),
        );
    });

    function isCard(
        element: any,
    ): element is WhiteboardCard & { type: "card" } {
        return element.type === "card";
    }

    function bringToFront(element: WhiteboardCard | WhiteboardImage) {
        const maxZ = Math.max(
            ...$cards.map((c) => c.zIndex || 0),
            ...$images.map((i) => i.zIndex || 0),
            0,
        );
        const newZ = maxZ + 1;

        if ("text" in element) {
            actions.updateCard(element.id, { zIndex: newZ });
        } else {
            actions.updateImage(element.id, { zIndex: newZ });
        }
    }

    // Canvas Ref
    let svgElement: SVGSVGElement;

    export function undo() {
        actions.undo();
    }

    export function clearBoard() {
        actions.clearBoard();
    }

    onMount(async () => {
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
            clearBoard: result.clearBoard,
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

        // Wrap cleanup to include unobserve
        const originalCleanup = cleanup;
        cleanup = () => {
            metaMap.unobserve(handleMetaUpdate);
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

        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    }

    function handleStart(e: MouseEvent | TouchEvent) {
        if (activeTool === "select") return;
        if (activeTool === "pen") e.preventDefault();

        const { x, y } = getPoint(e);

        if (activeTool === "pen") {
            isDrawing = true;
            currentPathId = actions.startPath(x, y, currentColor, currentWidth);
        } else if (activeTool === "card") {
            actions.addCard(x - 100, y - 75, cardColor);
            activeTool = "select";
        } else if (activeTool === "frame") {
            actions.addFrame(x, y);
            activeTool = "select";
        }
    }

    function handleMove(e: MouseEvent | TouchEvent) {
        e.preventDefault();
        const { x, y } = getPoint(e);

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
        }
    }

    function handleEnd(e: MouseEvent | TouchEvent) {
        if (isDrawing && currentPathId) {
            actions.endPath(currentPathId);
        }
        isDrawing = false;
        currentPathId = null;
        draggingCardId = null;
        resizingCardId = null;
        draggingFrameId = null;
        resizingFrameId = null;
        draggingImageId = null;
        resizingImageId = null;
        attachedCardIds.clear();
        attachedImageIds.clear();
    }

    function handleCardDragStart(
        e: MouseEvent | TouchEvent,
        card: WhiteboardCard,
    ) {
        if (activeTool !== "select") return;
        e.stopPropagation();
        const { x, y } = getPoint(e);
        draggingCardId = card.id;
        dragOffset = { x: x - card.x, y: y - card.y };
        bringToFront(card);
    }

    function handleCardResizeStart(
        e: MouseEvent | TouchEvent,
        card: WhiteboardCard,
    ) {
        if (activeTool !== "select") return;
        e.stopPropagation();
        const { x, y } = getPoint(e);
        resizingCardId = card.id;
        resizeStart = { x, y, width: card.width, height: card.height };
        bringToFront(card);
    }

    function handleFrameDragStart(
        e: MouseEvent | TouchEvent,
        frame: WhiteboardFrame,
    ) {
        if (activeTool !== "select") return;
        e.stopPropagation();
        const { x, y } = getPoint(e);
        draggingFrameId = frame.id;
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

    function handleFrameResizeStart(
        e: MouseEvent | TouchEvent,
        frame: WhiteboardFrame,
    ) {
        if (activeTool !== "select") return;
        e.stopPropagation();
        const { x, y } = getPoint(e);
        resizingFrameId = frame.id;
        resizeStart = { x, y, width: frame.width, height: frame.height };
    }

    function handleImageDragStart(
        e: MouseEvent | TouchEvent,
        image: WhiteboardImage,
    ) {
        if (activeTool !== "select") return;
        e.stopPropagation();
        const { x, y } = getPoint(e);
        draggingImageId = image.id;
        dragOffset = { x: x - image.x, y: y - image.y };
        bringToFront(image);
    }

    function handleImageResizeStart(
        e: MouseEvent | TouchEvent,
        image: WhiteboardImage,
    ) {
        if (activeTool !== "select") return;
        e.stopPropagation();
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
</script>

<div class="flex flex-col h-full w-full bg-white dark:bg-gray-900">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        class="flex-1 relative overflow-hidden cursor-crosshair touch-none bg-gray-100 dark:bg-gray-900 outline-none"
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
    >
        <svg bind:this={svgElement} class="w-full h-full block">
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
                        class="w-full h-full border-2 border-dashed border-gray-400 rounded-lg flex flex-col relative pointer-events-auto bg-gray-500/10 hover:bg-gray-500/50 transition-colors"
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
                            class="w-full h-full shadow-md rounded flex flex-col relative group pointer-events-auto transition-shadow hover:shadow-lg"
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
                            <textarea
                                class="w-full h-full bg-transparent resize-none outline-none text-gray-900 font-medium font-sans p-2 pt-0"
                                value={element.text}
                                oninput={(e) => {
                                    actions.updateCard(element.id, {
                                        text: e.currentTarget.value,
                                    });
                                    // autoResizeTextarea(e); // Removed auto-resize in favor of manual resize
                                }}
                                onmousedown={(e) => {
                                    e.stopPropagation();
                                    bringToFront(element);
                                }}
                                aria-label="Card text"
                            ></textarea>

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
                                class="absolute inset-0 cursor-move border-2 border-transparent group-hover:border-blue-400 transition-colors"
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
