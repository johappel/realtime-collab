<script lang="ts">
    import { onMount } from "svelte";
    import { decryptFile } from "$lib/cryptoUtils";
    import { appState } from "$lib/stores/appState.svelte";

    let {
        src,
        iv,
        mimetype = "image/png",
        alt = "Encrypted image",
        width,
        height,
        class: className = "",
    }: {
        src: string;
        iv: string;
        mimetype?: string;
        alt?: string;
        width?: number;
        height?: number;
        class?: string;
    } = $props();

    let decryptedUrl = $state<string | null>(null);
    let error = $state<string | null>(null);
    let loading = $state(true);

    onMount(async () => {
        try {
            // 1. Fetch the encrypted blob
            const response = await fetch(src);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status}`);
            }
            const encryptedBlob = await response.blob();

            // 2. Get the group key
            const key = appState.groupPrivateKey;
            if (!key) {
                throw new Error("No decryption key available");
            }

            // 3. Decrypt
            const decryptedBlob = await decryptFile(encryptedBlob, key, iv);

            // 4. Create Object URL
            const url = URL.createObjectURL(decryptedBlob);
            decryptedUrl = url;
            loading = false;
        } catch (e) {
            console.error("Failed to load encrypted image:", e);
            error = e instanceof Error ? e.message : "Decryption failed";
            loading = false;
        }
    });

    // Cleanup in $effect
    $effect(() => {
        return () => {
            if (decryptedUrl) {
                URL.revokeObjectURL(decryptedUrl);
            }
        };
    });
</script>

{#if loading}
    <div
        class="encrypted-image-loading {className}"
        style:width={width ? `${width}px` : undefined}
        style:height={height ? `${height}px` : undefined}
    >
        Loading...
    </div>
{:else if error}
    <div
        class="encrypted-image-error {className}"
        style:width={width ? `${width}px` : undefined}
        style:height={height ? `${height}px` : undefined}
    >
        ⚠️ {error}
    </div>
{:else if decryptedUrl}
    <img
        src={decryptedUrl}
        {alt}
        {width}
        {height}
        class="encrypted-image {className}"
    />
{/if}

<style>
    .encrypted-image-loading,
    .encrypted-image-error {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f0f0f0;
        border: 1px solid #ddd;
        border-radius: 4px;
        min-width: 100px;
        min-height: 100px;
    }

    .encrypted-image-error {
        color: #d32f2f;
        border-color: #d32f2f;
    }

    .encrypted-image {
        display: block;
        max-width: 100%;
        height: auto;
    }
</style>
