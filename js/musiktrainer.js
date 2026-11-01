/* music-trainer (Reiter Klassen → music-trainer, dazu eine Karte unter Extras).

   Die Kinder spielen auf greenboy87.github.io/music-trainer unter einem
   Pseudonym wie „PandaGeige42“. Auf dem Server (Cloudflare-Worker, siehe
   music-trainer/ANLEITUNG.md) liegen nur Pseudonym, Klasse und Ergebnisse –
   keine Namen. Wer hinter welchem Pseudonym steckt, steht nur hier:
     cls.musiktrainer = { id, passwort }      Klasse auf dem Server
     schueler.mt      = { id, name }          Pseudonym des Kindes
   Das reist mit den Klassendaten verschlüsselt im Sync. Geht es verloren,
   bleiben die Sterne auf dem Server, lassen sich aber niemandem mehr zuordnen.

   Eigene Zugänge (etwa für die eigenen Kinder) liegen in
     data.musiktrainer.gruppen = [{ id, name, passwort, kinder: [{ id, name }] }]

   Gelesen wird nur auf Knopfdruck bzw. beim Öffnen des Reiters, je Klasse
   wenige Kilobyte; Firebase ist nicht beteiligt. */

/* Muss zur Spielliste in music-trainer/js/spiele.js und notenspiele.js passen */
const MT_SPIELE = (() => {
  const vier = ['Junior', 'Anfänger', 'Fortgeschritten', 'Profi'];
  const noten = (art, bereich) => [
    ['lesen', 'Noten lesen'], ['blitz', 'Blitzlesen'], ['taste', 'Note → Taste'],
    ['schreiben', 'Noten schreiben'], ['kette', 'Notenkette'],
  ].map(([id, titel]) => ({ id: `${art}-${id}`, bereich, titel, stufen: vier }));
  return [
    ...noten('stamm', 'Stammtöne'),
    ...noten('vz', 'Vorzeichen'),
    { id: 'hoch-tief', bereich: 'Hören', titel: 'Hoch oder tief?', stufen: ['Große Sprünge', 'Kleine Schritte', 'Ganz knapp'] },
    { id: 'intervall', bereich: 'Hören', titel: 'Intervall-Ohr', stufen: ['Prime, Quinte, Oktave', 'Dazu Terz und Quarte', 'Alle Intervalle'] },
    { id: 'dur-moll', bereich: 'Hören', titel: 'Dur oder Moll?', stufen: ['Akkord zusammen', 'Akkord gebrochen', 'Kurze Melodie'] },
    { id: 'hoerdiktat', bereich: 'Hören', titel: 'Hördiktat', stufen: ['Drei Töne, Schritte', 'Vier Töne, dazu Terzen', 'Fünf Töne, auch Sprünge'] },
    { id: 'rhythmus-detektiv', bereich: 'Rhythmus', titel: 'Rhythmus-Detektiv', stufen: ['Halbe und Viertel', 'Dazu Achtel', 'Dazu Viertelpausen'] },
    { id: 'rhythmus-echo', bereich: 'Rhythmus', titel: 'Rhythmus-Echo', stufen: ['Halbe und Viertel', 'Dazu Achtel', 'Nur nach Gehör'] },
    { id: 'taktfuehler', bereich: 'Rhythmus', titel: 'Taktgefühl', stufen: ['Mit Betonung', 'Mit Begleitung', 'Schnell'] },
  ];
})();

