<script lang="ts">
    import { onMount, onDestroy, untrack } from 'svelte';
    import { writable, type Writable } from 'svelte/store';
    import { useWhiteboardYDoc, type DrawPath, type WhiteboardCard, type WhiteboardFrame } from './useWhiteboardYDoc';
    import { loadConfig } from '$lib/config';
    import { getNip07Pubkey, signAndPublishNip07 } from '$lib/nostrUtils';
    import { theme } from '$lib/stores/theme.svelte';
    import * as Y from 'yjs';

    let { 
        documentId, 
        user = { name: 'Anon', color: '#ff0000' },
        mode = 'local',
        activeTool = $bindable('select'),
        currentColor = $bindable('#000000'),
        currentWidth = $bindable(3),
        cardColor = $bindable('#fff9c4'),
        title = $bindable(''),
        awareness = $bindable(null)
    } = $props<{
        documentId: string;
        user?: { name: string; color: string };
        mode?: 'local' | 'nostr';
        activeTool?: 'pen' | 'card' | 'frame' | 'select';
        currentColor?: string;
        currentWidth?: number;
        cardColor?: string;
        title?: string;
        awareness?: any;
    }>();

    let paths: Writable<DrawPath[]> = $state(writable([]));
    let cards: Writable<WhiteboardCard[]> = $state(writable([]));
    let frames: Writable<WhiteboardFrame[]> = $state(writable([]));
    let cleanup: (() => void) | null = null;
    let actions: any = {};
    let ydoc: Y.Doc | null = $state(null);

    const CARD_COLORS = [
        { name: 'Yellow', value: '#fff9c4' },
        { name: 'Post-It', value: '#fff176' },
        { name: 'Pink', value: '#f8bbd0' },
        { name: 'Green', value: '#c8e6c9' },
        { name: 'Orange', value: '#ffe0b2' },
        { name: 'Purple', value: '#e1bee7' },
        { name: 'Blue', value: '#bbdefb' }
    ];

    // Interaction State
    let isDrawing = false;
    let currentPathId: string | null = null;
    let draggingCardId: string | null = null;
    let draggingFrameId: string | null = null;
    let resizingFrameId: string | null = null;
    let attachedCardIds: Set<string> = new Set();
    let dragOffset = { x: 0, y: 0 };
    let resizeStart = { x: 0, y: 0, width: 0, height: 0 };
    
    const MAX_CARD_HEIGHT = 300;

    // Canvas Ref
    let svgElement: SVGSVGElement;

    export function undo() {
        actions.undo();
    }

    export function clearBoard() {
        actions.clearBoard();
    }

    onMount(async () => {
        let pubkey = '';
        let relays: string[] = [];
        let signAndPublish: any = null;

        if (mode === 'nostr') {
            try {
                const config = await loadConfig();
                relays = config.docRelays;
                pubkey = await getNip07Pubkey();
                signAndPublish = (evt: any) => signAndPublishNip07(evt, relays);
            } catch (e) {
                console.error("Failed to init Nostr:", e);
            }
        }

        const result = useWhiteboardYDoc(
            documentId,
            mode,
            user,
            pubkey,
            signAndPublish,
            relays
        );

        paths = result.paths;
        cards = result.cards;
        frames = result.frames;
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
            clearBoard: result.clearBoard,
            undo: result.undo
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
            } else if (storedTitle === undefined && title && title !== documentId) {
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
            
            if (!currentState || 
                currentState.user?.name !== newUser.name || 
                currentState.user?.color !== newUser.color) {
                
                awareness.setLocalStateField("user", newUser);
            }
        }
    });

    onDestroy(() => {
        if (cleanup) cleanup();
    });

    function getPoint(e: MouseEvent | TouchEvent): { x: number, y: number } {
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
            y: clientY - rect.top
        };
    }

    function handleStart(e: MouseEvent | TouchEvent) {
        // If clicking on a card/frame handle, those handlers will fire first and stop propagation if needed.
        // But if we are here, we clicked on the canvas or a non-interactive part.
        
        if (activeTool === 'select') return; 
        
        // Don't prevent default immediately if we might be interacting with form elements
        // But for drawing, we need to.
        if (activeTool === 'pen') e.preventDefault();

        const { x, y } = getPoint(e);

        if (activeTool === 'pen') {
            isDrawing = true;
            currentPathId = actions.startPath(x, y, currentColor, currentWidth);
        } else if (activeTool === 'card') {
            actions.addCard(x - 100, y - 75, cardColor);
            activeTool = 'select'; 
        } else if (activeTool === 'frame') {
            actions.addFrame(x, y);
            activeTool = 'select';
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
                y: y - dragOffset.y
            });
        } else if (draggingFrameId) {
            const frame = $frames.find(f => f.id === draggingFrameId);
            if (frame) {
                const newX = x - dragOffset.x;
                const newY = y - dragOffset.y;
                const dx = newX - frame.x;
                const dy = newY - frame.y;

                actions.updateFrame(draggingFrameId, {
                    x: newX,
                    y: newY
                });

                // Move attached cards
                attachedCardIds.forEach(cardId => {
                    const card = $cards.find(c => c.id === cardId);
                    if (card) {
                        actions.updateCard(cardId, {
                            x: card.x + dx,
                            y: card.y + dy
                        });
                    }
                });
            }
        } else if (resizingFrameId) {
            const dx = x - resizeStart.x;
            const dy = y - resizeStart.y;
            actions.updateFrame(resizingFrameId, {
                width: Math.max(100, resizeStart.width + dx),
                height: Math.max(100, resizeStart.height + dy)
            });
        }
    }

    function handleEnd(e: MouseEvent | TouchEvent) {
        if (isDrawing && currentPathId) {
            actions.endPath(currentPathId);
            isDrawing = false;
            currentPathId = null;
        }
        draggingCardId = null;
        draggingFrameId = null;
        resizingFrameId = null;
    }

    function handleCardDragStart(e: MouseEvent | TouchEvent, card: WhiteboardCard) {
        if (activeTool !== 'select') return;
        e.stopPropagation();
        
        const { x, y } = getPoint(e);
        draggingCardId = card.id;
        dragOffset = {
            x: x - card.x,
            y: y - card.y
        };
    }

    function handleFrameDragStart(e: MouseEvent | TouchEvent, frame: WhiteboardFrame) {
        if (activeTool !== 'select') return;
        e.stopPropagation();
        
        const { x, y } = getPoint(e);
        draggingFrameId = frame.id;
        dragOffset = {
            x: x - frame.x,
            y: y - frame.y
        };

        // Find attached cards (center point inside frame)
        attachedCardIds.clear();
        $cards.forEach(card => {
            const cx = card.x + card.width / 2;
            const cy = card.y + card.height / 2;
            if (cx >= frame.x && cx <= frame.x + frame.width &&
                cy >= frame.y && cy <= frame.y + frame.height) {
                attachedCardIds.add(card.id);
            }
        });
    }

    function handleFrameResizeStart(e: MouseEvent | TouchEvent, frame: WhiteboardFrame) {
        if (activeTool !== 'select') return;
        e.stopPropagation();
        
        const { x, y } = getPoint(e);
        resizingFrameId = frame.id;
        resizeStart = {
            x,
            y,
            width: frame.width,
            height: frame.height
        };
    }

    function autoResizeTextarea(e: Event) {
        const target = e.target as HTMLTextAreaElement;
        target.style.height = 'auto';
        target.style.height = target.scrollHeight + 'px';
        // Update card height in model if needed, or just let it visually expand
        // If we want the card background to grow, we need to update the model height
        // But for now, let's just let the textarea grow within the foreignObject.
        // Wait, foreignObject has fixed height. We need to update the card height.
        // We can debounce this update.
    }

    function updateCardHeight(id: string, height: number) {
        actions.updateCard(id, { height: Math.min(MAX_CARD_HEIGHT, Math.max(150, height + 40)) }); // +40 for padding/header
    }

    function pointsToPath(points: number[][]): string {
        if (points.length === 0) return '';
        if (points.length === 1) return `M ${points[0][0]} ${points[0][1]} L ${points[0][0]} ${points[0][1]}`;
        return `M ${points[0][0]} ${points[0][1]} ` + points.slice(1).map(p => `L ${p[0]} ${p[1]}`).join(' ');
    }
