# Custom App Guide

This guide explains how to create a new collaborative application within the `realtime-collab` platform.

## 1. Architecture Overview

Every app follows the same pattern:
1.  **UI Component (`MyApp.svelte`)**: Pure UI, receives data via Svelte stores.
2.  **Logic Hook (`useMyAppYDoc.ts`)**: Wraps `useNostrYDoc`, manages Yjs data structures, and exposes Svelte stores.
3.  **Route (`+page.svelte`)**: Connects the URL parameter `documentId` to the App component and handles the `AppHeader`.

## 2. Step-by-Step Implementation

### Step 1: Create Directory Structure
Create a new folder in `src/lib/apps/<app-name>/`.

### Step 2: Implement the Logic Hook (`use<AppName>YDoc.ts`)

This hook is the brain of your application. It must:
1.  Initialize Yjs via `useNostrYDoc` (or `useLocalYDoc`).
2.  Define Yjs data types (Maps, Arrays, Text).
3.  Sync Yjs data to Svelte stores (for the UI).
4.  Export actions to modify Yjs data.

**Template:**

```typescript
import * as Y from 'yjs';
import { useNostrYDoc } from '$lib/useNostrYDoc';
import { useLocalYDoc } from '$lib/useLocalYDoc';
import { writable, type Writable } from 'svelte/store';

export interface MyItem {
    id: string;
    text: string;
}

export interface UseMyAppResult {
    items: Writable<MyItem[]>;
    ydoc: Y.Doc;
    provider: any;
    awareness: any;
    cleanup: () => void;
    addItem: (text: string) => void;
}

export function useMyAppYDoc(
    documentId: string,
    mode: 'local' | 'nostr',
    user: { name: string; color: string },
    myPubkey?: string,
    signAndPublish?: (evt: any) => Promise<any>,
    relays?: string[]
): UseMyAppResult {
    let ydoc: Y.Doc;
    let provider: any;
    let awareness: any;
    let persistence: any;

    // 1. Initialize Yjs
    if (mode === 'nostr' && myPubkey && signAndPublish) {
        const result = useNostrYDoc(documentId, myPubkey, signAndPublish, false, relays);
        ydoc = result.ydoc;
        provider = result.provider;
        awareness = result.awareness;
        persistence = result.persistence;
    } else {
        const result = useLocalYDoc(documentId);
        ydoc = result.ydoc;
        awareness = result.awareness;
        persistence = result.persistence;
    }

    // 2. Define Yjs Types
    const yItems = ydoc.getArray<Y.Map<any>>('my-app-items');
    const items = writable<MyItem[]>([]);

    // 3. Sync Logic (Yjs -> Store)
    const sync = () => {
        const newItems = yItems.map(yMap => ({
            id: yMap.get('id'),
            text: yMap.get('text')
        }));
        items.set(newItems);
    };

    yItems.observeDeep(sync);
    sync(); // Initial sync

    // 4. Actions (UI -> Yjs)
    const addItem = (text: string) => {
        ydoc.transact(() => {
            const yMap = new Y.Map();
            yMap.set('id', crypto.randomUUID());
            yMap.set('text', text);
            yItems.push([yMap]);
        });
    };

    const cleanup = () => {
        yItems.unobserveDeep(sync);
        if (provider?.destroy) provider.destroy();
        if (awareness?.destroy) awareness.destroy();
        if (persistence?.destroy) persistence.destroy();
        ydoc.destroy();
    };

    return { items, ydoc, provider, awareness, cleanup, addItem };
}
```

### Step 3: Implement the UI Component (`MyApp.svelte`)

The UI should be "dumb". It just renders data from stores and calls actions.

**Key Requirements:**
- Accept `documentId`, `user`, `mode` as props.
- Call the hook in `onMount`.
- Handle `cleanup` in `onDestroy`.
- **Important:** Sync the document title with `ydoc.getMap('metadata').get('title')`.

**Template:**

