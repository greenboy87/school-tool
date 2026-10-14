# Firebase einrichten (einmalig)

Die Gruppenbildung per QR-Code braucht eine Freigabe in der Firebase-Konsole.
Ohne sie erscheint im School-Tool „Keine Verbindung zur Datenbank“ und auf den
Handys „Die Gruppenliste kann nicht gelesen werden“.

Es gibt zwei Wege. **Weg A (eigenes Projekt) ist der empfohlene** – dort kann ein
Tippfehler das Musik-Quiz nicht treffen, und du kopierst einfach das komplette
Regelwerk unten hinein.

---

## Anmeldung einschalten (für die Exen, einmalig)

Die Exen brauchen echte Anmeldungen, damit die Regeln „nur die Lehrkraft“
durchsetzen können: Die Lehrkraft meldet sich mit Google an, die Schüler-iPads
anonym. Gruppen und Tiny Band laufen weiter ohne Anmeldung.

**A1.** Firebase-Konsole → **Authentication** → *Jetzt starten* (falls noch nie
geöffnet) → Reiter **Anmeldemethode**:
* **Anonym** aktivieren, speichern.
* **Google** aktivieren, Support-E-Mail wählen, speichern.

**A2.** Reiter **Einstellungen** → **Autorisierte Domains**: `greenboy87.github.io`
hinzufügen (`localhost` steht schon drin).

**A3.** Im School-Tool Reiter **Exen** → **Mit Google anmelden** →
**Kennung kopieren**. Diese Kennung (UID) kommt an zwei Stellen hinein:
`window.LEHRER_UID` in [`js/firebase-config.js`](js/firebase-config.js) und
`LEHRER_UID` in den Regeln unten. Die Kennung ist kein Geheimnis – geschützt wird
durch die Regeln, nicht durch sie.

---

## Weg A – eigenes Firebase-Projekt (empfohlen)

> **Wenn das Projekt schon steht** (bei Tom: `school-tool-cbbf9`), sind nur die
> Schritte **R1 und R2** nötig. Die Schritte E1–E3 gelten ausschließlich für die
> allererste Einrichtung – insbesondere muss **keine neue Web-App angelegt werden**,
> wenn sich nur die Regeln ändern.

### Regeln aktualisieren – das ist alles, was bei Änderungen zu tun ist

**R1.** Firebase-Konsole → Projekt → **Realtime Database** → Reiter **Regeln**:
den vorhandenen Inhalt **komplett markieren und ersetzen** durch genau diesen Text.

**R2.** **Veröffentlichen**. Fertig – im School-Tool einmal Strg+Shift+R.

