# Architektur – Svelte 5 Realtime-Editor mit TipTap, Yjs & Nostr

Dieses Dokument beschreibt die Zielarchitektur des kollaborativen Editors.

---

## 1. Systemüberblick

### 1.1 Komponenten

- **Svelte 5 App (SvelteKit)**
  - UI, Routing, State-Management via Runes
  - Routing insbesondere über `/editor` und `/editor/[documentId]`
  - Rendering des Editors und der Document Views

- **TipTap Editor**
  - WYSIWYG/Rich-Text-Editor (Markdown-fähig)
  - Extensions: StarterKit, Collaboration
  - (später) `CollaborationCursor` und ggf. Markdown-spezifische Extensions

- **Yjs (CRDT)**
  - Hält den kollaborativen Dokumentzustand
  - `Y.Doc` pro Dokument
  - `XmlFragment` (`ydoc.getXmlFragment('prosemirror')`) als Datengrundlage für TipTap Collaboration

- **Nostr-Relays**
  - Verteilter Pub/Sub-Message-Bus
  - Transport von:
    - Yjs-Update-Events (Dokumentinhalt)
    - Snapshots (optional)
    - Awareness/Presence-Events (Cursors & „wer tippt?“)

- **nostr-tools**
  - Erstellung, Signierung und Versand von Nostr-Events
  - `SimplePool` für Relay-Konnektivität

---

## 2. Schichtenmodell

1. **UI-Schicht (Svelte/TipTap)**
   - Komponenten unter `src/routes` (Pages) und `src/lib` (Editor, Controls, Layout).
   - Nutzt Runes für reaktiven State (`$state`, `$derived`, `$effect`).
   - Der Editor arbeitet immer auf einem `Y.Doc`-basierten Zustand.

2. **CRDT-Schicht (Yjs)**
   - Pro Dokument eine `Y.Doc`-Instanz.
   - Textrepräsentation über `XmlFragment` für ProseMirror/TipTap.
   - Optional weitere Yjs-Datenstrukturen (Maps, Arrays) für Metadaten.

3. **Transport-Schicht (Nostr Provider)**
   - `NostrYDocProvider` synchronisiert Yjs-Updates mit Nostr.
   - `NostrAwarenessProvider` synchronisiert Awareness-Status mit Nostr.
   - Beide Provider sind von der UI entkoppelt, werden von Hooks instanziiert.

4. **Konfiguration & Infrastruktur**
   - Zentrale Konfiguration von Relay-URLs, Nostr-Kinds und Policies.
   - Später: Auth/Encryption-Setup, eigene Relays.

---

## 3. Datenmodell & Nostr-Events

### 3.1 Dokumente

- Jedes Dokument wird durch eine **`documentId`** identifiziert.
- In Nostr-Events erfolgt die Zuordnung über Tags:
  - `tags: [["d", documentId]]`

### 3.2 Event-Kategorien

- **CRDT/Yjs-Updates**
  - `kind: 31337`
  - `content`: Base64-kodiertes Yjs-Update (`Uint8Array`).
  - Tags:
    - `["d", documentId]`
- **Snapshots (optional)**
  - `kind: 31338`
  - `content`: Base64-kodierter vollständiger Yjs-State (`encodeStateAsUpdate`).
  - Tags:
    - `["d", documentId]`

- **Awareness/Presence**
  - `kind: 31339`
  - `content`: kompaktes JSON mit Präsenzinformationen (Cursor-Position, Name, Farbe etc.)
  - Tags:
    - `["d", documentId]`

### 3.3 Yjs-Seite

- Pro Dokument:
  - `const ydoc = new Y.Doc()`
  - `const yXmlFragment = ydoc.getXmlFragment('prosemirror')`
- Updates:
  - Lokale Änderungen erzeugen `ydoc.on('update', (update, origin) => …)`-Events.
  - Remote Änderungen werden mit `Y.applyUpdate(ydoc, update, 'remote')` eingespielt.

---

## 4. Lebenszyklus eines Dokuments

