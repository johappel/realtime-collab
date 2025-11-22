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
            }
        }
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

        if (this.mode === 'nostr') {
            await this.initNostr();
        } else if (this.mode === 'group') {
            await this.initGroup();
        }
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
                console.warn("Group code not set");
                return;
            }

            // Generate private key from code
            this.groupPrivateKey = await generateKeyFromCode(this.groupCode);

            // Get public key
            const pubkey = getPubkeyFromPrivateKey(this.groupPrivateKey);
            this.user.pubkey = pubkey;
            this.user.color = getRandomColor(pubkey);

            // Get nickname from localStorage or use default
            const nickname = getOrSetLocalIdentity();
            this.user.name = nickname || 'GroupMember';
        } catch (e) {
            console.error("Failed to init Group mode:", e);
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
