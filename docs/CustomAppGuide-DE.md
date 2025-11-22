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
    mode: 'local' | 'nostr' | 'group',  // ✅ Group Mode hinzugefügt
    user: { name: string; color: string; pubkey: string },  // ✅ pubkey hinzugefügt
    signAndPublish?: (evt: any) => Promise<any>,
    relays?: string[]
): UseMyAppResult {
    let ydoc: Y.Doc;
    let provider: any;
    let awareness: any;
    let persistence: any;

    // 1. Yjs initialisieren
    // ✅ KRITISCH: App-Präfix für Document-Isolation!
    const appDocumentId = `myapp:${documentId}`;
    
    // ✅ Group Mode Support
    const isGroupMode = mode === 'group';
    const userIdentifier = user.name; // Nickname als Identifier
    
    if (mode === 'nostr' || mode === 'group') {
        // ✅ Alle 7 Parameter übergeben!
        const result = useNostrYDoc(
            appDocumentId,        // 1. Mit App-Präfix!
            user.pubkey,          // 2. Pubkey (auch für Group Mode)
            signAndPublish!,      // 3. Sign-Funktion
            false,                // 4. Persistence (meist false für Apps)
            relays,               // 5. Relay-Liste
            userIdentifier,       // 6. ✅ User Identifier (für Client ID)
            isGroupMode           // 7. ✅ Group Mode Flag
        );
        ydoc = result.ydoc;
        provider = result.provider;
        awareness = result.awareness;
        persistence = result.persistence;
    } else {
        const result = useLocalYDoc(appDocumentId);  // ✅ Auch hier App-Präfix!
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
        user: { name: string; color: string; pubkey: string };  // ✅ pubkey hinzugefügt
        mode?: 'local' | 'nostr' | 'group';  // ✅ Group Mode hinzugefügt
        title?: string;
        awareness?: any;
    }>();

    let hook: ReturnType<typeof useMyAppYDoc>;
    let items = $state([]); 

    // Nutze eine innere async Funktion für onMount, um die Rückgabe eines Promise zu vermeiden
    onMount(() => {
        let cleanupFn: (() => void) | undefined;

        const init = async () => {
            // 1. Nostr/Group Setup (falls nötig)
            let relays: string[] = [];
            let signAndPublish: any = null;

            // Nutze appState.mode um auf Header-Switches zu reagieren
            if (mode === 'nostr' || mode === 'group') {
                try {
                    const config = await loadConfig();
                    relays = config.docRelays;
                    
                    if (mode === 'nostr') {
                        // NIP-07 Browser Extension
                        signAndPublish = (evt: any) => signAndPublishNip07(evt, relays);
                    } else if (mode === 'group') {
                        // Group Mode: Shared Key aus appState
                        const { signWithPrivateKey } = await import('$lib/groupAuth');
                        const privateKey = appState.groupPrivateKey;
                        if (!privateKey) throw new Error('Group mode but no private key');
                        signAndPublish = (evt: any) => signWithPrivateKey(evt, privateKey, relays);
                    }
                } catch (e) {
                    console.error("Nostr/Group init failed", e);
                }
            }

            // 2. Hook initialisieren
            // ✅ user enthält bereits pubkey (aus appState)
            hook = useMyAppYDoc(documentId, mode, user, signAndPublish, relays);
            
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

### 3.1 KRITISCH: App-Isolation

**❌ FEHLER:**
```typescript
const result = useNostrYDoc(documentId, ...);  // Keine Isolation!
```

**✅ RICHTIG:**
```typescript
const appDocumentId = `myapp:${documentId}`;
const result = useNostrYDoc(appDocumentId, ...);
```

**Warum?** Ohne App-Präfix teilen sich alle Apps denselben documentId (z.B. "demo"). Dies führt zu:
- Cross-Contamination von Awareness States (User aus Poll erscheinen im Editor)
- Durcheinander von Yjs-Updates (Todo-Items landen in der Mindmap)
- Chaos in der Presence-Liste

**Standard-Präfixe:**
- `editor:` - Text Editor
- `poll:` - Umfragen
- `todo:` - Todo-Listen
- `mindmap:` - Mindmaps
- `whiteboard:` - Whiteboards
- `wiki:` - Wiki-Seiten

### 3.2 Group Mode Support

**Checkliste für Group Mode:**
- [ ] `mode` Type erweitert: `'local' | 'nostr' | 'group'`
- [ ] `user.pubkey` in Props Interface
- [ ] `isGroupMode = mode === 'group'` im Hook
- [ ] `userIdentifier = user.name` übergeben
- [ ] `signAndPublish` aus `groupAuth.ts` für Group Mode
- [ ] Alle 7 Parameter an `useNostrYDoc` übergeben

**Wichtig:** In Group Mode:
- Alle User haben denselben Pubkey (aus Group Code)
- Jeder User hat eindeutigen Nickname (aus localStorage)
- Client IDs werden per Nickname unterschieden
- Farben basieren auf Nickname, NICHT Pubkey

### 3.3 Client ID Management

**Automatisch gehandhabt durch `useNostrYDoc`:**
```typescript
// Normal Mode (sessionStorage)
const key = `yjs_clientId_${documentId}`;

// Group Mode (localStorage mit Nickname)
const key = `yjs_clientId_${documentId}_${userIdentifier}`;
```

**Du musst nichts machen**, solange du `userIdentifier` korrekt übergibst!

### 3.4 Weitere Fallstricke

1.  **Async `onMount`:** Gib KEIN Promise von `onMount` zurück, wenn du eine Cleanup-Funktion benötigst. Svelte 5 (und 4) erwartet `void | () => void`. Wenn du `async () => { ... }` verwendest, wird ein Promise zurückgegeben. Definiere stattdessen eine `async` Funktion innerhalb und rufe sie auf, oder nutze `.then()`.

2.  **AppHeader Props:** `AppHeader` benötigt die Props `showHistory` und `maxWidth`. Stelle sicher, dass du sie übergibst.

3.  **Modus-Umschaltung:** Nutze `appState.mode`, um den App-Modus zu steuern. Der `AppHeader` aktualisiert `appState`, nicht die URL. Wenn du dich auf URL-Parameter verlässt, funktioniert der Header-Switch nicht. Nutze `{#key appState.mode}`, um die App neu zu mounten, wenn sich der Modus ändert.

4.  **Nostr-Verbindungen:** Die `nostrUtils.ts` Bibliothek handhabt das Connection-Pooling (`getRelayConnection`). Erstelle NIEMALS manuelle WebSocket-Verbindungen oder `SimplePool` direkt, um Relay-Blocks durch zu viele parallele Verbindungen zu vermeiden.

5.  **Fehlendes `untrack` beim Titel-Sync:** Svelte 5 Runes sind sehr empfindlich. Wenn du `title` innerhalb eines Effekts aktualisierst, der `title` liest, erhältst du eine Endlosschleife. Nutze `untrack` für das initiale Lesen.

6.  **Yjs-Transaktionen:** Wrappe Datenänderungen immer in `ydoc.transact(() => { ... })`, um Atomizität und korrektes Event-Firing sicherzustellen.

7.  **Cleanup:** Implementiere immer eine `cleanup`-Funktion in deinem Hook und rufe sie in `onDestroy` (oder der Rückgabefunktion von `onMount`) auf. Dies verhindert Speicherlecks und "Geister"-Verbindungen.

8.  **Debug-Logs:** Nutze `this.debug` in Providern für verbose Logs. Standard: Nur Errors und Warnings.

## 4. Quick Reference

### 4.1 useNostrYDoc Parameter (alle 7!)

```typescript
useNostrYDoc(
    documentId: string,        // 1. Mit App-Präfix! z.B. "poll:demo"
    myPubkey: string,          // 2. User Pubkey (NIP-07 oder Group)
    signAndPublish: Function,  // 3. Sign-Funktion (NIP-07 oder groupAuth)
    enablePersistence: boolean,// 4. IndexedDB? (meist false für Apps)
    relays?: string[],         // 5. Relay-Liste aus config
    userIdentifier?: string,   // 6. user.name für unique Client ID
    isGroupMode?: boolean      // 7. true wenn mode === 'group'
)
```

### 4.2 Awareness Lifecycle

- **Heartbeat:** 15 Sekunden (hält Presence aktiv)
- **Stale Timeout:** 40 Sekunden (danach Cleanup)
- **Cleanup Check:** 10 Sekunden Interval
- **Age Filter:** Events älter als 30s werden ignoriert
- **Historical Fetch:** Letzte 60s beim Subscribe

### 4.3 Event Kinds

- **9337:** Yjs Updates (Content = Base64 encoded binary)
- **31339:** Awareness States (Replaceable, d-Tag = documentId)
- **9338:** Yjs Snapshots (Optional, für History)
- **31338:** Snapshot Metadata (Optional)

### 4.4 Storage Keys

```typescript
// App Mode
localStorage.getItem('app_mode'); // 'local' | 'nostr' | 'group'

// Group Code
localStorage.getItem('app_group_code'); // Group Code String

// Nickname (Group Mode)
localStorage.getItem('nostr_local_identity'); // User Nickname

// Client ID (Normal Mode)
sessionStorage.getItem(`yjs_clientId_${documentId}`);

// Client ID (Group Mode)
localStorage.getItem(`yjs_clientId_${documentId}_${nickname}`);
```

### 4.5 Wichtige Imports

```typescript
// Hooks
import { useNostrYDoc } from '$lib/useNostrYDoc';
import { useLocalYDoc } from '$lib/useLocalYDoc';

// State
import { appState } from '$lib/stores/appState.svelte';

// Nostr Utils
import { getNip07Pubkey, signAndPublishNip07 } from '$lib/nostrUtils';

// Group Auth
import { signWithPrivateKey } from '$lib/groupAuth';

// Config
import { loadConfig } from '$lib/config';

// Yjs
import * as Y from 'yjs';
import { writable, type Writable } from 'svelte/store';

// Svelte
import { onMount, onDestroy, untrack } from 'svelte';
```
