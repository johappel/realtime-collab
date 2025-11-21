<script lang="ts">
    import { page } from '$app/stores';
    import TodoApp from '$lib/apps/todo/TodoApp.svelte';
    
    let { data } = $props();
    let documentId = $derived($page.params.documentId ?? 'default');
    
    let mode = $state<'local' | 'nostr'>('local');
</script>

<div class="h-full w-full flex flex-col">
    <div class="p-4 border-b bg-gray-50 dark:bg-gray-800 dark:border-gray-700 flex justify-between items-center">
        <h1 class="text-xl font-bold dark:text-white">Todo List: {documentId}</h1>
        <div class="flex gap-2">
             <label class="flex items-center gap-2 text-sm">
                <input type="radio" bind:group={mode} value="local" /> Local
            </label>
            <label class="flex items-center gap-2 text-sm">
                <input type="radio" bind:group={mode} value="nostr" /> Nostr
            </label>
        </div>
    </div>
    <div class="flex-1 relative overflow-y-auto bg-gray-100 dark:bg-gray-900">
        {#key mode}
            <TodoApp 
                {documentId}
                {mode}
            />
        {/key}
    </div>
</div>
