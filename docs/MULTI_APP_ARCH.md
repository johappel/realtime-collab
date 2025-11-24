# Multi-App Architektur

Dieses Dokument beschreibt die Architektur der "Multi-App"-Plattform, die es ermöglicht, verschiedene kollaborative Anwendungen (Text-Editor, Mindmap, Todo-Liste) auf einer gemeinsamen technischen Basis zu betreiben.

## 1. Grundkonzept

Das Ziel ist eine Suite von "Local-First" Kollaborations-Tools, die:
1.  **Offline-fähig** sind (Local-First).
2.  **Echtzeit-fähig** sind (via Nostr-Relays).
3.  **Daten-agnostisch** sind (Yjs als universeller State-Container).
4.  **Flexibel authentifizierbar** sind (Personal via NIP-07, Group Mode via Shared Key).

Anstatt für jede App ein eigenes Backend zu bauen, nutzen alle Apps denselben Stack: **Svelte 5 + Yjs + Nostr**.

### 1.1 Modi der Authentifizierung

Die Plattform unterstützt drei Modi:
- **Local Mode:** Nur lokale Persistierung (IndexedDB), keine Synchronisation.
- **Nostr Mode:** NIP-07 Browser Extension für persönliche Identität, jeder User hat eigenen Private Key.
- **Group Mode:** Deterministischer Shared Key aus Group Code, mehrere User teilen sich denselben Pubkey, aber unterschiedliche Nicknames und Client IDs.

**Wichtig für Group Mode:**
- Alle Gruppenmitglieder generieren denselben Private Key aus dem Group Code
- Jeder User hat einen eindeutigen Nickname (aus localStorage)
- Jeder User hat eine eindeutige Client ID: `yjs_clientId_${documentId}_${nickname}`
- Farben werden vom Nickname abgeleitet, NICHT vom Pubkey
- Ghost Killer trackt User nach Username (Group) oder Pubkey (Normal)

## 2. Gemeinsame Basis (Shared Kernel)

Alle Apps teilen sich die folgende Infrastruktur. Dies muss **nicht** für jede App neu entwickelt werden.

### 2.1 State Management (Yjs)
Jedes Dokument ist ein `Y.Doc`. Der Unterschied liegt nur darin, welche Yjs-Datentypen (Shared Types) genutzt werden:
*   **Text Editor:** `ydoc.getXmlFragment('prosemirror')`
*   **Mindmap:** `ydoc.getMap('mindmap-nodes')`, `ydoc.getMap('mindmap-edges')`
*   **Todo:** `ydoc.getMap('todo-data')`, `ydoc.getArray('todo-order')`

### 2.2 Transport & Networking (Nostr)
Die Synchronisation erfolgt über `NostrYDocProvider`.
*   **Events:** Updates werden als binäre Yjs-Updates (Base64) in Nostr-Events (Kind `9337`) verpackt.
*   **Awareness:** Cursor-Positionen und Online-Status laufen über Replaceable Events (Kind `31339`).
*   **Signierung:** Erfolgt über NIP-07 (Browser-Extension), Group Mode (Shared Key) oder lokale Keys.
*   **Verschlüsselung (Group Mode):** End-to-End Verschlüsselung aller Inhalte (Updates, Snapshots, Awareness) mittels NIP-44 (XChaCha20-Poly1305).

### 2.2.1 App-Isolation (KRITISCH!)

**Problem:** Wenn mehrere Apps denselben `documentId` (z.B. "demo") nutzen, teilen sie sich Awareness States und Yjs-Updates, was zu Cross-Contamination führt (User aus dem Poll erscheinen im Editor, etc.).

**Lösung:** Jede App MUSS ihren `documentId` mit einem App-Präfix versehen:

```typescript
// ❌ FALSCH - Alle Apps nutzen denselben documentId
const result = useNostrYDoc(documentId, ...);

// ✅ RICHTIG - Jede App hat isolierten documentId
const appDocumentId = `poll:${documentId}`;
const result = useNostrYDoc(appDocumentId, ...);
```