</script>

<div class="flex flex-col h-full w-full bg-white dark:bg-gray-900">
    <!-- Canvas -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
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
        <svg 
            bind:this={svgElement}
            class="w-full h-full block"
        >
            <!-- Frames (Behind everything) -->
            {#each $frames as frame (frame.id)}
                <foreignObject 
                    x={frame.x} 
                    y={frame.y} 
                    width={frame.width} 
                    height={frame.height}
                    class="overflow-visible pointer-events-none"
                >
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                        class="w-full h-full border-2 border-dashed border-gray-400 rounded-lg flex flex-col relative pointer-events-auto bg-gray-50/50 hover:bg-gray-100/50 transition-colors"
                    >
                        <!-- Frame Header / Drag Handle -->
                        <div 
                            class="h-8 bg-gray-200/80 rounded-t-md flex items-center px-2 cursor-move"
                            onmousedown={(e) => handleFrameDragStart(e, frame)}
                            ontouchstart={(e) => handleFrameDragStart(e, frame)}
                        >
                            <input 
                                type="text" 
                                class="bg-transparent border-none outline-none text-sm font-bold text-gray-700 w-full"
                                value={frame.label}
                                oninput={(e) => actions.updateFrame(frame.id, { label: e.currentTarget.value })}
                                onmousedown={(e) => e.stopPropagation()}
                            />
                            <button 
                                aria-label="Delete frame"
                                class="ml-2 text-gray-500 hover:text-red-500"
                                onclick={(e) => { e.stopPropagation(); actions.deleteFrame(frame.id); }}
                                onmousedown={(e) => e.stopPropagation()}
                            >
                                ×
                            </button>
                        </div>
                        
                        <!-- Resize Handle -->
                        <div 
                            class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-gray-400/50 rounded-tl"
                            onmousedown={(e) => handleFrameResizeStart(e, frame)}
                            ontouchstart={(e) => handleFrameResizeStart(e, frame)}
                        ></div>
                    </div>
                </foreignObject>
            {/each}

            <!-- Paths -->
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

            <!-- Cards (ForeignObject) -->
            {#each $cards as card (card.id)}
                <foreignObject 
                    x={card.x} 
                    y={card.y} 
                    width={card.width} 
                    height={card.height}
                    class="overflow-visible pointer-events-none"
                >
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                        class="w-full h-full shadow-md rounded flex flex-col relative group pointer-events-auto transition-shadow hover:shadow-lg"
                        style="background-color: {card.color};"
                    >
                        <!-- Drag Handle -->
                        <div 
                            class="h-6 w-full cursor-move opacity-0 group-hover:opacity-100 transition-opacity bg-black/5 rounded-t flex items-center justify-end px-1"
                            onmousedown={(e) => handleCardDragStart(e, card)}
                            ontouchstart={(e) => handleCardDragStart(e, card)}
                        >
                            <!-- Color Picker (Mini) -->
                            <div class="flex gap-1 mr-auto">
                                {#each CARD_COLORS.slice(0, 4) as color}
                                    <button 
                                        class="w-3 h-3 rounded-full border border-black/10"
                                        style="background-color: {color.value}"
                                        onclick={(e) => { e.stopPropagation(); actions.updateCard(card.id, { color: color.value }); }}
                                        onmousedown={(e) => e.stopPropagation()}
                                        aria-label="Set color {color.name}"
                                    ></button>
                                {/each}
                            </div>

                            <button 
                                aria-label="Delete card"
                                class="text-black/50 hover:text-red-600 font-bold px-1"
                                onclick={(e) => { e.stopPropagation(); actions.deleteCard(card.id); }}
                                onmousedown={(e) => e.stopPropagation()}
                            >
                                ×
                            </button>
                        </div>

                        <textarea
                            class="w-full h-full bg-transparent resize-none outline-none text-gray-900 font-medium font-sans p-2 pt-0"
                            value={card.text}
                            oninput={(e) => {
                                actions.updateCard(card.id, { text: e.currentTarget.value });
                                autoResizeTextarea(e);
                                updateCardHeight(card.id, e.currentTarget.scrollHeight);
                            }}
                            onmousedown={(e) => e.stopPropagation()} 
                            ontouchstart={(e) => e.stopPropagation()}
                            placeholder="Type here..."
                        ></textarea>
                    </div>
                </foreignObject>
            {/each}
        </svg>
    </div>
</div>
