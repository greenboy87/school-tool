/* Schülerseite der Exen (ex.html?s=<code>).

   Das iPad meldet sich anonym bei Firebase an und schreibt nur seinen eigenen
   Eintrag: Nummer, Status „wartet“ und ob Notenschutz angefragt ist. Namen gibt
   es hier keine – nur Nummern.

   Was angezeigt wird, folgt allein aus dem Sitzungsstatus (info/status) und dem
   eigenen Teilnehmer-Eintrag. Deshalb landet ein neu geladenes iPad von selbst
   wieder an der richtigen Stelle. */
const ExSchueler = {
  code: null,
  uid: null,
  info: undefined,        // undefined = noch nicht geladen, null = gibt es nicht
  ich: undefined,         // eigener Teilnehmer-Eintrag
  gewaehlt: null,         // Nummer im Raster
  nummerWaehlen: false,   // „Andere Nummer wählen“ gedrückt
  abmelden: [],

  init() {
    this.code = this.codeAusAdresse();
    document.getElementById('code-form').addEventListener('submit', e => { e.preventDefault(); this.codeEingegeben(); });
    document.getElementById('btn-beitreten').addEventListener('click', () => this.beitreten());
    document.getElementById('btn-andere-nummer').addEventListener('click', () => { this.nummerWaehlen = true; this.zeigen(); });
    document.getElementById('nummern').addEventListener('click', e => {
      const b = e.target.closest('button[data-nr]');
      if (b) { this.gewaehlt = b.dataset.nr; this.rasterMarkieren(); }
    });
    if (window.FB) this.verbinden();
    else window.addEventListener('fb-bereit', () => this.verbinden(), { once: true });
    setTimeout(() => {
      if (!this.uid) this.meldung('Keine Verbindung', 'Die Ex-Datenbank ist nicht erreichbar. Bist du im WLAN?');
    }, 10000);
  },

  codeAusAdresse() {
    const c = new URLSearchParams(location.search).get('s');
    return c && /^[1-9][0-9]{5}$/.test(c) ? c : null;
  },

  ref(rest) { return FB.ref(FB.db, `schoolTool/exsessions/${this.code}/${rest}`); },
  merkKey() { return 'ex-sitzung-' + this.code; },

  /* ---------- Anmelden ---------- */
  verbinden() {
    if (!FB.bereit) { this.meldung('Keine Verbindung', FB.fehler); return; }
    FB.beiAnmeldung(async u => {
      if (!u) {
        try { await FB.anonymAnmelden(); }
        catch (e) { this.meldung('Anmeldung nicht möglich', e.message); }
        return;
      }
      if (this.uid === u.uid) return;
      this.uid = u.uid;
      this.starten();
    });
  },

  starten() {
    this.abmelden.forEach(f => f());
    this.abmelden = [];
    if (!this.code) { this.zeigeNur('s-code'); document.getElementById('code-feld').focus(); return; }
    document.getElementById('ex-kopf-code').textContent = 'Code ' + this.code;
    this.info = undefined;
    this.ich = undefined;
    this.abmelden.push(FB.onValue(this.ref('info'), snap => { this.info = snap.val(); this.zeigen(); },
      () => { this.info = null; this.zeigen(); }));
    this.abmelden.push(FB.onValue(this.ref('teilnehmer/' + this.uid), snap => { this.ich = snap.val(); this.zeigen(); },
      () => { this.ich = null; this.zeigen(); }));
  },

  codeEingegeben() {
    const c = document.getElementById('code-feld').value.trim();
    if (!/^[1-9][0-9]{5}$/.test(c)) {
      document.getElementById('code-fehler').textContent = 'Der Code hat sechs Ziffern.';
      return;
    }
    history.replaceState(null, '', '?s=' + c);
    this.code = c;
    this.starten();
  },

  /* ---------- Was gerade zu sehen ist ---------- */
  zeigen() {
    if (this.info === undefined || this.ich === undefined) return;
    const i = this.info, ich = this.ich;
    if (!i) {
      this.meldung('Code ungültig', 'Zu diesem Code gibt es keine Ex. Scanne den QR-Code noch einmal oder frag deine Lehrkraft.');
      return;
    }
    const kopf = document.getElementById('ex-kopfzeile');
    kopf.hidden = false;
    document.getElementById('ex-kopf-titel').textContent = `${i.klasse} · ${i.exNummer}. ${i.art || 'Ex'}`;

    if (!ich || (this.nummerWaehlen && ich.status === 'wartet')) {
      if (i.status === 'beendet') { this.meldung('Die Ex ist beendet', 'Hier kann man nicht mehr beitreten.'); return; }
      this.rasterZeigen();
      return;
    }
    const nr = ich.nummer;
    switch (ich.status) {
      case 'wartet':
        this.warten(nr, 'Deine Lehrkraft gibt dich gleich frei. Lass diese Seite offen.');
        break;
      case 'freigegeben':
        if (i.status === 'warteraum') this.warten(nr, 'Du bist freigegeben. Gleich geht es los – lass diese Seite offen.');
        else this.schreiben();
        break;
      case 'entfernt':
        this.meldung('Du wurdest abgemeldet', 'Deine Lehrkraft hat dich aus der Ex genommen. Melde dich bei ihr.');
        break;
      case 'fehlt':
        this.meldung('Als fehlend eingetragen', 'Deine Lehrkraft hat dich als fehlend markiert. Melde dich bei ihr.');
        break;
      case 'ersetzt':
        this.meldung('Auf anderem Gerät', 'Deine Ex läuft inzwischen auf einem anderen Gerät weiter.');
        break;
      default:
        this.meldung('Unbekannter Zustand', String(ich.status));
    }
  },

  zeigeNur(id) {
    ['s-laden', 's-code', 's-nummer', 's-warten', 's-meldung'].forEach(s => {
      document.getElementById(s).hidden = s !== id;
    });
  },

  meldung(titel, text) {
    document.getElementById('meldung-titel').textContent = titel;
    document.getElementById('meldung-text').textContent = text || '';
    this.zeigeNur('s-meldung');
  },

  warten(nr, text) {
    this.nummerWaehlen = false;
    document.getElementById('warten-nr').textContent = nr;
    document.getElementById('warten-text').textContent = text;
    const ich = this.ich;
    document.getElementById('warten-ns').textContent = ich.notenschutz ? 'Notenschutz ist bestätigt.'
      : ich.notenschutzAngefragt ? 'Notenschutz angefragt – deine Lehrkraft bestätigt ihn noch.' : '';
    document.getElementById('btn-andere-nummer').hidden = ich.status !== 'wartet';
    this.zeigeNur('s-warten');
  },

  /* ---------- Nummer wählen und beitreten ---------- */
  rasterZeigen() {
    const i = this.info;
    const nummern = Object.keys(i.erlaubt || {}).map(k => k.slice(1)).sort((a, b) => a - b);
    const box = document.getElementById('nummern');
    const signatur = nummern.join(',');
    if (box.dataset.signatur !== signatur) {
      box.innerHTML = nummern.map(n => `<button type="button" data-nr="${n}">${n}</button>`).join('');
      box.dataset.signatur = signatur;
    }
    if (this.gewaehlt == null) {
      const gemerkt = this.gemerkt();
      if (this.ich) this.gewaehlt = this.ich.nummer;
      else if (gemerkt.nummer && nummern.includes(gemerkt.nummer)) this.gewaehlt = gemerkt.nummer;
      document.getElementById('notenschutz-schalter').checked =
        this.ich ? !!this.ich.notenschutzAngefragt : !!gemerkt.notenschutz;
    }
    this.rasterMarkieren();
    document.getElementById('nummer-fehler').textContent = i.status === 'laeuft'
      ? 'Die Ex läuft schon. Wähle deine Nummer – deine Lehrkraft holt dich dazu.' : '';
    this.zeigeNur('s-nummer');
  },

  rasterMarkieren() {
    document.querySelectorAll('#nummern button').forEach(b =>
      b.classList.toggle('gewaehlt', b.dataset.nr === this.gewaehlt));
    document.getElementById('btn-beitreten').disabled = !this.gewaehlt;
  },

  gemerkt() {
    try { return JSON.parse(localStorage.getItem(this.merkKey())) || {}; } catch (e) { return {}; }
  },

  async beitreten() {
    const nr = this.gewaehlt;
    if (!nr) return;
    if (!confirm(`Du bist Nummer ${nr}?`)) return;
    const notenschutz = document.getElementById('notenschutz-schalter').checked;
    const knopf = document.getElementById('btn-beitreten');
    knopf.disabled = true;
    try {
      // update statt set: Ein von der Lehrkraft schon bestätigter Notenschutz bleibt stehen
      await FB.update(this.ref('teilnehmer/' + this.uid), {
        nummer: nr, status: 'wartet', notenschutzAngefragt: notenschutz, ts: FB.serverTimestamp(),
      });
      try { localStorage.setItem(this.merkKey(), JSON.stringify({ nummer: nr, notenschutz })); } catch (e) {}
      this.nummerWaehlen = false;
    } catch (e) {
      document.getElementById('nummer-fehler').textContent =
        'Das hat die Datenbank abgelehnt. Vielleicht ist die Ex schon beendet oder du wurdest abgemeldet.';
    } finally {
      knopf.disabled = false;
    }
  },

  /* ---------- Ex schreiben (Schritt 5) ---------- */
  schreiben() {
    this.meldung('Die Ex beginnt …', 'Einen Moment.');
  },
};

ExSchueler.init();
