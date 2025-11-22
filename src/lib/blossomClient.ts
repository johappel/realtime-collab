import { finalizeEvent, type Event } from "nostr-tools";

// Default Blossom server - can be changed later or moved to config
export const DEFAULT_BLOSSOM_SERVER = "https://cdn.satellite.earth";

/**
 * Creates a NIP-98 Authorization header
 * @param url The full URL of the request (e.g. https://cdn.satellite.earth/upload)
 * @param method The HTTP method (e.g. POST, DELETE)
 * @param privateKey The hex private key to sign with
 */
async function createNip98Header(
    url: string,
    method: string,
    privateKey: string
): Promise<string> {
    const event: Event = {
        kind: 27235, // NIP-98 HTTP Auth
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ["u", url],
            ["method", method],
        ],
        content: "",
        pubkey: "", // Will be set by finalizeEvent
        id: "", // Will be set by finalizeEvent
        sig: "", // Will be set by finalizeEvent
    };

    // We need the public key for finalizeEvent, but we only have the private key here.
    // finalizeEvent derives the pubkey from the private key internally if we pass the sk.
    // Wait, finalizeEvent takes (event, secretKey).

    // Note: nostr-tools finalizeEvent takes the secret key as Uint8Array since v2.
    // We need to convert hex to Uint8Array.
    const skBytes = new Uint8Array(
        privateKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    const signedEvent = finalizeEvent(event, skBytes);

    // The header is "Nostr <base64-event>"
    const b64Event = btoa(JSON.stringify(signedEvent));
    return `Nostr ${b64Event}`;
}

export async function uploadFile(
    file: Blob,
    privateKey: string,
    serverUrl: string = DEFAULT_BLOSSOM_SERVER
): Promise<{ url: string; sha256: string }> {
    const endpoint = `${serverUrl}/upload`;
    const authHeader = await createNip98Header(endpoint, "POST", privateKey);

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: authHeader,
        },
        body: formData,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed: ${response.status} ${text}`);
    }

    const result = await response.json();
    // Blossom returns { url, sha256, ... }
    return result;
}

export async function deleteFile(
    hash: string,
    privateKey: string,
    serverUrl: string = DEFAULT_BLOSSOM_SERVER
): Promise<void> {
    const endpoint = `${serverUrl}/${hash}`;
    const authHeader = await createNip98Header(endpoint, "DELETE", privateKey);

    const response = await fetch(endpoint, {
        method: "DELETE",
        headers: {
            Authorization: authHeader,
        },
    });

    if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
    }
}
