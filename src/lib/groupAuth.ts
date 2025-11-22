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
    console.log('[groupAuth] 🔐 signWithPrivateKey called:', {
        kind: eventTemplate.kind,
        tags: eventTemplate.tags,
        relays
    });

    // Konvertiere Hex-String zu Uint8Array
    const privateKeyBytes = hexToBytes(privateKeyHex);

    // Generiere Public Key aus Private Key
    const pubkey = getPublicKey(privateKeyBytes);
    console.log('[groupAuth] 📝 Generated pubkey:', pubkey.substring(0, 16) + '...');

    // Erstelle unsigned event
    const unsignedEvent: UnsignedEvent = {
        ...eventTemplate,
        pubkey,
    };

    // Signiere das Event
    const signedEvent = finalizeEvent(unsignedEvent, privateKeyBytes);
    console.log('[groupAuth] ✍️ Event signed:', signedEvent.id);

    // Publiziere zu Relays
    console.log('[groupAuth] 📡 Publishing to relays...');
    await publishToRelays(signedEvent, relays);
    console.log('[groupAuth] ✅ Published successfully');

    return signedEvent;
}

/**
 * Publiziert ein Event zu den angegebenen Relays.
 * Nutzt die bestehende RelayConnection-Logik aus nostrUtils.
 */
async function publishToRelays(event: Event, relays: string[]): Promise<void> {
    console.log('[publishToRelays] Starting publish to', relays.length, 'relays');
    
    const publishPromises = relays.map(url => {
        return new Promise<void>((resolve, reject) => {
            console.log('[publishToRelays] Connecting to', url);
            const conn = getRelayConnection(url);

            const timeout = setTimeout(() => {
                console.error('[publishToRelays] ⏱️ Timeout for', url);
                reject(new Error(`Timeout publishing to ${url}`));
            }, 5000);

            const send = () => {
                try {
                    console.log('[publishToRelays] 📤 Sending EVENT to', url);
                    conn.send(['EVENT', event]);
                    console.log('[publishToRelays] ✅ Sent to', url);
                    clearTimeout(timeout);
                    resolve();
                } catch (e) {
                    console.error('[publishToRelays] ❌ Send error for', url, e);
                    clearTimeout(timeout);
                    reject(e);
                }
            };

            if (conn.isOpen()) {
                console.log('[publishToRelays] Connection already open for', url);
                send();
            } else {
                console.log('[publishToRelays] Waiting for connection to open for', url);
                conn.onOpen(() => {
                    console.log('[publishToRelays] Connection opened for', url);
                    send();
                });
            }
        });
    });

    try {
        await Promise.any(publishPromises);
        console.log('[publishToRelays] ✅ Successfully published to at least one relay');
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
