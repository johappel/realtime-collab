<script lang="ts">
    import { page } from '$app/stores';
    import AppHeader from '$lib/AppHeader.svelte';
    import WikiApp from '$lib/apps/wiki/WikiApp.svelte';
    import { appState } from '$lib/stores/appState.svelte';
    import { untrack, onMount } from 'svelte';
    import type { Awareness } from 'y-protocols/awareness';
    import { Search, Plus, BookA } from 'lucide-svelte';

    let { data } = $props();
    const pageStore = $state($page);
    let documentId = $derived(pageStore.params.documentId ?? 'default');
    let docTitle = $state(untrack(() => documentId));
    
    let wikiApp = $state<WikiApp>();
    let awareness: Awareness | null = $state(null);
    
    // Toolbar state
    let searchQuery = $state('');
    let newPageTitle = $state('');
    let showSidebar = $state(true);

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

    function handleCreatePage() {
        if (newPageTitle.trim() && wikiApp) {
            wikiApp.createPage(newPageTitle.trim());
            newPageTitle = '';
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleCreatePage();
        }
    }
</script>

{#snippet toolbar()}
    <div class="flex gap-2 w-full max-w-2xl items-center">

        <!-- A-Z Toggle -->
        <button
            class="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            class:bg-gray-200={showSidebar}
            class:dark:bg-gray-600={showSidebar}
            onclick={() => showSidebar = !showSidebar}
            title="Seitenliste (A-Z)"
        >
            <BookA size={18} />
        </button>

        <!-- Search -->
        <div class="relative flex-1 min-w-[100px]">
            <Search size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
                type="text"
                bind:value={searchQuery}
                placeholder="Suche..."
                class="w-full pl-8 pr-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
        </div>
        
        <div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>

        <!-- New Page -->
        <div class="flex gap-1 items-center">
            <input
                type="text"
                bind:value={newPageTitle}
                onkeydown={handleKeydown}
                placeholder="Neue Seite..."
                class="w-32 sm:w-40 px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
                onclick={handleCreatePage}
                class="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                title="Seite erstellen"
            >
                <Plus size={16} />
            </button>
        </div>
    </div>
{/snippet}

<div class="page-container">
    <AppHeader 
        bind:documentId={docTitle}
        {awareness}
        showHistory={false}
        maxWidth={1024}
        {toolbar}
    />
    <main>
        {#key appState.mode}
            <WikiApp 
                bind:this={wikiApp}
                {documentId} 
                mode={appState.mode} 
                user={appState.user}
                bind:title={docTitle}
                bind:searchQuery={searchQuery}
                bind:showSidebar={showSidebar}
                bind:awareness={awareness}
            />
        {/key}
    </main>
</div>

<style>
    .page-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        overflow: hidden;
        background-color: #f9fafb;
    }

    :global(.dark) .page-container {
        background-color: #111827;
    }

    main {
        flex: 1;
        overflow: hidden;
        position: relative;
    }
</style>
