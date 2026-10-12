# Ex-Format „tom-ex/2“ (Rahmen-Lösung)

Verbindliches Format für digitale Exen, die in diesem Project erstellt und im School-Tool (GitHub + Firebase) gestartet werden. Ersetzt tom-ex/1.

**Grundidee:** Jede Ex ist **eine einzige HTML-Datei**. Sie bringt Design, Aufgaben und Bedienung selbst mit (Tippen, Ziehen, Regler, Zeichnen …). Deshalb sind die Aufgabentypen frei und werden pro Ex individuell gebaut. Das School-Tool ist nur der Rahmen und bleibt immer gleich: Anmeldung, Warteraum, Rauswerfen, Timer, Speichern, Abgabe, Dashboard, Hörbeispiele, Auswertung.

Referenz-Ex: `Die E-Gitarre - Ex c+.html` (Ordner „Klasse 7 - 2_Die E-Gitarre +“).

## 1. Aufbau der Datei

| Teil | Kennung | In Schülerfassung? | Zweck |
|---|---|---|---|
| Meta-Tag | `<meta name="ex-format" content="tom-ex/2">` | ja | Daran erkennt das School-Tool eine Ex |
| Metadaten | `<script type="application/json" id="ex-meta">` | ja | Titel, Art, Dauer, Aufgabenliste mit Punkten, Medien, Bilder |
| Lösungen | `<script type="application/json" id="ex-loesung" data-ex-secret>` | **nein** | alles, was richtig ist |
| Bewertung | `<script id="ex-bewertung" data-ex-secret>` | **nein** | Funktion `bewerte(antworten, loesung, kontext)` |
| Schüler-App | `<style>` + `<script id="ex-app">` | ja | eigene Oberfläche; enthält **keine** Lösungen |
| Vorschau | `<style data-ex-secret>` + `<script data-ex-secret id="ex-vorschau">` | **nein** | simuliert beim lokalen Öffnen das School-Tool (Notenschutz, Wiedergabe, Lehrer-Player, Auswertung) |

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
  "dauerMinuten": 20,
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
- Medien und Bilder liegen als data-URI in der Datei. Das School-Tool lädt sie beim Import nach Firebase Storage und übergibt den Schülergeräten die URLs (`kontext.medien`).
- Nicht in die Datei gehören: die Nummer der Ex (z. B. „1.“), Klasse und Datum. Das setzt das School-Tool beim Start.

## 3. Schnittstelle Ex ⇄ School-Tool (postMessage)

Die Ex läuft im School-Tool in einem `<iframe sandbox="allow-scripts">`. Sie hat keinen Zugriff auf Firebase, Tresor oder Namen.

**School-Tool → Ex** (`{quelle: "tom-schooltool", typ, …}`)

| typ | Daten | Bedeutung |
|---|---|---|
| `init` | `kontext: {nummer, klasse, datum, exNummer, notenschutz, wiedergabe: "zentral"\|"kopfhoerer", medien: {id: url}, seed, modus: "schreiben"\|"ansicht", antworten, abgegeben}` | Start bzw. Wiederherstellen nach Reload. `ansicht` ist für die Lehrkraft gedacht (alles schreibgeschützt). |
| `zeit` | `restSekunden` | Timer-Anzeige (individuell inkl. Zeitzuschlag) |
| `medium` | `id, status: "spielt"\|"pause"\|"ende"` | zentrale Wiedergabe vom Lehrer-Dashboard |
| `notenschutz` | `aktiv` | Lehrkraft hat den Schalter bestätigt oder zurückgenommen |
| `sperren` | `grund: "zeit"\|"entfernt"\|"beendet"` | Ex sofort schreibgeschützt |
| `abgabe-anfordern` | – | Ex antwortet sofort mit `abgeben` |

**Ex → School-Tool** (`{quelle: "tom-ex", typ, exId, …}`)

| typ | Daten | Bedeutung |
|---|---|---|
| `bereit` | `format` | Ex ist geladen, wartet auf `init` |
| `antworten` | `antworten, fortschritt: {erledigt, gesamt}` | bei jeder Änderung (gedrosselt); das Tool speichert in Firestore |
| `abgeben` | `antworten, fortschritt` | Schüler hat abgegeben |
| `ereignis` | `art, …` | z. B. `abspielen` (medium, anzahl), `station-abgeschlossen` |

Das Antwort-Objekt gestaltet jede Ex selbst (JSON, schlüsselbar nach Aufgaben-ID). Die Selbsteinschätzung liegt unter `antworten.selbst`.

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

## 5. Gestaltungsregeln (aus Toms Vorgaben)

- Keine 1:1-Übertragung der Papier-Ex: digitale Möglichkeiten nutzen (Ziehen, Regler, Chat, Hotspots, Zeichnen …), Aufgabentypen von Ex zu Ex abwechseln.
- **Fachbegriffe immer eintippen lassen**, nicht aus einem Wortspeicher wählen. Die Station danach sperren (abschließen), damit spätere Stationen die Schreibweise nicht verraten. Eingabefelder mit `autocorrect="off" spellcheck="false"`.
- Notenschutz-Schalter: Den setzt der Schüler im Warteraum, die Lehrkraft bestätigt. Er wirkt nur auf Aufgaben mit `rechtschreibung: true`.
- Design passend zur Stunde (Farben und Motive aus der Präsentation), funktioniert auf dem iPad quer und hoch.
- Bei Zuordnungen und Wortspeichern immer 1–2 Ablenker.
- Hörbeispiele aus Toms Material nicht kürzen. In der Ex in anderer Reihenfolge als im Unterricht, mit neutralen IDs (hb1 …).
- Hörbeispiele immer für beide Varianten vorsehen: zentral vorspielen (Lehrer-Dashboard) und Kopfhörer (eigener Player mit `maxAbspielen`).
- Kopf: „{exNummer}. {art} · Fach“, Nr., Klasse, Datum, Punkte. Ohne Logo, ohne Unterschriftsfeld, ohne äußere Form.
- Am Ende: Selbsteinschätzung (Smileys, zählt nicht zur Note), dann die Abgabe mit Übersicht über offene Teile.
- Tonschritte in Intervallzählweise (Startnote zählt mit).
- Datei: `<Stundenname> - Ex c+.html` im Stundenordner.
