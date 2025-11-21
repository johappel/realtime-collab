import * as Y from 'yjs';
import { useNostrYDoc } from '$lib/useNostrYDoc';
import { useLocalYDoc } from '$lib/useLocalYDoc';
import { writable, type Writable } from 'svelte/store';

export interface PollOption {
    id: string;
    text: string;
    creatorId?: string; // If user created it
    votes: string[]; // Array of userIds (or pubkeys)
}

export interface PollSettings {
    allowUserOptions: boolean;
    anonymous: boolean;
    multiSelect: boolean;
}

export interface UsePollYDocResult {
    question: Writable<string>;
    options: Writable<PollOption[]>;
    settings: Writable<PollSettings>;
    ydoc: Y.Doc;
    provider: any;
    awareness: any;
    cleanup: () => void;
    setQuestion: (q: string) => void;
    addOption: (text: string, creatorId?: string) => void;
    deleteOption: (id: string) => void;
    vote: (optionId: string, userId: string) => void;
    updateSettings: (s: Partial<PollSettings>) => void;
    resetVotes: () => void;
}

export function usePollYDoc(
    documentId: string,
    mode: 'local' | 'nostr',
    user: { name: string; color: string },
    myPubkey?: string,
    signAndPublish?: (evt: any) => Promise<any>,
    relays?: string[]
): UsePollYDocResult {
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

    // Yjs Data Structure
    const yQuestion = ydoc.getText('poll-question');
    const yOptions = ydoc.getArray<Y.Map<any>>('poll-options');
    const ySettings = ydoc.getMap<any>('poll-settings');

    const question = writable<string>(yQuestion.toString());
    const options = writable<PollOption[]>([]);
    const settings = writable<PollSettings>({
        allowUserOptions: false,
        anonymous: false,
        multiSelect: false
    });

    // Sync Logic
    const syncQuestion = () => {
        question.set(yQuestion.toString());
    };

    const syncOptions = () => {
        const newOptions: PollOption[] = yOptions.map(yMap => ({
            id: yMap.get('id'),
            text: yMap.get('text'),
            creatorId: yMap.get('creatorId'),
            votes: yMap.get('votes') || []
        }));
        options.set(newOptions);
    };

    const syncSettings = () => {
        settings.set({
            allowUserOptions: ySettings.get('allowUserOptions') ?? false,
            anonymous: ySettings.get('anonymous') ?? false,
            multiSelect: ySettings.get('multiSelect') ?? false
        });
    };

    yQuestion.observe(syncQuestion);
    yOptions.observeDeep(syncOptions);
    ySettings.observeDeep(syncSettings);
    
    syncQuestion();
    syncOptions();
    syncSettings();

    // Actions
    const setQuestion = (q: string) => {
        ydoc.transact(() => {
            yQuestion.delete(0, yQuestion.length);
            yQuestion.insert(0, q);
        });
    };

    const addOption = (text: string, creatorId?: string) => {
        ydoc.transact(() => {
            const id = crypto.randomUUID();
            const yMap = new Y.Map();
            yMap.set('id', id);
            yMap.set('text', text);
            yMap.set('creatorId', creatorId);
            yMap.set('votes', []);
            yOptions.push([yMap]);
        });
    };

    const deleteOption = (id: string) => {
        ydoc.transact(() => {
            for (let i = 0; i < yOptions.length; i++) {
                const map = yOptions.get(i);
                if (map.get('id') === id) {
                    yOptions.delete(i, 1);
                    break;
                }
            }
        });
    };

    const vote = (optionId: string, userId: string) => {
        ydoc.transact(() => {
            const isMulti = ySettings.get('multiSelect');
            
            // If not multi-select, remove vote from other options first
            if (!isMulti) {
                yOptions.forEach(map => {
                    if (map.get('id') !== optionId) {
                        const votes = map.get('votes') as string[];
                        if (votes.includes(userId)) {
                            map.set('votes', votes.filter(v => v !== userId));
                        }
                    }
                });
            }

            // Toggle vote on target option
            for (let i = 0; i < yOptions.length; i++) {
                const map = yOptions.get(i);
                if (map.get('id') === optionId) {
                    const votes = map.get('votes') as string[];
                    if (votes.includes(userId)) {
                        map.set('votes', votes.filter(v => v !== userId));
                    } else {
                        map.set('votes', [...votes, userId]);
                    }
                    break;
                }
            }
        });
    };

    const updateSettings = (s: Partial<PollSettings>) => {
        ydoc.transact(() => {
            if (s.allowUserOptions !== undefined) ySettings.set('allowUserOptions', s.allowUserOptions);
            if (s.anonymous !== undefined) ySettings.set('anonymous', s.anonymous);
            if (s.multiSelect !== undefined) ySettings.set('multiSelect', s.multiSelect);
        });
    };

    const resetVotes = () => {
        ydoc.transact(() => {
            yOptions.forEach(map => {
                map.set('votes', []);
            });
        });
    };

    const cleanup = () => {
        yQuestion.unobserve(syncQuestion);
        yOptions.unobserveDeep(syncOptions);
        ySettings.unobserveDeep(syncSettings);
        if (provider && typeof provider.destroy === 'function') provider.destroy();
        if (awareness) awareness.destroy();
        if (persistence && typeof persistence.destroy === 'function') persistence.destroy();
        ydoc.destroy();
    };

    return {
        question,
        options,
        settings,
        ydoc,
        provider,
        awareness,
        cleanup,
        setQuestion,
        addOption,
        deleteOption,
        vote,
        updateSettings,
        resetVotes
    };
}
