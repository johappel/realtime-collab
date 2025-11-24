# ROADMAP – Realtime-Editor mit Svelte 5, TipTap, Yjs & Nostr

Diese Roadmap beschreibt die Ausbaustufen (MVPs) des Projekts.

---

## Phase 0 – Projekt-Setup

- [x] SvelteKit-Projekt initialisieren (`npm create svelte@latest` o. ä.).
- [x] Svelte 5 (Runes) aktivieren.
- [x] Basisverzeichnisstruktur anlegen:
  - `src/lib/`
  - `src/routes/editor/+page.svelte`
  - `src/routes/editor/[documentId]/+page.svelte`
- [x] Abhängigkeiten installieren:

```bash
npm install svelte@next @sveltejs/kit
npm install yjs @tiptap/core @tiptap/starter-kit @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
npm install nostr-tools y-protocols
```

---

## MVP 1 – Lokaler kollaborativer Editor (ohne Nostr)

**Ziel:**
- TipTap-Editor läuft in der Svelte-App.
- Yjs ist angebunden, aber alles noch rein lokal (ein Browser/Tab) oder optional via y-websocket.

**Tasks:**

- [x] `useLocalYDoc(documentId)` implementieren (Rückgabe von `ydoc` und `yXmlFragment`).
- [x] `TipTapEditor.svelte` implementieren:
  - [x] TipTap-`Editor` mit `StarterKit` + `Collaboration`-Extension.
  - [x] Bindung an Yjs-Dokument (`document: ydoc, field: 'prosemirror'`).
- [x] Test-Route `src/routes/editor/[documentId]/+page.svelte` anlegen.
- [x] Manuelles Testen: Texteingabe im Browser.

**Akzeptanzkriterien:**

- [x] Editor funktioniert stabil lokal unter `/editor/[documentId]`.
- [x] Änderungen im Dokument werden via Yjs-CRDT verwaltet (kein eigener Merge-Code).
- [x] Inhalte bleiben nach Reload erhalten (IndexedDB).

---

## MVP 2 – Nostr als Transport für Yjs-Updates

**Ziel:**
- Mehrere Clients können über Nostr-Relays denselben Dokumentzustand teilen.
- Yjs-Updates werden als Nostr-Events versendet/empfangen.

**Tasks:**

- [x] `YJS_NOSTR_SPEC.md` (dieses Dokument) erstellen.
- [x] `NostrYDocProvider` Grundimplementierung anlegen:
  - [x] Subscribe: Filter `{ kinds: [9337], '#d': [documentId] }`.
  - [x] Publish: `ydoc.on('update')` → Base64 → `kind: 9337`.
- [x] `useNostrYDoc(documentId, myPubkey, signAndPublish)` implementieren.
- [x] `TipTapEditor.svelte` so erweitern, dass zwischen lokalem und Nostr-Modus gewechselt werden kann.
- [x] Eine einfache `signAndPublish`-Implementierung für Browser mit NIP‑07 vorbereiten (Konzept + Beispiel).
- [x] `NativeRelay` Implementierung für stabilen Browser-Support.
- [x] Offline-First Support via `y-indexeddb` integrieren.

**Akzeptanzkriterien:**

- [x] Zwei Browserfenster, gleiche `documentId`, gleicher Relay – Änderungen werden nahezu in Echtzeit synchronisiert.
- [x] Keine sichtbaren Merge-Konflikte (Yjs erledigt das).
- [x] Offline-Änderungen werden synchronisiert, sobald Verbindung wiederhergestellt ist.

---

## MVP 3 – Presence & Cursors

**Ziel:**
- Benutzer können sehen, wer gleichzeitig im Dokument ist.
- Cursors und Textauswahlen anderer Benutzer werden farblich markiert.

**Tasks:**

- [x] `PRESENCE_SPEC.md` beachten.
- [x] `NostrAwarenessProvider` implementieren (Yjs Awareness ↔ Nostr `kind: 31339`).
- [x] Awareness-Objekt in `useNostrYDoc` oder separatem Hook bereitstellen.
- [x] `TipTapEditor.svelte` um `CollaborationCursor`-Extension erweitern:
  - [x] `provider: { awareness }` setzen.
  - [x] `user`-Objekt mit Name + Farbe übergeben.
- [x] UI-Elemente für Presence-Liste (z. B. Avatare/Initialen) hinzufügen.

**Akzeptanzkriterien:**

- [x] Mindestens zwei Nutzer gleichzeitig im Dokument:
  - [x] gegenseitige Cursors/Selections sichtbar.
  - [x] Presence-Liste zeigt aktive Nutzer.

---

## Phase 4 – Lerngruppen & Erweiterungen

---

## Phase 5 – Produktionstauglichkeit & Optimierung

- [x] **Performance-Analyse**: Code-Review und Identifikation von Engpässen (`docs/Codeanalysis.md`).
- [x] **Update Batching**: Reduzierung von Nostr-Spam durch Zusammenfassen von Yjs-Updates (Debounce 500ms).
- [ ] **Base64-Optimierung**: Weitere Verbesserung der Encoding-Performance bei sehr großen Dokumenten.
- [ ] **Subscription Management**: Zentraler Pool für Subscriptions zur Vermeidung von Leaks.
- [ ] Eigene Relays oder Relay-Cluster.
- [ ] Monitoring/Logging.

Die Roadmap ist bewusst iterativ – jede Phase sollte in sich nutzbare Mehrwerte liefern.