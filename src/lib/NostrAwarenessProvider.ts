import { Awareness } from 'y-protocols/awareness';
import { SimplePool, type EventTemplate, type Event } from 'nostr-tools';

const DEFAULT_RELAYS = [
  'ws://localhost:7000',
];export interface NostrAwarenessProviderOptions {
    awareness: Awareness;
    documentId: string;
    relays?: string[];
    myPubkey: string;
    signAndPublish: (event: EventTemplate) => Promise<void>;
}

type SubCloser = {
    close: (reason?: string) => void;
};

export class NostrAwarenessProvider {
    private pool: SimplePool;
    private relays: string[];
    private sub: SubCloser | null = null;
    private awareness: Awareness;
    private documentId: string;
    private myPubkey: string;
    private signAndPublish: (event: EventTemplate) => Promise<void>;
    private lastSentState: string | null = null;

    constructor(opts: NostrAwarenessProviderOptions) {
        this.awareness = opts.awareness;
        this.documentId = opts.documentId;
        this.relays = opts.relays ?? DEFAULT_RELAYS;
        this.myPubkey = opts.myPubkey;
        this.signAndPublish = opts.signAndPublish;

        this.pool = new SimplePool();

        this.subscribe();
        this.bindAwarenessUpdates();
    }

    private subscribe() {
        this.sub = this.pool.subscribeMany(
            this.relays,
            {
                kinds: [31339],
                '#d': [this.documentId],
            },
            {
                onevent: (event: Event) => {
                    try {
                        if (event.pubkey === this.myPubkey) return;

                        const content = JSON.parse(event.content);
                        const { clientId, state } = content;

                        if (clientId && state) {
                            const current = this.awareness.states.get(clientId);
                            if (JSON.stringify(current) !== JSON.stringify(state)) {
                                this.awareness.states.set(clientId, state);
                                this.awareness.emit('change', [{
                                    added: current ? [] : [clientId],
                                    updated: current ? [clientId] : [],
                                    removed: []
                                }, 'remote']);
                            }
                        }
                    } catch (error) {
                        console.error('Failed to process awareness event', error);
                    }
                },
            },
        );
    }

    private bindAwarenessUpdates() {
        this.awareness.on('change', ({ added, updated, removed }: any, origin: unknown) => {
            if (origin === 'remote') return;

            const myClientId = this.awareness.clientID;

            if (added.includes(myClientId) || updated.includes(myClientId)) {
                this.publishMyState();
            }
        });
    }

    private publishMyState() {
        const state = this.awareness.getLocalState();
        if (!state) return;

        const stateStr = JSON.stringify(state);
        if (stateStr === this.lastSentState) return;

        this.lastSentState = stateStr;

        const content = JSON.stringify({
            clientId: this.awareness.clientID,
            state: state,
            ts: Math.floor(Date.now() / 1000)
        });

        const event: EventTemplate = {
            kind: 31339,
            content: content,
            tags: [['d', this.documentId]],
            created_at: Math.floor(Date.now() / 1000),
        };

        this.signAndPublish(event).catch(console.error);
    }

    destroy() {
        this.sub?.close('teardown');
        this.sub = null;
        this.pool.close(this.relays);
        this.awareness.setLocalState(null);
    }
}
