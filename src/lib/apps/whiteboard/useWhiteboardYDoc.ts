import * as Y from 'yjs';
import { useNostrYDoc } from '$lib/useNostrYDoc';
import { useLocalYDoc } from '$lib/useLocalYDoc';
import { writable, type Writable } from 'svelte/store';

export interface DrawPath {
    id: string;
    points: number[][]; // [x, y][]
    color: string;
    width: number;
    isComplete: boolean;
}

export interface WhiteboardCard {
    id: string;
    x: number;
    y: number;
    text: string;
    color: string;
    width: number;
    height: number;
}

export interface WhiteboardFrame {
    id: string;
    x: number;
    y: number;
    label: string;
    width: number;
    height: number;
}

export interface UseWhiteboardYDocResult {
    paths: Writable<DrawPath[]>;
    cards: Writable<WhiteboardCard[]>;
    frames: Writable<WhiteboardFrame[]>;
    ydoc: Y.Doc;
    provider: any;
    awareness: any;
    cleanup: () => void;
    startPath: (x: number, y: number, color: string, width: number) => string;
    updatePath: (id: string, x: number, y: number) => void;
    endPath: (id: string) => void;
    addCard: (x: number, y: number, color: string) => void;
    updateCard: (id: string, updates: Partial<WhiteboardCard>) => void;
    deleteCard: (id: string) => void;
    addFrame: (x: number, y: number) => void;
    updateFrame: (id: string, updates: Partial<WhiteboardFrame>) => void;
    deleteFrame: (id: string) => void;
    clearBoard: () => void;
    undo: () => void;
}

