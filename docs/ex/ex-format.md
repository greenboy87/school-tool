# Ex-Format „tom-ex/2“ (Rahmen-Lösung)

Verbindliches Format für digitale Exen, die in diesem Project erstellt und im School-Tool (GitHub + Firebase) gestartet werden. Ersetzt tom-ex/1.

**Grundidee:** Jede Ex ist **eine einzige HTML-Datei**. Sie bringt Design, Aufgaben und Bedienung selbst mit (Tippen, Ziehen, Regler, Zeichnen …). Deshalb sind die Aufgabentypen frei und werden pro Ex individuell gebaut. Das School-Tool ist nur der Rahmen und bleibt immer gleich: Anmeldung, Warteraum, Rauswerfen, Timer, Speichern, Abgabe, Dashboard, Auswertung.

Referenz-Ex: `Die E-Gitarre - Ex c+.html` (Ordner „Klasse 7 - 2_Die E-Gitarre +“).

Speicher im School-Tool: Firebase **Realtime Database** unter `schoolTool/` (`exen/`, `exgeheim/`, `exsessions/`, `exzugang/`). Für die Ex-Datei selbst spielt das keine Rolle, sie spricht nur über die Schnittstelle in Abschnitt 3.

## 1. Aufbau der Datei

| Teil | Kennung | In Schülerfassung? | Zweck |
|---|---|---|---|
| Meta-Tag | `<meta name="ex-format" content="tom-ex/2">` | ja | Daran erkennt das School-Tool eine Ex |
| Metadaten | `<script type="application/json" id="ex-meta">` | ja | Titel, Art, Dauer, Aufgabenliste mit Punkten, Medien, Bilder |
| Lösungen | `<script type="application/json" id="ex-loesung" data-ex-secret>` | **nein** | alles, was richtig ist |
| Bewertung | `<script id="ex-bewertung" data-ex-secret>` | **nein** | Funktion `bewerte(antworten, loesung, kontext)` |
| Schüler-App | `<style>` + `<script id="ex-app">` | ja | eigene Oberfläche; enthält **keine** Lösungen |
| Vorschau | `<style data-ex-secret>` + `<script data-ex-secret id="ex-vorschau">` | **nein** | simuliert beim lokalen Öffnen das School-Tool (Notenschutz, Korrekturansicht, Druckansicht, Auswertung) |

**Regel für den Import:** Das School-Tool entfernt **jedes Element mit `data-ex-secret`**. Was übrig bleibt, ist die Schülerfassung. Lösungen und Bewertung werden getrennt gespeichert und nur auf dem Lehrergerät geladen.

**Regel beim Erstellen:** Kein Lösungswissen in `ex-app` oder `ex-meta`. Dazu gehören auch Reihenfolgen, die richtige Zuordnung und sprechende Dateinamen bei Hörbeispielen. Wörter, die in einer Tipp-Aufgabe gefragt sind, dürfen erst in Stationen auftauchen, die man erst nach dem Abschließen der Tipp-Station erreicht.

## 2. `ex-meta`

```json
{
  "format": "tom-ex/2",
  "id": "musik-e-gitarre",
  "titel": "Die E-Gitarre",
  "art": "Stegreifaufgabe",
  "fach": "Musik",
  "punkteGesamt": 28,
  "aufgaben": [
    {"id": "a1", "titel": "Gitarren-Check", "punkte": 8, "bewertung": "auto", "rechtschreibung": true},
    {"id": "a3", "titel": "Bandchat", "punkte": 4, "bewertung": "manuell"}
  ],
  "selbsteinschaetzung": true,
  "medien": [{"id": "hb1", "typ": "audio", "titel": "Hörbeispiel 1", "maxAbspielen": 2, "src": "data:audio/mpeg;base64,…"}],
  "bilder": {"gitarre": "data:image/jpeg;base64,…"}
}
```

