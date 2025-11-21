<script lang="ts">
    import { useWikiYDoc } from './useWikiYDoc';
    import WikiEditor from './WikiEditor.svelte';
    import { onMount, onDestroy } from 'svelte';
    import { getNip07Pubkey, signAndPublishNip07 } from '$lib/nostrUtils';
    import { loadConfig } from '$lib/config';
    import * as Y from 'yjs';

    import { untrack } from 'svelte';

    let { 
        documentId, 
        user, 
        mode = 'local',
        title = $bindable(''),
        searchQuery = $bindable(''),
        showSidebar = $bindable(true),
        awareness = $bindable(null)
    } = $props<{
        documentId: string;
        user: { name: string; color: string };
        mode?: 'local' | 'nostr';
        title?: string;
        searchQuery?: string;
        showSidebar?: boolean;
        awareness?: any;
    }>();

    let wikiHook: ReturnType<typeof useWikiYDoc> | null = $state(null);
    let pages = $state<{id: string, title: string}[]>([]);
    let activePageId: string | null = $state(null);
    let activeFragment: Y.XmlFragment | null = $state(null);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let ydoc: Y.Doc | null = $state(null);
    let saveStatus = $state<'saved' | 'saving' | 'error'>('saved');

    // Derived filtered pages
    let filteredPages = $derived(
        pages.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    export function createPage(title: string) {
        if (!title.trim() || !wikiHook) return;
        const id = wikiHook.createPage(title.trim());
        wikiHook.activePageId.set(id);
    }

    onMount(() => {
        console.log("[WikiApp] onMount started, mode:", mode);
        
        let cleanupFn: (() => void) | undefined;

        const init = async () => {
            let pubkey: string | undefined;
            let signAndPublish: any;
            let relays: string[] | undefined;

            if (mode === 'nostr') {
                try {
                    console.log("[WikiApp] Getting pubkey...");
                    pubkey = await getNip07Pubkey();
                    console.log("[WikiApp] Got pubkey:", pubkey);
                    const config = await loadConfig();
                    relays = config.docRelays;
                    signAndPublish = async (evt: any) => {
                        console.log("[WikiApp] signAndPublish called for kind:", evt.kind);
                        saveStatus = 'saving';
                        try {
                            const res = await signAndPublishNip07(evt, relays);
                            saveStatus = 'saved';
                            return res;
                        } catch (e) {
                            console.error("Failed to publish", e);
                            saveStatus = 'error';
                            return undefined;
                        }
                    };
                } catch (e) {
                    console.error("Nostr init failed", e);
                    error = "Nostr-Verbindung fehlgeschlagen. Bitte stelle sicher, dass du eine Nostr-Extension (z.B. Alby) installiert hast.";
                    loading = false;
                    return;
                }
            }

            console.log("[WikiApp] Initializing useWikiYDoc with:", { documentId, mode, pubkey, hasSigner: !!signAndPublish });
            wikiHook = useWikiYDoc(documentId, mode, user, pubkey, signAndPublish, relays);
            ydoc = wikiHook.ydoc;
            awareness = wikiHook.awareness;
            
            // Subscribe to stores
            const unsubPages = wikiHook.pages.subscribe(p => pages = p);
            const unsubActive = wikiHook.activePageId.subscribe(id => {
                activePageId = id;
                if (id && wikiHook) {
                    activeFragment = wikiHook.getPageFragment(id);
                } else {
                    activeFragment = null;
                }
            });

            // Title Sync Logic
            const metaMap = ydoc.getMap("metadata");

            const handleMetaUpdate = (event: Y.YMapEvent<any>) => {
                if (event.transaction.local) return;
                const storedTitle = metaMap.get("title") as string;
                if (storedTitle !== undefined && storedTitle !== title) {
                    title = storedTitle;
                }
            };

            metaMap.observe(handleMetaUpdate);
            
            // Initial sync
            const storedTitle = metaMap.get("title") as string;
            untrack(() => {
                if (storedTitle !== undefined && storedTitle !== title) {
                    title = storedTitle;
                } else if (storedTitle === undefined && title && title !== documentId) {
                    metaMap.set("title", title);
                }
            });

            loading = false;

            cleanupFn = () => {
                unsubPages();
                unsubActive();
                metaMap.unobserve(handleMetaUpdate);
                wikiHook?.cleanup();
            };
        };

        init();

        return () => {
            if (cleanupFn) cleanupFn();
        };
    });

    // Write title changes to Yjs
    $effect(() => {
        if (!ydoc) return;
        const metaMap = ydoc.getMap("metadata");
        const storedTitle = metaMap.get("title") as string;
        
        if (title && title !== storedTitle) {
            metaMap.set("title", title);
        }
    });

    // Sync user state with awareness
    $effect(() => {
        if (awareness && user) {
            console.log("[WikiApp] Updating awareness user state", user);
            const currentState = awareness.getLocalState() as any;
            const newUser = {
                name: user.name,
                color: user.color,
            };
            
            if (!currentState || 
                currentState.user?.name !== newUser.name || 
                currentState.user?.color !== newUser.color) {
                
                awareness.setLocalStateField("user", newUser);
            }
        }
    });

    function selectPage(id: string) {
        wikiHook?.activePageId.set(id);
    }

    function handleDeletePage(id: string, e: Event) {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this page?')) {
            wikiHook?.deletePage(id);
        }
    }
    
    function handleTitleChange(e: Event) {
        const target = e.target as HTMLInputElement;
        if (activePageId && wikiHook) {
            wikiHook.setPageTitle(activePageId, target.value);
        }
    }