export function useWhiteboardYDoc(
    documentId: string,
    mode: 'local' | 'nostr',
    user: { name: string; color: string },
    myPubkey?: string,
    signAndPublish?: (evt: any) => Promise<any>,
    relays?: string[]
): UseWhiteboardYDocResult {
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

    // Yjs Data Structure: Array of Maps
    const yPaths = ydoc.getArray<Y.Map<any>>('whiteboard-paths');
    const yCards = ydoc.getMap<Y.Map<any>>('whiteboard-cards'); // Using Map for cards for easier ID access
    const yFrames = ydoc.getMap<Y.Map<any>>('whiteboard-frames');
    
    const paths = writable<DrawPath[]>([]);
    const cards = writable<WhiteboardCard[]>([]);
    const frames = writable<WhiteboardFrame[]>([]);

    const syncPaths = () => {
        const newPaths = yPaths.map(yMap => ({
            id: yMap.get('id'),
            points: yMap.get('points') || [],
            color: yMap.get('color'),
            width: yMap.get('width'),
            isComplete: yMap.get('isComplete')
        }));
        paths.set(newPaths);
    };

    const syncCards = () => {
        const newCards: WhiteboardCard[] = [];
        yCards.forEach((yMap) => {
            newCards.push({
                id: yMap.get('id'),
                x: yMap.get('x'),
                y: yMap.get('y'),
                text: yMap.get('text'),
                color: yMap.get('color'),
                width: yMap.get('width'),
                height: yMap.get('height')
            });
        });
        cards.set(newCards);
    };

    const syncFrames = () => {
        const newFrames: WhiteboardFrame[] = [];
        yFrames.forEach((yMap) => {
            newFrames.push({
                id: yMap.get('id'),
                x: yMap.get('x'),
                y: yMap.get('y'),
                label: yMap.get('label'),
                width: yMap.get('width'),
                height: yMap.get('height')
            });
        });
        frames.set(newFrames);
    };

    yPaths.observeDeep(syncPaths);
    yCards.observeDeep(syncCards);
    yFrames.observeDeep(syncFrames);
    syncPaths();
    syncCards();
    syncFrames();

    const startPath = (x: number, y: number, color: string, width: number): string => {
        const id = crypto.randomUUID();
        ydoc.transact(() => {
            const yMap = new Y.Map();
            yMap.set('id', id);
            yMap.set('points', [[x, y]]);
            yMap.set('color', color);
            yMap.set('width', width);
            yMap.set('isComplete', false);
            yPaths.push([yMap]);
        });
        return id;
    };

    const updatePath = (id: string, x: number, y: number) => {
        // Optimization: Don't transact every single point if possible, 
        // or throttle updates. For MVP, direct update is fine but might be chatty.
        // We find the path map.
        // Note: iterating array to find ID is O(N). 
        // For a real app, we might want a Map<ID, Y.Map> but order matters for layering.
        
        // We can optimize by keeping a reference to the current drawing path if we are the author.
        // But for simplicity/robustness:
        
        ydoc.transact(() => {
            // Search from end as we likely modify the last added path
            for (let i = yPaths.length - 1; i >= 0; i--) {
                const map = yPaths.get(i);
                if (map.get('id') === id) {
                    const currentPoints = map.get('points') as number[][];
                    // Append point
                    // Yjs doesn't support partial array updates efficiently on a simple JS array stored in a Map key.
                    // We have to replace the array. 
                    // Ideally 'points' should be a Y.Array, but that adds nesting complexity.
                    // For MVP, replacing the array is okay for short paths.
                    map.set('points', [...currentPoints, [x, y]]);
                    break;
                }
            }
        });
    };

    const endPath = (id: string) => {
        ydoc.transact(() => {
            for (let i = yPaths.length - 1; i >= 0; i--) {
                const map = yPaths.get(i);
                if (map.get('id') === id) {
                    map.set('isComplete', true);
                    break;
                }
            }
        });
    };

    const addCard = (x: number, y: number, color: string) => {
        ydoc.transact(() => {
            const id = crypto.randomUUID();
            const yMap = new Y.Map();
            yMap.set('id', id);
            yMap.set('x', x);
            yMap.set('y', y);
            yMap.set('text', '');
            yMap.set('color', color);
            yMap.set('width', 200);
            yMap.set('height', 150);
            yCards.set(id, yMap);
        });
    };

    const updateCard = (id: string, updates: Partial<WhiteboardCard>) => {
        ydoc.transact(() => {
            const yMap = yCards.get(id);
            if (yMap) {
                if (updates.x !== undefined) yMap.set('x', updates.x);
                if (updates.y !== undefined) yMap.set('y', updates.y);
                if (updates.text !== undefined) yMap.set('text', updates.text);
                if (updates.color !== undefined) yMap.set('color', updates.color);
                if (updates.width !== undefined) yMap.set('width', updates.width);
                if (updates.height !== undefined) yMap.set('height', updates.height);
            }
        });
    };

    const deleteCard = (id: string) => {
        ydoc.transact(() => {
            yCards.delete(id);
        });
    };

    const addFrame = (x: number, y: number) => {
        ydoc.transact(() => {
            const id = crypto.randomUUID();
            const yMap = new Y.Map();
            yMap.set('id', id);
            yMap.set('x', x);
            yMap.set('y', y);
            yMap.set('label', 'New Frame');
            yMap.set('width', 400);
            yMap.set('height', 300);
            yFrames.set(id, yMap);
        });
    };

    const updateFrame = (id: string, updates: Partial<WhiteboardFrame>) => {
        ydoc.transact(() => {
            const yMap = yFrames.get(id);
            if (yMap) {
                if (updates.x !== undefined) yMap.set('x', updates.x);
                if (updates.y !== undefined) yMap.set('y', updates.y);
                if (updates.label !== undefined) yMap.set('label', updates.label);
                if (updates.width !== undefined) yMap.set('width', updates.width);
                if (updates.height !== undefined) yMap.set('height', updates.height);
            }
        });
    };

    const deleteFrame = (id: string) => {
        ydoc.transact(() => {
            yFrames.delete(id);
        });
    };

    const clearBoard = () => {
        ydoc.transact(() => {
            yPaths.delete(0, yPaths.length);
            yCards.clear();
            yFrames.clear();
        });
    };

    const undo = () => {
        ydoc.transact(() => {
            if (yPaths.length > 0) {
                yPaths.delete(yPaths.length - 1, 1);
            }
        });
    };

    const cleanup = () => {
        yPaths.unobserveDeep(syncPaths);
        yCards.unobserveDeep(syncCards);
        yFrames.unobserveDeep(syncFrames);
        if (provider && typeof provider.destroy === 'function') provider.destroy();
        if (awareness) awareness.destroy();
        if (persistence && typeof persistence.destroy === 'function') persistence.destroy();
        ydoc.destroy();
    };

    return {
        paths,
        cards,
        frames,
        ydoc,
        provider,
        awareness,
        cleanup,
        startPath,
        updatePath,
        endPath,
        addCard,
        updateCard,
        deleteCard,
        addFrame,
        updateFrame,
        deleteFrame,
        clearBoard,
        undo
    };
}