- `bewertung`: `auto` | `manuell` | `teil` (auto mit Prüf-Hinweisen)
- `rechtschreibung: true`: Bei Notenschutz bewertet `bewerte()` Schreibfehler tolerant.
- **Hörbeispiele spielt Tom immer live vor** (z. B. aus der Präsentation). Das School-Tool lädt, speichert und überträgt keine Audiodateien. `medien[].src` ist optional (nur für die lokale Vorschau) und wird beim Import aus der Schülerfassung entfernt. `wiedergabe` ist immer `zentral`. Kopfhörer-Modus und `kontext.medien` sind für später vorgesehen, aktuell aber nicht gebaut.
- Bilder liegen als data-URI in der Datei und bleiben in der Schülerfassung.
- Nicht in die Datei gehören: die Nummer der Ex (z. B. „1.“), Klasse, Datum und **die Dauer**. Das legt Tom beim Start im School-Tool fest; die Ex erfährt die Restzeit nur über `zeit`. Also auch keine Texte wie „Du hast 20 Minuten“. (`dauerMinuten` aus älteren Exen wird beim Import nur noch als Vorschlag genutzt.)

## 3. Schnittstelle Ex ⇄ School-Tool (postMessage)

Die Ex läuft im School-Tool in einem `<iframe sandbox="allow-scripts">`. Sie hat keinen Zugriff auf Firebase, Tresor oder Namen.

**School-Tool → Ex** (`{quelle: "tom-schooltool", typ, …}`)

| typ | Daten | Bedeutung |
|---|---|---|
| `init` | `kontext: {nummer, klasse, datum, exNummer, notenschutz, wiedergabe: "zentral"\|"kopfhoerer", medien: {id: url}, seed, modus: "schreiben"\|"ansicht"\|"druck", antworten, abgegeben, ergebnis}` | Start bzw. Wiederherstellen nach Reload. `ansicht` ist für die Lehrkraft gedacht (alles schreibgeschützt). `druck` siehe Abschnitt 3a. `ergebnis` kommt nur bei `ansicht` und `druck` mit. |
| `zeit` | `restSekunden` | Timer-Anzeige (individuell inkl. Zeitzuschlag) |
| `medium` | `id, status: "spielt"\|"pause"\|"ende"` | *später:* Anzeige „läuft gerade“ bei Wiedergabe vom Dashboard. Aktuell nicht gesendet, die Ex muss ohne funktionieren. |
| `notenschutz` | `aktiv` | Lehrkraft hat den Schalter bestätigt oder zurückgenommen |
| `sperren` | `grund: "zeit"\|"entfernt"\|"beendet"` | Ex sofort schreibgeschützt |
| `abgabe-anfordern` | – | Ex antwortet sofort mit `abgeben` |

**Ex → School-Tool** (`{quelle: "tom-ex", typ, exId, …}`)

| typ | Daten | Bedeutung |
|---|---|---|
| `bereit` | `format` | Ex ist geladen, wartet auf `init` |
| `antworten` | `antworten, fortschritt: {erledigt, gesamt}` | bei jeder Änderung (gedrosselt); das Tool speichert unter `exsessions/{code}/abgaben/{uid}` |
| `abgeben` | `antworten, fortschritt` | Schüler hat abgegeben |
| `ereignis` | `art, …` | z. B. `abspielen` (medium, anzahl), `station-abgeschlossen` |
| `druck` | `html, css` | Antwort auf `init` mit `modus: "druck"`, siehe 3a |

Das Antwort-Objekt gestaltet jede Ex selbst (JSON, schlüsselbar nach Aufgaben-ID). Die Selbsteinschätzung liegt unter `antworten.selbst`.

## 3a. Druckfassung (`modus: "druck"`)

Für „Alle drucken“ startet das School-Tool die Ex für jeden Schüler unsichtbar mit `modus: "druck"`, seinen Antworten und `ergebnis`. Die Ex baut daraus ihre **Druckansicht** und schickt sie zurück:

```js
senden('druck', {html: druckBereich.innerHTML, css: DRUCK_CSS});
```

- **Inhalt:** alle Stationen untereinander, schreibgeschützt, mit den Antworten des Schülers. Keine Navigation, kein Timer, keine Knöpfe, keine Selbsteinschätzung. Interaktives als Text oder Bild darstellen (z. B. Zuordnungen als Liste, Regler als Wert).
- **Je Aufgabe ein Block mit `data-aufgabe="<id>"`** (die IDs aus `ex-meta.aufgaben`). Das School-Tool setzt in jeden Block oben rechts die Punkte („6 / 8 P“). Die Ex druckt die Punkte pro Aufgabe also **nicht** selbst.
- **`ergebnis`** (darf genutzt werden, um einzelne Felder zu markieren, z. B. ✓/✗ oder grün/rot):
  `{summe, max, note, vorlaeufig, aufgaben: {a1: {punkte, max, details: [{punkte, max, status}]}}}` – die `details` in derselben Reihenfolge wie aus `bewerte()`, mit den Korrekturen der Lehrkraft; `status`: `richtig|falsch|leer|pruefen|teilweise`.
