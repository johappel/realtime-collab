# Benutzerhandbuch – Realtime Editor

Dieses Dokument beschreibt die speziellen Funktionen zum Importieren und Exportieren von Inhalten sowie die URL-Parameter-Steuerung des Editors.

## 1. Inhalte importieren (URL-Parameter)

Der Editor unterstützt das automatische Befüllen neuer Dokumente über URL-Parameter. Dies ist besonders nützlich für Integrationen mit anderen Tools (z. B. LLMs, CMS) oder zum Erstellen von "Vorlagen-Links".

**Wichtig:** Der Import findet nur statt, wenn das Dokument (die `documentId`) noch **leer** ist. Bestehende Inhalte werden niemals überschrieben.

### 1.1 Direkter Text-Import (`text` oder `content`)

Sie können Markdown-Text direkt in der URL übergeben. Der Text muss URL-kodiert sein.

**Parameter:** `text` oder `content`

**Beispiel:**
```
http://localhost:5173/editor/mein-neues-doc?text=%23%20Hallo%20Welt%0A%0ADas%20ist%20ein%20Test.
```
*Interpretiert als:*
> # Hallo Welt
>
> Das ist ein Test.

### 1.2 Import von einer URL (`file`)

Sie können den Editor anweisen, eine externe Datei (z. B. eine Markdown-Datei) zu laden und als Startinhalt zu verwenden.

**Parameter:** `file`

**Beispiel:**
```
http://localhost:5173/editor/fragebogen-neu?file=http://localhost:5173/vorlagen/fragebogen.md
```

**Voraussetzungen:**
- Die Ziel-URL muss öffentlich erreichbar sein.
- Der Server der Ziel-URL muss **CORS** (Cross-Origin Resource Sharing) erlauben, wenn er nicht auf derselben Domain liegt wie der Editor.

### 1.3 Automatische Markdown-Konvertierung

Sowohl beim direkten Text-Import als auch beim Datei-Import wird der Inhalt automatisch als **Markdown** erkannt und in das Rich-Text-Format des Editors umgewandelt.

---

## 2. Inhalte exportieren & Ansichten

### 2.1 Export-Funktionen

Über das **Einstellungen-Menü** (Zahnrad-Icon oben rechts) können Sie das aktuelle Dokument in verschiedenen Formaten herunterladen:

- **Markdown (.md):** Lädt den Inhalt als reine Markdown-Datei herunter.
- **HTML (.html):** Lädt den Inhalt als HTML-Datei herunter.
- **Word (.doc):** Lädt den Inhalt als HTML-basiertes Word-Dokument herunter (kompatibel mit MS Word und LibreOffice).

### 2.2 Markdown-Ansicht (`markdown`)

Sie können den aktuellen Inhalt des Dokuments als reinen Markdown-Code anzeigen lassen, indem Sie den Parameter `markdown` an die URL anhängen. Dies ist eine Lese-Ansicht.

**Parameter:** `markdown` (ohne Wert)

**Beispiel:**
```
http://localhost:5173/editor/mein-dokument?markdown
```

---

## 3. Dokument-Titel

Der Titel des Dokuments kann unabhängig von der URL (`documentId`) bearbeitet werden.
- Klicken Sie oben links auf den Titel (Platzhalter ist die ID), um ihn zu ändern.
- Der Titel wird in den Metadaten des Dokuments gespeichert und mit allen Teilnehmern synchronisiert.

---

## 4. Kollaborations-Modi

Der Editor unterstützt zwei Betriebsmodi, die oben rechts umgeschaltet werden können:

1.  **Local:**
    - Synchronisation nur zwischen Tabs im selben Browser.
    - Daten bleiben lokal im Browser (IndexedDB).
    - Ideal für private Notizen oder Tests.

2.  **Nostr:**
    - **Echtzeit-Kollaboration** über das Nostr-Netzwerk.
    - Benötigt eine Browser-Extension (z. B. Alby, nos2x) zum Signieren.
    - Daten werden über Relays (Standard: `ws://localhost:7000`) ausgetauscht.
    - Zeigt aktive Benutzer (Presence) und deren Cursor an.

---

## 5. Whiteboard

Das Whiteboard ist eine unendliche Zeichenfläche für visuelle Kollaboration. Es unterstützt verschiedene Werkzeuge und Interaktionsmöglichkeiten.

### 5.1 Werkzeuge

- **Hand (Pan):** Zum Verschieben der Ansicht. Klicken und ziehen Sie auf den leeren Hintergrund.
- **Stift:** Zum freien Zeichnen. Farbe und Dicke sind einstellbar.
- **Karte:** Erstellt eine farbige Notizkarte (Post-it). Doppelklick zum Bearbeiten des Textes.
- **Rahmen:** Erstellt einen Container, um Elemente zu gruppieren. Elemente im Rahmen bewegen sich mit ihm.
- **Bild:** Lädt ein Bild hoch (verschlüsselt via Blossom Server).
- **Auswahl:** Zum Auswählen und Bearbeiten von Elementen.
- **Figur:** Erstellt einen Avatar (Kopf + Körper) mit Ihrem Namen, um sich auf dem Board zu positionieren.

### 5.2 Navigation & Ansicht

- **Zoom:**
  - Mausrad + `Ctrl` (oder im Hand/Auswahl-Modus einfach Mausrad).
  - Buttons in der Toolbar (+ / - / Reset).
  - **Fit to Content:** Passt die Ansicht so an, dass alle Elemente sichtbar sind.
- **Pan (Verschieben):**
  - Hand-Werkzeug nutzen.
  - Oder `Shift` gedrückt halten und ziehen (funktioniert mit jedem Werkzeug).

### 5.3 Bearbeitung & Shortcuts

- **Mehrfachauswahl:**
  - Auswahl-Werkzeug: Rahmen aufziehen.
  - `Shift` + Klick auf Elemente, um sie zur Auswahl hinzuzufügen/zu entfernen.
- **Verschieben:**
  - Ausgewählte Elemente können gemeinsam verschoben werden.
- **Clipboard:**
  - `Ctrl + C`: Kopieren
  - `Ctrl + V`: Einfügen
  - `Ctrl + D`: Duplizieren
- **Löschen:**
  - `Entf` oder `Backspace` Taste.
  - Löschen-Button in der Toolbar.

### 5.4 Figuren

Mit dem Figur-Werkzeug können Sie sich auf dem Board repräsentieren.
- Die Figur übernimmt automatisch Ihre Farbe und Ihren Namen.
- Der Name unter der Figur kann durch Anklicken und Tippen geändert werden.

