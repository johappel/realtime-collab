# Projekt-Fortschritt - Realtime Collaborative Editor

## Letzte Aktualisierung: 22.11.2025

### Status: Gruppen-Code Feature in Entwicklung 🚧

### ✅ Whiteboard Features (22.11.2025)
- **Navigation & Zoom**:
  - Stufenloser Zoom (Mausrad, Buttons).
  - Panning (Hand-Tool, Shift+Drag).
  - "Fit to Content" Funktion (Auto-Fit beim Laden).
  - 1:1 Pixel-Mapping für scharfe Darstellung.
- **Erweiterte Interaktion**:
  - Multi-Selection (Rahmen aufziehen, Shift+Klick).
  - Multi-Move (Verschieben ganzer Gruppen).
  - Clipboard-Support (Copy, Paste, Duplicate).
  - Tastatur-Shortcuts (Ctrl+C/V/D, Del).
- **Neue Entity: Figur**:
  - Avatar-Element (Kopf + Körper) zur Positionierung von Nutzern.
  - Editierbares Namensschild.
  - Automatische Übernahme von User-Farbe und Name.
  - Voll integriert in Yjs-Sync und Undo/Redo.

## Abgeschlossene Meilensteine

### ✅ Phase 0: Projekt-Setup
- SvelteKit mit Svelte 5 (Runes) initialisiert
- Alle Dependencies installiert (TipTap, Yjs, Nostr-Tools, y-protocols)
- Projektstruktur angelegt

### ✅ MVP 1: Lokaler kollaborativer Editor
- `useLocalYDoc` Hook implementiert
- TipTapEditor-Komponente mit Collaboration-Extension
- Funktionierende Editor-Routen unter `/editor/[documentId]`
- Lokale Yjs-Synchronisation funktioniert

### ✅ MVP 2: Nostr als Transport für Yjs-Updates
- `NostrYDocProvider` vollständig implementiert
- `useNostrYDoc` Hook mit NIP-07 Integration
- Mode-Switcher (Local/Nostr) in der UI
- `nostrUtils.ts` mit `signAndPublishNip07` und `getNip07Pubkey`
- Bidirektionale Synchronisation über Nostr-Relays (kind: 9337 - Regular Event für History)
- **Neu:** Custom `NativeRelay` Implementierung für robuste Browser-Verbindungen
- **Neu:** Debug-Modus für detailliertes Logging
- **Neu:** Offline-First Architektur durch `y-indexeddb` (Persistenz auch ohne Verbindung)

### ✅ MVP 3: Presence & Cursors
- `NostrAwarenessProvider` implementiert (kind: 31339)
- CollaborationCursor-Extension integriert
- PresenceList-Komponente zeigt aktive Nutzer (Reaktivität gefixt)
- Awareness-State wird über Nostr synchronisiert
- Farbcodierte Cursor und User-Avatare

### ✅ UI/UX & Feature Updates (20.11.2025)
- **Layout Overhaul**:
  - Header fixiert, Editor nimmt volle Höhe ein (100vh).
  - 3-Spalten-Grid im Header für bessere Platzaufteilung.
  - Toolbar in eigene Komponente `EditorToolbar.svelte` ausgelagert.
- **Settings Dialog**:
  - Neue Komponente `SettingsDialog.svelte` für Editor-Einstellungen.
  - Konfigurierbare maximale Breite (Max-Width).
  - Download-Optionen (HTML, Doc, Markdown-Stub).
- **Dokument-Titel**:
  - Titel kann nun unabhängig vom URL-Slug bearbeitet werden.
  - Synchronisation des Titels über Yjs Metadata (`ydoc.getMap("metadata")`).
  - **Bugfix**: Reaktivitäts-Problem (Input Locking) durch `untrack` in Svelte 5 Runes behoben.

