import * as Y from 'yjs';
import { useNostrYDoc } from '$lib/useNostrYDoc';
import { useLocalYDoc } from '$lib/useLocalYDoc';
import { writable, type Writable } from 'svelte/store';

export interface WikiPage {
    id: string;
    title: string;
    lastModified: number;
}

export interface UseWikiYDocResult {
    pages: Writable<WikiPage[]>;
    activePageId: Writable<string | null>;
    ydoc: Y.Doc;
    provider: any;
    awareness: any;
    cleanup: () => void;
    createPage: (title: string) => string;
    deletePage: (id: string) => void;
    getPageFragment: (id: string) => Y.XmlFragment | null;
    setPageTitle: (id: string, title: string) => void;
}

export function useWikiYDoc(
    documentId: string,
    mode: 'local' | 'nostr' | 'group',
    user: { name: string; color: string },
    myPubkey?: string,
    signAndPublish?: (evt: any) => Promise<any>,
    relays?: string[]
): UseWikiYDocResult {
    let ydoc: Y.Doc;
    let provider: any;
    let awareness: any;
    let persistence: any;

    if ((mode === 'nostr' || mode === 'group') && myPubkey && signAndPublish) {
        console.log("[useWikiYDoc] Initializing Nostr/Group mode");
        // In group mode, use user.name as identifier to ensure unique clientID per user
        const userIdentifier = mode === 'group' ? user.name : undefined;
        const isGroupMode = mode === 'group';
        // Prefix documentId with app type to separate awareness between apps
        const appDocumentId = `wiki:${documentId}`;
        const result = useNostrYDoc(appDocumentId, myPubkey, signAndPublish, true, relays, userIdentifier, isGroupMode);
        ydoc = result.ydoc;
        provider = result.provider;
        awareness = result.awareness;
        persistence = result.persistence;
    } else {
        console.log("[useWikiYDoc] Initializing Local mode (fallback or requested)");
        const result = useLocalYDoc(documentId);
        ydoc = result.ydoc;
        awareness = result.awareness;
        persistence = result.persistence;
    }

    const wikiPagesMap = ydoc.getMap<Y.Map<any>>('wiki-pages');
    const pages = writable<WikiPage[]>([]);
    const activePageId = writable<string | null>(null);

    const syncPages = () => {
        const p: WikiPage[] = [];
        wikiPagesMap.forEach((pageMap, id) => {
            p.push({
                id,
                title: pageMap.get('title') || 'Untitled',
                lastModified: pageMap.get('lastModified') || 0
            });
        });
        p.sort((a, b) => a.title.localeCompare(b.title));
        pages.set(p);
    };

    wikiPagesMap.observeDeep(syncPages);
    syncPages();

    const createPage = (title: string) => {
        const id = crypto.randomUUID();
        ydoc.transact(() => {
            const pageMap = new Y.Map();
            pageMap.set('title', title);
            pageMap.set('lastModified', Date.now());
            // Use nested fragment for standard Yjs structure
            pageMap.set('content', new Y.XmlFragment()); 
            wikiPagesMap.set(id, pageMap);
        });
        return id;
    };

    const deletePage = (id: string) => {
        ydoc.transact(() => {
            wikiPagesMap.delete(id);
        });
        activePageId.update(current => current === id ? null : current);
    };

    const getPageFragment = (id: string) => {
        const pageMap = wikiPagesMap.get(id);
        if (pageMap) {
            return pageMap.get('content') as Y.XmlFragment;
        }
        return null;
    };
    
    const setPageTitle = (id: string, title: string) => {
        ydoc.transact(() => {
            const pageMap = wikiPagesMap.get(id);
            if (pageMap) {
                pageMap.set('title', title);
                pageMap.set('lastModified', Date.now());
            }
        });
    };

    const cleanup = () => {
        wikiPagesMap.unobserveDeep(syncPages);
        if (provider && typeof provider.destroy === 'function') provider.destroy();
        if (awareness) awareness.destroy();
        if (persistence && typeof persistence.destroy === 'function') persistence.destroy();
        ydoc.destroy();
    };

    return {
        pages,
        activePageId,
        ydoc,
        provider,
        awareness,
        cleanup,
        createPage,
        deletePage,
        getPageFragment,
        setPageTitle
    };
}
