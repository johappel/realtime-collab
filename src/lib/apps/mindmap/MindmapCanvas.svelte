<script lang="ts">
    import { SvelteFlow, Background, Controls, type Node, type Edge } from '@xyflow/svelte';
    import '@xyflow/svelte/dist/style.css';
    import { writable, type Writable } from 'svelte/store';
    import { theme } from '$lib/stores/theme.svelte';
    import { useMindmapYDoc } from './useMindmapYDoc';
    import { onMount, onDestroy } from 'svelte';
    import { loadConfig } from '$lib/config';
    import { getNip07Pubkey, signAndPublishNip07 } from '$lib/nostrUtils';
    import * as Y from 'yjs';
    import { browser } from '$app/environment';
    import EditableNode from './EditableNode.svelte';

    let { 
        documentId, 
        user = { name: 'Anon', color: '#ff0000' },
        mode = 'local'
    } = $props<{
        documentId: string;
        user?: { name: string; color: string };
        mode?: 'local' | 'nostr';
    }>();

    const nodeTypes = {
        editable: EditableNode as any,
        default: EditableNode as any
    };

    // Stores from Yjs (source of truth)
    let nodesStore: Writable<Node[]> = $state(writable([]));
    let edgesStore: Writable<Edge[]> = $state(writable([]));
    
    // Local state for SvelteFlow (UI)
    let nodes = $state<Node[]>([]);
    let edges = $state<Edge[]>([]);

    let yNodes: Y.Map<Node> | null = null;
    let yEdges: Y.Map<Edge> | null = null;
    let cleanup: (() => void) | null = null;

    // Sync flags to prevent loops
    let isUpdatingNodesInternal = false;
    let isUpdatingEdgesInternal = false;

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

        const result = useMindmapYDoc(
            documentId,
            mode,
            user,
            pubkey,
            signAndPublish,
            relays
        );

        nodesStore = result.nodes;
        edgesStore = result.edges;
        yNodes = result.yNodes;
        yEdges = result.yEdges;
        cleanup = result.cleanup;
    });

    // Sync Store -> State (Nodes)
    $effect(() => {
        const unsub = nodesStore.subscribe(n => {
            if (!isUpdatingNodesInternal) {
                // Ensure editable nodes have the min-width class on the wrapper
                nodes = n.map(node => {
                    if ((node.type === 'editable' || node.type === 'default') && !node.class?.includes('min-w-[200px]')) {
                        return { 
                            ...node, 
                            class: (node.class ? node.class + ' ' : '') + 'min-w-[200px]' 
                        };
                    }
                    return node;
                });
            }
        });
        return unsub;
    });

    // Sync State -> Store (Nodes)
    $effect(() => {
        if (nodes && nodesStore) {
            isUpdatingNodesInternal = true;
            nodesStore.set(nodes);
            isUpdatingNodesInternal = false;
        }
    });

    // Sync Store -> State (Edges)
    $effect(() => {
        const unsub = edgesStore.subscribe(e => {
            if (!isUpdatingEdgesInternal) {
                edges = e;
            }
        });
        return unsub;
    });

    // Sync State -> Store (Edges)
    $effect(() => {
        if (edges && edgesStore) {
            isUpdatingEdgesInternal = true;
            edgesStore.set(edges);
            isUpdatingEdgesInternal = false;
        }
    });

    onDestroy(() => {
        if (cleanup) cleanup();
    });
    
    function addNode() {
        if (!yNodes) return;
        const id = crypto.randomUUID();
        const newNode: Node = {
            id,
            type: 'editable', // Changed to 'editable'
            data: { label: 'New Node', content: '' },
            position: { x: Math.random() * 400, y: Math.random() * 400 },
            class: 'min-w-[200px]'
        };
        // Update local state, effect will sync to store
        nodes = [...nodes, newNode];
    }
</script>

<div style="height: 100%; width: 100%; position: relative;">
    {#if browser}
    <SvelteFlow 
        bind:nodes={nodes} 
        bind:edges={edges} 
        {nodeTypes}
        fitView
        class="h-full w-full"
        colorMode={theme.isDark ? 'dark' : 'light'}
    >
        <Background />
        <Controls />
    </SvelteFlow>
    {/if}
    
    <div class="absolute top-4 right-4 z-10">
        <button 
            class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow"
            onclick={addNode}
        >
            Add Node
        </button>
    </div>
</div>
