<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { writable, type Writable } from 'svelte/store';
    import { useWhiteboardYDoc, type DrawPath, type WhiteboardCard, type WhiteboardFrame } from './useWhiteboardYDoc';
    import { loadConfig } from '$lib/config';
    import { getNip07Pubkey, signAndPublishNip07 } from '$lib/nostrUtils';
    import { theme } from '$lib/stores/theme.svelte';

    let { 
        documentId, 
        user = { name: 'Anon', color: '#ff0000' },
        mode = 'local'
    } = $props<{
        documentId: string;
        user?: { name: string; color: string };
        mode?: 'local' | 'nostr';
    }>();

    let paths: Writable<DrawPath[]> = $state(writable([]));
    let cards: Writable<WhiteboardCard[]> = $state(writable([]));
    let frames: Writable<WhiteboardFrame[]> = $state(writable([]));
    let cleanup: (() => void) | null = null;
    let actions: any = {};

    // Tool State
    let activeTool = $state<'pen' | 'card' | 'frame' | 'select'>('pen');
    let currentColor = $state('#000000');
    let currentWidth = $state(3);
    let cardColor = $state('#fff9c4'); // Default Post-It Yellow

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
    let dragOffset = { x: 0, y: 0 };
    let resizeStart = { x: 0, y: 0, width: 0, height: 0 };
    
    // Canvas Ref
    let svgElement: SVGSVGElement;

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
            actions.updateFrame(draggingFrameId, {
                x: x - dragOffset.x,
                y: y - dragOffset.y
            });
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
        actions.updateCard(id, { height: Math.max(150, height + 40) }); // +40 for padding/header
    }

    function pointsToPath(points: number[][]): string {
        if (points.length === 0) return '';
        if (points.length === 1) return `M ${points[0][0]} ${points[0][1]} L ${points[0][0]} ${points[0][1]}`;
        return `M ${points[0][0]} ${points[0][1]} ` + points.slice(1).map(p => `L ${p[0]} ${p[1]}`).join(' ');
    }
</script>

<div class="flex flex-col h-full w-full bg-white dark:bg-gray-900">
    <!-- Toolbar -->
    <div class="p-2 border-b border-gray-200 dark:border-gray-700 flex gap-4 items-center bg-gray-50 dark:bg-gray-800 overflow-x-auto">
        <div class="flex bg-gray-200 dark:bg-gray-700 rounded p-1 gap-1">
            <button 
                class="px-3 py-1 rounded text-sm font-medium transition-colors {activeTool === 'pen' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => activeTool = 'pen'}
            >
                Pen
            </button>
            <button 
                class="px-3 py-1 rounded text-sm font-medium transition-colors {activeTool === 'card' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => activeTool = 'card'}
            >
                Card
            </button>
            <button 
                class="px-3 py-1 rounded text-sm font-medium transition-colors {activeTool === 'frame' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => activeTool = 'frame'}
            >
                Frame
            </button>
            <button 
                class="px-3 py-1 rounded text-sm font-medium transition-colors {activeTool === 'select' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => activeTool = 'select'}
            >
                Select
            </button>
        </div>

        <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

        {#if activeTool === 'card'}
            <div class="flex items-center gap-1">
                {#each CARD_COLORS as color}
                    <button
                        class="w-6 h-6 rounded-full border border-gray-300 shadow-sm hover:scale-110 transition-transform"
                        style="background-color: {color.value}; {cardColor === color.value ? 'ring: 2px solid blue;' : ''}"
                        onclick={() => cardColor = color.value}
                        title={color.name}
                        aria-label={color.name}
                    >
                        {#if cardColor === color.value}
                            <div class="w-full h-full flex items-center justify-center">
                                <div class="w-2 h-2 bg-gray-800 rounded-full"></div>
                            </div>
                        {/if}
                    </button>
                {/each}
            </div>
        {:else}
            <div class="flex items-center gap-2">
                <label class="text-sm font-medium dark:text-gray-300" for="wb-color">Color:</label>
                <input id="wb-color" type="color" bind:value={currentColor} class="h-8 w-8 rounded cursor-pointer" />
            </div>
            
            <div class="flex items-center gap-2">
                <label class="text-sm font-medium dark:text-gray-300" for="wb-size">Size:</label>
                <input id="wb-size" type="range" min="1" max="20" bind:value={currentWidth} class="w-24" />
            </div>
        {/if}

        <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

        <button 
            onclick={() => actions.undo()}
            class="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm font-medium dark:text-white transition-colors"
        >
            Undo
        </button>
        
        <button 
            onclick={() => actions.clearBoard()}
            class="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 rounded text-sm font-medium transition-colors"
        >
            Clear
        </button>
    </div>

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
