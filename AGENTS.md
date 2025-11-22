# AGENTS – Anweisungen für Co-Developer & AI-Agents

Dieses Dokument beschreibt, wie eine **Multi-App-Plattform** (Text-Editor, Mindmap, Todo-Liste) auf Basis von **Svelte 5**, **Yjs** und **Nostr-Relays** aufgebaut und weiterentwickelt werden soll. Es richtet sich explizit an menschliche Contributor **und** AI-Agents (z. B. GitHub Copilot, CI-Bots).

---

## 1. Ziel des Projekts

Eine Suite von **Local-First Kollaborations-Tools**, die:

-in **Svelte 5** (Runes) laufen,
- **Yjs** als universellen **CRDT**-State-Container nutzen,
- **Nostr-Relays** als **verteilten Message-Bus** für Yjs- und Presence-Updates verwenden,
- verschiedene App-Typen (Text, Mindmap, Todo) auf derselben technischen Basis unterstützen.

---

## 2. Hohe Leitplanken für alle Agents

- **Single Source of Truth:**
  - Der persistente Dokumentzustand liegt logisch in **Yjs** (CRDT).
  - Nostr-Events sind nur **Transport** (Update-Stream, Snapshots, Presence).
- **Multi-App Architektur:**
  - Jede App (Editor, Mindmap, Todo) nutzt denselben `NostrYDocProvider`.
  - Apps unterscheiden sich nur durch die genutzten Yjs-Datentypen (`XmlFragment`, `Y.Map`, `Y.Array`).
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
- **Wiki:** `ydoc.getMap('wiki-pages')` (Metadaten), `ydoc.getXmlFragment('page-<id>')` (Inhalt pro Seite)

**Transport / Backend:**

- Nostr-Relays (Pub/Sub via WebSockets)
- `NostrYDocProvider` für Yjs‑Updates (Kind `9337`)
- `NostrAwarenessProvider` für Presence (Kind `31339`)

---

## 4. Entwicklung neuer Apps / Features

Wenn du eine neue App (z.B. Whiteboard) hinzufügst oder eine bestehende erweiterst:

1.  **Ordnerstruktur:**
    - Erstelle `src/lib/apps/<neue-app>/`.
2.  **Hook-Pattern:**
    - Schreibe einen Hook `use<NeueApp>YDoc.ts`, der `useNostrYDoc` wrappt.
    - Dieser Hook kapselt die gesamte Yjs-Logik und exportiert einfache Svelte-Stores/Funktionen für die UI.
    - **Niemals** Yjs-Logik direkt in die Svelte-Komponente schreiben (außer bei TipTap, wo es nötig ist).
3.  **UI-Komponente:**
    - Die Komponente (`NeueApp.svelte`) sollte "dumm" sein und nur Daten anzeigen / Events feuern.
    - **AppHeader nutzen:** Jede App-Page (`+page.svelte`) MUSS den `AppHeader` verwenden, um konsistente Navigation, Titel-Bearbeitung und Presence-Anzeige zu gewährleisten.
    - **Titel-Sync:** Der Dokument-Titel muss bidirektional mit `ydoc.getMap('metadata').get('title')` (oder app-spezifischem Key) synchronisiert werden, damit Änderungen im Header auch im Yjs-State landen und umgekehrt.
4.  **TipTap Erweiterungen:**
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
5. **Authentifizierung (Dual-Mode - NEU 22.11.2025):**
   - **Standard-Modus**: NIP-07 Browser Extension für persönliche Identität
   - **Gruppen-Modus**: `generateKeyFromCode()` für Lerngruppen (deterministischer Key aus Code)
   - Nickname-Persistenz via `getOrSetLocalIdentity()` im LocalStorage
   - URL-Parameter Support: `?code=KURS-A&name=Max`
6. **Keine Infrastruktur-Annahmen:**
   - Keine Hardcoded Relay-URLs.
7. **Verbindungs-Management (CRITICAL):**
   - **NIEMALS** `SimplePool` oder neue WebSocket-Verbindungen direkt erstellen.
   - Immer `getRelayConnection` aus `nostrUtils.ts` verwenden.
   - Relays blockieren Clients mit zu vielen parallelen Verbindungen.

---

## 6. Wichtige Module & Verantwortlichkeiten

- `useNostrYDoc` – Generischer Hook für alle Apps (verbindet Yjs mit Nostr).
- `useTodoYDoc` / `useMindmapYDoc` / `useWikiYDoc` – App-spezifische Logik-Layer.
- `NostrYDocProvider` – Bidirektionales Binding Yjs ↔ Nostr.
- `NostrAwarenessProvider` – Binding Yjs-Awareness ↔ Nostr.
- `nostrUtils.ts` – Enthält `RelayConnection` Pool + **Group Code** Utilities. **Wichtig:** Immer `getRelayConnection` nutzen, niemals `SimplePool` direkt instanziieren, um Verbindungsabbrüche zu vermeiden.

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
  - `docs/MULTI_APP_ARCH.md` (Wichtig für das Gesamtverständnis!)
  - `docs/ARCHITECTURE.md`
  - `docs/ROADMAP.md`
- **Dann umsetzen:**
  - Änderungen immer im Kontext der Multi-App-Architektur.

Damit sollte jeder Agent – menschlich oder maschinell – in der Lage sein, konsistent an der Plattform mitzuwirken.