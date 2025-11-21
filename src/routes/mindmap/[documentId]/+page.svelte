<script lang="ts">
    import { page } from '$app/stores';
    import MindmapCanvas from '$lib/apps/mindmap/MindmapCanvas.svelte';
    import AppHeader from '$lib/AppHeader.svelte';
    import { appState } from '$lib/stores/appState.svelte';
    import { untrack, onMount } from 'svelte';
    import { Trash2 } from 'lucide-svelte';
    import { theme } from '$lib/stores/theme.svelte';
    import type { Awareness } from 'y-protocols/awareness';
    
    let { data } = $props();
    const pageStore = $state($page);
    let documentId = $derived(pageStore.params.documentId ?? 'default');
    let docTitle = $state(untrack(() => documentId));
    
    let mindmapCanvas = $state<MindmapCanvas>();
    let toolbarState = $state({ hasSelection: false, layout: 'vertical' as 'vertical' | 'horizontal' });
    let awareness: Awareness | null = $state(null);

    onMount(() => {
        appState.init();
    });

    const colors = [
        { color: '', label: 'Default' },
        { color: '#ffcdd2', label: 'Red' },
        { color: '#bbdefb', label: 'Blue' },
        { color: '#c8e6c9', label: 'Green' },
        { color: '#fff9c4', label: 'Yellow' },
        { color: '#e1bee7', label: 'Purple' },
    ];
</script>

{#snippet toolbar()}
    <div class="flex gap-2 items-center">
        {#if toolbarState.hasSelection}
            <div class="flex bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-1 gap-1 mr-2 items-center">
                {#each colors as c}
                    <button
                        class="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 hover:scale-110 transition-transform"
                        style="background-color: {c.color || (theme.isDark ? '#1f2937' : '#ffffff')}"
                        title={c.label}
                        onclick={() => mindmapCanvas?.setColorPublic(c.color)}
                    >
                        {#if !c.color}
                            <span class="block text-[8px] text-center leading-4 text-gray-500">/</span>
                        {/if}
                    </button>
                {/each}
                <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                <button 
                    class="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded"
                    onclick={() => mindmapCanvas?.deleteSelectedPublic()}
                    title="Löschen"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        {/if}

        <button 
            class="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            onclick={() => mindmapCanvas?.toggleLayoutPublic()}
            title="Layout umschalten"
        >
            {toolbarState.layout === 'vertical' ? '↕ Vertical' : '↔ Horizontal'}
        </button>

        <button 
            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
            onclick={() => mindmapCanvas?.addNodePublic()}
        >
            Add Node
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
            <MindmapCanvas 
                bind:this={mindmapCanvas}
                {documentId}
                user={appState.user}
                mode={appState.mode}
                bind:toolbarState={toolbarState}
                bind:title={docTitle}
            />
        {/key}
    </div>
</div>
