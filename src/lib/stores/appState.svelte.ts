import { loadConfig } from '$lib/config';
import { getNip07Pubkey, fetchNostrProfile, getRandomColor, generateKeyFromCode, getOrSetLocalIdentity } from '$lib/nostrUtils';
import { getPubkeyFromPrivateKey } from '$lib/groupAuth';

class AppState {
    mode = $state<'local' | 'nostr' | 'group'>('local');
    user = $state({ name: 'Anon', color: '#ff0000', pubkey: '' });
    relays = $state<string[]>([]);

    // Group mode specific
    groupCode = $state<string | null>(null);
    groupPrivateKey = $state<string | null>(null);
    
    // Track initialization state
    private initPromise: Promise<void> | null = null;
    isInitialized = $state(false);

    constructor() {
        // Load initial state from localStorage if available
        if (typeof localStorage !== 'undefined') {
            const storedMode = localStorage.getItem('app_mode');

            if (storedMode === 'nostr' || storedMode === 'local' || storedMode === 'group') {
                this.mode = storedMode as 'local' | 'nostr' | 'group';
            }

            // Restore group code if in group mode
            if (this.mode === 'group') {
                this.groupCode = localStorage.getItem('app_group_code');
                
                // CRITICAL: Initialize group mode immediately to restore user identity
                // This ensures user.name and user.color are set BEFORE apps initialize
                if (this.groupCode) {
                    this.initPromise = this.initGroup();
                    this.initPromise.finally(() => this.isInitialized = true);
                }
            }
        }
    }
    
    // Ensure initialization is complete before proceeding
    async ensureInitialized() {
        if (this.initPromise) {
            await this.initPromise;
        }
        return true;
    }

    setMode(newMode: 'local' | 'nostr' | 'group') {
        this.mode = newMode;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('app_mode', newMode);
        }
        if (newMode === 'nostr') {
            this.initNostr();
        } else if (newMode === 'group') {
            this.initGroup();
        }
    }

    async init() {
        const config = await loadConfig();
        this.relays = config.docRelays;

        // If already initializing (from constructor), wait for it
        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        if (this.mode === 'nostr') {
            await this.initNostr();
        } else if (this.mode === 'group') {
            this.initPromise = this.initGroup();
            await this.initPromise;
        }
        
        this.isInitialized = true;
    }

    async initNostr() {
        try {
            const config = await loadConfig();
            const pubkey = await getNip07Pubkey();
            this.user.pubkey = pubkey;
            this.user.color = getRandomColor(pubkey);

            const profile = await fetchNostrProfile(pubkey, config.profileRelays);
            if (profile && profile.name) {
                this.user.name = profile.name;
            } else {
                this.user.name = "NostrUser";
            }
        } catch (e) {
            console.error("Failed to init Nostr profile:", e);
        }
    }

    async initGroup() {
        try {
            if (!this.groupCode) {
                console.warn("[initGroup] Group code not set");
                return;
            }

            // Generate private key from code
            this.groupPrivateKey = await generateKeyFromCode(this.groupCode);

            // Get public key
            const pubkey = getPubkeyFromPrivateKey(this.groupPrivateKey);
            this.user.pubkey = pubkey;

            // Get nickname from localStorage or generate unique default
            let nickname = getOrSetLocalIdentity();
            if (!nickname) {
                // Generate a unique nickname if none exists
                // Use a random ID to ensure each browser/tab has a unique identity
                const randomId = Math.random().toString(36).substring(2, 8);
                nickname = `User-${randomId}`;
                getOrSetLocalIdentity(nickname); // Save it for consistency
            }
            this.user.name = nickname;
            
            // IMPORTANT: Generate color based on nickname, NOT pubkey!
            // In group mode, all users share the same pubkey, so we need
            // unique colors per user based on their individual nickname.
            this.user.color = getRandomColor(this.user.name);
        } catch (e) {
            console.error("[initGroup] ❌ Failed to init Group mode:", e);
        }
    }

    async setGroupCode(code: string, nickname?: string) {
        this.groupCode = code;

        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('app_group_code', code);
        }

        if (nickname) {
            getOrSetLocalIdentity(nickname);
        }

        this.setMode('group');
    }

    clearGroupAuth() {
        this.groupCode = null;
        this.groupPrivateKey = null;
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('app_group_code');
        }
    }
}

export const appState = new AppState();
