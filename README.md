# Realtime Collaborative Editor

Ein **Google Docs-ähnlicher Realtime-Editor** mit Svelte 5, TipTap, Yjs und Nostr als verteiltem Message-Bus.

## Features

✅ **MVP 1 - Lokaler Editor**
- Rich-Text Editor mit TipTap
- CRDT-basierte Konfliktauflösung mit Yjs
- Lokale Kollaboration (mehrere Tabs)

✅ **MVP 2 - Nostr-Integration**
- Dezentralisierte Synchronisation über Nostr-Relays
- Unterstützung für NIP-07 Browser-Extensions
- Mode-Switcher (Local/Nostr)

✅ **MVP 3 - Presence & Cursors**
- Live-Cursor-Synchronisation
- Farbcodierte Benutzer
- Presence-Liste mit aktiven Nutzern

## Installation

```bash
# Dependencies installieren
pnpm install

# Dev-Server starten
pnpm run dev
```

## Verwendung

1. Navigiere zu `/editor` und wähle eine Document-ID
2. Öffne das gleiche Dokument in mehreren Browser-Tabs oder Fenstern
3. **Lokaler Modus**: Synchronisation über Browser-Speicher (IndexedDB/Memory)
4. **Nostr-Modus**: Aktiviere eine NIP-07 Extension (z.B. Alby, nos2x) und wähle "Nostr" aus

## Architektur

```
src/
├── lib/
│   ├── TipTapEditor.svelte       # Haupt-Editor-Komponente
│   ├── PresenceList.svelte       # User-Presence-Anzeige
│   ├── useLocalYDoc.ts           # Lokales Yjs-Setup
│   ├── useNostrYDoc.ts           # Nostr-basiertes Yjs-Setup
│   ├── NostrYDocProvider.ts      # Yjs ↔ Nostr Sync (Dokument)
│   ├── NostrAwarenessProvider.ts # Yjs ↔ Nostr Sync (Presence)
│   └── nostrUtils.ts             # NIP-07 Utilities
└── routes/
    └── editor/
        ├── +page.svelte          # Document-Auswahl
        └── [documentId]/
            └── +page.svelte      # Editor-Seite
```

## Technologien

- **Svelte 5** (Runes) - UI Framework
- **TipTap** - Rich-Text Editor
- **Yjs** - CRDT für Konfliktauflösung
- **Nostr** - Dezentrales Messaging-Protokoll
- **nostr-tools** - Nostr Client Library
- **y-protocols** - Yjs Awareness Protocol

## Dokumentation

Siehe `/docs` für detaillierte Spezifikationen:
- `AGENTS.md` - Entwickler-Guidelines
- `ROADMAP.md` - Entwicklungsplan
- `ARCHITECTURE.md` - System-Architektur
- `YJS_NOSTR_SPEC.md` - Yjs-Nostr-Integration
- `PRESENCE_SPEC.md` - Presence & Cursors
- `EDITOR_SPEC.md` - Editor-Spezifikation

## Lizenz

MIT