**Standard-Präfixe:**
- Editor: `editor:${documentId}`
- Poll: `poll:${documentId}`
- Todo: `todo:${documentId}`
- Mindmap: `mindmap:${documentId}`
- Whiteboard: `whiteboard:${documentId}`
- Wiki: `wiki:${documentId}`

**Validierung:** Der `NostrAwarenessProvider` prüft die `d`-Tag im Event und ignoriert Events für andere documentIds:
```typescript
if (dTag !== this.documentId) {
    // Event gehört zu anderer App/Dokument - ignorieren
    return;
}
```

### 2.3 Hooks & Provider Pattern
Jede App implementiert einen spezifischen Hook, der den generischen `useNostrYDoc` Hook wrappt:

```typescript
// Generischer Base-Hook
useNostrYDoc(
    documentId: string,
    myPubkey: string,
    signAndPublish: Function,
    enablePersistence: boolean,
    relays: string[],
    userIdentifier?: string,  // Für Group Mode: Nickname
    isGroupMode?: boolean,    // Aktiviert Group Mode Features
    groupPrivateKey?: string  // Optional: Für NIP-44 Verschlüsselung
) -> { ydoc, provider, awareness }

// App-Spezifischer Hook (Beispiel mit Group Mode Support)
useTodoYDoc(docId, mode, user, ...) -> { 
    items: Writable<TodoItem[]>, // Svelte Store für UI
    addItem: (text) => void,     // High-Level Action
    ... 
}
```

**Pattern für neue Apps (Group Mode Support):**
```typescript
export function useMyAppYDoc(
    documentId: string,
    mode: 'local' | 'nostr' | 'group',
    user: { name: string; color: string; pubkey: string },
    signAndPublish?: Function,
    relays?: string[]
) {
    // 1. App-Präfix für Isolation
    const appDocumentId = `myapp:${documentId}`;
    
    // 2. Group Mode Detection
    const isGroupMode = mode === 'group';
    const userIdentifier = user.name; // Nickname als Identifier
    
    // 3. useNostrYDoc mit allen Parametern
    if (mode === 'nostr' || mode === 'group') {
        // Group Key aus appState holen (wird meist in der UI-Komponente gemacht und hier reingereicht)
        const groupPrivateKey = isGroupMode ? appState.groupPrivateKey : undefined;

        const result = useNostrYDoc(
            appDocumentId,
            user.pubkey,
            signAndPublish,
            false,
            relays,
            userIdentifier,
            isGroupMode,
            groupPrivateKey
        );
        // ...
    }
}
```

**Vorteil:** Die UI-Komponenten (`TodoApp.svelte`) müssen nichts von Yjs oder Nostr wissen. Sie interagieren nur mit Stores und Funktionen.

### 2.4 Metadaten & Titel-Sync
Jedes Dokument speichert Metadaten (wie den Titel) in einer `Y.Map('metadata')`.
*   **Pflicht:** Jede App muss sicherstellen, dass der Titel im `AppHeader` mit diesem Yjs-Wert synchronisiert wird.
*   **Pattern:**
    1.  `AppHeader` bindet `documentId` (Titel).
    2.  App-Komponente (`WhiteboardCanvas`) beobachtet `ydoc.getMap('metadata')`.
    3.  Bei Änderungen (remote) wird der lokale Titel aktualisiert.
    4.  Bei Änderungen (lokal via Header) wird der Wert in die Yjs-Map geschrieben.

## 3. App-Spezifika

### 3.1 Text Editor (TipTap)
*   **Pfad:** `src/lib/TipTapEditor.svelte`
*   **Logik:** Nutzt `@tiptap/extension-collaboration` direkt mit dem Yjs-Fragment.
*   **Besonderheit:** TipTap hat eine eingebaute Yjs-Bindung, daher ist hier weniger manueller "Glue-Code" nötig als bei den anderen Apps.

