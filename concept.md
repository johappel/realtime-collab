# Konzept: Multi-App Kollaborations-Plattform

Dieses Dokument beschreibt das Konzept einer **Multi-App-Plattform** (Text-Editor, Mindmap, Todo-Liste, Whiteboard, etc.), die auf einer gemeinsamen technischen Basis operiert.

## 1. Grundidee: Nostr als universeller Realtime-Bus

Nostr bietet die ideale Infrastruktur für "Local-First" Kollaboration:
* **Events** als unveränderliche Zustände oder Patches.
* **Relays** als verteiltes Backend (Pub/Sub).
* **WebSockets** für Live-Updates.
* **Signaturen** für Identität und Integrität.

Anstatt für jede App (Editor, Mindmap, Todo) ein eigenes Backend zu bauen, nutzen wir Nostr als **Transport-Schicht** für einen universellen State-Container (**Yjs**).

---

## 2. Architektur: Svelte 5 + Yjs + Nostr

Die Plattform besteht aus drei Schichten:

### A) Frontend (Svelte 5)
* **Runes** (`$state`, `$derived`, `$effect`) für reaktives State-Management.
* **App-Isolation:** Jede App (z.B. `MindmapCanvas.svelte`, `TipTapEditor.svelte`) ist eine eigenständige Komponente.
* **Shared Components:** Wiederverwendbare UI-Elemente wie `AppHeader`, `PresenceList`, `SettingsDialog`.

### B) State Management (Yjs)
Yjs dient als **Single Source of Truth**. Jede App nutzt spezifische Yjs-Datentypen:
* **Text Editor:** `ydoc.getXmlFragment('prosemirror')`
* **Mindmap:** `ydoc.getMap('mindmap-nodes')`, `ydoc.getMap('mindmap-edges')`
* **Todo:** `ydoc.getMap('todo-data')`, `ydoc.getArray('todo-order')`
* **Whiteboard:** `ydoc.getArray('whiteboard-elements')`
* **Poll:** `ydoc.getMap('poll-data')`
* **Wiki:** `ydoc.getMap('wiki-pages')`

### C) Transport (Nostr Provider)
Zwei spezialisierte Provider kümmern sich um die Synchronisation:
1.  **`NostrYDocProvider` (Kind 9337):** Synchronisiert Yjs-Updates (binär, Base64).
2.  **`NostrAwarenessProvider` (Kind 31339):** Synchronisiert Presence-Informationen (Cursor, Online-Status).

---

## 3. Multi-App Strategie

Damit mehrere Apps koexistieren können, ohne sich gegenseitig zu stören, gelten folgende Prinzipien:

### 3.1 App-Isolation durch Präfixe
Jedes Dokument erhält eine ID. Um Kollisionen zu vermeiden (z.B. User öffnet "demo" im Editor und "demo" im Whiteboard), wird die `documentId` intern mit einem App-Präfix versehen:
*   `editor:demo`
*   `mindmap:demo`
*   `whiteboard:demo`

Dies verhindert "Cross-Contamination", bei der Updates oder Cursor aus einer App in einer anderen erscheinen.

### 3.2 Authentifizierung & Modi
Die Plattform unterstützt drei Nutzungs-Modi:
1.  **Local Mode:** Offline, Daten nur im Browser (IndexedDB).
2.  **Nostr Mode:** Persönliche Identität via NIP-07 Browser Extension (z.B. Alby).
3.  **Group Mode:** Gemeinsamer Zugriff via Shared Key (aus einem Gruppen-Code generiert), ideal für Lerngruppen/Schulen. **Neu:** Vollständig End-to-End verschlüsselt (NIP-44).

---

## 4. Features & UX

*   **Echtzeit-Kollaboration:** Änderungen werden sofort bei allen Teilnehmern sichtbar.
*   **Security & Privacy:** Im Group Mode sind alle Daten (Inhalte + Cursor) via NIP-44 (XChaCha20-Poly1305) verschlüsselt. Relays sehen nur Kauderwelsch.
*   **Presence:** Man sieht, wer gerade online ist und wo (Cursor/Avatar).
*   **Offline-First:** Dank `y-indexeddb` kann auch ohne Internet weitergearbeitet werden. Sync erfolgt bei Wiederverbindung.
*   **Performance:** Update-Batching verhindert Relay-Spam bei schnellen Änderungen.

---

## 5. Herausforderungen & Lösungen

*   **Latenz & Konflikte:** Yjs (CRDT) löst Konflikte mathematisch korrekt auf, egal in welcher Reihenfolge Updates eintreffen.
*   **Netzwerk-Last:** Updates werden gebündelt (Batched) und effizient kodiert.
*   **Browser-Kompatibilität:** Eigene `NativeRelay`-Implementierung sorgt für stabile WebSocket-Verbindungen.
*   **Ghost Users:** Intelligente "Ghost Killer"-Logik entfernt verwaiste Sessions (z.B. nach Tab-Close).

---

Dieses Konzept ermöglicht eine skalierbare Suite von Kollaborations-Tools, die alle auf derselben robusten Basis aufbauen.
