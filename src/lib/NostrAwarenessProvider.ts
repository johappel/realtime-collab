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
    signAndPublish: (event: EventTemplate) => Promise<any>;
    debug?: boolean;
    isGroupMode?: boolean; // If true, allows multiple users with same pubkey
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
    private signAndPublish: (event: EventTemplate) => Promise<any>;
    private lastSentState: string | null = null;
    private debug: boolean;
    private isGroupMode: boolean;
    private pubkeyToClientId: Map<string, number> = new Map();
    private usernameToClientId: Map<string, number> = new Map(); // For group mode
    private heartbeatInterval: any = null;

    constructor(opts: NostrAwarenessProviderOptions) {
        this.awareness = opts.awareness;
        this.documentId = opts.documentId;
        this.relays = opts.relays ?? DEFAULT_RELAYS;
        this.myPubkey = opts.myPubkey;
        this.signAndPublish = opts.signAndPublish;
        this.debug = opts.debug ?? false;
        this.isGroupMode = opts.isGroupMode ?? false;

        this.subscribe();
        this.bindAwarenessUpdates();
        this.startHeartbeat();
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
                
                // Get recent awareness states (last 60 seconds)
                // Kind 31339 are replaceable events, so we get the latest state of all users
                const now = Math.floor(Date.now() / 1000);
                relay.sendReq({
                    kinds: [31339],
                    '#d': [this.documentId],
                    since: now - 60, // Get states from last 60 seconds
                });

                console.log(`[NostrAwarenessProvider] 🔌 Subscribed to ${url} for awareness (kind 31339)`);

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
            console.log('[NostrAwarenessProvider] 📥 Received event:', {
                pubkey: event.pubkey.substring(0, 16) + '...',
                myPubkey: this.myPubkey.substring(0, 16) + '...',
                isMyPubkey: event.pubkey === this.myPubkey,
                isGroupMode: this.isGroupMode,
                created_at: event.created_at
            });

            // if (event.pubkey === this.myPubkey) return; // Don't filter by pubkey to allow multi-tab testing with same account

            // Ignore events older than 30 seconds to prevent "ghost" users from previous sessions
            const now = Math.floor(Date.now() / 1000);
            if (event.created_at < now - 30) {
                console.log(`[NostrAwarenessProvider] ⏰ Ignoring old event from ${event.created_at}`);
                return;
            }

            const content = JSON.parse(event.content);
            const { clientId, state } = content;

            console.log('[NostrAwarenessProvider] 📦 Event content:', {
                clientId,
                myClientId: this.awareness.clientID,
                state: state ? { user: state.user?.name } : null
            });

            // Ignore updates from our own clientID (echoed events)
            if (clientId === this.awareness.clientID) {
                console.log('[NostrAwarenessProvider] ⏩ Skipping own clientID');
                return;
            }

            // "Single Session per User" enforcement:
            // If we receive an event from our own Pubkey but with a different ClientID,
            // it is likely a "ghost" from a previous session (e.g. before reload).
            // We treat it as stale and remove it.
            // Note: This prevents multi-tab usage with the SAME Nostr account.
            // DISABLED in group mode to allow multiple users with same pubkey
            if (!this.isGroupMode && event.pubkey === this.myPubkey && clientId !== this.awareness.clientID) {
                if (this.awareness.states.has(clientId)) {
                    console.log(`[NostrAwarenessProvider] 👻 Removing ghost session ${clientId} for my pubkey`);
                    this.awareness.states.delete(clientId);
                    this.awareness.emit('change', [{
                        added: [],
                        updated: [],
                        removed: [clientId]
                    }, 'remote']);
                }
                console.log('[NostrAwarenessProvider] ⏩ Skipping ghost from same pubkey');
                return;
            }

            // Ghost Killer: Enforce one clientId per user
            // In group mode: track by username, in normal mode: track by pubkey
            if (this.isGroupMode) {
                // Group mode: Use username to track unique users
                const username = state?.user?.name;
                if (username) {
                    const existingClientId = this.usernameToClientId.get(username);
                    if (existingClientId && existingClientId !== clientId) {
                        // This user has a new clientId (e.g., after reload)
                        if (this.awareness.states.has(existingClientId)) {
                            console.log(`[NostrAwarenessProvider] 👻 Ghost Killer: Removing old clientId ${existingClientId} for user ${username}`);
                            this.awareness.states.delete(existingClientId);
                            this.awareness.emit('change', [{
                                added: [],
                                updated: [],
                                removed: [existingClientId]
                            }, 'remote']);
                        }
                    }
                    this.usernameToClientId.set(username, clientId);
                    console.log(`[NostrAwarenessProvider] 📝 Tracking user ${username} with clientId ${clientId}`);
                }
            } else if (event.pubkey) {
                // Normal mode: Use pubkey to track unique users
                const existingClientId = this.pubkeyToClientId.get(event.pubkey);
                if (existingClientId && existingClientId !== clientId) {
                    if (this.awareness.states.has(existingClientId)) {
                        console.log(`[NostrAwarenessProvider] 👻 Ghost Killer: Removing old clientId ${existingClientId} for pubkey ${event.pubkey}`);
                        this.awareness.states.delete(existingClientId);
                        this.awareness.emit('change', [{
                            added: [],
                            updated: [],
                            removed: [existingClientId]
                        }, 'remote']);
                    }
                }
                this.pubkeyToClientId.set(event.pubkey, clientId);
            }

            if (clientId) {
                if (state === null) {
                    // User went offline
                    if (this.awareness.states.has(clientId)) {
                        console.log(`[NostrAwarenessProvider] 🚪 Removing user ${clientId}`);
                        this.awareness.states.delete(clientId);
                        this.awareness.emit('change', [{
                            added: [],
                            updated: [],
                            removed: [clientId]
                        }, 'remote']);
                    }
                } else {
                    // User updated state
                    const current = this.awareness.states.get(clientId);
                    if (JSON.stringify(current) !== JSON.stringify(state)) {
                        console.log(`[NostrAwarenessProvider] ${current ? '✏️ Updating' : '✅ Adding'} state for ${clientId}:`, state.user?.name);
                        this.awareness.states.set(clientId, state);
                        this.awareness.emit('change', [{
                            added: current ? [] : [clientId],
                            updated: current ? [clientId] : [],
                            removed: []
                        }, 'remote']);
                    } else {
                        console.log(`[NostrAwarenessProvider] ⏩ State unchanged for ${clientId}`);
                    }
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
            console.log('[NostrAwarenessProvider] 🔔 Awareness change:', {
                added,
                updated,
                removed,
                origin,
                myClientId: this.awareness.clientID
            });

            // wenn die Änderung von nostr kam, ignorieren
            if (origin === 'remote') {
                console.log('[NostrAwarenessProvider] ⏩ Skipping remote change');
                return;
            }

            // Nur den eigenen Zustand veröffentlichen
            const myClientId = this.awareness.clientID;

            // wenn der eigene ClientId in den Änderungen ist, Zustand veröffentlichen
            if (added.includes(myClientId) || updated.includes(myClientId) || removed.includes(myClientId)) {
                console.log('[NostrAwarenessProvider] 📤 Publishing my state...');
                this.publishMyState();
            } else {
                console.log('[NostrAwarenessProvider] ⏩ Change does not affect my clientId');
            }
        });
    }

    private publishMyState() {
        const state = this.awareness.getLocalState();
        console.log('[NostrAwarenessProvider] 📡 publishMyState called:', {
            clientId: this.awareness.clientID,
            state: state ? { user: state.user?.name } : null
        });

        // if (!state) return; // Allow null state to signal offline

        const stateStr = JSON.stringify(state);
        if (stateStr === this.lastSentState) {
            console.log('[NostrAwarenessProvider] ⏩ State unchanged, not publishing');
            return;
        }

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

        console.log('[NostrAwarenessProvider] 🔐 Signing and publishing awareness event...');
        this.signAndPublish(event)
            .then(() => {
                console.log('[NostrAwarenessProvider] ✅ Awareness event published');
            })
            .catch(e => {
                console.error('[NostrAwarenessProvider] ❌ Failed to publish state:', e);
            });
    }

    private startHeartbeat() {
        // Send awareness state every 20 seconds to keep presence alive
        this.heartbeatInterval = setInterval(() => {
            const state = this.awareness.getLocalState();
            if (state) {
                console.log('[NostrAwarenessProvider] 💓 Heartbeat: sending awareness update');
                // Force publish by clearing lastSentState
                const lastState = this.lastSentState;
                this.lastSentState = null;
                this.publishMyState();
                this.lastSentState = lastState; // Restore to avoid spam
            }
        }, 20000); // 20 seconds
    }

    destroy() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.activeRelays.forEach(r => r.close());
        this.activeRelays = [];
        this.awareness.setLocalState(null);
    }
}
