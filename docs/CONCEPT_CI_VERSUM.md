# Konzept: Das CI-Versum (Comenius-Institut Universum)

## 1. Die Metapher: Ein Bildungs-Universum
Das Comenius-Institut wird als ein dynamisches, zusammenhängendes Universum dargestellt. Diese Metapher erlaubt es, die Komplexität und Vielfalt der Angebote organisch und explorativ zugänglich zu machen.

### Elemente des Universums
*   **Galaxien (Die Arbeitsbereiche):**
    Die großen Struktureinheiten (B1, B2, Q1, etc.) bilden Cluster oder "Galaxien". Sie haben eine eigene farbliche Identität und ziehen thematisch verwandte Projekte an.
*   **Sonnensysteme (Projekte/Abteilungen):**
    Innerhalb der Galaxien befinden sich Sonnensysteme. Ein Zentralgestirn (z.B. ein Hauptprojekt oder eine Leitungsfunktion) wird von Planeten umkreist.
*   **Planeten (Webauftritte/Angebote):**
    Die konkreten Webauftritte und Angebote sind die Planeten. Sie sind die eigentlichen Ziele der Reise ("Landepunkte").
*   **Monde (Zielgruppen):**
    Planeten können von Monden umkreist werden, die spezifische Zielgruppen repräsentieren (z.B. "Kinder", "Senioren").
*   **Kometen/Raumschiffe (Leitperspektiven):**
    Die inhaltlichen Leitperspektiven (z.B. "Digitalität", "Nachhaltigkeit") bewegen sich als dynamische Elemente durch das Universum und verbinden unterschiedliche Galaxien und Systeme, um Querschnittsthemen zu visualisieren.
*   **Nebel (Kontexte):**
    Hintergrund-Nebel können "Bedürfnisse und Kontexte" (z.B. "Besondere Lebenslagen") visualisieren, die bestimmte Bereiche des Universums einfärben.

## 2. Visualisierung & Interaktion

### Visueller Stil
*   **Dark Mode:** Ein tiefes Weltraum-Schwarz/Blau als Hintergrund.
*   **Glowing Elements:** Neon-artige, leuchtende Farben zur Unterscheidung der Bereiche (z.B. B-Bereiche in Blau/Cyan, Q-Bereiche in Magenta/Lila, S-Bereiche in Gold/Gelb).
*   **Verbindungen:** Feine Linien (Konstellationen) zeigen organisatorische oder inhaltliche Verbindungen an.

### Navigation (Zoomable User Interface)
1.  **Makro-Ebene (Das Universum):** Überblick über alle Arbeitsbereiche (Galaxien). Man sieht die Größe und Verteilung.
2.  **Meso-Ebene (Die Galaxie):** Beim Heranzoomen oder Klicken auf einen Bereich entfalten sich die Projekte (Sonnensysteme). Details werden lesbar.
3.  **Mikro-Ebene (Der Planet):** Beim weiteren Zoom auf ein Projekt erscheinen Details, Beschreibungen und der Link zum Webauftritt. Hier kann man "landen" (Link zur externen Seite).

### Filter & Suche
*   Eine "Navigationskonsole" erlaubt das Filtern nach Zielgruppen (z.B. "Zeige alles für Jugendliche"). Nicht-relevante Sterne dimmen ab, relevante leuchten heller auf.
*   Suche nach Personen hebt alle Projekte hervor, an denen diese Person beteiligt ist (Visualisierung der Vernetzung).

## 3. Technische Umsetzungsideen

### Option A: 2D Force-Directed Graph (Empfohlen für Übersichtlichkeit)
*   **Technologie:** Svelte + D3.js.
*   **Beschreibung:** Knoten simulieren physikalische Abstoßung, Verbindungen ziehen sie zusammen. Dies erzeugt ein organisches Layout.
*   **Vorteil:** Sehr gut lesbar, performant, etablierte Bibliotheken, einfache Interaktion.

### Option B: 3D Interaktiver Raum
*   **Technologie:** Svelte + Threlte (Three.js Wrapper).
*   **Beschreibung:** Ein echter 3D-Raum, durch den man fliegen kann.
*   **Vorteil:** Hoher "Wow-Faktor", immersive Erfahrung.
*   **Nachteil:** Komplexere Navigation (man kann sich "verlieren"), höhere Hardware-Anforderungen, Text oft schwerer lesbar.

### Empfehlung
Wir starten mit **Option A (2D Force-Directed Graph)** mit einem starken visuellen "Space-Theme" (Partikel-Hintergrund, Glow-Effekte). Das bietet die beste Balance aus Usability und Ästhetik.

## 4. Datenstruktur (Entwurf)

```json
{
  "nodes": [
    { "id": "B1", "type": "galaxy", "label": "Bildung in Gemeinde", "color": "#4facfe" },
    { "id": "P_Konfi", "type": "system", "label": "Konfirmandenarbeit", "parent": "B1" },
    { "id": "W_KonfiWeb", "type": "planet", "label": "konfi-web.de", "url": "...", "parent": "P_Konfi" }
  ],
  "links": [
    { "source": "B1", "target": "P_Konfi" }
  ]
}
```

## 5. Nächste Schritte
1.  Erstellung eines Prototypen mit Mock-Daten.
2.  Implementierung der Zoom-Logik.
3.  Design der "Nodes" (Sterne/Planeten).

## 6. Architekturentscheidung: Generische "Universe App" (Empfohlen)

Anstatt einer statischen Website für das CI, abstrahieren wir das Konzept zu einer **generischen "Universe Builder" App** innerhalb der bestehenden `realtime-collab` Plattform.

### Warum?
*   **Kollaboration:** Mehrere Personen können gleichzeitig am Universum bauen (Knoten verschieben, Texte ändern), genau wie im Text-Editor.
*   **Wiederverwendbarkeit:** Das Tool kann für beliebige Wissensgraphen genutzt werden, nicht nur für das CI.
*   **Technologie-Synergie:** Wir nutzen den bestehenden Nostr/Yjs-Stack.

### Funktionsweise
1.  **Neuer Route:** `/universe/[universeId]` (analog zu `/editor/[docId]`).
2.  **Datenmodell:**
    *   Anstatt Text (ProseMirror) synchronisieren wir ein `Y.Array` von Nodes und Links.
    *   User können via Formular oder Kontextmenü neue "Sterne" erzeugen.
3.  **CI-Versum:** Das CI-Versum ist dann einfach ein *Dokument* in dieser App, das wir initial mit den CI-Daten befüllen.

