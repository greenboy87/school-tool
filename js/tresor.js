/* Geräte-Synchronisation mit Verschlüsselung im Browser.

   Ablauf: Deine Daten werden auf DEINEM Gerät mit einem Sync-Passwort
   verschlüsselt (AES-GCM, Schlüssel per PBKDF2 aus dem Passwort). Erst danach
   gehen sie zu Firebase. Dort liegt nur unlesbarer Zeichensalat – weder Google
   noch sonst jemand ohne dein Passwort kann Namen oder Noten sehen.

   Der Speicherort ergibt sich aus dem Passwort selbst (Hash mit eigenem Zusatz),
   deshalb genügt auf einem neuen Gerät dieses eine Passwort.

   WICHTIG: Ohne das Passwort sind die Daten nicht wiederherstellbar. Das ist der
   Sinn echter Verschlüsselung – es gibt bewusst keine Hintertür. */
const Tresor = {
  PASS_KEY: 'tresor-passwort',
  MIN_LAENGE: 12,
  ITERATIONEN: 250000,

  passwort: null,
  id: null,
  salz: null,
  schluessel: null,
  timer: null,
  amLaufen: false,
  letzterStand: 0,
  /* Schutz vor gegenseitigem Überschreiben (Chrome und Safari, Mac und iPad):
     BASIS = der Serverstand, auf dem dieser Browser aufbaut. Liegt auf dem
     Server etwas Neueres, hat ein anderes Gerät inzwischen gespeichert – dann
     wird nicht blind hochgeladen, sondern gefragt. GEAENDERT = hier gibt es
     Änderungen, die noch nicht oben sind. */
  BASIS_KEY: 'tresor-basis',
  GEAENDERT_KEY: 'tresor-geaendert',
  eigenerStand: 0,        // gerade selbst hochgeladen – das eigene Echo ignorieren
  fremd: null,            // { stand, geraet } – neuerer Stand eines anderen Geräts
  pausiert: false,        // nach „nichts tun“ im Konflikt: kein automatisches Hochladen
  aenderungen: 0,         // zählt Speichervorgänge – was während des Hochladens dazukommt, bleibt „geändert“
  abmeldenStand: null,
  /* Erst nach dem Abgleich beim Start zählt Speichern als Änderung. Sonst gilt
     ein Gerät mit altem Stand schon als „geändert“, nur weil der Plan beim Öffnen
     selbst etwas nachträgt – und sein alter Stand ersetzt den neueren auf dem
     Server. Genau so gingen im Oktober 2026 Notizen verloren. */
  bereit: false,

  aktiv() { return !!this.schluessel; },

  init() {
    const knopf = document.getElementById('btn-tresor');
    if (!knopf) return;
    knopf.addEventListener('click', () => this.menue());

    const gemerkt = localStorage.getItem(this.PASS_KEY);
    if (gemerkt) {
      this.verbinden(gemerkt, true);
    } else {
      this.knopfAktualisieren();
    }

    // Jedes Speichern löst eine verzögerte Übertragung aus
    const originalSave = Store.save.bind(Store);
    Store.save = (data) => {
      originalSave(data);
      if (this.aktiv() && this.bereit) {
        this.aenderungen++;
        this.geaendert(true);
        this.geplantHochladen();
      }
    };
    // Zurück im Tab: ausstehenden fremden Stand zeigen
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.fremd) this.hinweisZeigen();
    });
  },

  basis() { return Number(localStorage.getItem(this.BASIS_KEY)) || 0; },
  basisSetzen(stand) { localStorage.setItem(this.BASIS_KEY, String(stand || 0)); },
  istGeaendert() { return localStorage.getItem(this.GEAENDERT_KEY) === '1'; },
  geaendert(an) {
    if (an) localStorage.setItem(this.GEAENDERT_KEY, '1');
    else localStorage.removeItem(this.GEAENDERT_KEY);
  },

  /* ---------- Bedienung ---------- */
  menue() {
    if (!this.aktiv()) { this.einrichten(); return; }
    const wahl = prompt(
      'Geräte-Sync ist aktiv.\n\n' +
      '1 = Jetzt hochladen\n' +
      '2 = Vom Server holen (überschreibt die Daten auf diesem Gerät)\n' +
      '3 = Sync auf diesem Gerät beenden\n' +
      '4 = Frühere Stände dieses Geräts (Sicherungen)\n' +
      '5 = Frühere Stände vom Server (letzte 2 Tage stündlich, 2 Wochen täglich)\n\n' +
      'Zahl eingeben:', '1');
    if (wahl === '1') this.hochladen(true);
    else if (wahl === '2') this.herunterladen(true);
    else if (wahl === '3') this.trennen();
    else if (wahl === '4') this.sicherungWaehlen();
    else if (wahl === '5') this.verlaufWaehlen();
  },

  /* ---------- Frühere Stände ---------- */
  zaehle(d) {
    const k = (d.classes || []).length;
    const s = (d.classes || []).reduce((a, c) => a + (c.students || []).length, 0);
    const n = (d.classes || []).reduce((a, c) => a + Object.values(c.stundenbuch || {}).filter(r => r.s).length, 0);
    return `${k} Klassen, ${s} Schüler, ${n} Stundennotizen`;
  },

  /* Einen früheren Stand zurückholen: der jetzige wird vorher gesichert, der
     frühere dann ganz normal gespeichert und hochgeladen */
  async zurueckholen(daten, wann) {
    if (!confirm(`Stand von ${wann} zurückholen?\n\n${this.zaehle(daten)}\n\n` +
      'Der jetzige Stand wird vorher gesichert (Sync → 4) und lässt sich ebenso zurückholen.')) return;
    Store.sichern(Store.load(), 'vor dem Zurückholen');
    delete daten.standAt;
    Store.save(daten);
    clearTimeout(this.timer);
    this.status('Früherer Stand zurückgeholt – wird hochgeladen …');
    await this.hochladen(false);
    location.reload();
  },

  sicherungWaehlen() {
    const liste = Store.sicherungen();
    if (!liste.length) { alert('Auf diesem Gerät gibt es noch keine Sicherungen.'); return; }
    const zeilen = liste.map((x, i) => {
      let d = {};
      try { d = JSON.parse(x.daten); } catch (e) { /* kaputte Sicherung */ }
      return `${i + 1} = ${this.zeit(x.zeit)} – ${x.grund} (${this.zaehle(d)})`;
    });
    const wahl = prompt('Frühere Stände auf diesem Gerät:\n\n' + zeilen.join('\n') + '\n\nNummer eingeben:');
    const x = liste[Number(wahl) - 1];
    if (!x) return;
    this.zurueckholen(JSON.parse(x.daten), this.zeit(x.zeit));
  },

  /* Verlauf auf dem Server: bei jedem Hochladen landet der Stand zusätzlich in
     einem Fach „h0“…„h47“ (Stunde) und „t0“…„t13“ (Tag) – jedes Fach hält den
     letzten Stand seiner Stunde bzw. seines Tags. Nur Hochladen, also kein
     Download-Kontingent; gelesen wird nur beim Zurückholen. */
  async verlaufSchreiben(paket, stand, geraet) {
    const { db, ref, update } = window.FB;
    const fach = { chiffre: paket.chiffre, iv: paket.iv, stand, geraet };
    const stunde = Math.floor(stand / 3600e3), tag = Math.floor(stand / 864e5);
    try {
      await update(ref(db, `schoolTool/tresor/${this.id}/verlauf`), { ['h' + (stunde % 48)]: fach, ['t' + (tag % 14)]: fach });
    } catch (e) {
      console.warn('Verlauf nicht gespeichert (Regeln?):', e);
    }
  },

  async verlaufWaehlen() {
    if (!this.aktiv()) return;
    try {
      const { db, ref, get } = window.FB;
      const faecher = [...Array(48).keys()].map(i => 'h' + i).concat([...Array(14).keys()].map(i => 't' + i));
      const basis = `schoolTool/tresor/${this.id}/verlauf`;
      const koepfe = await Promise.all(faecher.map(f => get(ref(db, `${basis}/${f}/stand`))
        .then(s => ({ f, stand: s.val() })).catch(() => ({ f, stand: null }))));
      const gesehen = new Set();
      const liste = koepfe.filter(k => k.stand && !gesehen.has(k.stand) && gesehen.add(k.stand))
        .sort((a, b) => b.stand - a.stand).slice(0, 30);
      if (!liste.length) {
        alert('Auf dem Server liegt noch kein Verlauf.\n\nEr entsteht ab jetzt bei jedem Hochladen – sofern die ' +
          'Datenbankregeln den Ast „verlauf“ schon erlauben (siehe firebase-regeln.md).');
        return;
      }
      const geraete = await Promise.all(liste.map(k => get(ref(db, `${basis}/${k.f}/geraet`)).then(s => s.val() || '')));
      const wahl = prompt('Frühere Stände auf dem Server:\n\n' +
        liste.map((k, i) => `${i + 1} = ${this.zeit(k.stand)}${geraete[i] ? ' (' + geraete[i] + ')' : ''}`).join('\n') +
        '\n\nNummer eingeben:');
      const k = liste[Number(wahl) - 1];
      if (!k) return;
      const [chiffre, iv] = await Promise.all(['chiffre', 'iv'].map(f => get(ref(db, `${basis}/${k.f}/${f}`)).then(s => s.val())));
      const daten = await this.entschluesseln({ chiffre, iv, salz: this.nachB64(this.salz) });
      this.zurueckholen(daten, this.zeit(k.stand));
    } catch (e) {
      alert('Der Verlauf ließ sich nicht laden.\n\n' + this.fehlertext(e));
    }
  },

  einrichten() {
    if (!window.FB || !window.FB.bereit) {
      alert('Keine Verbindung zur Datenbank. Bist du online?');
      return;
    }
    const pw = prompt(
      'Sync-Passwort eingeben\n\n' +
      'Hast du den Sync auf einem anderen Gerät (z. B. Safari) schon eingerichtet?\n' +
      '→ Dann gib hier GENAU DASSELBE Passwort ein. Die Daten von dort erscheinen ' +
      'dann auf diesem Gerät.\n\n' +
      'Ist dies dein erstes Gerät?\n' +
      `→ Dann wähle jetzt ein Passwort, mindestens ${this.MIN_LAENGE} Zeichen. Damit ` +
      'werden deine Daten verschlüsselt, bevor sie übertragen werden.\n\n' +
      'ACHTUNG: Ohne dieses Passwort sind die Daten nicht wiederherstellbar. ' +
      'Schreib es dir auf.');
    if (pw === null) return;
    if (pw.trim().length < this.MIN_LAENGE) {
      alert(`Das Passwort ist zu kurz – bitte mindestens ${this.MIN_LAENGE} Zeichen.`);
      return;
    }
    this.verbinden(pw.trim(), false);
  },

  trennen() {
    if (!confirm('Sync auf diesem Gerät beenden?\n\n' +
      'Die Daten bleiben auf diesem Gerät und auf dem Server erhalten – ' +
      'dieses Gerät gleicht nur nicht mehr ab.')) return;
    localStorage.removeItem(this.PASS_KEY);
    this.passwort = this.id = this.salz = this.schluessel = null;
    this.nichtMehrMithoeren();
    this.knopfAktualisieren();
    this.status('Sync beendet.');
  },

  /* Der häufigste Fehler ist die noch fehlende Freigabe in der Firebase-Konsole. */
  fehlertext(e) {
    const code = ((e && (e.code || e.message)) || '').toString().toUpperCase();
    if (code.includes('PERMISSION_DENIED') || code.includes('PERMISSION DENIED')) {
      return 'Die Firebase-Regeln geben den Pfad „schoolTool/tresor“ noch nicht frei. ' +
        'Der Block dafür steht in firebase-regeln.md.';
    }
    if (code.includes('OFFLINE')) {
      return 'Keine Verbindung zur Datenbank (Firebase meldet „offline“) – ' +
        'neuer Versuch läuft von selbst, sobald das Netz da ist.';
    }
    return (e && e.message) ? e.message : String(e);
  },

  /* ---------- Verbinden ---------- */
  async verbinden(pw, still) {
    try {
      await this._verbinden(pw, still);
    } catch (e) {
      this.schluessel = null;
      this.status(this.fehlertext(e), true);
      this.knopfAktualisieren();
      if (!still) alert('Sync fehlgeschlagen.\n\n' + this.fehlertext(e));
      // Keine Verbindung: still weiterprobieren, sobald das Netz wieder da ist
      if (window.FB && window.FB.offline && window.FB.offline(e)) this.spaeterVerbinden(pw);
    }
  },

  spaeterVerbinden(pw) {
    clearTimeout(this.neuVersuch);
    const nochmal = () => {
      clearTimeout(this.neuVersuch);
      window.removeEventListener('online', nochmal);
      if (!this.aktiv() && localStorage.getItem(this.PASS_KEY) === pw) this.verbinden(pw, true);
    };
    window.addEventListener('online', nochmal);
    this.neuVersuch = setTimeout(nochmal, 30000);
  },

  /* Nur die Hauptdaten des Tresors, ohne die Äste „plaene“ und „fotos“:
     Ein get auf den ganzen Tresor zieht jedes Mal alle Sitzpläne und Fotos mit
     herunter – das hat das Download-Kontingent der Datenbank aufgebraucht. */
  KOPF: ['chiffre', 'iv', 'salz', 'stand', 'geraet'],
  async kopfHolen(id = this.id, felder = this.KOPF) {
    const { db, ref, get } = window.FB;
    const werte = await Promise.all(felder.map(f => get(ref(db, `schoolTool/tresor/${id}/${f}`))));
    const kopf = {};
    felder.forEach((f, i) => { const v = werte[i].val(); if (v !== null) kopf[f] = v; });
    return Object.keys(kopf).length ? kopf : null;
  },

  async _verbinden(pw, still) {
    if (!window.FB || !window.FB.bereit) throw new Error('Datenbank nicht erreichbar');
    this.passwort = pw;
    this.id = await this.tresorId(pw);
    this.status('verbinde …');

    const vorhanden = await this.kopfHolen();

    if (vorhanden && vorhanden.salz) {
      // Bestehender Tresor: Schlüssel aus dem gespeicherten Salz ableiten
      this.salz = this.vonB64(vorhanden.salz);
      this.schluessel = await this.schluesselAus(pw, this.salz);
      let daten;
      try {
        daten = await this.entschluesseln(vorhanden);
      } catch (e) {
        this.schluessel = null;
        this.status('Falsches Sync-Passwort.', true);
        if (!still) alert('Mit diesem Passwort lassen sich die Daten nicht entschlüsseln.\n\n' +
          'Entweder ist es ein Tippfehler – oder unter diesem Passwort liegt ein fremder Tresor.');
        return;
      }
      localStorage.setItem(this.PASS_KEY, pw);
      const lokal = Store.load();
      const lokalStand = Math.max(lokal.standAt || 0, this.basis());
      const fernStand = vorhanden.stand || 0;
      // Still übernehmen nur, wenn hier nichts Ungesichertes liegt
      if (fernStand > lokalStand && still && this.istGeaendert()) still = false;
      if (fernStand > lokalStand) {
        // Beide Seiten benennen: Sonst weiß man nicht, was man gerade ersetzt.
        const zaehle = d => this.zaehle(d);
        if (still || confirm(
          'Passwort stimmt – auf dem Server liegen Daten.\n\n' +
          `VOM SERVER (${this.zeit(fernStand)}, ${vorhanden.geraet || 'anderes Gerät'}):\n` +
          `   ${zaehle(daten)}\n\n` +
          'AUF DIESEM GERÄT' + (lokalStand ? ` (${this.zeit(lokalStand)})` : ' (noch nie abgeglichen)') + ':\n' +
          `   ${zaehle(lokal)}\n\n` +
          'Den Stand vom Server übernehmen? Die Daten auf diesem Gerät werden dabei ersetzt.')) {
          await this.uebernehmen(daten, fernStand, vorhanden.geraet);
          this.status('Stand vom Server übernommen (' + this.zeit(fernStand) + ').');
          this.knopfAktualisieren();
          return;
        }
        /* Abgelehnt – und jetzt wird es heikel: Auf dem Server liegt der neuere
           Stand, weitermachen hiesse, ihn durch den aelteren dieses Geraets zu
           ersetzen. Auf einem frisch eingerichteten Browser waere das der leere.
           Dass „Abbrechen“ genau das ausloest, sieht man der ersten Frage nicht
           an, deshalb hier noch einmal nachfragen – mit beiden Zahlen. */
        if (!confirm(
          'Sicher? Dann wird der Stand auf dem Server durch den Stand dieses Geräts ersetzt:\n\n' +
          `AUF DEM SERVER (${this.zeit(fernStand)}, ${vorhanden.geraet || 'anderes Gerät'}):\n` +
          `   ${zaehle(daten)}\n\n` +
          'AUF DIESEM GERÄT' + (lokalStand ? ` (${this.zeit(lokalStand)})` : ' (noch nie abgeglichen)') + ':\n' +
          `   ${zaehle(lokal)}\n\n` +
          'OK: Server überschreiben.\n' +
          'Abbrechen: nichts verändern – der Sync bleibt auf diesem Gerät aus.')) {
          localStorage.removeItem(this.PASS_KEY);
          this.passwort = this.id = this.salz = this.schluessel = null;
          this.status('Nichts verändert – der Sync ist auf diesem Gerät aus.');
          this.bereit = true;
          this.knopfAktualisieren();
          if (!still) alert('Es wurde nichts verändert – weder hier noch auf dem Server.\n\n' +
            'Der Sync ist auf diesem Gerät ausgeschaltet. Über „Sync“ kannst du es ' +
            'jederzeit erneut versuchen.');
          return;
        }
      }
      // Den Serverstand vorher beiseitelegen, falls er gleich ersetzt wird
      if (fernStand > lokalStand) Store.sichern(daten, `Serverstand vor dem Überschreiben (${vorhanden.geraet || 'anderes Gerät'})`);
      this.bereit = true;
      this.knopfAktualisieren();
      this.status('verbunden');
      /* Beide Seiten gleich und hier nichts offen: nicht hochladen. Sonst lädt
         jedes Öffnen einen neuen Stand hoch, das andere Gerät übernimmt ihn,
         lädt neu, lädt seinerseits hoch – und die beiden schaukeln sich auf. */
      if (fernStand === lokalStand && !this.istGeaendert()) {
        this.status('aktuell (' + this.zeit(fernStand) + ')');
      } else {
        // Hier angekommen, gilt der Stand dieses Geräts (ggf. ausdrücklich gewählt)
        await this.hochladen(false, true);
      }
      this.mithoeren();
    } else {
      // Unter diesem Passwort liegt nichts. Das heißt entweder „erstes Gerät“ –
      // oder es ist ein Tippfehler. Weil der Speicherort am Passwort hängt, würde
      // ein Tippfehler sonst stillschweigend einen zweiten, leeren Tresor anlegen
      // und die eigenen Daten unauffindbar machen. Deshalb hier nachfragen.
      const lokal = Store.load().classes || [];
      if (!still && !confirm(
        'Unter diesem Sync-Passwort liegen noch keine Daten.\n\n' +
        'Ist dies dein erstes Gerät? Dann OK – es wird ein neuer Tresor angelegt' +
        (lokal.length ? ` und die ${lokal.length} Klassen von diesem Gerät werden hochgeladen.` : '.') +
        '\n\nErwartest du hier deine Daten von einem anderen Gerät, hast du dich ' +
        'vermutlich vertippt: Abbrechen und noch einmal versuchen.')) {
        this.schluessel = null;
        this.status('Abgebrochen – kein Tresor angelegt.');
        this.knopfAktualisieren();
        return;
      }
      this.salz = crypto.getRandomValues(new Uint8Array(16));
      this.schluessel = await this.schluesselAus(pw, this.salz);
      localStorage.setItem(this.PASS_KEY, pw);
      this.bereit = true;
      this.knopfAktualisieren();
      await this.hochladen(false, true);
      this.mithoeren();
      if (!still) alert('Sync eingerichtet.\n\nAuf einem weiteren Gerät dieselbe Seite öffnen, ' +
        'auf „Sync“ klicken und dasselbe Passwort eingeben – dann sind die Daten dort.');
    }
  },

  async uebernehmen(daten, stand, geraet) {
    // Der bisherige Stand dieses Geräts bleibt als Sicherung (Sync → 4)
    Store.sichern(Store.load(), `vor Übernahme vom Server${geraet ? ' (' + geraet + ')' : ''}`);
    daten.standAt = stand;
    Store.save(daten);
    clearTimeout(this.timer);     // das eben Übernommene nicht gleich wieder hochladen
    this.basisSetzen(stand);
    this.geaendert(false);
    this.fremd = null;
    this.letzterStand = stand;
    // Sitzpläne liegen in eigenen Knoten – vor dem Neuladen mitholen
    this.status('hole Sitzpläne und Fotos …');
    try { await this.dateienHolen(); } catch (e) { console.error('Dateien:', e); }
    location.reload();
  },

  /* ---------- Schutz vor gegenseitigem Überschreiben ---------- */

  /* Beim Hochladen gemerkt: Ein anderes Gerät hat inzwischen gespeichert */
  async konflikt(stand, geraet) {
    const wer = `${geraet || 'einem anderen Gerät'}, ${this.zeit(stand)}`;
    if (confirm(`Auf dem Server liegt ein neuerer Stand (${wer}).\n\n` +
      'OK: diesen Stand übernehmen – was du hier seitdem geändert hast, geht verloren.\n' +
      'Abbrechen: weitere Möglichkeiten')) {
      await this.herunterladen(false);
      return;
    }
    if (confirm('Stattdessen den Stand dieses Browsers hochladen?\n\n' +
      `Der neuere Stand (${wer}) wird dabei ersetzt.\n\n` +
      'Abbrechen: nichts tun – dieser Browser sichert vorerst nicht, bis du über „Sync“ entscheidest.')) {
      // Den Stand, der gleich ersetzt wird, vorher hier sichern
      try {
        const paket = await this.kopfHolen();
        Store.sichern(await this.entschluesseln(paket), `Serverstand vor dem Überschreiben (${geraet || 'anderes Gerät'})`);
      } catch (e) { console.error('Serverstand nicht gesichert:', e); }
      await this.hochladen(false, true);
      return;
    }
    this.pausiert = true;
    this.fremd = { stand, geraet };
    this.status('Nicht gesichert – neuerer Stand auf dem Server', true);
    this.hinweisZeigen();
  },

  /* Live: Speichert ein anderes Gerät, erfährt dieser Browser es sofort */
  mithoeren() {
    this.nichtMehrMithoeren();
    if (!window.FB || !window.FB.onValue) return;
    const { db, ref, onValue } = window.FB;
    this.abmeldenStand = onValue(ref(db, `schoolTool/tresor/${this.id}/stand`), snap => {
      const stand = snap.val() || 0;
      if (!stand || stand <= this.basis() || stand === this.eigenerStand) return;
      window.FB.get(ref(db, `schoolTool/tresor/${this.id}/geraet`)).then(g => {
        this.fremd = { stand, geraet: g.val() };
        // Nichts Eigenes offen und der Tab liegt im Hintergrund: still übernehmen
        if (!this.istGeaendert() && document.hidden) this.herunterladen(false);
        else this.hinweisZeigen();
      }).catch(() => {});
    });
  },

  nichtMehrMithoeren() {
    if (this.abmeldenStand) { this.abmeldenStand(); this.abmeldenStand = null; }
    this.fremd = null;
    this.hinweisWeg();
  },

  hinweisZeigen() {
    if (!this.fremd) return;
    let el = document.getElementById('tresor-hinweis');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tresor-hinweis';
      el.className = 'tresor-hinweis';
      el.setAttribute('role', 'status');
      document.body.append(el);
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-tresor]');
        if (!b) return;
        if (b.dataset.tresor === 'holen') this.fremdUebernehmen();
        else this.hinweisWeg();
      });
    }
    el.innerHTML = `<span>Neuerer Stand von ${Band.esc(this.fremd.geraet || 'einem anderen Gerät')} ` +
      `(${this.zeit(this.fremd.stand)})${this.istGeaendert() ? ' – hier gibt es ungesicherte Änderungen' : ''}</span>` +
      '<button class="primary small" data-tresor="holen">Übernehmen</button>' +
      '<button class="small" data-tresor="spaeter">Später</button>';
  },

  hinweisWeg() {
    const el = document.getElementById('tresor-hinweis');
    if (el) el.remove();
  },

  fremdUebernehmen() {
    if (this.istGeaendert() && !confirm('Den neueren Stand übernehmen?\n\n' +
      'Was du in diesem Browser seitdem geändert hast, geht dabei verloren.')) return;
    this.herunterladen(false);
  },

  /* ---------- Übertragen ---------- */
  geplantHochladen() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hochladen(false), 1500);
  },

  /* erzwingen: ohne Blick auf den Serverstand (nach ausdrücklicher Wahl) */
  async hochladen(laut, erzwingen) {
    if (!this.aktiv() || this.amLaufen) return;
    if (this.pausiert && !laut && !erzwingen) return;
    this.amLaufen = true;
    try {
      const { db, ref, update } = window.FB;
      if (!erzwingen) {
        const fern = (await this.kopfHolen(this.id, ['stand', 'geraet'])) || {};
        if ((fern.stand || 0) > this.basis()) {
          this.amLaufen = false;
          await this.konflikt(fern.stand, fern.geraet);
          return;
        }
      }
      this.pausiert = false;
      const aenderungenVorher = this.aenderungen;
      const daten = Store.load();
      const stand = Date.now();
      daten.standAt = stand;
      localStorage.setItem(Store.KEY, JSON.stringify(daten));   // ohne erneuten Sync-Anstoß

      const paket = await this.verschluesseln(daten);
      this.eigenerStand = stand;
      // update statt set: ein set würde den Sitzplan-Ast „plaene“ mitlöschen
      await update(ref(db, `schoolTool/tresor/${this.id}`), {
        ...paket, stand, geraet: this.geraetName(),
      });
      await this.verlaufSchreiben(paket, stand, this.geraetName());
      this.letzterStand = stand;
      this.basisSetzen(stand);
      // Was seit Beginn des Hochladens geändert wurde, ist schon wieder neu angestoßen
      if (this.aenderungen === aenderungenVorher) this.geaendert(false);
      this.fremd = null;
      this.hinweisWeg();
      this.status('gesichert ' + this.zeit(stand));

      // Sitzpläne getrennt behandeln: Wenn hier etwas klemmt, sind die
      // Hauptdaten trotzdem gesichert – die Meldung darf das nicht verwischen.
      let planFehler = null;
      try { await this.dateienHochladen(); }
      catch (e) { planFehler = this.fehlertext(e); }
      /* Grosse Dateien melden beim Hochladen ihren Fortschritt („Teil 3 von 6“).
         Diese Meldung muss am Ende wieder weichen, sonst steht sie da, als haenge
         die Uebertragung noch. */
      this.status(planFehler
        ? 'gesichert ' + this.zeit(stand) + ' · Dateien nicht: ' + planFehler
        : 'gesichert ' + this.zeit(stand), !!planFehler);

      if (laut) alert(planFehler
        ? 'Daten wurden verschlüsselt hochgeladen.\n\nDie Sitzpläne konnten nicht ' +
          'mitgenommen werden:\n' + planFehler
        : 'Daten wurden verschlüsselt hochgeladen.');
    } catch (e) {
      this.status('Hochladen fehlgeschlagen: ' + this.fehlertext(e), true);
      if (laut) alert('Hochladen fehlgeschlagen.\n\n' + this.fehlertext(e));
    } finally {
      this.amLaufen = false;
    }
  },

  async herunterladen(laut) {
    if (!this.aktiv()) return;
    try {
      const paket = await this.kopfHolen();
      if (!paket) { alert('Auf dem Server liegt noch nichts.'); return; }
      const daten = await this.entschluesseln(paket);
      if (laut && !confirm(
        `Stand vom Server: ${this.zeit(paket.stand)}\n` +
        `${(daten.classes || []).length} Klassen\n\n` +
        'Übernehmen? Die Daten auf diesem Gerät werden dabei ersetzt.')) return;
      await this.uebernehmen(daten, paket.stand || Date.now(), paket.geraet);
    } catch (e) {
      alert('Herunterladen fehlgeschlagen.\n\n' + this.fehlertext(e));
    }
  },

  /* ---------- Sitzpläne ----------
     Die PDFs liegen nicht im normalen Speicher, sondern in IndexedDB – sie müssen
     deshalb einzeln mitgenommen werden. Jeder Plan bekommt seinen eigenen Knoten,
     damit ein großes PDF nicht die ganze Übertragung sprengt. Verschlüsselt wird
     mit demselben Schlüssel wie die übrigen Daten. */
  /* Firebase weist jeden Wert ueber 10.485.760 Bytes ab ("value argument
     contains a string greater than 10485760 utf8 bytes") – gemessen, nicht
     geschaetzt. Grosse Dateien werden deshalb in Stuecke zerlegt und einzeln
     abgelegt; dadurch faellt diese Grenze weg. Was bleibt, ist die Vernunft:
     Jedes Geraet laedt beim Abgleich alles herunter, und 15 MiB je Sitzplan
     sind bei 14 Klassen schon gut 200 MB. */
  MAX_PLAN: 15 * 1024 * 1024,
  TEIL_GROESSE: 2 * 1000 * 1000,      // Zeichen je Stueck, mit Abstand unter der Grenze
  PLAN_MERKER: 'tresor-plaene',
  HOL_MERKER: 'tresor-dateistand',     // je Datei der Server-„stand“, den dieses Gerät schon hat

  merker() {
    try { return JSON.parse(localStorage.getItem(this.PLAN_MERKER) || '{}'); }
    catch (e) { return {}; }
  },

  fingerabdruck(name, groesse) { return `${name}|${groesse}`; },

  holMerker() {
    try { return JSON.parse(localStorage.getItem(this.HOL_MERKER) || '{}'); }
    catch (e) { return {}; }
  },

  /* Nur die Namen der Dateien eines Asts – ohne ihren Inhalt. Das Firebase-SDK
     kennt das nicht, die REST-Schnittstelle schon („shallow“). */
  async dateiNamen(pfad) {
    const r = await fetch(`${window.FIREBASE_CONFIG.databaseURL}/${pfad}.json?shallow=true`);
    if (!r.ok) throw new Error('Dateiliste: ' + r.status);
    return Object.keys((await r.json()) || {});
  },

  /* Sitzpläne und Fotos verhalten sich gleich – ein gemeinsamer Weg für beide */
  DATEIARTEN: [
    { knoten: 'plaene', ids: () => Store.allSeatplanIds(), holen: (id) => Store.getSeatplan(id),
      legen: (id, datei) => Store.putSeatplan(id, datei), standard: 'Sitzplan.pdf', typ: 'application/pdf' },
    { knoten: 'fotos', ids: () => Store.allFotoIds(), holen: (id) => Store.getFoto(id),
      legen: (id, datei) => Store.putFoto(id, datei), standard: 'Foto', typ: 'image/jpeg' },
  ],

  async dateienHochladen() {
    if (!this.aktiv()) return;
    const merker = this.merker();
    const holMerker = this.holMerker();
    const { db, ref, set } = window.FB;
    for (const art of this.DATEIARTEN) {
      for (const id of await art.ids()) {
        const eintrag = await art.holen(id);
        if (!eintrag || !eintrag.blob) continue;
        const schluessel = art.knoten + ':' + id;
        const fp = this.fingerabdruck(eintrag.name, eintrag.blob.size);
        if (merker[schluessel] === fp) continue;          // unverändert
        if (eintrag.blob.size > this.MAX_PLAN) {
          const mb = (n) => (n / 1024 / 1024).toFixed(1).replace('.', ',');
          this.status(`„${eintrag.name}“ ist zu groß für den Sync ` +
            `(${mb(eintrag.blob.size)} MB, erlaubt sind ${mb(this.MAX_PLAN)} MB).`, true);
          continue;
        }
        const bytes = new Uint8Array(await eintrag.blob.arrayBuffer());
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.schluessel, bytes);
        const text = this.nachB64(new Uint8Array(chiffre));
        const ziel = `schoolTool/tresor/${this.id}/${art.knoten}/${id}`;
        const kopf = {
          iv: this.nachB64(iv),
          name: eintrag.name || art.standard,
          typ: eintrag.type || art.typ,
          stand: Date.now(),
        };

        if (text.length <= this.TEIL_GROESSE) {
          await set(ref(db, ziel), { ...kopf, chiffre: text });
        } else {
          /* In Stuecke zerlegt: Jedes einzeln geschrieben, damit weder ein
             Wert noch ein Schreibvorgang an die Grenzen der Datenbank stoesst.
             Erst der Kopf – ein „set“ raeumt dabei alte Stuecke mit weg. */
          const stuecke = Math.ceil(text.length / this.TEIL_GROESSE);
          await set(ref(db, ziel), { ...kopf, teile: stuecke });
          for (let i = 0; i < stuecke; i++) {
            this.status(`lade „${kopf.name}“ … Teil ${i + 1} von ${stuecke}`);
            await set(ref(db, `${ziel}/t${i}`),
              text.slice(i * this.TEIL_GROESSE, (i + 1) * this.TEIL_GROESSE));
          }
        }
        merker[schluessel] = fp;
        holMerker[schluessel] = kopf.stand;
      }
    }
    localStorage.setItem(this.PLAN_MERKER, JSON.stringify(merker));
    localStorage.setItem(this.HOL_MERKER, JSON.stringify(holMerker));
  },

  /* Dateien vom Server holen – nur, was sich geändert hat. Früher kam bei jeder
     Übernahme (also nach fast jeder Änderung auf einem anderen Gerät) jeder
     Sitzplan, jedes Foto und jedes Ablage-Dokument komplett herunter. Jetzt:
     Dateinamen (shallow), je Datei nur das Feld „stand“, und den Inhalt nur,
     wenn der Stand neu ist oder die Datei auf diesem Gerät fehlt. */
  async dateienHolen() {
    if (!this.aktiv()) return 0;
    const { db, ref, get } = window.FB;
    const merker = this.merker();
    const holMerker = this.holMerker();
    let geholt = 0;
    for (const art of this.DATEIARTEN) {
      const basis = `schoolTool/tresor/${this.id}/${art.knoten}`;
      const lokal = new Set(await art.ids());
      for (const id of await this.dateiNamen(basis)) {
        const schluessel = art.knoten + ':' + id;
        try {
          const stand = (await get(ref(db, `${basis}/${id}/stand`))).val();
          if (stand && holMerker[schluessel] === stand && lokal.has(id)) continue;   // unverändert
          const p = (await get(ref(db, `${basis}/${id}`))).val();
          if (!p) continue;
          const iv = this.vonB64(p.iv);
          const text = this.teileZusammensetzen(p, art.knoten, id);
          if (text === null) continue;
          const klar = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv }, this.schluessel, this.vonB64(text));
          const datei = new File([klar], p.name || art.standard, { type: p.typ || art.typ });
          await art.legen(id, datei);
          merker[schluessel] = this.fingerabdruck(datei.name, datei.size);
          holMerker[schluessel] = p.stand;
          geholt++;
        } catch (e) {
          console.error('Datei konnte nicht übernommen werden:', art.knoten, id, e);
        }
      }
    }
    localStorage.setItem(this.PLAN_MERKER, JSON.stringify(merker));
    localStorage.setItem(this.HOL_MERKER, JSON.stringify(holMerker));
    return geholt;
  },

  /* ---------- Server-Backup ----------
     Der Rettungsanker: holt den Stand vom Server, entschlüsselt ihn und legt ihn
     als Datei ab. Anders als „Vom Server holen“ wird dabei nichts in diesem
     Browser verändert und nichts hochgeladen – das ist der Sinn der Sache. Es
     funktioniert deshalb auch dann noch, wenn der lokale Stand leer oder kaputt
     ist, und sogar ohne eingerichteten Sync: Das Passwort genügt.
     Sitzpläne und Fotos kommen mit; das Backup dieses Geräts lässt sie weg,
     weil sie nicht im normalen Speicher liegen, sondern in IndexedDB. */
  async serverBackup() {
    try {
      if (!window.FB || !window.FB.bereit) throw new Error('Datenbank nicht erreichbar');
      let pw = this.passwort || localStorage.getItem(this.PASS_KEY);
      if (!pw) {
        pw = (prompt(
          'Sync-Passwort eingeben.\n\n' +
          'Damit wird der Stand vom Server geholt und als Datei gespeichert. ' +
          'An den Daten in diesem Browser ändert sich dabei nichts.') || '').trim();
        if (!pw) return;
      }

      this.status('hole Serverstand …');
      const id = await this.tresorId(pw);
      const { db, ref, get } = window.FB;
      const paket = await this.kopfHolen(id);
      if (!paket || !paket.salz) {
        this.status('Unter diesem Passwort liegt nichts.', true);
        alert('Unter diesem Sync-Passwort liegt auf dem Server nichts.\n\n' +
          'Entweder ist es ein Tippfehler, oder der Tresor gehört zu einem anderen Passwort.');
        return;
      }

      const schluessel = await this.schluesselAus(pw, this.vonB64(paket.salz));
      let daten;
      try {
        daten = await this.entschluesseln(paket, schluessel);
      } catch (e) {
        this.status('Falsches Sync-Passwort.', true);
        alert('Mit diesem Passwort lassen sich die Daten nicht entschlüsseln.\n\n' +
          'Entweder ist es ein Tippfehler – oder unter diesem Passwort liegt ein fremder Tresor.');
        return;
      }

      // Sitzpläne und Fotos liegen in eigenen Knoten und werden einzeln geholt.
      // Eine Datei, die sich nicht entschlüsseln lässt, darf den Rest nicht aufhalten.
      const dateien = {};
      let dabei = 0, uebersprungen = 0;
      for (const art of this.DATEIARTEN) {
        this.status(`hole ${art.knoten} …`);
        const alle = (await get(ref(db, `schoolTool/tresor/${id}/${art.knoten}`))).val() || {};
        const ziel = dateien[art.knoten] = {};
        for (const [dateiId, p] of Object.entries(alle)) {
          try {
            const klar = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: this.vonB64(p.iv) }, schluessel, this.vonB64(p.chiffre));
            ziel[dateiId] = {
              name: p.name || art.standard,
              typ: p.typ || art.typ,
              b64: this.nachB64(new Uint8Array(klar)),
            };
            dabei++;
          } catch (e) {
            uebersprungen++;
            console.error('Datei nicht lesbar:', art.knoten, dateiId, e);
          }
        }
      }

      Store.alsDateiSpeichern({
        schoolTool: 'server-backup',
        version: 1,
        stand: paket.stand || 0,
        geraet: paket.geraet || '',
        geholtAm: Date.now(),
        daten,
        dateien,
      }, `school-tool-server-backup-${Store.heuteStempel()}.json`);

      const klassen = (daten.classes || []).length;
      const schueler = (daten.classes || []).reduce((a, c) => a + (c.students || []).length, 0);
      this.status('Gespeichert (' + this.zeit(paket.stand) + ')');
      alert(
        'Server-Backup gespeichert.\n\n' +
        `Stand vom Server: ${this.zeit(paket.stand)}` +
        (paket.geraet ? ` (${paket.geraet})` : '') + '\n' +
        `${klassen} ${klassen === 1 ? 'Klasse' : 'Klassen'}, ${schueler} Schüler\n` +
        `${dabei} Sitzpläne/Fotos` +
        (uebersprungen ? `, ${uebersprungen} nicht lesbar` : '') + '\n\n' +
        'Die Datei liegt bei den Downloads. In diesem Browser wurde nichts verändert – ' +
        'zum Zurückspielen den Knopf „Wiederherstellen“ nehmen.');
    } catch (e) {
      this.status('Server-Backup fehlgeschlagen: ' + this.fehlertext(e), true);
      alert('Server-Backup fehlgeschlagen.\n\n' + this.fehlertext(e));
    }
  },

  /* Eine Datei liegt entweder ganz in „chiffre“ oder in Stuecken t0, t1, …
     Fehlt ein Stueck, wird die Datei uebersprungen statt halb geschrieben –
     ein halber Sitzplan waere schlimmer als gar keiner. */
  teileZusammensetzen(p, knoten, id) {
    if (typeof p.chiffre === 'string') return p.chiffre;
    if (!p.teile) {
      console.error('Datei ohne Inhalt:', knoten, id);
      return null;
    }
    const stuecke = [];
    for (let i = 0; i < p.teile; i++) {
      const t = p['t' + i];
      if (typeof t !== 'string') {
        console.error(`Datei unvollständig: ${knoten}/${id}, Teil ${i + 1} von ${p.teile} fehlt`);
        return null;
      }
      stuecke.push(t);
    }
    return stuecke.join('');
  },

  /* ---------- Verschlüsselung ---------- */
  async schluesselAus(pw, salz) {
    const basis = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salz, iterations: this.ITERATIONEN, hash: 'SHA-256' },
      basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },

  /* Der Speicherort hängt am Passwort, damit ein neues Gerät nur dieses eine
     Geheimnis braucht. Bewusst ein anderer Zusatz als bei der Verschlüsselung. */
  async tresorId(pw) {
    const h = await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode('school-tool-tresor-v1|' + pw));
    return [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async verschluesseln(daten) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const klar = new TextEncoder().encode(JSON.stringify(daten));
    const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.schluessel, klar);
    return { chiffre: this.nachB64(new Uint8Array(chiffre)),
             iv: this.nachB64(iv), salz: this.nachB64(this.salz) };
  },

  async entschluesseln(paket, schluessel = this.schluessel) {
    const iv = this.vonB64(paket.iv);
    const chiffre = this.vonB64(paket.chiffre);
    const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, schluessel, chiffre);
    return JSON.parse(new TextDecoder().decode(klar));
  },

  nachB64(bytes) {
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  },
  vonB64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); },

  /* ---------- Kleinkram ---------- */
  geraetName() {
    const p = navigator.platform || '', ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    const geraet = /iPad|iPhone/i.test(ua) || (/Mac/i.test(p) && navigator.maxTouchPoints > 1) ? 'iPad'
      : /Mac/i.test(p) ? 'Mac' : /Win/i.test(p) ? 'Windows' : 'Gerät';
    return browser ? `${geraet} · ${browser}` : geraet;
  },

  zeit(ms) {
    if (!ms) return '–';
    const d = new Date(ms);
    const heute = new Date().toDateString() === d.toDateString();
    return heute
      ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' +
        d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  },

  status(text, warnung) {
    const el = document.getElementById('tresor-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('warnung', !!warnung);
    // Auf schmalen Bildschirmen ist der Text ausgeblendet – dann steht er am Knopf
    this.statusText = text || '';
    this.knopfAktualisieren();
  },

  knopfAktualisieren() {
    const knopf = document.getElementById('btn-tresor');
    if (!knopf) return;
    const an = this.aktiv();
    // Nur das Symbol – der Zustand steht im title und am Rahmen (Klasse „aktiv“)
    knopf.innerHTML = Icons.raw(an ? 'check' : 'upload');
    knopf.setAttribute('aria-label', an ? 'Sync an' : 'Sync');
    knopf.classList.toggle('aktiv', an);
    knopf.title = (an
      ? 'Geräte-Sync läuft. Klicken für Hochladen, Holen oder Beenden.'
      : 'Daten verschlüsselt zwischen deinen Geräten abgleichen') +
      (this.statusText ? '\n' + this.statusText : '');
  },
};

window.Tresor = Tresor;
