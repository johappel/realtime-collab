/**
 * NostrAwarenessProvider.ts
 * 
 * This module implements a Nostr-based awareness provider for Yjs documents.
 * It allows real-time collaboration by broadcasting and receiving awareness states
 * over Nostr relays.
 * 
 */
import { Awareness } from 'y-protocols/awareness';
import type { EventTemplate, Event } from 'nostr-tools';
import { NativeRelay } from './nostrUtils';

const DEFAULT_RELAYS = [
  'ws://localhost:7000',
];

/**
 * Options for NostrAwarenessProvider
 */
export interface NostrAwarenessProviderOptions {
    awareness: Awareness;
    documentId: string;
    relays?: string[];
    myPubkey: string;
    signAndPublish: (event: EventTemplate) => Promise<void>;
    debug?: boolean;
}
/**
 * Nostr-based Awareness Provider for Yjs
 */
export class NostrAwarenessProvider {
    private activeRelays: NativeRelay[] = [];
    private relays: string[];
    private awareness: Awareness;
    private documentId: string;
    private myPubkey: string;
    private signAndPublish: (event: EventTemplate) => Promise<void>;
    private lastSentState: string | null = null;
    private debug: boolean;

    constructor(opts: NostrAwarenessProviderOptions) {
        this.awareness = opts.awareness;
        this.documentId = opts.documentId;
        this.relays = opts.relays ?? DEFAULT_RELAYS;
        this.myPubkey = opts.myPubkey;
        this.signAndPublish = opts.signAndPublish;
        this.debug = opts.debug ?? false;

        this.subscribe();
        this.bindAwarenessUpdates();
    }
    /**
     * Subscribes to Nostr relays to receive awareness updates
     */
    private subscribe() {
        for (const url of this.relays) {
            try {
                const relay = new NativeRelay(url, (event) => {
                    this.handleEvent(event);
                });
                
                relay.sendReq({
                    kinds: [31339],
                    '#d': [this.documentId],
                });

                this.activeRelays.push(relay);
            } catch (e) {
                console.error(`[NostrAwarenessProvider] Failed to connect to ${url}`, e);
            }
        }
    }
    /**
     * handles incoming awareness events
     * Awareness events are Nostr events of kind 31339 that contain
     * the awareness state of a user in their content field.
     * @param event 
     * @returns 
     */
    private handleEvent(event: Event) {
        try {
            // if (event.pubkey === this.myPubkey) return; // Don't filter by pubkey to allow multi-tab testing with same account

            // Ignore events older than 30 seconds to prevent "ghost" users from previous sessions
            const now = Math.floor(Date.now() / 1000);
            if (event.created_at < now - 30) {
                if (this.debug) console.log(`[NostrAwareness] Ignoring old event from ${event.created_at}`);
                return;
            }

            const content = JSON.parse(event.content);
            const { clientId, state } = content;

            // Ignore updates from our own clientID (echoed events)
            if (clientId === this.awareness.clientID) return;

            if (clientId && state) {
                const current = this.awareness.states.get(clientId);
                if (JSON.stringify(current) !== JSON.stringify(state)) {
                    if (this.debug) console.log(`[NostrAwareness] Updating state for ${clientId}`, state);
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
    }

    /**
     * Binds awareness updates to publish local state changes
     * Reagiert auf Awareness-Updates, um lokale Zustandsänderungen zu veröffentlichen
     * @param origin Ursprung der Änderung (z.B. 'remote' für empfangene Änderungen oder undefined für lokale Änderungen)
     */
    private bindAwarenessUpdates() {
        this.awareness.on('change', ({ added, updated, removed }: any, origin: unknown) => {
            // wenn die Änderung von nostr kam, ignorieren
            if (origin === 'remote') return;

            // Nur den eigenen Zustand veröffentlichen
            const myClientId = this.awareness.clientID;

            // wenn der eigene ClientId in den Änderungen ist, Zustand veröffentlichen
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
        this.activeRelays.forEach(r => r.close());
        this.activeRelays = [];
        this.awareness.setLocalState(null);
    }
}
