export interface AppConfig {
    docRelays: string[];
    profileRelays: string[];
}

let configCache: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
    if (configCache) return configCache;

    try {
        const res = await fetch('/config.json');
        if (!res.ok) throw new Error('Failed to load config.json');
        configCache = await res.json();
        return configCache!;
    } catch (e) {
        console.error('Error loading config:', e);
        // Fallback defaults
        return {
            docRelays: ['ws://localhost:7000'],
            profileRelays: ['wss://relay.damus.io', 'ws://localhost:7000']
        };
    }
}
