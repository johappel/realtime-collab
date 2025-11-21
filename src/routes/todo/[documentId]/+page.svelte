<script lang="ts">
    import { page } from '$app/stores';
    import TodoApp from '$lib/apps/todo/TodoApp.svelte';
    import AppHeader from '$lib/AppHeader.svelte';
    import { appState } from '$lib/stores/appState.svelte';
    import { untrack, onMount } from 'svelte';
    import type { Awareness } from 'y-protocols/awareness';
    
    let { data } = $props();
    const pageStore = $state($page);
    let documentId = $derived(pageStore.params.documentId ?? 'default');
    let docTitle = $state(untrack(() => documentId));
    
    let todoApp = $state<TodoApp>();
    let newItemText = $state('');
    let awareness: Awareness | null = $state(null);

    onMount(() => {
        appState.init();
    });

    function handleAdd() {
        if (newItemText.trim() && todoApp) {
            todoApp.addItem(newItemText.trim());
            newItemText = '';
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAdd();
        }
    }
</script>

{#snippet toolbar()}
    <div class="flex gap-2 w-full max-w-md">
        <input
            type="text"
            bind:value={newItemText}
            onkeydown={handleKeydown}
            placeholder="Add a new task..."
            class="flex-1 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
            onclick={handleAdd}
            class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
        >
            Add
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
    
    <div class="flex-1 relative overflow-y-auto">
        {#key appState.mode}
            <TodoApp 
                bind:this={todoApp}
                {documentId}
                user={appState.user}
                mode={appState.mode}
                bind:title={docTitle}
                bind:awareness={awareness}
            />
        {/key}
    </div>
</div>
