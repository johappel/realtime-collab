import * as Y from 'yjs';
import { useNostrYDoc } from '$lib/useNostrYDoc';
import { useLocalYDoc } from '$lib/useLocalYDoc';
import { writable, type Writable } from 'svelte/store';

export interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    createdAt: number;
}

export interface UseTodoYDocResult {
    items: Writable<TodoItem[]>;
    ydoc: Y.Doc;
    provider: any;
    awareness: any;
    cleanup: () => void;
    addItem: (text: string) => void;
    toggleItem: (id: string) => void;
    deleteItem: (id: string) => void;
    updateItemText: (id: string, text: string) => void;
    moveItem: (fromIndex: number, toIndex: number) => void;
    reorderItems: (newOrderIds: string[]) => void;
}

export function useTodoYDoc(
    documentId: string,
    mode: 'local' | 'nostr',
    user: { name: string; color: string },
    myPubkey?: string,
    signAndPublish?: (evt: any) => Promise<any>,
    relays?: string[]
): UseTodoYDocResult {
    let ydoc: Y.Doc;
    let provider: any;
    let awareness: any;
    let persistence: any;

    if (mode === 'nostr' && myPubkey && signAndPublish) {
        const result = useNostrYDoc(documentId, myPubkey, signAndPublish, false, relays);
        ydoc = result.ydoc;
        provider = result.provider;
        awareness = result.awareness;
        persistence = result.persistence;
    } else {
        const result = useLocalYDoc(documentId);
        ydoc = result.ydoc;
        awareness = result.awareness;
        persistence = result.persistence;
    }

    // We use a Map for data and an Array for order to allow concurrent editing + reordering
    const yItemsMap = ydoc.getMap<Y.Map<any>>('todo-data');
    const yOrder = ydoc.getArray<string>('todo-order');
    
    // Legacy support / Migration (optional, but good practice if we cared about old docs)
    // For this demo, we'll just use new keys.

    const items = writable<TodoItem[]>([]);

    const syncItems = () => {
        const currentOrder = yOrder.toArray();
        const newItems: TodoItem[] = [];
        
        currentOrder.forEach(id => {
            const yMap = yItemsMap.get(id);
            if (yMap) {
                newItems.push({
                    id: yMap.get('id'),
                    text: yMap.get('text'),
                    completed: yMap.get('completed'),
                    createdAt: yMap.get('createdAt')
                });
            }
        });
        
        items.set(newItems);
    };

    yItemsMap.observeDeep(syncItems);
    yOrder.observeDeep(syncItems);
    syncItems();

    const addItem = (text: string) => {
        ydoc.transact(() => {
            const id = crypto.randomUUID();
            const yMap = new Y.Map();
            yMap.set('id', id);
            yMap.set('text', text);
            yMap.set('completed', false);
            yMap.set('createdAt', Date.now());
            
            yItemsMap.set(id, yMap);
            yOrder.insert(0, [id]); // Add to top
        });
    };

    const toggleItem = (id: string) => {
        ydoc.transact(() => {
            const map = yItemsMap.get(id);
            if (map) {
                map.set('completed', !map.get('completed'));
            }
        });
    };

    const deleteItem = (id: string) => {
        ydoc.transact(() => {
            yItemsMap.delete(id);
            // Find and remove from order
            let index = -1;
            for (let i = 0; i < yOrder.length; i++) {
                if (yOrder.get(i) === id) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                yOrder.delete(index, 1);
            }
        });
    };

    const updateItemText = (id: string, text: string) => {
        ydoc.transact(() => {
            const map = yItemsMap.get(id);
            if (map) {
                map.set('text', text);
            }
        });
    };

    const moveItem = (fromIndex: number, toIndex: number) => {
        ydoc.transact(() => {
            if (fromIndex === toIndex) return;
            if (fromIndex < 0 || fromIndex >= yOrder.length) return;
            if (toIndex < 0 || toIndex > yOrder.length) return; // toIndex can be length (append)

            const idToMove = yOrder.get(fromIndex);
            yOrder.delete(fromIndex, 1);
            yOrder.insert(toIndex, [idToMove]);
        });
    };

    const reorderItems = (newOrderIds: string[]) => {
        ydoc.transact(() => {
            const currentYOrder = yOrder.toArray();
            // Check for items in currentYOrder that are NOT in newOrderIds (concurrently added)
            const missingItems = currentYOrder.filter(id => !newOrderIds.includes(id));
            
            // Apply new order and append any concurrently added items
            const finalOrder = [...newOrderIds, ...missingItems];
            
            yOrder.delete(0, yOrder.length);
            yOrder.insert(0, finalOrder);
        });
    };

    const cleanup = () => {
        yItemsMap.unobserveDeep(syncItems);
        yOrder.unobserveDeep(syncItems);
        if (provider && typeof provider.destroy === 'function') provider.destroy();
        if (awareness) awareness.destroy();
        if (persistence && typeof persistence.destroy === 'function') persistence.destroy();
        ydoc.destroy();
    };

    return {
        items,
        ydoc,
        provider,
        awareness,
        cleanup,
        addItem,
        toggleItem,
        deleteItem,
        updateItemText,
        moveItem,
        reorderItems
    };
}
