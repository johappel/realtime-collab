import * as Y from 'yjs';
import { useNostrYDoc } from '$lib/useNostrYDoc';
import { useLocalYDoc } from '$lib/useLocalYDoc';
import type { Node, Edge } from '@xyflow/svelte';
import { writable, type Writable } from 'svelte/store';

export interface UseMindmapYDocResult {
    nodes: Writable<Node[]>;
    edges: Writable<Edge[]>;
    layout: Writable<'horizontal' | 'vertical'>;
    yNodes: Y.Map<Node>;
    yEdges: Y.Map<Edge>;
    ydoc: Y.Doc;
    provider: any;
    awareness: any;
    cleanup: () => void;
}

export function useMindmapYDoc(
    documentId: string,
    mode: 'local' | 'nostr' | 'group',
    user: { name: string; color: string },
    myPubkey?: string,
    signAndPublish?: (evt: any) => Promise<any>,
    relays?: string[]
): UseMindmapYDocResult {
    let ydoc: Y.Doc;
    let provider: any;
    let awareness: any;
    let persistence: any;

    if ((mode === 'nostr' || mode === 'group') && myPubkey && signAndPublish) {
        // In group mode, use user.name as identifier to ensure unique clientID per user
        const userIdentifier = mode === 'group' ? user.name : undefined;
        const isGroupMode = mode === 'group';
        // Prefix documentId with app type to separate awareness between apps
        const appDocumentId = `mindmap:${documentId}`;
        const result = useNostrYDoc(appDocumentId, myPubkey, signAndPublish, false, relays, userIdentifier, isGroupMode);
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

    // Yjs Data Structures
    const yNodes = ydoc.getMap<Node>('mindmap-nodes');
    const yEdges = ydoc.getMap<Edge>('mindmap-edges');
    const ySettings = ydoc.getMap<any>('mindmap-settings');

    // Svelte Stores for UI
    const nodes = writable<Node[]>(Array.from(yNodes.values()));
    const edges = writable<Edge[]>(Array.from(yEdges.values()));
    const layout = writable<'horizontal' | 'vertical'>(ySettings.get('layout') || 'vertical');

    let isRemoteUpdate = false;

    // Sync Yjs -> Svelte Stores
    const handleNodesUpdate = () => {
        isRemoteUpdate = true;
        nodes.set(Array.from(yNodes.values()));
        isRemoteUpdate = false;
    };
    const handleEdgesUpdate = () => {
        isRemoteUpdate = true;
        edges.set(Array.from(yEdges.values()));
        isRemoteUpdate = false;
    };
    const handleSettingsUpdate = () => {
        const l = ySettings.get('layout');
        if (l && l !== 'undefined') {
            layout.set(l);
        }
    };

    yNodes.observe(handleNodesUpdate);
    yEdges.observe(handleEdgesUpdate);
    ySettings.observe(handleSettingsUpdate);

    // Sync Svelte Stores -> Yjs
    const unsubscribeNodes = nodes.subscribe((currentNodes) => {
        if (isRemoteUpdate) return;
        
        ydoc.transact(() => {
            // Diffing: Update or Add
            currentNodes.forEach(node => {
                const existing = yNodes.get(node.id);
                // Simple equality check to avoid unnecessary updates
                // JSON.stringify is expensive but safe for deep comparison
                if (!existing || JSON.stringify(existing) !== JSON.stringify(node)) {
                    yNodes.set(node.id, node);
                }
            });

            // Diffing: Remove
            const currentIds = new Set(currentNodes.map(n => n.id));
            Array.from(yNodes.keys()).forEach(id => {
                if (!currentIds.has(id)) {
                    yNodes.delete(id);
                }
            });
        });
    });

    const unsubscribeEdges = edges.subscribe((currentEdges) => {
        if (isRemoteUpdate) return;

        ydoc.transact(() => {
            currentEdges.forEach(edge => {
                const existing = yEdges.get(edge.id);
                if (!existing || JSON.stringify(existing) !== JSON.stringify(edge)) {
                    yEdges.set(edge.id, edge);
                }
            });

            const currentIds = new Set(currentEdges.map(e => e.id));
            Array.from(yEdges.keys()).forEach(id => {
                if (!currentIds.has(id)) {
                    yEdges.delete(id);
                }
            });
        });
    });

    const unsubscribeLayout = layout.subscribe((l) => {
        if (ySettings.get('layout') !== l) {
            ySettings.set('layout', l);
        }
    });

    // Initial load
    handleNodesUpdate();
    handleEdgesUpdate();
    handleSettingsUpdate();

    const cleanup = () => {
        yNodes.unobserve(handleNodesUpdate);
        yEdges.unobserve(handleEdgesUpdate);
        ySettings.unobserve(handleSettingsUpdate);
        unsubscribeNodes();
        unsubscribeEdges();
        unsubscribeLayout();
        if (provider && typeof provider.destroy === 'function') provider.destroy();
        if (awareness) awareness.destroy();
        if (persistence && typeof persistence.destroy === 'function') persistence.destroy();
        ydoc.destroy();
    };

    return {
        nodes,
        edges,
        layout,
        yNodes,
        yEdges,
        ydoc,
        provider,
        awareness,
        cleanup
    };
}
