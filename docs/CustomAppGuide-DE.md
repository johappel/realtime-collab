# Custom App Guide (Deutsch)

Dieser Leitfaden erklärt, wie man eine neue kollaborative Anwendung innerhalb der `realtime-collab` Plattform erstellt.

## 1. Architektur-Überblick

Jede App folgt demselben Muster:
1.  **UI-Komponente (`MyApp.svelte`)**: Reine UI, empfängt Daten über Svelte Stores.
2.  **Logik-Hook (`useMyAppYDoc.ts`)**: Wrappt `useNostrYDoc`, verwaltet Yjs-Datenstrukturen und stellt Svelte Stores bereit.
3.  **Route (`+page.svelte`)**: Verbindet den URL-Parameter `documentId` mit der App-Komponente und handhabt den `AppHeader`.

## 2. Schritt-für-Schritt-Implementierung

### Schritt 1: Ordnerstruktur erstellen
Erstelle einen neuen Ordner in `src/lib/apps/<app-name>/`.

### Schritt 2: Implementiere den Logik-Hook (`use<AppName>YDoc.ts`)

Dieser Hook ist das Gehirn deiner Anwendung. Er muss:
1.  Yjs über `useNostrYDoc` (oder `useLocalYDoc`) initialisieren.
2.  Yjs-Datentypen definieren (Maps, Arrays, Text).
3.  Yjs-Daten mit Svelte Stores synchronisieren (für die UI).
4.  Aktionen zum Ändern von Yjs-Daten exportieren.

**Vorlage:**

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

    // 1. Yjs initialisieren
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

    // 2. Yjs-Typen definieren
    const yItems = ydoc.getArray<Y.Map<any>>('my-app-items');
    const items = writable<MyItem[]>([]);

    // 3. Sync-Logik (Yjs -> Store)
    const sync = () => {
        const newItems = yItems.map(yMap => ({
            id: yMap.get('id'),
            text: yMap.get('text')
        }));
        items.set(newItems);
    };

    yItems.observeDeep(sync);
    sync(); // Initialer Sync

    // 4. Aktionen (UI -> Yjs)
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

### Schritt 3: Implementiere die UI-Komponente (`MyApp.svelte`)

Die UI sollte "dumm" sein. Sie rendert nur Daten aus Stores und ruft Aktionen auf.

**Wichtige Anforderungen:**
- Akzeptiere `documentId`, `user`, `mode` als Props.
- Rufe den Hook in `onMount` auf.
- Behandle `cleanup` in `onDestroy` (oder der Rückgabefunktion von `onMount`).
- **Wichtig:** Synchronisiere den Dokumenttitel mit `ydoc.getMap('metadata').get('title')`.
- **Wichtig:** Nutze `appState.mode` für reaktives Umschalten des Modus (nicht nur die Prop).

**Vorlage:**

```svelte
<script lang="ts">
    import { onMount, onDestroy, untrack } from 'svelte';
    import { useMyAppYDoc } from './useMyAppYDoc';
    import { loadConfig } from '$lib/config';
    import { getNip07Pubkey, signAndPublishNip07 } from '$lib/nostrUtils';
    import { appState } from '$lib/stores/appState.svelte'; // appState importieren
    import * as Y from 'yjs';

    let { 
        documentId, 
        user, 
        mode = 'local', // Initialer Modus aus Prop
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

    // Nutze eine innere async Funktion für onMount, um die Rückgabe eines Promise zu vermeiden
    onMount(() => {
        let cleanupFn: (() => void) | undefined;

        const init = async () => {
            // 1. Nostr Setup (falls nötig)
            let pubkey = '';
            let relays: string[] = [];
            let signAndPublish: any = null;

            // Nutze appState.mode um auf Header-Switches zu reagieren
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

            // 2. Hook initialisieren
            hook = useMyAppYDoc(documentId, mode, user, pubkey, signAndPublish, relays);
            
            // 3. Stores binden
            hook.items.subscribe(v => items = v);
            awareness = hook.awareness;

            // 4. Titel-Sync (Standard Pattern)
            const metaMap = hook.ydoc.getMap("metadata");
            const handleMetaUpdate = (event: Y.YMapEvent<any>) => {
                if (event.transaction.local) return;
                const storedTitle = metaMap.get("title") as string;
                if (storedTitle !== undefined && storedTitle !== title) {
                    title = storedTitle;
                }
            };
            metaMap.observe(handleMetaUpdate);
            
            // Initialer Titel-Sync
            const storedTitle = metaMap.get("title") as string;
            untrack(() => {
                if (storedTitle !== undefined && storedTitle !== title) {
                    title = storedTitle;
                } else if (storedTitle === undefined && title && title !== documentId) {
                    metaMap.set("title", title);
                }
            });

            cleanupFn = () => {
                metaMap.unobserve(handleMetaUpdate);
                hook.cleanup();
            };
        };

        init();

        return () => {
            if (cleanupFn) cleanupFn();
        };
    });

    // Titel-Änderungen in Yjs schreiben
    $effect(() => {
        if (!hook?.ydoc) return;
        const metaMap = hook.ydoc.getMap("metadata");
        const storedTitle = metaMap.get("title") as string;
        if (title && title !== storedTitle) {
            metaMap.set("title", title);
        }
    });
</script>

<!-- UI Implementierung -->
<ul>
    {#each items as item}
        <li>{item.text}</li>
    {/each}
</ul>
<button onclick={() => hook.addItem("New Item")}>Add</button>
```

