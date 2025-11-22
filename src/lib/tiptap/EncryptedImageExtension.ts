import { Image } from '@tiptap/extension-image';
import { appState } from '../stores/appState.svelte';
import { decryptFile } from '../cryptoUtils';
import type { NodeViewProps } from '@tiptap/core';

export const EncryptedImage = Image.extend({
    name: 'encryptedImage',

    addAttributes() {
        return {
            // @ts-ignore
            ...this.parent?.(),
            src: {
                default: null,
            },
            alt: {
                default: null,
            },
            title: {
                default: null,
            },
            iv: {
                default: null,
            },
            mimetype: {
                default: 'image/jpeg',
            },
        };
    },

    addNodeView() {
        return ({ node, getPos }: NodeViewProps) => {
            const dom = document.createElement('div');
            dom.classList.add('encrypted-image-wrapper');

            const img = document.createElement('img');
            img.classList.add('encrypted-image');
            // Add a loading state
            img.style.opacity = '0.5';
            img.alt = 'Loading encrypted image...';

            dom.appendChild(img);

            const { src, iv, mimetype } = node.attrs;

            if (!src || !iv) {
                img.alt = 'Invalid encrypted image data';
                return { dom };
            }

            // Decryption logic
            const loadAndDecrypt = async () => {
                try {
                    // 1. Fetch the encrypted blob
                    console.log('Fetching encrypted image from:', src);
                    const response = await fetch(src);
                    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
                    const encryptedBlob = await response.blob();
                    console.log('Fetched blob:', encryptedBlob.size, encryptedBlob.type);

                    // 2. Get the group key
                    // We assume we are in group mode if we are seeing this.
                    // If we are not in group mode, we can't decrypt it (unless we have the key otherwise).
                    const key = appState.groupPrivateKey;

                    if (!key) {
                        throw new Error('No decryption key available (not logged in?)');
                    }

                    // 3. Decrypt
                    const decryptedBlob = await decryptFile(encryptedBlob, key, iv);

                    // 4. Create Object URL
                    const url = URL.createObjectURL(decryptedBlob);
                    img.src = url;
                    img.style.opacity = '1';
                    img.alt = node.attrs.alt || '';

                } catch (e) {
                    console.error('Failed to load encrypted image:', e);
                    img.alt = '⚠️ Decryption Failed';
                    img.style.border = '2px solid red';
                }
            };

            loadAndDecrypt();

            return {
                dom,
                destroy: () => {
                    // Cleanup object URL to avoid memory leaks
                    if (img.src.startsWith('blob:')) {
                        URL.revokeObjectURL(img.src);
                    }
                }
            };
        };
    },
});
