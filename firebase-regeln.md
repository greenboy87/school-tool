# Firebase einrichten (einmalig)

Die Gruppenbildung per QR-Code braucht eine Freigabe in der Firebase-Konsole.
Ohne sie erscheint im School-Tool „Keine Verbindung zur Datenbank“ und auf den
Handys „Die Gruppenliste kann nicht gelesen werden“.

## Was zu tun ist

1. <https://console.firebase.google.com> öffnen, Projekt **greenboys-scoreboard** wählen.
2. Links **Realtime Database** → oben Reiter **Regeln** (Rules).
3. Den unten stehenden Block **`schoolTool`** einfügen – **als Nachbar von `rooms`**,
   nicht anstelle davon. `rooms` gehört dem Musik-Quiz und muss unverändert bleiben.
4. **Veröffentlichen** klicken.

So sieht es hinterher aus (der `rooms`-Teil bleibt genau so, wie er bei dir schon steht):

```json
{
  "rules": {
    "rooms": {
      "…hier steht deine bestehende Regel des Musik-Quiz – nicht anfassen…"
    },
    "schoolTool": {
      "raeume": {
        "$raum": {
          ".read": true,
          ".write": true,
          "meta": {
            "projekt":  { ".validate": "newData.isString() && newData.val().length <= 60" },
            "anzahl":   { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 80" },
            "erstellt": { ".validate": "newData.isNumber()" },
            "$andere":  { ".validate": false }
          },
          "zuordnung": {
            "$sid": {
              ".validate": "$sid.matches(/^s[0-9]{1,3}$/)",
              "gruppe":  { ".validate": "newData.isString() && newData.val().length <= 40" },
              "ts":      { ".validate": "newData.isNumber()" },
              "von":     { ".validate": "newData.isString() && newData.val().length <= 16" },
              "$andere": { ".validate": false }
            }
          },
          "$andere": { ".validate": false }
        }
      }
    }
  }
}
```

## Warum die Regel so aussieht

* **`.read` und `.write` stehen erst eine Ebene tief**, beim einzelnen Raum. Dadurch kann
  niemand die Liste aller Räume abrufen – man muss den Raum-Code kennen, und der wird
  bei jeder Sammlung neu ausgewürfelt.
* **Die `.validate`-Zeilen begrenzen, was überhaupt gespeichert werden darf**: nur
  Platznummern der Form `s0`–`s999`, ein Gruppenname bis 40 Zeichen, ein Zeitstempel.
  `"$andere": { ".validate": false }` weist alles andere ab. Damit lässt sich die
  Datenbank nicht als fremder Speicherplatz missbrauchen.
* **Namen tauchen hier bewusst nirgends auf.** Die Klassenliste reist im QR-Code
  (im Anker `#…` der Adresse) direkt vom Beamer auf die Handys. Anker werden von
  Browsern grundsätzlich nicht an Server geschickt.

## Wie es im Unterricht läuft

1. Klasse wählen → Reiter **Projekte & Noten** → **Sammlung starten**, Projektnamen eingeben.
2. **Groß für die Leinwand** öffnet ein Fenster mit dem QR-Code zum Beamen.
3. Schüler scannen, tippen ihren Namen an, gründen eine Gruppe oder treten einer bei.
4. Auf deinem Bildschirm läuft die Einteilung live mit, inklusive „Noch offen“.
5. **Gruppen übernehmen** trägt alles ins Projekt ein.
6. **Sammlung beenden** löscht den Raum wieder aus der Datenbank.

Wer versehentlich in der falschen Gruppe landet, tippt einfach die richtige an –
es gilt immer die neueste Eingabe, und niemand kann in zwei Gruppen gleichzeitig stehen.
