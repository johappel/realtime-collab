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
    let activeTool = $state<"hand" | "pen" | "card" | "frame" | "select">("hand");
    let currentColor = $state("#000000");
    let currentWidth = $state(3);
    let cardColor = $state("#fff9c4");
    let selectedCount = $state(0);
    let zoomLevel = $state(100);

    // Update selectedCount and zoomLevel reactively
    $effect(() => {
        if (whiteboardCanvas) {
            selectedCount = whiteboardCanvas.getSelectedCount();
            zoomLevel = whiteboardCanvas.getZoomLevel();
        }
    });

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
                class="px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 {activeTool ===
                'hand'
                    ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                onclick={() => (activeTool = "hand")}
                title="Hand (Pan)"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
                <span class="hidden sm:inline">Hand</span>
            </button>
            <button
                class="px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 {activeTool ===
                'pen'
                    ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                onclick={() => (activeTool = "pen")}
                title="Stift"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                <span class="hidden sm:inline">Stift</span>
            </button>
            <button
                class="px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 {activeTool ===
                'card'
                    ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                onclick={() => (activeTool = "card")}
                title="Karte"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/></svg>
                <span class="hidden sm:inline">Karte</span>
            </button>
            <button
                class="px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 {activeTool ===
                'frame'
                    ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                onclick={() => (activeTool = "frame")}
                title="Rahmen"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" stroke-dasharray="4 4"/></svg>
                <span class="hidden sm:inline">Rahmen</span>
            </button>
            <button
                class="px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                onclick={() => whiteboardCanvas?.uploadImage()}
                title="Bild"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                <span class="hidden sm:inline">Bild</span>
            </button>
            <button
                class="px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 {activeTool ===
                'select'
                    ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
                onclick={() => (activeTool = "select")}
                title="Auswahl"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 22a5 5 0 0 1-2-4"/><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1"/><path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>
                <span class="hidden sm:inline">Auswahl</span>
            </button>
        </div>

        <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>
        
        <!-- Zoom Controls -->
        <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded p-1 border border-gray-200 dark:border-gray-700">
            <button
                onclick={() => whiteboardCanvas?.zoomOut()}
                class="px-2 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                title="Herauszoomen"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
            </button>
            <span class="text-xs font-medium text-gray-600 dark:text-gray-300 min-w-12 text-center">
                {zoomLevel}%
            </span>
            <button
                onclick={() => whiteboardCanvas?.zoomIn()}
                class="px-2 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                title="Hineinzoomen"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
            </button>
            <button
                onclick={() => whiteboardCanvas?.resetZoom()}
                class="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                title="Zoom zurücksetzen (100%)"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
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
                Tipp: Markdown & URLs werden gerendert (Listen: - oder 1.)
            </span>
        {:else if activeTool === "select" && selectedCount > 0}
            <span class="text-xs text-gray-600 dark:text-gray-300 font-medium">
                {selectedCount} Element{selectedCount > 1 ? 'e' : ''} ausgewählt
            </span>
            
            <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>
            
            <button
                onclick={() => {
                    if (confirm(`Möchten Sie wirklich ${selectedCount} Element${selectedCount > 1 ? 'e' : ''} löschen?`)) {
                        whiteboardCanvas?.deleteSelected();
                        selectedCount = 0;
                    }
                }}
                class="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-900/30 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Ausgewählte Elemente löschen"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                <span class="hidden sm:inline">Löschen</span>
            </button>
        {:else if activeTool === "pen"}
            <div class="flex items-center gap-2">
                <input
                    type="color"
                    bind:value={currentColor}
                    class="h-6 w-6 rounded cursor-pointer border-none p-0"
                    title="Stiftfarbe"
                />
                <input
                    type="range"
                    min="1"
                    max="20"
                    bind:value={currentWidth}
                    class="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    title="Stiftdicke"
                />
            </div>
            
            <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>
            
            <button
                onclick={() => whiteboardCanvas?.undo()}
                class="px-3 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs font-medium dark:text-gray-300 transition-colors flex items-center gap-1.5"
                title="Letzte Zeichnung rückgängig"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                <span class="hidden sm:inline">Rückgängig</span>
            </button>
            
            <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>
            
            <button
                onclick={() => {
                    if (confirm('Möchten Sie wirklich alle Zeichnungen löschen?')) {
                        whiteboardCanvas?.clearBoard();
                    }
                }}
                class="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-900/30 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Alle Zeichnungen löschen"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                <span class="hidden sm:inline">Zeichnungen löschen</span>
            </button>
        {/if}
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
