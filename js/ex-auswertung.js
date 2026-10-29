/* Ex-Auswertung – nur auf dem Lehrergerät.

   Lösung und Bewertungscode kommen aus exgeheim/<exId> (nur die Lehrkraft darf
   sie lesen). bewerte() läuft in einem Web Worker – fremder Code bekommt so
   keinen Zugriff auf diese Seite, die Klassenliste oder die Datenbank.

   Eine Auswertung fasst alle Sitzungen derselben Ex für dieselbe Klasse und
   dieselbe Ex-Nummer zusammen (Hauptsitzung + Nachschreiben). Korrekturen und
   Notenschlüssel liegen lokal in Classes.data.exAuswertungen und reisen über
   den Tresor nur verschlüsselt auf die anderen Geräte der Lehrkraft:
     { [key]: { korrektur: { <Nr>: { d: { <Aufgabe>: { <Index>: Punkte } },
                                     m: { <Aufgabe>: Punkte } } },
                schluessel: { p4, p6, b, grenzen? }, projektId, archiviert? } }
   Archivierte Auswertungen stehen nur unter „Archivierte zeigen“, lassen sich
   aber genauso öffnen und weiter korrigieren.
   Namen gibt es nur hier – in der Datenbank stehen Nummern. */
const ExAuswertung = {
  SMILEYS: ['😄', '🙂', '😐', '😕', '😣'],
  STANDARD: { p4: 50, p6: 20, b: 0 },

  a: null,                // die geöffnete Auswertung
  korrekturNr: null,      // wer gerade in der Korrekturansicht ist

  init() {
    if (!document.getElementById('ex-auswertung')) return;
    const liste = e => {
      const b = e.target.closest('[data-ex-key]');
      if (b) this.oeffnen(b.dataset.exKey);
    };
    document.getElementById('ex-auswertung-liste').addEventListener('click', liste);
    document.getElementById('ex-auswertung-archiv-liste').addEventListener('click', liste);
    document.addEventListener('ex-anmeldung', e => this.schalten(e.detail.lehrer));
    document.addEventListener('ex-sitzungen', () => this.listeFuellen());
    const sa = document.getElementById('ex-schueleransicht');
    sa.addEventListener('click', e => {
      const b = e.target.closest('[data-aktion]');
      if (!b) return;
      if (b.dataset.aktion === 'zu') this.schueleransichtSchliessen();
      if (b.dataset.aktion === 'vollbild') {
        if (document.fullscreenElement || document.webkitFullscreenElement) this.vollbildAus();
        else this.vollbild();
      }
    });
    const inhalt = document.getElementById('ex-auswertung-inhalt');
    inhalt.addEventListener('click', e => this.klick(e));
    inhalt.addEventListener('input', e => this.eingabe(e));
    inhalt.addEventListener('change', e => this.eingabe(e, true));
    const k = document.getElementById('ex-korrektur');
    k.addEventListener('click', e => this.korrekturKlick(e));
    k.addEventListener('change', e => this.korrekturEingabe(e));
    window.addEventListener('message', e => this.nachricht(e));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !sa.hidden) { this.schueleransichtSchliessen(); return; }
      if (k.hidden) return;
      if (e.key === 'Escape') this.korrekturSchliessen();
      // ← → blättern, außer beim Tippen in einem Feld
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.metaKey && !e.ctrlKey && !e.altKey &&
          !(e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'))) {
        e.preventDefault();
        this.blaettern(e.key === 'ArrowRight' ? 1 : -1);
      }
    });
  },

  schalten(lehrer) {
    document.getElementById('ex-auswertung').hidden = !lehrer;
    if (lehrer) this.listeFuellen();
  },

  /* ---------- Welche Auswertungen gibt es ---------- */
  schluesselVon(s) { return `${s.exId}|${s.klasseId}|${s.exNummer}`; },

  gruppen() {
    const g = {};
    for (const [code, s] of Object.entries(Classes.data.exSitzungen || {})) {
      const key = this.schluesselVon(s);
      (g[key] = g[key] || { key, ...s, codes: [] }).codes.push(code);
      g[key].erstellt = Math.min(g[key].erstellt, s.erstellt);
    }
    return Object.values(g).sort((a, b) => b.erstellt - a.erstellt);
  },

  istArchiviert(key) {
    const d = (Classes.data.exAuswertungen || {})[key];
    return !!(d && d.archiviert);
  },

  /* Schuljahr beginnt im August: „2026/27“ */
  schuljahr(zeit) {
    const d = new Date(zeit), j = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    return `${j}/${String(j + 1).slice(2)}`;
  },

  /* Liste der geschriebenen Exen der oben gewählten Klasse; archivierte
     darunter aufklappbar, nach Schuljahr */
  listeFuellen() {
    const kid = typeof ExReiter !== 'undefined' ? ExReiter.klasseId() : '';
    const gibtKlasse = id => id === ExSitzung.TESTRAUM || Classes.data.classes.some(c => c.id === id);
    const alle = this.gruppen().filter(g => !kid || (kid === ExReiter.WEG ? !gibtKlasse(g.klasseId) : g.klasseId === kid));
    const aktiv = alle.filter(x => !this.istArchiviert(x.key));
    const archiv = alle.filter(x => this.istArchiviert(x.key));
    const esc = s => Band.esc(s);
    const offen = this.a && this.a.key;
    const eintrag = x => {
      const d = (Classes.data.exAuswertungen || {})[x.key] || {};
      const cls = Classes.data.classes.find(c => c.id === x.klasseId);
      const inListe = d.projektId && cls && cls.projects.some(p => p.id === d.projektId);
      return `<li><button class="ex-auswertung-eintrag${x.key === offen ? ' active' : ''}" data-ex-key="${esc(x.key)}">
        <strong>${esc(x.exNummer)}. ${esc(x.titel)}</strong>
        <span class="hint">Klasse ${esc(x.klasse)} · ${new Date(x.erstellt).toLocaleDateString('de-DE')}` +
        `${x.codes.length > 1 ? ` · ${x.codes.length} Sitzungen` : ''}${inListe ? ' · in der Notenliste' : ''}</span></button></li>`;
    };
    document.getElementById('ex-auswertung-liste').innerHTML = aktiv.map(eintrag).join('');
    const leer = document.getElementById('ex-auswertung-leer');
    leer.hidden = aktiv.length > 0;
    leer.textContent = archiv.length ? 'Alle Exen dieser Klasse sind archiviert.' : 'In dieser Klasse wurde noch keine Ex geschrieben.';
    const jahre = {};
    archiv.forEach(x => (jahre[this.schuljahr(x.erstellt)] = jahre[this.schuljahr(x.erstellt)] || []).push(x));
    document.getElementById('ex-auswertung-archiv-liste').innerHTML = Object.keys(jahre).sort().reverse().map(j =>
      `<h4>Schuljahr ${j}</h4><ul class="ex-auswertung-liste">${jahre[j].map(eintrag).join('')}</ul>`).join('');
    const det = document.getElementById('ex-auswertung-archiv');
    det.hidden = !archiv.length;
    document.getElementById('ex-auswertung-archiv-zahl').textContent = `(${archiv.length})`;
    if (offen && archiv.some(x => x.key === offen)) det.open = true;
  },

  /* Andere Klasse oben gewählt: eine offene Auswertung einer anderen Klasse schließen */
  klasseGewechselt() {
    if (this.a && typeof ExReiter !== 'undefined') {
      const kid = ExReiter.klasseId();
      const passt = kid === ExReiter.WEG ? !ExSitzung.klasseVon(this.a.gruppe.klasseId)
        : this.a.gruppe.klasseId === kid;
      if (!passt) { this.a = null; document.getElementById('ex-auswertung-inhalt').innerHTML = ''; }
    }
    this.listeFuellen();
  },

  daten(key) {
    const alle = Classes.data.exAuswertungen = Classes.data.exAuswertungen || {};
    return alle[key] = alle[key] || { korrektur: {}, schluessel: null, projektId: null };
  },

  standard() { return { ...this.STANDARD, ...(Classes.data.exNotenStandard || {}) }; },

  /* ---------- Laden und bewerten ---------- */
  async oeffnen(key) {
    const gruppe = this.gruppen().find(g => g.key === key);
    if (!gruppe) return;
    const inhalt = document.getElementById('ex-auswertung-inhalt');
    if (typeof ExReiter !== 'undefined') ExReiter.zeigen('korrigieren', gruppe.klasseId);
    this.a = null;
    inhalt.innerHTML = '<p class="hint">Lade und bewerte …</p>';
    try {
      const db = FB.db, ref = FB.ref, get = FB.get;
      const [geheim, metaSnap, teile] = await Promise.all([
        get(ref(db, `schoolTool/exgeheim/${gruppe.exId}`)),
        get(ref(db, `schoolTool/exen/${gruppe.exId}/meta`)),
        get(ref(db, `schoolTool/exen/${gruppe.exId}/schueler`)),
      ]);
      const sitzungen = {};
      for (const code of gruppe.codes) {
        const s = (await get(ref(db, `schoolTool/exsessions/${code}`))).val();
        if (s) sitzungen[code] = s;
      }
      const cls = ExSitzung.klasseVon(gruppe.klasseId);
      // Ex aus der Bibliothek gelöscht: Bewerten geht nicht, Archivieren und Löschen schon
      if (!geheim.exists() || !metaSnap.exists()) {
        const info = (Object.values(sitzungen)[0] || {}).info || {};
        this.a = {
          key, gruppe, cls, sitzungen, ohneEx: true, schueler: [], d: this.daten(key),
          meta: { titel: gruppe.titel || info.titel || 'Ex', art: info.art || 'Ex', aufgaben: [] },
        };
        this.ohneExZeichnen();
        return;
      }
      const t = teile.val() || {};
      let html = '';
      for (let n = 0; n < (t.teile || 0); n++) html += t['t' + n] || '';
      this.a = {
        key, gruppe, cls, sitzungen, html,
        meta: JSON.parse(metaSnap.val()),
        loesung: JSON.parse(geheim.val().loesung),
        bewertung: geheim.val().bewertung,
        d: this.daten(key),
        schueler: [],
      };
      this.schuelerSammeln();
      await this.testNamen();
      await this.bewerteAlle();
      this.zeichnen();
    } catch (e) {
      inhalt.innerHTML = `<p class="ex-warnung-box">${Band.esc(e.message)}</p>`;
    }
  },

  /* Je Nummer der maßgebliche Eintrag: eine Abgabe schlägt keine Abgabe, eine
     spätere Sitzung (Nachschreiben) eine frühere */
  schuelerSammeln() {
    const a = this.a;
    const nachNr = {};
    // Ein Platzhalter (fehlt / nicht teilgenommen) darf von einer späteren Sitzung ersetzt werden
    const ohneEintrag = nr => !nachNr[nr] || (!nachNr[nr].t && !nachNr[nr].abgabe);
    const codes = Object.keys(a.sitzungen).sort((x, y) =>
      (a.sitzungen[x].info.erstellt || 0) - (a.sitzungen[y].info.erstellt || 0));
    for (const code of codes) {
      const s = a.sitzungen[code];
      const lokal = (Classes.data.exSitzungen || {})[code] || {};
      for (const [uid, t] of Object.entries(s.teilnehmer || {})) {
        if (t.status === 'ersetzt' || t.status === 'wartet') continue;
        const abgabe = (s.abgaben || {})[uid] || null;
        const alt = nachNr[t.nummer];
        if (alt && alt.abgabe && !abgabe) continue;
        let antworten = null;
        try { antworten = abgabe && abgabe.antworten ? JSON.parse(abgabe.antworten) : null; } catch (e) { antworten = null; }
        nachNr[t.nummer] = { nr: t.nummer, sid: lokal.nummern && lokal.nummern[t.nummer], code, uid, t, info: s.info, abgabe, antworten };
      }
      for (const k of Object.keys(s.info.fehlt || {})) {
        const nr = k.slice(1);
        if (ohneEintrag(nr)) nachNr[nr] = { nr, sid: lokal.nummern && lokal.nummern[nr], code, info: s.info, fehlt: true };
      }
      for (const k of Object.keys(s.info.erlaubt || {})) {
        const nr = k.slice(1);
        if (ohneEintrag(nr)) nachNr[nr] = { nr, sid: lokal.nummern && lokal.nummern[nr], code, info: s.info, nichtDa: true };
      }
    }
    a.schueler = Object.values(nachNr).sort((x, y) => x.nr - y.nr);
    for (const s of a.schueler) s.name = this.name(s.sid);
  },

  /* Testraum: die selbst gewählten Namen entschlüsseln – „Nr. 3 · Mia“ */
  async testNamen() {
    const a = this.a;
    if (!a.cls || !a.cls.test) return;
    for (const s of a.schueler) {
      const lokal = (Classes.data.exSitzungen || {})[s.code] || {};
      if (!s.t || !s.t.nameV || !lokal.namensSchluessel) continue;
      const name = await ExNamen.entschluesseln(lokal.namensSchluessel, s.t.nameV);
      if (name) s.name = `Nr. ${s.nr} · ${name}`;
    }
  },

  /* Gesichter aus Sitzplan/Steckbrief – dieselben wie in der Klassenliste,
     der Schalter „Gesichter“ oben blendet sie mit aus */
  gesichtHtml(s, gross) {
    const cls = this.a.cls;
    if (!cls || cls.test || typeof Sitzplan === 'undefined' || !Sitzplan.hatFotos(cls)) return '';
    const st = cls.students.find(x => x.id === s.sid);
    if (!st) return '';
    const ini = ((st.first || '')[0] || '') + ((st.last || '')[0] || '');
    return `<span class="mini-gesicht ohne${gross ? ' ex-gesicht-gross' : ''}" data-ex-gesicht="${Band.esc(st.id)}" data-initialen="${Band.esc(ini)}"></span>`;
  },

  gesichterEinsetzen(root) {
    const cls = this.a && this.a.cls;
    if (!cls) return;
    root.querySelectorAll('[data-ex-gesicht]').forEach(el => {
      const st = cls.students.find(x => x.id === el.dataset.exGesicht);
      if (st) Schueler.gesichtEinsetzen(el, cls, st, el.classList.contains('ex-gesicht-gross') ? 160 : 96);
    });
  },

  name(sid) {
    const s = this.a.cls && this.a.cls.students.find(x => x.id === sid);
    return s ? Classes.studentName(s) : '(nicht mehr in der Klassenliste)';
  },

  bewerteAlle() {
    const a = this.a;
    const auftraege = a.schueler.filter(s => s.abgabe);
    if (!auftraege.length) return Promise.resolve();
    return new Promise(resolve => {
      const code = URL.createObjectURL(new Blob([a.bewertung], { type: 'text/javascript' }));
      const rahmen = `importScripts(${JSON.stringify(code)});
        self.onmessage = function (e) {
          var m = e.data;
          try { self.postMessage({ i: m.i, r: bewerte(m.antworten, m.loesung, m.kontext) }); }
          catch (err) { self.postMessage({ i: m.i, fehler: String(err && err.message || err) }); }
        };`;
      const url = URL.createObjectURL(new Blob([rahmen], { type: 'text/javascript' }));
      const w = new Worker(url);
      let offen = auftraege.length;
      const fertig = () => { w.terminate(); URL.revokeObjectURL(url); URL.revokeObjectURL(code); resolve(); };
      const frist = setTimeout(() => {
        auftraege.filter(s => !s.r && !s.fehler).forEach(s => { s.fehler = 'Bewertung hat zu lange gebraucht.'; });
        fertig();
      }, 15000);
      w.onmessage = e => {
        const s = auftraege[e.data.i];
        if (e.data.fehler) s.fehler = e.data.fehler; else s.r = e.data.r;
        if (--offen === 0) { clearTimeout(frist); fertig(); }
      };
      w.onerror = e => {
        e.preventDefault();
        auftraege.forEach(s => { if (!s.r) s.fehler = 'Der Bewertungscode hat einen Fehler: ' + e.message; });
        clearTimeout(frist);
        fertig();
      };
      auftraege.forEach((s, i) => w.postMessage({
        i, antworten: s.antworten || {}, loesung: a.loesung, kontext: { notenschutz: !!s.t.notenschutz },
      }));
    });
  },

  /* ---------- Punkte (mit Korrekturen) ---------- */
  korr(nr) {
    const k = this.a.d.korrektur;
    return k[nr] = k[nr] || { d: {}, m: {} };
  },

  /* Punkte einer Aufgabe: automatische Punkte, verschoben um jede Korrektur.
     Manuelle Aufgaben zählen erst mit, wenn die Lehrkraft Punkte vergibt –
     bis dahin (fürs ungefähre Notenbild) mit dem Vorschlag, als vorläufig. */
  aufgabePunkte(s, aufgabe) {
    const x = s.r && s.r.aufgaben && s.r.aufgaben[aufgabe.id];
    const k = this.korr(s.nr);
    const max = x && typeof x.max === 'number' ? x.max : aufgabe.punkte;
    if (!x) return { punkte: 0, max, offen: 0 };
    if (x.manuell || x.punkte == null) {
      const m = k.m[aufgabe.id];
      if (typeof m === 'number') return { punkte: m, max, offen: 0 };
      return { punkte: Number(x.vorschlag) || 0, max, offen: 1, vorschlag: true };
    }
    let punkte = Number(x.punkte) || 0, offen = 0;
    (x.details || []).forEach((d, i) => {
      const o = k.d[aufgabe.id] && k.d[aufgabe.id][i];
      if (typeof o === 'number') punkte += o - (Number(d.punkte) || 0);
      else if (d.pruefen || d.status === 'pruefen') offen++;
    });
    return { punkte, max, offen };
  },

  ergebnis(s) {
    if (!s.r) return null;
    const je = {};
    let summe = 0, offen = 0, vorschlag = false;
    for (const aufgabe of this.a.meta.aufgaben) {
      const p = this.aufgabePunkte(s, aufgabe);
      je[aufgabe.id] = p;
      summe += p.punkte;
      offen += p.offen;
      vorschlag = vorschlag || !!p.vorschlag;
    }
    summe = Math.round(summe * 2) / 2;
    return { je, summe, offen, vorlaeufig: offen > 0, note: this.note(summe) };
  },

  /* ---------- Notenschlüssel ----------
     Standard: Die schlechteste 4 gibt es ab p4 % der Punkte; darüber vier gleich
     breite Stufen bis zur 1. Unter p6 % gibt es die 6. b macht die Dreierspanne
     breiter und dafür die 1er-, 2er-, 4er- und 5er-Spanne schmäler (die Summe
     bleibt gleich). Grenzen auf halbe Punkte. Von Hand gesetzte Grenzen gehen vor. */
  schluessel() {
    return { ...this.standard(), ...(this.a.d.schluessel || {}) };
  },

  grenzen() {
    const sch = this.schluessel(), max = this.a.meta.punkteGesamt;
    if (sch.grenzen) return sch.grenzen;
    const halb = x => Math.round(x * 2) / 2;
    const b = Math.min(0.5, Math.max(0, sch.b / 100));
    const g4 = max * sch.p4 / 100;
    const w = (max - g4) / 4;
    const g3 = g4 + w * (1 - b);
    const g2 = g3 + w * (1 + 3 * b);
    const g1 = g2 + w * (1 - b);
    const g5 = g4 - (g4 - max * sch.p6 / 100) * (1 - b);
    return { 1: halb(g1), 2: halb(g2), 3: halb(g3), 4: halb(g4), 5: halb(g5) };
  },

  note(punkte) {
    const g = this.grenzen();
    for (const n of [1, 2, 3, 4, 5]) if (punkte >= g[n]) return n;
    return 6;
  },


  /* ---------- Übersicht ---------- */
  zeitzuschlag(s) {
    if (!s.t) return null;
    const i = s.info;
    const gewaehrt = (i.zuschlagMin || 0) + (s.t.zuschlagMin || 0);
    let genutzt = 0;
    if (s.abgabe && s.abgabe.abgegebenUm && i.startzeit) {
      genutzt = Math.max(0, Math.ceil((s.abgabe.abgegebenUm - (i.startzeit + i.dauerMinuten * 60000)) / 60000));
      genutzt = Math.min(genutzt, gewaehrt);
    }
    return { gewaehrt, genutzt };
  },

  zuschlagText(s) {
    const z = this.zeitzuschlag(s);
    if (!z || !z.gewaehrt) return 'nein';
    return `ja, +${z.gewaehrt} min` + (z.genutzt ? ` (${z.genutzt} min genutzt)` : ' (nicht genutzt)');
  },

  fmt(x) { return String(x).replace('.', ','); },

  bereichText(n) {
    const g = this.grenzen(), max = this.a.meta.punkteGesamt, f = x => this.fmt(x);
    if (n === 1) return `${f(g[1])}–${f(max)}`;
    if (n === 6) return g[5] > 0 ? `0–${f(Math.max(0, g[5] - 0.5))}` : '–';
    return `${f(g[n])}–${f(g[n - 1] - 0.5)}`;
  },

  /* Alle bewerteten Schüler mit aktuellem Ergebnis, nach Note sortiert */
  /* Schnitt, Notenbild und Notenliste: ohne die, die als „krank, zählt nicht“ markiert sind */
  ergebnisse() {
    return this.a.schueler.filter(s => s.r && !this.zaehltNicht(s.nr)).map(s => ({ s, e: this.ergebnis(s) }));
  },

  /* Grundgerüst; die Teile darin zeichnen sich einzeln, damit beim Ziehen am
     Notenschlüssel der gezogene Punkt nicht neu entsteht */
  zeichnen() {
    const a = this.a, esc = s => Band.esc(s);
    const inhalt = document.getElementById('ex-auswertung-inhalt');
    inhalt.innerHTML = `
      <div class="ex-auswertung-kopf">
        <h3>${esc(a.gruppe.exNummer)}. ${esc(a.meta.art || 'Ex')}: ${esc(a.meta.titel)} · ${esc(a.gruppe.klasse)}</h3>
        <button class="primary" data-aktion="schueleransicht-voll" data-icon="eye"
          title="Notenbild für die Klasse: Punkte je Note, Anzahl und Durchschnitt – ohne Namen">Schüleransicht im Vollbild</button>
      </div>
      <div class="ex-notenschluessel">
        <div>
          <h4>Notenschlüssel <span class="hint">(${this.fmt(a.meta.punkteGesamt)} Punkte)</span></h4>
          <div id="ex-ns-regler" class="ex-notenschluessel-regler"></div>
          <div id="ex-ns-balken" class="ex-ns-balken"></div>
        </div>
        <div id="ex-notenbild" class="ex-notenbild"></div>
      </div>
      <div id="ex-uebersicht"></div>
      ${this.selbstHtml()}
      <div class="btn-row ex-auswertung-aktionen">
        <button class="primary" data-aktion="export-notenliste" data-icon="book">In die Notenliste übernehmen</button>
        <button data-aktion="export-csv" data-icon="download">CSV</button>
        <button data-aktion="drucken" data-icon="printer">Alle drucken</button>
        <label class="ex-mit-loesungen"><input type="checkbox" id="ex-druck-loesungen" checked> mit Lösungen</label>
        <button data-aktion="nachschreiben" class="small">Nachschreiben vorbereiten</button>
        <button data-aktion="schueleransicht" data-icon="eye" title="Nur Notenbild, Punkte und Schnitt – ohne Namen, zum Zeigen am Beamer">Schüleransicht</button>
        <button class="small" data-aktion="noten-entfernen" id="ex-noten-entfernen" hidden>Noten aus der Notenliste entfernen</button>
        <button class="small" data-aktion="archivieren" id="ex-archivieren"></button>
        <button class="small danger" data-aktion="endgueltig-loeschen" id="ex-endgueltig-loeschen" data-icon="trash" hidden
          title="Sitzungen, Abgaben und Korrekturen dieser Ex für diese Klasse löschen – lässt sich nicht rückgängig machen">Endgültig löschen</button>
        <button class="small" data-aktion="neu-bewerten" data-icon="reset" title="Abgaben neu laden und neu bewerten (etwa nach einem Neu-Import der Ex)">Neu laden</button>
      </div>`;
    this.reglerZeichnen();
    this.balkenBauen();
    this.notenAktualisieren();
    this.knoepfeAktualisieren();
    this.listeFuellen();
    Icons.hydrate(inhalt);
  },

  /* Ex nicht mehr in der Bibliothek: Hinweis und nur die Knöpfe, die ohne sie gehen */
  ohneExZeichnen() {
    const a = this.a, esc = s => Band.esc(s);
    const abgaben = Object.values(a.sitzungen).reduce((n, s) => n + Object.keys(s.abgaben || {}).length, 0);
    const inhalt = document.getElementById('ex-auswertung-inhalt');
    inhalt.innerHTML = `
      <div class="ex-auswertung-kopf"><h3>${esc(a.gruppe.exNummer)}. ${esc(a.meta.art)}: ${esc(a.meta.titel)} · ${esc(a.gruppe.klasse)}</h3></div>
      <p class="ex-warnung-box">Diese Ex ist nicht mehr in der Bibliothek. ${abgaben} ${abgaben === 1 ? 'Abgabe ist' : 'Abgaben sind'} noch da,
        lassen sich aber erst wieder bewerten, wenn du dieselbe Ex-Datei erneut importierst.
        Brauchst du sie nicht mehr: archivieren und dann endgültig löschen.</p>
      <div class="btn-row ex-auswertung-aktionen">
        <button class="small" data-aktion="noten-entfernen" id="ex-noten-entfernen" hidden>Noten aus der Notenliste entfernen</button>
        <button class="small" data-aktion="archivieren" id="ex-archivieren"></button>
        <button class="small danger" data-aktion="endgueltig-loeschen" id="ex-endgueltig-loeschen" data-icon="trash" hidden>Endgültig löschen</button>
        <button class="small" data-aktion="neu-bewerten" data-icon="reset" title="Nach einem Neu-Import der Ex">Neu laden</button>
      </div>`;
    this.knoepfeAktualisieren();
    this.listeFuellen();
    Icons.hydrate(inhalt);
  },

  /* Notenliste-Eintrag dieser Auswertung, falls es ihn (noch) gibt */
  projekt() {
    const a = this.a;
    return (a.d.projektId && a.cls && a.cls.projects.find(x => x.id === a.d.projektId)) || null;
  },

  knoepfeAktualisieren() {
    const test = !!(this.a.cls && this.a.cls.test);
    const exp = document.querySelector('#ex-auswertung-inhalt [data-aktion="export-notenliste"]');
    if (exp) exp.hidden = test;
    const p = this.projekt();
    const ent = document.getElementById('ex-noten-entfernen');
    ent.hidden = !p;
    if (p) ent.title = `Löscht „${p.name}“ aus der Notenliste von ${this.a.cls.name}. Die Auswertung bleibt.`;
    const arch = document.getElementById('ex-archivieren');
    const ist = !!this.a.d.archiviert;
    arch.textContent = ist ? 'Aus dem Archiv holen' : 'Archivieren';
    document.getElementById('ex-endgueltig-loeschen').hidden = !ist;
    arch.title = ist ? 'Wieder in der normalen Liste zeigen'
      : 'Aus der Liste nehmen – unter „Archivierte zeigen“ bleibt sie erreichbar und lässt sich weiter korrigieren';
  },

  archivieren() {
    const a = this.a;
    if (a.d.archiviert) delete a.d.archiviert;
    else a.d.archiviert = Date.now();
    Classes.persist();
    // Die geöffnete Auswertung bleibt in der Auswahl, auch wenn das Archiv ausgeblendet ist
    this.listeFuellen();
    this.knoepfeAktualisieren();
  },

  /* Nur archivierte Auswertungen: Sitzungen samt Abgaben aus der Datenbank,
     Zugänge der Schüler-iPads, Korrekturen und Notenschlüssel hier. Die Ex in
     der Bibliothek bleibt. */
  async endgueltigLoeschen() {
    const a = this.a;
    if (!a || !a.d.archiviert) return;
    const name = `${a.gruppe.exNummer}. ${a.meta.art || 'Ex'}: ${a.meta.titel} (Klasse ${a.gruppe.klasse})`;
    if (!confirm(`„${name}“ endgültig löschen?\n\nWeg sind dann: alle Abgaben` +
      (a.gruppe.codes.length > 1 ? ` aus ${a.gruppe.codes.length} Sitzungen` : '') +
      ', deine Korrekturen und der Notenschlüssel. Das lässt sich nicht rückgängig machen.' +
      (a.ohneEx ? '' : '\nDie Ex selbst bleibt in der Bibliothek.'))) return;
    const p = this.projekt();
    const mitNoten = p && confirm(`„${p.name}“ steht noch in der Notenliste von ${a.cls.name}.\n\n` +
      'OK: Noten dort auch löschen\nAbbrechen: Noten in der Notenliste behalten');
    const w = {};
    for (const code of a.gruppe.codes) {
      w[`exsessions/${code}`] = null;
      const uids = Object.keys((a.sitzungen[code] || {}).teilnehmer || {});
      for (const uid of uids) {
        const z = await FB.get(FB.ref(FB.db, `schoolTool/exzugang/${uid}`)).catch(() => null);
        if (z && z.val() === code) w[`exzugang/${uid}`] = null;
      }
    }
    try {
      await FB.update(FB.ref(FB.db, 'schoolTool'), w);
    } catch (e) {
      alert('Löschen in der Datenbank fehlgeschlagen: ' + e.message);
      return;
    }
    if (ExSitzung.code && a.gruppe.codes.includes(ExSitzung.code)) ExSitzung.vergessen();
    a.gruppe.codes.forEach(code => { delete (Classes.data.exSitzungen || {})[code]; });
    delete Classes.data.exAuswertungen[a.key];
    if (mitNoten) {
      a.cls.projects = a.cls.projects.filter(x => x.id !== p.id);
      if (Classes.currentProjectId === p.id) Classes.currentProjectId = null;
      if (Classes.currentClassId === a.cls.id) Classes.renderProjects();
    }
    Classes.persist();
    this.a = null;
    document.getElementById('ex-auswertung-inhalt').innerHTML = '';
    this.listeFuellen();
    document.dispatchEvent(new CustomEvent('ex-sitzungen'));
  },

  notenEntfernen() {
    const a = this.a, p = this.projekt();
    if (!p || !confirm(`„${p.name}“ samt allen Noten aus der Notenliste von ${a.cls.name} löschen?\n\n` +
      'Die Ex-Auswertung mit deinen Korrekturen bleibt erhalten; du kannst die Noten später wieder übernehmen.')) return;
    a.cls.projects = a.cls.projects.filter(x => x.id !== p.id);
    a.d.projektId = null;
    if (Classes.currentProjectId === p.id) Classes.currentProjectId = null;
    Classes.persist();
    if (Classes.currentClassId === a.cls.id) Classes.renderProjects();
    this.knoepfeAktualisieren();
  },

  /* ---------- Schüleransicht: nur Notenbild, ohne Namen ---------- */
  schueleransicht() {
    const a = this.a, esc = s => Band.esc(s), fmt = x => this.fmt(x);
    const liste = this.ergebnisse();
    const zahl = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    liste.forEach(x => { zahl[x.e.note]++; });
    const hoechst = Math.max(1, ...Object.values(zahl));
    const schnitt = liste.length ? fmt((liste.reduce((n, x) => n + x.e.note, 0) / liste.length).toFixed(2)) : '–';
    const vorlaeufig = liste.some(x => x.e.vorlaeufig);
    const el = document.getElementById('ex-schueleransicht');
    el.innerHTML = `
      <div class="ex-sa-leiste">
        <button class="small" data-aktion="vollbild" data-icon="window">Vollbild</button>
        <button class="small" data-aktion="zu" data-icon="x">Schließen</button>
      </div>
      <div class="ex-sa-inhalt">
        <h2>${esc(a.gruppe.exNummer)}. ${esc(a.meta.art || 'Ex')}: ${esc(a.meta.titel)}</h2>
        <p class="ex-sa-unter">${esc(a.gruppe.klasse)} · ${fmt(a.meta.punkteGesamt)} Punkte${vorlaeufig ? ' · vorläufig' : ''}</p>
        <table class="ex-sa-tabelle">
          <thead><tr><th>Note</th><th>Punkte</th><th colspan="2">Anzahl</th></tr></thead>
          <tbody>${[1, 2, 3, 4, 5, 6].map(n => `
            <tr><td class="ex-sa-note">${n}</td><td class="ex-sa-punkte">${this.bereichText(n)}</td>
              <td class="ex-sa-balken"><span class="n${n}" style="width:${Math.round(100 * zahl[n] / hoechst)}%"></span></td>
              <td class="ex-sa-zahl">${zahl[n]}</td></tr>`).join('')}
          </tbody>
        </table>
        <p class="ex-sa-schnitt">Notendurchschnitt <strong>${schnitt}</strong>
          <span>${liste.length} ${liste.length === 1 ? 'Arbeit' : 'Arbeiten'}</span></p>
      </div>`;
    Icons.hydrate(el);
    el.hidden = false;
    document.body.classList.add('ex-korrektur-offen');
  },

  /* Vollbild; Safari auf dem iPad kennt nur die webkit-Fassung */
  vollbild() {
    const el = document.getElementById('ex-schueleransicht');
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  },

  vollbildAus() {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  },

  schueleransichtSchliessen() {
    this.vollbildAus();
    document.getElementById('ex-schueleransicht').hidden = true;
    document.body.classList.remove('ex-korrektur-offen');
  },

  /* Was sich mit jeder Grenze oder Korrektur ändert */
  notenAktualisieren() {
    this.balkenLage();
    this.notenbildZeichnen();
    this.uebersichtZeichnen();
  },

  reglerZeichnen() {
    const sch = this.schluessel();
    document.getElementById('ex-ns-regler').innerHTML = `
      <label>Schlechteste 4 ab <input type="number" min="20" max="80" step="1" value="${sch.p4}" data-param="p4"> %</label>
      <label>6 unter <input type="number" min="0" max="50" step="1" value="${sch.p6}" data-param="p6"> %</label>
      <label class="ex-regler">Dreierspanne breiter <input type="range" min="0" max="50" step="5" value="${sch.b}" data-param="b">
        <span class="hint">${sch.b ? `+${sch.b} %` : 'gleich breit'}</span></label>
      ${sch.grenzen ? '<p class="hint">Grenzen von Hand verschoben. <button class="small" data-aktion="grenzen-weg">Wieder aus den Reglern berechnen</button></p>' : ''}
      <div class="btn-row">
        <button class="small" data-aktion="standard-speichern" title="Diese Regler-Werte als Vorgabe für künftige Exen merken">Als Standard speichern</button>
        <button class="small" data-aktion="standard-laden">Standard laden</button>
      </div>`;
  },

  /* ---------- Der senkrechte Balken: oben volle Punktzahl, unten 0 ---------- */
  balkenBauen() {
    const box = document.getElementById('ex-ns-balken');
    const max = this.a.meta.punkteGesamt;
    box.innerHTML = `
      <div class="ex-nsb-spur">
        ${[1, 2, 3, 4, 5, 6].map(n => `<div class="ex-nsb-abschnitt n${n}" data-note="${n}">
          <span class="ex-nsb-note">${n}</span><span class="ex-nsb-zahl"></span></div>`).join('')}
        <div class="ex-nsb-schueler"></div>
        <div class="ex-nsb-griff fest" style="top:0%"><span class="ex-nsb-wert">${this.fmt(max)} P</span><span class="ex-nsb-knopf" title="volle Punktzahl"></span></div>
        ${[1, 2, 3, 4, 5].map(n => `<div class="ex-nsb-griff" data-grenze="${n}" tabindex="0" role="slider"
            aria-label="Beginn der Note ${n}" aria-valuemin="0" aria-valuemax="${max}">
          <span class="ex-nsb-wert"></span><span class="ex-nsb-knopf"></span></div>`).join('')}
      </div>`;
    const spur = box.querySelector('.ex-nsb-spur');
    box.querySelectorAll('.ex-nsb-griff[data-grenze]').forEach(griff => {
      griff.addEventListener('pointerdown', e => this.ziehenStart(e, griff, spur));
      griff.addEventListener('keydown', e => this.griffTaste(e, griff));
    });
  },

  prozent(punkte) { return 100 * (1 - punkte / this.a.meta.punkteGesamt); },

  balkenLage() {
    const box = document.getElementById('ex-ns-balken');
    if (!box || !box.firstElementChild) return;
    const g = this.grenzen(), max = this.a.meta.punkteGesamt;
    const oben = { 1: max, 2: g[1], 3: g[2], 4: g[3], 5: g[4], 6: g[5] };
    const unten = { 1: g[1], 2: g[2], 3: g[3], 4: g[4], 5: g[5], 6: 0 };
    const verteilung = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const liste = this.ergebnisse();
    liste.forEach(x => { verteilung[x.e.note]++; });
    box.querySelectorAll('.ex-nsb-abschnitt').forEach(el => {
      const n = +el.dataset.note;
      el.style.top = this.prozent(oben[n]) + '%';
      el.style.height = (this.prozent(unten[n]) - this.prozent(oben[n])) + '%';
      el.querySelector('.ex-nsb-zahl').textContent = verteilung[n] ? `${verteilung[n]}×` : '';
      el.title = `Note ${n}: ${this.bereichText(n)} Punkte`;
    });
    // Liegen Grenzen dicht beieinander, rücken die Beschriftungen nach unten auseinander
    const hoehe = box.querySelector('.ex-nsb-spur').clientHeight;
    let vorige = 0;
    box.querySelectorAll('.ex-nsb-griff[data-grenze]').forEach(griff => {
      const n = +griff.dataset.grenze;
      griff.style.top = this.prozent(g[n]) + '%';
      const wert = griff.querySelector('.ex-nsb-wert');
      wert.textContent = `${n} ab ${this.fmt(g[n])} P`;
      const y = this.prozent(g[n]) * hoehe / 100;
      const beschriftung = Math.max(y, vorige + 16);
      wert.style.transform = beschriftung > y ? `translateY(${beschriftung - y}px)` : '';
      vorige = beschriftung;
      griff.setAttribute('aria-valuenow', g[n]);
    });
    // Jeder Schüler als Punkt am Balken – beim Ziehen sieht man, wer über die Grenze rutscht
    const punkte = {};
    box.querySelector('.ex-nsb-schueler').innerHTML = liste.map(x => {
      const k = x.e.summe;
      const versatz = punkte[k] = (punkte[k] || 0) + 1;
      return `<span class="ex-nsb-punkt${x.e.vorlaeufig ? ' vorlaeufig' : ''}" style="top:${this.prozent(k)}%;right:${versatz * 9 - 4}px"
        title="${Band.esc(x.s.name)}: ${this.fmt(k)} P → ${x.e.note}"></span>`;
    }).join('');
  },

  /* Eine Grenze setzen – auf halbe Punkte, ohne die Nachbarn zu überholen */
  grenzeSetzen(n, wert) {
    const g = { ...this.grenzen() }, max = this.a.meta.punkteGesamt;
    const obergrenze = n === 1 ? max : g[n - 1] - 0.5;
    const untergrenze = n === 5 ? 0.5 : g[n + 1] + 0.5;
    const v = Math.min(obergrenze, Math.max(untergrenze, Math.round(wert * 2) / 2));
    if (v === g[n]) return false;
    g[n] = v;
    this.a.d.schluessel = { ...this.schluessel(), grenzen: g };
    return true;
  },

  ziehenStart(e, griff, spur) {
    e.preventDefault();
    griff.setPointerCapture(e.pointerId);
    griff.classList.add('zieht');
    const n = +griff.dataset.grenze;
    const rechteck = spur.getBoundingClientRect();
    const bewegen = ev => {
      const anteil = Math.min(1, Math.max(0, (ev.clientY - rechteck.top) / rechteck.height));
      if (this.grenzeSetzen(n, this.a.meta.punkteGesamt * (1 - anteil))) this.notenAktualisieren();
    };
    const ende = () => {
      griff.classList.remove('zieht');
      griff.removeEventListener('pointermove', bewegen);
      griff.removeEventListener('pointerup', ende);
      griff.removeEventListener('pointercancel', ende);
      Classes.persist();
      this.reglerZeichnen();
    };
    griff.addEventListener('pointermove', bewegen);
    griff.addEventListener('pointerup', ende);
    griff.addEventListener('pointercancel', ende);
  },

  griffTaste(e, griff) {
    const schritt = { ArrowUp: 0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowLeft: -0.5, PageUp: 2, PageDown: -2 }[e.key];
    if (!schritt) return;
    e.preventDefault();
    const n = +griff.dataset.grenze;
    if (this.grenzeSetzen(n, this.grenzen()[n] + schritt)) {
      Classes.persist();
      this.notenAktualisieren();
      this.reglerZeichnen();
    }
  },

  notenbildZeichnen() {
    const esc = s => Band.esc(s), fmt = x => this.fmt(x);
    const liste = this.ergebnisse();
    const verteilung = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    liste.forEach(x => verteilung[x.e.note].push(x));
    const schnitt = liste.length ? fmt((liste.reduce((n, x) => n + x.e.note, 0) / liste.length).toFixed(2)) : '–';
    const vorlaeufig = liste.filter(x => x.e.vorlaeufig).length;
    const ohne = this.a.schueler.filter(s => s.r && this.zaehltNicht(s.nr)).length;
    const hoechst = Math.max(1, ...Object.values(verteilung).map(v => v.length));
    document.getElementById('ex-notenbild').innerHTML = `
      <h4>Notenbild <span class="hint">Schnitt ${schnitt}${vorlaeufig ? ` · ${vorlaeufig} vorläufig*` : ''}${ohne ? ` · ${ohne} krank, zählen nicht` : ''}</span></h4>
      ${[1, 2, 3, 4, 5, 6].map(n => `
        <div class="ex-stufe">
          <span class="ex-stufe-note">${n}</span>
          <span class="hint ex-stufe-bereich">${this.bereichText(n)} P</span>
          <span class="ex-stufe-balken"><span class="n${n}" style="width:${Math.round(100 * verteilung[n].length / hoechst)}%"></span></span>
          <span class="ex-stufe-zahl">${verteilung[n].length}</span>
          <span class="ex-stufe-wer">${verteilung[n].sort((x, y) => y.e.summe - x.e.summe).map(x =>
            `${esc(x.s.name)} <span class="hint">${fmt(x.e.summe)}${x.e.vorlaeufig ? '*' : ''}</span>`).join(' · ')}</span>
        </div>`).join('')}
      ${vorlaeufig ? '<p class="hint">* vorläufig: Es gibt noch gelbe Prüfstellen oder manuelle Aufgaben ohne Punkte (dort zählt bis dahin der Vorschlag, mit ? markiert).</p>' : ''}`;
  },

  uebersichtZeichnen() {
    const a = this.a, esc = s => Band.esc(s), fmt = x => this.fmt(x);
    const kopfAufgaben = a.meta.aufgaben.map(x => `<th title="${esc(x.titel)}">${esc(x.id)}<br><span class="hint">/${fmt(x.punkte)}</span></th>`).join('');
    const zeilen = a.schueler.map(s => {
      if (s.fehlt || !s.abgabe) {
        return `<tr class="ex-ohne"><td class="nr">${esc(s.nr)}</td><td>${esc(s.name)}</td>
          <td colspan="${a.meta.aufgaben.length + 6}" class="hint">${s.fehlt ? 'fehlt' : s.nichtDa ? 'nicht teilgenommen'
            : s.t && s.t.status === 'entfernt' ? 'entfernt, keine Abgabe' : 'keine Abgabe'}</td></tr>`;
      }
      if (!s.r) {
        return `<tr><td class="nr">${esc(s.nr)}</td><td>${esc(s.name)}</td>
          <td colspan="${a.meta.aufgaben.length + 6}" class="ex-warnung">${esc(s.fehler || 'nicht bewertet')}</td></tr>`;
      }
      const e = this.ergebnis(s);
      const zellen = a.meta.aufgaben.map(x => {
        const p = e.je[x.id];
        return `<td class="${p.offen ? 'ex-offen' : ''}">${fmt(p.punkte)}${p.vorschlag ? '?' : ''}</td>`;
      }).join('');
      const krank = this.krankVon(s.nr);
      const krankKnopf = `<button class="small ex-krank${krank ? ' an-' + krank : ''}" data-krank="${esc(s.nr)}"
          title="Letzte Stunde krank? Klick schaltet weiter: zählt nicht → zählt trotzdem → nicht krank">${krank ? this.KRANK[krank] : 'krank?'}</button>`;
      return `<tr${krank === 'nicht' ? ' class="ex-zaehlt-nicht"' : ''}><td class="nr">${esc(s.nr)}</td><td class="ex-name-zelle">${this.gesichtHtml(s)}${esc(s.name)}${s.t.status === 'entfernt' ? ' <span class="hint">(entfernt)</span>' : ''}</td>${zellen}
        <td><strong>${fmt(e.summe)}</strong></td><td><strong class="ex-note">${e.note}</strong>${e.vorlaeufig ? '<span class="hint">*</span>' : ''}</td>
        <td class="hint">${esc(this.zuschlagText(s))}</td><td>${s.t.notenschutz ? 'ja' : ''}</td><td>${krankKnopf}</td>
        <td class="aktionen">${this.istKorrigiert(s.nr) ? '<span class="ex-korrigiert-haken" title="Als korrigiert abgehakt">✓</span>' : ''}<button class="small" data-korrektur="${esc(s.nr)}">${e.offen ? `Korrigieren (${e.offen} offen)` : 'Korrigieren'}</button></td></tr>`;
    }).join('');
    document.getElementById('ex-uebersicht').innerHTML = `
      <div class="ex-tabelle-huelle">
      <table class="ex-tabelle ex-uebersicht"><thead><tr><th>Nr.</th><th>Name</th>${kopfAufgaben}<th>Summe</th><th>Note</th>
        <th>Zeitzuschlag</th><th>Notenschutz</th><th title="Letzte Stunde krank">Letzte Std.</th><th></th></tr></thead><tbody>${zeilen}</tbody></table>
      </div>`;
    this.gesichterEinsetzen(document.getElementById('ex-uebersicht'));
  },

  /* Selbsteinschätzung: Zahlen 1–5 als Smiley-Verteilung, Listen als Häufigkeit */
  selbstHtml() {
    const a = this.a, esc = s => Band.esc(s);
    const werte = a.schueler.filter(s => s.r || s.antworten)
      .map(s => (s.r && s.r.selbsteinschaetzung) || (s.antworten && s.antworten.selbst)).filter(Boolean);
    if (!werte.length) return '';
    const titel = id => (a.meta.aufgaben.find(x => x.id === id) || {}).titel || id;
    const NAMEN = { machbar: 'Wie machbar war die Ex?', vorbereitet: 'Wie gut warst du vorbereitet?', kniffelig: 'Am kniffligsten' };
    const keys = [...new Set(werte.flatMap(w => Object.keys(w)))];
    const bloecke = keys.map(k => {
      const vals = werte.map(w => w[k]).filter(v => v != null);
      if (!vals.length) return '';
      if (vals.every(v => typeof v === 'number' && v >= 1 && v <= 5)) {
        const z = [1, 2, 3, 4, 5].map(n => vals.filter(v => v === n).length);
        return `<div class="ex-selbst-block"><strong>${esc(NAMEN[k] || k)}</strong><div class="ex-smileys">${z.map((n, i) =>
          `<span><span class="ex-smiley">${this.SMILEYS[i]}</span>${n}</span>`).join('')}</div></div>`;
      }
      if (vals.every(Array.isArray)) {
        const h = {};
        vals.flat().forEach(x => { h[x] = (h[x] || 0) + 1; });
        const top = Object.entries(h).sort((x, y) => y[1] - x[1]);
        return `<div class="ex-selbst-block"><strong>${esc(NAMEN[k] || k)}</strong><ol>${top.map(([x, n]) =>
          `<li>${esc(titel(x))} <span class="hint">(${n}×)</span></li>`).join('')}</ol></div>`;
      }
      return '';
    }).join('');
    return bloecke ? `<h4>Selbsteinschätzung <span class="hint">(${werte.length} Antworten)</span></h4><div class="ex-selbst">${bloecke}</div>` : '';
  },

  klick(e) {
    const k = e.target.closest('[data-korrektur]');
    if (k) { this.korrekturOeffnen(k.dataset.korrektur); return; }
    const kr = e.target.closest('[data-krank]');
    if (kr && this.a) { this.krankWeiter(kr.dataset.krank); return; }
    const b = e.target.closest('button[data-aktion]');
    if (!b || !this.a) return;
    const std = this.standard();
    switch (b.dataset.aktion) {
      case 'standard-speichern': {
        const { p4, p6, b: br } = this.schluessel();
        Classes.data.exNotenStandard = { p4, p6, b: br };
        Classes.persist();
        alert('Gespeichert: schlechteste 4 ab ' + p4 + ' %, 6 unter ' + p6 + ' %, Dreierspanne +' + br + ' %.');
        break;
      }
      case 'standard-laden': this.a.d.schluessel = { ...std }; Classes.persist(); this.reglerZeichnen(); this.notenAktualisieren(); break;
      case 'grenzen-weg': { const s = this.schluessel(); delete s.grenzen; this.a.d.schluessel = s; Classes.persist(); this.reglerZeichnen(); this.notenAktualisieren(); break; }
      case 'export-notenliste': this.exportNotenliste(); this.knoepfeAktualisieren(); this.listeFuellen(); break;
      case 'noten-entfernen': this.notenEntfernen(); this.listeFuellen(); break;
      case 'archivieren': this.archivieren(); break;
      case 'endgueltig-loeschen': this.endgueltigLoeschen(); break;
      case 'schueleransicht': this.schueleransicht(); break;
      case 'schueleransicht-voll': this.schueleransicht(); this.vollbild(); break;
      case 'export-csv': this.exportCsv(); break;
      case 'drucken': this.drucken(document.getElementById('ex-druck-loesungen').checked); break;
      case 'neu-bewerten': this.oeffnen(this.a.key); break;
      case 'nachschreiben': ExSitzung.nachschreibenVorbereiten(this.a.key); break;
    }
  },

  eingabe(e, endgueltig) {
    const el = e.target;
    if (!this.a) return;
    if (el.dataset.param) {
      const v = Number(el.value);
      if (!Number.isFinite(v)) return;
      if (el.type === 'range' || endgueltig) {
        const s = this.schluessel();
        delete s.grenzen;
        s[el.dataset.param] = v;
        this.a.d.schluessel = s;
        Classes.persist();
        if (el.type === 'range') el.nextElementSibling.textContent = v ? `+${v} %` : 'gleich breit';
        else this.reglerZeichnen();
        this.notenAktualisieren();
      }
    }
  },

  /* ---------- Korrekturansicht ---------- */
  schuelerMitAbgabe() { return this.a.schueler.filter(s => s.r); },

  korrekturOeffnen(nr) {
    const s = this.a.schueler.find(x => x.nr === nr);
    if (!s || !s.r) return;
    this.korrekturNr = nr;
    const k = document.getElementById('ex-korrektur');
    k.hidden = false;
    document.body.classList.add('ex-korrektur-offen');
    const links = document.getElementById('ex-korrektur-ex');
    links.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('title', 'Ex in der Ansicht des Schülers');
    iframe.srcdoc = this.a.html;
    links.append(iframe);
    this.korrekturIframe = iframe;
    this.korrekturZeichnen();
  },

  /* Kontext für die Ex in der Ansicht der Lehrkraft (Korrektur und Druck):
     dazu das Ergebnis mit allen Korrekturen, damit die Ex Punkte zeigen kann */
  kontextFuer(s, modus) {
    const i = s.info;
    const d = new Date(i.startzeit || i.erstellt || Date.now());
    return {
      nummer: s.nr, klasse: i.klasse, exNummer: i.exNummer, notenschutz: !!s.t.notenschutz,
      datum: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      wiedergabe: 'zentral', medien: {}, seed: `${s.code}-${s.nr}`, modus,
      antworten: s.antworten, abgegeben: true, ergebnis: this.ergebnisFuerEx(s),
    };
  },

  /* { summe, max, note, vorlaeufig, aufgaben: { a1: { punkte, max, details: [{ punkte, max, status }] } } } */
  ergebnisFuerEx(s) {
    const e = this.ergebnis(s);
    if (!e) return null;
    const k = this.korr(s.nr), aufgaben = {};
    for (const aufgabe of this.a.meta.aufgaben) {
      const x = s.r.aufgaben[aufgabe.id];
      if (!x) continue;
      aufgaben[aufgabe.id] = {
        punkte: e.je[aufgabe.id].punkte, max: e.je[aufgabe.id].max,
        details: (x.details || []).map((d, i) => {
          const o = k.d[aufgabe.id] && k.d[aufgabe.id][i];
          const punkte = typeof o === 'number' ? o : d.punkte;
          const status = typeof o === 'number' ? (o >= d.max ? 'richtig' : o > 0 ? 'teilweise' : 'falsch') : d.status;
          return { punkte, max: d.max, status };
        }),
      };
    }
    return { summe: e.summe, max: this.a.meta.punkteGesamt, note: e.note, vorlaeufig: e.vorlaeufig, aufgaben };
  },

  nachricht(e) {
    const m = e.data;
    if (!m || m.quelle !== 'tom-ex') return;
    // Druckfassungen, die gerade im Hintergrund entstehen
    const warte = this.druckWartet && this.druckWartet.get(e.source);
    if (warte) { warte(m); return; }
    const f = this.korrekturIframe;
    if (!f || e.source !== f.contentWindow || m.typ !== 'bereit') return;
    const s = this.a.schueler.find(x => x.nr === this.korrekturNr);
    f.contentWindow.postMessage({ quelle: 'tom-schooltool', typ: 'init', kontext: this.kontextFuer(s, 'ansicht') }, '*');
  },

  korrekturZeichnen() {
    const a = this.a, esc = s => Band.esc(s), fmt = x => String(x).replace('.', ',');
    const s = a.schueler.find(x => x.nr === this.korrekturNr);
    const e = this.ergebnis(s), k = this.korr(s.nr);
    const liste = this.schuelerMitAbgabe(), pos = liste.indexOf(s);
    document.getElementById('ex-korrektur-kopf').innerHTML = `
      <button class="small" data-k="zurueck" ${pos > 0 ? '' : 'disabled'}>‹</button>
      ${this.gesichtHtml(s, true)}
      <div class="ex-korrektur-wer"><strong>${esc(s.nr)} · ${esc(s.name)}</strong>
        <span class="hint">${s.t.notenschutz ? 'Notenschutz · ' : ''}Zeitzuschlag: ${esc(this.zuschlagText(s))}</span></div>
      <div class="ex-korrektur-stand"><strong>${fmt(e.summe)}</strong> / ${fmt(a.meta.punkteGesamt)} P · Note <strong class="ex-note">${e.note}</strong>${e.vorlaeufig ? ' <span class="hint">(vorläufig)</span>' : ''}</div>
      <button class="small" data-k="weiter" ${pos < liste.length - 1 ? '' : 'disabled'}>›</button>
      <button class="small ex-haken-knopf${this.istKorrigiert(s.nr) ? ' an' : ''}" data-k="haken"
        title="Als korrigiert abhaken – nochmal tippen nimmt den Haken weg">${this.istKorrigiert(s.nr) ? '✓ korrigiert' : '○ nicht abgehakt'}</button>
      <button class="primary small" data-k="fertig-weiter">${pos < liste.length - 1 ? 'Korrigiert &amp; weiter ›' : 'Korrigiert &amp; schließen'}</button>
      <label class="schalter ex-auto-haken" title="Beim Weiterblättern (›, Pfeiltaste →) den gerade angezeigten Schüler abhaken">
        <input type="checkbox" id="ex-auto-haken" role="switch" ${this.autoHaken() ? 'checked' : ''}>
        <span class="schalter-bahn" aria-hidden="true"></span> Beim Weiterblättern abhaken</label>
      <span class="hint ex-korrigiert-zahl">${liste.filter(x => this.istKorrigiert(x.nr)).length} von ${liste.length} korrigiert</span>
      <button class="small" data-k="drucken" data-icon="printer">Drucken</button>
      <button class="small" data-k="zu">Schließen</button>`;
    this.gesichterEinsetzen(document.getElementById('ex-korrektur-kopf'));
    const aufgaben = a.meta.aufgaben.map(aufgabe => {
      const x = s.r.aufgaben[aufgabe.id];
      const p = e.je[aufgabe.id];
      if (!x) return `<section class="ex-k-aufgabe"><h4>${esc(aufgabe.titel)}</h4><p class="hint">Keine Bewertung für diese Aufgabe.</p></section>`;
      let koerper;
      if (x.manuell || x.punkte == null) {
        const m = k.m[aufgabe.id];
        koerper = `
          ${(x.details || []).map(d => `<div class="ex-k-antwort">${esc(d.antwort) || '<span class="hint">—</span>'}</div>`).join('')}
          ${x.erwartung ? `<p class="ex-k-erwartung"><strong>Erwartung:</strong> ${esc(x.erwartung)}</p>` : ''}
          ${x.stichwortTreffer ? `<p class="hint">Gefundene Stichworte: ${esc(x.stichwortTreffer.join(', ') || '—')}</p>` : ''}
          <div class="ex-k-manuell">Punkte <input type="number" step="0.5" min="0" max="${p.max}" value="${typeof m === 'number' ? m : ''}"
            placeholder="?" data-m="${esc(aufgabe.id)}"> / ${fmt(p.max)}
            ${x.vorschlag != null ? `<button class="small" data-k="vorschlag" data-aufgabe="${esc(aufgabe.id)}" data-wert="${x.vorschlag}">Vorschlag ${fmt(x.vorschlag)} übernehmen</button>` : ''}
          </div>`;
      } else {
        koerper = `<table class="ex-k-details">${(x.details || []).map((d, i) => {
          const o = k.d[aufgabe.id] && k.d[aufgabe.id][i];
          const wert = typeof o === 'number' ? o : (Number(d.punkte) || 0);
          const offen = (d.pruefen || d.status === 'pruefen') && typeof o !== 'number';
          return `<tr class="st-${esc(d.status)}${offen ? ' offen' : ''}${typeof o === 'number' ? ' geaendert' : ''}">
            <td>${esc(d.label)}</td><td class="ex-k-ant">${esc(d.antwort) || '—'}</td>
            <td class="hint">${esc(d.loesung)}${d.hinweis ? `<br><em>${esc(d.hinweis)}</em>` : ''}</td>
            <td class="ex-k-p"><input type="number" step="0.5" min="0" max="${d.max}" value="${wert}" data-d="${esc(aufgabe.id)}" data-i="${i}">/${fmt(d.max)}
              ${offen ? `<button class="small" data-k="passt" data-aufgabe="${esc(aufgabe.id)}" data-i="${i}" title="Geprüft – Punkte so lassen">passt</button>` : ''}
              ${typeof o === 'number' ? `<button class="small" data-k="auto" data-aufgabe="${esc(aufgabe.id)}" data-i="${i}" title="Zurück zu den automatischen Punkten">↺</button>` : ''}</td></tr>`;
        }).join('')}</table>`;
      }
      return `<section class="ex-k-aufgabe"><h4>${esc(aufgabe.titel)} <span>${fmt(p.punkte)}${p.vorschlag ? '?' : ''} / ${fmt(p.max)}</span></h4>${koerper}</section>`;
    }).join('');
    document.getElementById('ex-korrektur-details').innerHTML = aufgaben;
    Icons.hydrate(document.getElementById('ex-korrektur-kopf'));
  },

  /* ---------- Abhaken: wen habe ich schon durchgesehen ----------
     Nur lokal (Classes.data.exAuswertungen[key].korrigiert), reist mit dem Sync */
  istKorrigiert(nr) { return !!((this.a.d.korrigiert || {})[nr]); },
  abhaken(nr, an) {
    const d = this.a.d;
    d.korrigiert = d.korrigiert || {};
    if (an) d.korrigiert[nr] = true; else delete d.korrigiert[nr];
    Classes.persist();
  },
  /* ---------- Letzte Stunde krank ----------
     Ein Klick schaltet weiter: – → krank, zählt nicht → krank, zählt (gute Note) → –.
     Nur lokal (Classes.data.exAuswertungen[key].krank), reist mit dem Sync */
  KRANK: { nicht: 'krank, zählt nicht', zaehlt: 'krank, zählt' },
  krankVon(nr) { return (this.a.d.krank || {})[nr] || ''; },
  zaehltNicht(nr) { return this.krankVon(nr) === 'nicht'; },
  krankWeiter(nr) {
    const d = this.a.d;
    d.krank = d.krank || {};
    const neu = { '': 'nicht', nicht: 'zaehlt', zaehlt: '' }[this.krankVon(nr)];
    if (neu) d.krank[nr] = neu; else delete d.krank[nr];
    Classes.persist();
    this.notenAktualisieren();
  },
  autoHaken() { try { return localStorage.getItem('ex-auto-haken') === '1'; } catch (e) { return false; } },

  blaettern(richtung) {
    if (document.getElementById('ex-korrektur').hidden) return;
    const s = this.a.schueler.find(x => x.nr === this.korrekturNr);
    const liste = this.schuelerMitAbgabe(), pos = liste.indexOf(s);
    const ziel = liste[pos + richtung];
    if (richtung > 0 && this.autoHaken()) this.abhaken(s.nr, true);
    if (ziel) this.korrekturOeffnen(ziel.nr);
    else this.korrekturZeichnen();
  },

  korrekturKlick(e) {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const s = this.a.schueler.find(x => x.nr === this.korrekturNr);
    const k = this.korr(s.nr);
    const liste = this.schuelerMitAbgabe(), pos = liste.indexOf(s);
    const detail = () => {
      const aufgabe = b.dataset.aufgabe, i = b.dataset.i;
      k.d[aufgabe] = k.d[aufgabe] || {};
      return { aufgabe, i };
    };
    switch (b.dataset.k) {
      case 'zu': this.korrekturSchliessen(); return;
      case 'zurueck': this.blaettern(-1); return;
      case 'weiter': this.blaettern(1); return;
      case 'haken': this.abhaken(s.nr, !this.istKorrigiert(s.nr)); this.korrekturZeichnen(); return;
      case 'fertig-weiter':
        this.abhaken(s.nr, true);
        if (pos < liste.length - 1) this.korrekturOeffnen(liste[pos + 1].nr);
        else this.korrekturSchliessen();
        return;
      case 'drucken': this.drucken(document.getElementById('ex-druck-loesungen').checked, [s.nr]); return;
      case 'vorschlag': k.m[b.dataset.aufgabe] = Number(b.dataset.wert); break;
      case 'passt': { const { aufgabe, i } = detail(); k.d[aufgabe][i] = Number(this.a.schueler.find(x => x.nr === s.nr).r.aufgaben[aufgabe].details[i].punkte) || 0; break; }
      case 'auto': { const { aufgabe, i } = detail(); delete k.d[aufgabe][i]; break; }
      default: return;
    }
    Classes.persist();
    this.korrekturZeichnen();
    this.notenAktualisieren();
  },

  korrekturEingabe(e) {
    const el = e.target;
    if (el.id === 'ex-auto-haken') {
      try { localStorage.setItem('ex-auto-haken', el.checked ? '1' : '0'); } catch (err) { /* egal */ }
      return;
    }
    const s = this.a.schueler.find(x => x.nr === this.korrekturNr);
    const k = this.korr(s.nr);
    const roh = String(el.value).replace(',', '.').trim();
    const max = Number(el.max);
    let v = roh === '' ? null : Math.round(Number(roh) * 2) / 2;
    if (v != null && (!Number.isFinite(v) || v < 0 || v > max)) { alert(`Bitte 0 bis ${String(max).replace('.', ',')} Punkte.`); this.korrekturZeichnen(); return; }
    if (el.dataset.m) {
      if (v == null) delete k.m[el.dataset.m]; else k.m[el.dataset.m] = v;
    } else if (el.dataset.d) {
      k.d[el.dataset.d] = k.d[el.dataset.d] || {};
      if (v == null) delete k.d[el.dataset.d][el.dataset.i]; else k.d[el.dataset.d][el.dataset.i] = v;
    } else return;
    Classes.persist();
    this.korrekturZeichnen();
    this.notenAktualisieren();
  },

  korrekturSchliessen() {
    document.getElementById('ex-korrektur').hidden = true;
    document.body.classList.remove('ex-korrektur-offen');
    document.getElementById('ex-korrektur-ex').innerHTML = '';
    this.korrekturIframe = null;
    this.korrekturNr = null;
    // Haken in der Übersicht nachziehen
    if (this.a && !this.a.ohneEx && document.getElementById('ex-uebersicht')) this.uebersichtZeichnen();
  },

  /* ---------- Export ---------- */
  datum() {
    const i = Object.values(this.a.sitzungen)[0].info;
    const d = new Date(i.startzeit || i.erstellt || Date.now());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  exportNotenliste() {
    const a = this.a;
    if (a.cls && a.cls.test) { alert('Der Testraum hat keine Notenliste – die Noten siehst du hier, in der CSV und im Ausdruck.'); return; }
    if (!a.cls) { alert('Die Klasse gibt es auf diesem Gerät nicht mehr.'); return; }
    const noten = {};
    let vorlaeufig = 0, ohneSchueler = 0;
    const krank = [];                              // „krank, zählt nicht“: kommt nicht in die Notenliste
    for (const s of a.schueler) {
      const e = this.ergebnis(s);
      if (!e) continue;
      if (this.zaehltNicht(s.nr)) { krank.push(s.sid); continue; }
      if (!a.cls.students.some(x => x.id === s.sid)) { ohneSchueler++; continue; }
      noten[s.sid] = String(e.note);
      if (e.vorlaeufig) vorlaeufig++;
    }
    if (vorlaeufig && !confirm(`${vorlaeufig} Noten sind noch vorläufig (offene Prüfstellen oder manuelle Aufgaben). Trotzdem übernehmen?`)) return;
    const name = `${a.gruppe.exNummer}. ${a.meta.art || 'Ex'}: ${a.meta.titel}`;
    let p = this.projekt();
    if (p) {
      if (!confirm(`„${p.name}“ steht schon in der Notenliste von ${a.cls.name}. Die Noten dort durch die aktuellen ersetzen?`)) return;
      Object.keys(noten).forEach(sid => { p.grades[sid] = noten[sid]; });
      krank.forEach(sid => { delete p.grades[sid]; });
    } else {
      p = { id: Store.uid(), name, date: this.datum(), entered: false, grades: noten, groups: [] };
      a.cls.projects.push(p);
      a.d.projektId = p.id;
    }
    Classes.persist();
    if (Classes.currentClassId === a.cls.id) Classes.renderProjects();
    alert(`${Object.keys(noten).length} Noten stehen jetzt in „${p.name}“ (Klasse ${a.cls.name}, Reiter Projekte & Noten).` +
      (krank.length ? `\n${krank.length} als „krank, zählt nicht“ markiert – ohne Note.` : '') +
      (ohneSchueler ? `\n${ohneSchueler} Schüler stehen nicht mehr in der Klassenliste und wurden ausgelassen.` : ''));
  },

  exportCsv() {
    const a = this.a;
    const z = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const zahl = x => String(x).replace('.', ',');
    const kopf = ['Nr', 'Name', ...a.meta.aufgaben.map(x => `${x.id} ${x.titel}`), 'Summe', 'Note', 'vorläufig', 'Zeitzuschlag', 'Notenschutz', 'Letzte Stunde'];
    const zeilen = a.schueler.map(s => {
      const e = this.ergebnis(s);
      if (!e) return [s.nr, s.name, ...a.meta.aufgaben.map(() => ''), '', '', '', s.fehlt ? 'fehlt' : s.nichtDa ? 'nicht teilgenommen' : 'keine Abgabe', ''];
      return [s.nr, s.name, ...a.meta.aufgaben.map(x => zahl(e.je[x.id].punkte)), zahl(e.summe), e.note,
        e.vorlaeufig ? 'ja' : '', this.zuschlagText(s), s.t.notenschutz ? 'ja' : '', this.KRANK[this.krankVon(s.nr)] || ''];
    });
    const csv = '﻿' + [kopf, ...zeilen].map(r => r.map(z).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${a.gruppe.klasse} ${a.gruppe.exNummer}. ${a.meta.art || 'Ex'} ${a.meta.titel}.csv`.replace(/[\\/:*?"<>|]/g, '-');
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  /* ---------- Drucken ----------
     Jede Ex darf eine eigene Druckfassung liefern (ex-format.md, Modus „druck“):
     Sie wird unsichtbar mit den Antworten und dem Ergebnis gestartet und schickt
     ihre Druckansicht zurück. Das School-Tool setzt daraus einen Druckauftrag
     zusammen – je Schüler ein Kopf mit Note und Notenschlüssel, dann die Ex, je
     Aufgabe die Punkte. Exen ohne Druckfassung bekommen die Tabelle. */
  DRUCK_FRIST: 8000,

  druckfassung(s) {
    return new Promise(resolve => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;';
      this.druckWartet = this.druckWartet || new Map();
      let fertig = false;
      const ende = ergebnis => {
        if (fertig) return;
        fertig = true;
        clearTimeout(frist);
        this.druckWartet.delete(iframe.contentWindow);
        iframe.remove();
        resolve(ergebnis);
      };
      const frist = setTimeout(() => ende(null), this.DRUCK_FRIST);
      document.body.append(iframe);
      this.druckWartet.set(iframe.contentWindow, m => {
        if (m.typ === 'bereit') {
          iframe.contentWindow.postMessage({ quelle: 'tom-schooltool', typ: 'init', kontext: this.kontextFuer(s, 'druck') }, '*');
        } else if (m.typ === 'druck' && typeof m.html === 'string') {
          ende({ html: m.html, css: typeof m.css === 'string' ? m.css : '' });
        }
      });
      iframe.srcdoc = this.a.html;
    });
  },

  /* Was die Ex liefert, enthält eingetippten Text von Schülern. Bevor es in ein
     Fenster dieser Seite kommt: alles Ausführbare und Nachladende entfernen.
     Das Druckfenster verbietet Skripte zusätzlich per Content-Security-Policy. */
  bereinigen(html) {
    const doc = new DOMParser().parseFromString(`<!DOCTYPE html><body>${html}</body>`, 'text/html');
    doc.querySelectorAll('script, iframe, frame, object, embed, link, meta, base, form, template, noscript').forEach(el => el.remove());
    doc.body.querySelectorAll('*').forEach(el => {
      for (const at of [...el.attributes]) {
        const name = at.name.toLowerCase(), wert = at.value.trim().toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(at.name);
        else if (['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset', 'poster'].includes(name) &&
          !wert.startsWith('data:image/') && !wert.startsWith('#')) el.removeAttribute(at.name);
      }
    });
    return doc.body;
  },

  cssBereinigen(css) {
    return String(css).replace(/@import[^;]*;?/gi, '').replace(/<\/?style[^>]*>/gi, '');
  },

  async drucken(mitLoesungen, nurNummern) {
    const a = this.a, esc = s => Band.esc(s), fmt = x => String(x).replace('.', ',');
    const liste = a.schueler.filter(s => s.r && (!nurNummern || nurNummern.includes(s.nr)));
    if (!liste.length) { alert('Es gibt nichts zu drucken.'); return; }
    // Das Fenster sofort öffnen, solange der Klick noch zählt – sonst blockt der Browser es
    const w = window.open('', 'ex-druck');
    if (!w) { alert('Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.'); return; }
    w.document.open();
    w.document.write('<!DOCTYPE html><meta charset="UTF-8"><title>Druck wird vorbereitet …</title><p style="font:16px system-ui;padding:2rem">Druck wird vorbereitet …</p>');
    w.document.close();

    const vorlaeufig = liste.filter(s => this.ergebnis(s).vorlaeufig).length;
    if (vorlaeufig && !confirm(`Bei ${vorlaeufig} von ${liste.length} Schülern sind noch Punkte vorläufig (mit „?“ markiert).\n\n` +
      'Fürs Archiv erst fertig korrigieren. Trotzdem drucken?')) { w.close(); return; }

    const fassungen = [];
    for (let n = 0; n < liste.length; n++) {
      try { w.document.title = `Druck wird vorbereitet … ${n + 1}/${liste.length}`; } catch (e) {}
      fassungen.push(await this.druckfassung(liste[n]));
    }
    const css = this.cssBereinigen((fassungen.find(Boolean) || {}).css || '');
    const ohne = fassungen.filter(f => !f).length;

    const g = this.grenzen(), max = a.meta.punkteGesamt;
    const datum = new Date(this.datum() + 'T12:00').toLocaleDateString('de-DE');
    const schluessel = `<table class="stdr-schluessel"><tr><td>Notenschlüssel<br>(Punkte)</td>${[1, 2, 3, 4, 5, 6].map(n =>
      `<td><strong>${n}</strong><br>${this.bereichText(n)}</td>`).join('')}</tr></table>`;

    const seiten = liste.map((s, idx) => {
      const e = this.ergebnis(s);
      const kopf = `<header class="stdr-kopf"><div>
          <div class="stdr-klein">${esc(a.gruppe.exNummer)}. ${esc(a.meta.art || 'Ex')} · ${esc(a.meta.fach || '')} · Klasse ${esc(a.gruppe.klasse)} · ${datum}</div>
          <div class="stdr-titel">${esc(a.meta.titel)}</div>
          <div class="stdr-name">${esc(s.name)} <span class="stdr-klein">(Nr. ${esc(s.nr)})</span></div>
          <div class="stdr-klein">${esc(this.abgabeText(s))}</div></div>
        <div class="stdr-ergebnis"><div class="stdr-note">${e.note}</div><div>${fmt(e.summe)} / ${fmt(max)} Punkte</div></div></header>
        ${s.t.notenschutz ? '<p class="stdr-klein">Notenschutz: Die Rechtschreibung wurde nicht gewertet.</p>' : ''}`;
      let rumpf;
      const f = fassungen[idx];
      if (f) {
        const body = this.bereinigen(f.html);
        // Je Aufgabe ein Punktefeld – die Ex markiert ihre Blöcke mit data-aufgabe
        body.querySelectorAll('[data-aufgabe]').forEach(block => {
          const p = e.je[block.getAttribute('data-aufgabe')];
          if (!p) return;
          const marke = block.ownerDocument.createElement('div');
          marke.className = 'stdr-punkte';
          marke.textContent = `${fmt(p.punkte)}${p.vorschlag ? '?' : ''} / ${fmt(p.max)} P`;
          block.prepend(marke);
        });
        rumpf = `<div class="stdr-ex">${body.innerHTML}</div>` + (mitLoesungen ? this.loesungsTabelle(s, true) : '');
      } else {
        rumpf = this.loesungsTabelle(s, mitLoesungen);
      }
      return `<section class="stdr-seite">${kopf}${rumpf}${schluessel}
        <p class="stdr-klein stdr-unten">Unterschrift eines Erziehungsberechtigten: ______________________________</p></section>`;
    }).join('');

    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
      <title>${esc(a.meta.titel)} – ${esc(a.gruppe.klasse)}</title>
      <style>${css}</style>
      <style>
      @page { size: A4; margin: 12mm 12mm 14mm; }
      html, body { background: #fff !important; color: #111; margin: 0; }
      .stdr-seite { break-after: page; page-break-after: always; font: 10.5pt/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; }
      .stdr-seite:last-child { break-after: auto; page-break-after: auto; }
      .stdr-kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 6pt; margin-bottom: 8pt; }
      .stdr-titel { font-size: 17pt; font-weight: 700; margin: 2pt 0; }
      .stdr-name { font-size: 13pt; font-weight: 600; }
      .stdr-klein { font-size: 8.5pt; color: #444; }
      .stdr-ergebnis { text-align: right; }
      .stdr-note { font-size: 30pt; font-weight: 800; line-height: 1; }
      .stdr-ex [data-aufgabe] { position: relative; }
      .stdr-punkte { position: absolute; top: 4pt; right: 6pt; padding: 1pt 7pt; border: 2px solid #111; border-radius: 6pt;
        font: 700 11pt system-ui, sans-serif; background: #fff; color: #111; z-index: 1; }
      .stdr-tab h3 { font-size: 11pt; margin: 10pt 0 3pt; display: flex; justify-content: space-between; border-bottom: 1px solid #bbb; }
      .stdr-tab table { width: 100%; border-collapse: collapse; }
      .stdr-tab td { padding: 2pt 4pt; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
      .stdr-tab td.p { width: 15mm; text-align: right; white-space: nowrap; }
      .stdr-tab td.loes { color: #555; font-style: italic; width: 40%; }
      .stdr-tab td.frei { white-space: pre-wrap; }
      .stdr-schluessel { width: calc(100% - 2px); border-collapse: collapse; margin-top: 12pt; font-size: 8.5pt; text-align: center; break-inside: avoid; }
      .stdr-schluessel td { border: 1px solid #999; padding: 2pt; }
      .stdr-unten { margin-top: 14pt; }
      .stdr-tab h3, .stdr-tab tr { break-inside: avoid; }
      </style></head><body>${seiten}</body></html>`);
    w.document.close();
    w.focus();
    if (ohne && ohne === fassungen.length) {
      // Diese Ex hat (noch) keine Druckfassung – die Tabelle ist gedruckt
    } else if (ohne) {
      alert(`${ohne} von ${fassungen.length} Druckfassungen kamen nicht rechtzeitig – dort steht die Tabelle.`);
    }
    // Nach dem Druck der ganzen Klasse: Papier ist das Archiv, die Abgaben sollen aus der Datenbank
    if (!nurNummern && !vorlaeufig) {
      const a = this.a;
      w.addEventListener('afterprint', () => setTimeout(() => this.nachDruck(a), 300), { once: true });
    }
    setTimeout(() => w.print(), 400);
  },

  /* Abgabezeit (Serverzeit), wie abgegeben, Zeitzuschlag – für den Kopf der Druckfassung */
  abgabeText(s) {
    const ab = s.abgabe;
    if (!ab || !ab.abgegebenUm) return 'Abgabe: nicht erfasst';
    const um = new Date(ab.abgegebenUm).toLocaleString('de-DE',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `Abgabe: ${um} Uhr (Serverzeit) · ${ab.erzwungen ? 'eingesammelt zum Zeitende' : 'selbst abgegeben'}` +
      ` · Zeitzuschlag: ${this.zuschlagText(s)}`;
  },

  /* Nach dem Druck anbieten, die Ex zu archivieren und Abgaben samt Korrekturen
     aus der Datenbank zu löschen – die Blätter sind dann die einzige Aufbewahrung */
  nachDruck(a) {
    if (this.a !== a || !a.d) return;
    if (!confirm('Sind alle Blätter vollständig ausgedruckt?\n\n' +
      'Dann ist das Papier die Aufbewahrung (2 Jahre, danach vernichten). Die digitalen Abgaben sollten jetzt ' +
      'aus der Datenbank gelöscht werden.\n\nOK: archivieren und löschen\nAbbrechen: später')) return;
    const warArchiviert = !!a.d.archiviert;
    if (!warArchiviert) this.archivieren();
    this.endgueltigLoeschen().then(() => {
      // Beim Löschen abgebrochen: so lassen, wie es vorher war
      if (!warArchiviert && this.a === a && a.d.archiviert) this.archivieren();
    });
  },

  /* Die Tabelle: je Aufgabe Antwort, ✓/✗, Punkte – wahlweise mit Lösung */
  loesungsTabelle(s, mitLoesungen) {
    const a = this.a, esc = x => Band.esc(x), fmt = x => String(x).replace('.', ',');
    const e = this.ergebnis(s), k = this.korr(s.nr);
    return '<div class="stdr-tab">' + a.meta.aufgaben.map(aufgabe => {
      const x = s.r.aufgaben[aufgabe.id], p = e.je[aufgabe.id];
      if (!x) return '';
      let zeilen;
      if (x.manuell || x.punkte == null) {
        zeilen = (x.details || []).map(d => `<tr><td colspan="${mitLoesungen ? 2 : 1}" class="frei">${esc(d.antwort) || '—'}</td><td class="p">${fmt(p.punkte)}${p.vorschlag ? '?' : ''}/${fmt(p.max)}</td></tr>`).join('') +
          (mitLoesungen && x.erwartung ? `<tr><td colspan="3" class="loes">Erwartung: ${esc(x.erwartung)}</td></tr>` : '');
      } else {
        zeilen = (x.details || []).map((d, i) => {
          const o = k.d[aufgabe.id] && k.d[aufgabe.id][i];
          const wert = typeof o === 'number' ? o : (Number(d.punkte) || 0);
          const zeichen = wert >= d.max ? '✓' : wert > 0 ? '½' : '✗';
          return `<tr><td>${esc(d.label)}: <strong>${esc(d.antwort) || '—'}</strong> <b>${zeichen}</b></td>
            ${mitLoesungen ? `<td class="loes">${esc(d.loesung)}</td>` : ''}<td class="p">${fmt(wert)}/${fmt(d.max)}</td></tr>`;
        }).join('');
      }
      return `<h3>${esc(aufgabe.titel)} <span>${fmt(p.punkte)} / ${fmt(p.max)} P</span></h3><table>${zeilen}</table>`;
    }).join('') + '</div>';
  },
};
