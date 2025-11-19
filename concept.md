## 1. Grundidee: Nostr als Realtime-Backend

Nostr bringt dir eigentlich schon alles mit, was du für „realtime collaborative“ brauchst:

* **Events** als unveränderliche Zustände oder Patches
* **Relays** als verteiltes Backend (Pub/Sub)
* **WebSockets**: Client (Svelte5-App) hängt live am Relay
* **Signaturen**: jede Änderung ist einer Person zugeordnet (npub)

Für Kollaboration brauchst du dann im Wesentlichen:

1. **Datenmodell**, das konfliktresistent ist (CRDT, Operational Transform o. ä.)
2. **Mapping auf Nostr-Events**, z. B. pro Dokument ein Stream von Events (kind X)
3. **Client-Logik**, die diese Events:

   * abonniert,
   * in einen Zustand zusammenführt,
   * und bei Änderungen neue Events publiziert.

---

## 2. Svelte 5 („runes“) als Frontend

Svelte 5 ist dafür ziemlich ideal:

* Reaktive Stores / Runes für:

  * `currentDoc` (aktueller Text)
  * `cursor/selection` der User
  * `presence` (wer ist online)
* Ein **WYSIWYG- oder Markdown-Editor** (z. B. TipTap, ProseMirror, Milkdown, CodeMirror mit Markdown) lässt sich integrieren.
* Änderungen im Editor → in einem Store sammeln → in Nostr-Events serialisieren.

Beispielhafte Architektur (grob):

* `useRelay()`-Rune/Store: WebSocket-Verbindung zu Relays
* `useDocument(docId)`:

  * lädt initialen Zustand (z. B. letzten Snapshot)
  * abonniert alle Events zu `docId`
  * wendet sie als Patches/CRDT-Updates an
  * liefert `doc`, `applyChange(change)` zurück
* `MarkdownEditor.svelte`:

  * zeigt Editor
  * onChange → `applyChange` aufrufen → erzeugt Nostr-Event

---

## 3. Datenmodell: Wie speicherst du den Text?

Da gibt es mehrere Strategien:

### A) Simple, aber fehleranfällig: „Last write wins“

* Jeder Keypress/Blockchange → schickst du als kompletten Inhalt oder diff.
* Alle Clients nehmen einfach das Event mit dem neuesten Timestamp.
* Funktioniert für **einfachen Use Case**, ist aber bei vielen gleichzeitigen Edits unsauber (Race Conditions, „Text springt“).

Eher nur für Prototypen.

---

### B) Besser: CRDT über Nostr

Sauber wird es mit einem **CRDT** (Conflict-free Replicated Data Type), z. B.:

* Yjs
* Automerge

Wie passt das mit Nostr zusammen?

* CRDT-Bibliothek läuft **vollständig im Client**.
* Änderungen (CRDT-Updates) werden als **Binär- oder Base64-Blob** in Nostr-Events veröffentlicht.
* Alle Clients:

  * abonnieren dieselben Events
  * füttern die Updates in dieselbe CRDT-Instanz
    → Zustand bleibt bei allen identisch, auch bei Latenzen.

Typisches Pattern:

* Nostr-kind (z. B. 30000, 30023, custom kind) für „Dokument-Stream“
* Tags z. B. `["d", "<docId>"]` zur Identifikation des Dokuments
* Feld `content`: Base64-kodiertes CRDT-Update
* Optional alle x Sekunden / Änderungen: Snapshot-Event (damit neue Clients nicht 10.000 Events durchrattern müssen)

---

## 4. Presence / Cursors / „Wer tippt gerade?“

Dafür kannst du eigene Event-Typen nutzen:

* Leichte „ephemere“ Events (ggf. Non-standard-kind), z. B.:

  * `kind: 30xxx` für Cursor-Position und Auswahl
* Inhalt: z. B. JSON mit:

  * `docId`
  * `cursorStart`, `cursorEnd`
  * `userColor`, `userName`

Die Svelte5-App:

* subscribed auf diese Events
* mappt sie auf einen `presence`-Store
* zeigt Cursors/Highlights im Editor an.

---

## 5. Markdown WYSIWYG konkret

Du könntest z. B. so vorgehen:

1. **Editor wählen**:

   * Rich-Text-Editor mit Markdown-Unterstützung (TipTap, ProseMirror, Milkdown)
   * oder Markdown-Textarea + Preview (einfacher)

2. **Integrationsstrategie**:

   * Editor sorgt für Text / Document-JSON
   * CRDT läuft auf einer „Modellschicht“ darunter (z. B. Text als CRDT-String oder ProseMirror-JSON als CRDT-Dokument)
   * Änderungen vom Editor → in CRDT patchen → Update-Event über Nostr
   * Eingehende CRDT-Updates → Editor-Dokument aktualisieren

3. **Svelte5-Rune/Store**:

   * `const [doc, setDoc] = useStore(initialDoc)`
   * `const [connection] = useRelay(relays)`
   * `connection.onEvent(update => crdt.apply(update); setDoc(crdt.toText()))`

---

## 6. Herausforderungen (ehrliche Ecke)

* **Latenz & Reihenfolge:** Nostr garantiert dir keine perfekte Event-Reihenfolge → CRDT ist quasi Pflicht, wenn’s wirklich „Google Docs-mäßig“ sein soll.
* **Performance:** Viele kleine Events können Relays & Clients stressen → Batching & Snapshots einplanen.
* **Auth/Zugriff:** Nostr ist grundsätzlich offen. Wenn du private Doks willst:

  * verschlüsselte Inhalte (NIP-04 / NIP-44)
  * oder eigenen Relay mit Auth-Regeln.
* **Editor-Integration:** ProseMirror/TipTap & CRDT sauber zu verheiraten ist nicht trivial, aber machbar.

---