- **Kopf, Name, Note und Notenschlüssel** setzt das School-Tool. Die Druckfassung beginnt direkt mit der ersten Aufgabe.
- **`css`** gilt für die Druckseite: weißer Hintergrund, dunkle Schrift, A4 hoch (ca. 18 cm Breite), keine `position: fixed/sticky`, keine `vh`-Höhen, Blöcke mit `break-inside: avoid`. Klassennamen nicht mit `stdr-` beginnen (die gehören dem School-Tool).
- **Erlaubt:** HTML, CSS, Bilder als `data:image/...`. **Entfernt** werden Skripte, Formulare, iframes, Event-Attribute und alle externen Adressen – die Druckseite führt kein JavaScript aus.
- Die Antworten der Schüler beim Einsetzen **escapen** (`textContent` statt `innerHTML`).
- Kommt binnen 8 Sekunden kein `druck`, druckt das School-Tool für diesen Schüler die Tabelle aus `bewerte()`. Exen ohne Druckfassung funktionieren also weiter.

## 4. `bewerte(antworten, loesung, kontext)`

Reine Funktion ohne DOM-Zugriff. Sie läuft im School-Tool in einem Web Worker auf dem Lehrergerät. Rückgabe:

```json
{
  "aufgaben": {
    "a1": {"punkte": 6, "max": 8, "details": [{"label": "Pin 1", "antwort": "Wirbel", "loesung": "Wirbel", "punkte": 1, "max": 1, "status": "richtig|falsch|leer|pruefen", "hinweis": "…", "pruefen": false}]},
    "a3": {"punkte": null, "max": 4, "manuell": true, "vorschlag": 3, "erwartung": "…", "details": […]}
  },
  "gesamtAuto": 19.5,
  "offen": ["a1", "a3"],
  "selbsteinschaetzung": {…},
  "max": 28
}
```

Die Lehrkraft kann jede Teilpunktzahl überschreiben. Manuelle Aufgaben bekommen einen Vorschlag (z. B. gefundene Stichworte), aber keine fertigen Punkte.

Die `details` erscheinen in der Korrekturansicht und in der Tabelle des Ausdrucks (wenn die Ex keine Druckfassung liefert oder „mit Lösungen“ gewählt ist) – `label`, `antwort` und `loesung` deshalb so formulieren, dass ein Schüler sie ohne die Ex versteht.

## 5. Gestaltungsregeln (aus Toms Vorgaben)

- Keine 1:1-Übertragung der Papier-Ex: digitale Möglichkeiten nutzen (Ziehen, Regler, Chat, Hotspots, Zeichnen …), Aufgabentypen von Ex zu Ex abwechseln.
- **Fachbegriffe immer eintippen lassen**, nicht aus einem Wortspeicher wählen. Die Station danach sperren (abschließen), damit spätere Stationen die Schreibweise nicht verraten. Eingabefelder mit `autocorrect="off" spellcheck="false"`.
- Notenschutz-Schalter: Den setzt der Schüler im Warteraum, die Lehrkraft bestätigt. Er wirkt nur auf Aufgaben mit `rechtschreibung: true`.
- Design passend zur Stunde (Farben und Motive aus der Präsentation), funktioniert auf dem iPad quer und hoch.
- Bei Zuordnungen und Wortspeichern immer 1–2 Ablenker.
- Hörbeispiele aus Toms Material nicht kürzen. In der Ex in anderer Reihenfolge als im Unterricht, mit neutralen IDs (hb1 …).
- Hörbeispiele: Die Ex zeigt nur „Hörbeispiel 1, 2 …“ mit dem Hinweis, dass die Lehrkraft vorspielt. Tom spielt sie live in der Reihenfolge der Ex (die Zuordnung zur Präsentation steht in `ex-loesung.quellenHinweis`).
- Kopf: „{exNummer}. {art} · Fach“, Nr., Klasse, Datum, Punkte. Ohne Logo, ohne Unterschriftsfeld, ohne äußere Form.
- Am Ende: Selbsteinschätzung (Smileys, zählt nicht zur Note), dann die Abgabe mit Übersicht über offene Teile.
- Tonschritte in Intervallzählweise (Startnote zählt mit).
- Datei: `<Stundenname> - Ex c+.html` im Stundenordner.