1. **Initialer Load**
   - Client erzeugt `Y.Doc`.
   - Stellt Verbindung zum Nostr-Relay her.
   - Subscribed auf:
     - `kind: 31338` (Snapshots) mit Tag `["d", documentId]` (optional).
     - `kind: 31337` (Yjs-Updates) mit demselben Tag.
   - Falls Snapshot-Event vorhanden → `Y.applyUpdate` mit Snapshot → dann alle nachfolgenden Updates anwenden.

2. **Laufender Betrieb**
   - TipTap-Editor ändert den ProseMirror-State → Yjs erzeugt Updates.
   - Updates werden via `NostrYDocProvider` serialisiert und als Events an Relays gesendet.
   - Andere Clients empfangen dieselben Events und wenden sie auf ihre lokale `Y.Doc`-Instanz an.

3. **Verlassen eines Dokuments**
   - Editor-Komponente zerstört (`onDestroy` / Cleanup in `$effect`).
   - Provider werden geschlossen (`provider.destroy()`):
     - Unsubscribe von Nostr-Events
     - Schließen der Relay-Verbindungen (falls nötig)
   - Awareness-State wird auf „offline“ gesetzt und übertragen (falls Presence angebunden).

---

## 5. Svelte-/TipTap-Integration

### 5.1 Kernkomponenten

- `TipTapEditor.svelte`
  - Verantwortlich für:
    - Aufbau und Zerstörung der TipTap-`Editor`-Instanz
    - Konfiguration der Extensions (StarterKit, Collaboration, CollaborationCursor)
    - Bindung an das DOM (z. B. `bind:this={editorElement}`)
  - Bekommt Props:
    - `documentId`
    - `user` (Name, Farbe etc.)
    - Optional: `myPubkey`, `signAndPublish`

- `useLocalYDoc(documentId: string)`
  - Erstellt eine **lokale** Yjs-Instanz (MVP 1).

- `useNostrYDoc(documentId: string, myPubkey: string, signAndPublish: (evt) => Promise<void>)`
  - Erstellt `Y.Doc`, `yXmlFragment` und `NostrYDocProvider` (MVP 2).

### 5.2 Editor-Setup (logisch)

1. In der Page-Route (`+page.svelte`):
   - `documentId` aus URL ziehen.
   - `TipTapEditor` mit `documentId`, `user` und (später) Nostr-Parametern rendern.

2. In `TipTapEditor.svelte`:
   - Yjs-Doc via `useLocalYDoc` (MVP 1) oder `useNostrYDoc` (MVP 2) holen.
   - TipTap `Editor` mit `Collaboration`-Extension an `yXmlFragment` binden.

3. Für Presence (MVP 3):
   - Awareness-Objekt erstellen (`new Awareness(ydoc)`).
   - `NostrAwarenessProvider` instanziieren.
   - `CollaborationCursor` mit `awareness` und `user` konfigurieren.

---

## 6. Fehler- und Performance-Überlegungen

- **Event-Reihenfolge:**
  - Nostr liefert keine harte Ordnungsgarantie; Yjs muss mit potenziell out-of-order Updates klarkommen (kann es).

- **Event-Menge:**
  - Bei hoher Edit-Frequenz: Batching/Throttling von Updates möglich.
  - Periodische Snapshots reduzieren Replay-Zeit.

- **Relay-Ausfälle:**
  - Provider müssen Verbindungsfehler loggen und ggf. Reconnect versuchen.
  - UI sollte Nutzer zumindest minimal feedbacken (z. B. „disconnected“).

---

## 7. Erweiterbarkeit

- **Weitere Dokumenttypen:**
  - Neben Rich-Text/Markdown können perspektivisch Tabellen, Whiteboards etc. hinzugefügt werden, solange sie CRDT-kompatibel sind.

- **Mehrere Relays:**
  - Konfiguration für mehrere Relays, Filter pro Dokument.

- **Private Dokumente:**
  - Zusätzliche Verschlüsselungsschicht vor dem Senden der Updates einführbar.
  - Entschlüsselung erfolgt vor `Y.applyUpdate` im Client.

Die Details zur konkreten Implementierung der Module finden sich in den spezifischen Spezifikationsdateien (`EDITOR_SPEC.md`, `YJS_NOSTR_SPEC.md`, `PRESENCE_SPEC.md`).