### ✅ Bugfix: Mismatched Transaction & Cursor Visibility (20.11.2025)
- **Problem**: `RangeError: Applying a mismatched transaction` beim Laden des Editors.
  - Ursache: Versionskonflikt zwischen `@tiptap/extension-collaboration` (v3) und `@tiptap/extension-collaboration-cursor` (deprecated).
  - Ursache 2: Race Conditions beim dynamischen Update des Users im Editor.
- **Lösung**:
  - Migration auf `@tiptap/extension-collaboration-caret` (offizieller Nachfolger für v3).
  - Refactoring `TipTapEditor.svelte`: Editor wird bei User-Wechsel neu instanziiert statt dynamisch aktualisiert.
  - CSS-Klassen angepasst (`.collaboration-carets__*`), damit Cursors wieder sichtbar sind.

### ✅ Bugfix: Synchronization & Connection Stability (20.11.2025)
- **Problem**: Synchronisation brach bei großen Änderungen (z.B. Löschen des gesamten Dokuments) ab.
  - Ursache: Stack Overflow bei der Base64-Konvertierung großer Uint8Arrays.
  - Lösung: Chunk-basierte Base64-Konvertierung in `NostrYDocProvider` implementiert.
- **Problem**: "Immer schlimmer werdende" Synchronisation bei schnellen Updates.
  - Ursache: Connection Leak – für jedes Update wurde eine neue WebSocket-Verbindung geöffnet.
  - Lösung: Implementierung eines globalen `sharedPool` in `nostrUtils.ts` zur Wiederverwendung von Verbindungen.
- **Problem**: "Ghost Users" und instabile Presence bei mehreren Tabs.
  - Ursache: Zu aggressive "Ghost Killer"-Logik löschte aktive Sessions desselben Users.
  - Lösung: Logik verfeinert – alte Sessions werden nur entfernt, wenn eine *neue* Session desselben Users aktiv wird (Last-Write-Wins pro Pubkey).

## Implementierte Komponenten

### Core Libraries
- ✅ `src/lib/useLocalYDoc.ts` - Lokales Yjs-Setup mit Awareness & IndexedDB
- ✅ `src/lib/useNostrYDoc.ts` - Nostr-basiertes Yjs-Setup mit IndexedDB
- ✅ `src/lib/NostrYDocProvider.ts` - Yjs-Dokument-Synchronisation via Nostr (mit NativeRelay)
- ✅ `src/lib/NostrAwarenessProvider.ts` - Presence-Synchronisation via Nostr (mit NativeRelay)
- ✅ `src/lib/nostrUtils.ts` - NIP-07 Integration & NativeRelay Shared Class

### UI Komponenten
- ✅ `src/lib/TipTapEditor.svelte` - Haupt-Editor mit Mode-Switching und Metadata-Sync
- ✅ `src/lib/PresenceList.svelte` - User-Presence-Anzeige
- ✅ `src/lib/EditorToolbar.svelte` - Ausgelagerte Toolbar
- ✅ `src/lib/SettingsDialog.svelte` - Einstellungen & Export
- ✅ `src/routes/editor/+page.svelte` - Document-Auswahl
- ✅ `src/routes/editor/[documentId]/+page.svelte` - Editor-Seite mit neuem Layout

### ✅ Gruppen-Code Authentifizierung (22.11.2025)
- **Dual-Mode Login**: 
  - Standard-Modus: NIP-07 Browser Extension (Alby, nos2x) für persönliche Identität
  - Gruppen-Modus: 8-stelliger Code für vereinfachtes Lerngruppenmanagement
- **Deterministischer Key-Derivation**: 
  - `generateKeyFromCode()`: SHA-256 Hash des Codes → Nostr Private Key
  - Alle Gruppenmitglieder mit demselben Code erhalten denselben Key
- **Lokale Identität**:
  - `getOrSetLocalIdentity()`: Nickname-Persistenz im LocalStorage
  - Awareness-basierte Unterscheidung der Nutzer im Editor
- **URL-Parameter Support**: 
  - Auto-Login via `?code=KURS-A&name=Max`
  - Auto-Login via `?code=KURS-A&name=Max`
  - Perfekt für QR-Codes und Director-Agent Integration

