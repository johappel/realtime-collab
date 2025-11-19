# AGENTS – Anweisungen für Co-Developer & AI-Agents

Dieses Dokument beschreibt, wie ein kollaborativer Realtime-Editor auf Basis von **Svelte 5**, **TipTap**, **Yjs** und **Nostr-Relays** als Message-Bus aufgebaut und weiterentwickelt werden soll. Es richtet sich explizit an menschliche Contributor **und** AI-Agents (z. B. GitHub Copilot, CI-Bots).

---

## 1. Ziel des Projekts

Ein **Google‑Docs‑ähnlicher, Markdown/Rich‑Text‑fähiger Realtime-Editor**, bei dem:

- der Editor in **Svelte 5** (Runes) läuft,
- **TipTap** die WYSIWYG/Rich‑Text-Schicht bildet,
- **Yjs** als **CRDT** den kollaborativen Dokumentzustand hält,
- **Nostr-Relays** als **verteilten Message-Bus** für Yjs- und Presence-Updates nutzen,
- mehrere Benutzer gleichzeitig an einem Dokument arbeiten können (inkl. Cursors & Presence).

---

## 2. Hohe Leitplanken für alle Agents

- **Single Source of Truth:**
  - Der persistente Dokumentzustand liegt logisch in **Yjs** (CRDT), nicht in einzelnen Nostr-Events.
  - Nostr-Events sind nur **Transport** (Update-Stream, Snapshots, Presence), kein relationales Modell.
- **Offline‑Toleranz:**
  - Clients sollen auch mit kurzzeitigen Relay-Ausfällen umgehen können.
  - Yjs-Puffer und Re-Sync über Replay von Events / Snapshots einplanen.
- **Konfliktfreiheit:**
  - Keine eigene Konfliktlogik implementieren – alles, was Text/Merkmale betrifft, wird über Yjs gelöst.
- **Security & Privacy:**
  - Nostr ist grundsätzlich öffentlich; plane Verschlüsselung (NIP‑04/NIP‑44) für private Doks.
  - Niemals geheime Keys im Repo oder im Client-Code hardcoden.
- **Modularität:**
  - Klare Trennung zwischen:
    - UI/Editor (Svelte + TipTap)
    - CRDT-Schicht (Yjs)
    - Transport (Nostr Provider)
    - Presence (Awareness Provider)
- **DX vor Perfektion:**
  - Zuerst ein gut verständliches MVP aufbauen, dann optimieren (Batching, Snapshots etc.).

---

## 3. Architektur-Übersicht

**Frontend:**

- Svelte 5 (Runes) App, SvelteKit empfohlen
- Komponenten unter `src/lib/` (z. B. `TipTapEditor.svelte`, Hooks/Provider unter `src/lib/…`)

**Editor / Kollaboration:**

- TipTap mit:
  - `@tiptap/starter-kit`
  - `@tiptap/extension-collaboration`
  - `@tiptap/extension-collaboration-cursor`
- Yjs als CRDT:
  - `Y.Doc` pro Dokument
  - `ydoc.getXmlFragment('prosemirror')` für TipTap Collaboration

**Transport / Backend:**

- Nostr-Relays (Pub/Sub via WebSockets) als „Backend“:
  - `nostr-tools` für Signatur, Events, Relay-Anbindung
  - eigene Provider-Klasse `NostrYDocProvider` für Yjs‑Updates
  - später `NostrAwarenessProvider` für Presence & Cursors

**Dokument-Identifikation (Channeling):**

- Pro Dokument ein logischer Kanal:
  - Nostr-Tag: `["d", <documentId>]`
  - Custom Nostr-Kinds, z. B.:
    - `31337` – CRDT/Yjs-Updates (Binär als Base64 im `content`)
    - `31338` – optionale Snapshots
    - `31339` – Awareness/Presence

---

## 4. MVP-Stufen (für alle Agents bindend)

Die Implementierung erfolgt in drei Ausbaustufen (siehe `docs/ROADMAP.md` im Detail):

1. **MVP 1 – Lokaler kollaborativer Editor (ohne Nostr):**
   - Svelte 5 + TipTap Editor
   - Yjs als `Y.Doc` + `yXmlFragment`
   - `@tiptap/extension-collaboration` lokal, optional y-websocket für Multi-Tab-Tests

2. **MVP 2 – Nostr als Transport für Yjs-Updates:**
   - Implementierung `NostrYDocProvider`
   - Yjs-Updates → Base64 → `kind: 31337` Events
   - Events mit `tag ["d", documentId]` kennzeichnen
   - Svelte-Komponenten nutzen `useNostrYDoc`-Hook

