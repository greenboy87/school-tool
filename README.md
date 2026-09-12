# 🏫 School-Tool

Werkzeugkasten für den Unterricht – läuft komplett im Browser, ohne Server.
**Klassen, Noten und Sitzpläne liegen auf deinem Gerät.** Sie verlassen es nur, wenn du den
Geräte-Sync einschaltest – und dann ausschließlich verschlüsselt.

**Live:** https://greenboy87.github.io/school-tool/

## Zugang

Die Seite ist mit einem Passwort geschützt, das beim Öffnen abgefragt wird. Danach bleibt sie
entsperrt: Es gibt bewusst **keine Sperre nach Untätigkeit** und keinen Sperren-Knopf – das
stört im Unterricht mehr, als es nützt. (Wer doch eine Zeitsperre will, setzt `TIMEOUT_MIN` in
`js/auth.js` auf Minuten statt auf 0.)

> **Nicht** die Website-Daten im Browser löschen, um die Seite zu sperren: Das nimmt Klassen,
> Noten und Sitzpläne gleich mit – sie liegen im selben Browser-Speicher. Vorher **💾 Backup**
> ziehen oder den Geräte-Sync eingerichtet haben.

**Direktzugang per Lesezeichen:** Hängt man `#auf=DEINPASSWORT` an die Adresse, öffnet sich
die Seite ohne Eingabe – diesen Link einmal als Favorit speichern, fertig:

    https://greenboy87.github.io/school-tool/#auf=DEINPASSWORT

Der Anker (alles ab `#`) wird von Browsern grundsätzlich nicht an einen Server geschickt und
steht in keinem Zugriffsprotokoll; School-Tool entfernt ihn zusätzlich sofort aus der
Adresszeile, damit er am Beamer nicht mitzulesen ist. Er funktioniert genauso mit
`ampel.html`. Wer den Link hat, kommt ohne Passwort hinein – also nicht weitergeben und
nicht in geteilte Lesezeichen legen.

Das Passwort steht nur als SHA-256-Prüfsumme im Quelltext (`HASH` in `js/auth.js`). Ändern
heißt: Prüfsumme des neuen Passworts eintragen, etwa mit

    printf 'neuespasswort' | sha256sum

Hinweis: Der Schutz läuft im Browser und hält neugierige Blicke ab (Smartboard, Lehrerpult) –
technisch versierte Personen können ihn umgehen. Er ersetzt keinen serverseitigen Schutz.
Die Klassen- und Notendaten selbst liegen im Browser-Speicher deines Geräts; was beim
Geräte-Sync auf dem Server landet, ist verschlüsselt und ohne Sync-Passwort wertlos.

## Funktionen

### 🚦 Lärmampel
- Misst den Lärmpegel übers Mikrofon und zeigt ihn in dB an
- Grün / Gelb (5 dB vor dem Grenzwert) / Rot (Grenzwert überschritten), Grenzwert einstellbar
- Zähler für Überschreitungen
- **Als Popup** oder als **schwebendes Mini-Fenster** („Immer im Vordergrund“, Chrome/Edge) – bleibt auch über einer Vollbild-Präsentation sichtbar

### 📚 Klassen & Noten
- Klassen anlegen, Klassenlisten einfügen oder als Datei (.txt/.csv) hochladen – wird automatisch alphabetisch sortiert
- Projekte mit Name + Datum anlegen und benoten (1–6, auch 2+/2−)
- Noten der Reihe nach eingeben (Enter springt zum nächsten Schüler) – ideal zum Übertragen in den Notenmanager
- Abhak-Kästchen „im Notenmanager eingetragen“ pro Projekt
- Zufallsgruppen bilden (nach Gruppengröße oder Anzahl) und als Projekt speichern; Gruppennote wird automatisch allen Mitgliedern zugewiesen
- Notenliste drucken oder als CSV exportieren
- Sitzplan (PDF oder Bild) pro Klasse hochladen und anzeigen

### 📱 Gruppen per QR-Code (Handys der Klasse)
Statt Gruppen auszulosen, kann sich die Klasse selbst einteilen:
- **Sammlung starten** im Reiter *Projekte & Noten*, dann **Groß für die Leinwand** – es
  erscheint ein QR-Code zum Beamen.
- Die Schüler scannen, tippen ihren Namen an und gründen eine Gruppe oder treten einer bei.
  Auf dem Lehrerbildschirm läuft die Einteilung live mit, samt „Noch offen“.
- **Gruppen übernehmen** trägt alles ins Projekt ein, **Sammlung beenden** löscht den Raum
  wieder aus der Datenbank.