</script>

<div class="wiki-container">
    {#if showSidebar}
    <div class="sidebar">
        <div class="sidebar-header">
            <h3>Seiten ({filteredPages.length})</h3>
        </div>
        
        <div class="page-list">
            {#each filteredPages as page}
                <div 
                    class="page-item" 
                    class:active={page.id === activePageId}
                    role="button"
                    tabindex="0"
                    onclick={() => selectPage(page.id)}
                    onkeydown={(e) => e.key === 'Enter' && selectPage(page.id)}
                >
                    <span class="page-title">{page.title}</span>
                    <button class="delete-btn" onclick={(e) => handleDeletePage(page.id, e)}>×</button>
                </div>
            {/each}
            {#if filteredPages.length === 0}
                <div class="no-results">Keine Seiten gefunden.</div>
            {/if}
        </div>
    </div>
    {/if}

    <div class="main-content">
        {#if error}
            <div class="error-state">
                <h2>Verbindungsfehler</h2>
                <p>{error}</p>
                <button onclick={() => window.location.reload()}>Neu laden</button>
                <p class="hint">Oder wechsle in den <a href="?mode=local">lokalen Modus</a>.</p>
            </div>
        {:else if loading}
            <div class="loading">Loading Wiki...</div>
        {:else if activePageId && activeFragment && wikiHook}
            <div class="page-header">
                <div class="flex justify-between items-center">
                    <input 
                        type="text" 
                        class="title-input" 
                        value={pages.find(p => p.id === activePageId)?.title} 
                        oninput={handleTitleChange}
                    />
                    {#if mode === 'nostr'}
                        <div class="text-xs px-2 py-1 rounded" class:bg-green-100={saveStatus === 'saved'} class:bg-yellow-100={saveStatus === 'saving'} class:bg-red-100={saveStatus === 'error'}>
                            {#if saveStatus === 'saved'}
                                <span class="text-green-700">Gespeichert</span>
                            {:else if saveStatus === 'saving'}
                                <span class="text-yellow-700">Speichere...</span>
                            {:else}
                                <span class="text-red-700">Fehler</span>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
            <div class="editor-wrapper">
                <WikiEditor 
                    fragment={activeFragment} 
                    awareness={wikiHook.awareness} 
                    user={user}
                />
            </div>
        {:else}
            <div class="empty-state">
                <h2>Welcome to the Wiki</h2>
                <p>Select a page from the sidebar or create a new one.</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .wiki-container {
        display: flex;
        height: 100%;
        width: 100%;
        overflow: hidden;
    }

    .sidebar {
        width: 250px;
        background: #f3f4f6;
        border-right: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
    }

    :global(.dark) .sidebar {
        background: #1f2937;
        border-color: #374151;
    }

    .sidebar-header {
        padding: 1rem;
        border-bottom: 1px solid #e5e7eb;
    }

    :global(.dark) .sidebar-header {
        border-color: #374151;
    }

    .page-list {
        flex: 1;
        overflow-y: auto;
        padding: 0.5rem;
    }

    .page-item {
        padding: 0.5rem;
        cursor: pointer;
        border-radius: 0.25rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .page-item:hover {
        background: #e5e7eb;
    }

    .page-item.active {
        background: #dbeafe;
        color: #1e40af;
    }

    :global(.dark) .page-item:hover {
        background: #374151;
    }

    :global(.dark) .page-item.active {
        background: #1e3a8a;
        color: #bfdbfe;
    }

    .delete-btn {
        background: none;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        font-size: 1.2rem;
        padding: 0 0.25rem;
    }

    .delete-btn:hover {
        color: #ef4444;
    }

    .main-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .page-header {
        padding: 1rem;
        border-bottom: 1px solid #e5e7eb;
    }

    :global(.dark) .page-header {
        border-color: #374151;
    }

    .title-input {
        font-size: 1.5rem;
        font-weight: bold;
        width: 100%;
        border: none;
        background: transparent;
        outline: none;
        color: inherit;
    }

    .editor-wrapper {
        flex: 1;
        overflow: hidden;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #6b7280;
    }
    
    .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
    }

    .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #991b1b;
        padding: 2rem;
        text-align: center;
    }

    .error-state button {
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 0.25rem;
        cursor: pointer;
    }

    .error-state .hint {
        margin-top: 1rem;
        color: #6b7280;
        font-size: 0.9rem;
    }

    .no-results {
        padding: 1rem;
        color: #6b7280;
        font-style: italic;
        text-align: center;
    }
</style>
