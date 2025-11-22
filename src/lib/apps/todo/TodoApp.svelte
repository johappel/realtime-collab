<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import { writable, type Writable } from "svelte/store";
    import { useTodoYDoc, type TodoItem } from "./useTodoYDoc";
    import { loadConfig } from "$lib/config";
    import { getNip07Pubkey, signAndPublishNip07 } from "$lib/nostrUtils";
    import { theme } from "$lib/stores/theme.svelte";
    import { dndzone, type DndEvent } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import { Calendar, User, X } from "lucide-svelte";
    import * as Y from "yjs";
    import { browser } from "$app/environment";

    let {
        documentId,
        user = { name: "Anon", color: "#ff0000" },
        mode = "local",
        title = $bindable(""),
        awareness = $bindable(null),
    } = $props<{
        documentId: string;
        user?: { name: string; color: string };
        mode?: "local" | "nostr" | "group";
        title?: string;
        awareness?: any;
    }>();

    let items: Writable<TodoItem[]> = $state(writable([]));
    let localItems = $state<TodoItem[]>([]);
    let isDragging = $state(false);
    let cleanup: (() => void) | null = null;
    let actions: any = {};
    let ydoc: Y.Doc | null = $state(null);

    onMount(async () => {
        let pubkey = "";
        let relays: string[] = [];
        let signAndPublish: any = null;

        if (mode === "nostr") {
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
            relays,
        );

        items = result.items;
        ydoc = result.ydoc;
        awareness = result.awareness;
        cleanup = result.cleanup;
        actions = {
            addItem: result.addItem,
            toggleItem: result.toggleItem,
            deleteItem: result.deleteItem,
            updateItemText: result.updateItemText,
            reorderItems: result.reorderItems,
            assignUser: result.assignUser,
            setDueDate: result.setDueDate,
        };

        // Title Sync Logic
        const metaMap = ydoc.getMap("metadata");

        const handleMetaUpdate = (event: Y.YMapEvent<any>) => {
            if (event.transaction.local) return;
            const storedTitle = metaMap.get("todo-title") as string;
            if (storedTitle !== undefined && storedTitle !== title) {
                title = storedTitle;
            }
        };

        metaMap.observe(handleMetaUpdate);

        // Initial sync
        const storedTitle = metaMap.get("todo-title") as string;
        untrack(() => {
            if (storedTitle !== undefined && storedTitle !== title) {
                title = storedTitle;
            } else if (
                storedTitle === undefined &&
                title &&
                title !== documentId
            ) {
                metaMap.set("todo-title", title);
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
        const storedTitle = metaMap.get("todo-title") as string;

        if (title && title !== storedTitle) {
            metaMap.set("todo-title", title);
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

    export function addItem(text: string) {
        if (text.trim() && actions?.addItem) {
            actions.addItem(text.trim());
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
            actions.reorderItems(localItems.map((i) => i.id));
        }
    }

    function autoResize(el: HTMLTextAreaElement) {
        const resize = () => {
            el.style.height = "auto";
            el.style.height = el.scrollHeight + "px";
        };
        el.addEventListener("input", resize);
        // Initial resize
        setTimeout(resize, 0);

        return {
            destroy() {
                el.removeEventListener("input", resize);
            },
        };
    }

    function toggleAssign(item: TodoItem) {
        if (item.assignee && item.assignee.name === user.name) {
            actions.assignUser(item.id, null);
        } else {
            actions.assignUser(item.id, user);
        }
    }

    function handleDateChange(id: string, e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.value) {
            actions.setDueDate(id, new Date(input.value).getTime());
        } else {
            actions.setDueDate(id, null);
        }
    }

    function openDatePicker(e: MouseEvent) {
        const target = e.currentTarget as HTMLElement;
        const input = target.querySelector(
            'input[type="date"]',
        ) as HTMLInputElement;
        if (input) {
            try {
                input.showPicker();
            } catch (err) {
                console.warn("showPicker not supported", err);
            }
        }
    }
</script>

<div class="max-w-2xl mx-auto p-6">
    {#if browser}
        <div
            class="space-y-2"
            use:dndzone={{
                items: localItems,
                flipDurationMs: 300,
                dropTargetStyle: {},
            }}
            onconsider={handleDndConsider}
            onfinalize={handleDndFinalize}
        >
            {#each localItems as item (item.id)}
                <div
                    animate:flip={{ duration: 300 }}
                    class="flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 group"
                >
                    <div class="flex items-start gap-3 p-3">
                        <div
                            class="text-gray-400 dark:text-gray-600 cursor-grab active:cursor-grabbing mt-1.5"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><circle cx="9" cy="12" r="1" /><circle
                                    cx="9"
                                    cy="5"
                                    r="1"
                                /><circle cx="9" cy="19" r="1" /><circle
                                    cx="15"
                                    cy="12"
                                    r="1"
                                /><circle cx="15" cy="5" r="1" /><circle
                                    cx="15"
                                    cy="19"
                                    r="1"
                                /></svg
                            >
                        </div>
                        <input
                            type="checkbox"
                            checked={item.completed}
                            onchange={() => actions.toggleItem(item.id)}
                            class="w-5 h-5 mt-1.5 text-blue-600 rounded focus:ring-blue-500"
                        />

                        <textarea
                            use:autoResize
                            value={item.text}
                            oninput={(e) =>
                                actions.updateItemText(
                                    item.id,
                                    e.currentTarget.value,
                                )}
                            rows="1"
                            class="flex-1 bg-transparent border-none focus:ring-0 p-0 text-lg resize-none overflow-hidden {item.completed
                                ? 'line-through text-gray-400 dark:text-gray-500'
                                : 'text-gray-900 dark:text-gray-100'}"
                        ></textarea>

                        <button
                            onclick={() => actions.deleteItem(item.id)}
                            class="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                            aria-label="Delete task"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><path d="M3 6h18" /><path
                                    d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                                /><path
                                    d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                                /></svg
                            >
                        </button>
                    </div>

                    <!-- Metadata Row -->
                    <div
                        class="flex items-center gap-4 px-3 pb-2 pl-11 text-sm text-gray-500"
                    >
                        <!-- Assignee -->
                        <button
                            class="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                            onclick={() => toggleAssign(item)}
                            title={item.assignee
                                ? `Assigned to ${item.assignee.name}`
                                : "Assign to me"}
                        >
                            {#if item.assignee}
                                <div
                                    class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold"
                                    style="background-color: {item.assignee
                                        .color}"
                                >
                                    {item.assignee.name[0].toUpperCase()}
                                </div>
                                <span>{item.assignee.name}</span>
                            {:else}
                                <User size={14} />
                                <span>Assign</span>
                            {/if}
                        </button>

                        <!-- Due Date -->
                        <div class="flex items-center gap-1.5 group/date">
                            <button
                                class="flex items-center gap-1.5 hover:text-blue-600 transition-colors relative"
                                onclick={openDatePicker}
                                title="Set due date"
                            >
                                <Calendar
                                    size={14}
                                    class={item.dueDate ? "text-blue-600" : ""}
                                />
                                <span
                                    class={item.dueDate ? "text-blue-600" : ""}
                                >
                                    {item.dueDate
                                        ? new Date(
                                              item.dueDate,
                                          ).toLocaleDateString(undefined, {
                                              timeZone: "UTC",
                                          })
                                        : "Due Date"}
                                </span>
                                <input
                                    type="date"
                                    class="absolute opacity-0 w-1 h-1 -z-10 bottom-0 left-0"
                                    value={item.dueDate
                                        ? new Date(item.dueDate)
                                              .toISOString()
                                              .split("T")[0]
                                        : ""}
                                    onchange={(e) =>
                                        handleDateChange(item.id, e)}
                                    onclick={(e) => e.stopPropagation()}
                                />
                            </button>
                            {#if item.dueDate}
                                <button
                                    class="hover:text-red-500"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        actions.setDueDate(item.id, null);
                                    }}
                                    title="Clear date"
                                >
                                    <X size={12} />
                                </button>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}

            {#if localItems.length === 0}
                <div class="text-center text-gray-500 dark:text-gray-400 py-10">
                    No tasks yet. Start by adding one!
                </div>
            {/if}
        </div>
    {/if}
</div>
