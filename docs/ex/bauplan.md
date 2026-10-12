# Bauplan Ex-Modul (Stand 12.10.2026)

Format der Ex-Dateien: [ex-format.md](ex-format.md). Ex-Dateien selbst enthalten
Lösungen und kommen nie ins Repository (`.gitignore`).

## Entscheidungen

- **Datenbank:** Firebase Realtime Database, kein Firestore, kein Storage.
- **Anmeldung:** Lehrkraft mit Google, Schülergeräte anonym. Die Regeln prüfen
  die UID der Lehrkraft (`LEHRER_UID`).
- **Hörbeispiele spielt Tom immer live vor.** Das School-Tool lädt, speichert und
  überträgt keine Audiodateien: kein `exen/{exId}/medien`, kein Vorladen, kein
  zentraler Player, kein Kopfhörer-Modus. Beim Import wird `medien[].src` aus der
  Schülerfassung entfernt (die Einträge selbst bleiben, die Ex braucht sie für
  „Hörbeispiel 1, 2 …“). `init` sendet immer `wiedergabe: "zentral"`.
- **Zeit kommt vom Server:** Start, Ende, Abgabe und alle Zeitstempel als
  `serverTimestamp()`. Der Timer auf dem iPad rechnet mit `.info/serverTimeOffset`,
  nie mit der iPad-Uhr allein.
- In der Cloud stehen nur Nummern, nie Namen. Die Zuordnung Nummer → Schüler hält
  das Lehrergerät beim Start lokal fest.

## Ablage (alles unter `schoolTool/`)

| Pfad | Inhalt | Lesen | Schreiben |
|---|---|---|---|
| `exindex/{exId}` | kurze Angaben für die Bibliotheksliste (Titel, Art, Dauer, Punkte …) | Lehrkraft | Lehrkraft |
| `exen/{exId}/meta` | ex-meta ohne data-URIs (als JSON-Text) | Lehrkraft | Lehrkraft |
| `exen/{exId}/schueler` | Schülerfassung (HTML, in Stücken `t0`, `t1` …) | Lehrkraft; Schüler erst, wenn die Session **läuft** und er **freigegeben** ist | Lehrkraft |
| `exgeheim/{exId}` | Lösungs-JSON + Bewertungscode | nur Lehrkraft | nur Lehrkraft |
| `exsessions/{code}` | Status, exId, Klasse, exNummer, erlaubte Nummern, Start/Ende | Angemeldete mit Code | Lehrkraft |
| `exsessions/{code}/teilnehmer/{uid}` | Nummer, Status, `notenschutzAngefragt`, `notenschutz`, Zeitzuschlag | Lehrkraft, der Schüler selbst | Schüler nur eigenen Eintrag im Warteraum; `notenschutz`, Status, Zuschlag nur Lehrkraft |
| `exsessions/{code}/abgaben/{uid}` | Antworten, Fortschritt, Ereignisse, abgegeben + Zeit | Lehrkraft, der Schüler selbst | Schüler nur eigenen Eintrag, nur bei `laeuft`, nicht `entfernt`, nach `abgegeben` gar nicht mehr |
| `exzugang/{uid}` | Code der Session | Lehrkraft, der Schüler selbst | Lehrkraft (Freigeben, Übernehmen) |

Warum `exindex` ein eigener Ast ist: Die Liste soll nicht jedes Mal alle
Schülerfassungen mitladen.

Die Originaldatei (mit Lösungen und Vorschau-Leiste) bleibt nur lokal auf dem
Lehrergerät (IndexedDB `schooltool-exen`), für die Vorschau.

Warum `exgeheim` ein eigener Ast ist: In der Realtime Database vererben sich
Leserechte nach unten. Unter `exen/{exId}` könnten Schüler die Lösung mitlesen.

## Schritte (je Schritt ein Commit)

0. ✅ Firebase Auth, Reiter „Exen“ mit Lehrer-Anmeldung, `.gitignore`, Spezifikation
1. ✅ **Bibliothek:** Import per Drag & Drop/Dateiauswahl mit DOMParser, Prüfung
   `tom-ex/2`, ex-meta lesen, Lösung und Bewertung herauslösen, alles mit
   `data-ex-secret` entfernen, `medien[].src` entfernen, Prüfung, dass nichts
   Geheimes übrig ist. Hochladen in Stücken. Liste, Vorschau (Originaldatei lokal),
   Löschen, Neu-Import mit Rückfrage.
2. **Start:** Klasse, Ex, Ex-Nummer, Anwesenheit (Abgewählte = `fehlt`),
   6-stelliger Code, QR-Code mit `js/vendor/qrcode.min.js`.
3. **Schülerseite `ex.html`:** Anonyme Anmeldung, Nummernraster ohne Namen,
   Notenschutz-Anfrage, Warteraum „Warte auf Freigabe“.
4. **Lehrer-Warteraum:** Live-Liste mit lokal aufgelösten Namen, Freigeben
   (einzeln/alle), Rauswerfen, als fehlend markieren, Notenschutz bestätigen,
   Warnung bei doppelter Nummer, Start mit Serverzeit.
   **Wiederanmeldung:** Meldet sich eine Nummer mit vorhandener Abgabe unter einer
   neuen UID an (z. B. nach einem Safari-Absturz), zeigt der Warteraum
   „übernehmen“. Das verschiebt Abgabe und Teilnehmerstatus auf die neue UID und
   setzt `exzugang`. Die Ex startet mit den gespeicherten Antworten.
5. **Schreiben:** `<iframe sandbox="allow-scripts">` mit srcdoc, Schnittstelle nach
   ex-format.md Abschnitt 3, gedrosseltes Speichern (DB + localStorage), Timer mit
   Serverzeit, bei Ablauf `abgabe-anfordern` und `sperren`, „App verlassen“
   protokollieren, Wiederherstellen nach Reload.
6. **Dashboard während der Ex:** Fortschritt, Ereignisse, Status, Rauswerfen,
   Zeitzuschlag für alle oder einzeln, „Ex beenden“.
7. **Auswertung:** `bewerte()` im Web Worker, Notenschlüssel (Standard
   speicherbar), Zeitzuschlag ausgewiesen, Korrekturansicht (links Ex im Modus
   `ansicht`, rechts Details, alles überschreibbar, `pruefen` gelb),
   Selbsteinschätzung als Klassenübersicht, Export in die Notenliste und als CSV.
8. **Nachschreiben** für `fehlt` und `entfernt`, gleiche Auswertung.
9. **Regeln** in `firebase-regeln.md`, getestet im Emulator.
10. **Testdurchlauf** mit der E-Gitarre-Ex: Import und Geheim-Prüfung, Start mit
    abgewähltem Schüler, Notenschutz bestätigen, Rauswerfen, Station 1
    abschließen, Reload während der Ex, Wiederanmeldung mit neuer UID, Abgabe,
    Auswertung mit Korrekturansicht und Export.