```svelte
<script lang="ts">
    import { onMount, onDestroy, untrack } from 'svelte';
    import { useMyAppYDoc } from './useMyAppYDoc';
    import { loadConfig } from '$lib/config';
    import { getNip07Pubkey, signAndPublishNip07 } from '$lib/nostrUtils';
    import * as Y from 'yjs';

    let { 
        documentId, 
        user, 
        mode = 'local',
        title = $bindable(''),
        awareness = $bindable(null)
    } = $props<{
        documentId: string;
        user: { name: string; color: string };
        mode?: 'local' | 'nostr';
        title?: string;
        awareness?: any;
    }>();

    let hook: ReturnType<typeof useMyAppYDoc>;
    let items = $state([]); 

    onMount(async () => {
        // 1. Setup Nostr (if needed)
        let pubkey = '';
        let relays: string[] = [];
        let signAndPublish: any = null;

        if (mode === 'nostr') {
            try {
                const config = await loadConfig();
                relays = config.docRelays;
                pubkey = await getNip07Pubkey();
                signAndPublish = (evt: any) => signAndPublishNip07(evt, relays);
            } catch (e) {
                console.error("Nostr init failed", e);
            }
        }

        // 2. Initialize Hook
        hook = useMyAppYDoc(documentId, mode, user, pubkey, signAndPublish, relays);
        
        // 3. Bind Stores
        hook.items.subscribe(v => items = v);
        awareness = hook.awareness;

        // 4. Title Sync (Standard Pattern)
        const metaMap = hook.ydoc.getMap("metadata");
        const handleMetaUpdate = (event: Y.YMapEvent<any>) => {
            if (event.transaction.local) return;
            const storedTitle = metaMap.get("title") as string;
            if (storedTitle !== undefined && storedTitle !== title) {
                title = storedTitle;
            }
        };
        metaMap.observe(handleMetaUpdate);
        
        // Initial Title Sync
        const storedTitle = metaMap.get("title") as string;
        untrack(() => {
            if (storedTitle !== undefined && storedTitle !== title) {
                title = storedTitle;
            } else if (storedTitle === undefined && title && title !== documentId) {
                metaMap.set("title", title);
            }
        });

        return () => {
            metaMap.unobserve(handleMetaUpdate);
            hook.cleanup();
        };
    });

    // Write title changes to Yjs
    $effect(() => {
        if (!hook?.ydoc) return;
        const metaMap = hook.ydoc.getMap("metadata");
        const storedTitle = metaMap.get("title") as string;
        if (title && title !== storedTitle) {
            metaMap.set("title", title);
        }
    });
</script>

<!-- UI Implementation -->
<ul>
    {#each items as item}
        <li>{item.text}</li>
    {/each}
</ul>
<button onclick={() => hook.addItem("New Item")}>Add</button>
```

### Step 4: Create the Route (`src/routes/<app>/[documentId]/+page.svelte`)

This connects everything.

```svelte
<script lang="ts">
    import { page } from '$app/stores';
    import MyApp from '$lib/apps/my-app/MyApp.svelte';
    import AppHeader from '$lib/AppHeader.svelte';
    import { appState } from '$lib/stores/appState.svelte';
    import { untrack, onMount } from 'svelte';
    
    let { data } = $props();
    const pageStore = $state($page);
    let documentId = $derived(pageStore.params.documentId ?? 'default');
    let docTitle = $state(untrack(() => documentId));
    let mode = $derived(pageStore.url.searchParams.get('mode') === 'nostr' ? 'nostr' : 'local');
    
    let awareness = $state(null);

    onMount(() => {
        appState.init();
    });
</script>

<div class="h-full w-full flex flex-col">
    <AppHeader 
        bind:documentId={docTitle}
        {awareness}
        {mode}
    />
    
    <div class="flex-1 relative overflow-hidden">
        {#key mode}
            <MyApp 
                {documentId}
                user={appState.user}
                {mode}
                bind:title={docTitle}
                bind:awareness={awareness}
            />
        {/key}
    </div>
</div>
```

## 3. Common Pitfalls

1.  **Missing `untrack` in Title Sync:** Svelte 5 Runes are very sensitive. If you update `title` inside an effect that reads `title`, you get an infinite loop. Use `untrack` for the initial read.
2.  **Nostr Init Failure:** Always wrap `getNip07Pubkey` in a try/catch block. If it fails, the app should still load (maybe in read-only or local mode).
3.  **Yjs Transactions:** Always wrap data modifications in `ydoc.transact(() => { ... })` to ensure atomicity and correct event firing.
4.  **Cleanup:** Always implement a `cleanup` function in your hook and call it in `onDestroy` (or the return function of `onMount`). This prevents memory leaks and "ghost" connections.
