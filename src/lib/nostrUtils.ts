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
