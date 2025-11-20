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

/**
 * Versucht, ein Event über die NIP-07 Browser-Extension zu signieren und zu veröffentlichen.
 * Falls keine Extension vorhanden ist, wird ein Fehler geworfen (für MVP).
 */
export async function signAndPublishNip07(
    eventTemplate: EventTemplate,
    relays: string[] = [
        'ws://localhost:7000',
    ]
): Promise<void> {
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
    const { SimplePool } = await import('nostr-tools');
    const pool = new SimplePool();

    try {
        // Wir warten darauf, dass mindestens ein Relay das Event akzeptiert.
        await Promise.any(pool.publish(relays, signedEvent));
    } catch (error) {
        // Wenn alle fehlschlagen, loggen wir Details, aber werfen den Fehler weiter,
        // damit der Aufrufer Bescheid weiß.
        console.error('All relays failed to publish event:', error);
        if (error instanceof AggregateError) {
            error.errors.forEach((e, i) => {
                console.error(`Relay ${relays[i]} failed:`, e);
                if (relays[i].includes('localhost')) {
                    console.warn('Hint: Make sure you have a local Nostr relay running on port 7000 (e.g. nostr-rs-relay or nak).');
                }
            });
        }
        throw error;
    } finally {
        // Pool schließen, da wir ihn hier nur einmalig nutzen
        // (In einer optimierten App würde man den Pool global halten)
        pool.close(relays);
    }
}

export async function getNip07Pubkey(): Promise<string> {
    if (!window.nostr) {
        throw new Error('NIP-07 Nostr extension not found');
    }
    return window.nostr.getPublicKey();
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

// Minimal Native Relay Implementation to bypass library issues
export class NativeRelay {
    private ws: WebSocket;
    private url: string;
    private subId: string;
    private onEvent: (event: Event) => void;
    private debug: boolean;

    constructor(url: string, onEvent: (event: Event) => void, debug: boolean = false) {
        this.url = url;
        this.onEvent = onEvent;
        this.debug = debug;
        this.subId = 'sub-' + Math.random().toString(36).substring(2);
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
            if (this.debug) console.log(`[NativeRelay] Connected to ${url}`);
            this.subscribe();
        };

        this.ws.onmessage = (msg) => {
            try {
                const data = JSON.parse(msg.data);
                if (!Array.isArray(data)) return;
                
                const [type, subId, payload] = data;
                
                if (type === 'EVENT' && subId === this.subId) {
                    if (this.debug) console.log(`[NativeRelay] Received EVENT from ${url}`, payload.id);
                    this.onEvent(payload as Event);
                } else if (type === 'EOSE' && subId === this.subId) {
                    if (this.debug) console.log(`[NativeRelay] EOSE from ${url}`);
                } else if (type === 'NOTICE') {
                    console.warn(`[NativeRelay] NOTICE from ${url}:`, subId); // subId is message here
                }
            } catch (e) {
                console.error(`[NativeRelay] Failed to parse message from ${url}`, e);
            }
        };

        this.ws.onerror = (err) => console.error(`[NativeRelay] Error on ${url}`, err);
        this.ws.onclose = () => {
            if (this.debug) console.log(`[NativeRelay] Closed connection to ${url}`);
        };
    }

    public subscribe(filter?: any) {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        // Default filter logic handled by caller via sendReq
    }

    public sendReq(filter: any) {
        if (this.ws.readyState !== WebSocket.OPEN) {
            // Retry once connected
            this.ws.addEventListener('open', () => this.sendReq(filter), { once: true });
            return;
        }
        const req = ["REQ", this.subId, filter];
        if (this.debug) console.log(`[NativeRelay] Sending REQ to ${this.url}`, req);
        this.ws.send(JSON.stringify(req));
    }

    public close() {
        this.ws.close();
    }
}
