# Firebase einrichten (einmalig)

Die Gruppenbildung per QR-Code braucht eine Freigabe in der Firebase-Konsole.
Ohne sie erscheint im School-Tool „Keine Verbindung zur Datenbank“ und auf den
Handys „Die Gruppenliste kann nicht gelesen werden“.

Es gibt zwei Wege. **Weg A (eigenes Projekt) ist der empfohlene** – dort kann ein
Tippfehler das Musik-Quiz nicht treffen, und du kopierst einfach das komplette
Regelwerk unten hinein.

---

## Weg A – eigenes Firebase-Projekt (empfohlen)

1. <https://console.firebase.google.com> → **Projekt hinzufügen**, Name z. B. `school-tool`.
   Google Analytics dabei abwählen.
2. **Realtime Database** → Datenbank erstellen → Region **europe-west1 (Belgien)**,
   Start im **gesperrten Modus**.
3. Reiter **Regeln**: den vorhandenen Inhalt **komplett markieren und ersetzen** durch
   genau diesen Text:

```json
{
  "rules": {
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

4. **Veröffentlichen**.
5. **Projekteinstellungen** → *Meine Apps* → Web-App (`</>`) anlegen → die `firebaseConfig`
   kopieren und in [`js/firebase-config.js`](js/firebase-config.js) eintragen.
   Sonst ist nichts am Code zu ändern: Der Ordner `schoolTool` bleibt bewusst auch hier
   erhalten, damit beide Wege denselben Pfad benutzen.

---

## Weg B – im bestehenden Projekt greenboys-scoreboard

Hier liegt schon das Musik-Quiz unter `rooms`. **Dessen Regeln müssen erhalten bleiben** –
deshalb darfst du das Regelwerk *nicht* durch einen fertigen Text ersetzen, sondern
fügst nur einen Block hinzu:

1. **Realtime Database** → Reiter **Regeln**.
2. Hinter die schließende Klammer des `rooms`-Blocks ein **Komma** setzen.
3. Direkt danach diesen Block einfügen (nur das, sonst nichts):

```json
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
```

4. **Veröffentlichen**.

Wenn Firebase einen Syntaxfehler meldet, ist meist das Komma aus Schritt 2 vergessen
oder eines zu viel. **Verwerfen** stellt die zuletzt veröffentlichten Regeln wieder her –
solange das Speichern fehlschlägt, ist am laufenden Betrieb nichts verändert.

---

## Warum die Regeln so aussehen

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

---

## Wie es im Unterricht läuft

1. Klasse wählen → Reiter **Projekte & Noten** → **Sammlung starten**, Projektnamen eingeben.
2. **Groß für die Leinwand** öffnet ein Fenster mit dem QR-Code zum Beamen.
3. Schüler scannen, tippen ihren Namen an, gründen eine Gruppe oder treten einer bei.
4. Auf deinem Bildschirm läuft die Einteilung live mit, inklusive „Noch offen“.
5. **Gruppen übernehmen** trägt alles ins Projekt ein.
6. **Sammlung beenden** löscht den Raum wieder aus der Datenbank.

Wer versehentlich in der falschen Gruppe landet, tippt einfach die richtige an –
es gilt immer die neueste Eingabe, und niemand kann in zwei Gruppen gleichzeitig stehen.
