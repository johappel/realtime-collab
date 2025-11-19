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
    relays: string[] = ['wss://relay.damus.io']
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

    // 2. Veröffentlichen (einfache Implementierung ohne Pool-Reuse für diesen Helper)
    // In einer echten App würde man den Pool wiederverwenden, aber hier nutzen wir
    // den Pool aus dem NostrYDocProvider eigentlich gar nicht für das PUBLISHEN,
    // sondern der Provider ruft diese Funktion auf.
    // Moment, der Provider hat einen Pool. Aber hier sollen wir nur "signAndPublish" implementieren.
    // Besser: Wir geben das signierte Event zurück oder nutzen einen einfachen Pool.

    // Da wir hier "fire and forget" machen wollen:
    const { SimplePool } = await import('nostr-tools');
    const pool = new SimplePool();

    try {
        await Promise.any(pool.publish(relays, signedEvent));
    } finally {
        pool.close(relays);
    }
}

export async function getNip07Pubkey(): Promise<string> {
    if (!window.nostr) {
        throw new Error('NIP-07 Nostr extension not found');
    }
    return window.nostr.getPublicKey();
}
