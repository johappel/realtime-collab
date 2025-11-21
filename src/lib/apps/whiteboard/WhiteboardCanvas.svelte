<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { writable, type Writable } from 'svelte/store';
    import { useWhiteboardYDoc, type DrawPath, type WhiteboardCard } from './useWhiteboardYDoc';
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
    let cleanup: (() => void) | null = null;
    let actions: any = {};

    // Tool State
    let activeTool = $state<'pen' | 'card' | 'select'>('pen');
    let currentColor = $state('#000000');
    let currentWidth = $state(3);

    // Interaction State
    let isDrawing = false;
    let currentPathId: string | null = null;
    let draggingCardId: string | null = null;
    let dragOffset = { x: 0, y: 0 };
    
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
        cleanup = result.cleanup;
        actions = {
            startPath: result.startPath,
            updatePath: result.updatePath,
            endPath: result.endPath,
            addCard: result.addCard,
            updateCard: result.updateCard,
            deleteCard: result.deleteCard,
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
        if (activeTool === 'select') return; // Handled by card mousedown
        
        e.preventDefault();
        const { x, y } = getPoint(e);

        if (activeTool === 'pen') {
            isDrawing = true;
            currentPathId = actions.startPath(x, y, currentColor, currentWidth);
        } else if (activeTool === 'card') {
            actions.addCard(x - 100, y - 75, '#fff9c4'); // Default yellow sticky note, centered
            activeTool = 'select'; // Switch to select after adding
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
        }
    }

    function handleEnd(e: MouseEvent | TouchEvent) {
        if (isDrawing && currentPathId) {
            actions.endPath(currentPathId);
            isDrawing = false;
            currentPathId = null;
        }
        if (draggingCardId) {
            draggingCardId = null;
        }
    }

    function handleCardMouseDown(e: MouseEvent | TouchEvent, card: WhiteboardCard) {
        if (activeTool !== 'select') return;
        e.stopPropagation(); // Prevent canvas click
        
        const { x, y } = getPoint(e);
        draggingCardId = card.id;
        dragOffset = {
            x: x - card.x,
            y: y - card.y
        };
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
                class="px-3 py-1 rounded text-sm font-medium transition-colors {activeTool === 'select' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}"
                onclick={() => activeTool = 'select'}
            >
                Select
            </button>
        </div>

        <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

        <div class="flex items-center gap-2">
            <label class="text-sm font-medium dark:text-gray-300" for="wb-color">Color:</label>
            <input id="wb-color" type="color" bind:value={currentColor} class="h-8 w-8 rounded cursor-pointer" />
        </div>
        
        <div class="flex items-center gap-2">
            <label class="text-sm font-medium dark:text-gray-300" for="wb-size">Size:</label>
            <input id="wb-size" type="range" min="1" max="20" bind:value={currentWidth} class="w-24" />
        </div>

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
                    class="overflow-visible"
                >
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                        class="w-full h-full shadow-md rounded p-2 flex flex-col relative group"
                        style="background-color: {card.color};"
                        onmousedown={(e) => handleCardMouseDown(e, card)}
                        ontouchstart={(e) => handleCardMouseDown(e, card)}
                    >
                        <textarea
                            class="w-full h-full bg-transparent resize-none outline-none text-gray-900 font-medium font-sans"
                            value={card.text}
                            oninput={(e) => actions.updateCard(card.id, { text: e.currentTarget.value })}
                            onmousedown={(e) => e.stopPropagation()} 
                            ontouchstart={(e) => e.stopPropagation()}
                            placeholder="Type here..."
                        ></textarea>
                        
                        <!-- Delete Button (visible on hover/select) -->
                        <button 
                            aria-label="Delete card"
                            class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                            onclick={(e) => { e.stopPropagation(); actions.deleteCard(card.id); }}
                            onmousedown={(e) => e.stopPropagation()}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </foreignObject>
            {/each}
        </svg>
    </div>
</div>