### Schritt 4: Erstelle die Route (`src/routes/<app>/[documentId]/+page.svelte`)

Dies verbindet alles miteinander.

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
    
    // Nutze NICHT den URL-Parameter für den Modus, nutze appState!
    // let mode = $derived(pageStore.url.searchParams.get('mode') === 'nostr' ? 'nostr' : 'local');
    
    let awareness = $state(null);

    onMount(() => {
        appState.init();
    });
</script>

<div class="h-full w-full flex flex-col">
    <AppHeader 
        bind:documentId={docTitle}
        {awareness}
        showHistory={false}
        maxWidth={1024}
    />
    
    <div class="flex-1 relative overflow-hidden">
        {#key appState.mode}
            <MyApp 
                {documentId}
                user={appState.user}
                mode={appState.mode}
                bind:title={docTitle}
                bind:awareness={awareness}
            />
        {/key}
    </div>
</div>
```

## 3. Häufige Fallstricke

1.  **Async `onMount`:** Gib KEIN Promise von `onMount` zurück, wenn du eine Cleanup-Funktion benötigst. Svelte 5 (und 4) erwartet `void | () => void`. Wenn du `async () => { ... }` verwendest, wird ein Promise zurückgegeben. Definiere stattdessen eine `async` Funktion innerhalb und rufe sie auf, oder nutze `.then()`.
2.  **AppHeader Props:** `AppHeader` benötigt die Props `showHistory` und `maxWidth`. Stelle sicher, dass du sie übergibst.
3.  **Modus-Umschaltung:** Nutze `appState.mode`, um den App-Modus zu steuern. Der `AppHeader` aktualisiert `appState`, nicht die URL. Wenn du dich auf URL-Parameter verlässt, funktioniert der Header-Switch nicht. Nutze `{#key appState.mode}`, um die App neu zu mounten, wenn sich der Modus ändert.
4.  **Nostr-Verbindungen:** Die `nostrUtils.ts` Bibliothek handhabt das Connection-Pooling (`getRelayConnection`). Erstelle keine manuellen WebSocket-Verbindungen und nutze `SimplePool` nicht direkt, wenn möglich, um Konflikte zu vermeiden.
5.  **Fehlendes `untrack` beim Titel-Sync:** Svelte 5 Runes sind sehr empfindlich. Wenn du `title` innerhalb eines Effekts aktualisierst, der `title` liest, erhältst du eine Endlosschleife. Nutze `untrack` für das initiale Lesen.
6.  **Yjs-Transaktionen:** Wrappe Datenänderungen immer in `ydoc.transact(() => { ... })`, um Atomizität und korrektes Event-Firing sicherzustellen.
7.  **Cleanup:** Implementiere immer eine `cleanup`-Funktion in deinem Hook und rufe sie in `onDestroy` (oder der Rückgabefunktion von `onMount`) auf. Dies verhindert Speicherlecks und "Geister"-Verbindungen.
