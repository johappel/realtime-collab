# YJS_NOSTR_SPEC – Spezifikation Yjs ↔ Nostr

Dieses Dokument beschreibt, wie Yjs (CRDT) mit Nostr-Relays als Transport interagiert.

---

## 1. Ziel

- Realtime-Synchronisation von Dokumenten über mehrere Clients hinweg.
- Nostr-Relays dienen als verteilter Message-Bus:
  - Yjs-Updates werden in Nostr-Events serialisiert.
  - Eingehende Nostr-Events werden wieder in Yjs-Updates übersetzt.

---

## 2. Yjs-Grundlagen

- Pro Dokument ein `Y.Doc`.
- TipTap Collaboration nutzt `ydoc.getXmlFragment('prosemirror')`.
- Wichtige APIs:
  - `ydoc.on('update', (update: Uint8Array, origin: any) => void)`
  - `Y.applyUpdate(ydoc, update: Uint8Array, origin?: any)`
  - `Y.encodeStateAsUpdate(ydoc)` für Snapshots.

---

## 3. Nostr-Events für Yjs

### 3.1 Event-Formate

- **Update-Events**
  - `kind: 9337` (Regular Event, damit History erhalten bleibt)
  - `content`: Base64-kodierte Yjs-Update (`Uint8Array`).
  - `tags`:
    - `["d", documentId]`

- **Snapshot-Events (optional)**
  - `kind: 31338` (Replaceable Event)
  - `content`: Base64-kodierter vollständiger Yjs-State (`encodeStateAsUpdate`).
  - `tags`:
    - `["d", documentId]`

### 3.2 Serialisierung

- **Uint8Array → Base64**
  - z. B. via:
    - `btoa(String.fromCharCode(...u8))`
- **Base64 → Uint8Array**
  - `atob` nutzen und resultierenden String in `Uint8Array` umwandeln.

---

## 4. NostrYDocProvider

### 4.1 Verantwortung

- Verbindung zwischen `Y.Doc` und Nostr herstellen:
  - Subscriben auf relevante Nostr-Events (`31337`, ggf. `31338`).
  - Eingehende Events in Yjs-Updates umwandeln und anwenden.
  - Lokale Yjs-Updates erkennen und als Nostr-Events publizieren.

### 4.2 Konstruktor-Signatur (Zielbild / Implementierung)

```ts
class NostrYDocProvider {
  constructor(opts: {
    ydoc: Y.Doc;
    documentId: string;
    relays?: string[];
    myPubkey?: string;
    signAndPublish?: (evt: EventTemplate) => Promise<void>;
    debug?: boolean;
  }) { /* … */ }
}
```

- `ydoc`: die zu synchronisierende Yjs-Instanz.
- `documentId`: Kanal-ID für das Dokument.
- `relays`: Liste von Relay-URLs (optional, Default im Code hinterlegt).
- `myPubkey`: öffentlicher Schlüssel des aktuellen Users (optional; nur für Event-Filtern nötig).
- `signAndPublish`: Funktion, welche ein `EventTemplate` signiert und an die Relays schickt (z. B. via NIP‑07). Wenn nicht gesetzt, werden lokale Updates zwar empfangen, aber nicht über Nostr publiziert (reiner Lese-Modus).
- `debug`: Optionaler Boolean, um detailliertes Logging (Raw WebSocket Events) zu aktivieren.

### 4.3 Verhalten

- **Subscribe (NativeRelay):**
  - Um Browser-Kompatibilitätsprobleme mit `nostr-tools` (SimplePool) zu vermeiden, wird eine interne `NativeRelay`-Klasse verwendet, die direkt auf `WebSocket` aufsetzt.
  - Sendet `["REQ", subId, { kinds: [9337], '#d': [documentId] }]`.
  - Auf jedem Event:
    - Content als Base64 → `Uint8Array`.
    - `Y.applyUpdate(ydoc, update, 'remote')`.
    - Optional: Events vom eigenen `pubkey` ignorieren.

- **Publish:**
  - `ydoc.on('update', (update, origin) => { … })` registrieren.
  - Nur Updates mit `origin !== 'remote'` senden, um Schleifen zu vermeiden.
  - Update → Base64 → `EventTemplate` mit Feldern:
    - `kind: 9337`
    - `content: <base64>`
    - `tags: [['d', documentId]]`
    - `created_at: Math.floor(Date.now() / 1000)`
  - `signAndPublish(template)` aufrufen; die Signaturfunktion ergänzt `pubkey` und Signatur gemäß nostr-tools.

- **Destroy:**
  - Subscriptions schließen.
  - Relay-Verbindungen schließen (falls nötig).

---

## 5. useNostrYDoc Hook

### 5.1 Zweck

- Svelte-freundliche Factory, die:
  - `Y.Doc` erzeugt,
  - `yXmlFragment` bereitstellt,
  - `NostrYDocProvider` initialisiert,
  - ein Disposables-Objekt zurückgibt.

### 5.2 Signatur (Zielbild)

```ts
export function useNostrYDoc(
  documentId: string,
  myPubkey: string,
  signAndPublish: (evt: EventTemplate) => Promise<void>
) {
  const ydoc = new Y.Doc();
  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  const provider = new NostrYDocProvider({
    ydoc,
    documentId,
    myPubkey,
    signAndPublish,
  });

  return { ydoc, yXmlFragment, provider };
}
```

- Cleanup (`provider.destroy()`) erfolgt in der aufrufenden Svelte-Komponente.

---

## 6. Security & Privacy

- **Signatur**
  - `signAndPublish` darf niemals private Keys direkt enthalten.
  - Erwartet ist z. B. Integration mit NIP‑07 (`window.nostr`).

- **Verschlüsselung** (später):
  - Für private Dokumente kann die Base64-Payload zusätzlich verschlüsselt werden.
  - Entschlüsselung erfolgt vor `Y.applyUpdate` im Client.

---

## 7. Grenzen & bekannte Herausforderungen

- Nostr garantiert keine totale Eventordnung – Yjs ist dafür ausgelegt.
- Relay-Ausfälle oder Latenz:
  - Können zu vorübergehend divergierenden States führen, die Yjs später zusammenführt.
- Snapshots sind optional, aber empfohlen für große Dokumente.

Awareness/Presence-spezifische Details werden in `PRESENCE_SPEC.md` definiert.