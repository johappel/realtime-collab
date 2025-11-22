<script lang="ts">
    import {
        SvelteFlow,
        Background,
        Controls,
        type Node,
        type Edge,
        Position,
    } from "@xyflow/svelte";
    import "@xyflow/svelte/dist/style.css";
    import { writable, type Writable } from "svelte/store";
    import { theme } from "$lib/stores/theme.svelte";
    import { useMindmapYDoc } from "./useMindmapYDoc";
    import { onMount, onDestroy, untrack } from "svelte";
    import { loadConfig } from "$lib/config";
    import { getNip07Pubkey, signAndPublishNip07 } from "$lib/nostrUtils";
    import * as Y from "yjs";
    import { browser } from "$app/environment";
    import EditableNode from "./EditableNode.svelte";
    import { Trash2 } from "lucide-svelte";
    import { resizeImage } from "$lib/imageUtils";
    import { encryptFile, arrayBufferToHex } from "$lib/cryptoUtils";
    import { uploadFile } from "$lib/blossomClient";
    import { appState } from "$lib/stores/appState.svelte";

    let {
        documentId,
        user = { name: "Anon", color: "#ff0000" },
        mode = "local",
        toolbarState = $bindable({
            hasSelection: false,
            layout: "vertical" as "vertical" | "horizontal",
        }),
        title = $bindable(""),
        awareness = $bindable(null),
    } = $props<{
        documentId: string;
        user?: { name: string; color: string };
        mode?: "local" | "nostr" | "group";
        toolbarState?: {
            hasSelection: boolean;
            layout: "vertical" | "horizontal";
        };
        title?: string;
        awareness?: any;
    }>();

    export const colors = [
        { color: "", label: "Default" },
        { color: "#ffcdd2", label: "Red" },
        { color: "#bbdefb", label: "Blue" },
        { color: "#c8e6c9", label: "Green" },
        { color: "#fff9c4", label: "Yellow" },
        { color: "#e1bee7", label: "Purple" },
    ];

    const nodeTypes = {
        editable: EditableNode as any,
        default: EditableNode as any,
    };

    // Stores from Yjs (source of truth)
    let nodesStore: Writable<Node[]> = $state(writable([]));
    let edgesStore: Writable<Edge[]> = $state(writable([]));
    let layoutStore: Writable<"horizontal" | "vertical"> = $state(
        writable("vertical"),
    );

    // Local state for SvelteFlow (UI)
    let nodes = $state<Node[]>([]);
    let edges = $state<Edge[]>([]);
    let layout = $state<"horizontal" | "vertical">("vertical");

    let yNodes: Y.Map<Node> | null = null;
    let yEdges: Y.Map<Edge> | null = null;
    let ydoc: Y.Doc | null = $state(null);
    let cleanup: (() => void) | null = null;

    // Sync flags to prevent loops
    let isUpdatingNodesInternal = false;
    let isUpdatingEdgesInternal = false;

    onMount(async () => {
        let pubkey = "";
        let relays: string[] = [];
        let signAndPublish: any = null;

        if (mode === "nostr" || mode === "group") {
            try {
                const config = await loadConfig();
                relays = config.docRelays;

                if (mode === "group") {
                    // Group mode: use private key from appState
                    const { appState } = await import("$lib/stores/appState.svelte");
                    const { signWithPrivateKey } = await import("$lib/groupAuth");
                    const { getPubkeyFromPrivateKey } = await import("$lib/groupAuth");

                    // CRITICAL: Wait for group initialization to complete
                    await appState.ensureInitialized();

                    if (!appState.groupPrivateKey) {
                        console.error("No group private key found");
                        return;
                    }

                    pubkey = getPubkeyFromPrivateKey(appState.groupPrivateKey);
                    signAndPublish = (evt: any) =>
                        signWithPrivateKey(evt, appState.groupPrivateKey!, relays);
                } else {
                    // Nostr mode: use NIP-07
                    pubkey = await getNip07Pubkey();
                    signAndPublish = (evt: any) => signAndPublishNip07(evt, relays);
                }
            } catch (e) {
                console.error("Failed to init Nostr/Group:", e);
            }
        }

        const result = useMindmapYDoc(
            documentId,
            mode,
            user,
            pubkey,
            signAndPublish,
            relays,
        );

        nodesStore = result.nodes;
        edgesStore = result.edges;
        layoutStore = result.layout;
        yNodes = result.yNodes;
        yEdges = result.yEdges;
        ydoc = result.ydoc;
        awareness = result.awareness;
        cleanup = result.cleanup;

        // Title Sync Logic
        const metaMap = ydoc.getMap("metadata");

        const handleMetaUpdate = (event: Y.YMapEvent<any>) => {
            if (event.transaction.local) return;
            const storedTitle = metaMap.get("mindmap-title") as string;
            if (storedTitle !== undefined && storedTitle !== title) {
                title = storedTitle;
            }
        };

        metaMap.observe(handleMetaUpdate);

        // Initial sync
        const storedTitle = metaMap.get("mindmap-title") as string;
        untrack(() => {
            if (storedTitle !== undefined && storedTitle !== title) {
                title = storedTitle;
            } else if (
                storedTitle === undefined &&
                title &&
                title !== documentId
            ) {
                metaMap.set("mindmap-title", title);
            }
        });

        // Wrap cleanup to include unobserve
        const originalCleanup = cleanup;
        cleanup = () => {
            metaMap.unobserve(handleMetaUpdate);
            if (originalCleanup) originalCleanup();
        };
    });

    // Write title changes to Yjs
    $effect(() => {
        if (!ydoc) return;
        const metaMap = ydoc.getMap("metadata");
        const storedTitle = metaMap.get("mindmap-title") as string;

        if (title && title !== storedTitle) {
            metaMap.set("mindmap-title", title);
        }
    });

    // Sync user state with awareness
    $effect(() => {
        if (awareness && user) {
            const currentState = awareness.getLocalState() as any;
            const newUser = {
                name: user.name,
                color: user.color,
            };

            if (
                !currentState ||
                currentState.user?.name !== newUser.name ||
                currentState.user?.color !== newUser.color
            ) {
                awareness.setLocalStateField("user", newUser);
            }
        }
    });

    // Sync Store -> State (Layout)
    $effect(() => {
        const unsub = layoutStore.subscribe((l) => {
            layout = l;
            // Update node handles when layout changes
            const currentNodes = untrack(() => nodes);
            if (currentNodes.length > 0) {
                nodes = currentNodes.map((n) => ({
                    ...n,
                    sourcePosition:
                        l === "horizontal" ? Position.Right : Position.Bottom,
                    targetPosition:
                        l === "horizontal" ? Position.Left : Position.Top,
                }));
            }
        });
        return unsub;
    });

    // Sync Store -> State (Nodes)
    $effect(() => {
        const unsub = nodesStore.subscribe((n) => {
            if (!isUpdatingNodesInternal) {
                // Ensure editable nodes have the min-width class on the wrapper
                // And ensure correct handle positions based on current layout
                const currentLayout = untrack(() => layout);
                nodes = n.map((node) => {
                    let updated = node;

                    // Min-width check
                    if (
                        (node.type === "editable" || node.type === "default") &&
                        !node.class?.includes("min-w-[200px]")
                    ) {
                        updated = {
                            ...updated,
                            class:
                                (updated.class ? updated.class + " " : "") +
                                "min-w-[200px]",
                        };
                    }

                    // Handle position check
                    const targetSource =
                        currentLayout === "horizontal"
                            ? Position.Right
                            : Position.Bottom;
                    const targetTarget =
                        currentLayout === "horizontal"
                            ? Position.Left
                            : Position.Top;

                    if (
                        updated.sourcePosition !== targetSource ||
                        updated.targetPosition !== targetTarget
                    ) {
                        updated = {
                            ...updated,
                            sourcePosition: targetSource,
                            targetPosition: targetTarget,
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
        const unsub = edgesStore.subscribe((e) => {
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

        let position = { x: Math.random() * 400, y: Math.random() * 400 };

        // If parent exists, place new node relative to it
        if (parentId) {
            const parent = nodes.find((n) => n.id === parentId);
            if (parent) {
                if (layout === "horizontal") {
                    // Place to the right
                    position = {
                        x: parent.position.x + 300,
                        y: parent.position.y + (Math.random() - 0.5) * 100,
                    };
                } else {
                    // Place below
                    position = {
                        x: parent.position.x + (Math.random() - 0.5) * 100,
                        y: parent.position.y + 150,
                    };
                }
            }
        }

        createNode(position, parentId);
    }

    function addSiblingNode(node: Node) {
        if (!yNodes) return;

        // Calculate vertical offset based on node height
        // Use measured height if available (from SvelteFlow), otherwise fallback
        const currentHeight = node.measured?.height ?? 80;
        const gap = 10; // Small gap between nodes

        // Find parent
        const parentEdge = edges.find((e) => e.target === node.id);

        // Position relative to the CURRENT node (the sibling)
        // We place it directly below the current node
        const position = {
            x: node.position.x,
            y: node.position.y + currentHeight + gap,
        };

        if (!parentEdge) {
            // No parent? Just add a node below it
            createNode(position);
            return;
        }

        const parentId = parentEdge.source;
        createNode(position, parentId);
    }

    function createNode(position: { x: number; y: number }, parentId?: string) {
        const id = crypto.randomUUID();

        const newNode: Node = {
            id,
            type: "editable",
            data: { label: "New Node", content: "", initialFocus: true },
            position,
            class: "min-w-[200px]",
            selected: true,
            sourcePosition:
                layout === "horizontal" ? Position.Right : Position.Bottom,
            targetPosition:
                layout === "horizontal" ? Position.Left : Position.Top,
        };

        // Update local state: Deselect others and add new node
        nodes = nodes.map((n) => ({ ...n, selected: false }));
        nodes = [...nodes, newNode];

        // Create edge if parent exists
        if (parentId) {
            const newEdge: Edge = {
                id: crypto.randomUUID(),
                source: parentId,
                target: id,
                type: "default",
            };
            edges = [...edges, newEdge];
        }
    }

    function toggleLayout() {
        const newLayout = layout === "vertical" ? "horizontal" : "vertical";
        layoutStore.set(newLayout);
    }

    function handleKeyDown(event: KeyboardEvent) {
        const isInput =
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement;

        if (event.key === "Insert") {
            // Always allow Insert, even in inputs
            event.preventDefault();
            const selectedNode = nodes.find((n) => n.selected);

            if (event.ctrlKey && selectedNode) {
                // Add Sibling
                addSiblingNode(selectedNode);
            } else {
                // Add Child (existing behavior)
                addNode(selectedNode?.id);
            }
            return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
            if (isInput) return; // Allow deleting text in inputs

            // Manually handle deletion of selected nodes/edges
            const hasSelection =
                nodes.some((n) => n.selected) || edges.some((e) => e.selected);
            if (hasSelection) {
                event.preventDefault();
                nodes = nodes.filter((n) => !n.selected);
                edges = edges.filter((e) => !e.selected);
            }
        }
    }

    function deleteSelected() {
        const hasSelection =
            nodes.some((n) => n.selected) || edges.some((e) => e.selected);
        if (hasSelection) {
            nodes = nodes.filter((n) => !n.selected);
            edges = edges.filter((e) => !e.selected);
        }
    }

    function setColor(color: string) {
        nodes = nodes.map((n) => {
            if (n.selected) {
                return {
                    ...n,
                    data: { ...n.data, color },
                };
            }
            return n;
        });
    }

    // Derived state for UI
    let selectedNodes = $derived(nodes.filter((n) => n.selected));
    let hasSelection = $derived(
        selectedNodes.length > 0 || edges.some((e) => e.selected),
    );

    $effect(() => {
        toolbarState.hasSelection = hasSelection;
        toolbarState.layout = layout;
    });

    export function addNodePublic(parentId?: string) {
        if (parentId) {
            addNode(parentId);
        } else {
            const selectedNode = nodes.find((n) => n.selected);
            addNode(selectedNode?.id);
        }
    }

    export function toggleLayoutPublic() {
        toggleLayout();
    }

    export function deleteSelectedPublic() {
        deleteSelected();
    }

    export function setColorPublic(color: string) {
        setColor(color);
    }

    export async function uploadImageToSelected() {
        const selectedNode = nodes.find((n) => n.selected);
        if (!selectedNode) {
            alert("Bitte wähle zuerst eine Node aus");
            return;
        }

        // Create hidden file input
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";

        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;

            const key = appState.groupPrivateKey;
            if (!key) {
                alert("Fehler: Kein Gruppen-Key gefunden.");
                return;
            }

            try {
                // 1. Resize image to max 800x800px
                const resizedBlob = await resizeImage(file, 800, 800);

                // 2. Encrypt
                const { encryptedBlob, iv } = await encryptFile(
                    resizedBlob,
                    key,
                );
                const ivHex = arrayBufferToHex(iv.buffer as ArrayBuffer);

                // 3. Upload to Blossom
                const config = await loadConfig();
                const result = await uploadFile(
                    encryptedBlob,
                    key,
                    config.blossomServer || "https://cdn.satellite.earth",
                    config.blossomRequireAuth ?? false,
                );

                // 4. Update node data
                nodes = nodes.map((n) => {
                    if (n.id === selectedNode.id) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                imageUrl: result.url,
                                imageIv: ivHex,
                                imageMimeType: file.type,
                            },
                        };
                    }
                    return n;
                });

                console.log("Image uploaded successfully:", result.url);
            } catch (e) {
                console.error("Image upload failed:", e);
                alert(
                    `Upload fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
                );
            }
        };

        input.click();
    }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div style="height: 100%; width: 100%; position: relative;">
    {#if browser}
        <SvelteFlow
            bind:nodes
            bind:edges
            {nodeTypes}
            fitView
            class="h-full w-full"
            colorMode={theme.isDark ? "dark" : "light"}
        >
            <Background />
            <Controls />
        </SvelteFlow>
    {/if}
</div>

<style>
    :global(.svelte-flow__edge-path) {
        stroke-width: 3px;
    }
</style>
