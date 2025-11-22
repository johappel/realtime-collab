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
    zIndex: number;
}

export interface WhiteboardFrame {
    id: string;
    x: number;
    y: number;
    label: string;
    width: number;
    height: number;
}

export interface WhiteboardImage {
    id: string;
    x: number;
    y: number;
    url: string;
    iv: string;
    mimetype: string;
    width: number;
    height: number;
    zIndex: number;
}

export interface UseWhiteboardYDocResult {
    paths: Writable<DrawPath[]>;
    cards: Writable<WhiteboardCard[]>;
    frames: Writable<WhiteboardFrame[]>;
    images: Writable<WhiteboardImage[]>;
    ydoc: Y.Doc;
    provider: any;
    awareness: any;
    cleanup: () => void;
    startPath: (x: number, y: number, color: string, width: number) => string;
    updatePath: (id: string, x: number, y: number) => void;
    endPath: (id: string) => void;
    addCard: (x: number, y: number, color: string) => string;
    updateCard: (id: string, updates: Partial<WhiteboardCard>) => void;
    deleteCard: (id: string) => void;
    addFrame: (x: number, y: number) => string;
    updateFrame: (id: string, updates: Partial<WhiteboardFrame>) => void;
    deleteFrame: (id: string) => void;
    addImage: (x: number, y: number, url: string, iv: string, mimetype: string, width: number, height: number) => string;
    updateImage: (id: string, updates: Partial<WhiteboardImage>) => void;
    deleteImage: (id: string) => void;
    deleteMultiple: (cardIds: string[], imageIds: string[], frameIds: string[]) => void;
    clearBoard: () => void;
    undo: () => void;
}

export function useWhiteboardYDoc(
    documentId: string,
    mode: 'local' | 'nostr' | 'group',
    user: { name: string; color: string },
    myPubkey?: string,
    signAndPublish?: (evt: any) => Promise<any>,
    relays?: string[]
): UseWhiteboardYDocResult {
    let ydoc: Y.Doc;
    let provider: any;
    let awareness: any;
    let persistence: any;

    if (mode === 'nostr' || mode === 'group') {
        const result = useNostrYDoc(
            documentId,
            myPubkey || '',
            signAndPublish!,
            false,
            relays || [],
            user.name,
            mode === 'group'
        );
        ydoc = result.ydoc;
        provider = result.provider;
        awareness = result.awareness;
    } else {
        const result = useLocalYDoc(documentId);
        ydoc = result.ydoc;
        provider = null;
        awareness = result.awareness;
        persistence = result.persistence;
    }

    const paths = writable<DrawPath[]>([]);
    const cards = writable<WhiteboardCard[]>([]);
    const frames = writable<WhiteboardFrame[]>([]);
    const images = writable<WhiteboardImage[]>([]);

    const yPaths = ydoc.getArray<Y.Map<any>>('whiteboard-paths');
    const yCards = ydoc.getMap<Y.Map<any>>('whiteboard-cards');
    const yFrames = ydoc.getMap<Y.Map<any>>('whiteboard-frames');
    const yImages = ydoc.getMap<Y.Map<any>>('whiteboard-images');

    const syncPaths = () => {
        paths.set(yPaths.toArray().map(ymap => ymap.toJSON() as DrawPath));
    };

    const syncCards = () => {
        cards.set(Array.from(yCards.values()).map(ymap => ymap.toJSON() as WhiteboardCard));
    };

    const syncFrames = () => {
        frames.set(Array.from(yFrames.values()).map(ymap => ymap.toJSON() as WhiteboardFrame));
    };

    const syncImages = () => {
        images.set(Array.from(yImages.values()).map(ymap => ymap.toJSON() as WhiteboardImage));
    };

    yPaths.observeDeep(syncPaths);
    yCards.observeDeep(syncCards);
    yFrames.observeDeep(syncFrames);
    yImages.observeDeep(syncImages);

    // Initial sync
    syncPaths();
    syncCards();
    syncFrames();
    syncImages();

    const startPath = (x: number, y: number, color: string, width: number) => {
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
        ydoc.transact(() => {
            for (let i = yPaths.length - 1; i >= 0; i--) {
                const map = yPaths.get(i);
                if (map.get('id') === id) {
                    const currentPoints = map.get('points') as number[][];
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
        const id = crypto.randomUUID();
        ydoc.transact(() => {
            const yMap = new Y.Map();
            yMap.set('id', id);
            yMap.set('x', x);
            yMap.set('y', y);
            yMap.set('text', '');
            yMap.set('color', color);
            yMap.set('width', 200);
            yMap.set('height', 150);
            yMap.set('zIndex', Date.now());
            yCards.set(id, yMap);
        });
        return id;
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
                if (updates.zIndex !== undefined) yMap.set('zIndex', updates.zIndex);
            }
        });
    };

    const deleteCard = (id: string) => {
        ydoc.transact(() => {
            yCards.delete(id);
        });
    };

    const addFrame = (x: number, y: number) => {
        const id = crypto.randomUUID();
        ydoc.transact(() => {
            const yMap = new Y.Map();
            yMap.set('id', id);
            yMap.set('x', x);
            yMap.set('y', y);
            yMap.set('label', 'New Frame');
            yMap.set('width', 400);
            yMap.set('height', 300);
            yFrames.set(id, yMap);
        });
        return id;
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

    const addImage = (x: number, y: number, url: string, iv: string, mimetype: string, width: number, height: number) => {
        const id = crypto.randomUUID();
        ydoc.transact(() => {
            const yMap = new Y.Map();
            yMap.set('id', id);
            yMap.set('x', x);
            yMap.set('y', y);
            yMap.set('url', url);
            yMap.set('iv', iv);
            yMap.set('mimetype', mimetype);
            yMap.set('width', width);
            yMap.set('height', height);
            yMap.set('zIndex', Date.now());
            yImages.set(id, yMap);
        });
        return id;
    };

    const updateImage = (id: string, updates: Partial<WhiteboardImage>) => {
        ydoc.transact(() => {
            const yMap = yImages.get(id);
            if (yMap) {
                if (updates.x !== undefined) yMap.set('x', updates.x);
                if (updates.y !== undefined) yMap.set('y', updates.y);
                if (updates.width !== undefined) yMap.set('width', updates.width);
                if (updates.height !== undefined) yMap.set('height', updates.height);
                if (updates.zIndex !== undefined) yMap.set('zIndex', updates.zIndex);
            }
        });
    };

    const deleteImage = (id: string) => {
        ydoc.transact(() => {
            yImages.delete(id);
        });
    };

    const deleteMultiple = (cardIds: string[], imageIds: string[], frameIds: string[]) => {
        ydoc.transact(() => {
            cardIds.forEach(id => yCards.delete(id));
            imageIds.forEach(id => yImages.delete(id));
            frameIds.forEach(id => yFrames.delete(id));
        });
    };

    const clearBoard = () => {
        ydoc.transact(() => {
            yPaths.delete(0, yPaths.length);
            yCards.clear();
            yFrames.clear();
            yImages.clear();
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
        yImages.unobserveDeep(syncImages);
        if (provider && typeof provider.destroy === 'function') provider.destroy();
        if (awareness) awareness.destroy();
        if (persistence && typeof persistence.destroy === 'function') persistence.destroy();
        ydoc.destroy();
    };

    return {
        paths,
        cards,
        frames,
        images,
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
        addImage,
        updateImage,
        deleteImage,
        deleteMultiple,
        clearBoard,
        undo
    };
}
