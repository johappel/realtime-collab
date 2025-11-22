/**
 * nostrUtils.ts
 * 
 * This module provides utility functions and classes for interacting with Nostr relays,
 * including signing and publishing events using the NIP-07 browser extension.
 * It also includes a minimal NativeRelay implementation to facilitate communication
 * with Nostr relays in environments where existing libraries may have limitations.
 * 
 */
import type { EventTemplate, Event, UnsignedEvent } from 'nostr-tools';

declare global {
    interface Window {
        nostr?: {
            getPublicKey(): Promise<string>;
            signEvent(event: UnsignedEvent): Promise<Event>;
        };
    }
}

// Globaler Pool für Wiederverwendung
let sharedPool: any = null;

/**
 * Versucht, ein Event über die NIP-07 Browser-Extension zu signieren und zu veröffentlichen.
 * Falls keine Extension vorhanden ist, wird ein Fehler geworfen (für MVP).
 */
export async function signAndPublishNip07(
    eventTemplate: EventTemplate,
    relays: string[] = [
        'ws://localhost:7000',
    ]
): Promise<Event> {
    if (!window.nostr) {
        throw new Error('NIP-07 Nostr extension not found');
    }

    // 1. Signieren
    const unsignedEvent: UnsignedEvent = {
        ...eventTemplate,
        pubkey: await window.nostr.getPublicKey(),
    };

    const signedEvent = await window.nostr.signEvent(unsignedEvent);

    // 2. Veröffentlichen
    // Wir nutzen hier unsere eigene RelayConnection-Logik statt nostr-tools SimplePool,
    // um konsistente Verbindungen zu gewährleisten und Probleme mit SimplePool zu vermeiden.

    const publishPromises = relays.map(url => {
        return new Promise<void>((resolve, reject) => {
            const conn = getRelayConnection(url);

            const timeout = setTimeout(() => {
                reject(new Error(`Timeout publishing to ${url}`));
            }, 5000);

            const send = () => {
                try {
                    conn.send(['EVENT', signedEvent]);
                    // Wir gehen optimistisch davon aus, dass es gesendet wurde.
                    // Echte OK-Message-Verarbeitung wäre besser, aber für MVP reicht das.
                    clearTimeout(timeout);
                    resolve();
                } catch (e) {
                    clearTimeout(timeout);
                    reject(e);
                }
            };

            if (conn.isOpen()) {
                send();
            } else {
                conn.onOpen(() => send());
            }
        });
    });

    try {
        // Wir warten darauf, dass mindestens ein Relay das Event akzeptiert.
        await Promise.any(publishPromises);
    } catch (error) {
        if (error instanceof AggregateError) {
            const isLocalhost = relays.some(r => r.includes('localhost'));
            if (isLocalhost) {
                console.warn('Failed to publish to local relay. Is it running? (docker-compose up -d)');
            } else {
                console.warn('Failed to publish to any relay.');
            }
        }
        throw error;
    }

    return signedEvent;
}

export async function getNip07Pubkey(): Promise<string> {
    if (!window.nostr) {
        throw new Error('NIP-07 Nostr extension not found');
    }
    return window.nostr.getPublicKey();
}

/**
 * Generiert einen deterministischen Nostr Private Key aus einem Gruppen-Code.
 * Nutzt SHA-256 als Seed, damit alle Gruppenmitglieder mit demselben Code
 * denselben Private Key erhalten und somit auf die gleichen Inhalte zugreifen können.
 * 
 * @param code - Der 8-stellige Gruppen-Code (z.B. "KURS-A-2024")
 * @returns Hex-encoded Private Key (64 Zeichen)
 */
export async function generateKeyFromCode(code: string): Promise<string> {
    // Normalisiere den Code (trim, uppercase) für Konsistenz
    const normalizedCode = code.trim().toUpperCase();

    // SHA-256 Hash des Codes
    const encoder = new TextEncoder();
    const data = encoder.encode(normalizedCode);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Konvertiere zu Hex-String
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
}

/**
 * Holt oder setzt die lokale Identität (Nickname) aus dem LocalStorage.
 * Wenn kein Nickname vorhanden ist, wird null zurückgegeben, damit die UI
 * den Nutzer zur Eingabe auffordern kann.
 * 
 * @param nickname - Optional: Setzt einen neuen Nickname
 * @returns Der gespeicherte Nickname oder null
 */
export function getOrSetLocalIdentity(nickname?: string): string | null {
    const STORAGE_KEY = 'collab_user_nickname';

    if (nickname !== undefined) {
        localStorage.setItem(STORAGE_KEY, nickname);
        return nickname;
    }

    return localStorage.getItem(STORAGE_KEY);
}

/**
 * Löscht die lokale Identität aus dem LocalStorage.
 * Nützlich für Logout oder Identitätswechsel.
 */
export function clearLocalIdentity(): void {
    localStorage.removeItem('collab_user_nickname');
}


