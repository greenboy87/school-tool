/* Ex-Sitzungen – Lehrerseite: starten, Warteraum, Dashboard.

   In der Datenbank (schoolTool/exsessions/<code>) stehen nur Nummern. Welche
   Nummer zu welchem Schüler gehört, hält dieses Gerät beim Start fest
   (Classes.data.exSitzungen) – damit verschiebt ein späteres Umsortieren der
   Klassenliste keine Noten, und über den Tresor reist die Zuordnung nur
   verschlüsselt auf die anderen Geräte der Lehrkraft.

   Aufbau einer Sitzung:
     info/       status (warteraum|laeuft|beendet), exId, titel, art, klasse,
                 exNummer, wiedergabe, dauerMinuten, zuschlagMin, erstellt,
                 startzeit, erlaubt/{n<Nr>: true}, fehlt/{n<Nr>: true}
     teilnehmer/<uid>  nummer, status, notenschutzAngefragt, notenschutz, zuschlagMin, ts
     abgaben/<uid>     antworten (JSON-Text), fortschritt, stand, abgegeben, ereignisse
   Siehe docs/ex/bauplan.md und die Regeln in firebase-regeln.md. */
const ExSitzung = {
  AKTIV_KEY: 'ex-aktive-sitzung',

  code: null,             // aktive Sitzung auf diesem Gerät
  info: null,             // info/ live
  teilnehmer: {},         // teilnehmer/ live: { uid: { nummer, status, … } }
  abmelden: [],           // Live-Abfragen der aktiven Sitzung
  beamerFenster: null,

  init() {
    if (!document.getElementById('ex-start')) return;
    document.getElementById('ex-start-klasse').addEventListener('change', () => this.anwesenheitZeichnen());
    document.getElementById('ex-start-ex').addEventListener('change', () => this.vorschauText());
    document.getElementById('ex-start-nummer').addEventListener('input', () => this.vorschauText());
    document.getElementById('ex-anwesend').addEventListener('change', () => this.anwesenheitZaehlen());
    document.getElementById('btn-ex-warteraum').addEventListener('click', () => this.warteraumOeffnen());
    document.getElementById('btn-ex-beamer').addEventListener('click', () => this.beamer());
    document.getElementById('btn-ex-abbrechen').addEventListener('click', () => this.abbrechen());
    document.getElementById('ex-warteraum').addEventListener('click', e => {
      const b = e.target.closest('button[data-aktion]');
      if (b) this.aktion(b.dataset.aktion, b.dataset.uid, b.dataset.nr);
    });
    document.addEventListener('ex-anmeldung', e => this.schalten(e.detail.lehrer));
    document.addEventListener('ex-index', () => this.exAuswahlFuellen());
  },

  pfad(rest) { return `schoolTool/exsessions/${this.code}${rest ? '/' + rest : ''}`; },
  ref(rest) { return FB.ref(FB.db, this.pfad(rest)); },

  sitzungen() {
    if (!Classes.data.exSitzungen) Classes.data.exSitzungen = {};
    return Classes.data.exSitzungen;
  },

  /* ---------- An/Aus je nach Anmeldung ---------- */
  schalten(lehrer) {
    document.getElementById('ex-start').hidden = !lehrer;
    if (!lehrer) { this.schliessen(); document.getElementById('ex-sitzung').hidden = true; return; }
    this.klassenFuellen();
    this.exAuswahlFuellen();
    const gemerkt = localStorage.getItem(this.AKTIV_KEY);
    if (gemerkt && !this.code) this.oeffnen(gemerkt);
  },

  klassenFuellen() {
    const sel = document.getElementById('ex-start-klasse');
    const alt = sel.value || Classes.currentClassId;
    const klassen = Classes.data.classes.filter(c => c.students.length)
      .sort((a, b) => (b.year || '').localeCompare(a.year || '') || a.name.localeCompare(b.name, 'de', { numeric: true }));
    const jahre = new Set(klassen.map(c => c.year));
    sel.innerHTML = '';
    for (const c of klassen) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name + (jahre.size > 1 && c.year ? ` (${c.year})` : '');
      sel.append(o);
    }
    if (klassen.some(c => c.id === alt)) sel.value = alt;
    this.anwesenheitZeichnen();
  },

  exAuswahlFuellen() {
    const sel = document.getElementById('ex-start-ex');
    if (!sel) return;
    const alt = sel.value;
    const ids = Object.keys(Exen.index).sort((a, b) => (Exen.index[b].importiert || 0) - (Exen.index[a].importiert || 0));
    sel.innerHTML = '';
    for (const id of ids) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = Exen.index[id].titel;
      sel.append(o);
    }
    if (ids.includes(alt)) sel.value = alt;
    document.getElementById('btn-ex-warteraum').disabled = !ids.length;
    this.vorschauText();
  },

  vorschauText() {
    const x = Exen.index[document.getElementById('ex-start-ex').value];
    const n = this.exNummer();
    document.getElementById('ex-start-vorschau').textContent = x
      ? `Kopf auf den iPads: „${n}. ${x.art || 'Ex'} · ${x.fach || ''}“ · ${x.dauerMinuten} Minuten · ${x.punkteGesamt} Punkte`
      : 'Zuerst eine Ex in die Bibliothek ziehen.';
  },

  exNummer() {
    const n = parseInt(document.getElementById('ex-start-nummer').value, 10);
    return n >= 1 && n <= 9 ? n : 1;
  },

  klasse() {
    return Classes.data.classes.find(c => c.id === document.getElementById('ex-start-klasse').value) || null;
  },

  anwesenheitZeichnen() {
    const ul = document.getElementById('ex-anwesend');
    const cls = this.klasse();
    ul.innerHTML = '';
    if (cls) cls.students.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<label><input type="checkbox" checked data-sid="${Band.esc(s.id)}">
        <span class="nr">${i + 1}</span> <span class="name">${Band.esc(Classes.studentName(s))}</span></label>`;
      ul.append(li);
    });
    this.anwesenheitZaehlen();
  },

  anwesenheitZaehlen() {
    const boxen = [...document.querySelectorAll('#ex-anwesend input')];
    boxen.forEach(b => b.closest('li').classList.toggle('fehlt', !b.checked));
    const da = boxen.filter(b => b.checked).length;
    document.getElementById('ex-anwesend-zahl').textContent =
      boxen.length ? `${da} von ${boxen.length} da` : '';
  },

  /* ---------- Sitzung anlegen ---------- */
  async neuerCode() {
    for (let versuch = 0; versuch < 10; versuch++) {
      const zahl = new Uint32Array(1);
      crypto.getRandomValues(zahl);
      const code = String(100000 + (zahl[0] % 900000));
      const snap = await FB.get(FB.ref(FB.db, `schoolTool/exsessions/${code}/info`));
      if (!snap.exists()) return code;
    }
    throw new Error('Es ließ sich kein freier Code finden.');
  },

  async warteraumOeffnen() {
    const cls = this.klasse();
    const exId = document.getElementById('ex-start-ex').value;
    const ex = Exen.index[exId];
    if (!cls || !ex) { alert('Bitte Klasse und Ex wählen.'); return; }
    if (this.code && this.info && this.info.status !== 'beendet' &&
        !confirm('Auf diesem Gerät ist noch eine Sitzung offen. Trotzdem eine neue starten?')) return;

    const nummern = {}, erlaubt = {}, fehlt = {};
    document.querySelectorAll('#ex-anwesend input').forEach((b, i) => {
      const nr = String(i + 1);
      nummern[nr] = b.dataset.sid;
      if (b.checked) erlaubt['n' + nr] = true; else fehlt['n' + nr] = true;
    });
    if (!Object.keys(erlaubt).length) { alert('Es ist niemand als anwesend markiert.'); return; }

    const knopf = document.getElementById('btn-ex-warteraum');
    knopf.disabled = true;
    try {
      const code = await this.neuerCode();
      const exNummer = this.exNummer();
      await FB.set(FB.ref(FB.db, `schoolTool/exsessions/${code}/info`), {
        status: 'warteraum', exId, titel: ex.titel, art: ex.art || '', fach: ex.fach || '',
        klasse: cls.name, exNummer, wiedergabe: 'zentral', dauerMinuten: ex.dauerMinuten,
        zuschlagMin: 0, erstellt: FB.serverTimestamp(), erlaubt, fehlt,
      });
      this.sitzungen()[code] = {
        exId, titel: ex.titel, klasseId: cls.id, klasse: cls.name, exNummer,
        nummern, erstellt: Date.now(),
      };
      Classes.persist();
      this.oeffnen(code);
    } catch (e) {
      alert('Die Sitzung ließ sich nicht anlegen: ' + e.message +
        (/permission/i.test(e.message) ? '\n\nSind die neuen Regeln aus firebase-regeln.md eingetragen?' : ''));
    } finally {
      knopf.disabled = false;
    }
  },

  /* ---------- Aktive Sitzung ---------- */
  oeffnen(code) {
    this.schliessen();
    const lokal = this.sitzungen()[code];
    if (!lokal) { localStorage.removeItem(this.AKTIV_KEY); return; }
    this.code = code;
    localStorage.setItem(this.AKTIV_KEY, code);
    this.abmelden.push(FB.onValue(this.ref('info'), snap => {
      this.info = snap.val();
      if (!this.info) { this.vergessen(); return; }
      this.zeichnen();
    }, e => alert('Die Sitzung lässt sich nicht lesen: ' + e.message)));
    this.abmelden.push(FB.onValue(this.ref('teilnehmer'), snap => {
      this.teilnehmer = snap.val() || {};
      if (this.info) this.warteraumZeichnen();
    }));
    document.dispatchEvent(new CustomEvent('ex-sitzung', { detail: { code } }));
  },

  schliessen() {
    this.abmelden.forEach(f => f());
    this.abmelden = [];
    this.code = null;
    this.info = null;
    this.teilnehmer = {};
  },

  vergessen() {
    this.schliessen();
    localStorage.removeItem(this.AKTIV_KEY);
    document.getElementById('ex-sitzung').hidden = true;
    if (this.beamerFenster && !this.beamerFenster.closed) this.beamerFenster.close();
  },

  lokal() { return this.code ? this.sitzungen()[this.code] : null; },

  link() {
    return location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + 'ex.html?s=' + this.code;
  },

  zeichnen() {
    const i = this.info, lokal = this.lokal();
    document.getElementById('ex-sitzung').hidden = false;
    document.getElementById('ex-sitzung-titel').textContent = `${i.exNummer}. ${i.art || 'Ex'}: ${i.titel}`;
    const status = { warteraum: 'Warteraum offen', laeuft: 'läuft', beendet: 'beendet' }[i.status] || i.status;
    document.getElementById('ex-sitzung-info').textContent =
      `Klasse ${i.klasse} · ${i.dauerMinuten} Minuten · ${Object.keys(i.erlaubt || {}).length} erwartet` +
      (Object.keys(i.fehlt || {}).length ? `, ${Object.keys(i.fehlt).length} fehlen` : '') + ` · ${status}`;
    document.getElementById('ex-sitzung-code').textContent = this.code;
    const link = this.link();
    document.getElementById('ex-sitzung-link').textContent = link.replace(/\?s=.*$/, '');
    const qr = document.getElementById('ex-qr');
    if (qr.dataset.link !== link) {
      qr.innerHTML = '';
      new QRCode(qr, { text: link, width: 200, height: 200, colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M });
      qr.dataset.link = link;
    }
    document.getElementById('btn-ex-abbrechen').hidden = i.status !== 'warteraum';
    this.warteraumZeichnen();
  },

  /* ---------- Warteraum ---------- */
  name(nr) {
    const lokal = this.lokal();
    const sid = lokal && lokal.nummern[nr];
    const cls = lokal && Classes.data.classes.find(c => c.id === lokal.klasseId);
    const s = cls && cls.students.find(x => x.id === sid);
    return s ? Classes.studentName(s) : '(unbekannt)';
  },

  /* Einträge, die gerade zählen – „ersetzt“ ist eine abgelöste Anmeldung */
  aktiveEintraege() {
    return Object.entries(this.teilnehmer).filter(([, t]) => t.status !== 'ersetzt');
  },

  zeilen() {
    const i = this.info;
    const nachNr = {};
    for (const [uid, t] of this.aktiveEintraege()) (nachNr[t.nummer] = nachNr[t.nummer] || []).push({ uid, ...t });
    const nummern = new Set([
      ...Object.keys(i.erlaubt || {}).map(k => k.slice(1)),
      ...Object.keys(i.fehlt || {}).map(k => k.slice(1)),
      ...Object.keys(nachNr),
    ]);
    const zeilen = [];
    for (const nr of [...nummern].sort((a, b) => a - b)) {
      const eintraege = (nachNr[nr] || []).sort((a, b) => (a.ts || 0) - (b.ts || 0));
      if (!eintraege.length) {
        zeilen.push({ nr, uid: null, status: i.fehlt && i.fehlt['n' + nr] ? 'fehlt-vorab' : 'offen' });
        continue;
      }
      const doppelt = eintraege.filter(t => t.status === 'wartet' || t.status === 'freigegeben').length > 1;
      for (const t of eintraege) zeilen.push({ nr, ...t, doppelt });
    }
    return zeilen;
  },

  warteraumZeichnen() {
    const box = document.getElementById('ex-warteraum');
    const i = this.info;
    if (!i) { box.innerHTML = ''; return; }
    const esc = s => Band.esc(s);
    const zeilen = this.zeilen();
    const zaehle = st => zeilen.filter(z => z.status === st).length;
    const wartend = zaehle('wartet'), frei = zaehle('freigegeben');
    const doppelt = [...new Set(zeilen.filter(z => z.doppelt).map(z => z.nr))];
    const STATUS = {
      'offen': 'noch nicht da', 'fehlt-vorab': 'fehlt', 'wartet': 'wartet', 'freigegeben': 'freigegeben',
      'fehlt': 'fehlt', 'entfernt': 'entfernt',
    };
    const knopf = (aktion, text, z, extra = '') =>
      `<button class="small ${extra}" data-aktion="${aktion}" data-uid="${esc(z.uid || '')}" data-nr="${esc(z.nr)}">${text}</button>`;

    const zeilenHtml = zeilen.map(z => {
      const k = [];
      if (z.status === 'wartet') {
        k.push(knopf('freigeben', 'Freigeben', z, 'primary'));
        if (this.kannUebernehmen(z)) k.push(knopf('uebernehmen', 'übernehmen', z));
      }
      if (z.status === 'entfernt' || z.status === 'fehlt') k.push(knopf('freigeben', 'Wieder freigeben', z));
      if (z.status === 'wartet' || z.status === 'freigegeben') k.push(knopf('rauswerfen', 'Rauswerfen', z, 'danger'));
      if (z.status === 'wartet' || z.status === 'offen') k.push(knopf('fehlt', 'Als fehlend markieren', z));
      if (z.status === 'fehlt-vorab' && i.status !== 'beendet') k.push(knopf('doch-da', 'Doch da', z));
      let ns = '';
      if (z.uid && z.notenschutz) ns = `<span class="ex-ns an">Notenschutz ✓</span> ${knopf('ns-aus', 'zurücknehmen', z)}`;
      else if (z.uid && z.notenschutzAngefragt) ns = `<span class="ex-ns">angefragt</span> ${knopf('ns-an', 'bestätigen', z, 'primary')} ${knopf('ns-ab', 'ablehnen', z)}`;
      return `<tr class="st-${z.status}${z.doppelt ? ' doppelt' : ''}">
        <td class="nr">${esc(z.nr)}</td><td>${esc(this.name(z.nr))}</td>
        <td><span class="ex-status st-${z.status}">${STATUS[z.status] || esc(z.status)}</span>${z.doppelt ? ' <span class="ex-warnung">2 Geräte!</span>' : ''}</td>
        <td>${ns}</td><td class="aktionen">${k.join(' ')}</td></tr>`;
    }).join('');

    box.innerHTML = `
      ${doppelt.length ? `<p class="ex-warnung-box">Achtung: Nummer ${doppelt.join(', ')} ist auf mehreren Geräten angemeldet.
        Prüfe, wer sich vertippt hat, und wirf das falsche Gerät raus.</p>` : ''}
      <div class="ex-warteraum-kopf">
        <span>${frei} freigegeben · ${wartend} warten · ${zaehle('offen')} noch nicht da</span>
        <span class="btn-row">
          ${wartend ? '<button data-aktion="alle-freigeben" class="small">Alle freigeben</button>' : ''}
          ${i.status === 'warteraum' ? `<button data-aktion="starten" class="primary" ${frei ? '' : 'disabled'}>Ex starten</button>` : ''}
        </span>
      </div>
      <table class="ex-tabelle"><thead><tr><th>Nr.</th><th>Name</th><th>Status</th><th>Notenschutz</th><th></th></tr></thead>
        <tbody>${zeilenHtml}</tbody></table>`;
    Icons.hydrate(box);
  },

  /* Wiederanmeldung: Gibt es zu dieser Nummer schon einen freigegebenen oder
     entfernten Eintrag auf einem anderen Gerät, kann das neue Gerät ihn übernehmen */
  vorgaenger(z) {
    return this.aktiveEintraege()
      .filter(([uid, t]) => uid !== z.uid && t.nummer === z.nr && (t.status === 'freigegeben' || t.status === 'entfernt'))
      .map(([uid, t]) => ({ uid, ...t }))[0] || null;
  },
  kannUebernehmen(z) { return !!this.vorgaenger(z); },

  async aktion(aktion, uid, nr) {
    const T = uid ? this.teilnehmer[uid] : null;
    const w = {};                                  // Pfade relativ zu schoolTool/
    const s = `exsessions/${this.code}`;
    try {
      switch (aktion) {
        case 'freigeben':
          Object.assign(w, this.freigabe(uid, T));
          break;
        case 'alle-freigeben':
          for (const [u, t] of this.aktiveEintraege()) if (t.status === 'wartet') Object.assign(w, this.freigabe(u, t));
          break;
        case 'rauswerfen':
          if (!confirm(`Nr. ${nr} (${this.name(nr)}) rauswerfen? Die Ex wird auf dem Gerät sofort gesperrt. ` +
            'Die Nummer bleibt gesperrt, bis du sie wieder freigibst.')) return;
          w[`${s}/teilnehmer/${uid}/status`] = 'entfernt';
          break;
        case 'fehlt':
          if (uid) w[`${s}/teilnehmer/${uid}/status`] = 'fehlt';
          else { w[`${s}/info/erlaubt/n${nr}`] = null; w[`${s}/info/fehlt/n${nr}`] = true; }
          break;
        case 'doch-da':
          w[`${s}/info/fehlt/n${nr}`] = null; w[`${s}/info/erlaubt/n${nr}`] = true;
          break;
        case 'ns-an': w[`${s}/teilnehmer/${uid}/notenschutz`] = true; break;
        case 'ns-aus': w[`${s}/teilnehmer/${uid}/notenschutz`] = false; break;
        case 'ns-ab':
          w[`${s}/teilnehmer/${uid}/notenschutz`] = false;
          w[`${s}/teilnehmer/${uid}/notenschutzAngefragt`] = false;
          break;
        case 'uebernehmen': await this.uebernehmen(uid, nr); return;
        case 'starten': await this.starten(); return;
        default: return;
      }
      await FB.update(FB.ref(FB.db, 'schoolTool'), w);
    } catch (e) {
      alert('Das hat nicht geklappt: ' + e.message);
    }
  },

  /* Freigeben: Status, Zeitzuschlag (die Regeln rechnen damit) und der Zugang,
     über den die Regeln das Lesen der Schülerfassung erlauben */
  freigabe(uid, t) {
    const s = `exsessions/${this.code}`;
    const w = { [`${s}/teilnehmer/${uid}/status`]: 'freigegeben', [`exzugang/${uid}`]: this.code };
    if (!t || typeof t.zuschlagMin !== 'number') w[`${s}/teilnehmer/${uid}/zuschlagMin`] = 0;
    return w;
  },

  async uebernehmen(neuUid, nr) {
    const neu = this.teilnehmer[neuUid];
    const alt = this.vorgaenger({ uid: neuUid, nr });
    if (!alt) return;
    if (!confirm(`Nr. ${nr} (${this.name(nr)}) hat sich auf einem neuen Gerät angemeldet.\n\n` +
      'Antworten, Zeitzuschlag und Notenschutz vom alten Gerät übernehmen? Das alte Gerät wird gesperrt.')) return;
    const s = `exsessions/${this.code}`;
    const abgabe = (await FB.get(FB.ref(FB.db, `schoolTool/${s}/abgaben/${alt.uid}`))).val();
    const w = {
      [`${s}/teilnehmer/${alt.uid}/status`]: 'ersetzt',
      [`${s}/teilnehmer/${neuUid}/status`]: alt.status === 'entfernt' ? 'entfernt' : 'freigegeben',
      [`${s}/teilnehmer/${neuUid}/zuschlagMin`]: alt.zuschlagMin || 0,
      [`${s}/teilnehmer/${neuUid}/notenschutz`]: !!(alt.notenschutz || neu.notenschutz),
      [`exzugang/${neuUid}`]: this.code,
    };
    if (abgabe) { w[`${s}/abgaben/${neuUid}`] = abgabe; w[`${s}/abgaben/${alt.uid}`] = null; }
    await FB.update(FB.ref(FB.db, 'schoolTool'), w);
  },

  async starten() {
    const wartend = this.aktiveEintraege().filter(([, t]) => t.status === 'wartet').length;
    const doppelt = this.zeilen().some(z => z.doppelt);
    let frage = 'Ex jetzt starten? Ab jetzt läuft die Zeit.';
    if (wartend) frage += `\n\n${wartend} ${wartend === 1 ? 'Gerät wartet' : 'Geräte warten'} noch auf Freigabe – sie können später noch freigegeben werden.`;
    if (doppelt) frage += '\n\nAchtung: Eine Nummer ist doppelt angemeldet.';
    if (!confirm(frage)) return;
    await FB.update(this.ref('info'), { status: 'laeuft', startzeit: FB.serverTimestamp() });
  },

  async abbrechen() {
    if (!this.code || !confirm('Sitzung abbrechen? Wer schon im Warteraum ist, fliegt raus; der Code verfällt.')) return;
    const code = this.code;
    try {
      await FB.remove(FB.ref(FB.db, `schoolTool/exsessions/${code}`));
      delete this.sitzungen()[code];
      Classes.persist();
      this.vergessen();
    } catch (e) {
      alert('Abbrechen fehlgeschlagen: ' + e.message);
    }
  },

  /* ---------- Großansicht für die Leinwand ---------- */
  beamer() {
    if (!this.code || !this.info) return;
    const w = window.open('', 'ex-beamer', 'width=900,height=900');
    if (!w) { alert('Das Fenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.'); return; }
    this.beamerFenster = w;
    const esc = s => Band.esc(s);
    const i = this.info, link = this.link();
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
      <title>${esc(i.titel)}</title><style>
      body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:1.2rem;background:#faf9f5;color:#1f1e1d;
        font-family:system-ui,-apple-system,"Segoe UI",sans-serif;}
      h1{font-size:2.4rem;margin:0;text-align:center;}
      p{font-size:1.5rem;margin:0;color:#6b6a62;text-align:center;}
      .code{font-size:3.4rem;font-weight:800;letter-spacing:.14em;color:#c2603f;}
      #qr{background:#fff;padding:1.5rem;border-radius:1rem;box-shadow:0 2px 20px rgba(0,0,0,.12);}
      </style></head><body>
      <h1>${esc(i.exNummer + '. ' + (i.art || 'Ex'))} · ${esc(i.titel)}</h1>
      <div id="qr"></div>
      <p>Code: <span class="code">${esc(this.code)}</span></p>
      <p>${esc(link.replace(/\?s=.*$/, ''))}</p>
      </body></html>`);
    w.document.close();
    const skript = w.document.createElement('script');
    skript.src = new URL('js/vendor/qrcode.min.js', location.href).href;
    skript.onload = () => {
      new w.QRCode(w.document.getElementById('qr'), {
        text: link, width: 460, height: 460,
        colorDark: '#000000', colorLight: '#ffffff', correctLevel: w.QRCode.CorrectLevel.M,
      });
    };
    w.document.head.appendChild(skript);
  },
};
