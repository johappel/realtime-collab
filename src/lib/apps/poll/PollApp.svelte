<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { writable, type Writable } from 'svelte/store';
    import { usePollYDoc, type PollOption, type PollSettings } from './usePollYDoc';
    import { loadConfig } from '$lib/config';
    import { getNip07Pubkey, signAndPublishNip07 } from '$lib/nostrUtils';
    import { theme } from '$lib/stores/theme.svelte';

    let { 
        documentId, 
        user = { name: 'Anon', color: '#ff0000' },
        mode = 'local'
    } = $props<{
        documentId: string;
        user?: { name: string; color: string };
        mode?: 'local' | 'nostr';
    }>();

    let question: Writable<string> = $state(writable(''));
    let options: Writable<PollOption[]> = $state(writable([]));
    let settings: Writable<PollSettings> = $state(writable({
        allowUserOptions: false,
        anonymous: false,
        multiSelect: false
    }));
    
    let cleanup: (() => void) | null = null;
    let actions: any = {};
    let myUserId = $state('');

    // Local state for new option input
    let newOptionText = $state('');

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
                myUserId = pubkey;
            } catch (e) {
                console.error("Failed to init Nostr:", e);
                myUserId = 'anon-' + Math.random().toString(36).substr(2, 9);
            }
        } else {
            // Local mode ID
            myUserId = 'local-' + Math.random().toString(36).substr(2, 9);
        }

        const result = usePollYDoc(
            documentId,
            mode,
            user,
            pubkey,
            signAndPublish,
            relays
        );

        question = result.question;
        options = result.options;
        settings = result.settings;
        cleanup = result.cleanup;
        actions = {
            setQuestion: result.setQuestion,
            addOption: result.addOption,
            deleteOption: result.deleteOption,
            vote: result.vote,
            updateSettings: result.updateSettings,
            resetVotes: result.resetVotes
        };
    });

    onDestroy(() => {
        if (cleanup) cleanup();
    });

    function handleAddOption() {
        if (!newOptionText.trim()) return;
        actions.addOption(newOptionText.trim(), myUserId);
        newOptionText = '';
    }

    function getVotePercentage(votes: number, totalVotes: number) {
        if (totalVotes === 0) return 0;
        return Math.round((votes / totalVotes) * 100);
    }

    let totalVotes = $derived($options.reduce((acc, opt) => acc + opt.votes.length, 0));
</script>

<div class="max-w-2xl mx-auto p-6 bg-white dark:bg-gray-900 min-h-screen">
    <!-- Header / Question -->
    <div class="mb-8">
        <input 
            type="text" 
            class="w-full text-3xl font-bold bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-blue-500 outline-none transition-colors text-center text-gray-900 dark:text-white placeholder-gray-400"
            placeholder="Stelle eine Frage..."
            value={$question}
            oninput={(e) => actions.setQuestion(e.currentTarget.value)}
        />
    </div>

    <!-- Settings Toggles -->
    <div class="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg flex flex-wrap gap-4 text-sm">
        <label class="flex items-center gap-2 cursor-pointer dark:text-gray-300">
            <input 
                type="checkbox" 
                checked={$settings.multiSelect} 
                onchange={(e) => actions.updateSettings({ multiSelect: e.currentTarget.checked })}
                class="rounded text-blue-600 focus:ring-blue-500"
            />
            Mehrfachauswahl
        </label>
        
        <label class="flex items-center gap-2 cursor-pointer dark:text-gray-300">
            <input 
                type="checkbox" 
                checked={$settings.anonymous} 
                onchange={(e) => actions.updateSettings({ anonymous: e.currentTarget.checked })}
                class="rounded text-blue-600 focus:ring-blue-500"
            />
            Anonyme Abstimmung
        </label>

        <label class="flex items-center gap-2 cursor-pointer dark:text-gray-300">
            <input 
                type="checkbox" 
                checked={$settings.allowUserOptions} 
                onchange={(e) => actions.updateSettings({ allowUserOptions: e.currentTarget.checked })}
                class="rounded text-blue-600 focus:ring-blue-500"
            />
            Eigene Optionen erlauben
        </label>

        <button 
            onclick={() => actions.resetVotes()}
            class="ml-auto text-red-600 hover:text-red-700 font-medium"
        >
            Reset Votes
        </button>
    </div>

    <!-- Options List -->
    <div class="space-y-4">
        {#each $options as option (option.id)}
            {@const isVoted = option.votes.includes(myUserId)}
            {@const percentage = getVotePercentage(option.votes.length, totalVotes)}
            
            <div class="relative group">
                <!-- Progress Bar Background -->
                <div class="absolute inset-0 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                    <div 
                        class="h-full bg-blue-100 dark:bg-blue-900/30 transition-all duration-500 ease-out"
                        style="width: {percentage}%"
                    ></div>
                </div>

                <!-- Content -->
                <div class="relative p-4 flex items-center gap-4">
                    <button 
                        onclick={() => actions.vote(option.id, myUserId)}
                        class="flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors
                            {isVoted 
                                ? 'bg-blue-500 border-blue-500 text-white' 
                                : 'border-gray-400 hover:border-blue-500 dark:border-gray-500'}"
                    >
                        {#if isVoted}
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                            </svg>
                        {/if}
                    </button>

                    <div class="flex-grow min-w-0">
                        <div class="flex justify-between items-baseline mb-1">
                            <span class="font-medium text-gray-900 dark:text-white truncate">{option.text}</span>
                            <span class="text-sm text-gray-500 dark:text-gray-400 font-mono">{option.votes.length} ({percentage}%)</span>
                        </div>
                        
                        <!-- Voters List (if not anonymous) -->
                        {#if !$settings.anonymous && option.votes.length > 0}
                            <div class="flex -space-x-2 overflow-hidden pt-1">
                                {#each option.votes.slice(0, 8) as voterId}
                                    <div 
                                        class="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-gray-900 bg-gray-300 flex items-center justify-center text-xs font-bold text-gray-600 select-none"
                                        title={voterId}
                                    >
                                        {voterId.slice(0, 2).toUpperCase()}
                                    </div>
                                {/each}
                                {#if option.votes.length > 8}
                                    <div class="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-gray-900 bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                                        +{option.votes.length - 8}
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>

                    <!-- Delete Option -->
                    <button 
                        onclick={() => actions.deleteOption(option.id)}
                        class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"
                        title="Option löschen"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
        {/each}
    </div>

    <!-- Add Option -->
    {#if $settings.allowUserOptions || $options.length < 2}
        <div class="mt-6 flex gap-2">
            <input 
                type="text" 
                bind:value={newOptionText}
                onkeydown={(e) => e.key === 'Enter' && handleAddOption()}
                placeholder="Neue Option hinzufügen..."
                class="flex-grow px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button 
                onclick={handleAddOption}
                disabled={!newOptionText.trim()}
                class="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                Hinzufügen
            </button>
        </div>
    {/if}
</div>