### ✅ Erklärseite für Laien (22.11.2025)
- Neue Route `/about` erstellt
- Einfache Erklärung der Komponenten (Apps UI, Y-DOC, NOSTR, Blossom)
- Datenschutz-Hinweise für Lernende
- Technische Anforderungen (Relays, Kinds)


## Nächste Schritte (Optional - Phase 4)

### Potenzielle Erweiterungen
- [ ] User-Management & Auth
  - Custom User-Namen und Farben
  - Persistente User-Identitäten
- [ ] Private Dokumente
  - NIP-04/NIP-44 Verschlüsselung
  - Access-Control
- [ ] Dokumentenverwaltung
  - Dokumenten-Liste
  - Erstellen/Löschen/Umbenennen
- [ ] UI/UX-Verbesserungen
  - Themes (Light/Dark Mode)
  - Erweiterte Toolbar
  - History-Ansicht
  - Kommentare

## Technische Details

### Nostr Event-Arten
- **Kind 9337**: Yjs-Dokument-Updates (Base64-encoded)
  - Tag: `["d", documentId]`
  - Regular Event (nicht Replaceable), um History zu bewahren
- **Kind 31339**: Awareness/Presence-Updates (JSON)
  - Tag: `["d", documentId]`
  - Content: `{ clientId, state, ts }`
  - Replaceable Event

### Relay-Konfiguration
Standard-Relay (Dev): `ws://localhost:7000`

Kann in den Providern überschrieben werden:
```typescript
new NostrYDocProvider({
  // ...
  relays: ['wss://custom-relay.com']
})
```

## Bekannte Einschränkungen

1. **Peer Awareness Version Mismatch**: 
   - `@tiptap/extension-collaboration-cursor` v2.26.2 hat peer dependency zu `@tiptap/core@^2.x`
   - Aktuell wird `@tiptap/core@3.10.8` verwendet
   - Funktioniert trotzdem, aber Warning vorhanden
   - **Update 20.11.2025**: Version auf `3.0.0-next.6` aktualisiert, um Kompatibilitätsprobleme zu beheben.

2. **Browser-Extension erforderlich für Nostr-Modus**:
   - Nutzer müssen eine NIP-07 Extension installieren (z.B. Alby, nos2x)
   - Ohne Extension funktioniert nur der Local-Modus

3. **Lokales Relay für Entwicklung**:
   - Aktuell ist `ws://localhost:7000` als Default konfiguriert.
   - Für Production muss dies auf öffentliche Relays geändert werden.

4. **Race Conditions beim Profil-Laden**:
   - Wurde durch `untrack` und strikte Cleanup-Reihenfolge im `TipTapEditor` behoben.

5. **Ghost Users**:
   - Implementierung einer "Single Session per User" Logik im `NostrAwarenessProvider`.
   - Alte Sessions desselben Users (gleicher Pubkey, andere ClientID) werden aktiv entfernt.
   - Explizites `awareness.destroy()` beim Unmounten verhindert verwaiste Verbindungen.

## Projektmetriken

- **Implementierte MVPs**: 3/3
- **Core Files**: 11
- **Lines of Code**: ~1650
- **Dependencies**: 12 production, 18 dev

## Dokumentation

Alle Spezifikationen sind aktualisiert:
- ✅ `docs/AGENTS.md` - Developer Guidelines
- ✅ `docs/ROADMAP.md` - Development Plan
- ✅ `docs/ARCHITECTURE.md` - System Architecture
- ✅ `docs/YJS_NOSTR_SPEC.md` - Yjs-Nostr Integration
- ✅ `docs/PRESENCE_SPEC.md` - Presence & Cursors
- ✅ `README.md` - Project Overview

## Fazit

Das Projekt hat alle geplanten MVPs erfolgreich abgeschlossen. Der Editor ist stabil, unterstützt Echtzeit-Kollaboration und Presence-Features (Cursor, Typing-Indicator). Kritische Bugs (Race Conditions, Version Mismatches) wurden behoben.
