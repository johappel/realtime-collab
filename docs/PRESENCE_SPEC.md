# PRESENCE_SPEC – Presence & Cursors

Dieses Dokument beschreibt, wie Presence ("wer ist online, wer schreibt wo?") über Yjs Awareness und Nostr realisiert wird.

---

## 1. Ziel

- Mehrere Benutzer sehen gegenseitig:
  - farbige Cursors/Selections im Dokument.
  - wer aktuell anwesend ist.
- Presence soll **leichtgewichtig** sein und bei Verbindungsproblemen nicht den Dokumentzustand gefährden.

---

## 2. Yjs Awareness

- Bibliothek: `y-protocols/awareness`.
- Pro Dokument:

```ts
import { Awareness } from 'y-protocols/awareness';

const awareness = new Awareness(ydoc);
```

- Awareness speichert pro Client (`clientId`) einen `state`:

```ts
awareness.setLocalStateField('user', { name, color });
awareness.setLocalStateField('cursor', { anchor, head });
```

- Events:
  - `awareness.on('change', ({ added, updated, removed }, origin) => { … })`

---

## 3. Nostr-Events für Awareness

- **Kind:** `31339`
- **Tags:**
  - `["d", documentId]`
- **Content:** kompaktes JSON, z. B.:

```json
{
  "clientId": 123456,
  "user": { "name": "Alice", "color": "#ff8800" },
  "cursor": { "anchor": 10, "head": 15 },
  "ts": 1712345678
}
```

- Awareness-Events sind **ephemer**:
  - müssen nicht zwingend gespeichert werden,
  - können ggf. von Relays verworfen oder nach kurzer Zeit gelöscht werden.

---

## 4. NostrAwarenessProvider

### 4.1 Verantwortung

- Überträgt Awareness-Änderungen an andere Clients via Nostr.
- Wendet eingehende Awareness-Events auf das lokale Awareness-Objekt an.

### 4.2 Konstruktions-Skizze

```ts
class NostrAwarenessProvider {
  constructor(opts: {
    awareness: Awareness;
    documentId: string;
    relays?: string[];
    myPubkey: string;
    signAndPublish: (evt: EventTemplate) => Promise<void>;
  }) { /* … */ }
}
```

### 4.3 Verhalten

- **Lokale Awareness → Nostr**
  - `awareness.on('update' | 'change', handler)` registrieren.
  - Änderungen im lokalen Awareness-State serialisieren.
  - Event als `kind: 31339` mit `["d", documentId]` senden.

- **Nostr → Awareness**
  - Subscribe-Filter: `{ kinds: [31339], '#d': [documentId] }`.
  - `content` = JSON → Awareness-State für `clientId` setzen.
  - Eigene Events (z. B. über `pubkey`) können gefiltert werden, um Feedback-Schleifen zu vermeiden.

- **Timeout/GC**
  - Falls ein Client längere Zeit keine Updates sendet, sollte dessen Präsenz nach einem Timeout entfernt werden (Yjs Awareness bietet dafür Mechanismen).

---

## 5. Integration in TipTap (CollaborationCursor)

- TipTap-Extension `@tiptap/extension-collaboration-cursor` wird konfiguriert mit:

```ts
CollaborationCursor.configure({
  provider: { awareness },
  user,
});
```

- `user`: enthält mind. `name` und `color`.
- Awareness-Objekt versorgt die Extension mit den Cursorpositionen anderer Clients.

---

## 6. UX-Aspekte

- Cursors anderer Benutzer sollten farbig hervorgehoben werden.
- Name des jeweiligen Users wird am Cursor angezeigt (z. B. Label-Badge).
- Presence-Liste (z. B. Avatare oder Initialen) kann zusätzlich angezeigt werden.

---

## 7. Performance & Skalierung

- Awareness-Events sind relativ häufig (z. B. bei Cursorbewegungen).
- Mögliche Optimierungen:
  - Throttling (z. B. nur alle X ms senden).
  - Nur senden, wenn sich wirklich etwas geändert hat.

Presence ist „nice to have“ – bei Problemen darf sie versagen, ohne den Dokumentinhalt zu gefährden.