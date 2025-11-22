export async function importKey(rawKey: string): Promise<CryptoKey> {
    // rawKey is likely a hex string (Nostr private key format)
    // We need to convert it to a buffer for Web Crypto
    const keyBuffer = new Uint8Array(
        rawKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    return await window.crypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );
}

export async function encryptFile(
    file: Blob,
    hexKey: string
): Promise<{ encryptedBlob: Blob; iv: Uint8Array }> {
    const key = await importKey(hexKey);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const fileBuffer = await file.arrayBuffer();

    const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        key,
        fileBuffer
    );

    return {
        encryptedBlob: new Blob([encryptedBuffer]),
        iv: iv,
    };
}

export async function decryptFile(
    encryptedBlob: Blob,
    hexKey: string,
    ivHex: string
): Promise<Blob> {
    const key = await importKey(hexKey);

    // Convert hex IV back to Uint8Array
    const iv = new Uint8Array(
        ivHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    const encryptedBuffer = await encryptedBlob.arrayBuffer();

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        key,
        encryptedBuffer
    );

    return new Blob([decryptedBuffer]);
}

export function arrayBufferToHex(buffer: ArrayBufferLike): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
