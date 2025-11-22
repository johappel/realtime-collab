<script lang="ts">
    import { onMount } from "svelte";

    let activeSection = "intro";

    function scrollTo(id: string) {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
        activeSection = id;
    }
</script>

<div class="container">
    <header>
        <h1>Wie funktioniert Nostr Collab?</h1>
        <p class="subtitle">
            Eine einfache Erklärung für Lernende und Interessierte
        </p>
    </header>

    <nav>
        <button
            on:click={() => scrollTo("intro")}
            class:active={activeSection === "intro"}>Einführung</button
        >
        <button
            on:click={() => scrollTo("components")}
            class:active={activeSection === "components"}>Die Bausteine</button
        >
        <button
            on:click={() => scrollTo("privacy")}
            class:active={activeSection === "privacy"}>Datenschutz</button
        >
        <button
            on:click={() => scrollTo("requirements")}
            class:active={activeSection === "requirements"}
            >Anforderungen</button
        >
    </nav>

    <main>
        <section id="intro">
            <h2>Einführung</h2>
            <p>
                Stell dir vor, du arbeitest mit anderen an einem Dokument.
                Normalerweise (wie bei Google Docs) liegt dieses Dokument auf
                einem zentralen Computer einer großen Firma. Jedes Mal, wenn du
                tippst, schickst du die Daten dorthin, und der Computer schickt
                sie an alle anderen weiter.
            </p>
            <p>
                <strong>Nostr Collab ist anders.</strong> Hier gibt es keinen zentralen
                "Chef-Computer". Die Daten gehören dir und werden direkt (oder über
                einfache Verteiler) zwischen den Teilnehmern ausgetauscht. Es ist
                wie ein digitales Gespräch in einem Raum, statt Briefe über eine
                Zentrale zu schicken.
            </p>
        </section>

        <section id="components">
            <h2>Wie spielen die Komponenten zusammen?</h2>
            <div class="component-grid">
                <div class="card">
                    <h3>🖥️ Apps UI</h3>
                    <p>
                        Das ist das, was du siehst: Der Text-Editor, das
                        Whiteboard oder die Mindmap. Diese Oberfläche läuft
                        komplett in deinem Browser (Firefox, Chrome, Safari).
                        Sie zeigt dir das Dokument an und nimmt deine Eingaben
                        entgegen.
                    </p>
                </div>

                <div class="card">
                    <h3>🧠 Y-DOC</h3>
                    <p>
                        Das "Gehirn" im Hintergrund. Wenn du und jemand anderes
                        gleichzeitig tippt, würde normalerweise Chaos entstehen.
                        <strong>Y-DOC</strong> (basierend auf Yjs) ist eine intelligente
                        Technologie, die sicherstellt, dass alle Änderungen sauber
                        zusammengeführt werden. Es zerlegt dein Dokument in winzige
                        Puzzleteile und weiß genau, wie man sie wieder zusammensetzt,
                        egal in welcher Reihenfolge sie ankommen.
                    </p>
                </div>

                <div class="card">
                    <h3>post_box NOSTR</h3>
                    <p>
                        Der "Postbote". Y-DOC erstellt die Puzzleteile
                        (Änderungen), aber <strong>NOSTR</strong> transportiert sie.
                        Nostr ist ein Netzwerk aus vielen kleinen Poststationen (Relays).
                        Deine App wirft die Änderungen dort ein, und die Apps deiner
                        Partner holen sie dort ab. Nostr kümmert sich nicht um den
                        Inhalt, es liefert nur zuverlässig aus.
                    </p>
                </div>

                <div class="card">
                    <h3>🌸 Blossom</h3>
                    <p>
                        Der "Medienschrank". Bilder und Videos sind zu schwer
                        für den schnellen Postboten Nostr. Deshalb werden sie
                        auf speziellen <strong>Blossom-Servern</strong> gespeichert.
                        Über Nostr wird dann nur der "Abholschein" (der Link) verschickt.
                        So bleibt die Kommunikation blitzschnell.
                    </p>
                </div>
            </div>
        </section>

        <section id="privacy">
            <h2>Sicherheit & Datenschutz für Lernende</h2>
            <p>
                In Bildungsumgebungen ist Datenschutz besonders wichtig. Nostr
                Collab bietet hier entscheidende Vorteile:
            </p>
            <ul>
                <li>
                    <strong>Keine E-Mail-Registrierung:</strong> Niemand muss seine
                    private E-Mail-Adresse oder Telefonnummer angeben. Man erstellt
                    einfach ein "Schlüsselpaar" (wie ein Passwort, das man nicht
                    ändern kann) oder nutzt einen Gruppen-Code.
                </li>
                <li>
                    <strong>Datensparsamkeit:</strong> Es werden nur die Daten übertragen,
                    die für die Zusammenarbeit nötig sind. Keine Tracking-Cookies
                    von Werbenetzwerken.
                </li>
                <li>
                    <strong>Wahlfreiheit:</strong> Die Daten liegen nicht auf
                    <em>einem</em> Server einer Firma. Man kann eigene "Relays" (Verteiler)
                    betreiben, z.B. im Schulnetzwerk, sodass die Daten das Haus nie
                    verlassen.
                </li>
                <li>
                    <strong>Pseudonymität:</strong> Schüler können unter Nicknames
                    arbeiten, ohne ihre bürgerliche Identität preiszugeben.
                </li>
            </ul>
        </section>

        <section id="requirements">
            <h2>Technische Anforderungen</h2>

            <div class="req-block">
                <h3>Blossom Server</h3>
                <p>
                    Damit Bilder hochgeladen werden können, muss ein
                    Blossom-Server erreichbar sein. Dieser speichert die Dateien
                    und gibt sie über eine öffentliche Adresse wieder aus. Er
                    muss so konfiguriert sein, dass er Uploads von den Nutzern
                    erlaubt (ggf. mit Authentifizierung).
                </p>
            </div>

            <div class="req-block">
                <h3>Relays (Verteiler)</h3>
                <p>
                    Damit die Zusammenarbeit funktioniert, müssen die Relays
                    bestimmte Nachrichten-Typen ("Kinds") erlauben:
                </p>
                <table class="kinds-table">
                    <thead>
                        <tr>
                            <th>Kind (ID)</th>
                            <th>Zweck</th>
                            <th>Warum nötig?</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>9337</code></td>
                            <td>Dokument-Updates</td>
                            <td
                                >Hier stecken die eigentlichen Textänderungen
                                (Yjs Updates) drin. Ohne dies bleibt das Blatt
                                leer.</td
                            >
                        </tr>
                        <tr>
                            <td><code>31339</code></td>
                            <td>Awareness (Präsenz)</td>
                            <td
                                >Zeigt an, wer gerade online ist und wo der
                                Cursor ist. Wichtig, um sich nicht gegenseitig
                                zu überschreiben.</td
                            >
                        </tr>
                        <tr>
                            <td><code>9338</code></td>
                            <td>Snapshots (Optional)</td>
                            <td
                                >Speichert den kompletten Zustand ab und zu,
                                damit neue Nutzer nicht die ganze Geschichte
                                seit Anbeginn laden müssen.</td
                            >
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    </main>

    <footer>
        <a href="/">Zurück zur Startseite</a>
    </footer>
