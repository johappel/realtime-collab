import { getPublicKey, finalizeEvent, type EventTemplate, type UnsignedEvent } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';
import type { Event } from 'nostr-tools';
import { getRelayConnection } from './nostrUtils';

/**
 * Signiert ein Event mit einem Private Key (ohne Browser Extension).
 * Wird im Gruppen-Modus verwendet, wo der Key aus dem Code generiert wird.
 * 
 * @param eventTemplate - Das zu signierende Event-Template
 * @param privateKeyHex - Der Private Key als Hex-String (64 Zeichen)
 * @param relays - Optional: Liste der Relays zum Publizieren
 * @returns Das signierte Event
 */
export async function signWithPrivateKey(
    eventTemplate: EventTemplate,
    privateKeyHex: string,
    relays: string[] = ['ws://localhost:7000']
): Promise<Event> {
    // Konvertiere Hex-String zu Uint8Array
    const privateKeyBytes = hexToBytes(privateKeyHex);

    // Generiere Public Key aus Private Key
    const pubkey = getPublicKey(privateKeyBytes);

    // Erstelle unsigned event
    const unsignedEvent: UnsignedEvent = {
        ...eventTemplate,
        pubkey,
    };

    // Signiere das Event
    const signedEvent = finalizeEvent(unsignedEvent, privateKeyBytes);

    // Publiziere zu Relays
    await publishToRelays(signedEvent, relays);

    return signedEvent;
}

/**
 * Publiziert ein Event zu den angegebenen Relays.
 * Nutzt die bestehende RelayConnection-Logik aus nostrUtils.
 */
async function publishToRelays(event: Event, relays: string[]): Promise<void> {
    const publishPromises = relays.map(url => {
        return new Promise<void>((resolve, reject) => {
            const conn = getRelayConnection(url);

            const timeout = setTimeout(() => {
                reject(new Error(`Timeout publishing to ${url}`));
            }, 5000);

            const send = () => {
                try {
                    conn.send(['EVENT', event]);
                    clearTimeout(timeout);
                    resolve();
                } catch (e) {
                    console.error('[publishToRelays] ❌ Send error for', url, e);
                    clearTimeout(timeout);
                    reject(e);
                }
            };

            if (conn.isOpen()) {
                send();
            } else {
                conn.onOpen(() => {
                    send();
                });
            }
        });
    });

    try {
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
        console.error('[publishToRelays] ❌ All publishes failed:', error);
        throw error;
    }
}

/**
 * Generiert einen Public Key aus einem Private Key.
 * Nützlich um den Pubkey für den Gruppen-Modus anzuzeigen.
 * 
 * @param privateKeyHex - Der Private Key als Hex-String
 * @returns Der Public Key als Hex-String
 */
export function getPubkeyFromPrivateKey(privateKeyHex: string): string {
    const privateKeyBytes = hexToBytes(privateKeyHex);
    return getPublicKey(privateKeyBytes);
}