> **Zuletzt geändert am 14.10.2026 – Ex-Testraum:** Unter `teilnehmer` ist `nameV`
> neu – der selbst gewählte Name im Testraum, auf dem iPad verschlüsselt (nur in
> Sitzungen mit `info/test`). **Den kompletten Block erneut kopieren** (R1 und R2).
>
> **Geändert am 12.10.2026 (zweite Änderung) – Ex-Sitzungen:** Neu sind
> `exsessions` (Warteraum, Teilnehmer, Abgaben) und `exzugang`; unter `exen` dürfen
> freigegebene Schüler einer laufenden Ex jetzt die Schülerfassung lesen. Schüler
> schreiben nur ihren eigenen Eintrag, nur solange die Ex läuft und ihre Zeit nicht
> abgelaufen ist, und nach der Abgabe gar nicht mehr. **Den kompletten Block erneut
> kopieren** (R1 und R2).
>
> **Geändert am 12.10.2026 – Exen:** Neu sind die Äste `exindex`, `exen` und
> `exgeheim`. Lesen und schreiben darf dort nur das Google-Konto der Lehrkraft
> (die lange Kennung in `auth.uid === '…'`). Vorher muss die Anmeldung
> eingeschaltet sein (Abschnitt „Anmeldung einschalten“ oben). Tresor, Gruppen und
> Tiny Band ändern sich nicht. **Den kompletten Block unten erneut kopieren** (R1 und R2).
>
> **Geändert am 11.10.2026 – Tiny Band:** Unter `zuordnung` sind `erst`,
> `zweit`, `band` und `inst` dazugekommen, neben `zuordnung` die Äste `baende` und
> `ergebnis`. Instrumente sind nur als Kürzel `dr`, `ba`, `sy`, `ge`, `uk` erlaubt,
> Band-Kennungen nur in der Form `b` + 4–12 Kleinbuchstaben/Ziffern, Bandnamen bis
> 40 Zeichen. Ohne diese Zeilen lehnt die Datenbank jede Tiny-Band-Wahl ab, und auf
> den iPads steht „Das hat die Datenbank abgelehnt“. Der normale Gruppenmodus läuft
> auch mit den alten Regeln weiter. **Wer die Regeln schon eingetragen hat, muss sie
> erneut aus dem Block unten kopieren** (R1 und R2).
>
> **Geändert am 18.09.2026 (zweite Änderung, die erste reicht nicht):**
> Unter `plaene` und `fotos` sind `teile` und `t0`, `t1`, … dazugekommen. Grund:
> Firebase nimmt je Wert höchstens 10.485.760 Bytes an – das ist eine harte Grenze
> der Datenbank, die sich mit keiner Regel anheben lässt. Große Sitzpläne werden
> deshalb in Stücke zerlegt und einzeln abgelegt; `teile` sagt, wie viele es sind.
> Ohne diese zwei Zeilen weist die Datenbank das Hochladen ab, weil bisher
> `"$andere": { ".validate": false }` alles Unbekannte sperrte. Das School-Tool
> lässt jetzt 15 MiB je Datei zu.
>
> **Zuletzt geändert am 18.09.2026:** Die Obergrenze für `chiffre` steht jetzt bei
> 10.000.000 Zeichen statt 6.000.000 – ein Sitzplan mit Fotos wächst durch
> Verschlüsselung und Base64 um ein Drittel und sprengte die alte Grenze schon bei
> 4,5 MB Dateigröße.
>
> **Zuletzt geändert am 12.09.2026:** Unter `meta` ist das Feld `bezeichnung`
> dazugekommen – damit gibt die Lehrkraft vor, was die Klasse eintragen soll
> („Gruppenname“ oder z. B. „Thema“). Ohne diese Zeile weist die Datenbank das
> Anlegen eines Raums ab, weil `"$andere": { ".validate": false }` alles
> Unbekannte sperrt. Wer die Regeln schon einmal eingetragen hat, muss sie also
> **erneut** aus diesem Block kopieren.

