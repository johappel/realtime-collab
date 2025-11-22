<script lang="ts">
    import { page } from '$app/stores';
    import PollApp from '$lib/apps/poll/PollApp.svelte';
    import AppHeader from '$lib/AppHeader.svelte';
    import { appState } from '$lib/stores/appState.svelte';
    import { untrack, onMount } from 'svelte';
    import type { Awareness } from 'y-protocols/awareness';
    import { writable } from 'svelte/store';
    
    let { data } = $props();
    const pageStore = $state($page);
    let documentId = $derived(pageStore.params.documentId ?? 'default');
    let docTitle = $state(untrack(() => documentId));
    
    let pollApp = $state<PollApp>();
    let awareness: Awareness | null = $state(null);
    let settings = $state(writable({
        allowUserOptions: false,
        anonymous: false,
        multiSelect: false
    }));

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
</script>

{#snippet toolbar()}
    <div class="flex gap-4 items-center overflow-x-auto">
        <label class="flex items-center gap-2 cursor-pointer text-sm dark:text-gray-300 whitespace-nowrap">
            <input 
                type="checkbox" 
                checked={$settings.multiSelect} 
                onchange={(e) => pollApp?.updateSettings({ multiSelect: e.currentTarget.checked })}
                class="rounded text-blue-600 focus:ring-blue-500"
            />
            Mehrfachauswahl
        </label>
        
        <label class="flex items-center gap-2 cursor-pointer text-sm dark:text-gray-300 whitespace-nowrap">
            <input 
                type="checkbox" 
                checked={$settings.anonymous} 
                onchange={(e) => pollApp?.updateSettings({ anonymous: e.currentTarget.checked })}
                class="rounded text-blue-600 focus:ring-blue-500"
            />
            Anonym
        </label>

        <label class="flex items-center gap-2 cursor-pointer text-sm dark:text-gray-300 whitespace-nowrap">
            <input 
                type="checkbox" 
                checked={$settings.allowUserOptions} 
                onchange={(e) => pollApp?.updateSettings({ allowUserOptions: e.currentTarget.checked })}
                class="rounded text-blue-600 focus:ring-blue-500"
            />
            Eigene Optionen
        </label>

        <div class="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

        <button 
            onclick={() => {
                if (confirm('Möchten Sie wirklich alle Stimmen zurücksetzen?')) {
                    pollApp?.resetVotes();
                }
            }}
            class="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-900/30 rounded text-xs font-medium transition-colors whitespace-nowrap"
        >
            Stimmen zurücksetzen
        </button>
    </div>
{/snippet}

<div class="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900">
    <AppHeader 
        bind:documentId={docTitle}
        {awareness}
        showHistory={false}
        maxWidth={1024}
        {toolbar}
    />
    
    <div class="flex-1 relative overflow-auto">
        {#key appState.mode}
            <PollApp 
                bind:this={pollApp}
                {documentId}
                user={appState.user}
                mode={appState.mode}
                bind:title={docTitle}
                bind:awareness={awareness}
                bind:settings={settings}
            />
        {/key}
    </div>
</div>