export async function fetchNostrProfile(pubkey: string, relays: string[] = ['ws://localhost:7000']): Promise<{ name?: string, picture?: string, about?: string } | null> {
    return new Promise((resolve) => {
        let resolved = false;

        // Wir nutzen hier unsere NativeRelay-Klasse, da sie zuverlässiger im Browser funktioniert
        const relay = new NativeRelay(relays[0], (event) => {
            if (resolved) return;
            try {
                const content = JSON.parse(event.content);
                resolved = true;
                relay.close();
                resolve(content);
            } catch (e) {
                console.error('Failed to parse profile content', e);
            }
        });

        // Wir warten kurz bis die Verbindung steht (NativeRelay sendet REQ erst bei open)
        // und senden dann den Request
        relay.sendReq({
            kinds: [0],
            authors: [pubkey],
            limit: 1
        });

        // Timeout nach 2 Sekunden
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                relay.close();
                resolve(null);
            }
        }, 2000);
    });
}

export function getRandomColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

// Relay Connection Pool to ensure single persistent connection per URL
class RelayConnection {
    public url: string;
    private ws: WebSocket | null = null;
    private subscriptions: Map<string, { onEvent: (e: Event) => void, onEOSE?: () => void }> = new Map();
    private openListeners: Set<() => void> = new Set();
    private reconnectTimer: any = null;
    private debug: boolean = false;

    constructor(url: string) {
        this.url = url;
        this.connect();
    }

    private connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

        if (this.debug) console.log(`[RelayConnection] Connecting to ${this.url}`);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.log(`[RelayConnection] Connected to ${this.url}`);
            this.openListeners.forEach(cb => cb());
        };

        this.ws.onmessage = (msg) => {
            try {
                const data = JSON.parse(msg.data);
                if (!Array.isArray(data)) return;

                const [type, subId, payload] = data;

                if (type === 'EVENT') {
                    const sub = this.subscriptions.get(subId);
                    if (sub) sub.onEvent(payload as Event);
                } else if (type === 'EOSE') {
                    const sub = this.subscriptions.get(subId);
                    if (sub && sub.onEOSE) sub.onEOSE();
                } else if (type === 'NOTICE') {
                    console.warn(`[RelayConnection] NOTICE from ${this.url}:`, subId);
                }
            } catch (e) {
                console.error(`[RelayConnection] Failed to parse message from ${this.url}`, e);
            }
        };

        this.ws.onerror = (err) => {
            // console.error(`[RelayConnection] Error on ${this.url}`, err);
        };

        this.ws.onclose = () => {
            console.log(`[RelayConnection] Disconnected from ${this.url}`);
            // Auto-reconnect after delay
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        };
    }

    public subscribe(subId: string, handlers: { onEvent: (e: Event) => void, onEOSE?: () => void }) {
        this.subscriptions.set(subId, handlers);
    }

    public unsubscribe(subId: string) {
        this.subscriptions.delete(subId);
    }

    public send(data: any[]) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    public isOpen() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    public onOpen(cb: () => void) {
        if (this.isOpen()) {
            cb();
        }
        this.openListeners.add(cb);
    }

    public offOpen(cb: () => void) {
        this.openListeners.delete(cb);
    }
}

const relayPool = new Map<string, RelayConnection>();

export function getRelayConnection(url: string): RelayConnection {
    if (!relayPool.has(url)) {
        relayPool.set(url, new RelayConnection(url));
    }
    return relayPool.get(url)!;
}

// Minimal Native Relay Implementation that uses the shared pool
export class NativeRelay {
    private connection: RelayConnection;
    private subId: string;
    private openListener?: () => void;
    private debug: boolean;

    constructor(url: string, onEvent: (event: Event) => void, debug: boolean = false, onEOSE?: () => void) {
        this.connection = getRelayConnection(url);
        this.debug = debug;
        this.subId = 'sub-' + Math.random().toString(36).substring(2);

        // Register subscription immediately
        this.connection.subscribe(this.subId, { onEvent, onEOSE });
    }

    public subscribe(filter?: any) {
        // No-op, subscription is handled in constructor/sendReq
    }

    public sendReq(filter: any) {
        const req = ["REQ", this.subId, filter];

        const send = () => {
            if (this.debug) console.log(`[NativeRelay] Sending REQ to ${this.connection.url}`, req);
            this.connection.send(req);
        };

        // If we already have a listener, remove it to avoid duplicates if sendReq is called multiple times
        if (this.openListener) {
            this.connection.offOpen(this.openListener);
        }

        this.openListener = send;
        this.connection.onOpen(this.openListener);
    }

    public close() {
        if (this.connection.isOpen()) {
            this.connection.send(["CLOSE", this.subId]);
        }
        this.connection.unsubscribe(this.subId);
        if (this.openListener) {
            this.connection.offOpen(this.openListener);
        }
    }
}
