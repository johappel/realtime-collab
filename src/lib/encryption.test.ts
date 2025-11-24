import { describe, it, expect } from 'vitest';
import { generateKeyFromCode, encryptForGroup, decryptForGroup } from './nostrUtils';
import { getPublicKey } from 'nostr-tools';

// Helper to convert hex to bytes (duplicated from nostrUtils for test isolation if needed, 
// but we are testing the exported functions so we rely on them)

describe('NIP-44 Group Encryption', () => {
    it('should generate a deterministic key from a group code', async () => {
        const code = 'TEST-GROUP-123';
        const key1 = await generateKeyFromCode(code);
        const key2 = await generateKeyFromCode(code);
        
        expect(key1).toBe(key2);
        expect(key1).toHaveLength(64); // 32 bytes hex encoded
    });

    it('should encrypt and decrypt a message correctly', async () => {
        const code = 'SECRET-GROUP';
        const groupPrivateKey = await generateKeyFromCode(code);
        
        const originalMessage = 'Hello World - Yjs Update Base64';
        
        // Encrypt
        const encrypted = encryptForGroup(originalMessage, groupPrivateKey);
        expect(encrypted).not.toBe(originalMessage);
        expect(typeof encrypted).toBe('string');
        
        // Decrypt
        const decrypted = decryptForGroup(encrypted, groupPrivateKey);
        expect(decrypted).toBe(originalMessage);
    });

    it('should fail to decrypt with wrong key', async () => {
        const code1 = 'GROUP-A';
        const code2 = 'GROUP-B';
        const key1 = await generateKeyFromCode(code1);
        const key2 = await generateKeyFromCode(code2);
        
        const message = 'Secret Data';
        const encrypted = encryptForGroup(message, key1);
        
        expect(() => {
            decryptForGroup(encrypted, key2);
        }).toThrow();
    });

    it('should handle empty strings', async () => {
        const code = 'EMPTY-TEST';
        const key = await generateKeyFromCode(code);
        const message = '';
        
        const encrypted = encryptForGroup(message, key);
        const decrypted = decryptForGroup(encrypted, key);
        
        expect(decrypted).toBe(message);
    });

    it('should handle long messages (simulating large Yjs updates)', async () => {
        const code = 'LARGE-TEST';
        const key = await generateKeyFromCode(code);
        
        // Generate 10KB string
        const message = 'A'.repeat(10000);
        
        const encrypted = encryptForGroup(message, key);
        const decrypted = decryptForGroup(encrypted, key);
        
        expect(decrypted).toBe(message);
    });
});
