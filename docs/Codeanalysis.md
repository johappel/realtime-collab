# Code-Analyse & Performance-Optimierung

Datum: 24.11.2025
Status: Draft

## 1. Zusammenfassung

Die Analyse der Codebasis (`src/lib/NostrYDocProvider.ts`, `src/lib/NostrAwarenessProvider.ts`, `src/lib/nostrUtils.ts`) hat einige Performance-kritische Bereiche identifiziert. Das Hauptproblem liegt in der **fehlenden Batching-Strategie für Yjs-Updates**, was zu einer Überflutung der Nostr-Relays und hoher Netzwerklast führen kann.

## 2. Identifizierte Probleme

### 2.1 Kritisch: Fehlendes Update-Batching (Nostr Spam)
**Ort:** `src/lib/NostrYDocProvider.ts` -> `bindYDocUpdates`

**Problem:**
Jedes einzelne Yjs-Update (z.B. jeder Tastenanschlag) löst sofort ein `signAndPublish` aus.
```typescript
this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
  // ...
  this.signAndPublish(nostrEvent)...
});
```
Bei schnellem Tippen können so dutzende Events pro Sekunde erzeugt werden. Dies führt zu:
- Rate-Limiting durch Relays.
- Hoher Bandbreitennutzung.
- Performance-Problemen beim Replay (viele kleine Events müssen geladen und angewendet werden).

**Lösungsvorschlag:**
Implementierung eines **Debounce- oder Batching-Mechanismus**. Updates sollten gesammelt und erst nach einer kurzen Verzögerung (z.B. 500ms) oder bei Erreichen einer bestimmten Größe als ein zusammengefasstes Event gesendet werden.

### 2.2 Major: Ineffiziente Base64-Konvertierung
**Ort:** `src/lib/NostrYDocProvider.ts` -> `uint8ToBase64`

**Problem:**
Die Funktion nutzt eine manuelle Schleife mit `String.fromCharCode.apply` in Chunks.
```typescript
function uint8ToBase64(u8: Uint8Array): string {
  // ... manuelle Chunk-Schleife ...
  return btoa(result);
}
```
Dies ist in modernen JavaScript-Umgebungen unnötig komplex und potenziell langsamer als optimierte native Methoden oder Bibliotheken.

**Lösungsvorschlag:**
Verwendung von `fromUint8Array` aus `js-base64` oder Optimierung der bestehenden Funktion (z.B. Nutzung von `TextDecoder` für String-Konvertierung vor `btoa` oder direkte Buffer-Nutzung falls möglich).

### 2.3 Minor: Subscription Management
**Ort:** `src/lib/nostrUtils.ts` -> `NativeRelay`

**Problem:**
Jede Instanz von `NativeRelay` erstellt eine neue Subscription (`REQ`) mit einer neuen `subId`.
Wenn ein Nutzer zwischen Apps wechselt oder viele Komponenten `useNostrYDoc` nutzen, können sich Subscriptions auf der WebSocket-Verbindung anhäufen, falls `destroy()` nicht sauber durchläuft oder Relays Limits für offene Subscriptions haben.

**Lösungsvorschlag:**
Sicherstellen, dass `destroy()` in allen Komponenten (`TipTapEditor`, `MindmapCanvas`, etc.) zuverlässig aufgerufen wird. Langfristig könnte ein zentraler Subscription-Manager (ähnlich `SimplePool` aber robuster) helfen, identische Subscriptions zu deduplizieren.

### 2.4 Minor: JSON Parsing Overhead
**Ort:** `src/lib/NostrAwarenessProvider.ts` -> `handleEvent`

**Problem:**
Jedes eingehende Awareness-Event wird sofort geparst:
```typescript
const content = JSON.parse(event.content);
```
Erst danach wird geprüft, ob die `clientId` relevant ist (z.B. nicht die eigene).

**Lösungsvorschlag:**
Optimierung der Filter-Reihenfolge. Erst Metadaten (Tags, Pubkey) prüfen, dann teures JSON-Parsing durchführen.

## 3. Maßnahmenplan

### Schritt 1: Update-Batching implementieren (Priorität: Hoch)
- `NostrYDocProvider` um einen Puffer erweitern.
- `Y.mergeUpdates` nutzen, um gesammelte Updates zu vereinen.
- Timer-basiertes Senden (z.B. `setTimeout` mit 500ms Debounce).

### Schritt 2: Base64 Optimierung (Priorität: Mittel)
- `uint8ToBase64` durch effizientere Implementierung ersetzen.

### Schritt 3: Code Cleanup (Priorität: Niedrig)
- `NostrAwarenessProvider` Parsing optimieren.
- Sicherstellen, dass alle `destroy()` Aufrufe korrekt implementiert sind.
