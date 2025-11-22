import { finalizeEvent, verifyEvent, type Event } from "nostr-tools";

// Default Blossom server - can be changed later or moved to config
export const DEFAULT_BLOSSOM_SERVER = "https://cdn.satellite.earth";

export async function uploadFile(
    file: Blob,
    privateKey: string,
    serverUrl: string = DEFAULT_BLOSSOM_SERVER,
    useAuth: boolean = false  // Auth is optional, default to false for local dev
): Promise<{ url: string; sha256: string }> {
    // Remove trailing slash if present
    const cleanUrl = serverUrl.replace(/\/$/, "");
    const endpoint = `${cleanUrl}/upload`;

    // Convert hex key to bytes for finalizeEvent
    const skBytes = new Uint8Array(
        privateKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    // Calculate SHA256 of the file for the payload tag (REQUIRED by NIP-98 for requests with body)
    const fileBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const payloadHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    console.log('[Blossom Upload] Calculated payload hash:', payloadHash);

    // Manual NIP-98 Header Creation
    const event: Event = {
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ["u", endpoint],
            ["method", "PUT"],
            ["payload", payloadHash],  // REQUIRED for PUT requests with body
        ],
        content: "",
        pubkey: "", // Will be set by finalizeEvent
        id: "", // Will be set by finalizeEvent
        sig: "", // Will be set by finalizeEvent
    };

    const signedEvent = finalizeEvent(event, skBytes);

    // Validate the signature
    const isValid = verifyEvent(signedEvent);
    console.log('[Blossom Upload] Event signature valid?', isValid);

    if (!isValid) {
        throw new Error('Failed to create valid NIP-98 signature');
    }

    // Debug logging - show the complete signed event
    console.log('[Blossom Upload] Signed NIP-98 Event:', {
        kind: signedEvent.kind,
        pubkey: signedEvent.pubkey,
        created_at: signedEvent.created_at,
        tags: signedEvent.tags,
        id: signedEvent.id,
        sig: signedEvent.sig
    });

    const b64Event = btoa(JSON.stringify(signedEvent));
    const authHeader = `Nostr ${b64Event}`;

    // Debug logging
    console.log("NIP-98 Auth Header:", authHeader);
    console.log("Using auth:", useAuth);

    const headers: Record<string, string> = {};
    if (useAuth) {
        headers.Authorization = authHeader;
    }

    const response = await fetch(endpoint, {
        method: "PUT",
        headers,
        body: file, // Send raw blob
    });

    if (!response.ok) {
        const text = await response.text();
        console.error("Blossom Upload Error Body:", text);
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
    const cleanUrl = serverUrl.replace(/\/$/, "");
    const endpoint = `${cleanUrl}/${hash}`;

    const skBytes = new Uint8Array(
        privateKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    // Manual NIP-98 Header for DELETE
    const event: Event = {
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ["u", endpoint],
            ["method", "DELETE"],
        ],
        content: "",
        pubkey: "",
        id: "",
        sig: "",
    };

    const signedEvent = finalizeEvent(event, skBytes);
    const b64Event = btoa(JSON.stringify(signedEvent));
    const authHeader = `Nostr ${b64Event}`;

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