const Musiktrainer = {
  /* Adresse des Workers – dieselbe wie in music-trainer/js/konto.js. Leer = Reiter zeigt nur einen Hinweis. */
  API: 'https://music-trainer.tomgruenig87.workers.dev',
  SPIEL_URL: 'https://greenboy87.github.io/music-trainer/',
  TOKEN_KEY: 'schooltool-musiktrainer-lehrer',

  TIERE: ['Panda', 'Fuchs', 'Tiger', 'Otter', 'Biber', 'Eule', 'Igel', 'Koala', 'Luchs', 'Wal', 'Adler', 'Dachs', 'Lama', 'Robbe', 'Zebra', 'Falke'],
  INSTRUMENTE: ['Geige', 'Tuba', 'Harfe', 'Cello', 'Pauke', 'Banjo', 'Oboe', 'Horn', 'Gitarre', 'Bass', 'Trommel', 'Kazoo'],

  ergebnis: null,          // { klasseId, daten, seit } – zuletzt geladene Auswertung
  filter: { zeitraum: '0', bereich: '', spiel: '', stufe: '', sortierung: 'name' },
  ansicht: 'uebersicht',   // oder 'benotung'
  STERNE: 6,               // 6 Sterne = Note 1 … 1 Stern = Note 6

  init() {
    this.el = document.getElementById('subtab-musiktrainer');
    this.eigeneEl = document.getElementById('mt-eigene');
    if (this.el) {
      document.querySelector('.subtab-btn[data-subtab="musiktrainer"]').addEventListener('click', () => this.render());
      this.el.addEventListener('click', e => this.klick(e));
      this.el.addEventListener('change', e => this.aenderung(e));
    }
    if (this.eigeneEl) {
      this.eigeneEl.addEventListener('click', e => this.klickEigene(e));
      this.eigeneEl.addEventListener('change', e => {
        const id = e.target.dataset.eigenBereich;
        if (!id || !this.eigenErg[id]) return;
        this.eigenErg[id].bereich = e.target.value;
        const gi = this.gruppen().findIndex(g => String(g.id) === id);
        this.eigeneErgebnisse(this.gruppen()[gi], this.eigeneEl.querySelector(`[data-erg="${gi}"]`));
      });
      this.renderEigene();
    }
  },

  esc(s) { return Band.esc(s).replace(/"/g, '&quot;'); },
  klasse() { return Classes.currentClass(); },
  name(s) { return `${s.first || ''} ${s.last || ''}`.trim(); },

  /* ---------- Verbindung zum Worker ---------- */
  token() {
    try {
      const t = localStorage.getItem(this.TOKEN_KEY);
      const exp = t && JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).exp;
      return exp > Date.now() / 1000 + 60 ? t : null;
    } catch { return null; }
  },

  async api(pfad, { methode = 'GET', body } = {}) {
    const token = this.token();
    if (!token && !pfad.endsWith('/anmelden')) { const e = new Error('Bitte beim music-trainer anmelden.'); e.status = 401; throw e; }
    const r = await fetch(this.API + pfad, {
      method: methode,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.fehler || `Fehler ${r.status}`); e.status = r.status; throw e; }
    return d;
  },

  /* Anmeldeformular für die Lehrkraft; nach Erfolg läuft weiter() */
  anmeldeFormular(ziel, weiter) {
    ziel.innerHTML = `
      <form class="inline-form mt-anmelden">
        <input type="password" placeholder="Passwort für den music-trainer" autocomplete="current-password" required>
        <button type="submit" class="primary" data-icon="lock">Anmelden</button>
        <span class="hint mt-fehler"></span>
      </form>
      <p class="hint">Das Lehrer-Passwort aus dem Cloudflare-Worker (LEHRER_PASSWORT). Die Anmeldung gilt 12 Stunden auf diesem Gerät.</p>`;
    Icons.hydrate(ziel);
    const form = ziel.querySelector('form');
    form.querySelector('input').focus();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const d = await this.api('/api/lehrer/anmelden', { methode: 'POST', body: { passwort: form.querySelector('input').value } });
        localStorage.setItem(this.TOKEN_KEY, d.token);
        weiter();
      } catch (err) {
        form.querySelector('.mt-fehler').textContent = err.status ? err.message : 'Keine Verbindung zum Server.';
      }
    });
  },

  fehler(err, ziel, weiter) {
    if (err.status === 401 && ziel) return this.anmeldeFormular(ziel, weiter);
    alert(err.status ? err.message : 'Keine Verbindung zum music-trainer-Server.');
  },

  /* ---------- Pseudonyme und Passwort ---------- */
  pseudonym(belegt) {
    for (let v = 0; v < 500; v++) {
      const p = this.TIERE[Math.floor(Math.random() * this.TIERE.length)] +
        this.INSTRUMENTE[Math.floor(Math.random() * this.INSTRUMENTE.length)] + (10 + Math.floor(Math.random() * 90));
      if (!belegt.has(p.toLowerCase())) { belegt.add(p.toLowerCase()); return p; }
    }
    throw new Error('Kein freies Pseudonym');
  },

  /* Klassenpasswort nach dem Muster RSA-Klasse5a! */
  passwortFuer(name) {
    const k = (String(name || '').match(/\d{1,2}\s?[a-z]?/i)?.[0] || '').replace(/\s/g, '').toLowerCase();
    return `RSA-Klasse${k}!`;
  },

  alleBelegten() {
    const belegt = new Set();
    Classes.data.classes.forEach(c => c.students.forEach(s => s.mt && belegt.add(s.mt.name.toLowerCase())));
    return belegt;
  },

  /* ---------- Reiter einer Klasse ---------- */
  render() {
    if (!this.el) return;
    const cls = this.klasse();
    if (!cls) { this.el.innerHTML = ''; return; }
    if (!this.API) {
      this.el.innerHTML = `<h3 data-icon="music">music-trainer</h3>
        <p class="hint">Noch nicht eingerichtet: In <code>js/musiktrainer.js</code> fehlt die Adresse des Workers
        (<code>API</code>). Die Schritte stehen in music-trainer/ANLEITUNG.md.</p>`;
      Icons.hydrate(this.el);
      return;
    }
    const mt = cls.musiktrainer;
    const ohne = cls.students.filter(s => !s.mt);
    if (!mt) {
      this.el.innerHTML = `
        <div class="projekt-header"><h3 data-icon="music">music-trainer</h3></div>
        <p class="hint">Die Kinder spielen auf <a href="${this.SPIEL_URL}" target="_blank" rel="noopener">${this.SPIEL_URL.replace(/^https:\/\//, '')}</a>
          unter einem Pseudonym wie „PandaGeige42“. Zum Server gehen nur Pseudonyme, das Klassenpasswort und
          der Klassenname – keine Namen. Wer wer ist, steht nur hier und reist verschlüsselt im Sync mit.</p>
        <div class="inline-form">
          <label>Klassenpasswort <input type="text" id="mt-pw-neu" value="${this.esc(this.passwortFuer(cls.name))}" maxlength="30" spellcheck="false"></label>
          <button class="primary" data-mt="einrichten" data-icon="plus" ${cls.students.length ? '' : 'disabled'}>${cls.students.length} Kinder einrichten</button>
        </div>
        ${cls.students.length ? '' : '<p class="hint">Erst Schüler eintragen.</p>'}
        <div id="mt-login"></div>`;
      Icons.hydrate(this.el);
      return;
    }
    this.el.innerHTML = `
      <div class="projekt-header">
        <h3 data-icon="music">music-trainer</h3>
        <div class="btn-row">
          <button class="primary" data-mt="qr" data-icon="expand">QR-Anmeldung am Beamer</button>
          <button data-mt="drucken" data-icon="printer">Kärtchen drucken</button>
        </div>
      </div>
      <p class="mt-zugang">Klassenpasswort <code>${this.esc(mt.passwort)}</code>
        <button class="small" data-mt="pw" data-icon="reset">ändern</button>
        ${ohne.length ? `<button class="small" data-mt="nachtragen" data-icon="plus">${ohne.length} neue Kinder einrichten</button>` : ''}
        <button class="small danger" data-mt="loeschen" data-icon="trash" title="Klasse samt Ergebnissen vom Server löschen – etwa am Schuljahresende">Vom Server löschen</button>
      </p>
      <div id="mt-login"></div>
      <div class="mt-ansicht">
        <button class="subtab-btn ${this.ansicht === 'uebersicht' ? 'active' : ''}" data-mt="ansicht" data-wert="uebersicht">Übersicht</button>
        <button class="subtab-btn ${this.ansicht === 'benotung' ? 'active' : ''}" data-mt="ansicht" data-wert="benotung">Benotung</button>
      </div>
      <div class="mt-filter inline-form">
        <label>Zeitraum <select data-filter="zeitraum">
          ${[['0', 'Gesamt (Bestwerte)'], ['7', 'Letzte 7 Tage'], ['14', 'Letzte 14 Tage'], ['30', 'Letzte 30 Tage'], ['90', 'Letzte 90 Tage']]
            .map(([v, t]) => `<option value="${v}" ${this.filter.zeitraum === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
        ${this.ansicht === 'benotung' ? `
        <label>Sortieren <select data-filter="sortierung">
          ${[['name', 'Name'], ['schnitt', 'Schnitt']]
            .map(([v, t]) => `<option value="${v}" ${this.filter.sortierung === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
        <label class="mt-haken"><input type="checkbox" data-mt-option="fehltAls6" ${mt.fehltAls6 ? 'checked' : ''}> Nicht gespielt zählt als 6</label>
        <button class="small" data-mt="kopieren" data-icon="clipboard" title="Name und Schnitt als Liste kopieren">Kopieren</button>` : `
        <label>Bereich <select data-filter="bereich"><option value="">Alle</option>
          ${[...new Set(MT_SPIELE.map(s => s.bereich))].map(b => `<option ${this.filter.bereich === b ? 'selected' : ''}>${b}</option>`).join('')}
        </select></label>
        <label>Spiel <select data-filter="spiel"><option value="">Alle</option>
          ${MT_SPIELE.filter(s => !this.filter.bereich || s.bereich === this.filter.bereich)
            .map(s => `<option value="${s.id}" ${this.filter.spiel === s.id ? 'selected' : ''}>${s.bereich}: ${s.titel}</option>`).join('')}
        </select></label>
        <label>Stufe <select data-filter="stufe"><option value="">Alle</option>
          ${this.stufenNamen().map((n, i) => `<option value="${i}" ${this.filter.stufe === String(i) ? 'selected' : ''}>${this.esc(n)}</option>`).join('')}
        </select></label>
        <label>Sortieren <select data-filter="sortierung">
          ${[['name', 'Name'], ['sterne', 'Sterne'], ['runden', 'Runden'], ['zuletzt', 'Zuletzt aktiv']]
            .map(([v, t]) => `<option value="${v}" ${this.filter.sortierung === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>`}
        <button class="small" data-mt="laden" data-icon="reset">Aktualisieren</button>
      </div>
      ${this.ansicht === 'benotung' ? this.auswahlHtml(mt) : ''}
      <div id="mt-auswertung"><p class="hint">Lade Ergebnisse …</p></div>`;
    Icons.hydrate(this.el);
    // Nur holen, wenn der Reiter offen ist – nicht bei jedem Klassenwechsel
    if (this.el.classList.contains('active')) this.laden();
  },

  /* Stufen-Auswahl: Namen des gewählten Spiels, sonst Stufe 1–4 */
  stufenNamen() {
    const sp = MT_SPIELE.find(s => s.id === this.filter.spiel);
    return sp ? sp.stufen : ['Stufe 1 (Junior)', 'Stufe 2 (Anfänger)', 'Stufe 3 (Fortgeschritten)', 'Stufe 4 (Profi)'];
  },

  async klick(e) {
    const b = e.target.closest('[data-mt]');
    if (!b) return;
    const aktion = b.dataset.mt;
    const cls = this.klasse();
    if (aktion === 'einrichten') return this.einrichten(cls);
    if (aktion === 'nachtragen') return this.nachtragen(cls);
    if (aktion === 'laden') { this.ergebnis = null; return this.laden(); }
    if (aktion === 'ansicht') {
      this.ansicht = b.dataset.wert;
      // Sortierungen der beiden Ansichten sind verschieden
      this.filter.sortierung = 'name';
      return this.render();
    }
    if (aktion === 'kopieren') return this.kopieren(cls);
    if (aktion === 'qr') {
      // Am Beamer nur Vornamen; bei gleichen Vornamen den Anfangsbuchstaben des Nachnamens dazu
      const mit = cls.students.filter(s => s.mt);
      const doppelt = n => mit.filter(x => x.first === n).length > 1;
      return this.qrZeigen(cls.name, cls.musiktrainer.passwort, mit.map(s => ({
        name: this.name(s), benutzer: s.mt.name,
        vorname: doppelt(s.first) && s.last ? `${s.first} ${s.last[0]}.` : s.first,
      })));
    }
    if (aktion === 'drucken') return this.drucken(cls.name, cls.musiktrainer.passwort,
      cls.students.filter(s => s.mt).map(s => ({ name: this.name(s), benutzer: s.mt.name })));
    if (aktion === 'pw') {
      const neu = prompt('Neues Klassenpasswort (4 bis 30 Zeichen). Alle Kinder brauchen dann das neue.', cls.musiktrainer.passwort);
      if (!neu || neu === cls.musiktrainer.passwort) return;
      try {
        await this.api(`/api/lehrer/klassen/${cls.musiktrainer.id}`, { methode: 'PATCH', body: { passwort: neu } });
        cls.musiktrainer.passwort = neu.trim();
        Classes.persist();
        this.render();
      } catch (err) { this.fehler(err, document.getElementById('mt-login'), () => this.render()); }
    }
    if (aktion === 'loeschen') {
      if (!confirm(`„${cls.name}“ mit allen Pseudonymen und Ergebnissen vom music-trainer-Server löschen?\n\nDie Kinder können sich danach nicht mehr anmelden. Das lässt sich nicht rückgängig machen.`)) return;
      try {
        await this.api(`/api/lehrer/klassen/${cls.musiktrainer.id}`, { methode: 'DELETE' });
      } catch (err) {
        if (err.status !== 404) return this.fehler(err, document.getElementById('mt-login'), () => this.render());
      }
      delete cls.musiktrainer;
      cls.students.forEach(s => delete s.mt);
      Classes.persist();
      this.ergebnis = null;
      this.render();
    }
    if (aktion === 'kind-loeschen') {
      if (!confirm(`Pseudonym ${b.dataset.name} samt Ergebnissen vom Server löschen?`)) return;
      try { await this.api(`/api/lehrer/schueler/${b.dataset.id}`, { methode: 'DELETE' }); this.ergebnis = null; this.laden(); }
      catch (err) { this.fehler(err, document.getElementById('mt-login'), () => this.render()); }
    }
  },

  aenderung(e) {
    const cls = this.klasse();
    if (e.target.dataset.wahl !== undefined) {
      // Spiel/Stufe für die Benotung an- oder abwählen
      const liste = new Set(cls.musiktrainer.benotung || []);
      e.target.checked ? liste.add(e.target.dataset.wahl) : liste.delete(e.target.dataset.wahl);
      cls.musiktrainer.benotung = [...liste];
      Classes.persist();
      return this.laden();
    }
    if (e.target.dataset.mtOption) {
      cls.musiktrainer[e.target.dataset.mtOption] = e.target.checked;
      Classes.persist();
      return this.laden();
    }
    const f = e.target.dataset.filter;
    if (!f) return;
    this.filter[f] = e.target.value;
    if (f === 'bereich') { this.filter.spiel = ''; this.filter.stufe = ''; }
    if (f === 'spiel') this.filter.stufe = '';
    // Neu laden nur, wenn ein längerer Zeitraum gebraucht wird; sonst nur neu zeichnen
    if (f === 'zeitraum' && this.ergebnis && Number(e.target.value) * 86400 > this.ergebnis.spanne) this.ergebnis = null;
    this.render();
  },

  async einrichten(cls) {
    const pw = document.getElementById('mt-pw-neu').value.trim();
    const belegt = this.alleBelegten();
    const kinder = cls.students.map(s => ({ s, wunsch: this.pseudonym(belegt) }));
    try {
      const d = await this.api('/api/lehrer/klassen', {
        methode: 'POST',
        body: { name: cls.name, passwort: pw, schueler: kinder.map(k => ({ benutzername: k.wunsch })) },
      });
      cls.musiktrainer = { id: d.id, passwort: d.passwort };
      d.schueler.forEach((r, i) => { kinder[i].s.mt = { id: r.id, name: r.benutzername }; });
      Classes.persist();
      this.render();
    } catch (err) { this.fehler(err, document.getElementById('mt-login'), () => this.einrichten(cls)); }
  },

  async nachtragen(cls) {
    const belegt = this.alleBelegten();
    const kinder = cls.students.filter(s => !s.mt).map(s => ({ s, wunsch: this.pseudonym(belegt) }));
    try {
      const d = await this.api(`/api/lehrer/klassen/${cls.musiktrainer.id}/schueler`, {
        methode: 'POST', body: { schueler: kinder.map(k => ({ benutzername: k.wunsch })) },
      });
      d.schueler.forEach((r, i) => { kinder[i].s.mt = { id: r.id, name: r.benutzername }; });
      Classes.persist();
      this.ergebnis = null;
      this.render();
    } catch (err) { this.fehler(err, document.getElementById('mt-login'), () => this.nachtragen(cls)); }
  },

  /* ---------- Auswertung ---------- */
  async laden() {
    const cls = this.klasse();
    const ziel = document.getElementById('mt-auswertung');
    if (!cls?.musiktrainer || !ziel) return;
    const tage = Number(this.filter.zeitraum);
    if (!this.ergebnis || this.ergebnis.klasseId !== cls.musiktrainer.id) {
      // Verlauf immer für mindestens 90 Tage holen – dann kostet das Umschalten des Zeitraums nichts
      const spanne = Math.max(90, tage) * 86400;
      try {
        const daten = await this.api(`/api/lehrer/klassen/${cls.musiktrainer.id}?seit=${Math.floor(Date.now() / 1000) - spanne}`);
        this.ergebnis = { klasseId: cls.musiktrainer.id, daten, spanne };
      } catch (err) {
        if (err.status === 404) { ziel.innerHTML = '<p class="hint">Diese Klasse gibt es auf dem Server nicht mehr.</p>'; return; }
        return this.fehler(err, document.getElementById('mt-login'), () => this.render());
      }
    }
    this.ansicht === 'benotung' ? this.benotung(cls, ziel) : this.tabelle(cls, ziel);
  },

  /* Bestwerte je Kind und „spiel|stufe“: Gesamt aus den Bestwerten, sonst aus
     dem Verlauf im Zeitraum (beste Runde und Zahl der Runden darin) */
  werte(tage) {
    const { daten } = this.ergebnis;
    const seit = tage ? Date.now() / 1000 - tage * 86400 : 0;
    const werte = {};
    if (!tage) {
      daten.schueler.forEach(k => {
        const w = werte[k.id] = {};
        Object.entries(k.fortschritt).forEach(([spiel, st]) => Object.entries(st).forEach(([i, v]) => {
          w[`${spiel}|${i}`] = { sterne: v.sterne, runden: v.runden, punkte: v.punkte };
        }));
      });
    } else {
      daten.verlauf.filter(v => v.zeit >= seit).forEach(v => {
        const w = (werte[v.schueler_id] ||= {})[`${v.spiel}|${v.stufe}`] ||= { sterne: 0, runden: 0, punkte: 0 };
        w.sterne = Math.max(w.sterne, v.sterne);
        w.punkte = Math.max(w.punkte, v.punkte);
        w.runden++;
      });
    }
    return werte;
  },

  tabelle(cls, ziel) {
    const { daten } = this.ergebnis;
    const tage = Number(this.filter.zeitraum);
    const spiele = MT_SPIELE.filter(s => (!this.filter.bereich || s.bereich === this.filter.bereich) && (!this.filter.spiel || s.id === this.filter.spiel));
    const einSpiel = this.filter.spiel ? spiele[0] : null;
    const stufe = this.filter.stufe === '' ? null : Number(this.filter.stufe);
    // Spalten: bei einem Spiel dessen Stufen, sonst die Spiele
    const spalten = einSpiel
      ? einSpiel.stufen.map((n, i) => ({ titel: n, spiel: einSpiel.id, stufen: [i] })).filter(sp => stufe === null || sp.stufen[0] === stufe)
      : spiele.map(s => ({ titel: s.titel, kurz: s.bereich, spiel: s.id, stufen: stufe === null ? s.stufen.map((_, i) => i) : [stufe] }));

    const werte = this.werte(tage);
    const zelle = (id, sp) => sp.stufen.reduce((a, i) => {
      const v = werte[id]?.[`${sp.spiel}|${i}`];
      if (v) { a.sterne += v.sterne; a.runden += v.runden; }
      return a;
    }, { sterne: 0, runden: 0 });

    const nachId = new Map(cls.students.filter(s => s.mt).map(s => [s.mt.id, s]));
    const zeilen = daten.schueler.map(k => {
      const s = nachId.get(k.id);
      const zellen = spalten.map(sp => zelle(k.id, sp));
      return {
        k, s,
        name: s ? this.name(s) : null,
        zellen,
        sterne: zellen.reduce((a, z) => a + z.sterne, 0),
        runden: zellen.reduce((a, z) => a + z.runden, 0),
      };
    });
    const sortierer = {
      name: (a, b) => (a.name || '~' + a.k.benutzername).localeCompare(b.name || '~' + b.k.benutzername, 'de'),
      sterne: (a, b) => b.sterne - a.sterne,
      runden: (a, b) => b.runden - a.runden,
      zuletzt: (a, b) => b.k.zuletzt - a.k.zuletzt,
    };
    zeilen.sort(sortierer[this.filter.sortierung]);
    const maxSterne = spalten.map(sp => sp.stufen.length * this.STERNE);
    const zuletzt = t => {
      if (!t) return 'noch nie';
      const d = Math.floor((Date.now() / 1000 - t) / 86400);
      return d <= 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`;
    };
    const ohneUebung = zeilen.filter(z => z.name && !z.runden).length;

    ziel.innerHTML = `
      <p class="hint">${tage ? `Sterne und Runden der letzten ${tage} Tage.` : 'Beste Sterne insgesamt, Runden insgesamt.'}
        ${ohneUebung ? `<strong>${ohneUebung}</strong> ${ohneUebung === 1 ? 'Kind hat' : 'Kinder haben'} ${tage ? 'in dieser Zeit' : 'noch'} nicht gespielt (gelb).` : ''}</p>
      <div class="mt-tabelle-rahmen">
      <table class="mt-tabelle">
        <thead><tr><th>Name</th>
          ${spalten.map(sp => `<th title="${this.esc(sp.kurz ? `${sp.kurz}: ${sp.titel}` : sp.titel)}">${sp.kurz ? `<span class="mt-kurz">${this.esc(sp.kurz)}</span>` : ''}${this.esc(sp.titel)}</th>`).join('')}
          <th>Sterne</th><th>Runden</th><th>Zuletzt</th></tr></thead>
        <tbody>
          ${zeilen.map(z => `<tr class="${z.name && !z.runden ? 'mt-ohne' : ''}${z.name ? '' : ' mt-fremd'}">
            <td>${z.name ? this.esc(z.name) : `<span class="hint">${this.esc(z.k.benutzername)} – nicht mehr in der Klasse</span>
              <button class="small danger" data-mt="kind-loeschen" data-id="${z.k.id}" data-name="${this.esc(z.k.benutzername)}" title="Vom Server löschen">${Icons.raw('trash')}</button>`}</td>
            ${z.zellen.map((c, i) => `<td class="mt-zelle" style="--anteil:${c.sterne / maxSterne[i]}" title="${c.runden} Runden">${c.sterne || (c.runden ? '0' : '–')}</td>`).join('')}
            <td class="mt-summe">${z.sterne}</td><td>${z.runden}</td><td class="hint">${zuletzt(z.k.zuletzt)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
      <p class="hint">Zahl = Sterne (höchstens 6 je Stufe; 6 Sterne = Note 1). Fahre über ein Feld für die Zahl der Runden.
        Für Noten: Ansicht „Benotung“.</p>`;
  },

  /* ---------- Benotung: nur ausgewählte Spiele/Stufen, Note je Aufgabe und Schnitt ---------- */
  auswahlHtml(mt) {
    const gewaehlt = new Set(mt.benotung || []);
    const bereiche = [...new Set(MT_SPIELE.map(s => s.bereich))];
    return `
      <details class="mt-auswahl" ${gewaehlt.size ? '' : 'open'}>
        <summary>Spiele für die Note (${gewaehlt.size} gewählt)</summary>
        ${bereiche.map(b => `
          <div class="mt-auswahl-bereich"><strong>${b}</strong>
            ${MT_SPIELE.filter(s => s.bereich === b).map(sp => `
              <div class="mt-auswahl-spiel"><span>${this.esc(sp.titel)}</span>
                ${sp.stufen.map((n, i) => `<label class="mt-chip"><input type="checkbox" data-wahl="${sp.id}|${i}" ${gewaehlt.has(`${sp.id}|${i}`) ? 'checked' : ''}>${this.esc(n)}</label>`).join('')}
              </div>`).join('')}
          </div>`).join('')}
      </details>`;
  },

  /* Zeilen für die Benotung: je gewählter Aufgabe die Note (7 − beste Sterne) und der Schnitt */
  notenZeilen(cls) {
    const mt = cls.musiktrainer;
    const auswahl = (mt.benotung || []).map(w => {
      const [id, i] = w.split('|');
      const sp = MT_SPIELE.find(s => s.id === id);
      return sp ? { schluessel: w, spiel: sp, stufe: Number(i) } : null;
    }).filter(Boolean);
    // Reihenfolge wie in der Spielliste, nicht wie angeklickt
    auswahl.sort((a, b) => MT_SPIELE.indexOf(a.spiel) - MT_SPIELE.indexOf(b.spiel) || a.stufe - b.stufe);
    const werte = this.werte(Number(this.filter.zeitraum));
    const nachId = new Map(cls.students.filter(s => s.mt).map(s => [s.mt.id, s]));
    const zeilen = this.ergebnis.daten.schueler.filter(k => nachId.has(k.id)).map(k => {
      const s = nachId.get(k.id);
      const noten = auswahl.map(a => {
        const v = werte[k.id]?.[a.schluessel];
        return v && v.sterne ? 7 - v.sterne : null;
      });
      const zaehlen = noten.map(n => (n === null && mt.fehltAls6 ? 6 : n)).filter(n => n !== null);
      return {
        name: this.name(s), noten,
        gespielt: noten.filter(n => n !== null).length,
        schnitt: zaehlen.length ? zaehlen.reduce((a, n) => a + n, 0) / zaehlen.length : null,
      };
    });
    zeilen.sort(this.filter.sortierung === 'schnitt'
      ? (a, b) => (a.schnitt ?? 99) - (b.schnitt ?? 99)
      : (a, b) => a.name.localeCompare(b.name, 'de'));
    return { auswahl, zeilen };
  },

  komma(x) { return x === null ? '–' : x.toFixed(1).replace('.', ','); },

  benotung(cls, ziel) {
    const { auswahl, zeilen } = this.notenZeilen(cls);
    const tage = Number(this.filter.zeitraum);
    if (!auswahl.length) {
      ziel.innerHTML = '<p class="hint">Wähle oben die Spiele und Stufen aus, die in die Note einfließen sollen.</p>';
      return;
    }
    ziel.innerHTML = `
      <p class="hint">Note je Aufgabe aus der besten Runde ${tage ? `der letzten ${tage} Tage` : 'insgesamt'}
        (6 Sterne = 1 … 1 Stern = 6). ${cls.musiktrainer.fehltAls6 ? 'Nicht Gespieltes zählt als 6.' : 'Nicht Gespieltes zählt nicht mit.'}</p>
      <div class="mt-tabelle-rahmen">
      <table class="mt-tabelle mt-noten">
        <thead><tr><th>Name</th>
          ${auswahl.map(a => `<th title="${this.esc(`${a.spiel.bereich}: ${a.spiel.titel} – ${a.spiel.stufen[a.stufe]}`)}"><span class="mt-kurz">${this.esc(a.spiel.titel)}</span>${this.esc(a.spiel.stufen[a.stufe])}</th>`).join('')}
          <th>Schnitt</th><th>Gespielt</th></tr></thead>
        <tbody>
          ${zeilen.map(z => `<tr class="${z.gespielt < auswahl.length ? 'mt-ohne' : ''}">
            <td>${this.esc(z.name)}</td>
            ${z.noten.map(n => `<td class="mt-note${n ? ` n${n}` : ''}">${n ?? '–'}</td>`).join('')}
            <td class="mt-summe">${this.komma(z.schnitt)}</td>
            <td class="hint">${z.gespielt} / ${auswahl.length}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
      <p class="hint">Gelb markiert: hat nicht alle gewählten Aufgaben gespielt. „Kopieren“ legt Name und Schnitt
        als Liste in die Zwischenablage, z. B. zum Einfügen in eine Notenliste.</p>`;
  },

  async kopieren(cls) {
    if (!this.ergebnis) return;
    const { zeilen } = this.notenZeilen(cls);
    const text = zeilen.map(z => `${z.name}\t${this.komma(z.schnitt)}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert(`${zeilen.length} Zeilen kopiert (Name und Schnitt).`);
    } catch {
      prompt('Kopieren ging nicht automatisch – hier markieren und kopieren:', text);
    }
  },

  /* ---------- Beamer und Druck ---------- */
  anmeldeLink(benutzer, passwort) {
    return `${this.SPIEL_URL}#/anmelden?u=${encodeURIComponent(benutzer)}&p=${encodeURIComponent(passwort)}`;
  },

  /* Ein QR-Code je Kind. Scannen meldet an; Antippen vergrößert einen Code. */
  qrZeigen(titel, passwort, kinder) {
    let b = document.getElementById('mt-beamer');
    if (!b) {
      b = document.createElement('div');
      b.id = 'mt-beamer';
      b.className = 'mt-beamer';
      document.body.appendChild(b);
      document.addEventListener('keydown', e => { if (e.key === 'Escape') b.hidden = true; });
    }
    b.innerHTML = `
      <div class="mt-beamer-kopf">
        <div>
          <h2>${this.esc(titel)}: Anmelden im music-trainer</h2>
          <p>iPad-Kamera öffnen, <b>deinen</b> Code scannen, Link antippen – fertig.</p>
        </div>
        <div class="mt-beamer-pw"><span>Passwort</span><code>${this.esc(passwort)}</code></div>
        <button class="mt-beamer-zu" title="Schließen (Esc)">${Icons.raw('x')}</button>
      </div>
      <div class="mt-qr-raster">
        ${kinder.map((k, i) => `
          <button class="mt-qr-karte" data-i="${i}">
            <span class="mt-qr-bild" id="mt-qr-${i}"></span>
            <span class="mt-qr-name">${this.esc(k.vorname || k.name)}</span>
            <span class="mt-qr-benutzer">${this.esc(k.benutzer)}</span>
          </button>`).join('')}
      </div>
      <p class="mt-beamer-fuss">Ohne Kamera: ${this.esc(this.SPIEL_URL.replace(/^https:\/\//, ''))} öffnen, „Anmelden“, Benutzername steht unter deinem Code.</p>`;
    b.style.setProperty('--qr', (kinder.length > 24 ? 120 : kinder.length > 15 ? 140 : 170) + 'px');
    b.hidden = false;
    kinder.forEach((k, i) => new QRCode(document.getElementById(`mt-qr-${i}`), {
      text: this.anmeldeLink(k.benutzer, passwort), width: 400, height: 400, correctLevel: QRCode.CorrectLevel.M,
    }));
    b.querySelector('.mt-beamer-zu').addEventListener('click', () => { b.hidden = true; });
    b.querySelectorAll('.mt-qr-karte').forEach(k => k.addEventListener('click', () => {
      const war = k.classList.contains('gross');
      b.querySelectorAll('.mt-qr-karte.gross').forEach(x => x.classList.remove('gross'));
      if (!war) k.classList.add('gross');
    }));
  },

  /* Kärtchen zum Ausschneiden, zwei je Zeile */
  drucken(titel, passwort, kinder) {
    let d = document.getElementById('mt-druck');
    if (!d) { d = document.createElement('div'); d.id = 'mt-druck'; document.body.appendChild(d); }
    // Mit QR-Code je Kärtchen: das Kind scannt am Platz seine eigene Karte –
    // sicherer als 26 Codes am Beamer, wo die Kamera leicht den Nachbarcode erwischt
    d.innerHTML = `<div class="mt-karten">${kinder.map((k, i) => `
      <div class="mt-karte">
        <div class="mt-karte-text">
          <div class="mt-karte-kopf">music-trainer</div>
          <div class="mt-karte-name">${this.esc(k.name)} · ${this.esc(titel)}</div>
          <div class="mt-karte-zeile adresse"><span>Adresse</span><b>${this.esc(this.SPIEL_URL.replace(/^https:\/\//, '').replace(/\/$/, ''))}</b></div>
          <div class="mt-karte-zeile"><span>Benutzername</span><b>${this.esc(k.benutzer)}</b></div>
          <div class="mt-karte-zeile"><span>Passwort</span><b>${this.esc(passwort)}</b></div>
        </div>
        <div class="mt-karte-qr" id="mt-karte-qr-${i}"></div>
      </div>`).join('')}</div>`;
    kinder.forEach((k, i) => {
      const feld = document.getElementById(`mt-karte-qr-${i}`);
      new QRCode(feld, { text: this.anmeldeLink(k.benutzer, passwort), width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M });
      feld.insertAdjacentHTML('beforeend', '<span>Scannen zum Anmelden</span>');
    });
    document.body.classList.add('mt-drucken');
    window.addEventListener('afterprint', () => document.body.classList.remove('mt-drucken'), { once: true });
    // Kurz warten, bis die QR-Bilder fertig sind
    setTimeout(() => window.print(), 300);
  },

  /* ---------- Eigene Zugänge (Extras) ---------- */
  gruppen() {
    Classes.data.musiktrainer ||= { gruppen: [] };
    return Classes.data.musiktrainer.gruppen;
  },

  renderEigene() {
    if (!this.eigeneEl) return;
    if (!this.API) {
      this.eigeneEl.innerHTML = '<p class="hint">Erst den music-trainer-Worker eintragen (siehe Reiter Klassen → music-trainer).</p>';
      return;
    }
    const gruppen = this.gruppen();
    this.eigeneEl.innerHTML = `
      ${gruppen.map((g, gi) => `
        <div class="mt-gruppe">
          <div class="projekt-header">
            <strong>${this.esc(g.name)}</strong>
            <span class="hint">Passwort <code>${this.esc(g.passwort)}</code></span>
            <div class="btn-row">
              <button class="small" data-eigen="ergebnisse" data-g="${gi}" data-icon="list" ${g.kinder.length ? '' : 'disabled'}>Ergebnisse</button>
              <button class="small" data-eigen="qr" data-g="${gi}" data-icon="expand" ${g.kinder.length ? '' : 'disabled'}>QR-Codes</button>
              <button class="small" data-eigen="drucken" data-g="${gi}" data-icon="printer" ${g.kinder.length ? '' : 'disabled'}>Kärtchen</button>
              <button class="small danger" data-eigen="gruppe-weg" data-g="${gi}" data-icon="trash">Gruppe löschen</button>
            </div>
          </div>
          <ul class="mt-zugaenge">
            ${g.kinder.map((k, ki) => `<li><code>${this.esc(k.name)}</code>
              <button class="small danger" data-eigen="kind-weg" data-g="${gi}" data-k="${ki}" title="Zugang löschen">${Icons.raw('x')}</button></li>`).join('') || '<li class="hint">Noch keine Zugänge.</li>'}
          </ul>
          <div class="mt-eigen-erg" data-erg="${gi}"></div>
          <div class="inline-form">
            <input type="text" data-neu-kind="${gi}" placeholder="Benutzername, z. B. Emil" maxlength="30" spellcheck="false">
            <button class="small" data-eigen="kind-neu" data-g="${gi}" data-icon="plus">Zugang anlegen</button>
          </div>
        </div>`).join('')}
      <div class="inline-form mt-gruppe-neu">
        <input type="text" id="mt-gruppe-name" placeholder="Neue Gruppe, z. B. Familie" maxlength="40">
        <input type="text" id="mt-gruppe-pw" placeholder="Passwort (mind. 4 Zeichen)" maxlength="30" spellcheck="false">
        <button class="primary small" data-eigen="gruppe-neu" data-icon="plus">Gruppe anlegen</button>
      </div>
      <div id="mt-eigene-login"></div>`;
    Icons.hydrate(this.eigeneEl);
  },

  eigenErg: {},   // Gruppen-ID → { daten, bereich } – nur solange die Ergebnisse offen sind

  /* Sterne der eigenen Zugänge: ohne Bereich je Bereich zusammengefasst,
     mit Bereich je Spiel; im Tooltip die Note je Stufe */
  eigeneErgebnisse(g, ziel) {
    const { daten, bereich } = this.eigenErg[g.id];
    const bereiche = [...new Set(MT_SPIELE.map(s => s.bereich))];
    const spalten = bereich
      ? MT_SPIELE.filter(s => s.bereich === bereich).map(s => ({ titel: s.titel, spiele: [s] }))
      : bereiche.map(b => ({ titel: b, spiele: MT_SPIELE.filter(s => s.bereich === b) }));
    const zelle = (k, sp) => {
      let sterne = 0, runden = 0;
      const info = [];
      sp.spiele.forEach(spiel => spiel.stufen.forEach((n, i) => {
        const v = k.fortschritt[spiel.id]?.[i];
        if (!v) return;
        sterne += v.sterne; runden += v.runden;
        info.push(`${spiel.titel} – ${n}: Note ${7 - v.sterne} (${v.runden}× gespielt)`);
      }));
      const max = sp.spiele.reduce((a, spiel) => a + spiel.stufen.length * this.STERNE, 0);
      return { sterne, runden, max, info: info.join('\n') || 'noch nicht gespielt' };
    };
    const zuletzt = t => {
      if (!t) return 'noch nie';
      const d = Math.floor((Date.now() / 1000 - t) / 86400);
      return d <= 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`;
    };
    ziel.innerHTML = `
      <div class="inline-form mt-filter">
        <label>Bereich <select data-eigen-bereich="${g.id}"><option value="">Alle Bereiche</option>
          ${bereiche.map(b => `<option ${b === bereich ? 'selected' : ''}>${b}</option>`).join('')}
        </select></label>
      </div>
      <div class="mt-tabelle-rahmen">
      <table class="mt-tabelle">
        <thead><tr><th>Zugang</th>${spalten.map(sp => `<th>${this.esc(sp.titel)}</th>`).join('')}<th>Sterne</th><th>Runden</th><th>Zuletzt</th></tr></thead>
        <tbody>
          ${daten.schueler.map(k => {
            const zellen = spalten.map(sp => zelle(k, sp));
            return `<tr><td>${this.esc(k.benutzername)}</td>
              ${zellen.map(c => `<td class="mt-zelle" style="--anteil:${c.max ? c.sterne / c.max : 0}" title="${this.esc(c.info)}">${c.sterne || (c.runden ? '0' : '–')}</td>`).join('')}
              <td class="mt-summe">${zellen.reduce((a, c) => a + c.sterne, 0)}</td>
              <td>${zellen.reduce((a, c) => a + c.runden, 0)}</td>
              <td class="hint">${zuletzt(k.zuletzt)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      <p class="hint">Zahl = Sterne (6 je Stufe = Note 1). Fahre über ein Feld für die Note je Stufe.</p>`;
  },

  async klickEigene(e) {
    const b = e.target.closest('[data-eigen]');
    if (!b) return;
    const gruppen = this.gruppen();
    const g = gruppen[b.dataset.g];
    const login = document.getElementById('mt-eigene-login');
    const nochmal = () => { login.innerHTML = ''; this.klickEigene(e); };
    try {
      if (b.dataset.eigen === 'gruppe-neu') {
        const name = document.getElementById('mt-gruppe-name').value.trim();
        const passwort = document.getElementById('mt-gruppe-pw').value.trim();
        if (!name || passwort.length < 4) return alert('Bitte Gruppenname und ein Passwort mit mindestens 4 Zeichen eingeben.');
        const d = await this.api('/api/lehrer/klassen', { methode: 'POST', body: { name, passwort, schueler: [] } });
        gruppen.push({ id: d.id, name: d.name, passwort: d.passwort, kinder: [] });
      }
      if (b.dataset.eigen === 'kind-neu') {
        const feld = this.eigeneEl.querySelector(`[data-neu-kind="${b.dataset.g}"]`);
        const wunsch = feld.value.replace(/[^A-Za-z0-9]/g, '');
        if (wunsch.length < 3) return alert('Der Benutzername braucht mindestens 3 Buchstaben oder Ziffern (ohne Umlaute und Leerzeichen).');
        const d = await this.api(`/api/lehrer/klassen/${g.id}/schueler`, { methode: 'POST', body: { schueler: [{ benutzername: wunsch }] } });
        const r = d.schueler[0];
        g.kinder.push({ id: r.id, name: r.benutzername });
        if (r.benutzername !== wunsch) alert(`„${wunsch}“ war schon vergeben – der Zugang heißt jetzt ${r.benutzername}.`);
      }
      if (b.dataset.eigen === 'kind-weg') {
        const k = g.kinder[b.dataset.k];
        if (!confirm(`Zugang ${k.name} samt Ergebnissen löschen?`)) return;
        await this.api(`/api/lehrer/schueler/${k.id}`, { methode: 'DELETE' });
        g.kinder.splice(b.dataset.k, 1);
      }
      if (b.dataset.eigen === 'gruppe-weg') {
        if (!confirm(`Gruppe „${g.name}“ mit allen Zugängen und Ergebnissen löschen?`)) return;
        await this.api(`/api/lehrer/klassen/${g.id}`, { methode: 'DELETE' }).catch(err => { if (err.status !== 404) throw err; });
        gruppen.splice(b.dataset.g, 1);
      }
      if (b.dataset.eigen === 'qr') {
        return this.qrZeigen(g.name, g.passwort, g.kinder.map(k => ({ name: k.name, benutzer: k.name })));
      }
      if (b.dataset.eigen === 'drucken') {
        return this.drucken(g.name, g.passwort, g.kinder.map(k => ({ name: k.name, benutzer: k.name })));
      }
      if (b.dataset.eigen === 'ergebnisse') {
        const ziel = this.eigeneEl.querySelector(`[data-erg="${b.dataset.g}"]`);
        if (ziel.innerHTML) { ziel.innerHTML = ''; delete this.eigenErg[g.id]; return; }   // zweiter Klick schließt
        ziel.innerHTML = '<p class="hint">Lade Ergebnisse …</p>';
        const daten = await this.api(`/api/lehrer/klassen/${g.id}`);
        this.eigenErg[g.id] = { daten, bereich: this.eigenErg[g.id]?.bereich || '' };
        return this.eigeneErgebnisse(g, ziel);
      }
      Classes.persist();
      this.renderEigene();
    } catch (err) {
      if (err.status === 401) return this.anmeldeFormular(login, nochmal);
      alert(err.status ? err.message : 'Keine Verbindung zum music-trainer-Server.');
    }
  },
};
