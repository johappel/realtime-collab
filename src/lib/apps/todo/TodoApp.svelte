<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { writable, type Writable } from 'svelte/store';
    import { useTodoYDoc, type TodoItem } from './useTodoYDoc';
    import { loadConfig } from '$lib/config';
    import { getNip07Pubkey, signAndPublishNip07 } from '$lib/nostrUtils';
    import { theme } from '$lib/stores/theme.svelte';
    import { dndzone, type DndEvent } from 'svelte-dnd-action';
    import { flip } from 'svelte/animate';

    let { 
        documentId, 
        user = { name: 'Anon', color: '#ff0000' },
        mode = 'local'
    } = $props<{
        documentId: string;
        user?: { name: string; color: string };
        mode?: 'local' | 'nostr';
    }>();

    let items: Writable<TodoItem[]> = $state(writable([]));
    let localItems = $state<TodoItem[]>([]);
    let isDragging = $state(false);
    let newItemText = $state('');
    let cleanup: (() => void) | null = null;
    let actions: any = {};

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

        const result = useTodoYDoc(
            documentId,
            mode,
            user,
            pubkey,
            signAndPublish,
            relays
        );

        items = result.items;
        cleanup = result.cleanup;
        actions = {
            addItem: result.addItem,
            toggleItem: result.toggleItem,
            deleteItem: result.deleteItem,
            updateItemText: result.updateItemText,
            reorderItems: result.reorderItems
        };
    });

    // Sync store to local state, but pause during drag
    $effect(() => {
        const currentItems = $items;
        if (!isDragging) {
            localItems = currentItems;
        }
    });

    onDestroy(() => {
        if (cleanup) cleanup();
    });

    function handleAdd() {
        if (newItemText.trim()) {
            actions.addItem(newItemText.trim());
            newItemText = '';
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            handleAdd();
        }
    }

    function handleDndConsider(e: CustomEvent<DndEvent<TodoItem>>) {
        isDragging = true;
        localItems = e.detail.items;
    }

    function handleDndFinalize(e: CustomEvent<DndEvent<TodoItem>>) {
        isDragging = false;
        localItems = e.detail.items;
        if (actions.reorderItems) {
            actions.reorderItems(localItems.map(i => i.id));
        }
    }
</script>

<div class="max-w-2xl mx-auto p-6">
    <div class="flex gap-2 mb-6">
        <input
            type="text"
            bind:value={newItemText}
            onkeydown={handleKeydown}
            placeholder="Add a new task..."
            class="flex-1 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
            onclick={handleAdd}
            class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
            Add
        </button>
    </div>

    <div 
        class="space-y-2"
        use:dndzone={{items: localItems, flipDurationMs: 300, dropTargetStyle: {}}}
        onconsider={handleDndConsider}
        onfinalize={handleDndFinalize}
    >
        {#each localItems as item (item.id)}
            <div 
                animate:flip={{duration: 300}}
                class="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 group cursor-move"
            >
                <div class="text-gray-400 dark:text-gray-600 cursor-grab active:cursor-grabbing">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                </div>
                <input
                    type="checkbox"
                    checked={item.completed}
                    onchange={() => actions.toggleItem(item.id)}
                    class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <span 
                    class="flex-1 text-lg {item.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}"
                >
                    {item.text}
                </span>
                <button
                    onclick={() => actions.deleteItem(item.id)}
                    class="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                    aria-label="Delete task"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>
        {/each}
        
        {#if localItems.length === 0}
            <div class="text-center text-gray-500 dark:text-gray-400 py-10">
                No tasks yet. Start by adding one!
            </div>
        {/if}
    </div>
</div>