3. **MVP 3 – Presence & Cursors:**
   - Yjs Awareness (`y-protocols/awareness`)
   - `NostrAwarenessProvider` zur Synchronisation von Awareness-State über Nostr
   - Integration von `@tiptap/extension-collaboration-cursor`

Alle neuen Features müssen sich in diese Stufen einordnen.

---

## 5. Konkrete Aufgaben für AI-Agents

Wenn du (als AI-Agent) Code generierst oder anpasst, halte dich an diese Regeln:

1. **Projektstruktur respektieren:**
   - Neue Svelte-Komponenten nach Möglichkeit unter `src/lib/` anlegen.
   - Hooks/Provider als eigenständige TS-Module (z. B. `src/lib/useNostrYDoc.ts`).
2. **Nostr nicht mit State verwechseln:**
   - Nostr dient nur dem **Transport** von Yjs- und Awareness-Updates.
   - Kein manueller Merge von Textzuständen – alles durch Yjs.
3. **Yjs-Updates korrekt serialisieren:**
   - Ausgehende Updates: `Y.encodeStateAsUpdate` oder `ydoc.on('update')`-Payload nutzen.
   - Transport: `Uint8Array` → Base64 → Nostr `content`.
   - Eingehende Events: Base64 → `Uint8Array` → `Y.applyUpdate(ydoc, update, 'remote')`.
4. **Sichere Signatur-Logik:**
   - `signAndPublish(eventTemplate)` **niemals** im Code mit privatem Schlüssel implementieren.
   - Erwartet wird eine von außen injizierte Funktion, die z. B. NIP‑07 nutzt (`window.nostr.signEvent`).
5. **Erweiterbarkeit sicherstellen:**
   - Providerklassen so bauen, dass Relay-Liste, Kinds, Tags konfigurierbar sind.
   - Kein Hardcoding von Relay-URLs im gesamten Code verstreut (Zentralisierung in Config).
6. **Keine Infrastruktur-Annahmen:**
   - Aus Code nicht implizit ableiten, dass Relays privat oder öffentlich sind.
   - Verschlüsselung / Auth nur dort implementieren, wo in den Spezifikationen beschrieben.

---

## 6. Wichtige Module & Verantwortlichkeiten

Geplante Kernmodule (Details in `docs/`):

- `useLocalYDoc` – Lokale Yjs-Instanz für MVP 1.
- `useNostrYDoc` – Erstellt Yjs-Doc + `NostrYDocProvider` Instanz für MVP 2.
- `NostrYDocProvider` – Bidirektionales Binding Yjs ↔ Nostr (Updates, Snapshots optional).
- `NostrAwarenessProvider` – Binding Yjs-Awareness ↔ Nostr (Presence, Cursor-Infos).
- `TipTapEditor.svelte` – Editor-Komponente; wired an Yjs via Collaboration-Extensions.
- `signAndPublish` – Abstrakte Funktion, die signierte Nostr-Events publiziert (übergeben vom Host).

Jede Änderung durch Agents sollte diese Verantwortlichkeiten respektieren und **keine** Funktionsballons (God Objects) erzeugen.

---

## 7. Coding-Guidelines (Kurzfassung)

- **Sprache:** TypeScript für Logik, Svelte 5 für UI.
- **Stil:**
  - Klare, sprechende Namen (`documentId`, `relayUrls`, `awarenessProvider` etc.).
  - Keine Einbuchstabenvariablen im neuen Code.
  - Möglichst wenig globale Zustände; Runes/Stores bevorzugen.
- **Fehlerbehandlung:**
  - Nostr-Verbindungsfehler und Relay-Failures loggen.
  - Keine unendlichen Reconnect-Loops ohne Backoff.
- **Tests (perspektivisch):**
  - Wo möglich, reine Logik (Provider, Utilities) mit Unit-Tests versehen.

---

## 8. Wie Agents mit den Specs arbeiten sollen

- **Erst lesen:**
  - `docs/ARCHITECTURE.md`
  - `docs/EDITOR_SPEC.md`
  - `docs/YJS_NOSTR_SPEC.md`
  - `docs/PRESENCE_SPEC.md`
  - `docs/ROADMAP.md`
- **Dann umsetzen:**
  - Änderungen immer im Kontext der Roadmap / MVP-Stufe.
- **Keine Abweichungen ohne Dokumentation:**
  - Wenn du vom bestehenden Design abweichen musst, ergänze zuerst die entsprechende Spec-Datei mit einem kurzen Rationale-Abschnitt.

Damit sollte jeder Agent – menschlich oder maschinell – in der Lage sein, konsistent an dem Realtime-Editor mitzuwirken.