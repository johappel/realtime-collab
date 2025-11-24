# AGENTS – Anweisungen für Co-Developer & AI-Agents

Dieses Dokument beschreibt, wie eine **Multi-App-Plattform** (Text-Editor, Mindmap, Todo-Liste) auf Basis von **Svelte 5**, **Yjs** und **Nostr-Relays** aufgebaut und weiterentwickelt werden soll. Es richtet sich explizit an menschliche Contributor **und** AI-Agents (z. B. GitHub Copilot, CI-Bots).

---

## 1. Ziel des Projekts

Eine Suite von **Local-First Kollaborations-Tools**, die:

- in **Svelte 5** (Runes) laufen,
- **Yjs** als universellen **CRDT**-State-Container nutzen,
- **Nostr-Relays** als **verteilten Message-Bus** für Yjs- und Presence-Updates verwenden,
- verschiedene App-Typen (Text, Mindmap, Todo, Poll, Wiki, Whiteboard) auf derselben technischen Basis unterstützen,
- **drei Modi** unterstützen: Local (offline), Nostr (NIP-07), Group (Shared Key).

---

## 2. Hohe Leitplanken für alle Agents

- **Single Source of Truth:**
  - Der persistente Dokumentzustand liegt logisch in **Yjs** (CRDT).
  - Nostr-Events sind nur **Transport** (Update-Stream, Snapshots, Presence).
- **Multi-App Architektur:**
  - Jede App (Editor, Mindmap, Todo, Poll, Wiki, Whiteboard) nutzt denselben `NostrYDocProvider`.
  - Apps unterscheiden sich nur durch die genutzten Yjs-Datentypen (`XmlFragment`, `Y.Map`, `Y.Array`).
  - **KRITISCH:** Jede App MUSS einen eindeutigen App-Präfix für `documentId` verwenden (z.B. `poll:demo`, `editor:demo`).
- **App-Isolation:**
  - **IMMER** `const appDocumentId = \`app:${documentId}\`` im Hook verwenden.
  - Ohne Präfix teilen sich alle Apps denselben documentId → Cross-Contamination von Awareness/Updates!
  - Standard-Präfixe: `editor:`, `poll:`, `todo:`, `mindmap:`, `whiteboard:`, `wiki:`
- **Offline‑Toleranz:**
  - Clients sollen auch mit kurzzeitigen Relay-Ausfällen umgehen können.
  - Yjs-Puffer und Re-Sync über Replay von Events / Snapshots einplanen.
- **Konfliktfreiheit:**
  - Keine eigene Konfliktlogik implementieren – alles wird über Yjs gelöst.
- **Modularität:**
  - Klare Trennung zwischen:
    - UI (Svelte Komponenten)
    - App-Logik (Custom Hooks wie `useTodoYDoc`)
    - Infrastruktur (Nostr Provider, Yjs)

---

## 3. Architektur-Übersicht

**Frontend:**

- Svelte 5 (Runes) App, SvelteKit
- Shared Components unter `src/lib/` (z.B. `PresenceList.svelte`)
- App-spezifische Komponenten unter `src/lib/apps/<appname>/`

**Datenmodell (Yjs):**

- **Text Editor:** `ydoc.getXmlFragment('prosemirror')`
- **Mindmap:** `ydoc.getMap('mindmap-nodes')`, `ydoc.getMap('mindmap-edges')`
- **Todo:** `ydoc.getMap('todo-data')`, `ydoc.getArray('todo-order')`
- **Poll:** `ydoc.getMap('poll-data')` mit `options: Y.Array`, `settings: Y.Map`
- **Wiki:** `ydoc.getMap('wiki-pages')` (Metadaten), `ydoc.getXmlFragment('page-<id>')` (Inhalt pro Seite)
- **Whiteboard:** `ydoc.getArray('whiteboard-elements')`

**Alle Apps:** `ydoc.getMap('metadata')` für Titel und gemeinsame Metadaten.

**Transport / Backend:**

- Nostr-Relays (Pub/Sub via WebSockets)
- `NostrYDocProvider` für Yjs‑Updates (Kind `9337`)
- `NostrAwarenessProvider` für Presence (Kind `31339`)

---

## 4. Entwicklung neuer Apps / Features

Wenn du eine neue App (z.B. Whiteboard) hinzufügst oder eine bestehende erweiterst:

1. **Ordnerstruktur:**
   - Erstelle `src/lib/apps/<neue-app>/`.