```json
{
  "rules": {
    "schoolTool": {
      "tresor": {
        "$id": {
          ".read": true,
          ".write": true,
          "chiffre": { ".validate": "newData.isString() && newData.val().length <= 10000000" },
          "iv":      { ".validate": "newData.isString() && newData.val().length <= 64" },
          "salz":    { ".validate": "newData.isString() && newData.val().length <= 64" },
          "stand":   { ".validate": "newData.isNumber()" },
          "geraet":  { ".validate": "newData.isString() && newData.val().length <= 32" },
          "plaene": {
            "$klasse": {
              "chiffre": { ".validate": "newData.isString() && newData.val().length <= 10000000" },
              "iv":      { ".validate": "newData.isString() && newData.val().length <= 64" },
              "name":    { ".validate": "newData.isString() && newData.val().length <= 200" },
              "typ":     { ".validate": "newData.isString() && newData.val().length <= 100" },
              "stand":   { ".validate": "newData.isNumber()" },
              "teile":   { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 200" },
              "$teil":   { ".validate": "$teil.matches(/^t[0-9]{1,3}$/) && newData.isString() && newData.val().length <= 2100000" }
            }
          },
          "fotos": {
            "$foto": {
              "chiffre": { ".validate": "newData.isString() && newData.val().length <= 10000000" },
              "iv":      { ".validate": "newData.isString() && newData.val().length <= 64" },
              "name":    { ".validate": "newData.isString() && newData.val().length <= 200" },
              "typ":     { ".validate": "newData.isString() && newData.val().length <= 100" },
              "stand":   { ".validate": "newData.isNumber()" },
              "teile":   { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 200" },
              "$teil":   { ".validate": "$teil.matches(/^t[0-9]{1,3}$/) && newData.isString() && newData.val().length <= 2100000" }
            }
          },
          "$andere": { ".validate": false }
        }
      },
      "exindex": {
        ".read": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
        "$exId": {
          ".write": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".validate": "$exId.matches(/^[a-z0-9][a-z0-9-]{1,60}$/)"
        }
      },
      "exen": {
        "$exId": {
          ".read": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".write": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".validate": "$exId.matches(/^[a-z0-9][a-z0-9-]{1,60}$/)",
          "meta": { ".validate": "newData.isString() && newData.val().length <= 200000" },
          "schueler": {
            ".read": "auth != null && root.child('schoolTool/exzugang/' + auth.uid).exists() && root.child('schoolTool/exsessions/' + root.child('schoolTool/exzugang/' + auth.uid).val() + '/info/exId').val() === $exId && root.child('schoolTool/exsessions/' + root.child('schoolTool/exzugang/' + auth.uid).val() + '/info/status').val() === 'laeuft' && root.child('schoolTool/exsessions/' + root.child('schoolTool/exzugang/' + auth.uid).val() + '/teilnehmer/' + auth.uid + '/status').val() === 'freigegeben'",
            "teile": { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 20" },
            "laenge": { ".validate": "newData.isNumber()" },
            "$teil": { ".validate": "$teil.matches(/^t[0-9]{1,2}$/) && newData.isString() && newData.val().length <= 1000000" }
          },
          "$andere": { ".validate": false }
        }
      },
      "exgeheim": {
        "$exId": {
          ".read": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".write": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          "loesung":   { ".validate": "newData.isString() && newData.val().length <= 1000000" },
          "bewertung": { ".validate": "newData.isString() && newData.val().length <= 1000000" },
          "stand":     { ".validate": "newData.isNumber()" },
          "$andere":   { ".validate": false }
        }
      },
      "exsessions": {
        ".read": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
        "$code": {
          ".write": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".validate": "$code.matches(/^[1-9][0-9]{5}$/)",
          "info": { ".read": "auth != null" },
          "teilnehmer": {
            "$uid": {
              ".read": "auth != null && auth.uid === $uid",
              ".write": "auth != null && auth.uid === $uid && (root.child('schoolTool/exsessions/' + $code + '/info/status').val() === 'warteraum' || root.child('schoolTool/exsessions/' + $code + '/info/status').val() === 'laeuft') && (!data.exists() || data.child('status').val() === 'wartet')",
              ".validate": "newData.hasChildren(['nummer', 'status']) && root.child('schoolTool/exsessions/' + $code + '/info/erlaubt/n' + newData.child('nummer').val()).exists()",
              "nummer":  { ".validate": "newData.isString() && newData.val().matches(/^[0-9]{1,3}$/)" },
              "status":  { ".validate": "newData.isString() && (newData.val() === 'wartet' || (auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2' && newData.val().matches(/^(freigegeben|fehlt|entfernt|ersetzt)$/)))" },
              "notenschutzAngefragt": { ".validate": "newData.isBoolean()" },
              "nameV":   { ".validate": "newData.isString() && newData.val().length <= 200 && root.child('schoolTool/exsessions/' + $code + '/info/test').val() === true" },
              "notenschutz": { ".validate": "newData.isBoolean() && auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'" },
              "zuschlagMin": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 120 && auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'" },
              "ts":      { ".validate": "newData.isNumber()" },
              "$andere": { ".validate": false }
            }
          },
          "abgaben": {
            "$uid": {
              ".read": "auth != null && auth.uid === $uid",
              ".write": "auth != null && auth.uid === $uid && root.child('schoolTool/exsessions/' + $code + '/info/status').val() === 'laeuft' && root.child('schoolTool/exsessions/' + $code + '/teilnehmer/' + $uid + '/status').val() === 'freigegeben' && data.child('abgegeben').val() !== true && now < root.child('schoolTool/exsessions/' + $code + '/info/startzeit').val() + (root.child('schoolTool/exsessions/' + $code + '/info/dauerMinuten').val() + root.child('schoolTool/exsessions/' + $code + '/info/zuschlagMin').val() + root.child('schoolTool/exsessions/' + $code + '/teilnehmer/' + $uid + '/zuschlagMin').val()) * 60000 + 120000",
              "antworten":   { ".validate": "newData.isString() && newData.val().length <= 300000" },
              "fortschritt": {
                "erledigt": { ".validate": "newData.isNumber()" },
                "gesamt":   { ".validate": "newData.isNumber()" },
                "$andere":  { ".validate": false }
              },
              "stand":       { ".validate": "newData.isNumber()" },
              "abgegeben":   { ".validate": "newData.isBoolean()" },
              "abgegebenUm": { ".validate": "newData.isNumber()" },
              "erzwungen":   { ".validate": "newData.isBoolean()" },
              "ereignisse": {
                "$e": {
                  ".validate": "newData.hasChildren(['art', 'zeit'])",
                  "art":     { ".validate": "newData.isString() && newData.val().length <= 40" },
                  "zeit":    { ".validate": "newData.isNumber()" },
                  "medium":  { ".validate": "newData.isString() && newData.val().length <= 20" },
                  "station": { ".validate": "newData.isString() && newData.val().length <= 20" },
                  "anzahl":  { ".validate": "newData.isNumber()" },
                  "dauerSek": { ".validate": "newData.isNumber()" },
                  "$andere": { ".validate": false }
                }
              },
              "$andere": { ".validate": false }
            }
          }
        }
      },
      "exzugang": {
        "$uid": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2')",
          ".write": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".validate": "newData.isString() && newData.val().matches(/^[1-9][0-9]{5}$/)"
        }
      },
      "raeume": {
        "$raum": {
          ".read": true,
          ".write": true,
          "meta": {
            "projekt":  { ".validate": "newData.isString() && newData.val().length <= 60" },
            "anzahl":   { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 80" },
            "erstellt": { ".validate": "newData.isNumber()" },
            "bezeichnung": { ".validate": "newData.isString() && newData.val().length <= 30" },
            "$andere":  { ".validate": false }
          },
          "zuordnung": {
            "$sid": {
              ".validate": "$sid.matches(/^s[0-9]{1,3}$/)",
              "gruppe":  { ".validate": "newData.isString() && newData.val().length <= 40" },
              "ts":      { ".validate": "newData.isNumber()" },
              "von":     { ".validate": "newData.isString() && newData.val().length <= 16" },
              "erst":    { ".validate": "newData.isString() && newData.val().matches(/^(dr|ba|sy|ge|uk)$/)" },
              "zweit":   { ".validate": "newData.isString() && newData.val().matches(/^(dr|ba|sy|ge|uk)$/) && newData.val() != newData.parent().child('erst').val()" },
              "band":    { ".validate": "newData.isString() && newData.val().matches(/^b[a-z0-9]{4,12}$/)" },
              "inst":    { ".validate": "newData.isString() && newData.val().matches(/^(dr|ba|sy|ge|uk)$/)" },
              "$andere": { ".validate": false }
            }
          },
          "baende": {
            "$band": {
              ".validate": "$band.matches(/^b[a-z0-9]{4,12}$/) && newData.hasChildren(['name'])",
              "name":    { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 40" },
              "ts":      { ".validate": "newData.isNumber()" },
              "mitglieder": {
                "$sid":  { ".validate": "$sid.matches(/^s[0-9]{1,3}$/) && newData.val() == true" }
              },
              "plaetze": {
                "$inst": {
                  ".validate": "$inst.matches(/^(dr|ba|sy|ge|uk)$/)",
                  "$sid":  { ".validate": "$sid.matches(/^s[0-9]{1,3}$/) && newData.val() == true" }
                }
              },
              "$andere": { ".validate": false }
            }
          },
          "ergebnis": {
            "$sid": {
              ".validate": "$sid.matches(/^s[0-9]{1,3}$/) && newData.hasChildren(['band'])",
              "band":    { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 40" },
              "inst":    { ".validate": "newData.isString() && newData.val().matches(/^(dr|ba|sy|ge|uk)$/)" },
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

### Nur bei der allerersten Einrichtung eines neuen Projekts

**E1.** <https://console.firebase.google.com> → **Projekt hinzufügen**, Name z. B. `school-tool`.
Google Analytics dabei abwählen.

**E2.** **Realtime Database** → Datenbank erstellen → Region **europe-west1 (Belgien)**,
Start im **gesperrten Modus**. Danach R1 und R2 von oben.

**E3.** **Projekteinstellungen** → *Meine Apps* → Web-App (`</>`) anlegen → die
`firebaseConfig` kopieren und in [`js/firebase-config.js`](js/firebase-config.js) eintragen.
**Das ist einmalig pro Projekt** – bei späteren Regeländerungen entfällt dieser Schritt.
Am Code ist sonst nichts zu tun: Der Ordner `schoolTool` bleibt bewusst auch hier
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
      "tresor": {
        "$id": {
          ".read": true,
          ".write": true,
          "chiffre": { ".validate": "newData.isString() && newData.val().length <= 10000000" },
          "iv":      { ".validate": "newData.isString() && newData.val().length <= 64" },
          "salz":    { ".validate": "newData.isString() && newData.val().length <= 64" },
          "stand":   { ".validate": "newData.isNumber()" },
          "geraet":  { ".validate": "newData.isString() && newData.val().length <= 32" },
          "plaene": {
            "$klasse": {
              "chiffre": { ".validate": "newData.isString() && newData.val().length <= 10000000" },
              "iv":      { ".validate": "newData.isString() && newData.val().length <= 64" },
              "name":    { ".validate": "newData.isString() && newData.val().length <= 200" },
              "typ":     { ".validate": "newData.isString() && newData.val().length <= 100" },
              "stand":   { ".validate": "newData.isNumber()" },
              "teile":   { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 200" },
              "$teil":   { ".validate": "$teil.matches(/^t[0-9]{1,3}$/) && newData.isString() && newData.val().length <= 2100000" }
            }
          },
          "fotos": {
            "$foto": {
              "chiffre": { ".validate": "newData.isString() && newData.val().length <= 10000000" },
              "iv":      { ".validate": "newData.isString() && newData.val().length <= 64" },
              "name":    { ".validate": "newData.isString() && newData.val().length <= 200" },
              "typ":     { ".validate": "newData.isString() && newData.val().length <= 100" },
              "stand":   { ".validate": "newData.isNumber()" },
              "teile":   { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 200" },
              "$teil":   { ".validate": "$teil.matches(/^t[0-9]{1,3}$/) && newData.isString() && newData.val().length <= 2100000" }
            }
          },
          "$andere": { ".validate": false }
        }
      },
      "exindex": {
        ".read": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
        "$exId": {
          ".write": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".validate": "$exId.matches(/^[a-z0-9][a-z0-9-]{1,60}$/)"
        }
      },
      "exen": {
        "$exId": {
          ".read": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".write": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".validate": "$exId.matches(/^[a-z0-9][a-z0-9-]{1,60}$/)",
          "meta": { ".validate": "newData.isString() && newData.val().length <= 200000" },
          "schueler": {
            ".read": "auth != null && root.child('schoolTool/exzugang/' + auth.uid).exists() && root.child('schoolTool/exsessions/' + root.child('schoolTool/exzugang/' + auth.uid).val() + '/info/exId').val() === $exId && root.child('schoolTool/exsessions/' + root.child('schoolTool/exzugang/' + auth.uid).val() + '/info/status').val() === 'laeuft' && root.child('schoolTool/exsessions/' + root.child('schoolTool/exzugang/' + auth.uid).val() + '/teilnehmer/' + auth.uid + '/status').val() === 'freigegeben'",
            "teile": { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 20" },
            "laenge": { ".validate": "newData.isNumber()" },
            "$teil": { ".validate": "$teil.matches(/^t[0-9]{1,2}$/) && newData.isString() && newData.val().length <= 1000000" }
          },
          "$andere": { ".validate": false }
        }
      },
      "exgeheim": {
        "$exId": {
          ".read": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".write": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          "loesung":   { ".validate": "newData.isString() && newData.val().length <= 1000000" },
          "bewertung": { ".validate": "newData.isString() && newData.val().length <= 1000000" },
          "stand":     { ".validate": "newData.isNumber()" },
          "$andere":   { ".validate": false }
        }
      },
      "exsessions": {
        ".read": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
        "$code": {
          ".write": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".validate": "$code.matches(/^[1-9][0-9]{5}$/)",
          "info": { ".read": "auth != null" },
          "teilnehmer": {
            "$uid": {
              ".read": "auth != null && auth.uid === $uid",
              ".write": "auth != null && auth.uid === $uid && (root.child('schoolTool/exsessions/' + $code + '/info/status').val() === 'warteraum' || root.child('schoolTool/exsessions/' + $code + '/info/status').val() === 'laeuft') && (!data.exists() || data.child('status').val() === 'wartet')",
              ".validate": "newData.hasChildren(['nummer', 'status']) && root.child('schoolTool/exsessions/' + $code + '/info/erlaubt/n' + newData.child('nummer').val()).exists()",
              "nummer":  { ".validate": "newData.isString() && newData.val().matches(/^[0-9]{1,3}$/)" },
              "status":  { ".validate": "newData.isString() && (newData.val() === 'wartet' || (auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2' && newData.val().matches(/^(freigegeben|fehlt|entfernt|ersetzt)$/)))" },
              "notenschutzAngefragt": { ".validate": "newData.isBoolean()" },
              "nameV":   { ".validate": "newData.isString() && newData.val().length <= 200 && root.child('schoolTool/exsessions/' + $code + '/info/test').val() === true" },
              "notenschutz": { ".validate": "newData.isBoolean() && auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'" },
              "zuschlagMin": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 120 && auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'" },
              "ts":      { ".validate": "newData.isNumber()" },
              "$andere": { ".validate": false }
            }
          },
          "abgaben": {
            "$uid": {
              ".read": "auth != null && auth.uid === $uid",
              ".write": "auth != null && auth.uid === $uid && root.child('schoolTool/exsessions/' + $code + '/info/status').val() === 'laeuft' && root.child('schoolTool/exsessions/' + $code + '/teilnehmer/' + $uid + '/status').val() === 'freigegeben' && data.child('abgegeben').val() !== true && now < root.child('schoolTool/exsessions/' + $code + '/info/startzeit').val() + (root.child('schoolTool/exsessions/' + $code + '/info/dauerMinuten').val() + root.child('schoolTool/exsessions/' + $code + '/info/zuschlagMin').val() + root.child('schoolTool/exsessions/' + $code + '/teilnehmer/' + $uid + '/zuschlagMin').val()) * 60000 + 120000",
              "antworten":   { ".validate": "newData.isString() && newData.val().length <= 300000" },
              "fortschritt": {
                "erledigt": { ".validate": "newData.isNumber()" },
                "gesamt":   { ".validate": "newData.isNumber()" },
                "$andere":  { ".validate": false }
              },
              "stand":       { ".validate": "newData.isNumber()" },
              "abgegeben":   { ".validate": "newData.isBoolean()" },
              "abgegebenUm": { ".validate": "newData.isNumber()" },
              "erzwungen":   { ".validate": "newData.isBoolean()" },
              "ereignisse": {
                "$e": {
                  ".validate": "newData.hasChildren(['art', 'zeit'])",
                  "art":     { ".validate": "newData.isString() && newData.val().length <= 40" },
                  "zeit":    { ".validate": "newData.isNumber()" },
                  "medium":  { ".validate": "newData.isString() && newData.val().length <= 20" },
                  "station": { ".validate": "newData.isString() && newData.val().length <= 20" },
                  "anzahl":  { ".validate": "newData.isNumber()" },
                  "dauerSek": { ".validate": "newData.isNumber()" },
                  "$andere": { ".validate": false }
                }
              },
              "$andere": { ".validate": false }
            }
          }
        }
      },
      "exzugang": {
        "$uid": {
          ".read": "auth != null && (auth.uid === $uid || auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2')",
          ".write": "auth != null && auth.uid === 'QywuB8eYlOPmTjXCI5I9itdLhsq2'",
          ".validate": "newData.isString() && newData.val().matches(/^[1-9][0-9]{5}$/)"
        }
      },
      "raeume": {
        "$raum": {
          ".read": true,
          ".write": true,
          "meta": {
            "projekt":  { ".validate": "newData.isString() && newData.val().length <= 60" },
            "anzahl":   { ".validate": "newData.isNumber() && newData.val() > 0 && newData.val() <= 80" },
            "erstellt": { ".validate": "newData.isNumber()" },
            "bezeichnung": { ".validate": "newData.isString() && newData.val().length <= 30" },
            "$andere":  { ".validate": false }
          },
          "zuordnung": {
            "$sid": {
              ".validate": "$sid.matches(/^s[0-9]{1,3}$/)",
              "gruppe":  { ".validate": "newData.isString() && newData.val().length <= 40" },
              "ts":      { ".validate": "newData.isNumber()" },
              "von":     { ".validate": "newData.isString() && newData.val().length <= 16" },
              "erst":    { ".validate": "newData.isString() && newData.val().matches(/^(dr|ba|sy|ge|uk)$/)" },
              "zweit":   { ".validate": "newData.isString() && newData.val().matches(/^(dr|ba|sy|ge|uk)$/) && newData.val() != newData.parent().child('erst').val()" },
              "band":    { ".validate": "newData.isString() && newData.val().matches(/^b[a-z0-9]{4,12}$/)" },
              "inst":    { ".validate": "newData.isString() && newData.val().matches(/^(dr|ba|sy|ge|uk)$/)" },
              "$andere": { ".validate": false }
            }
          },
          "baende": {
            "$band": {
              ".validate": "$band.matches(/^b[a-z0-9]{4,12}$/) && newData.hasChildren(['name'])",
              "name":    { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 40" },
              "ts":      { ".validate": "newData.isNumber()" },
              "mitglieder": {
                "$sid":  { ".validate": "$sid.matches(/^s[0-9]{1,3}$/) && newData.val() == true" }
              },
              "plaetze": {
                "$inst": {
                  ".validate": "$inst.matches(/^(dr|ba|sy|ge|uk)$/)",
                  "$sid":  { ".validate": "$sid.matches(/^s[0-9]{1,3}$/) && newData.val() == true" }
                }
              },
              "$andere": { ".validate": false }
            }
          },
          "ergebnis": {
            "$sid": {
              ".validate": "$sid.matches(/^s[0-9]{1,3}$/) && newData.hasChildren(['band'])",
              "band":    { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 40" },
              "inst":    { ".validate": "newData.isString() && newData.val().matches(/^(dr|ba|sy|ge|uk)$/)" },
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
* **Tiny Band:** `baende/<id>/plaetze/<kürzel>` hält, wer in einer Band welches
  Instrument spielt. Die Seite belegt einen Platz per Transaktion – tippen zwei Kinder
  gleichzeitig auf Drums, bekommt ihn nur eines. Wie viele Plätze es je Instrument
  gibt, prüft die Seite; die Regeln prüfen Form und Kürzel. `ergebnis` schreibt nur
  die Lehrkraft, mit Bandname und Kürzel.
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
