/* Tiny Band – Schülerseite (iPad zuerst).

   Wie gruppen.html: Die Klassenliste steckt im Anker (#…) des QR-Codes und
   erreicht keinen Server. An Firebase gehen nur Platznummern (s0, s1 …),
   Bandnamen und Instrument-Kürzel.

   Weg A: Namen → Erstinstrument → Zweitinstrument → fertig.
          zuordnung/sN = { erst, zweit, ts }
   Weg B: Namen → Band gründen/beitreten → je Name ein Instrument → fertig.
          baende/<id>/mitglieder/sN und baende/<id>/plaetze/<kürzel>/sN laufen
          über runTransaction: Ist die Band voll oder der Drums-Platz gerade
          weg, bricht die Transaktion ab, statt zwei Kinder hineinzulassen.
          zuordnung/sN = { band, inst, ts }
   Beide: Sobald ergebnis/sN da ist, zeigt die Seite Band, Instrument und
          Expertengruppe groß an. */
const TB = {
  raum: null,
  namen: [],
  klasse: '',
  modus: 'A',
  bandzahl: 0,
  song: TinyBand.SONG,

  auswahl: [],            // Platznummern, die dieses Gerät betreut („s7“)
  picker: true,           // Namensliste offen
  bearbeite: null,        // { sid, stufe: 'erst'|'zweit'|'inst' } beim Ändern
  bandWechsel: false,     // Weg B: „Band wechseln“ gedrückt

  zuordnung: {},
  baende: {},
  ergebnis: {},
  raumLebt: null,
  schirm: null,           // zuletzt gezeigter Schirm – für die Übergänge
  beschaeftigt: false,

  init() {
    document.getElementById('tb-stadt').innerHTML = TinyBand.skyline();
    if (!this.ladeZugang()) return;
    document.title = `Tiny Band – ${this.song}`;
    document.getElementById('tb-titel').textContent = `Tiny Band · ${this.song}`;
    this.auswahl = this.gemerkteAuswahl();
    this.picker = !this.auswahl.length;

    // Ein neuer QR-Code ändert nur den Anker – ohne Neuladen bliebe man im alten Raum
    window.addEventListener('hashchange', () => location.reload());
    this.bindeEreignisse();
    if (window.FB && window.FB.bereit) this.starte();
    else window.addEventListener('fb-bereit', () => this.starte(), { once: true });
    setTimeout(() => {
      if (!window.FB || !window.FB.bereit) this.zeigeFehler(
        'Keine Verbindung zur Datenbank. Bist du im WLAN?');
    }, 8000);
  },

  /* ---------- Anker lesen ---------- */
  ladeZugang() {
    try {
      const roh = location.hash.replace(/^#/, '');
      if (!roh) throw new Error('kein Anker');
      const d = JSON.parse(this.vonBase64(roh));
      if (!d.r || !Array.isArray(d.n) || !d.n.length) throw new Error('unvollständig');
      this.raum = String(d.r);
      this.namen = d.n.map(String);
      this.klasse = d.k || '';
      this.modus = d.m === 'B' ? 'B' : 'A';
      this.bandzahl = Math.max(0, parseInt(d.z, 10) || 0);
      this.song = String(d.t || TinyBand.SONG).slice(0, 40);
      return true;
    } catch (e) {
      this.zeigeFehler();
      return false;
    }
  },

  vonBase64(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  },

  gemerkteAuswahl() {
    try {
      const werte = JSON.parse(localStorage.getItem('tinyband-ich-' + this.raum) || '[]');
      return (Array.isArray(werte) ? werte : [])
        .map(i => +i).filter(i => Number.isInteger(i) && this.namen[i]).map(i => 's' + i);
    } catch (e) { return []; }
  },

  merkeAuswahl() {
    try {
      const key = 'tinyband-ich-' + this.raum;
      if (!this.auswahl.length) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(this.auswahl.map(sid => +sid.slice(1))));
    } catch (e) { /* privater Modus: dann eben ohne Merken */ }
  },

  name(sid) { return this.namen[+String(sid).slice(1)] || '?'; },

  /* „Batz, Timo“ → „Timo“ – in Überschriften und Anreden reicht der Vorname */
  vorname(sid) {
    const n = this.name(sid);
    const teile = n.split(',');
    return (teile.length > 1 ? teile[1] : teile[0]).trim();
  },

  pfad(rest) { return `${window.FB.WURZEL}/${this.raum}/${rest}`; },

  /* ---------- Ereignisse ---------- */
  bindeEreignisse() {
    const an = (id, f, art = 'click') => document.getElementById(id).addEventListener(art, f);
    an('tb-suche', () => this.zeichneNamen(), 'input');
    an('tb-weiter', () => {
      if (!this.auswahl.length) return;
      this.picker = false;
      document.getElementById('tb-suche').value = '';
      this.zeichne();
    });
    an('tb-anderer', () => { this.picker = true; this.zeichne(); });
    an('tb-inst-zurueck', () => this.zurueck());
    an('tb-band-zurueck', () => {
      if (this.bandWechsel) this.bandWechsel = false; else this.picker = true;
      this.zeichne();
    });
    an('tb-neue-band', e => {
      e.preventDefault();
      const feld = document.getElementById('tb-bandname');
      const name = feld.value.trim().slice(0, 40);
      if (!name) { feld.focus(); return; }
      feld.blur();
      this.gruende(name).then(ok => { if (ok) feld.value = ''; });
    }, 'submit');
  },

  /* Zurück aus der Instrumentwahl: eine Stufe weiter vorn weitermachen */
  zurueck() {
    const b = this.bearbeite;
    if (this.modus === 'A') {
      const offen = b || this.naechsteWahlA();
      if (offen && offen.stufe === 'zweit') { this.bearbeite = { sid: offen.sid, stufe: 'erst', zurueck: true }; }
      else { this.bearbeite = null; this.picker = true; }
    } else if (b) {
      this.bearbeite = null;
    } else {
      this.bandWechsel = true;
    }
    this.zeichne();
  },

  /* ---------- Firebase ---------- */
  starte() {
    if (!window.FB.bereit) { this.zeigeFehler('Die Datenbank ist nicht erreichbar.'); return; }
    const { db, ref, onValue } = window.FB;
    const fehler = err => {
      const code = ((err && (err.code || err.message)) || '').toString().toUpperCase();
      this.zeigeFehler(code.includes('PERMISSION_DENIED')
        ? 'Tiny Band ist noch nicht freigeschaltet. Bitte sag deiner Lehrkraft Bescheid.'
        : 'Die Daten können gerade nicht geladen werden. Versuch es in einem Moment noch einmal.');
    };
    // Lebt der Raum noch? Ein alter QR-Code führte sonst in die Sammlung von gestern.
    onValue(ref(db, this.pfad('meta')), snap => {
      this.raumLebt = !!snap.val();
      if (!this.raumLebt) {
        this.zeigeFehler('Diese Sammlung ist beendet. Bitte den aktuellen QR-Code von der Leinwand scannen.');
        return;
      }
      this.zeichne();
    }, () => {});
    onValue(ref(db, this.pfad('zuordnung')), snap => { this.zuordnung = snap.val() || {}; this.zeichne(); }, fehler);
    onValue(ref(db, this.pfad('ergebnis')), snap => { this.ergebnis = snap.val() || {}; this.zeichne(); }, fehler);
    if (this.modus === 'B') {
      onValue(ref(db, this.pfad('baende')), snap => { this.baende = snap.val() || {}; this.zeichne(); }, fehler);
    }
    this.zeichne();
  },

  melde(id, text, warnung = true) {
    const el = document.getElementById(id);
    el.textContent = text || '';
    el.classList.toggle('warnung', !!warnung);
  },

  fehlerText(err) {
    const code = ((err && (err.code || err.message)) || '').toString().toUpperCase();
    if (code.includes('PERMISSION_DENIED')) return 'Das hat die Datenbank abgelehnt. Sag bitte deiner Lehrkraft Bescheid.';
    return 'Das hat nicht geklappt – bitte noch einmal tippen.';
  },

  /* ---------- Weg A ---------- */
  naechsteWahlA() {
    for (const sid of this.auswahl) {
      const z = this.zuordnung[sid] || {};
      if (!TinyBand.gueltig(z.erst)) return { sid, stufe: 'erst' };
      if (!TinyBand.gueltig(z.zweit)) return { sid, stufe: 'zweit' };
    }
    return null;
  },

  waehleA(sid, stufe, k) {
    const alt = this.zuordnung[sid] || {};
    const neu = { erst: alt.erst, zweit: alt.zweit, ts: window.FB.serverTimestamp() };
    neu[stufe] = k;
    // Wer das Erstinstrument auf das bisherige Zweitinstrument legt, wählt das zweite neu
    if (stufe === 'erst' && neu.zweit === k) delete neu.zweit;
    if (!TinyBand.gueltig(neu.erst)) delete neu.erst;
    if (!TinyBand.gueltig(neu.zweit)) delete neu.zweit;
    // Nach dem Ändern des ersten geht es mit dem zweiten weiter, dann ist Schluss
    const war = this.bearbeite;
    this.bearbeite = stufe === 'erst' && war ? { sid, stufe: 'zweit' } : null;
    this.zuordnung[sid] = neu;                 // sofort zeigen, die Datenbank folgt
    const { db, ref, set } = window.FB;
    set(ref(db, this.pfad('zuordnung/' + sid)), neu)
      .catch(err => this.melde('tb-inst-meldung', this.fehlerText(err)));
    this.zeichne();
  },

  /* ---------- Weg B ---------- */
  bandListe() {
    return Object.entries(this.baende)
      .filter(([, b]) => b && b.name)
      .map(([id, b]) => ({ id, name: b.name, ts: b.ts || 0,
        mitglieder: Object.keys(b.mitglieder || {}), plaetze: b.plaetze || {} }))
      .sort((a, b) => a.ts - b.ts);
  },

  meineBand(sid) {
    const z = this.zuordnung[sid] || {};
    return z.band && this.baende[z.band] && this.baende[z.band].name ? z.band : null;
  },

  instVon(sid) {
    const z = this.zuordnung[sid] || {};
    return TinyBand.gueltig(z.inst) ? z.inst : '';
  },

  /* Wer belegt in einer Band welches Instrument – aus den Plätzen, die per
     Transaktion vergeben werden. Die sind die Wahrheit, zuordnung nur Abbild. */
  belegung(bandId) {
    const b = this.baende[bandId] || {};
    const raus = {};
    for (const k of TinyBand.kuerzel()) raus[k] = Object.keys((b.plaetze || {})[k] || {});
    return raus;
  },

  neueBandId() {
    return 'b' + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  },

  async gruende(name) {
    if (this.beschaeftigt) return false;
    const gleich = this.bandListe().find(b => b.name.trim().toLowerCase() === name.toLowerCase());
    if (gleich) return this.trittBei(gleich.id);      // gleicher Name = dieselbe Band
    if (this.auswahl.length > TinyBand.BANDGROESSE) {
      this.melde('tb-band-meldung', `Eine Band hat höchstens ${TinyBand.BANDGROESSE} Mitglieder.`);
      return false;
    }
    this.beschaeftigt = true;
    const { db, ref, set, serverTimestamp } = window.FB;
    const id = this.neueBandId();
    const mitglieder = Object.fromEntries(this.auswahl.map(sid => [sid, true]));
    try {
      await set(ref(db, this.pfad('baende/' + id)), { name, ts: serverTimestamp(), mitglieder });
      await this.umziehen(id);
      this.melde('tb-band-meldung', '');
      return true;
    } catch (err) {
      this.melde('tb-band-meldung', this.fehlerText(err));
      return false;
    } finally {
      this.beschaeftigt = false;
      this.zeichne();
    }
  },

  /* Beitreten per Transaktion: Firebase gibt die aktuelle Mitgliederliste,
     und wenn die Band inzwischen voll ist, wird abgebrochen. */
  async trittBei(bandId) {
    if (this.beschaeftigt) return false;
    this.beschaeftigt = true;
    const { db, ref, runTransaction } = window.FB;
    const neu = this.auswahl.slice();
    try {
      const res = await runTransaction(ref(db, this.pfad(`baende/${bandId}/mitglieder`)), cur => {
        const liste = Object.assign({}, cur || {});
        const dazu = neu.filter(sid => !liste[sid]);
        if (Object.keys(liste).length + dazu.length > TinyBand.BANDGROESSE) return;   // voll: abbrechen
        dazu.forEach(sid => { liste[sid] = true; });
        return liste;
      });
      if (!res.committed) {
        // Der Stand aus der Transaktion ist aktueller als die eigene Anzeige
        const jetzt = (res.snapshot && res.snapshot.val()) || {};
        const frei = TinyBand.BANDGROESSE - Object.keys(jetzt).length;
        this.melde('tb-band-meldung', frei > 0
          ? `Da ist nur noch Platz für ${frei}.`
          : 'Diese Band ist gerade voll geworden.');
        return false;
      }
      await this.umziehen(bandId);
      this.melde('tb-band-meldung', '');
      return true;
    } catch (err) {
      this.melde('tb-band-meldung', this.fehlerText(err));
      return false;
    } finally {
      this.beschaeftigt = false;
      this.zeichne();
    }
  },

  /* Nach dem Eintritt: alte Band(s) verlassen, Plätze dort freigeben,
     Zuordnung schreiben, eine leer gewordene Band aufräumen. */
  async umziehen(bandId) {
    const { db, ref, update, runTransaction, serverTimestamp } = window.FB;
    const aenderungen = {};
    const alte = new Set();
    for (const sid of this.auswahl) {
      const alt = (this.zuordnung[sid] || {}).band;
      if (alt && alt !== bandId && this.baende[alt]) {
        alte.add(alt);
        aenderungen[`baende/${alt}/mitglieder/${sid}`] = null;
        for (const k of TinyBand.kuerzel()) aenderungen[`baende/${alt}/plaetze/${k}/${sid}`] = null;
      }
      const behalten = alt === bandId ? this.instVon(sid) : '';
      aenderungen[`zuordnung/${sid}`] = behalten
        ? { band: bandId, inst: behalten, ts: serverTimestamp() }
        : { band: bandId, ts: serverTimestamp() };
    }
    await update(ref(db, `${window.FB.WURZEL}/${this.raum}`), aenderungen);
    this.bandWechsel = false;
    for (const alt of alte) {
      runTransaction(ref(db, this.pfad('baende/' + alt)), cur => {
        if (cur && cur.mitglieder && Object.keys(cur.mitglieder).length) return cur;
        return null;
      }).catch(() => { /* Aufräumen ist nicht wichtig genug für eine Meldung */ });
    }
  },

  /* Ein Instrument in der eigenen Band belegen. Die Transaktion läuft auf
     baende/<band>/plaetze/<kürzel>: Tippen zwei Kinder gleichzeitig auf Drums,
     gewinnt eines, beim anderen bricht sie ab und die Karte wird grau. */
  async waehleB(sid, k) {
    if (this.beschaeftigt) return;
    const bandId = this.meineBand(sid);
    const i = TinyBand.inst(k);
    if (!bandId || !i) return;
    this.beschaeftigt = true;
    this.melde('tb-inst-meldung', '');
    const { db, ref, runTransaction, update, serverTimestamp } = window.FB;
    const alt = this.instVon(sid);
    try {
      const res = await runTransaction(ref(db, this.pfad(`baende/${bandId}/plaetze/${k}`)), cur => {
        const plaetze = Object.assign({}, cur || {});
        if (plaetze[sid]) return plaetze;
        if (Object.keys(plaetze).length >= i.max) return;      // belegt: abbrechen
        plaetze[sid] = true;
        return plaetze;
      });
      if (!res.committed) {
        this.melde('tb-inst-meldung', `${i.name} ist in eurer Band schon vergeben – such dir etwas anderes aus.`);
        return;
      }
      const aenderungen = { [`zuordnung/${sid}`]: { band: bandId, inst: k, ts: serverTimestamp() } };
      if (alt && alt !== k) aenderungen[`baende/${bandId}/plaetze/${alt}/${sid}`] = null;
      await update(ref(db, `${window.FB.WURZEL}/${this.raum}`), aenderungen);
      this.bearbeite = null;
    } catch (err) {
      this.melde('tb-inst-meldung', this.fehlerText(err));
    } finally {
      this.beschaeftigt = false;
      this.zeichne();
    }
  },

  /* ---------- Welcher Schirm? ---------- */
  meineErgebnisse() {
    return this.auswahl.filter(sid => this.ergebnis[sid] && this.ergebnis[sid].band);
  },

  welcherSchirm() {
    if (!this.auswahl.length || this.picker) return 'wer';
    if (this.meineErgebnisse().length) return 'ergebnis';
    if (this.modus === 'A') {
      return this.bearbeite || this.naechsteWahlA() ? 'instrument' : 'fertig';
    }
    // Ein Gerät, eine Band: Stehen die Namen in verschiedenen Bands, erst zusammenführen
    const baende = new Set(this.auswahl.map(sid => this.meineBand(sid)));
    if (this.bandWechsel || baende.has(null) || baende.size > 1) return 'band';
    if (this.bearbeite || this.auswahl.some(sid => !this.instVon(sid))) return 'instrument';
    return 'fertig';
  },

  zeigeFehler(text) {
    if (text) document.getElementById('tb-fehler-text').textContent = text;
    this.zeigeSchirm('fehler');
    document.getElementById('tb-schritte').innerHTML = '';
  },

  zeigeSchirm(id) {
    const neu = id !== this.schirm;
    for (const s of document.querySelectorAll('.tb-schirm')) {
      const an = s.id === 'tb-' + id;
      s.hidden = !an;
      if (an && neu) {
        s.classList.remove('tb-rein');
        void s.offsetWidth;                   // Animation neu anstoßen
        s.classList.add('tb-rein');
      }
    }
    // Die Sonne geht nur am Anfang auf
    document.body.classList.toggle('mit-sonne', id === 'wer' || id === 'fehler');
    if (neu) window.scrollTo({ top: 0 });
    this.schirm = id;
  },

  /* Schritt-Leiste mit dem Diamanten beim aktuellen Schritt */
  zeichneSchritte(schirm) {
    const stufen = this.modus === 'A'
      ? ['Name', 'Erstinstrument', 'Zweitinstrument', 'Fertig']
      : ['Name', 'Band', 'Instrument', 'Fertig'];
    let jetzt = 0;
    if (schirm === 'instrument') {
      jetzt = this.modus === 'A' ? ((this.bearbeite || this.naechsteWahlA() || {}).stufe === 'zweit' ? 2 : 1) : 2;
    } else if (schirm === 'band') jetzt = 1;
    else if (schirm === 'fertig' || schirm === 'ergebnis') jetzt = 3;
    const ol = document.getElementById('tb-schritte');
    ol.innerHTML = stufen.map((s, n) =>
      `<li class="${n < jetzt ? 'erledigt' : n === jetzt ? 'jetzt' : ''}"${n === jetzt ? ' aria-current="step"' : ''}>` +
      `<span class="tb-raute"></span><span>${s}</span></li>`).join('');
  },

  zeigeRaumzeile() {
    const el = document.getElementById('tb-raumzeile');
    el.innerHTML = '';
    const links = document.createElement('span');
    links.textContent = this.klasse;
    const rechts = document.createElement('span');
    rechts.className = 'tb-code';
    rechts.textContent = this.raum;
    el.append(links, rechts);
    el.hidden = false;
  },

  zeichne() {
    if (!this.raum || this.raumLebt === false) return;
    this.zeigeRaumzeile();
    const schirm = this.welcherSchirm();
    this.zeichneSchritte(schirm);
    if (schirm === 'wer') this.zeichneNamen();
    else if (schirm === 'instrument') this.zeichneInstrumente();
    else if (schirm === 'band') this.zeichneBaende();
    else if (schirm === 'fertig') this.zeichneFertig();
    else if (schirm === 'ergebnis') this.zeichneErgebnis();
    this.zeigeSchirm(schirm);
  },

  /* ---------- Schritt 1: Namen ---------- */
  zeichneNamen() {
    const box = document.getElementById('tb-namen');
    const suche = document.getElementById('tb-suche').value.trim().toLowerCase();
    document.getElementById('tb-wer-titel').textContent = this.auswahl.length ? 'Wer ist noch dabei?' : 'Wer bist du?';
    document.getElementById('tb-wer-info').textContent = this.auswahl.length
      ? 'Teilt ihr euch das iPad? Tippt alle eure Namen an. Nochmal tippen nimmt einen wieder heraus.'
      : 'Tippe deinen Namen an. Teilt ihr euch ein iPad, tippt alle ihre Namen an.';
    box.innerHTML = '';
    this.namen.forEach((name, i) => {
      if (suche && !name.toLowerCase().includes(suche)) return;
      const sid = 's' + i;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb-name';
      const gewaehlt = this.auswahl.includes(sid);
      b.classList.toggle('gewaehlt', gewaehlt);
      b.setAttribute('aria-pressed', gewaehlt ? 'true' : 'false');
      b.innerHTML = '<span class="tb-haken" aria-hidden="true"></span>';
      const n = document.createElement('span');
      n.textContent = name;
      b.appendChild(n);
      // Wer schon gewählt hat, bekommt einen kleinen Hinweis – hilft gegen Fehlgriffe
      const z = this.zuordnung[sid];
      const schon = this.modus === 'A'
        ? (z && TinyBand.gueltig(z.erst) ? TinyBand.name(z.erst) : '')
        : (this.meineBand(sid) ? this.baende[this.meineBand(sid)].name : '');
      if (schon) {
        const tag = document.createElement('span');
        tag.className = 'tb-schon';
        tag.textContent = schon;
        b.appendChild(tag);
      }
      b.addEventListener('click', () => {
        const pos = this.auswahl.indexOf(sid);
        if (pos >= 0) this.auswahl.splice(pos, 1); else this.auswahl.push(sid);
        this.merkeAuswahl();
        this.zeichne();
      });
      box.appendChild(b);
    });
    if (!box.children.length) box.innerHTML = '<p class="tb-neben">Kein Name passt zur Suche.</p>';

    const leiste = document.getElementById('tb-weiter-leiste');
    leiste.hidden = !this.auswahl.length;
    const namen = this.auswahl.map(sid => this.vorname(sid));
    document.getElementById('tb-weiter-text').textContent =
      namen.length > 1 ? `${namen.length} dabei: ${namen.join(', ')}` : namen.join('');
    document.getElementById('tb-weiter').textContent = namen.length > 1 ? 'Weiter mit allen' : 'Weiter';
  },

  /* ---------- Instrumentkarten ---------- */
  zeichneInstrumente() {
    let sid, stufe;
    if (this.modus === 'A') {
      ({ sid, stufe } = this.bearbeite || this.naechsteWahlA());
    } else {
      sid = this.bearbeite ? this.bearbeite.sid : this.auswahl.find(s => !this.instVon(s));
      stufe = 'inst';
    }
    const z = this.zuordnung[sid] || {};
    document.getElementById('tb-inst-fuer').textContent = this.auswahl.length > 1 ? `Für ${this.vorname(sid)}` : '';
    document.getElementById('tb-inst-titel').textContent =
      stufe === 'erst' ? 'Dein Erstinstrument' : stufe === 'zweit' ? 'Dein Zweitinstrument' : 'Dein Instrument';
    const info = document.getElementById('tb-inst-info');
    let belegt = {};
    if (stufe === 'erst') info.textContent = 'Was würdest du am liebsten spielen?';
    else if (stufe === 'zweit') info.textContent = 'Und wenn das nicht klappt – was wäre deine zweite Wahl?';
    else {
      const bandId = this.meineBand(sid);
      belegt = this.belegung(bandId);
      info.textContent = `In „${this.baende[bandId].name}“. Grau heißt: schon vergeben.`;
    }

    const box = document.getElementById('tb-karten');
    box.innerHTML = '';
    for (const i of TinyBand.INSTRUMENTE) {
      const karte = document.createElement('button');
      karte.type = 'button';
      karte.className = 'tb-inst';
      karte.style.setProperty('--tb-farbe', i.farbe);
      let gewaehlt = false, aus = false, notiz = '';
      if (stufe === 'erst') gewaehlt = z.erst === i.k;
      else if (stufe === 'zweit') {
        gewaehlt = z.zweit === i.k;
        aus = z.erst === i.k;
        if (aus) notiz = 'dein Erstinstrument';
      } else {
        const wer = belegt[i.k] || [];
        gewaehlt = wer.includes(sid);
        aus = !gewaehlt && wer.length >= i.max;
        if (wer.length) notiz = wer.map(s => this.vorname(s)).join(', ');
        else if (i.min) notiz = 'fehlt noch';
      }
      karte.classList.toggle('gewaehlt', gewaehlt);
      karte.disabled = aus;
      karte.setAttribute('aria-pressed', gewaehlt ? 'true' : 'false');
      karte.innerHTML =
        `<span class="tb-haken" aria-hidden="true"></span>` +
        `<span class="tb-kreis">${TinyBand.icon(i.k)}</span>` +
        `<span class="tb-inst-name"></span><span class="tb-inst-unter"></span>` +
        TinyBand.punkte(i.anspruch) + `<span class="tb-inst-notiz"></span>`;
      karte.querySelector('.tb-inst-name').textContent = i.name;
      karte.querySelector('.tb-inst-unter').textContent = i.unter;
      karte.querySelector('.tb-inst-notiz').textContent = notiz;
      karte.addEventListener('click', () => {
        if (this.modus === 'A') this.waehleA(sid, stufe, i.k);
        else this.waehleB(sid, i.k);
      });
      box.appendChild(karte);
    }
    // Zurück ergibt nur Sinn, wenn es ein Vorher gibt
    document.getElementById('tb-inst-zurueck').textContent =
      this.bearbeite && this.modus === 'B' ? 'Abbrechen' : 'Zurück';
  },

  /* ---------- Weg B: Bands ---------- */
  zeichneBaende() {
    const wir = this.auswahl.length > 1;
    document.getElementById('tb-band-fuer').textContent = wir
      ? this.auswahl.map(sid => this.vorname(sid)).join(', ') : '';
    document.getElementById('tb-band-info').textContent = (wir ? 'Tretet' : 'Tritt') +
      ` einer Band bei oder ${wir ? 'gründet' : 'gründe'} eine neue. Eine Band hat höchstens ${TinyBand.BANDGROESSE} Mitglieder.`;
    const getrennt = new Set(this.auswahl.map(sid => this.meineBand(sid)).filter(Boolean)).size > 1;
    if (getrennt) this.melde('tb-band-meldung', 'Ihr steht in verschiedenen Bands – tippt die an, in der ihr alle zusammen spielen wollt.', false);
    const box = document.getElementById('tb-bandliste');
    box.innerHTML = '';
    const liste = this.bandListe();
    const meine = this.meineBand(this.auswahl[0]);
    if (!liste.length) {
      box.innerHTML = '<p class="tb-neben">Noch gibt es keine Band – gründet unten die erste!</p>';
    }
    for (const b of liste) {
      const neu = this.auswahl.filter(sid => !b.mitglieder.includes(sid)).length;
      const voll = b.mitglieder.length + neu > TinyBand.BANDGROESSE && neu > 0;
      const drin = b.id === meine && !neu;
      const karte = document.createElement('button');
      karte.type = 'button';
      karte.className = 'tb-karte tb-bandwahl' + (drin ? ' gewaehlt' : '');
      karte.disabled = voll;
      const besetzung = {};
      Object.entries(b.plaetze).forEach(([k, wer]) => { besetzung[k] = Object.keys(wer || {}).length; });
      karte.innerHTML = `<span class="tb-haken" aria-hidden="true"></span>` +
        `<span class="tb-bandname"></span><span class="tb-zahl">${b.mitglieder.length}/${TinyBand.BANDGROESSE}</span>` +
        `<span class="tb-mini-besetzung">${TinyBand.INSTRUMENTE.map(i =>
          `<span class="tb-mini${besetzung[i.k] ? ' da' : ''}" style="--tb-farbe:${i.farbe}" title="${i.name}">` +
          `${TinyBand.icon(i.k)}</span>`).join('')}</span>` +
        `<span class="tb-mitglieder"></span>`;
      karte.querySelector('.tb-bandname').textContent = b.name;
      karte.querySelector('.tb-mitglieder').textContent = voll ? 'voll' :
        b.mitglieder.map(sid => this.vorname(sid)).join(', ');
      karte.addEventListener('click', () => {
        if (drin) { this.bandWechsel = false; this.zeichne(); return; }
        this.trittBei(b.id);
      });
      box.appendChild(karte);
    }
    document.getElementById('tb-band-zurueck').textContent = this.bandWechsel ? 'Abbrechen' : 'Zurück';
  },

  /* ---------- Fertig ---------- */
  zeichneFertig() {
    const wir = this.auswahl.length > 1;
    const box = document.getElementById('tb-fertig-inhalt');
    box.innerHTML = '';
    if (this.modus === 'A') {
      document.getElementById('tb-fertig-titel').textContent = wir ? 'Eure Wahl ist gespeichert' : 'Deine Wahl ist gespeichert';
      document.getElementById('tb-fertig-info').textContent =
        'Deine Lehrkraft bildet daraus die Bands. Das Ergebnis erscheint dann hier.';
      for (const sid of this.auswahl) {
        const z = this.zuordnung[sid] || {};
        const karte = document.createElement('div');
        karte.className = 'tb-karte tb-wahlkarte';
        const kopf = document.createElement('div');
        kopf.className = 'tb-wahl-kopf';
        const n = document.createElement('strong');
        n.textContent = this.name(sid);
        const aendern = document.createElement('button');
        aendern.type = 'button';
        aendern.className = 'tb-knopf leise klein';
        aendern.textContent = 'ändern';
        aendern.addEventListener('click', () => { this.bearbeite = { sid, stufe: 'erst' }; this.zeichne(); });
        kopf.append(n, aendern);
        karte.appendChild(kopf);
        karte.insertAdjacentHTML('beforeend',
          this.wahlZeile('1. Wahl', z.erst) + this.wahlZeile('2. Wahl', z.zweit));
        box.appendChild(karte);
      }
    } else {
      const bandId = this.meineBand(this.auswahl[0]);
      const b = this.baende[bandId] || {};
      const belegt = this.belegung(bandId);
      document.getElementById('tb-fertig-titel').textContent = b.name || 'Eure Band';
      const mitglieder = Object.keys(b.mitglieder || {});
      const anzahl = {};
      for (const k of TinyBand.kuerzel()) anzahl[k] = belegt[k].length;
      const fehlt = TinyBand.fehlt(anzahl);
      document.getElementById('tb-fertig-info').textContent =
        `${mitglieder.length} von ${TinyBand.BANDGROESSE} Plätzen besetzt.`;
      if (fehlt.length) {
        const hinweis = document.createElement('div');
        hinweis.className = 'tb-hinweis';
        hinweis.textContent = 'Euch fehlt noch: ' + fehlt.map(i => i.name).join(', ');
        box.appendChild(hinweis);
      }
      const karte = document.createElement('div');
      karte.className = 'tb-karte tb-besetzungskarte';
      const ul = document.createElement('ul');
      ul.className = 'tb-besetzung gross';
      for (const i of TinyBand.INSTRUMENTE) {
        const wer = belegt[i.k];
        if (!wer.length && !i.min) continue;
        const li = document.createElement('li');
        li.style.setProperty('--tb-farbe', i.farbe);
        li.className = wer.length ? '' : 'tb-fehlt';
        li.innerHTML = `<span class="tb-kreis klein">${TinyBand.icon(i.k)}</span><span class="tb-inst-name"></span><span class="tb-wer"></span>`;
        li.querySelector('.tb-inst-name').textContent = i.name;
        li.querySelector('.tb-wer').textContent = wer.length ? wer.map(s => this.vorname(s)).join(', ') : 'fehlt noch';
        ul.appendChild(li);
      }
      const ohne = mitglieder.filter(sid => !this.instVon(sid));
      if (ohne.length) {
        const li = document.createElement('li');
        li.className = 'tb-ohne';
        li.textContent = 'Wählen noch: ' + ohne.map(s => this.vorname(s)).join(', ');
        ul.appendChild(li);
      }
      karte.appendChild(ul);
      box.appendChild(karte);

      const knoepfe = document.createElement('div');
      knoepfe.className = 'tb-knopfreihe';
      for (const sid of this.auswahl) {
        const k = document.createElement('button');
        k.type = 'button';
        k.className = 'tb-knopf';
        k.textContent = wir ? `Instrument ändern: ${this.vorname(sid)}` : 'Instrument ändern';
        k.addEventListener('click', () => { this.bearbeite = { sid, stufe: 'inst' }; this.melde('tb-inst-meldung', ''); this.zeichne(); });
        knoepfe.appendChild(k);
      }
      const wechsel = document.createElement('button');
      wechsel.type = 'button';
      wechsel.className = 'tb-knopf leise';
      wechsel.textContent = 'Band wechseln';
      wechsel.addEventListener('click', () => { this.bandWechsel = true; this.melde('tb-band-meldung', ''); this.zeichne(); });
      knoepfe.appendChild(wechsel);
      box.appendChild(knoepfe);
    }
  },

  wahlZeile(titel, k) {
    const i = TinyBand.inst(k);
    if (!i) return `<div class="tb-wahl"><span class="tb-label">${titel}</span><span class="tb-neben">noch offen</span></div>`;
    return `<div class="tb-wahl" style="--tb-farbe:${i.farbe}"><span class="tb-label">${titel}</span>` +
      `<span class="tb-kreis klein">${TinyBand.icon(i.k)}</span><strong>${i.name}</strong>${TinyBand.punkte(i.anspruch)}</div>`;
  },

  /* ---------- Ergebnis ---------- */
  zeichneErgebnis() {
    const meine = this.meineErgebnisse();
    document.getElementById('tb-ergebnis-titel').textContent = meine.length > 1 ? 'Eure Bands stehen!' : 'Deine Band steht!';
    const box = document.getElementById('tb-ergebnis-inhalt');
    box.innerHTML = '';
    const alle = Object.entries(this.ergebnis);
    for (const sid of meine) {
      const e = this.ergebnis[sid];
      const i = TinyBand.inst(e.inst);
      const karte = document.createElement('div');
      karte.className = 'tb-ergebnis';
      if (i) karte.style.setProperty('--tb-farbe', i.farbe);
      const bandmates = alle.filter(([s, x]) => x.band === e.band && s !== sid)
        .map(([s, x]) => `${this.vorname(s)}${TinyBand.inst(x.inst) ? ' (' + TinyBand.name(x.inst) + ')' : ''}`);
      const experten = i ? alle.filter(([s, x]) => x.inst === e.inst && s !== sid).map(([s]) => this.vorname(s)) : [];
      karte.innerHTML = `
        <div class="tb-ergebnis-name"></div>
        <div class="tb-feld"><div class="tb-label">Deine Band</div><div class="tb-gross tb-e-band"></div>
          <div class="tb-neben tb-e-mit"></div></div>
        <div class="tb-feld tb-e-inst"><div class="tb-label">Dein Instrument</div>
          ${i ? `<div class="tb-inst-zeile"><span class="tb-kreis">${TinyBand.icon(i.k)}</span>
            <span><span class="tb-gross"></span>${i.unter ? '<span class="tb-neben tb-e-unter"></span>' : ''}</span>
            ${TinyBand.punkte(i.anspruch)}</div>` : '<div class="tb-neben">noch offen – frag deine Lehrkraft</div>'}</div>
        <div class="tb-feld"><div class="tb-label">Deine Expertengruppe</div>
          <div class="tb-mittel tb-e-experten"></div><div class="tb-neben tb-e-expmit"></div></div>`;
      karte.querySelector('.tb-ergebnis-name').textContent = this.name(sid);
      karte.querySelector('.tb-e-band').textContent = e.band;
      karte.querySelector('.tb-e-mit').textContent = bandmates.length ? 'mit ' + bandmates.join(', ') : '';
      if (i) {
        karte.querySelector('.tb-inst-zeile .tb-gross').textContent = i.name;
        if (i.unter) karte.querySelector('.tb-e-unter').textContent = i.unter;
      }
      karte.querySelector('.tb-e-experten').textContent = i ? `Alle mit ${i.name}` : '–';
      karte.querySelector('.tb-e-expmit').textContent = experten.length ? 'zusammen mit ' + experten.join(', ') : '';
      box.appendChild(karte);
    }
  },
};

document.addEventListener('DOMContentLoaded', () => TB.init());
