<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import { writable, type Writable } from "svelte/store";
    import {
        usePollYDoc,
        type PollOption,
        type PollSettings,
    } from "./usePollYDoc";
    import { loadConfig } from "$lib/config";
    import { getNip07Pubkey, signAndPublishNip07 } from "$lib/nostrUtils";
    import { theme } from "$lib/stores/theme.svelte";
    import * as Y from "yjs";
    import MarkdownText from "./MarkdownText.svelte";

    let {
        documentId,
        user = { name: "Anon", color: "#ff0000" },
        mode = "local",
        title = $bindable(""),
        awareness = $bindable(null),
        settings = $bindable(
            writable({
                allowUserOptions: false,
                anonymous: false,
                multiSelect: false,
            }),
        ),
    } = $props<{
        documentId: string;
        user?: { name: string; color: string };
        mode?: "local" | "nostr" | "group";
        title?: string;
        awareness?: any;
        settings?: Writable<PollSettings>;
    }>();

    let question: Writable<string> = $state(writable(""));
    let options: Writable<PollOption[]> = $state(writable([]));
    // let settings: Writable<PollSettings> = $state(writable(...)); // Now passed as prop or initialized below if not passed?
    // Actually, usePollYDoc returns the store. We should probably sync the prop with the internal store or just use the internal one and expose it.
    // Since usePollYDoc creates the store linked to Yjs, we should use THAT store.
    // But we want to bind it to the parent.
    // Let's initialize a local reference and sync it or just let the parent bind to the one we get from usePollYDoc.

    let cleanup: (() => void) | null = null;
    let actions: any = {};
    let myUserId = $state("");
    let ydoc: Y.Doc | null = $state(null);

    // Local state for new option input
    let newOptionText = $state("");

    export function updateSettings(newSettings: Partial<PollSettings>) {
        actions.updateSettings(newSettings);
    }

    export function resetVotes() {
        actions.resetVotes();
    }

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
                    console.log('[PollApp] Waiting for group initialization...');
                    await appState.ensureInitialized();
                    console.log('[PollApp] Group initialized, user:', appState.user.name);

                    if (!appState.groupPrivateKey) {
                        console.error("[PollApp] No group private key found after init");
                        return;
                    }

                    pubkey = getPubkeyFromPrivateKey(appState.groupPrivateKey);
                    signAndPublish = (evt: any) =>
                        signWithPrivateKey(evt, appState.groupPrivateKey!, relays);
                    myUserId = pubkey;
                } else {
                    // Nostr mode: use NIP-07
                    pubkey = await getNip07Pubkey();
                    signAndPublish = (evt: any) => signAndPublishNip07(evt, relays);
                    myUserId = pubkey;
                }
            } catch (e) {
                console.error("Failed to init Nostr/Group:", e);
                myUserId = "anon-" + Math.random().toString(36).substr(2, 9);
            }
        } else {
            // Local mode ID
            myUserId = "local-" + Math.random().toString(36).substr(2, 9);
        }

        const result = usePollYDoc(
            documentId,
            mode,
            user,
            pubkey,
            signAndPublish,
            relays,
        );

        question = result.question;
        options = result.options;
        settings = result.settings; // This overwrites the prop reference if we aren't careful.
        // Svelte 5 bindable props are signals. If we assign to `settings`, we update the parent.
        // Perfect.

        cleanup = result.cleanup;
        ydoc = result.ydoc;
        awareness = result.awareness;

        actions = {
            setQuestion: result.setQuestion,
            addOption: result.addOption,
            deleteOption: result.deleteOption,
            vote: result.vote,
            updateSettings: result.updateSettings,
            resetVotes: result.resetVotes,
        };

        // Title Sync Logic
        const metaMap = ydoc.getMap("metadata");

        const handleMetaUpdate = (event: Y.YMapEvent<any>) => {
            if (event.transaction.local) return;
            const storedTitle = metaMap.get("poll-title") as string;
            if (storedTitle !== undefined && storedTitle !== title) {
                title = storedTitle;
            }
        };

        metaMap.observe(handleMetaUpdate);

        // Initial sync
        const storedTitle = metaMap.get("poll-title") as string;
        untrack(() => {
            if (storedTitle !== undefined && storedTitle !== title) {
                title = storedTitle;
            } else if (
                storedTitle === undefined &&
                title &&
                title !== documentId
            ) {
                metaMap.set("poll-title", title);
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
        const storedTitle = metaMap.get("poll-title") as string;

        if (title && title !== storedTitle) {
            metaMap.set("poll-title", title);
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

    onDestroy(() => {
        if (cleanup) cleanup();
    });

    function handleAddOption() {
        if (!newOptionText.trim()) return;
        actions.addOption(newOptionText.trim(), myUserId);
        newOptionText = "";
    }

    function getVotePercentage(votes: number, totalVotes: number) {
        if (totalVotes === 0) return 0;
        return Math.round((votes / totalVotes) * 100);
    }

    let totalVotes = $derived(
        $options.reduce((acc, opt) => acc + opt.votes.length, 0),
    );
</script>

<div class="max-w-2xl mx-auto p-6 bg-white dark:bg-gray-900 min-h-screen">
    <!-- Header / Question -->
    <div class="mb-8 flex items-start gap-4">
        <input
            type="text"
            class="grow text-3xl font-bold bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-blue-500 outline-none transition-colors text-center text-gray-900 dark:text-white placeholder-gray-400"
            placeholder="Stelle eine Frage..."
            value={$question}
            oninput={(e) => actions.setQuestion(e.currentTarget.value)}
        />
    </div>

    <!-- Options List -->
    <div class="space-y-4">
        {#each $options as option (option.id)}
            {@const isVoted = option.votes.some(v => v.name === user.name)}
            {@const percentage = getVotePercentage(
                option.votes.length,
                totalVotes,
            )}

            <div class="relative group">
                <!-- Progress Bar Background -->
                <div
                    class="absolute inset-0 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden"
                >
                    <div
                        class="h-full bg-blue-100 dark:bg-blue-900/30 transition-all duration-500 ease-out"
                        style="width: {percentage}%"
                    ></div>
                </div>

                <!-- Content -->
                <div class="relative p-4 flex items-center gap-4">
                    <button
                        onclick={() => actions.vote(option.id, user.name, user.color)}
                        class="shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors
                            {isVoted
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : 'border-gray-400 hover:border-blue-500 dark:border-gray-500'}"
                    >
                        {#if isVoted}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        {/if}
                    </button>

                    <div class="grow min-w-0">
                        <div class="flex justify-between items-baseline mb-1">
                            <div
                                class="font-medium text-gray-900 dark:text-white overflow-wrap-break-word"
                            >
                                <MarkdownText text={option.text} />
                            </div>
                            <span
                                class="text-sm text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap ml-3"
                                >{option.votes.length} ({percentage}%)</span
                            >
                        </div>

                        <!-- Voters List (if not anonymous) -->
                        {#if !$settings.anonymous && option.votes.length > 0}
                            <div class="flex flex-wrap gap-1 pt-2">
                                {#each option.votes as vote}
                                    <div
                                        class="px-2 py-0.5 rounded-full text-xs font-medium text-white shadow-sm"
                                        style="background-color: {vote.color}"
                                        title={vote.name}
                                    >
                                        {vote.name}
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <!-- Delete Option -->
                    <button
                        onclick={() => actions.deleteOption(option.id)}
                        class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"
                        title="Option löschen"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        {/each}
    </div>

    <!-- Add Option -->
    {#if $settings.allowUserOptions || $options.length < 2}
        <div class="mt-6">
            <div class="flex gap-2">
                <input
                    type="text"
                    bind:value={newOptionText}
                    onkeydown={(e) => e.key === "Enter" && handleAddOption()}
                    placeholder="Neue Option hinzufügen..."
                    class="grow px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                    onclick={handleAddOption}
                    disabled={!newOptionText.trim()}
                    class="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Hinzufügen
                </button>
            </div>
            <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Tipp: URLs werden automatisch verlinkt. Markdown-Formatierung: **fett**, *kursiv*, `code`, ~~durchgestrichen~~
            </div>
        </div>
    {/if}
</div>