### 3.2 Mindmap
*   **Pfad:** `src/lib/apps/mindmap/`
*   **Komponenten:** `MindmapCanvas.svelte`, `EditableNode.svelte`
*   **Datenmodell:** Knoten und Kanten werden in `Y.Map`s gespeichert.
*   **Logik:** `useMindmapYDoc.ts` synchronisiert die Yjs-Maps mit lokalen Svelte-Stores (`nodes`, `edges`).

### 3.3 Todo-Liste
*   **Pfad:** `src/lib/apps/todo/`
*   **Komponenten:** `TodoApp.svelte`
*   **Datenmodell:** 
    *   Items in einer `Y.Map` (für O(1) Zugriff und Updates).
    *   Reihenfolge in einem `Y.Array` (für Sortierung).
*   **Logik:** `useTodoYDoc.ts` bietet Funktionen wie `assignUser`, `setDueDate`, `reorderItems`.

## 4. State Management & Awareness

### 4.1 Client ID Management

**Problem:** In Group Mode teilen sich alle User denselben Pubkey. Ohne eindeutige Client IDs überschreiben sie gegenseitig ihre Zustände.

**Lösung:** Client IDs werden pro User + Dokument + Nickname gespeichert:

```typescript
// localStorage Key Pattern
const key = `yjs_clientId_${documentId}_${user.name}`;

// Beispiel
// Max in poll:demo -> yjs_clientId_poll:demo_Max
// Lu in poll:demo  -> yjs_clientId_poll:demo_Lu
// Max in editor:demo -> yjs_clientId_editor:demo_Max (ANDERER Key!)
```

**Wichtig:**
- SessionStorage wird für Normal Mode genutzt (Single Tab pro User)
- LocalStorage wird für Group Mode genutzt (Multi-Tab, Nickname-basiert)
- Bei App-Wechsel (poll → editor) erhält derselbe User eine NEUE Client ID

### 4.2 Awareness State Lifecycle

**Heartbeat (15s):**
- Jeder User sendet alle 15 Sekunden seinen Awareness State
- Verhindert Timeout und hält Presence aktuell

**Stale User Cleanup (40s timeout, 10s check):**
- User, die 40 Sekunden keine Updates senden, werden entfernt
- Verhindert "Ghost Users" nach Browser-Crash oder Tab-Close

**Ghost Killer:**
- Normal Mode: Trackt nach Pubkey (ein User = ein clientId)
- Group Mode: Trackt nach Username (mehrere User mit gleichem Pubkey)
- Bei Reload: Alte Client IDs mit demselben Username/Pubkey werden entfernt

**Delayed Cleanup Pattern:**
```typescript
// FALSCH: Cleanup vor Subscription
this.cleanupMyOldStates();
this.subscribe();

// RICHTIG: Cleanup NACH historischen Events
this.subscribe();
setTimeout(() => this.cleanupMyOldStates(), 1000);
```

### 4.3 Event Filtering

**Document Validation:**
```typescript
const dTag = event.tags.find(t => t[0] === 'd')?.[1];
if (dTag !== this.documentId) {
    // Ignoriere Events für andere Apps/Dokumente
    return;
}
```

**Age Filtering:**
```typescript
const now = Math.floor(Date.now() / 1000);
if (event.created_at < now - 30) {
    // Ignoriere Events älter als 30 Sekunden
    return;
}
```

**Client ID Check:**
```typescript
if (clientId === this.awareness.clientID) {
    // Ignoriere eigene Echo-Events
    return;
}
```

## 5. Offene Punkte & Anpassungsbedarf

### 4.1 Routing & App-Erkennung (Wichtig!)
Aktuell ist das Routing (`/editor/[documentId]`) noch stark auf den Text-Editor fokussiert.
**Problem:** Wenn ich eine URL öffne, woher weiß die App, ob es eine Mindmap oder ein Text ist?

**Lösungsvorschläge:**
1.  **URL-Präfixe:** `/mindmap/[id]`, `/todo/[id]`, `/text/[id]`. (Einfachste Lösung).
2.  **Metadaten-Event:** Ein Nostr-Event (z.B. Kind `30023` oder custom), das definiert: "ID xyz ist eine Mindmap".
3.  **Content-Detection:** Beim Laden des Yjs-Docs prüfen, welche Top-Level-Typen existieren (z.B. wenn `mindmap-nodes` existiert -> Mindmap View rendern).

