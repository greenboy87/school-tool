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
     teilnehmer/<uid>  nummer, status, notenschutzAngefragt, notenschutz, krankAngefragt, krank, zuschlagMin, ts
     abgaben/<uid>     antworten (JSON-Text), fortschritt, stand, abgegeben, ereignisse
   Siehe docs/ex/bauplan.md und die Regeln in firebase-regeln.md. */
const ExSitzung = {
  AKTIV_KEY: 'ex-aktive-sitzung',

  code: null,             // aktive Sitzung auf diesem Gerät
  info: null,             // info/ live
  teilnehmer: {},         // teilnehmer/ live: { uid: { nummer, status, … } }
  abgaben: {},            // abgaben/ live: { uid: { antworten, fortschritt, abgegeben, ereignisse } }
  offset: 0,              // Serverzeit minus Uhr dieses Geräts
  uhr: null,              // Takt fürs Dashboard, solange die Ex läuft
  abmelden: [],           // Live-Abfragen der aktiven Sitzung
  beamerFenster: null,
  nach: null,             // Nachschreiben in Vorbereitung: { key, exId, klasseId, exNummer, nummern, geschrieben }

  init() {
    if (!document.getElementById('ex-start')) return;
    document.getElementById('ex-start-klasse').addEventListener('change', () => this.anwesenheitZeichnen());
    const anzahl = document.getElementById('ex-test-anzahl');
    try { if (localStorage.getItem('ex-test-anzahl')) anzahl.value = localStorage.getItem('ex-test-anzahl'); } catch (e) { /* egal */ }
    anzahl.addEventListener('input', () => {
      try { localStorage.setItem('ex-test-anzahl', String(this.testAnzahl())); } catch (e) { /* egal */ }
      this.anwesenheitZeichnen();
    });
    document.getElementById('ex-start-ex').addEventListener('change', () => { this.dauerVorbelegen(); this.vorschauText(); });
    document.getElementById('ex-start-dauer').addEventListener('input', () => this.vorschauText());
    ['ex-start-timer', 'ex-start-ohnelimit'].forEach(id =>
      document.getElementById(id).addEventListener('change', () => this.zeitOptionenStellen()));
    this.zeitOptionenLaden();
    document.getElementById('ex-start-nummer').addEventListener('input', () => this.vorschauText());
    document.getElementById('ex-anwesend').addEventListener('change', () => this.anwesenheitZaehlen());
    document.getElementById('btn-ex-warteraum').addEventListener('click', () => this.warteraumOeffnen());
    document.getElementById('btn-ex-nach-abbrechen').addEventListener('click', () => this.nachschreibenAbbrechen());
    document.getElementById('btn-ex-start-auf').addEventListener('click', () => { this.startOffen = true; this.startKarte(); });
    document.getElementById('btn-ex-zur-klasse').addEventListener('click', () => {
      const lokal = this.lokal();
      if (lokal) ExReiter.klasseSetzen(lokal.klasseId);
    });
    document.getElementById('ex-warteraum-kopf').addEventListener('click', e => {
      const b = e.target.closest('button[data-aktion]');
      if (b) this.aktion(b.dataset.aktion, b.dataset.uid, b.dataset.nr);
    });
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
    const t = document.createElement('option');
    t.value = this.TESTRAUM;
    t.textContent = 'Testraum';
    sel.prepend(t);
    if (klassen.some(c => c.id === alt) || alt === this.TESTRAUM) sel.value = alt;
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
    if (sel.value !== alt) this.dauerVorbelegen();
    this.vorschauText();
  },

  /* Die Dauer steckt nicht in der Ex, sie wird hier festgelegt. Vorschlag: was
     zuletzt für diese Ex galt, sonst eine Angabe aus älteren Ex-Dateien, sonst
     die zuletzt benutzte Dauer überhaupt, sonst 20 Minuten. Das zählt nicht als
     Zeitzuschlag. */
  STANDARD_DAUER: 20,
  dauerVorschlag() {
    const id = document.getElementById('ex-start-ex').value;
    const x = Exen.index[id] || {};
    const gemerkt = Classes.data.exDauer || {};
    return gemerkt[id] || x.dauerMinuten || gemerkt._zuletzt || this.STANDARD_DAUER;
  },

  dauerVorbelegen() {
    document.getElementById('ex-start-dauer').value = this.dauerVorschlag();
  },

  dauer() {
    const d = Math.round(Number(document.getElementById('ex-start-dauer').value));
    return d >= 1 && d <= 240 ? d : this.dauerVorschlag();
  },

  /* Zeit-Optionen: Timer auf den iPads zeigen? Ganz ohne Zeitlimit? Sie gelten ab
     dem Start (eine schon laufende Ex kennt kein „Timer ausblenden“). Ohne Limit
     steht als Dauer ein sehr großer Wert in der Sitzung – die Regeln rechnen
     weiter damit, nur kommt die Grenze nie. */
  OHNE_LIMIT_MIN: 600,
  zeitOptionenLaden() {
    const o = Classes.data.exZeitOptionen || {};
    document.getElementById('ex-start-timer').checked = o.anzeigen !== false;
    document.getElementById('ex-start-ohnelimit').checked = !!o.ohneLimit;
    this.zeitOptionenStellen();
  },
  zeitOptionenStellen() {
    const ohne = document.getElementById('ex-start-ohnelimit').checked;
    document.getElementById('ex-start-dauer').disabled = ohne;
    document.getElementById('ex-start-timer').disabled = ohne;
    this.vorschauText();
  },
  zeitOptionen() {
    const ohneLimit = document.getElementById('ex-start-ohnelimit').checked;
    return { ohneLimit, anzeigen: !ohneLimit && document.getElementById('ex-start-timer').checked };
  },

  dauerMerken(exId, d) {
    Classes.data.exDauer = { ...(Classes.data.exDauer || {}), [exId]: d, _zuletzt: d };
  },

  vorschauText() {
    const x = Exen.index[document.getElementById('ex-start-ex').value];
    const n = this.exNummer();
    document.getElementById('ex-start-vorschau').textContent = x
      ? `Kopf auf den iPads: „${n}. ${x.art || 'Ex'} · ${x.fach || ''}“ · ${this.zeitOptionen().ohneLimit ? 'ohne Zeitlimit'
        : `${this.dauer()} Minuten${this.zeitOptionen().anzeigen ? '' : ' (Timer verborgen)'}`} · ${x.punkteGesamt} Punkte`
      : 'Zuerst eine Ex in die Bibliothek ziehen.';
  },

  exNummer() {
    const n = parseInt(document.getElementById('ex-start-nummer').value, 10);
    return n >= 1 && n <= 9 ? n : 1;
  },

  klasse() { return this.klasseVon(document.getElementById('ex-start-klasse').value); },

  /* Testraum: eine gedachte Klasse ohne Namen, nur Nummern. Sie steht nicht in
     der Klassenliste und hat keine Notenliste. Die Schüler geben sich auf dem
     iPad selbst einen Namen – verschlüsselt, siehe js/ex-namen.js. */
  TESTRAUM: 'testraum',
  testAnzahl() {
    const n = parseInt(document.getElementById('ex-test-anzahl').value, 10);
    return n >= 1 && n <= 60 ? n : 10;
  },
  testraum() {
    return { id: this.TESTRAUM, name: 'Testraum', test: true, projects: [],
      students: Array.from({ length: 99 }, (_, i) => ({ id: 't' + (i + 1), first: '', last: 'Nr. ' + (i + 1) })) };
  },
  klasseVon(id) {
    if (id === this.TESTRAUM) return this.testraum();
    return Classes.data.classes.find(c => c.id === id) || null;
  },

  anwesenheitZeichnen() {
    const ul = document.getElementById('ex-anwesend');
    const cls = this.klasse();
    ul.innerHTML = '';
    document.getElementById('ex-test-feld').hidden = !(cls && cls.test);
    if (!cls) { this.anwesenheitZaehlen(); return; }
    // Beim Nachschreiben gilt die Nummernzuordnung der ursprünglichen Ex, nicht die heutige Klassenliste
    const eintraege = this.nach
      ? Object.entries(this.nach.nummern).sort((a, b) => a[0] - b[0])
        .map(([nr, sid]) => [nr, cls.students.find(x => x.id === sid)])
      : (cls.test ? cls.students.slice(0, this.testAnzahl()) : cls.students).map((s, i) => [String(i + 1), s]);
    for (const [nr, s] of eintraege) {
      const geschrieben = this.nach && this.nach.geschrieben.has(nr);
      const li = document.createElement('li');
      li.classList.toggle('geschrieben', !!geschrieben);
      li.innerHTML = `<label><input type="checkbox" ${geschrieben ? 'disabled' : 'checked'} data-nr="${Band.esc(nr)}" data-sid="${Band.esc(s ? s.id : '')}">
        <span class="nr">${Band.esc(nr)}</span> <span class="name">${Band.esc(s ? Classes.studentName(s) : '(nicht mehr in der Klasse)')}</span>
        ${geschrieben ? '<span class="hint">hat geschrieben</span>' : ''}</label>`;
      ul.append(li);
    }
    this.anwesenheitZaehlen();
  },

  anwesenheitZaehlen() {
    const boxen = [...document.querySelectorAll('#ex-anwesend input:not(:disabled)')];
    boxen.forEach(b => b.closest('li').classList.toggle('fehlt', !b.checked));
    const da = boxen.filter(b => b.checked).length;
    document.getElementById('ex-anwesend-zahl').textContent =
      boxen.length ? `${da} von ${boxen.length} da` : '';
  },

  /* ---------- Nachschreiben ----------
     Eine neue Sitzung derselben Ex für dieselbe Klasse und Ex-Nummer; die
     Auswertung fasst beide zusammen. Vorausgewählt ist, wer nicht geschrieben
     hat (fehlt, entfernt, nie beigetreten). */
  async nachschreibenVorbereiten(key) {
    const codes = Object.entries(this.sitzungen()).filter(([, l]) => `${l.exId}|${l.klasseId}|${l.exNummer}` === key);
    if (!codes.length) return;
    const geschrieben = new Set();
    for (const [code] of codes) {
      const s = (await FB.get(FB.ref(FB.db, `schoolTool/exsessions/${code}`))).val();
      if (!s) continue;
      for (const [uid, t] of Object.entries(s.teilnehmer || {})) {
        if (t.status === 'freigegeben' && s.abgaben && s.abgaben[uid]) geschrieben.add(t.nummer);
      }
    }
    const erste = codes.map(([, l]) => l).sort((a, b) => a.erstellt - b.erstellt)[0];
    if (!Exen.index[erste.exId]) { alert('Die Ex ist nicht mehr in der Bibliothek. Bitte zuerst erneut importieren.'); return; }
    this.nach = { key, exId: erste.exId, klasseId: erste.klasseId, exNummer: erste.exNummer, nummern: erste.nummern, geschrieben };
    ExReiter.zeigen('schreiben', erste.klasseId);
    document.getElementById('ex-start-klasse').value = erste.klasseId;
    document.getElementById('ex-start-ex').value = erste.exId;
    document.getElementById('ex-start-nummer').value = erste.exNummer;
    this.dauerVorbelegen();
    this.nachschreibenOberflaeche();
    const offen = Object.keys(erste.nummern).filter(nr => !geschrieben.has(nr)).length;
    if (!offen) alert('Alle haben diese Ex schon geschrieben.');
    document.getElementById('ex-start').scrollIntoView({ behavior: 'smooth' });
  },

  nachschreibenAbbrechen() {
    this.nach = null;
    this.nachschreibenOberflaeche();
  },

  nachschreibenOberflaeche() {
    const an = !!this.nach;
    document.getElementById('ex-start').classList.toggle('nachschreiben', an);
    document.getElementById('ex-start-titel').textContent = an ? 'Nachschreiben vorbereiten' : 'Ex starten';
    ['ex-start-klasse', 'ex-start-ex', 'ex-start-nummer'].forEach(id => { document.getElementById(id).disabled = an; });
    document.getElementById('btn-ex-warteraum').lastChild.textContent = an ? 'Warteraum fürs Nachschreiben öffnen' : 'Warteraum öffnen';
    document.getElementById('btn-ex-nach-abbrechen').hidden = !an;
    this.startKarte();
    this.vorschauText();
    this.anwesenheitZeichnen();
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
        !confirm(`Für ${this.info.klasse} ist auf diesem Gerät noch „${this.info.titel}“ offen ` +
          `(${this.info.status === 'laeuft' ? 'läuft' : 'Warteraum'}).\n\nDie läuft zwar weiter, lässt sich hier ` +
          'danach aber nicht mehr steuern oder beenden. Besser zuerst dort „Ex beenden“ bzw. „Sitzung abbrechen“.' +
          '\n\nTrotzdem den neuen Warteraum öffnen?')) return;

    const nach = this.nach;
    const nummern = nach ? { ...nach.nummern } : {}, erlaubt = {}, fehlt = {};
    document.querySelectorAll('#ex-anwesend input').forEach(b => {
      const nr = b.dataset.nr;
      if (!nach) nummern[nr] = b.dataset.sid;
      if (b.disabled) return;                 // hat schon geschrieben
      if (b.checked) erlaubt['n' + nr] = true; else fehlt['n' + nr] = true;
    });
    if (!Object.keys(erlaubt).length) { alert('Es ist niemand als anwesend markiert.'); return; }

    const knopf = document.getElementById('btn-ex-warteraum');
    knopf.disabled = true;
    try {
      const code = await this.neuerCode();
      const exNummer = nach ? nach.exNummer : this.exNummer();
      const zeit = this.zeitOptionen();
      const dauer = zeit.ohneLimit ? this.OHNE_LIMIT_MIN : this.dauer();
      if (!zeit.ohneLimit) this.dauerMerken(exId, dauer);
      Classes.data.exZeitOptionen = zeit;
      await FB.set(FB.ref(FB.db, `schoolTool/exsessions/${code}/info`), {
        status: 'warteraum', exId, titel: ex.titel, art: ex.art || '', fach: ex.fach || '',
        klasse: cls.name, exNummer, wiedergabe: 'zentral', dauerMinuten: dauer,
        zuschlagMin: 0, erstellt: FB.serverTimestamp(), erlaubt, fehlt,
        zeitAnzeigen: zeit.anzeigen, ohneLimit: zeit.ohneLimit,
        ...(nach ? { nachschreiben: true } : {}),
        ...(cls.test ? { test: true } : {}),
      });
      // Beim Nachschreiben im Testraum gilt der Schlüssel der ersten Sitzung weiter
      const alterSchluessel = nach && Object.values(this.sitzungen())
        .find(x => `${x.exId}|${x.klasseId}|${x.exNummer}` === nach.key && x.namensSchluessel);
      this.sitzungen()[code] = {
        exId, titel: ex.titel, klasseId: cls.id, klasse: cls.name, exNummer,
        nummern, erstellt: Date.now(),
        ...(cls.test ? { namensSchluessel: alterSchluessel ? alterSchluessel.namensSchluessel : ExNamen.neuerSchluessel() } : {}),
      };
      Classes.persist();
      document.dispatchEvent(new CustomEvent('ex-sitzungen'));
      if (nach) this.nachschreibenAbbrechen();
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
    this.testNamen = {};
    this.abmelden.push(FB.onValue(this.ref('teilnehmer'), snap => {
      this.teilnehmer = snap.val() || {};
      this.testNamenLesen();
      if (this.info) this.warteraumZeichnen();
    }));
    this.abmelden.push(FB.onValue(this.ref('abgaben'), snap => {
      this.abgaben = snap.val() || {};
      if (this.info) this.warteraumZeichnen();
    }));
    this.abmelden.push(FB.onValue(FB.ref(FB.db, '.info/serverTimeOffset'), snap => { this.offset = snap.val() || 0; }));
    // Restzeiten laufen weiter, auch wenn sich in der Datenbank nichts ändert
    this.uhr = setInterval(() => { if (this.info && this.info.status === 'laeuft') this.warteraumZeichnen(); }, 5000);
    document.dispatchEvent(new CustomEvent('ex-sitzung', { detail: { code } }));
  },

  schliessen() {
    this.abmelden.forEach(f => f());
    this.abmelden = [];
    clearInterval(this.uhr);
    this.uhr = null;
    this.code = null;
    this.info = null;
    this.teilnehmer = {};
    this.abgaben = {};
  },

  vergessen() {
    this.schliessen();
    localStorage.removeItem(this.AKTIV_KEY);
    document.getElementById('ex-sitzung').hidden = true;
    document.getElementById('ex-sitzung').classList.remove('fremd');
    ExReiter.laeuft(false);
    this.startOffen = false;
    document.getElementById('ex-start').classList.remove('zu');
    document.getElementById('btn-ex-start-auf').hidden = true;
    if (this.beamerFenster && !this.beamerFenster.closed) this.beamerFenster.close();
  },

  lokal() { return this.code ? this.sitzungen()[this.code] : null; },

  /* Der QR-Code trägt hinter dem # die Namen der zugelassenen Schüler. Den Teil
     nach # schicken Browser nie an einen Server – die Namen gehen vom Beamer
     direkt aufs iPad, in die Datenbank kommt weiter nur die Nummer
     (wie bei der Gruppenbildung). */
  link() {
    const basis = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + 'ex.html?s=' + this.code;
    const lokal = this.lokal();
    if (lokal && lokal.namensSchluessel) return basis + '#' + LiveGroups.nachBase64(JSON.stringify({ k: lokal.namensSchluessel }));
    const namen = this.kurznamen();
    return Object.keys(namen).length ? basis + '#' + LiveGroups.nachBase64(JSON.stringify({ n: namen })) : basis;
  },

  /* „Mia A.“ – bei gleichem Vornamen und Anfangsbuchstaben der volle Nachname */
  kurznamen() {
    const lokal = this.lokal(), i = this.info;
    const cls = lokal && this.klasseVon(lokal.klasseId);
    if (!cls || !i || cls.test) return {};
    const eintraege = Object.keys(i.erlaubt || {}).map(k => k.slice(1)).map(nr => {
      const s = cls.students.find(x => x.id === lokal.nummern[nr]);
      return s && { nr, first: (s.first || '').trim(), last: (s.last || '').trim() };
    }).filter(Boolean);
    const kurz = e => e.first ? `${e.first} ${e.last.charAt(0)}.`.trim() : e.last;
    const zaehler = {};
    eintraege.forEach(e => { zaehler[kurz(e)] = (zaehler[kurz(e)] || 0) + 1; });
    const namen = {};
    eintraege.forEach(e => { namen[e.nr] = zaehler[kurz(e)] > 1 ? [e.first, e.last].filter(Boolean).join(' ') : kurz(e); });
    return namen;
  },

  /* Gehört die Sitzung zu einer anderen Klasse als der oben gewählten? */
  fremd() {
    const lokal = this.lokal(), kid = typeof ExReiter !== 'undefined' ? ExReiter.klasseId() : '';
    return !!(lokal && kid && lokal.klasseId !== kid);
  },

  /* Oben wurde eine andere Klasse gewählt */
  klasseGewechselt() { if (this.info) this.zeichnen(); },

  zeichnen() {
    const i = this.info, lokal = this.lokal();
    const fremd = this.fremd();
    // Eine beendete Ex einer anderen Klasse hat beim Schreiben nichts mehr zu suchen –
    // ihre Ergebnisse stehen unter „Korrigieren“
    if (fremd && i.status === 'beendet') { this.vergessen(); return; }
    const karte = document.getElementById('ex-sitzung');
    karte.hidden = false;
    karte.classList.toggle('fremd', fremd);
    if (fremd) {
      const status = i.status === 'warteraum' ? 'Warteraum offen' : 'läuft noch';
      document.getElementById('ex-sitzung-fremd-text').textContent = `Klasse ${i.klasse}: ${i.titel} · ${status}`;
      document.getElementById('btn-ex-zur-klasse').textContent = `Zu ${i.klasse} wechseln`;
    }
    // Grüner Punkt am Reiter nur, solange Warteraum offen ist oder die Ex läuft
    ExReiter.laeuft(i.status === 'warteraum' || i.status === 'laeuft');
    document.getElementById('ex-sitzung-titel').textContent = `${i.exNummer}. ${i.art || 'Ex'}: ${i.titel}${i.nachschreiben ? ' – Nachschreiben' : ''}`;
    const status = { warteraum: 'Warteraum offen', laeuft: 'läuft', beendet: 'beendet' }[i.status] || i.status;
    document.getElementById('ex-sitzung-info').textContent =
      `Klasse ${i.klasse} · ${i.ohneLimit ? 'ohne Zeitlimit' : `${i.dauerMinuten} Minuten`}${i.zeitAnzeigen === false && !i.ohneLimit ? ' (Timer verborgen)' : ''} · ${Object.keys(i.erlaubt || {}).length} erwartet` +
      (Object.keys(i.fehlt || {}).length ? `, ${Object.keys(i.fehlt).length} fehlen` : '') + ` · ${status}`;
    document.getElementById('ex-sitzung-code').textContent = this.code;
    const link = this.link();
    document.getElementById('ex-sitzung-link').textContent = link.replace(/\?s=.*$/, '');
    const qr = document.getElementById('ex-qr');
    if (qr.dataset.link !== link) {
      const neu = qr.dataset.link != null;
      qr.innerHTML = '';
      // Fehlerkorrektur niedrig: Die Namen brauchen Platz im Code
      new QRCode(qr, { text: link, width: 220, height: 220, colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L });
      qr.dataset.link = link;
      // Anwesenheit geändert („Doch da“, „fehlt“): das offene Beamerfenster mitziehen
      if (neu && this.beamerFenster && !this.beamerFenster.closed) this.beamer();
    }
    document.getElementById('btn-ex-abbrechen').hidden = i.status !== 'warteraum';
    this.warteraumZeichnen();
  },

  /* ---------- Warteraum ---------- */
  name(nr) {
    const lokal = this.lokal();
    const sid = lokal && lokal.nummern[nr];
    const cls = lokal && this.klasseVon(lokal.klasseId);
    const s = cls && cls.students.find(x => x.id === sid);
    if (cls && cls.test) {
      const eigen = this.testNamen[nr];
      return eigen ? `Nr. ${nr} · ${eigen}` : `Nr. ${nr}`;
    }
    return s ? Classes.studentName(s) : '(unbekannt)';
  },

  /* Testraum: selbst gewählte Namen entschlüsseln (nur hier, mit dem lokalen Schlüssel) */
  testNamen: {},
  async testNamenLesen() {
    const lokal = this.lokal();
    if (!lokal || !lokal.namensSchluessel) return;
    let neu = false;
    for (const t of Object.values(this.teilnehmer)) {
      if (!t.nameV || t.status === 'ersetzt') continue;
      const name = await ExNamen.entschluesseln(lokal.namensSchluessel, t.nameV);
      if (name && this.testNamen[t.nummer] !== name) { this.testNamen[t.nummer] = name; neu = true; }
    }
    if (neu && this.info) this.warteraumZeichnen();
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

  /* ---------- Während der Ex ---------- */
  jetzt() { return Date.now() + this.offset; },

  /* Restzeit in Sekunden für einen Teilnehmer (Dauer + Zuschlag für alle + eigener) */
  restSek(t) {
    const i = this.info;
    if (!i.startzeit) return null;
    const ende = i.startzeit + ((i.dauerMinuten || 0) + (i.zuschlagMin || 0) + ((t && t.zuschlagMin) || 0)) * 60000;
    return Math.round((ende - this.jetzt()) / 1000);
  },

  zeitText(sek) {
    if (sek == null) return '';
    if (sek <= 0) return 'Zeit um';
    return `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, '0')}`;
  },

  /* „2× App verlassen (35 s) · HB 3 2× gespielt“ */
  auffaelliges(abgabe) {
    const e = Object.values((abgabe && abgabe.ereignisse) || {});
    const teile = [];
    const weg = e.filter(x => x.art === 'app-verlassen');
    if (weg.length) {
      const sek = weg.reduce((n, x) => n + (x.dauerSek || 0), 0);
      teile.push(`${weg.length}× App verlassen (${sek >= 60 ? Math.round(sek / 60) + ' min' : sek + ' s'})`);
    }
    const gespielt = {};
    e.filter(x => x.art === 'abspielen' && x.medium).forEach(x => {
      gespielt[x.medium] = Math.max(gespielt[x.medium] || 0, x.anzahl || 1);
    });
    Object.entries(gespielt).forEach(([m, n]) => teile.push(`${m.toUpperCase().replace(/^HB/, 'HB ')} ${n}× gespielt`));
    return teile.join(' · ');
  },

  /* Was in der Status-Spalte steht */
  statusVon(z) {
    const i = this.info;
    if (z.status !== 'freigegeben' || i.status === 'warteraum') return z.status;
    const ab = this.abgaben[z.uid];
    if (ab && ab.abgegeben) return 'abgegeben';
    if (i.status === 'beendet') return 'nicht-abgegeben';
    const rest = this.restSek(z);
    return rest != null && rest <= 0 ? 'zeit-um' : 'schreibt';
  },

  warteraumZeichnen() {
    const box = document.getElementById('ex-warteraum');
    const i = this.info;
    if (!i) { box.innerHTML = ''; document.getElementById('ex-warteraum-kopf').innerHTML = ''; this.startKarte(); return; }
    const esc = s => Band.esc(s);
    const laeuft = i.status === 'laeuft', vorher = i.status === 'warteraum';
    const zeilen = this.zeilen();
    zeilen.forEach(z => { z.anzeige = z.uid ? this.statusVon(z) : z.status; });
    const zaehle = st => zeilen.filter(z => z.anzeige === st).length;
    const doppelt = [...new Set(zeilen.filter(z => z.doppelt).map(z => z.nr))];
    const STATUS = {
      'offen': 'noch nicht da', 'fehlt-vorab': 'fehlt', 'wartet': 'wartet', 'freigegeben': 'freigegeben',
      'fehlt': 'fehlt', 'entfernt': 'entfernt', 'schreibt': 'schreibt', 'abgegeben': 'abgegeben',
      'zeit-um': 'Zeit um', 'nicht-abgegeben': 'nicht abgegeben',
    };
    const knopf = (aktion, text, z, extra = '') =>
      `<button class="small ${extra}" data-aktion="${aktion}" data-uid="${esc(z.uid || '')}" data-nr="${esc(z.nr)}">${text}</button>`;

    const zeileHtml = z => {
      const k = [];
      const aktiv = z.status === 'wartet' || z.status === 'freigegeben';
      if (z.status === 'wartet') {
        k.push(knopf('freigeben', 'Freigeben', z, 'primary'));
        if (this.kannUebernehmen(z)) k.push(knopf('uebernehmen', 'übernehmen', z));
      }
      if ((z.status === 'entfernt' || z.status === 'fehlt') && i.status !== 'beendet') k.push(knopf('freigeben', 'Wieder freigeben', z));
      if (laeuft && !i.ohneLimit && z.anzeige !== 'abgegeben' && z.status === 'freigegeben') k.push(knopf('zuschlag', 'Zeit +', z));
      if (aktiv && i.status !== 'beendet' && z.anzeige !== 'abgegeben') k.push(knopf('rauswerfen', 'Raus', z, 'danger'));
      if (vorher && (z.status === 'wartet' || z.status === 'offen')) k.push(knopf('fehlt', 'fehlt', z));
      if (z.status === 'fehlt-vorab' && i.status !== 'beendet') k.push(knopf('doch-da', 'Doch da', z));
      // Falschen Namen erwischt: vor dem Start zurück zur Namensauswahl, ohne das Gerät zu sperren
      if (vorher && z.uid && (z.status === 'freigegeben' || z.status === 'entfernt')) k.push(knopf('neu-waehlen', 'Neu wählen', z));
      let ns = '';
      if (z.uid && z.notenschutz) ns = `<span class="ex-ns an">Notenschutz ✓ ${i.status === 'beendet' ? '' : knopf('ns-aus', 'zurücknehmen', z)}</span>`;
      else if (z.uid && z.notenschutzAngefragt) ns = `<span class="ex-ns">Notenschutz angefragt ${knopf('ns-an', 'bestätigen', z, 'primary')} ${knopf('ns-ab', 'ablehnen', z)}</span>`;
      // „Letzte Stunde krank“: meldet das iPad, die Lehrkraft bestätigt; zählt in der Auswertung dann erst einmal nicht
      let kr = '';
      if (z.uid && z.krank) kr = `<span class="ex-ns an">letzte Std. krank ✓ ${i.status === 'beendet' ? '' : knopf('krank-aus', 'zurücknehmen', z)}</span>`;
      else if (z.uid && z.krankAngefragt) kr = `<span class="ex-ns">letzte Std. krank? ${knopf('krank-an', 'bestätigen', z, 'primary')} ${knopf('krank-ab', 'ablehnen', z)}</span>`;
      const ab = z.uid ? this.abgaben[z.uid] : null;
      const f = ab && ab.fortschritt;
      const fortschritt = f && f.gesamt
        ? `<span class="ex-balken"><span style="width:${Math.round(100 * f.erledigt / f.gesamt)}%"></span></span> ${f.erledigt}/${f.gesamt}` : '';
      const zuschlag = z.zuschlagMin ? ` <span class="hint">+${z.zuschlagMin} min</span>` : '';
      // Was der Steckbrief beim Freigeben mitbringt – vorher sichtbar machen
      const sb = z.uid && z.status === 'wartet' ? this.steckbriefAusgleich(z.nr) : {};
      const sbText = [sb.notenschutz ? 'Notenschutz' : '', sb.zuschlagMin ? `+${sb.zuschlagMin} min` : ''].filter(Boolean).join(', ');
      const sbHinweis = sbText ? `<span class="hint" title="Wird beim Freigeben aus dem Steckbrief übernommen">(Steckbrief: ${esc(sbText)})</span>` : '';
      const zeit = laeuft && !i.ohneLimit && z.status === 'freigegeben' && z.anzeige !== 'abgegeben' ? this.zeitText(this.restSek(z)) : '';
      // Kompakt, damit zwei Tabellen nebeneinander passen: Notenschutz, Auffälliges und
      // Steckbrief stehen klein unter dem Namen, Status und Fortschritt teilen sich eine Spalte
      const auff = esc(this.auffaelliges(ab));
      const details = [ns, kr, auff ? `<span class="ex-auffaellig">${auff}</span>` : '', sbHinweis].filter(Boolean);
      const pille = `<span class="ex-status st-${z.anzeige}">${STATUS[z.anzeige] || esc(z.anzeige)}</span>`;
      // Wer schreibt, bekommt den Balken; jeder andere Stand die Pille (dahinter der Zähler, falls es einen gibt)
      const stand = vorher ? pille : (z.anzeige === 'schreibt' && fortschritt ? fortschritt
        : pille + (f && f.gesamt ? ` ${f.erledigt}/${f.gesamt}` : ''));
      return `<tr class="st-${z.anzeige}${z.doppelt ? ' doppelt' : ''}">
        <td class="nr">${esc(z.nr)}</td>
        <td class="ex-name"><span class="ex-name-text">${esc(this.name(z.nr))}</span>${details.length ? `<div class="ex-details">${details.join('')}</div>` : ''}</td>
        <td class="ex-stand">${stand}${z.doppelt ? ' <span class="ex-warnung">2 Geräte!</span>' : ''}</td>
        ${vorher ? '' : `<td class="ex-zeit">${zeit}${zuschlag}</td>`}
        <td class="aktionen">${k.join(' ')}</td></tr>`;
    };
    // Lange Listen in zwei Spalten (nebeneinander, wenn Platz ist)
    const tabelle = liste => `<table class="ex-tabelle"><thead><tr><th>Nr.</th><th>Name</th><th>${vorher ? 'Status' : 'Stand'}</th>
        ${vorher ? '' : '<th>Zeit</th>'}<th></th></tr></thead>
        <tbody>${liste.map(zeileHtml).join('')}</tbody></table>`;
    const haelfte = Math.ceil(zeilen.length / 2);
    const tabellen = zeilen.length > 8
      ? tabelle(zeilen.slice(0, haelfte)) + tabelle(zeilen.slice(haelfte)) : tabelle(zeilen);

    const wartend = zaehle('wartet'), frei = zaehle('freigegeben');
    let kopf;
    if (vorher) {
      kopf = `<span>${frei} freigegeben · ${wartend} warten · ${zaehle('offen')} noch nicht da</span>
        <span class="btn-row">
          ${wartend ? '<button data-aktion="alle-freigeben" class="small">Alle freigeben</button>' : ''}
          <button data-aktion="nachtragen" class="small" title="Für jemanden, der beim Öffnen des Warteraums nicht in der Liste stand">Schüler nachträglich zulassen</button>
          ${i.ohneLimit ? '' : `<button data-aktion="dauer" class="small" title="Gilt für alle; zählt nicht als Zeitzuschlag">Dauer: ${i.dauerMinuten} min ändern</button>`}
          <button data-aktion="starten" class="primary" ${frei ? '' : 'disabled'}>Ex starten</button>
        </span>`;
    } else if (laeuft) {
      const rest = this.restSek(null);
      kopf = `<span>${zaehle('schreibt')} schreiben · ${zaehle('abgegeben')} abgegeben${zaehle('zeit-um') ? ` · ${zaehle('zeit-um')} Zeit um` : ''}${wartend ? ` · ${wartend} warten` : ''}
          · ${i.ohneLimit ? '<strong>ohne Zeitlimit</strong> – beenden mit „Ex beenden“'
            : `reguläre Restzeit <strong>${this.zeitText(rest)}</strong>${i.zuschlagMin ? ` (+${i.zuschlagMin} min für alle)` : ''}${i.zeitAnzeigen === false ? ' · auf den iPads verborgen' : ''}`}</span>
        <span class="btn-row">
          ${wartend ? '<button data-aktion="alle-freigeben" class="small">Alle freigeben</button>' : ''}
          <button data-aktion="nachtragen" class="small" title="Für jemanden, der beim Öffnen des Warteraums nicht in der Liste stand">Schüler nachträglich zulassen</button>
          ${i.ohneLimit ? '' : '<button data-aktion="zuschlag-alle" class="small">Zeit + für alle</button>'}
          <button data-aktion="beenden" class="danger">Ex beenden</button>
        </span>`;
    } else {
      kopf = `<span>Beendet · ${zaehle('abgegeben')} abgegeben${zaehle('nicht-abgegeben') ? ` · ${zaehle('nicht-abgegeben')} ohne Abgabe` : ''}</span>
        <span class="btn-row">
          <button data-aktion="zur-auswertung" class="primary">Zur Auswertung</button>
          <button data-aktion="nachschreiben" class="small">Nachschreiben vorbereiten</button>
          <button data-aktion="ausblenden" class="small" title="Die Sitzung bleibt gespeichert und ist über die Auswertung erreichbar">Hier ausblenden</button>
        </span>`;
    }

    box.innerHTML = `
      ${doppelt.length && i.status !== 'beendet' ? `<p class="ex-warnung-box">Achtung: Nummer ${doppelt.join(', ')} ist auf mehreren Geräten angemeldet.
        Prüfe, wer sich vertippt hat, und wirf das falsche Gerät raus.</p>` : ''}
      ${i.einsammeln && laeuft ? '<p class="ex-warnung-box">Die Abgaben werden eingesammelt …</p>' : ''}
      <div class="ex-warteraum-spalten">${tabellen}</div>`;
    // Zahlen und Hauptknöpfe stehen rechts neben dem QR-Code
    document.getElementById('ex-warteraum-kopf').innerHTML = kopf;
    this.startKarte();
  },

  /* Solange Warteraum offen ist oder die Ex läuft, ist „Ex starten“ eingeklappt */
  startOffen: false,
  startKarte() {
    const aktiv = !!(this.info && (this.info.status === 'warteraum' || this.info.status === 'laeuft')) && !this.fremd();
    const zu = aktiv && !this.startOffen && !this.nach;
    document.getElementById('ex-start').classList.toggle('zu', zu);
    // Während der Sitzung braucht die Liste die Breite – die Ex-Spalte rechts verschwindet
    const raster = document.querySelector('.ex-schreiben-raster');
    if (raster) raster.classList.toggle('ohne-seite', aktiv);
    document.getElementById('btn-ex-start-auf').hidden = !zu;
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
        case 'neu-waehlen':
          w[`${s}/teilnehmer/${uid}/status`] = 'wartet';
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
        case 'krank-an': w[`${s}/teilnehmer/${uid}/krank`] = true; break;
        case 'krank-aus': w[`${s}/teilnehmer/${uid}/krank`] = false; break;
        case 'krank-ab':
          w[`${s}/teilnehmer/${uid}/krank`] = false;
          w[`${s}/teilnehmer/${uid}/krankAngefragt`] = false;
          break;
        case 'ns-ab':
          w[`${s}/teilnehmer/${uid}/notenschutz`] = false;
          w[`${s}/teilnehmer/${uid}/notenschutzAngefragt`] = false;
          break;
        case 'zuschlag': {
          const min = this.minutenFragen(`Zusätzliche Zeit für Nr. ${nr} (${this.name(nr)}) in Minuten:`, T.zuschlagMin);
          if (min == null) return;
          w[`${s}/teilnehmer/${uid}/zuschlagMin`] = min;
          break;
        }
        case 'zuschlag-alle': {
          const min = this.minutenFragen('Zusätzliche Zeit für alle in Minuten:', this.info.zuschlagMin);
          if (min == null) return;
          w[`${s}/info/zuschlagMin`] = min;
          break;
        }
        case 'beenden': await this.beenden(); return;
        case 'zur-auswertung': {
          const l = this.lokal();
          ExAuswertung.oeffnen(ExAuswertung.schluesselVon(l));
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        case 'ausblenden': this.vergessen(); return;
        case 'nachschreiben': { const l = this.lokal(); this.nachschreibenVorbereiten(`${l.exId}|${l.klasseId}|${l.exNummer}`); return; }
        case 'nachtragen': await this.nachtragen(); return;
        case 'uebernehmen': await this.uebernehmen(uid, nr); return;
        case 'starten': await this.starten(); return;
        case 'dauer': {
          const ein = prompt('Dauer der Ex in Minuten (gilt für alle, zählt nicht als Zeitzuschlag):', String(this.info.dauerMinuten));
          if (ein == null) return;
          const d = Math.round(Number(String(ein).replace(',', '.')));
          if (!(d >= 1 && d <= 240)) { alert('Bitte 1 bis 240 Minuten.'); return; }
          w[`${s}/info/dauerMinuten`] = d;
          break;
        }
        default: return;
      }
      await FB.update(FB.ref(FB.db, 'schoolTool'), w);
    } catch (e) {
      alert('Das hat nicht geklappt: ' + e.message);
    }
  },

  /* Schüler nachträglich zulassen: Wer beim Öffnen des Warteraums nicht in der
     Klassenliste stand, bekommt die nächste freie Nummer hinter allen bisherigen.
     Die alten Nummern bleiben, wie sie sind. Die Zuordnung kommt in alle
     Sitzungen derselben Ex (Nachschreiben, Auswertung), der QR-Code trägt
     danach auch den neuen Namen. */
  async nachtragen() {
    const lokal = this.lokal(), i = this.info;
    const cls = lokal && this.klasseVon(lokal.klasseId);
    if (!cls || !i || i.status === 'beendet') return;
    const key = `${lokal.exId}|${lokal.klasseId}|${lokal.exNummer}`;
    const verwandte = Object.values(this.sitzungen()).filter(l => `${l.exId}|${l.klasseId}|${l.exNummer}` === key);
    const vergeben = new Map();                    // Schüler-ID → Nummer
    let hoechste = 0;
    for (const l of verwandte) {
      for (const [nr, sid] of Object.entries(l.nummern || {})) {
        if (sid && !vergeben.has(sid)) vergeben.set(sid, nr);
        hoechste = Math.max(hoechste, Number(nr) || 0);
      }
    }
    for (const k of [...Object.keys(i.erlaubt || {}), ...Object.keys(i.fehlt || {})]) hoechste = Math.max(hoechste, Number(k.slice(1)) || 0);
    for (const t of Object.values(this.teilnehmer)) hoechste = Math.max(hoechste, Number(t.nummer) || 0);
    const nr = String(hoechste + 1);
    if (hoechste + 1 > 999) { alert('Es ist keine Nummer mehr frei.'); return; }

    let sid;
    if (cls.test) {
      if (!confirm(`Nr. ${nr} zusätzlich zulassen?`)) return;
      sid = 't' + nr;
    } else {
      const kandidaten = cls.students.filter(s => !vergeben.has(s.id));
      const ein = prompt('Wen zulassen?\n\n' +
        (kandidaten.length ? 'Noch nicht in dieser Ex:\n' + kandidaten.map((s, k) => `${k + 1}) ${Classes.studentName(s)}`).join('\n') +
          '\n\nNummer aus dieser Liste eingeben – oder einen neuen Namen (Vorname Nachname), der dann auch in die Klassenliste kommt.'
          : 'Einen Namen eingeben (Vorname Nachname). Er kommt auch in die Klassenliste.'), '');
      if (ein == null || !ein.trim()) return;
      const wahl = /^\d+$/.test(ein.trim()) ? kandidaten[Number(ein.trim()) - 1] : null;
      if (/^\d+$/.test(ein.trim()) && !wahl) { alert('Diese Nummer steht nicht in der Liste.'); return; }
      if (wahl) sid = wahl.id;
      else {
        const n = Classes.parseName(ein);
        if (!n || !n.last) { alert('Bitte einen Namen eingeben.'); return; }
        const gleich = cls.students.find(s => `${s.last}\u0000${s.first}`.toLocaleLowerCase('de') === `${n.last}\u0000${n.first}`.toLocaleLowerCase('de'));
        if (gleich && vergeben.has(gleich.id)) {
          const alt = vergeben.get(gleich.id);
          alert(`${Classes.studentName(gleich)} steht in dieser Ex schon als Nr. ${alt}.` +
            (i.fehlt && i.fehlt['n' + alt] ? ' Nimm dort „Doch da“.' : ''));
          return;
        }
        if (gleich) sid = gleich.id;
        else {
          const s = { id: Store.uid(), first: n.first, last: n.last };
          cls.students.push(s);
          Classes.sortStudents(cls);
          sid = s.id;
        }
      }
      const s = cls.students.find(x => x.id === sid);
      if (!confirm(`${Classes.studentName(s)} als Nr. ${nr} zulassen?\n\nAuf dem iPad den QR-Code neu scannen lassen – oder Nummer ${nr} wählen.`)) return;
    }

    // Erst lokal festhalten, damit das Dashboard den Namen sofort kennt
    for (const l of verwandte) l.nummern = { ...(l.nummern || {}), [nr]: sid };
    Classes.persist();
    try { Classes.renderClassList(); Classes.renderStudents(); } catch (e) {}
    document.dispatchEvent(new CustomEvent('ex-sitzungen'));
    await FB.update(this.ref('info'), { [`erlaubt/n${nr}`]: true });
  },

  /* Zeitzuschlag gesamt (nicht „noch einmal dazu“) – so lässt er sich auch zurücknehmen */
  minutenFragen(frage, bisher) {
    const ein = prompt(frage + '\n\nGesamter Zuschlag, 0 nimmt ihn zurück.', String((bisher || 0) + 5));
    if (ein == null) return null;
    const min = Math.round(Number(String(ein).replace(',', '.')));
    if (!Number.isFinite(min) || min < 0 || min > 120) { alert('Bitte eine Zahl von 0 bis 120 eingeben.'); return null; }
    return min;
  },

  /* Ex beenden: erst alle Geräte abgeben lassen (die Regeln nehmen nur an, solange
     die Ex läuft), dann schließen. Wer nicht antwortet, behält seinen letzten
     gespeicherten Stand – die Lehrkraft markiert ihn als abgegeben. */
  async beenden() {
    const offen = this.aktiveEintraege().filter(([uid, t]) =>
      t.status === 'freigegeben' && !(this.abgaben[uid] && this.abgaben[uid].abgegeben)).length;
    if (!confirm('Ex für alle beenden?' + (offen ? `\n\n${offen} haben noch nicht abgegeben – ihr aktueller Stand wird eingesammelt.` : ''))) return;
    const code = this.code;
    await FB.update(this.ref('info'), { einsammeln: FB.serverTimestamp() });
    // Schließen, sobald alle abgegeben haben – auf Nachzügler höchstens 8 s warten.
    // Die Geräte geben gleichzeitig ab, die Dauer hängt also nicht an der Klassengröße.
    const alleDa = () => this.aktiveEintraege().every(([uid, t]) =>
      t.status !== 'freigegeben' || (this.abgaben[uid] && this.abgaben[uid].abgegeben));
    const frist = Date.now() + 8000;
    while (Date.now() < frist && !alleDa()) await new Promise(r => setTimeout(r, 250));
    if (this.code !== code) return;
    const w = { [`exsessions/${code}/info/status`]: 'beendet', [`exsessions/${code}/info/endzeit`]: FB.serverTimestamp() };
    for (const [uid, t] of this.aktiveEintraege()) {
      if (t.status !== 'freigegeben' || (this.abgaben[uid] && this.abgaben[uid].abgegeben)) continue;
      w[`exsessions/${code}/abgaben/${uid}/abgegeben`] = true;
      w[`exsessions/${code}/abgaben/${uid}/abgegebenUm`] = FB.serverTimestamp();
      w[`exsessions/${code}/abgaben/${uid}/erzwungen`] = true;
    }
    await FB.update(FB.ref(FB.db, 'schoolTool'), w);
  },

  /* Freigeben: Status, Zeitzuschlag (die Regeln rechnen damit) und der Zugang,
     über den die Regeln das Lesen der Schülerfassung erlauben */
  freigabe(uid, t) {
    const s = `exsessions/${this.code}`;
    const w = { [`${s}/teilnehmer/${uid}/status`]: 'freigegeben', [`exzugang/${uid}`]: this.code };
    // Aus dem Steckbrief: Notenschutz gleich bestätigen, Zeitzuschlag eintragen –
    // aber nichts überschreiben, was die Lehrkraft hier schon von Hand gesetzt hat
    const sb = t ? this.steckbriefAusgleich(t.nummer) : {};
    if (sb.notenschutz && !t.notenschutz) w[`${s}/teilnehmer/${uid}/notenschutz`] = true;
    if (!t || typeof t.zuschlagMin !== 'number' || (t.zuschlagMin === 0 && sb.zuschlagMin)) {
      w[`${s}/teilnehmer/${uid}/zuschlagMin`] = sb.zuschlagMin || 0;
    }
    return w;
  },

  /* Notenschutz und Zeitzuschlag aus dem Steckbrief (Reiter Klassen). Prozent
     beziehen sich auf die Dauer dieser Sitzung, aufgerundet auf ganze Minuten. */
  steckbriefAusgleich(nr) {
    const lokal = this.lokal();
    const cls = lokal && this.klasseVon(lokal.klasseId);
    const s = cls && cls.students.find(x => x.id === lokal.nummern[nr]);
    if (!s) return {};
    let zuschlagMin = 0;
    if (s.exZuschlag && !(this.info && this.info.ohneLimit)) {
      zuschlagMin = s.exZuschlag.einheit === '%'
        ? Math.ceil((this.info ? this.info.dauerMinuten : 0) * s.exZuschlag.wert / 100)
        : s.exZuschlag.wert;
    }
    return { notenschutz: !!s.exNotenschutz, zuschlagMin: Math.min(120, zuschlagMin), roh: s.exZuschlag || null };
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
      ...(alt.krank || neu.krank ? { [`${s}/teilnehmer/${neuUid}/krank`]: true } : {}),
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
      document.dispatchEvent(new CustomEvent('ex-sitzungen'));
      this.vergessen();
    } catch (e) {
      alert('Abbrechen fehlgeschlagen: ' + e.message);
    }
  },

  /* ---------- Großansicht für die Leinwand ---------- */
  /* Beamer: nur der QR-Code, so groß wie es geht, im Farbschimmer der Seite.
     Kein Titel – die Klasse soll vorher nicht sehen, was drankommt. Klick schaltet Vollbild. */
  beamer() {
    if (!this.code || !this.info) return;
    const w = window.open('', 'ex-beamer', 'width=900,height=900');
    if (!w) { alert('Das Fenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.'); return; }
    this.beamerFenster = w;
    const link = this.link();
    const thema = document.documentElement.dataset.theme === 'light' ? 'light' : '';
    const css = getComputedStyle(document.documentElement);
    // Dunkle Punkte für den Scanner: im dunklen Thema die Grundfarbe, im hellen die Schriftfarbe
    const dunkel = css.getPropertyValue(thema ? '--text' : '--bg').trim();
    const stil = document.querySelector('link[href*="style.css"]').href;
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="de"${thema ? ` data-theme="${thema}"` : ''}><head><meta charset="UTF-8">
      <title>QR-Code</title>
      <link rel="stylesheet" href="${stil}">
      <style>
      html, body { height: 100%; }
      body { margin: 0; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer; }
      #qr { width: min(86vw, 86vh); aspect-ratio: 1; box-sizing: border-box; padding: min(3.5vw, 3.5vh); background: #fff;
        border-radius: min(3vw, 3vh); box-shadow: 0 0 0 2px var(--accent), 0 0 80px color-mix(in srgb, var(--accent) 45%, transparent); }
      #qr canvas, #qr img { display: block; width: 100% !important; height: auto !important; image-rendering: pixelated; }
      #tipp { position: fixed; bottom: 1rem; left: 0; right: 0; text-align: center; color: var(--muted); font-size: .9rem; transition: opacity 1s; }
      </style></head><body>
      <div id="qr"></div><div id="tipp">Klicken für Vollbild</div>
      </body></html>`);
    w.document.close();
    w.document.body.addEventListener('click', () => {
      const d = w.document;
      if (d.fullscreenElement) d.exitFullscreen(); else d.documentElement.requestFullscreen().catch(() => {});
    });
    w.setTimeout(() => { const t = w.document.getElementById('tipp'); if (t) t.style.opacity = '0'; }, 4000);
    const skript = w.document.createElement('script');
    skript.src = new URL('js/vendor/qrcode.min.js', location.href).href;
    skript.onload = () => {
      new w.QRCode(w.document.getElementById('qr'), {
        text: link, width: 1024, height: 1024,
        colorDark: dunkel.startsWith('#') && dunkel.length === 7 ? dunkel : '#120f26', colorLight: '#ffffff',
        correctLevel: w.QRCode.CorrectLevel.L,
      });
    };
    w.document.head.appendChild(skript);
  },
};
