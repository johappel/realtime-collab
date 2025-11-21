import { loadConfig } from '$lib/config';
import { getNip07Pubkey, fetchNostrProfile, getRandomColor } from '$lib/nostrUtils';

class AppState {
    mode = $state<'local' | 'nostr'>('local');
    user = $state({ name: 'Anon', color: '#ff0000', pubkey: '' });
    relays = $state<string[]>([]);
    
    constructor() {
        // Load initial state from localStorage if available
        if (typeof localStorage !== 'undefined') {
            const storedMode = localStorage.getItem('app_mode');
            if (storedMode === 'nostr' || storedMode === 'local') {
                this.mode = storedMode;
            }
        }
    }

    setMode(newMode: 'local' | 'nostr') {
        this.mode = newMode;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('app_mode', newMode);
        }
        if (newMode === 'nostr') {
            this.initNostr();
        }
    }

    async init() {
        const config = await loadConfig();
        this.relays = config.docRelays;
        
        if (this.mode === 'nostr') {
            await this.initNostr();
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
}

export const appState = new AppState();