Dafür läuft eine Firebase-Datenbank mit (Einrichtung und Regeln: `firebase-regeln.md`).
**Namen werden dabei nicht übertragen:** Die Klassenliste reist im Anker (`#…`) des QR-Codes
vom Beamer direkt aufs Handy, und Anker schicken Browser grundsätzlich nicht an Server. In
der Datenbank stehen nur Platznummern (`s0`, `s1`, …) und Gruppennamen, und der Raumcode wird
bei jeder Sammlung neu ausgewürfelt.

### Stunden (Themen-Fortschritt)
- Katalog mit 211 Stundenthemen, erzeugt aus den Ordnern in iCloud unter
  `3_Unterrichtsstunden/Musikseminarsave` (siehe `js/topics-seed.js`)
- Pro Klasse je Thema **Offen / Läuft / Fertig** – mit Datum, für Projekte über mehrere Wochen
- Fortschrittsbalken, Suche und Filter; Themen werden nach Jahrgangsstufe vorgefiltert
- Eigene Themen anlegen: gelten **global** und bleiben dauerhaft erhalten
- Bei jedem Thema wird angezeigt, in welchen anderen Klassen/Schuljahren du es schon
  gemacht hast

### Schuljahre
Jede Klasse speichert Jahrgangsstufe und Schuljahr mit (Wechsel im Juli, damit in den
Sommerferien schon das kommende Jahr geplant wird).

Die **Bedienelemente dazu sind vorerst ausgeblendet** – zu sehen sind nur Name und
Jahrgangsstufe. Zum Aktivieren `SHOW_YEARS: true` in `js/classes.js` setzen; dann
erscheinen der Schuljahr-Filter in der Seitenleiste, das Jahresfeld beim Anlegen und der
Knopf **Nächstes Schuljahr**. Der legt eine Kopie der Klasse an (Stufe +1, Name
hochgezählt, Schüler übernommen, Stunden und Noten starten neu); die alte Klasse bleibt
als Rückblick erhalten.

Kommen neue Ordner in die Stundensammlung, lässt sich `js/topics-seed.js` neu erzeugen;
die App übernimmt dann nur die neuen Themen und lässt Fortschritt und eigene Themen in Ruhe.

### Schulband
- **Mitglieder** aus verschiedenen Klassen, jeweils mit Klasse, Bereich (Schulband /
  Technikteam / beides) und Instrument bzw. Aufgabe. Die Liste ist natürlich nach Klassen
  sortiert (5a, 5b … 10d) und lässt sich gefiltert drucken oder als CSV exportieren.
  Namen können per Auswahlliste aus bestehenden Klassen übernommen werden.
- **Namen-Fenster** (Knopf über der Mitgliederliste): ein kleines eigenes Fenster mit nur
  Klasse und Name, nach Klassen sortiert (niedrigste zuerst). Oben stellst du ein, ob alle,
  nur die Schulband oder nur das Technikteam erscheinen; einzelne Namen hakst du ab oder an.
  **Klasse + Name** legt die Auswahl in die Zwischenablage (durch einen Tabulator getrennt,
  landet in einer Tabelle also gleich in zwei Spalten), **nur Namen** entsprechend ohne
  Klasse. Das Fenster kann offen bleiben und zieht automatisch nach, wenn du im Hauptfenster
  Mitglieder änderst.
- **Songs** mit Tonart, Capo, Tempo (BPM) und freien Anmerkungen. Drucken lassen sich
  alle Songs, eine Auswahl oder die Setlist eines Auftritts – immer samt Anmerkungen.
- **Termine & Auftritte** mit Datum, Uhrzeit, Ort, Notizen und einer Setlist, deren
  Reihenfolge sich ziehen lässt.
- **Probenplan**: eigene Probentermine anlegen und je Song festhalten, ob er geprobt
  wurde, mit Anmerkung („Tempo schneller“). Auch druckbar.
- **Notizen**: freies Feld nur für die Band – Technikwünsche, Absprachen, Ideen fürs nächste
  Konzert. Speichert beim Tippen von selbst und lässt sich drucken. (Die allgemeinen Notizen
  im Reiter *Notes* bleiben davon getrennt.)

