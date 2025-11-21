<script lang="ts">
    import { SvelteFlow, Background, Controls, type Node, type Edge, Position } from '@xyflow/svelte';
    import '@xyflow/svelte/dist/style.css';
    import { writable, type Writable } from 'svelte/store';
    import { theme } from '$lib/stores/theme.svelte';
    import { useMindmapYDoc } from './useMindmapYDoc';
    import { onMount, onDestroy, untrack } from 'svelte';
    import { loadConfig } from '$lib/config';
    import { getNip07Pubkey, signAndPublishNip07 } from '$lib/nostrUtils';
    import * as Y from 'yjs';
    import { browser } from '$app/environment';
    import EditableNode from './EditableNode.svelte';
    import { Trash2 } from 'lucide-svelte';

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

    const colors = [
        { color: '', label: 'Default' },
        { color: '#ffcdd2', label: 'Red' },
        { color: '#bbdefb', label: 'Blue' },
        { color: '#c8e6c9', label: 'Green' },
        { color: '#fff9c4', label: 'Yellow' },
        { color: '#e1bee7', label: 'Purple' },
    ];

    // Stores from Yjs (source of truth)
    let nodesStore: Writable<Node[]> = $state(writable([]));
    let edgesStore: Writable<Edge[]> = $state(writable([]));
    let layoutStore: Writable<'horizontal' | 'vertical'> = $state(writable('vertical'));
    
    // Local state for SvelteFlow (UI)
    let nodes = $state<Node[]>([]);
    let edges = $state<Edge[]>([]);
    let layout = $state<'horizontal' | 'vertical'>('vertical');

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
        layoutStore = result.layout;
        yNodes = result.yNodes;
        yEdges = result.yEdges;
        cleanup = result.cleanup;
    });

    // Sync Store -> State (Layout)
    $effect(() => {
        const unsub = layoutStore.subscribe(l => {
            layout = l;
            // Update node handles when layout changes
            const currentNodes = untrack(() => nodes);
            if (currentNodes.length > 0) {
                nodes = currentNodes.map(n => ({
                    ...n,
                    sourcePosition: l === 'horizontal' ? Position.Right : Position.Bottom,
                    targetPosition: l === 'horizontal' ? Position.Left : Position.Top
                }));
            }
        });
        return unsub;
    });

    // Sync Store -> State (Nodes)
    $effect(() => {
        const unsub = nodesStore.subscribe(n => {
            if (!isUpdatingNodesInternal) {
                // Ensure editable nodes have the min-width class on the wrapper
                // And ensure correct handle positions based on current layout
                const currentLayout = untrack(() => layout);
                nodes = n.map(node => {
                    let updated = node;
                    
                    // Min-width check
                    if ((node.type === 'editable' || node.type === 'default') && !node.class?.includes('min-w-[200px]')) {
                        updated = { 
                            ...updated, 
                            class: (updated.class ? updated.class + ' ' : '') + 'min-w-[200px]' 
                        };
                    }

                    // Handle position check
                    const targetSource = currentLayout === 'horizontal' ? Position.Right : Position.Bottom;
                    const targetTarget = currentLayout === 'horizontal' ? Position.Left : Position.Top;

                    if (updated.sourcePosition !== targetSource || updated.targetPosition !== targetTarget) {
                        updated = {
                            ...updated,
                            sourcePosition: targetSource,
                            targetPosition: targetTarget
                        };
                    }

                    return updated;
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
    
    function addNode(parentId?: string) {
        if (!yNodes) return;
        const id = crypto.randomUUID();
        
        let position = { x: Math.random() * 400, y: Math.random() * 400 };
        
        // If parent exists, place new node relative to it
        if (parentId) {
            const parent = nodes.find(n => n.id === parentId);
            if (parent) {
                if (layout === 'horizontal') {
                    // Place to the right
                    position = { 
                        x: parent.position.x + 300, 
                        y: parent.position.y + (Math.random() - 0.5) * 100 
                    };
                } else {
                    // Place below
                    position = { 
                        x: parent.position.x + (Math.random() - 0.5) * 100, 
                        y: parent.position.y + 150 
                    };
                }
            }
        }

        const newNode: Node = {
            id,
            type: 'editable',
            data: { label: 'New Node', content: '', initialFocus: true },
            position,
            class: 'min-w-[200px]',
            selected: true,
            sourcePosition: layout === 'horizontal' ? Position.Right : Position.Bottom,
            targetPosition: layout === 'horizontal' ? Position.Left : Position.Top
        };

        // Update local state: Deselect others and add new node
        nodes = nodes.map(n => ({ ...n, selected: false }));
        nodes = [...nodes, newNode];

        // Create edge if parent exists
        if (parentId) {
            const newEdge: Edge = {
                id: crypto.randomUUID(),
                source: parentId,
                target: id,
                type: 'default' // 'smoothstep' or 'bezier' might be better for horizontal
            };
            edges = [...edges, newEdge];
        }
    }

    function toggleLayout() {
        const newLayout = layout === 'vertical' ? 'horizontal' : 'vertical';
        layoutStore.set(newLayout);
    }

    function handleKeyDown(event: KeyboardEvent) {
        const isInput = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

        if (event.key === 'Insert') {
            // Always allow Insert, even in inputs
            event.preventDefault();
            const selectedNode = nodes.find(n => n.selected);
            addNode(selectedNode?.id);
            return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            if (isInput) return; // Allow deleting text in inputs
            
            // Manually handle deletion of selected nodes/edges
            const hasSelection = nodes.some(n => n.selected) || edges.some(e => e.selected);
            if (hasSelection) {
                event.preventDefault();
                nodes = nodes.filter(n => !n.selected);
                edges = edges.filter(e => !e.selected);
            }
        }
    }

    function deleteSelected() {
        const hasSelection = nodes.some(n => n.selected) || edges.some(e => e.selected);
        if (hasSelection) {
            nodes = nodes.filter(n => !n.selected);
            edges = edges.filter(e => !e.selected);
        }
    }

    function setColor(color: string) {
        nodes = nodes.map(n => {
            if (n.selected) {
                return {
                    ...n,
                    data: { ...n.data, color }
                };
            }
            return n;
        });
    }

    // Derived state for UI
    let selectedNodes = $derived(nodes.filter(n => n.selected));
    let hasSelection = $derived(selectedNodes.length > 0 || edges.some(e => e.selected));
</script>

<svelte:window onkeydown={handleKeyDown} />

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
    
    <div class="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
        <div class="flex gap-2">
            {#if hasSelection}
                <div class="flex bg-white dark:bg-gray-800 rounded shadow border border-gray-300 dark:border-gray-600 p-1 gap-1 mr-2 items-center">
                    {#each colors as c}
                        <button
                            class="w-6 h-6 rounded-full border border-gray-200 dark:border-gray-600 hover:scale-110 transition-transform"
                            style="background-color: {c.color || (theme.isDark ? '#1f2937' : '#ffffff')}"
                            title={c.label}
                            onclick={() => setColor(c.color)}
                        >
                            {#if !c.color}
                                <span class="block text-[10px] text-center leading-5 text-gray-500">/</span>
                            {/if}
                        </button>
                    {/each}
                    <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                    <button 
                        class="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded"
                        onclick={deleteSelected}
                        title="Löschen"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            {/if}

            <button 
                class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 px-3 py-2 rounded shadow text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onclick={toggleLayout}
                title="Layout umschalten"
            >
                {layout === 'vertical' ? '↕ Vertical' : '↔ Horizontal'}
            </button>

            <button 
                class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow"
                onclick={() => addNode()}
            >
                Add Node
            </button>
        </div>
    </div>
</div>

<style>
    :global(.svelte-flow__edge-path) {
        stroke-width: 3px;
    }
</style>
