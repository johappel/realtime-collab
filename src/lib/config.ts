export interface AppConfig {
    docRelays: string[];
    profileRelays: string[];
    blossomServer?: string;
    blossomRequireAuth?: boolean;
}

const fallbackDefaults: AppConfig = {
    docRelays: ['ws://localhost:7000'],
    profileRelays: ['wss://relay.damus.io', 'wss://nos.lol'],
    blossomServer: 'https://cdn.satellite.earth',
    blossomRequireAuth: false,
};

let configCache: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
    if (configCache) return configCache;

    try {
        const res = await fetch('/config.json');
        if (!res.ok) throw new Error('Failed to load config.json');
        const loaded = await res.json();
        configCache = { ...fallbackDefaults, ...loaded };
        return configCache!;
    } catch (e) {
        console.error('Error loading config:', e);
        return fallbackDefaults;
    }
}
