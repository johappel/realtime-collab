# Multi-App Architektur

Dieses Dokument beschreibt die Architektur der "Multi-App"-Plattform, die es ermöglicht, verschiedene kollaborative Anwendungen (Text-Editor, Mindmap, Todo-Liste) auf einer gemeinsamen technischen Basis zu betreiben.

## 1. Grundkonzept

Das Ziel ist eine Suite von "Local-First" Kollaborations-Tools, die:
1.  **Offline-fähig** sind (Local-First).
2.  **Echtzeit-fähig** sind (via Nostr-Relays).
3.  **Daten-agnostisch** sind (Yjs als universeller State-Container).

Anstatt für jede App ein eigenes Backend zu bauen, nutzen alle Apps denselben Stack: **Svelte 5 + Yjs + Nostr**.

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
*   **Awareness:** Cursor-Positionen und Online-Status laufen über Ephemeral Events (Kind `20000`+ / `31339`).
*   **Signierung:** Erfolgt zentral über NIP-07 (Browser-Extension) oder lokale Keys.

### 2.3 Hooks & Provider Pattern
Jede App implementiert einen spezifischen Hook, der den generischen `useNostrYDoc` Hook wrappt:

```typescript
// Generischer Base-Hook
useNostrYDoc(docId, ...) -> { ydoc, provider, awareness }

// App-Spezifischer Hook (Beispiel)
useTodoYDoc(docId, ...) -> { 
    items: Writable<TodoItem[]>, // Svelte Store für UI
    addItem: (text) => void,     // High-Level Action
    ... 
}
```

**Vorteil:** Die UI-Komponenten (`TodoApp.svelte`) müssen nichts von Yjs oder Nostr wissen. Sie interagieren nur mit Stores und Funktionen.

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

## 4. Offene Punkte & Anpassungsbedarf

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

## 5. Zusammenfassung für Entwickler

*   **Neue App erstellen:**
    1.  Erstelle `src/lib/apps/neue-app/`.
    2.  Schreibe `useNeueAppYDoc.ts`: Wrappe `useNostrYDoc`, definiere Yjs-Typen, exportiere Svelte-Stores.
    3.  Baue `NeueApp.svelte`: Nutze nur die Stores/Actions aus dem Hook.
*   **Bestehende Apps erweitern:**
    *   Ändere zuerst das Datenmodell im Hook (`use...YDoc.ts`).
    *   Passe dann die UI an.
*   **Infrastruktur ändern:**
    *   Änderungen an `NostrYDocProvider` betreffen **alle** Apps. Vorsicht!