</div>

<style>
    :global(body) {
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        line-height: 1.6;
        color: #333;
        background-color: #f9f9f9;
        margin: 0;
    }

    .container {
        max-width: 900px;
        margin: 0 auto;
        padding: 2rem;
        background: white;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.05);
        min-height: 100vh;
    }

    header {
        text-align: center;
        margin-bottom: 3rem;
    }

    h1 {
        color: #2c3e50;
        font-size: 2.5rem;
        margin-bottom: 0.5rem;
    }

    .subtitle {
        color: #7f8c8d;
        font-size: 1.2rem;
    }

    nav {
        display: flex;
        justify-content: center;
        gap: 1rem;
        margin-bottom: 3rem;
        flex-wrap: wrap;
    }

    nav button {
        background: none;
        border: none;
        font-size: 1rem;
        color: #555;
        cursor: pointer;
        padding: 0.5rem 1rem;
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
    }

    nav button:hover {
        color: #000;
    }

    nav button.active {
        color: #3498db;
        border-bottom-color: #3498db;
        font-weight: bold;
    }

    section {
        margin-bottom: 4rem;
        scroll-margin-top: 2rem;
    }

    h2 {
        color: #2980b9;
        border-bottom: 2px solid #eee;
        padding-bottom: 0.5rem;
        margin-bottom: 1.5rem;
    }

    h3 {
        color: #2c3e50;
        margin-top: 0;
    }

    .component-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
    }

    .card {
        background: #f8f9fa;
        padding: 1.5rem;
        border-radius: 8px;
        border-left: 4px solid #3498db;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
    }

    .card:nth-child(2) {
        border-left-color: #e74c3c;
    }
    .card:nth-child(3) {
        border-left-color: #9b59b6;
    }
    .card:nth-child(4) {
        border-left-color: #2ecc71;
    }

    ul {
        list-style-type: none;
        padding: 0;
    }

    ul li {
        background: #fff;
        border: 1px solid #eee;
        padding: 1rem;
        margin-bottom: 0.5rem;
        border-radius: 4px;
    }

    ul li strong {
        color: #27ae60;
    }

    .req-block {
        background: #fff;
        border: 1px solid #e0e0e0;
        padding: 1.5rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
    }

    .kinds-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
    }

    .kinds-table th,
    .kinds-table td {
        text-align: left;
        padding: 0.75rem;
        border-bottom: 1px solid #eee;
    }

    .kinds-table th {
        background-color: #f1f1f1;
        font-weight: 600;
    }

    code {
        background: #eee;
        padding: 0.2rem 0.4rem;
        border-radius: 3px;
        font-family: monospace;
        color: #c0392b;
    }

    footer {
        text-align: center;
        margin-top: 4rem;
        padding-top: 2rem;
        border-top: 1px solid #eee;
    }

    footer a {
        color: #7f8c8d;
        text-decoration: none;
    }

    footer a:hover {
        color: #3498db;
    }
</style>
