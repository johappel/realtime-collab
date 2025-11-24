# Umsetzungsplan: NIP-44 Verschlüsselung für Group Mode

## 1. Zielsetzung
Implementierung einer Ende-zu-Ende-Verschlüsselung (E2EE) für den "Group Mode" basierend auf NIP-44 (XChaCha20-Poly1305). Dies stellt sicher, dass öffentliche Nutzer den Inhalt von Gruppen-Dokumenten nicht mitlesen können, selbst wenn sie die `documentId` kennen.

## 2. Technische Grundlagen

### 2.1 NIP-44
NIP-44 ist der moderne Standard für Verschlüsselung in Nostr.
- **Algorithmus:** XChaCha20-Poly1305.
- **Vorteile:** Authenticated Encryption, Nonce-Randomisierung, Padding (versteckt Nachrichtenlänge).
- **Bibliothek:** `nostr-tools` bietet bereits `nip44`-Funktionen.

### 2.2 Schlüssel-Management im Group Mode
- **Shared Private Key:** Alle Gruppenmitglieder besitzen denselben Private Key (abgeleitet vom Gruppen-Code).
- **Verschlüsselung:** Da Sender und Empfänger identisch sind (die Gruppe), verschlüsseln wir "an uns selbst" (Sender PrivKey -> Empfänger PubKey, wobei Empfänger PubKey == Sender PubKey).

## 3. Implementierungsschritte

### Schritt 1: `nostrUtils.ts` erweitern
- [ ] Import von `nip44` aus `nostr-tools`.
- [ ] Helper-Funktion `encryptForGroup(content: string, groupPrivateKey: string): string` erstellen.
  - Nutzt `nip44.encrypt(groupPrivateKey, groupPubkey, content)`.
- [ ] Helper-Funktion `decryptForGroup(content: string, groupPrivateKey: string): string` erstellen.
  - Nutzt `nip44.decrypt(groupPrivateKey, groupPubkey, content)`.

### Schritt 2: `NostrYDocProvider.ts` anpassen
- [ ] **Konstruktor:** `groupPrivateKey` (optional) als Parameter hinzufügen.
- [ ] **Publishing (`publishPendingUpdates`):**
  - Prüfen, ob `groupPrivateKey` vorhanden ist.
  - Falls ja: `content` (Base64 Update) verschlüsseln.
  - Event-Kind bleibt `9337`.
  - Ggf. Tag hinzufügen? (Nicht zwingend nötig, da Entschlüsselung fehlschlägt, wenn nicht verschlüsselt).
- [ ] **Receiving (`applyEvent`):**
  - Prüfen, ob `groupPrivateKey` vorhanden ist.
  - Versuchen zu entschlüsseln (`try-catch`).
  - Falls Entschlüsselung erfolgreich: `content` als Base64 Update verarbeiten.
  - Falls Fehler: Event ignorieren (oder als unverschlüsselt behandeln, falls wir Mischbetrieb erlauben wollen - eher nein für Sicherheit).

### Schritt 3: `NostrAwarenessProvider.ts` anpassen
- [ ] Analog zu `NostrYDocProvider`: Verschlüsselung für Presence-Updates (Kind `31339`).
- [ ] Dies verhindert, dass öffentliche Nutzer sehen, *wer* gerade tippt oder wo die Cursor sind.

### Schritt 4: Hooks anpassen (`useNostrYDoc.ts`)
- [ ] `groupPrivateKey` aus `appState` oder Argumenten durchreichen an die Provider.

### Schritt 5: Unit Tests
- [ ] **`nostrUtils.test.ts`**: Testen von `encryptForGroup` und `decryptForGroup` (Roundtrip).
- [ ] **`NostrYDocProvider.test.ts`**:
  - Mocken von `signAndPublish`.
  - Testen: Verschlüsseltes Senden (Kind 9337).
  - Testen: Entschlüsseltes Empfangen.
  - Testen: Fehlerbehandlung bei falschem Key (Entschlüsselung schlägt fehl).
- [ ] **`useNostrYDoc.test.ts`**: Integrationstest (Mock-Relay), ob `groupPrivateKey` korrekt durchgereicht wird.

## 4. Migration & Kompatibilität
- **Breaking Change:** Bestehende Gruppen-Dokumente sind unverschlüsselt. Nach dem Update werden neue Events verschlüsselt sein. Alte Events können nicht mehr gelesen werden (oder wir bauen eine Fallback-Logik).
- **Empfehlung:** "Clean Break" für Gruppen. Neue Gruppen nutzen Verschlüsselung. Alte Gruppen müssen neu angelegt werden oder wir akzeptieren, dass die History unlesbar wird.

## 5. Test-Szenarien
1.  **Gruppe A (verschlüsselt):** Kann schreiben und lesen.
2.  **Öffentlicher User (unverschlüsselt):** Sieht Events, aber Inhalt ist "Müll" (verschlüsselt). Yjs sollte diese Updates ignorieren/verwerfen.
3.  **Gruppe B (anderer Key):** Kann Events von Gruppe A nicht entschlüsseln.

## 6. Zeitplan
- **Tag 1:** `nostrUtils` und `NostrYDocProvider` (Core Logic).
- **Tag 2:** `NostrAwarenessProvider` und Integration in UI/Hooks.
- **Tag 3:** Tests und Bugfixing.