### KI-Import für gescannte und handschriftliche Gruppenlisten
Digitale PDFs liest das Tool selbst (kostenlos). Für Scans, Fotos und Handschrift gibt es
im Gruppen-Reiter **„Mit KI auslesen“**: Das PDF wird an die Claude-API geschickt, die
Gruppen, Gruppennamen sowie getippte *und* handschriftliche Noten erkennt. Voraussetzung
ist ein eigener Anthropic-API-Schlüssel (nur lokal gespeichert, Kosten über das eigene
Konto – ein Gruppenblatt kostet meist wenige Cent). Vor der Übernahme erscheint immer eine
Kontrollvorschau.

### Design
- Dunkles Design als Standard; über **Hell** in der Kopfzeile wechselst du zum hellen.
  Die Wahl bleibt gespeichert.
- Einheitliche Strich-Icons statt Emojis (`js/icons.js`); sie übernehmen automatisch die
  Textfarbe des jeweiligen Themes.

**Hinweis zum Aktualisieren:** Die eingebundenen Dateien tragen eine Versionsnummer
(`style.css?v=62`). Nach Änderungen an CSS/JS diese Nummer in allen vier HTML-Dateien auf
denselben Wert hochzählen – `index.html`, `ampel.html`, `gruppen.html` und `namen.html`.
Sonst zeigen Browser noch die zwischengespeicherte alte Fassung.

### 🎲 Extras
- Zufalls-Schüler-Auslosung (fair: jeder kommt einmal dran, bevor jemand doppelt drankommt)
- Arbeitsphasen-Timer mit Gong

## Datensicherung

Die Daten liegen im Browser-Speicher (localStorage/IndexedDB). Über **💾 Backup** kannst du
alles als JSON-Datei sichern und über **📂 Wiederherstellen** wieder einspielen – z. B. beim
Wechsel auf einen anderen Rechner oder Browser.

> Der Browser-Speicher hängt an **Browser + Profil + Adresse** zugleich. `http://localhost:8080`
> und `https://greenboy87.github.io/school-tool/` sind zwei getrennte Speicher, ein zweites
> Chrome-Profil ein drittes. Eine plötzlich leere Seite heißt darum fast immer: Du schaust an
> einer Stelle, an der die Daten nie lagen – nicht, dass etwas gelöscht wurde.

### ☁️ Server-Backup (der Rettungsanker)

Der Wolken-Knopf in der Kopfzeile holt den Stand **vom Sync-Server** und legt ihn als Datei ab.
Der Unterschied zu allem anderen: Er **ändert auf diesem Gerät nichts** und lädt auch nichts
hoch. Damit kommst du an deine Daten, wenn der lokale Stand leer, kaputt oder auf einem anderen
Rechner unerreichbar ist.

- Es genügt das **Sync-Passwort** – der Sync muss auf diesem Gerät nicht eingerichtet sein. Das
  Passwort wird dabei auch nicht gespeichert.
- **Sitzpläne und Fotos kommen mit.** Das normale 💾 Backup lässt sie weg, weil sie nicht im
  gewöhnlichen Speicher liegen, sondern in IndexedDB.
- Zurückspielen mit **📂 Wiederherstellen** – dieselbe Datei, derselbe Knopf. Das alte
  Backup-Format wird weiterhin gelesen.

### Geräte-Sync (mehrere Rechner)
Über **Sync** in der Kopfzeile gleichen sich Klassen, Noten, Sitzpläne und Fotos zwischen
deinen Geräten ab – Schul-PC, Laptop, iPad.

- Beim Einrichten wählst du ein **Sync-Passwort** (mindestens 12 Zeichen). Auf jedem weiteren
  Gerät dasselbe Passwort eingeben, fertig.
- Die Daten werden **auf deinem Gerät verschlüsselt** (AES-GCM-256, Schlüssel per PBKDF2 mit
  250.000 Runden) und erst danach zu Firebase übertragen. Dort liegt unlesbarer Zeichensalat;
  auch der Speicherort ergibt sich erst aus dem Passwort.
- **Ohne das Sync-Passwort sind die Daten nicht wiederherstellbar** – es gibt bewusst keine
  Hintertür. Schreib es dir auf.
- Das Passwort bleibt im Browser gespeichert, damit sich das Gerät von selbst wieder
  verbindet. Auf einem Rechner, an den auch andere herankommen, ist das der Punkt, an dem
  dein Schutz hängt – dort lieber **Sync beenden** statt sich darauf zu verlassen.

## Hinweise

- Die Lärmampel braucht Mikrofon-Zugriff (der Browser fragt einmalig nach). Die dB-Anzeige ist
  eine Näherung, da Laptop-Mikrofone nicht kalibriert sind.
- Empfohlener Browser: Chrome oder Edge (für das schwebende Ampel-Fenster).
