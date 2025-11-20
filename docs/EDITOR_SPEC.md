# EDITOR_SPEC – Spezifikation des Svelte/TipTap-Editors

Dieses Dokument definiert, wie der Editor in der Svelte 5 App aufgebaut wird.

---

## 1. Ziele

- Google-Docs-ähnliches Bearbeitungserlebnis mit:
  - Rich-Text (Fett, Kursiv, Überschriften, Listen, Codeblöcke, Zitate, Links …)
  - Optionaler Markdown-Kompatibilität
  - Realtime-Kollaboration (Yjs)
  - Cursors & Presence (später, MVP 3)

---

## 2. Bibliotheken & Versionen (Richtwerte)

- `svelte@next` (Svelte 5, Runes)
- `@sveltejs/kit`
- `yjs`
- `@tiptap/core`
- `@tiptap/starter-kit`
- `@tiptap/extension-collaboration`
- `@tiptap/extension-collaboration-cursor`
- später: `nostr-tools`

Konkrete Versionen werden in `package.json` festgelegt.

---

## 3. Komponentenstruktur

### 3.1 `TipTapEditor.svelte`

**Verantwortung:**

- Stellt den eigentlichen Editor dar.
- Bindet TipTap an ein Yjs-`XmlFragment`.
- Kümmert sich **nicht** um Nostr-Details; diese werden in Hooks/Providern implementiert.

**Props:**

- `documentId: string` – ID des aktuellen Dokuments.
- `user: { name: string; color: string; [key: string]: any }` – User-Metadaten.
- Optional (ab MVP 2):
  - `myPubkey: string`
  - `signAndPublish: (evt: EventTemplate) => Promise<void>`
  - `debug: boolean` (optional, default: false)

**Interne Logik:**

- Abhängig vom Modus:
  - MVP 1: ruft `useLocalYDoc(documentId)`.
  - MVP 2+: ruft `useNostrYDoc(documentId, myPubkey, signAndPublish, debug)`.
- Erzeugt TipTap-`Editor` mit Extensions:
  - `StarterKit.configure({ history: false })`
  - `Collaboration.configure({ document: yXmlFragment })`
  - MVP 3: `CollaborationCursor.configure({ awareness, user })`

**Lifecycle:**

- Editor-Erzeugung innerhalb eines `$effect` oder `onMount`, Cleanup in der Rückgabefunktion:
  - `editor.destroy()`
  - Provider `.destroy()` aufrufen (falls genutzt)

---

## 4. Routen & Pages

### 4.1 Beispielroute

- `src/routes/editor/[documentId]/+page.svelte`

**Aufgaben:**

- `documentId` aus `page`-Store/URL auslesen.
- User-Objekt erstellen (später: Auth-Integration).
- `TipTapEditor` rendern.

**Beispiel (logisch):**

- Siehe `concept.md` – die dort skizzierte Route ist Referenz.

---

## 5. Styling & UX-Vorgaben (MVP)

- Fokus auf Funktionalität, aber:
  - Editor-Fläche mit klarer Umrandung (`border`, `padding`).
  - Mindestens eine Grundhöhe von ~200–300px.
  - Gute Lesbarkeit (Zeilenhöhe, Schriftgröße, Farben).

- Später (nicht MVP-blockend):
  - Toolbar mit Buttons für Formatierungen (Bold, Italic, Headings etc.).
  - Keyboard-Shortcuts (TipTap unterstützt Standard-Shortcuts bereits).
  - Modale/Popups für Links, Bilder etc.

---

## 6. Kollaboration – Editor-Seite

- Die Kollaboration wird vollständig über die TipTap-Collaboration-Extension + Yjs abgewickelt.
- Kein manuelles Mergen von Textzuständen im Editor.
- Der Editor reagiert auf Änderungen der `Y.Doc`-Instanz, die durch Provider (lokal oder Nostr) gespeist wird.

---

## 7. Integration in App-Shell

- Editor soll sich in ein SvelteKit-Layout einfügen lassen (z. B. Navigation, Dokumentliste, User-Info oben).
- `TipTapEditor` bleibt möglichst eigenständig, sodass er in verschiedenen Routen (z. B. `/editor/[documentId]`, `/docs/[id]/edit`) wiederverwendet werden kann.

Weitere technische Details zum Zusammenspiel mit Yjs & Nostr sind in `YJS_NOSTR_SPEC.md` beschrieben.