2. **Hook-Pattern:**
   - Schreibe einen Hook `use<NeueApp>YDoc.ts`, der `useNostrYDoc` wrappt.
   - Dieser Hook kapselt die gesamte Yjs-Logik und exportiert einfache Svelte-Stores/Funktionen für die UI.
   - **KRITISCH:** Verwende App-Präfix: `const appDocumentId = \`neueapp:${documentId}\``
   - **Group Mode:** Unterstütze `mode: 'local' | 'nostr' | 'group'`
   - **Alle 7 Parameter:** Übergebe alle Parameter an `useNostrYDoc` (siehe Sektion 5.8)
   - **Niemals** Yjs-Logik direkt in die Svelte-Komponente schreiben (außer bei TipTap, wo es nötig ist).
3. **UI-Komponente:**
   - Die Komponente (`NeueApp.svelte`) sollte "dumm" sein und nur Daten anzeigen / Events feuern.
   - **AppHeader nutzen:** Jede App-Page (`+page.svelte`) MUSS den `AppHeader` verwenden, um konsistente Navigation, Titel-Bearbeitung und Presence-Anzeige zu gewährleisten.
   - **Titel-Sync:** Der Dokument-Titel muss bidirektional mit `ydoc.getMap('metadata').get('title')` (oder app-spezifischem Key) synchronisiert werden, damit Änderungen im Header auch im Yjs-State landen und umgekehrt.
4. **TipTap Erweiterungen:**
   - Für Editor-basierte Apps (Wiki, Notes): Nutze Custom Extensions für spezielle Features (z.B. `WikiLink` für `[Page]`-Syntax).
   - Nutze `InputRule` für Auto-Formatierung während des Tippens.

---

## 5. Konkrete Aufgaben für AI-Agents

Wenn du (als AI-Agent) Code generierst oder anpasst, halte dich an diese Regeln:

1. **Projektstruktur respektieren:**
   - Neue Apps in `src/lib/apps/`.
   - Shared Logic in `src/lib/`.
2. **Nostr nicht mit State verwechseln:**
   - Nostr dient nur dem **Transport**.
   - Kein manueller Merge von Zuständen – alles durch Yjs.
3. **Yjs-Updates korrekt serialisieren:**
   - Updates immer als Base64 in Nostr-Events verpacken.
4. **Sichere Signatur-Logik:**
   - `signAndPublish` wird immer von außen injiziert (NIP-07).
5. **Authentifizierung (Drei Modi - Stand 22.11.2025):**
   - **Local Mode**: Nur IndexedDB, keine Synchronisation
   - **Nostr Mode**: NIP-07 Browser Extension für persönliche Identität (jeder User eigener Private Key)
   - **Group Mode**: Shared Key aus Group Code (deterministischer Key aus `generateKeyFromCode()`)
   - **Group Mode Details:**
     - Alle Gruppenmitglieder teilen denselben Pubkey
     - Jeder User hat eindeutigen Nickname (aus `localStorage`)
     - Client IDs: `localStorage.getItem(\`yjs_clientId_${documentId}_${nickname}\`)`
     - Farben basieren auf Nickname, NICHT Pubkey
     - Ghost Killer trackt nach Username (Group) oder Pubkey (Nostr)
   - Nickname-Persistenz via `getOrSetLocalIdentity()` im LocalStorage
   - URL-Parameter Support: `?code=KURS-A&name=Max`
6. **Keine Infrastruktur-Annahmen:**
   - Keine Hardcoded Relay-URLs.
7. **Verbindungs-Management (CRITICAL):**
   - **NIEMALS** `SimplePool` oder neue WebSocket-Verbindungen direkt erstellen.
   - Immer `getRelayConnection` aus `nostrUtils.ts` verwenden.
   - Relays blockieren Clients mit zu vielen parallelen Verbindungen.
8. **App-Isolation (CRITICAL - Stand 22.11.2025):**
   - **IMMER** App-Präfix für documentId verwenden: `const appDocumentId = \`app:${documentId}\``
   - Standard-Präfixe: `editor:`, `poll:`, `todo:`, `mindmap:`, `whiteboard:`, `wiki:`
   - Ohne Präfix: Cross-Contamination von Awareness States und Yjs-Updates!
   - `NostrAwarenessProvider` validiert `d`-Tag und ignoriert fremde Events.
9. **State Management (Stand 22.11.2025):**
   - **Client IDs:** Automatisch gehandhabt durch `useNostrYDoc` mit `userIdentifier`-Parameter
   - **Normal Mode:** `sessionStorage.getItem(\`yjs_clientId_${documentId}\`)`
   - **Group Mode:** `localStorage.getItem(\`yjs_clientId_${documentId}_${nickname}\`)`
   - **Awareness Lifecycle:** Heartbeat (15s), Stale Timeout (40s), Cleanup (10s Interval)
   - **Ghost Killer:** Entfernt alte Client IDs bei Reload (nach Username oder Pubkey)
   - **Event Filtering:** Age (30s), Document ID, Client ID (eigene Echos ignorieren)

---

## 6. Wichtige Module & Verantwortlichkeiten

### 6.1 Core Hooks

