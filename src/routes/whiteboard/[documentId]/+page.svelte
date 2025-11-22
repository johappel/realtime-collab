<script lang="ts">
    import { page } from "$app/stores";
    import WhiteboardCanvas from "$lib/apps/whiteboard/WhiteboardCanvas.svelte";
    import AppHeader from "$lib/AppHeader.svelte";
    import { appState } from "$lib/stores/appState.svelte";
    import { untrack, onMount } from "svelte";
    import type { Awareness } from "y-protocols/awareness";

    let { data } = $props();
    const pageStore = $state($page);
    let documentId = $derived(pageStore.params.documentId ?? "default");
    let docTitle = $state(untrack(() => documentId));

    let whiteboardCanvas = $state<WhiteboardCanvas>();
    let awareness: Awareness | null = $state(null);

    // Tool State
    let activeTool = $state<"pen" | "card" | "frame" | "select">("select");
    let currentColor = $state("#000000");
    let currentWidth = $state(3);
    let cardColor = $state("#fff9c4");

    onMount(async () => {
        await appState.init();

        // Check for URL parameters for auto-login with group code
        const urlParams = new URLSearchParams(window.location.search);
        const groupCode = urlParams.get("code");
        const nickname = urlParams.get("name");

        if (groupCode) {
            // Auto-login with group code
            await appState.setGroupCode(groupCode, nickname || undefined);
            await appState.initGroup();

            // Remove parameters from URL after processing
            window.history.replaceState({}, "", window.location.pathname);
        }
    });

    const CARD_COLORS = [
        { name: "Yellow", value: "#fff9c4" },
        { name: "Post-It", value: "#fff176" },
        { name: "Pink", value: "#f8bbd0" },
        { name: "Green", value: "#c8e6c9" },
        { name: "Orange", value: "#ffe0b2" },
        { name: "Purple", value: "#e1bee7" },
        { name: "Blue", value: "#bbdefb" },
    ];
</script>

{#snippet toolbar()}
    <div class="flex gap-4 items-center overflow-x-auto">
        <div
            class="flex bg-gray-100 dark:bg-gray-800 rounded p-1 gap-1 border border-gray-200 dark:border-gray-700"
        >
            <button
                class="px-3 py-1 rounded text-xs font-medium transition-colors {activeTool ===
                'pen'
                    ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                onclick={() => (activeTool = "pen")}
            >
                Pen
            </button>
            <button
                class="px-3 py-1 rounded text-xs font-medium transition-colors {activeTool ===
                'card'
                    ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                onclick={() => (activeTool = "card")}
            >
                Card
            </button>
            <button
                class="px-3 py-1 rounded text-xs font-medium transition-colors {activeTool ===
                'frame'
                    ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                onclick={() => (activeTool = "frame")}
            >
                Frame
            </button>
            <button
                class="px-3 py-1 rounded text-xs font-medium transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                onclick={() => whiteboardCanvas?.uploadImage()}
            >
                Image
            </button>
            <button
                class="px-3 py-1 rounded text-xs font-medium transition-colors {activeTool ===
                'select'
                    ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                onclick={() => (activeTool = "select")}
            >
                Select
            </button>
        </div>

        <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

        {#if activeTool === "card"}
            <div class="flex items-center gap-1">
                {#each CARD_COLORS as color}
                    <button
                        class="w-5 h-5 rounded-full border border-gray-300 shadow-sm hover:scale-110 transition-transform"
                        style="background-color: {color.value}; {cardColor ===
                        color.value
                            ? 'ring: 2px solid blue;'
                            : ''}"
                        onclick={() => (cardColor = color.value)}
                        title={color.name}
                        aria-label={color.name}
                    >
                    </button>
                {/each}
            </div>
            
            <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>
            
            <span class="text-xs text-gray-500 dark:text-gray-400 italic">
                Tipp: Markdown & URLs werden automatisch gerendert
            </span>
        {:else if activeTool === "pen"}
            <div class="flex items-center gap-2">
                <input
                    type="color"
                    bind:value={currentColor}
                    class="h-6 w-6 rounded cursor-pointer border-none p-0"
                    title="Pen Color"
                />
                <input
                    type="range"
                    min="1"
                    max="20"
                    bind:value={currentWidth}
                    class="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    title="Pen Size"
                />
            </div>
        {/if}

        <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

        <button
            onclick={() => whiteboardCanvas?.undo()}
            class="px-3 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs font-medium dark:text-gray-300 transition-colors"
        >
            Undo
        </button>

        <button
            onclick={() => whiteboardCanvas?.clearBoard()}
            class="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-900/30 rounded text-xs font-medium transition-colors"
        >
            Clear
        </button>
    </div>
{/snippet}

<div class="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900">
    <AppHeader
        bind:documentId={docTitle}
        {awareness}
        showHistory={false}
        maxWidth={4000}
        {toolbar}
    />

    <div class="flex-1 relative">
        {#key appState.mode}
            <WhiteboardCanvas
                bind:this={whiteboardCanvas}
                {documentId}
                user={appState.user}
                mode={appState.mode}
                bind:title={docTitle}
                bind:awareness
                bind:activeTool
                bind:currentColor
                bind:currentWidth
                bind:cardColor
            />
        {/key}
    </div>
</div>