### 4.2 Gemeinsame UI-Komponenten
Folgende Elemente werden aktuell teilweise dupliziert oder fehlen in den neuen Apps:
*   **Presence-Liste:** (Wer ist online?) Sollte eine globale Komponente sein, die in allen Apps oben rechts eingeblendet wird.
*   **Connection Status:** (Verbunden mit Relay X?)
*   **History/Snapshots:** Die Snapshot-Logik ist im `TipTapEditor` integriert, sollte aber generisch für alle Apps verfügbar sein.

### 4.3 Dashboard
Es fehlt eine Startseite (`/`), auf der man:
*   Neue Dokumente erstellen kann (Wahl des Typs).
*   Zuletzt bearbeitete Dokumente sieht (aus dem LocalStorage oder via Nostr-Query).

## 6. Zusammenfassung für Entwickler

### 6.1 Neue App erstellen - Checkliste

**1. Ordnerstruktur:**
```
src/lib/apps/neue-app/
├── NeueApp.svelte
└── useNeueAppYDoc.ts

src/routes/neue-app/[documentId]/
└── +page.svelte
```

**2. Hook implementieren (`useNeueAppYDoc.ts`):**
- [ ] Import `useNostrYDoc` und `useLocalYDoc`
- [ ] **KRITISCH:** App-Präfix für documentId: `const appDocumentId = \`neueapp:${documentId}\``
- [ ] Group Mode Support: `isGroupMode = mode === 'group'`
- [ ] User Identifier: `userIdentifier = user.name`
- [ ] Group Private Key: `groupPrivateKey` entgegennehmen und weiterreichen
- [ ] Alle 8 Parameter an `useNostrYDoc` übergeben
- [ ] Yjs-Datentypen definieren (Y.Map, Y.Array, Y.Text, etc.)
- [ ] Svelte Stores für UI erstellen
- [ ] ObserveDeep für Sync Yjs → Stores
- [ ] Actions für Mutations Stores → Yjs (in `ydoc.transact`)
- [ ] Cleanup-Funktion implementieren

**3. UI-Komponente (`NeueApp.svelte`):**
- [ ] Props: `documentId`, `user`, `mode`, `title` (bindable), `awareness` (bindable)
- [ ] `onMount`: Hook initialisieren
- [ ] `onMount`: Cleanup-Funktion returnen
- [ ] Titel-Sync mit `ydoc.getMap('metadata')`
- [ ] `$effect` für Titel-Updates
- [ ] `{#key appState.mode}` für Mode-Switching

**4. Route (`+page.svelte`):**
- [ ] `AppHeader` mit `bind:documentId` und `bind:awareness`
- [ ] `appState.init()` in `onMount`
- [ ] Mode aus `appState.mode`, NICHT aus URL
- [ ] `{#key appState.mode}` für Re-Mount bei Mode-Wechsel

**5. Testing:**
- [ ] Local Mode: Funktioniert offline?
- [ ] Normal Mode: NIP-07 Extension funktioniert?
- [ ] Group Mode: Multiple Users mit gleichem Code?
- [ ] App-Isolation: Andere Apps zeigen keine Cross-Contamination?
- [ ] Titel-Sync: Funktioniert bidirektional?
- [ ] Presence: User werden korrekt angezeigt?
- [ ] Ghost Killer: Nach Reload keine Duplikate?

### 6.2 Bestehende Apps erweitern

*   Ändere zuerst das Datenmodell im Hook (`use...YDoc.ts`).
*   Passe dann die UI an.
*   Teste alle drei Modi (local, nostr, group).

### 6.3 Infrastruktur ändern

*   Änderungen an `NostrYDocProvider` oder `NostrAwarenessProvider` betreffen **alle** Apps. Vorsicht!
*   Teste nach Infrastruktur-Änderungen ALLE Apps.

