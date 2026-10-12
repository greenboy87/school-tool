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
    document.getElementById('ex-kopf-titel').textContent = `${i.klasse} · ${i.exNummer}. ${i.art || 'Ex'}${i.nachschreiben ? ' · Nachschreiben' : ''}`;

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
        else if (i.status === 'laeuft') this.schreiben();
        else this.beenden('beendet', 'Die Ex ist beendet', 'Deine Antworten sind gespeichert. Du kannst das iPad weglegen.');
        break;
      case 'entfernt':
        this.beenden('entfernt', 'Du wurdest abgemeldet', 'Deine Lehrkraft hat dich aus der Ex genommen. Melde dich bei ihr.');
        break;
      case 'fehlt':
        this.meldung('Als fehlend eingetragen', 'Deine Lehrkraft hat dich als fehlend markiert. Melde dich bei ihr.');
        break;
      case 'ersetzt':
        this.beenden('entfernt', 'Auf anderem Gerät', 'Deine Ex läuft inzwischen auf einem anderen Gerät weiter.');
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

  /* ---------- Ex schreiben ----------
     Die Schülerfassung läuft in einem abgeschotteten iframe (nur allow-scripts,
     kein allow-same-origin): Sie sieht weder Firebase noch diese Seite und
     spricht nur über postMessage nach docs/ex/ex-format.md, Abschnitt 3. */
  SPEICHERN_MS: 1500,     // Antworten höchstens so oft in die Datenbank
  rahmen: null,           // { iframe, bereit, abgegeben, … } solange die Ex offen ist
  offset: 0,              // Serverzeit minus iPad-Uhr (.info/serverTimeOffset)

  jetzt() { return Date.now() + this.offset; },
  abgabeRef() { return this.ref('abgaben/' + this.uid); },
  lokalKey() { return `ex-antworten-${this.code}-${this.uid}`; },

  async schreiben() {
    if (this.rahmen) { this.rahmenAbgleichen(); return; }
    this.rahmen = { laedt: true };
    this.meldung('Die Ex wird geladen …', 'Einen Moment.');
    try {
      if (!this.offsetAbo) {
        this.offsetAbo = FB.onValue(FB.ref(FB.db, '.info/serverTimeOffset'), snap => { this.offset = snap.val() || 0; });
      }
      const [teile, abgabeSnap] = await Promise.all([
        FB.get(FB.ref(FB.db, `schoolTool/exen/${this.info.exId}/schueler`)),
        FB.get(this.abgabeRef()),
      ]);
      const t = teile.val();
      if (!t || !t.teile) throw new Error('Die Ex ist nicht in der Datenbank.');
      let html = '';
      for (let n = 0; n < t.teile; n++) html += t['t' + n] || '';
      if (html.length !== t.laenge) throw new Error('Die Ex kam unvollständig an. Bitte die Seite neu laden.');

      const server = abgabeSnap.val() || {};
      const lokal = this.lokalLesen();
      let antworten = null;
      try { antworten = server.antworten ? JSON.parse(server.antworten) : null; } catch (e) { antworten = null; }
      // Lokal ist neuer, wenn die letzte Speicherung die Datenbank nicht mehr erreicht hat
      if (lokal && !server.abgegeben && (!server.stand || lokal.zeit > server.stand)) antworten = lokal.antworten;

      this.rahmenBauen(html, { antworten, abgegeben: !!server.abgegeben });
      if (lokal && antworten === lokal.antworten && !server.abgegeben) this.speichernPlanen(lokal.antworten, lokal.fortschritt);
    } catch (e) {
      this.rahmen = null;
      this.meldung('Die Ex lässt sich nicht laden', e.message + ' Melde dich bei deiner Lehrkraft.');
    }
  },

  rahmenBauen(html, start) {
    const box = document.getElementById('ex-rahmen');
    box.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('title', 'Ex');
    iframe.srcdoc = html;
    box.append(iframe);
    box.hidden = false;
    document.getElementById('ex-kopfzeile').hidden = true;
    this.rahmen = { iframe, start, bereit: false, abgegeben: start.abgegeben, gesperrt: false,
      notenschutz: !!this.ich.notenschutz, angefordert: false, timer: null, speicherTimer: null, offen: null };

    if (!this.nachrichtenAbo) {
      this.nachrichtenAbo = true;
      window.addEventListener('message', e => this.nachricht(e));
      document.addEventListener('visibilitychange', () => this.sichtbarkeit());
      window.addEventListener('blur', () => this.fokusWeg());
      window.addEventListener('focus', () => this.fokusDa());
      window.addEventListener('pagehide', () => this.sofortSpeichern());
    }
    this.rahmen.timer = setInterval(() => this.ticken(), 1000);
    this.wachHalten();
  },

  senden(typ, daten) {
    const r = this.rahmen;
    if (!r || !r.iframe || !r.iframe.contentWindow) return;
    r.iframe.contentWindow.postMessage({ quelle: 'tom-schooltool', typ, ...(daten || {}) }, '*');
  },

  nachricht(e) {
    const r = this.rahmen;
    if (!r || !r.iframe || e.source !== r.iframe.contentWindow) return;
    const m = e.data;
    if (!m || m.quelle !== 'tom-ex') return;
    if (m.typ === 'bereit') this.initSenden();
    else if (m.typ === 'antworten') this.antworten(m.antworten, m.fortschritt);
    else if (m.typ === 'abgeben') this.abgeben(m.antworten, m.fortschritt, !!m.erzwungen || r.angefordert);
    else if (m.typ === 'ereignis') this.ereignis(m);
  },

  initSenden() {
    const r = this.rahmen, i = this.info, ich = this.ich;
    r.bereit = true;
    const datum = new Date(i.startzeit || this.jetzt());
    this.senden('init', { kontext: {
      nummer: ich.nummer, klasse: i.klasse,
      datum: `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`,
      exNummer: i.exNummer, notenschutz: !!ich.notenschutz, wiedergabe: 'zentral', medien: {},
      // Code + Nummer statt uid: bleibt gleich, wenn die Ex auf ein anderes Gerät umzieht
      seed: `${this.code}-${ich.nummer}`,
      modus: 'schreiben', antworten: r.start.antworten, abgegeben: r.start.abgegeben,
    } });
    this.ticken();
  },

  /* Restzeit dieses Schülers: Dauer + Zuschlag für alle + eigener Zuschlag, nach Serverzeit */
  restSekunden() {
    const i = this.info, ich = this.ich;
    if (!i.startzeit) return null;
    const ende = i.startzeit + ((i.dauerMinuten || 0) + (i.zuschlagMin || 0) + (ich.zuschlagMin || 0)) * 60000;
    return Math.round((ende - this.jetzt()) / 1000);
  },

  ticken() {
    const r = this.rahmen;
    if (!r || !r.bereit || r.gesperrt) return;
    const rest = this.restSekunden();
    if (rest == null) return;
    this.senden('zeit', { restSekunden: Math.max(0, rest) });
    if (rest <= 0 && !r.abgegeben) this.abgabeAnfordern('zeit');
    else if (rest <= 0) this.sperren('zeit');
  },

  /* Die Ex soll selbst abgeben; antwortet sie nicht, gibt der Rahmen den
     letzten Stand ab */
  abgabeAnfordern(grund) {
    const r = this.rahmen;
    if (!r || r.angefordert) return;
    r.angefordert = true;
    this.senden('abgabe-anfordern');
    setTimeout(() => {
      if (!this.rahmen || this.rahmen.abgegeben) { this.sperren(grund); return; }
      const l = this.lokalLesen();
      this.abgeben(l ? l.antworten : null, l ? l.fortschritt : null, true).then(() => this.sperren(grund));
    }, 3000);
  },

  sperren(grund) {
    const r = this.rahmen;
    if (!r || r.gesperrt) return;
    r.gesperrt = true;
    this.senden('sperren', { grund });
  },

  /* Was sich während der Ex an Sitzung oder eigenem Eintrag ändert */
  rahmenAbgleichen() {
    const r = this.rahmen;
    if (!r || r.laedt || !r.bereit) return;
    if (!!this.ich.notenschutz !== r.notenschutz) {
      r.notenschutz = !!this.ich.notenschutz;
      this.senden('notenschutz', { aktiv: r.notenschutz });
    }
    if (this.info.einsammeln && !r.abgegeben) this.abgabeAnfordern('beendet');
    this.ticken();
  },

  beenden(grund, titel, text) {
    const r = this.rahmen;
    if (r && !r.laedt) {
      this.sperren(grund);
      clearInterval(r.timer);
      // Kurz zeigen lassen, was die Ex selbst zum Ende anzeigt
      setTimeout(() => {
        document.getElementById('ex-rahmen').hidden = true;
        document.getElementById('ex-rahmen').innerHTML = '';
      }, grund === 'entfernt' ? 0 : 4000);
      this.rahmen = { laedt: false, iframe: null, gesperrt: true, abgegeben: true };
    }
    document.getElementById('ex-kopfzeile').hidden = false;
    this.meldung(titel, text);
  },

  /* ---------- Speichern ---------- */
  lokalLesen() {
    try { return JSON.parse(localStorage.getItem(this.lokalKey())); } catch (e) { return null; }
  },

  antworten(antworten, fortschritt) {
    const r = this.rahmen;
    if (!r || r.abgegeben || r.gesperrt) return;
    try {
      localStorage.setItem(this.lokalKey(), JSON.stringify({ antworten, fortschritt, zeit: this.jetzt() }));
    } catch (e) {}
    this.speichernPlanen(antworten, fortschritt);
  },

  speichernPlanen(antworten, fortschritt) {
    const r = this.rahmen;
    r.offen = { antworten, fortschritt };
    if (r.speicherTimer) return;
    r.speicherTimer = setTimeout(() => { r.speicherTimer = null; this.sofortSpeichern(); }, this.SPEICHERN_MS);
  },

  sofortSpeichern() {
    const r = this.rahmen;
    if (!r || !r.offen || r.abgegeben) return Promise.resolve();
    const { antworten, fortschritt } = r.offen;
    r.offen = null;
    return FB.update(this.abgabeRef(), {
      antworten: JSON.stringify(antworten || {}),
      fortschritt: this.fortschrittSauber(fortschritt),
      stand: FB.serverTimestamp(),
    }).catch(e => console.warn('Speichern abgelehnt:', e.message));
  },

  fortschrittSauber(f) {
    return { erledigt: Number(f && f.erledigt) || 0, gesamt: Number(f && f.gesamt) || 0 };
  },

  async abgeben(antworten, fortschritt, erzwungen) {
    const r = this.rahmen;
    if (!r || r.abgegeben) return;
    r.abgegeben = true;
    clearTimeout(r.speicherTimer);
    const daten = { abgegeben: true, abgegebenUm: FB.serverTimestamp(), stand: FB.serverTimestamp(), erzwungen: !!erzwungen };
    if (antworten) {
      daten.antworten = JSON.stringify(antworten);
      daten.fortschritt = this.fortschrittSauber(fortschritt);
    }
    try {
      await FB.update(this.abgabeRef(), daten);
      try { localStorage.removeItem(this.lokalKey()); } catch (e) {}
    } catch (e) {
      // Zu spät oder gesperrt – die Antworten liegen trotzdem noch lokal
      console.warn('Abgabe abgelehnt:', e.message);
    }
  },

  /* Nur die Felder, die die Regeln kennen */
  ereignis(m) {
    const r = this.rahmen;
    if (!r || r.abgegeben) return;
    const e = { art: String(m.art || 'ereignis').slice(0, 40), zeit: FB.serverTimestamp() };
    if (typeof m.medium === 'string') e.medium = m.medium.slice(0, 20);
    if (typeof m.station === 'string') e.station = m.station.slice(0, 20);
    if (typeof m.anzahl === 'number') e.anzahl = m.anzahl;
    if (typeof m.dauerSek === 'number') e.dauerSek = m.dauerSek;
    FB.set(FB.push(this.ref(`abgaben/${this.uid}/ereignisse`)), e).catch(() => {});
  },

  /* ---------- App verlassen ----------
     visibilitychange erwischt App-Wechsel und gesperrten Bildschirm. blur kommt
     auch, wenn man in die Ex tippt (der Fokus wandert ins iframe) – das zählt nicht. */
  weg: null,
  sichtbarkeit() {
    if (document.hidden) { this.sofortSpeichern(); this.wegBeginn('versteckt'); }
    else this.wegEnde('versteckt');
  },
  fokusWeg() {
    setTimeout(() => {
      const r = this.rahmen;
      if (r && r.iframe && document.activeElement === r.iframe) return;
      this.wegBeginn('fokus');
    }, 0);
  },
  fokusDa() { this.wegEnde('fokus'); },
  wegBeginn(art) {
    const r = this.rahmen;
    if (!r || !r.iframe || r.abgegeben || r.gesperrt || this.weg) return;
    this.weg = { art, seit: this.jetzt() };
  },
  wegEnde(art) {
    if (!this.weg || (this.weg.art !== art && art === 'fokus')) return;
    const dauerSek = Math.round((this.jetzt() - this.weg.seit) / 1000);
    this.weg = null;
    if (dauerSek < 1) return;
    this.ereignis({ art: 'app-verlassen', dauerSek });
  },

  /* Bildschirm während der Ex nicht ausgehen lassen (wo der Browser das kann) */
  async wachHalten() {
    try {
      if ('wakeLock' in navigator) {
        await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden && this.rahmen && this.rahmen.iframe) navigator.wakeLock.request('screen').catch(() => {});
        }, { once: true });
      }
    } catch (e) {}
  },
};

ExSchueler.init();
