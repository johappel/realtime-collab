import * as Y from 'yjs';
import { useNostrYDoc } from '$lib/useNostrYDoc';
import { useLocalYDoc } from '$lib/useLocalYDoc';
import { writable, type Writable } from 'svelte/store';

export interface PollOption {
    id: string;
    text: string;
    creatorId?: string; // If user created it
    votes: Array<{name: string, color: string}>; // Array of voter objects
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
    vote: (optionId: string, userName: string, userColor: string) => void;
    updateSettings: (s: Partial<PollSettings>) => void;
    resetVotes: () => void;
}

export function usePollYDoc(
    documentId: string,
    mode: 'local' | 'nostr' | 'group',
    user: { name: string; color: string; pubkey?: string },
    myPubkey?: string,
    signAndPublish?: (evt: any) => Promise<any>,
    relays?: string[]
): UsePollYDocResult {
    let ydoc: Y.Doc;
    let provider: any;
    let awareness: any;
    let persistence: any;

    if ((mode === 'nostr' || mode === 'group') && myPubkey && signAndPublish) {
        // In group mode, use user.name as identifier to ensure unique clientID per user
        const userIdentifier = mode === 'group' ? user.name : undefined;
        const isGroupMode = mode === 'group';
        // Prefix documentId with app type to separate awareness between apps
        const appDocumentId = `poll:${documentId}`;
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
        const newOptions: PollOption[] = yOptions.map(yMap => {
            const votesData = yMap.get('votes');
            let votes: Array<{name: string, color: string}> = [];
            
            if (!votesData || votesData === '') {
                votes = [];
            } else if (Array.isArray(votesData)) {
                votes = votesData; // Backwards compat
            } else if (typeof votesData === 'string') {
                try {
                    votes = JSON.parse(votesData);
                } catch (e) {
                    console.warn('[usePollYDoc] Failed to parse votes JSON:', votesData, e);
                    votes = [];
                }
            }
            
            return {
                id: yMap.get('id'),
                text: yMap.get('text'),
                creatorId: yMap.get('creatorId'),
                votes
            };
        });
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
            yMap.set('votes', JSON.stringify([]));
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

    const vote = (optionId: string, userName: string, userColor: string) => {
        ydoc.transact(() => {
            const isMulti = ySettings.get('multiSelect');
            
            // Helper to parse votes from Yjs (handles legacy formats)
            const parseVotes = (votesData: any): Array<{name: string, color: string}> => {
                if (!votesData) return [];
                if (Array.isArray(votesData)) return votesData; // Legacy format
                if (typeof votesData === 'string') {
                    if (votesData === '') return []; // Empty string
                    try {
                        return JSON.parse(votesData);
                    } catch (e) {
                        console.warn('[usePollYDoc] Failed to parse votes:', votesData, e);
                        return [];
                    }
                }
                return [];
            };

            // If not multi-select, remove vote from other options first
            if (!isMulti) {
                yOptions.forEach(map => {
                    if (map.get('id') !== optionId) {
                        const votes = parseVotes(map.get('votes'));
                        const filtered = votes.filter(v => v.name !== userName);
                        if (filtered.length !== votes.length) {
                            map.set('votes', JSON.stringify(filtered));
                        }
                    }
                });
            }

            // Toggle vote on target option
            for (let i = 0; i < yOptions.length; i++) {
                const map = yOptions.get(i);
                if (map.get('id') === optionId) {
                    const votes = parseVotes(map.get('votes'));
                    const existingIndex = votes.findIndex(v => v.name === userName);
                    if (existingIndex >= 0) {
                        const newVotes = votes.filter(v => v.name !== userName);
                        map.set('votes', JSON.stringify(newVotes));
                    } else {
                        const newVotes = [...votes, { name: userName, color: userColor }];
                        map.set('votes', JSON.stringify(newVotes));
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
                map.set('votes', JSON.stringify([]));
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