- `useNostrYDoc(documentId, pubkey, signAndPublish, enablePersistence, relays, userIdentifier, isGroupMode)` – Generischer Hook für alle Apps (verbindet Yjs mit Nostr). **7 Parameter!**
- `useLocalYDoc(documentId)` – Offline-Modus mit IndexedDB.

### 6.2 App-Hooks (verwenden useNostrYDoc/useLocalYDoc)

- `useTodoYDoc` – Todo-Listen mit Y.Map + Y.Array
- `useMindmapYDoc` – Mindmaps mit Nodes + Edges
- `useWikiYDoc` – Wiki-Seiten mit Y.Map + XmlFragment pro Seite
- `usePollYDoc` – Umfragen mit Y.Map für Options + Settings
- `useWhiteboardYDoc` – Whiteboard mit Y.Array für Elemente

### 6.3 Provider (Infrastruktur)

- `NostrYDocProvider` – Bidirektionales Binding Yjs ↔ Nostr (Kind 9337 für Updates).
- `NostrAwarenessProvider` – Binding Yjs-Awareness ↔ Nostr (Kind 31339, Replaceable).
  - Heartbeat (15s), Stale Cleanup (40s), Ghost Killer, Event Filtering
  - Group Mode Support: Username-basiertes Tracking statt Pubkey

### 6.4 Utilities

- `nostrUtils.ts` – `RelayConnection` Pool, `generateKeyFromCode()`, `getOrSetLocalIdentity()`, `getRandomColor()`
- `groupAuth.ts` – `signWithPrivateKey()`, `getPubkeyFromPrivateKey()` für Group Mode
- `appState.svelte.ts` – Global State: `mode`, `user`, `groupCode`, `groupPrivateKey`

**Wichtig:** Immer `getRelayConnection` nutzen, niemals `SimplePool` direkt instanziieren!

---

## 7. Coding-Guidelines (Kurzfassung)

- **Sprache:** TypeScript für Logik, Svelte 5 für UI.
- **Stil:**
  - Klare, sprechende Namen.
  - Runes (`$state`, `$derived`, `$effect`) statt Svelte 4 Stores wo möglich (außer bei Yjs-Bindings, wo Stores oft praktischer sind).
- **Fehlerbehandlung:**
  - Nostr-Verbindungsfehler loggen.

---

## 8. Dokumentation

- **Erst lesen:**
  - `docs/MULTI_APP_ARCH.md` (Wichtig für das Gesamtverständnis! Enthält Checkliste für neue Apps)
  - `docs/CustomAppGuide-DE.md` (Schritt-für-Schritt Anleitung + Quick Reference)
  - `docs/ARCHITECTURE.md`
  - `docs/ROADMAP.md`
- **Dann umsetzen:**
  - Änderungen immer im Kontext der Multi-App-Architektur.
  - Bei neuen Apps: Checkliste in `MULTI_APP_ARCH.md` Sektion 6.1 durchgehen.

## 9. Quick Reference für AI-Agents

### 9.1 Neue App erstellen - Minimale Checkliste

```typescript
// 1. Hook (use<App>YDoc.ts)
const appDocumentId = `app:${documentId}`;  // ✅ App-Präfix!
const isGroupMode = mode === 'group';
const userIdentifier = user.name;

const result = useNostrYDoc(
    appDocumentId,    // 1. Mit Präfix
    user.pubkey,      // 2. 
    signAndPublish,   // 3.
    false,            // 4. Persistence
    relays,           // 5.
    userIdentifier,   // 6. ✅ Für Client ID
    isGroupMode       // 7. ✅ Group Mode Flag
);

// 2. UI-Komponente Props
type Props = {
    documentId: string;
    user: { name: string; color: string; pubkey: string };
    mode: 'local' | 'nostr' | 'group';
    title?: string;      // bindable
    awareness?: any;     // bindable
};

// 3. Route (+page.svelte)
{#key appState.mode}
    <MyApp 
        {documentId}
        user={appState.user}
        mode={appState.mode}
        bind:title={docTitle}
        bind:awareness={awareness}
    />
{/key}
```

### 9.2 Event Kinds

- **9337:** Yjs Updates (Content = Base64)
- **31339:** Awareness (Replaceable, d-Tag = documentId)
- **9338/31338:** Snapshots (Optional)

### 9.3 Storage Keys

```typescript
localStorage.getItem('app_mode');          // 'local' | 'nostr' | 'group'
localStorage.getItem('app_group_code');    // Group Code
localStorage.getItem('nostr_local_identity'); // Nickname
localStorage.getItem(`yjs_clientId_${documentId}_${nickname}`); // Group Mode
sessionStorage.getItem(`yjs_clientId_${documentId}`);            // Normal Mode
```

Damit sollte jeder Agent – menschlich oder maschinell – in der Lage sein, konsistent an der Plattform mitzuwirken.