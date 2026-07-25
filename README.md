# 🏫 School-Tool

Werkzeugkasten für den Unterricht – läuft komplett im Browser, ohne Server.
**Alle Daten (Klassen, Noten, Sitzpläne) bleiben lokal auf deinem Gerät.**

**Live:** https://greenboy87.github.io/school-tool/

## Zugang

Die Seite ist mit einem Passwort geschützt. Nach der Eingabe bleibt sie entsperrt, solange du
damit arbeitest – die Freigabe läuft **nach 2 Stunden ohne Nutzung** ab und die Seite sperrt
sich dann von selbst. Sofort sperren kannst du jederzeit über **🔒 Sperren** in der Kopfzeile.
Eine laufende Lärmampel-Messung zählt als Nutzung, damit sich die Ampel im Unterricht nicht
mitten in der Stunde sperrt.

Die Dauer steht in `js/auth.js` (`TIMEOUT_MIN`) und lässt sich dort anpassen.

Hinweis: Der Schutz läuft im Browser und hält neugierige Blicke ab (Smartboard, Lehrerpult) –
technisch versierte Personen können ihn umgehen. Er ersetzt keinen serverseitigen Schutz.
Da alle Klassen- und Notendaten ausschließlich lokal im Browser liegen, sind sie über das
Internet ohnehin nicht erreichbar.

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

### Design
- Dunkles Design als Standard; über **Hell** in der Kopfzeile wechselst du zum hellen.
  Die Wahl bleibt gespeichert.
- Einheitliche Strich-Icons statt Emojis (`js/icons.js`); sie übernehmen automatisch die
  Textfarbe des jeweiligen Themes.

**Hinweis zum Aktualisieren:** Die eingebundenen Dateien tragen eine Versionsnummer
(`style.css?v=4`). Nach Änderungen an CSS/JS diese Nummer in `index.html` und `ampel.html`
hochzählen – sonst zeigen Browser noch die zwischengespeicherte alte Fassung.

### 🎲 Extras
- Zufalls-Schüler-Auslosung (fair: jeder kommt einmal dran, bevor jemand doppelt drankommt)
- Arbeitsphasen-Timer mit Gong

## Datensicherung

Die Daten liegen im Browser-Speicher (localStorage/IndexedDB). Über **💾 Backup** kannst du
alles als JSON-Datei sichern und über **📂 Wiederherstellen** wieder einspielen – z. B. beim
Wechsel auf einen anderen Rechner oder Browser.

## Hinweise

- Die Lärmampel braucht Mikrofon-Zugriff (der Browser fragt einmalig nach). Die dB-Anzeige ist
  eine Näherung, da Laptop-Mikrofone nicht kalibriert sind.
- Empfohlener Browser: Chrome oder Edge (für das schwebende Ampel-Fenster).
