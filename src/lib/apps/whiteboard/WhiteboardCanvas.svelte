<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { writable, type Writable } from 'svelte/store';
    import { useWhiteboardYDoc, type DrawPath } from './useWhiteboardYDoc';
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
    let cleanup: (() => void) | null = null;
    let actions: any = {};

    // Drawing State
    let isDrawing = false;
    let currentPathId: string | null = null;
    let currentColor = $state('#000000');
    let currentWidth = $state(3);
    
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
        cleanup = result.cleanup;
        actions = {
            startPath: result.startPath,
            updatePath: result.updatePath,
            endPath: result.endPath,
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
        e.preventDefault(); // Prevent scrolling on touch
        isDrawing = true;
        const { x, y } = getPoint(e);
        currentPathId = actions.startPath(x, y, currentColor, currentWidth);
    }

    function handleMove(e: MouseEvent | TouchEvent) {
        if (!isDrawing || !currentPathId) return;
        e.preventDefault();
        const { x, y } = getPoint(e);
        actions.updatePath(currentPathId, x, y);
    }

    function handleEnd(e: MouseEvent | TouchEvent) {
        if (!isDrawing || !currentPathId) return;
        actions.endPath(currentPathId);
        isDrawing = false;
        currentPathId = null;
    }

    function pointsToPath(points: number[][]): string {
        if (points.length === 0) return '';
        if (points.length === 1) return `M ${points[0][0]} ${points[0][1]} L ${points[0][0]} ${points[0][1]}`;
        
        // Simple line smoothing could be added here (Catmull-Rom or Bezier)
        // For MVP, simple polyline
        return `M ${points[0][0]} ${points[0][1]} ` + points.slice(1).map(p => `L ${p[0]} ${p[1]}`).join(' ');
    }
</script>

<div class="flex flex-col h-full w-full bg-white dark:bg-gray-900">
    <!-- Toolbar -->
    <div class="p-2 border-b border-gray-200 dark:border-gray-700 flex gap-4 items-center bg-gray-50 dark:bg-gray-800">
        <div class="flex items-center gap-2">
            <label class="text-sm font-medium dark:text-gray-300">Color:</label>
            <input type="color" bind:value={currentColor} class="h-8 w-8 rounded cursor-pointer" />
        </div>
        
        <div class="flex items-center gap-2">
            <label class="text-sm font-medium dark:text-gray-300">Size:</label>
            <input type="range" min="1" max="20" bind:value={currentWidth} class="w-24" />
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
    <div class="flex-1 relative overflow-hidden cursor-crosshair touch-none">
        <svg 
            bind:this={svgElement}
            class="w-full h-full block"
            onmousedown={handleStart}
            onmousemove={handleMove}
            onmouseup={handleEnd}
            onmouseleave={handleEnd}
            ontouchstart={handleStart}
            ontouchmove={handleMove}
            ontouchend={handleEnd}
        >
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
        </svg>
    </div>
</div>
