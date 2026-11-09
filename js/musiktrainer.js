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

/* Muss zur Spielliste in music-trainer/js/spiele.js und notenspiele.js passen. Neue Stufen
   hängen hinten an, weil Ergebnisse und „benotung“ an der Stufennummer hängen; „reihe“
   gibt wie im music-trainer die Reihenfolge zum Anzeigen. */
const MT_SPIELE = (() => {
  const vier = { stufen: ['Junior', 'Anfänger', 'Fortgeschritten', 'Profi'] };
  // Stammtöne: Junior 2 und Anfänger 2 kamen im November 2026 dazu
  const sechs = { stufen: ['Junior 1', 'Anfänger 1', 'Fortgeschritten', 'Profi', 'Junior 2', 'Anfänger 2'], reihe: [0, 4, 1, 5, 2, 3] };
  const noten = (art, bereich, stufen) => [
    ['lesen', 'Noten lesen'], ['blitz', 'Blitzlesen'], ['taste', 'Note → Taste'],
    ['schreiben', 'Noten schreiben'], ['kette', 'Notenkette'],
  ].map(([id, titel]) => ({ id: `${art}-${id}`, bereich, titel, ...stufen }));
  return [
    ...noten('stamm', 'Stammtöne', sechs),
    ...noten('vz', 'Vorzeichen', vier),
    { id: 'hoch-tief', bereich: 'Hören', titel: 'Hoch oder tief?', stufen: ['Große Sprünge', 'Kleine Schritte', 'Ganz knapp'] },
    { id: 'intervall', bereich: 'Hören', titel: 'Intervall-Ohr', stufen: ['Prime, Quinte, Oktave', 'Dazu Terz und Quarte', 'Alle Intervalle', 'In Noten: Sekunde bis Quinte', 'In Noten: bis zur Oktave'] },
    { id: 'dur-moll', bereich: 'Hören', titel: 'Akkorde hören', stufen: ['Junior', 'Anfänger', 'Fortgeschritten', 'Profi', 'Profi 2', 'Profi 3'] },
    { id: 'hoerdiktat', bereich: 'Hören', titel: 'Hördiktat', stufen: ['Junior', 'Anfänger', 'Fortgeschritten', 'Profi'] },
    { id: 'instrumente', bereich: 'Hören', titel: 'Instrumente erkennen', stufen: ['Junior', 'Anfänger', 'Fortgeschritten', 'Profi'] },
    { id: 'stilrichtungen', bereich: 'Hören', titel: 'Stilrichtungen', stufen: ['Junior', 'Anfänger', 'Fortgeschritten', 'Profi'] },
    { id: 'spielweisen', bereich: 'Hören', titel: 'Wie entsteht der Ton?', stufen: ['Junior', 'Anfänger', 'Fortgeschritten'] },
    // Rhythmus-Detektiv: seit November 2026 je sechs Stufen für Klasse 5, Klasse 6 und Profi (die ersten drei gab es schon)
    { id: 'rhythmus-detektiv', bereich: 'Rhythmus', titel: 'Rhythmus-Detektiv', stufen: [1, 2, 3, 4, 5, 7].map(n => `Klasse 5 · ${n}`).concat([1, 2, 3, 4, 5, 6].map(n => `Klasse 6 · ${n}`), [1, 2, 3, 4, 5, 6].map(n => `Profi · ${n}`), ['Klasse 5 · 6', 'Profi · 7']),
      reihe: [0, 1, 2, 3, 4, 18, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19] },
    { id: 'rhythmus-bauen', bereich: 'Rhythmus', titel: 'Rhythmus nachbauen', stufen: ['Eine Lücke', 'Zwei Lücken', 'Ein halber Takt', 'Ein ganzer Takt', 'Zwei ganze Takte', 'Ohne Hilfe: ein Takt', 'Ohne Hilfe: zwei Takte', 'Ohne Hilfe: drei Takte'] },
    { id: 'rhythmus-echo', bereich: 'Rhythmus', titel: 'Rhythmus-Echo', stufen: ['Halbe und Viertel', 'Dazu Achtel', 'Nur nach Gehör'] },
    { id: 'taktfuehler', bereich: 'Rhythmus', titel: 'Taktgefühl', stufen: ['Mit Betonung', 'Mit Begleitung', 'Schnell'] },
  ];
})();

const Musiktrainer = {
  /* Adresse des Workers – dieselbe wie in music-trainer/js/konto.js. Leer = Reiter zeigt nur einen Hinweis. */
  API: 'https://music-trainer.tomgruenig87.workers.dev',
  SPIEL_URL: 'https://greenboy87.github.io/music-trainer/',
  // Kurzlink zum Abschreiben (is.gd, leitet fest auf SPIEL_URL weiter, ohne Zwischenseite).
  // Vorsicht: Vertippt als „s.gd“ landet man auf einer fremden Seite.
  KURZ_URL: 'is.gd/rsamusik',
  TOKEN_KEY: 'schooltool-musiktrainer-lehrer',

  TIERE: ['Panda', 'Fuchs', 'Tiger', 'Otter', 'Biber', 'Eule', 'Igel', 'Koala', 'Luchs', 'Wal', 'Adler', 'Dachs', 'Lama', 'Robbe', 'Zebra', 'Falke'],
  INSTRUMENTE: ['Geige', 'Tuba', 'Harfe', 'Cello', 'Pauke', 'Banjo', 'Oboe', 'Horn', 'Gitarre', 'Bass', 'Trommel', 'Kazoo'],

  ergebnis: null,          // { klasseId, daten } – zuletzt geladene Auswertung (Verlauf eines Jahres)
  filter: { zeitraum: '0', sortierung: 'name' },
  score: false,            // Schalter Noten ⟷ Score
  scoreArt: 'sterne',      // Score: 'sterne' (5/6), 'prozent' (richtig), 'richtige' (beste Runde) oder 'punkte'
  STERNE: 6,               // 6 Sterne = Note 1 … 1 Stern = Note 6

  init() {
    this.score = localStorage.getItem('schooltool-mt-score') === 'an';
    this.scoreArt = localStorage.getItem('schooltool-mt-score-art') || 'sterne';
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
          <button data-mt="namen" data-icon="list">Namensliste am Beamer</button>
          <button data-mt="liste" data-icon="printer">Liste drucken</button>
          <button data-mt="drucken" data-icon="printer">Kärtchen drucken</button>
        </div>
      </div>
      <p class="mt-zugang">Klassenpasswort <code>${this.esc(mt.passwort)}</code>
        <button class="small" data-mt="pw" data-icon="reset">ändern</button>
        ${ohne.length ? `<button class="small" data-mt="nachtragen" data-icon="plus">${ohne.length} neue Kinder einrichten</button>` : ''}
        <button class="small danger" data-mt="loeschen" data-icon="trash" title="Klasse samt Ergebnissen vom Server löschen – etwa am Schuljahresende">Vom Server löschen</button>
      </p>
      <div id="mt-login"></div>
      ${this.kategorienHtml(mt)}
      <div class="mt-filter inline-form">
        <label class="schalter mt-score-schalter" title="Statt der Note einen Score zeigen: Sterne, Prozent richtig oder Punkte">
          <span>Noten</span>
          <input type="checkbox" role="switch" data-mt-score ${this.score ? 'checked' : ''}>
          <span class="schalter-bahn" aria-hidden="true"></span>
          <span>Score</span>
        </label>
        ${this.score ? `<label>Score <select data-score-art>
          ${[['sterne', 'Sterne (z. B. 5/6)'], ['prozent', 'Prozent richtig'], ['richtige', 'Richtige (beste Runde)'], ['punkte', 'Punkte']]
            .map(([v, t]) => `<option value="${v}" ${this.scoreArt === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>` : ''}
        <label>Zeitraum <select data-filter="zeitraum">
          ${[['0', 'Gesamt'], ['7', 'Letzte 7 Tage'], ['14', 'Letzte 14 Tage'], ['30', 'Letzte 30 Tage'], ['90', 'Letzte 90 Tage']]
            .map(([v, t]) => `<option value="${v}" ${this.filter.zeitraum === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
        <label>Sortieren <select data-filter="sortierung">
          ${[['name', 'Name'], ['ergebnis', this.score ? 'Score' : 'Note'], ['tage', 'Übungstage'], ['zuletzt', 'Zuletzt aktiv']]
            .map(([v, t]) => `<option value="${v}" ${this.filter.sortierung === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
        <label class="mt-haken"><input type="checkbox" data-mt-option="fehltAls6" ${mt.fehltAls6 ? 'checked' : ''}> Nicht gespielt zählt als 6</label>
      </div>
      <div class="btn-row mt-knoepfe">
        <button class="small" data-mt="scoreboard" data-icon="expand" title="Die Tabelle als Rangliste im Vollbild – zum Zeigen am Beamer">Scoreboard</button>
        <button class="small" data-mt="klasse" data-icon="expand" title="Notenschlüssel, was zählt und Notenspiegel – ohne Namen">Notenschlüssel am Beamer</button>
        <button class="small primary" data-mt="uebertragen" data-icon="pen" title="Die Noten der rechten Spalte als Spalte unter „Projekte & Noten“ eintragen">Noten in Klassenliste übertragen</button>
        <button class="small" data-mt="kopieren" data-icon="clipboard" title="Name und Note als Liste kopieren">Kopieren</button>
        <button class="small" data-mt="laden" data-icon="reset">Aktualisieren</button>
      </div>
      <div id="mt-auswertung"><p class="hint">Lade Ergebnisse …</p></div>`;
    Icons.hydrate(this.el);
    // Nur holen, wenn der Reiter offen ist – nicht bei jedem Klassenwechsel
    if (this.el.classList.contains('active')) this.laden();
  },

  /* ---------- Kategorien: welche Spiele und Stufen die Tabelle zeigt und benotet ---------- */
  /* Je Klasse gemerkt: { bereiche, ohne (abgewählte Spiele), stufenJe: { Bereich: [Stufennummern] } };
     ein Bereich ohne eigene Wahl nimmt „stufen“ (bis November 2026 galt das für alle). Ohne
     gespeicherte Wahl: aus der bisherigen Auswahl für die Note, sonst Stammtöne Junior 1 und Anfänger 1. */
  kategorien(mt) {
    if (!mt.kategorien) {
      const alt = (mt.benotung || []).map(w => w.split('|')).filter(([id]) => MT_SPIELE.some(sp => sp.id === id));
      const spiele = new Set(alt.map(([id]) => id));
      const bereiche = [...new Set(MT_SPIELE.filter(sp => spiele.has(sp.id)).map(sp => sp.bereich))];
      const bereichVon = id => MT_SPIELE.find(sp => sp.id === id).bereich;
      mt.kategorien = alt.length
        ? {
          bereiche,
          ohne: MT_SPIELE.filter(sp => bereiche.includes(sp.bereich) && !spiele.has(sp.id)).map(sp => sp.id),
          stufen: [0, 1],
          stufenJe: Object.fromEntries(bereiche.map(b =>
            [b, [...new Set(alt.filter(([id]) => bereichVon(id) === b).map(([, i]) => Number(i)))]])),
        }
        : { bereiche: ['Stammtöne'], ohne: [], stufen: [0, 1] };
    }
    return mt.kategorien;
  },

  /* Die gewählten Stufen eines Bereichs */
  stufenVon(k, bereich) { return k.stufenJe?.[bereich] || k.stufen || []; },

  /* Die Spalten: gewählte Bereiche × Spiele × Stufen, in der Reihenfolge der Spielliste und der Stufen */
  spalten(mt) {
    const k = this.kategorien(mt);
    return MT_SPIELE.filter(sp => k.bereiche.includes(sp.bereich) && !k.ohne.includes(sp.id))
      .flatMap(sp => this.reihe(sp).filter(i => this.stufenVon(k, sp.bereich).includes(i))
        .map(i => ({ spiel: sp, stufe: i, schluessel: `${sp.id}|${i}` })));
  },

  /* Stufennummern eines Spiels in der Reihenfolge zum Spielen */
  reihe(sp) { return sp.reihe || sp.stufen.map((_, i) => i); },

  /* Die Stufen der Spiele eines Bereichs als Liste [{ i, name, titel }]: beim Namen, wenn die Spiele
     ihre Stufen gleich nennen, in der Reihenfolge zum Spielen; sonst „Stufe 1, 2 …“ (Namen im Tooltip) */
  stufenListe(spiele) {
    const zahl = Math.max(0, ...spiele.map(sp => sp.stufen.length));
    const namen = i => [...new Set(spiele.map(sp => sp.stufen[i]).filter(Boolean))];
    const nummern = Array.from({ length: zahl }, (_, i) => i);
    if (nummern.some(i => namen(i).length > 1))
      return nummern.map(i => ({ i, name: `Stufe ${i + 1}`, titel: namen(i).join(' · ') }));
    const lang = [...spiele].sort((a, b) => b.stufen.length - a.stufen.length);
    return [...new Set(lang.flatMap(sp => this.reihe(sp)))].map(i => ({ i, name: namen(i)[0], titel: '' }));
  },

  kategorienHtml(mt) {
    const k = this.kategorien(mt);
    const bereiche = [...new Set(MT_SPIELE.map(sp => sp.bereich))];
    const spiele = MT_SPIELE.filter(sp => k.bereiche.includes(sp.bereich));
    const aktiv = spiele.filter(sp => !k.ohne.includes(sp.id));
    // Stufen je Bereich, bei mehreren Bereichen eine Zeile für jeden
    const mitStufen = bereiche.filter(b => aktiv.some(sp => sp.bereich === b));
    const doppelt = sp => spiele.filter(x => x.titel === sp.titel).length > 1;
    const chip = (art, wert, an, text, titel = '', bereich = '') => `<label class="mt-chip"${titel ? ` title="${this.esc(titel)}"` : ''}>
      <input type="checkbox" data-kat="${art}" value="${this.esc(wert)}"${bereich ? ` data-bereich="${this.esc(bereich)}"` : ''} ${an ? 'checked' : ''}>${text}</label>`;
    return `
      <div class="mt-kategorien">
        <div class="mt-kat-zeile"><span class="mt-kat-titel">Bereich</span>
          ${bereiche.map(b => chip('bereich', b, k.bereiche.includes(b), this.esc(b))).join('')}</div>
        ${spiele.length ? `
        <div class="mt-kat-zeile"><span class="mt-kat-titel">Spiel</span>
          ${spiele.map(sp => chip('spiel', sp.id, !k.ohne.includes(sp.id),
            this.esc(sp.titel) + (doppelt(sp) ? ` <span class="hint">${this.esc(sp.bereich)}</span>` : ''), `${sp.bereich}: ${sp.titel}`)).join('')}</div>` : ''}
        ${mitStufen.map((b, n) => `
        <div class="mt-kat-zeile"><span class="mt-kat-titel">${n ? '' : 'Stufe'}</span>
          ${mitStufen.length > 1 ? `<span class="mt-kat-bereich">${this.esc(b)}</span>` : ''}
          ${this.stufenListe(aktiv.filter(sp => sp.bereich === b)).map(s =>
            chip('stufe', s.i, this.stufenVon(k, b).includes(s.i), this.esc(s.name), s.titel, b)).join('')}</div>`).join('')}
      </div>`;
  },

  /* Kurzbeschreibung der Wahl, z. B. „Stammtöne · Junior 1, Junior 2“ – für Scoreboard und Notenspalte;
     kurz: ohne die Liste abgewählter Spiele (Überschrift am Beamer) */
  kategorienText(mt, kurz) {
    const k = this.kategorien(mt);
    const spalten = this.spalten(mt);
    const teile = [...new Set(spalten.map(s => s.spiel.bereich))].map(b => {
      const spiele = [...new Set(spalten.filter(s => s.spiel.bereich === b).map(s => s.spiel))];
      return `${b} · ${this.stufenListe(spiele).filter(s => this.stufenVon(k, b).includes(s.i)).map(s => s.name).join(', ')}`;
    });
    const ohne = MT_SPIELE.filter(sp => k.bereiche.includes(sp.bereich) && k.ohne.includes(sp.id)).map(sp => sp.titel);
    return `${teile.join(' + ') || k.bereiche.join(' + ')}${ohne.length && !kurz ? ` (ohne ${ohne.join(', ')})` : ''}`;
  },

  async klick(e) {
    const b = e.target.closest('[data-mt]');
    if (!b) return;
    const aktion = b.dataset.mt;
    const cls = this.klasse();
    if (aktion === 'einrichten') return this.einrichten(cls);
    if (aktion === 'nachtragen') return this.nachtragen(cls);
    if (aktion === 'laden') { this.ergebnis = null; return this.laden(); }
    if (aktion === 'kopieren') return this.kopieren(cls);
    if (aktion === 'klasse') return this.klasseZeigen(cls);
    if (aktion === 'scoreboard') return this.scoreboardZeigen(cls);
    if (aktion === 'uebertragen') return this.uebertragen(cls);
    if (aktion === 'meine') return this.meineNoteSetzen(cls);
    if (aktion === 'qr') {
      // Am Beamer nur Vornamen; bei gleichen Vornamen den Anfangsbuchstaben des Nachnamens dazu
      // Alphabetisch, damit jedes Kind seine Seite schnell findet
      const mit = cls.students.filter(s => s.mt).sort((a, c) => this.name(a).localeCompare(this.name(c), 'de'));
      const doppelt = n => mit.filter(x => x.first === n).length > 1;
      return this.qrZeigen(cls.name, cls.musiktrainer.passwort, mit.map(s => ({
        name: this.name(s), benutzer: s.mt.name,
        vorname: doppelt(s.first) && s.last ? `${s.first} ${s.last[0]}.` : s.first,
      })));
    }
    if (aktion === 'namen') return this.namenslisteZeigen(cls.name, cls.musiktrainer.passwort,
      cls.students.filter(s => s.mt).map(s => ({ name: this.name(s), benutzer: s.mt.name })));
    if (aktion === 'liste') return this.listeDrucken(cls.name, cls.musiktrainer.passwort,
      cls.students.filter(s => s.mt).map(s => ({ name: this.name(s), benutzer: s.mt.name })));
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
    if (e.target.dataset.kat) {
      // Bereich, Spiel oder Stufe an- oder abwählen; Spiele und Stufen hängen an den Bereichen
      const k = this.kategorien(cls.musiktrainer);
      const { kat } = e.target.dataset, wert = e.target.value, an = e.target.checked;
      if (kat === 'bereich') k.bereiche = an ? [...k.bereiche, wert] : k.bereiche.filter(x => x !== wert);
      if (kat === 'spiel') k.ohne = an ? k.ohne.filter(x => x !== wert) : [...k.ohne, wert];
      if (kat === 'stufe') {
        const b = e.target.dataset.bereich, alt = this.stufenVon(k, b);
        k.stufenJe = { ...k.stufenJe, [b]: an ? [...alt, Number(wert)] : alt.filter(x => x !== Number(wert)) };
      }
      Classes.persist();
      return this.render();
    }
    if (e.target.dataset.mtScore !== undefined) {
      this.score = e.target.checked;
      localStorage.setItem('schooltool-mt-score', this.score ? 'an' : 'aus');
      return this.render();
    }
    if (e.target.dataset.scoreArt !== undefined) {
      this.scoreArt = e.target.value;
      localStorage.setItem('schooltool-mt-score-art', this.scoreArt);
      return this.render();
    }
    if (e.target.dataset.mtOption) {
      cls.musiktrainer[e.target.dataset.mtOption] = e.target.checked;
      Classes.persist();
      return this.laden();
    }
    const f = e.target.dataset.filter;
    if (!f) return;
    this.filter[f] = e.target.value;
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
  /* Geholt wird der Verlauf eines ganzen Jahres (so lange hebt der Server ihn auf): Daraus
     rechnen alle Zeiträume, der Schnitt der besten 3 Runden, Übungstage und -zeit. */
  async laden() {
    const cls = this.klasse();
    const ziel = document.getElementById('mt-auswertung');
    if (!cls?.musiktrainer || !ziel) return;
    if (!this.ergebnis || this.ergebnis.klasseId !== cls.musiktrainer.id) {
      try {
        const daten = await this.api(`/api/lehrer/klassen/${cls.musiktrainer.id}?seit=${Math.floor(Date.now() / 1000) - 366 * 86400}`);
        this.ergebnis = { klasseId: cls.musiktrainer.id, daten };
      } catch (err) {
        if (err.status === 404) { ziel.innerHTML = '<p class="hint">Diese Klasse gibt es auf dem Server nicht mehr.</p>'; return; }
        return this.fehler(err, document.getElementById('mt-login'), () => this.render());
      }
    }
    this.benotungSenden(cls);
    this.tabelle(cls, ziel);
  },

  /* Je Kind und „spiel|stufe“ aus den Runden im Zeitraum: Sterne als Schnitt der drei besten
     Runden (wer weniger gespielt hat: der gespielten), ebenso Prozent richtig; Punkte = Rekord */
  werte(tage) {
    const seit = tage ? Date.now() / 1000 - tage * 86400 : 0;
    const runden = {};
    this.ergebnis.daten.verlauf.forEach(v => {
      if (v.zeit >= seit) ((runden[v.schueler_id] ||= {})[`${v.spiel}|${v.stufe}`] ||= []).push(v);
    });
    const schnitt3 = zahlen => {
      const top = [...zahlen].sort((x, y) => y - x).slice(0, 3);
      return top.length ? top.reduce((x, n) => x + n, 0) / top.length : null;
    };
    const werte = {};
    Object.entries(runden).forEach(([id, stufen]) => {
      const w = werte[id] = {};
      Object.entries(stufen).forEach(([schluessel, liste]) => {
        const mitAnteil = liste.filter(v => v.von);
        w[schluessel] = {
          sterne: schnitt3(liste.map(v => v.sterne)),
          beste: liste.map(v => v.sterne).sort((x, y) => y - x).slice(0, 3),
          prozent: mitAnteil.length ? schnitt3(mitAnteil.map(v => Math.min(100, 100 * v.richtig / v.von))) : null,
          punkte: Math.max(...liste.map(v => v.punkte)),
          // Richtige der besten Runde; Blitzlesen gibt 10 Punkte je Note, das geht auch für ältere Runden
          richtig: Math.max(-1, ...liste.map(v => v.richtig ?? (v.spiel.endsWith('-blitz') ? Math.round(v.punkte / 10) : -1))),
          runden: liste.length,
        };
      });
    });
    return werte;
  },

  /* Übung je Kind im Zeitraum, über alle Spiele: Runden, Tage (angemeldet geöffnet oder
     gespielt) und Zeit (Dauer der Runden, gespeichert seit 01.11.2026) */
  uebung(tage) {
    const seit = tage ? Date.now() / 1000 - tage * 86400 : 0;
    const tag = t => Math.floor((t + 3600) / 86400);       // wie im Worker: grob deutsche Zeit
    const u = {};
    const kind = id => (u[id] ||= { runden: 0, tage: new Set(), sekunden: 0 });
    this.ergebnis.daten.verlauf.forEach(v => {
      if (v.zeit < seit) return;
      const k = kind(v.schueler_id);
      k.runden++;
      k.tage.add(tag(v.zeit));
      k.sekunden += v.dauer || 0;
    });
    (this.ergebnis.daten.besuche || []).forEach(b => { if (b.tag >= tag(seit)) kind(b.schueler_id).tage.add(b.tag); });
    return u;
  },

  zeit(sekunden) {
    if (!sekunden) return '–';
    const min = Math.round(sekunden / 60);
    return min < 60 ? `${min}&nbsp;min` : `${Math.floor(min / 60)}&nbsp;h&nbsp;${min % 60}&nbsp;min`;
  },

  /* ---------- Notentabelle: je Spiel und Stufe ein Feld ---------- */
  STUFE_KURZ: {
    Junior: 'J', 'Junior 1': 'J1', 'Junior 2': 'J2', Anfänger: 'A', 'Anfänger 1': 'A1', 'Anfänger 2': 'A2',
    Fortgeschritten: 'F', Profi: 'P', 'Profi 2': 'P2', 'Profi 3': 'P3',
    ...Object.fromEntries([5, 6].flatMap(k => [1, 2, 3, 4, 5, 6, 7].map(n => [`Klasse ${k} · ${n}`, `${k}.${n}`]))),
    ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(n => [`Profi · ${n}`, `P${n}`])),
  },

  /* Zwei Kopfzeilen: oben das Spiel über seinen Stufen, darunter die Stufe kurz
     (J1, J2, A1 …; sonst die Nummer, der Name steht im Tooltip). spalten = [{ spiel, stufe }] */
  kopf(spalten) {
    const gruppen = [];
    spalten.forEach(s => {
      const g = gruppen[gruppen.length - 1];
      if (g?.spiel === s.spiel) g.n++;
      else gruppen.push({ spiel: s.spiel, n: 1 });
    });
    return {
      oben: gruppen.map(g => `<th colspan="${g.n}" class="mt-spielkopf" title="${this.esc(`${g.spiel.bereich}: ${g.spiel.titel}`)}">
        <span class="mt-kurz">${this.esc(g.spiel.bereich)}</span>${this.esc(g.spiel.titel)}</th>`).join(''),
      unten: spalten.map(s => `<th class="mt-stufenkopf" title="${this.esc(s.spiel.stufen[s.stufe])}">${this.STUFE_KURZ[s.spiel.stufen[s.stufe]] || this.reihe(s.spiel).indexOf(s.stufe) + 1}</th>`).join(''),
    };
  },

  /* Was in den Feldern steht: die Note oder ein Score */
  modus() { return this.score ? this.scoreArt : 'note'; },

  /* Zahl mit Komma, ohne „,0“ */
  kurz(x) { return this.komma(x).replace(',0', ''); },

  /* Ein Feld: Note (Schnitt der 3 besten Runden) als farbiger Kreis oder der Score (Sterne,
     Prozent richtig, Punkte-Rekord); nicht gespielt: „offen“ (gestrichelt) oder nur ein Punkt */
  zelle(v, spiel, stufe, leer = 'offen') {
    const was = `${spiel.titel} – ${spiel.stufen[stufe]}`;
    if (!v?.sterne) return leer === 'offen' ? `<span class="mt-kreis offen" title="${this.esc(`${was}: noch nicht gespielt`)}">offen</span>` : '<span class="hint">·</span>';
    const note = Math.min(6, 7 - v.sterne);
    const titel = this.esc(`${was}: beste Runden ${v.beste.join(', ')} Sterne → Note ${this.kurz(note)}${
      v.prozent !== null ? `, ${Math.round(v.prozent)} % richtig` : ''}${v.richtig >= 0 ? `, beste Runde ${v.richtig} richtig` : ''}, Rekord ${v.punkte} Punkte, ${v.runden}× gespielt`);
    const modus = this.modus();
    if (modus === 'sterne') return `<span class="mt-wert n${Math.round(note)}" title="${titel}">${this.kurz(v.sterne)}/${this.STERNE}</span>`;
    if (modus === 'punkte') return `<span class="mt-wert" title="${titel}">${v.punkte}</span>`;
    if (modus === 'richtige') {
      if (v.richtig < 0) return `<span class="hint" title="${this.esc(`${was}: vor dem Update am 01.11.2026 gespielt`)}">–</span>`;
      const blitz = spiel.id.endsWith('-blitz');
      return `<span class="mt-wert" title="${titel}">${v.richtig}${blitz ? '' : '/10'}</span>`;
    }
    if (modus === 'prozent') {
      return v.prozent === null
        ? `<span class="hint" title="${this.esc(`${was}: vor dem Update am 01.11.2026 gespielt – da wurden die richtigen Antworten noch nicht gespeichert`)}">–</span>`
        : `<span class="mt-wert n${this.noteAusProzent(Math.round(v.prozent), spiel)}" title="${titel}">${Math.round(v.prozent)}&nbsp;%</span>`;
    }
    return `<span class="mt-kreis n${Math.round(note)}${Number.isInteger(note) ? '' : ' dezimal'}" title="${titel}">${this.kurz(note)}</span>`;
  },

  /* Farbe zum Prozentwert nach dem Schlüssel des music-trainers (Blitzlesen: 85 % reichen für die 2) */
  noteAusProzent(p, spiel) {
    return [100, spiel?.id.endsWith('-blitz') ? 85 : 90, 70, 50, 30].findIndex(g => p >= g) + 1 || 6;
  },

  gesamtNote(x) { return x === null ? '<span class="hint">–</span>' : `<span class="mt-gesamtnote n${Math.round(x)}">${this.komma(x)}</span>`; },

  /* Rechte Spalte: Gesamtnote oder Score über alle Spalten; zahl zum Sortieren */
  gesamt(z, spalten, mt) {
    const modus = this.modus();
    if (modus === 'note') return { html: this.gesamtNote(z.schnitt), zahl: z.schnitt };
    if (modus === 'sterne') {
      const st = z.bestwerte.reduce((a, v) => a + (v?.sterne || 0), 0);
      return { html: `<span class="mt-wert gesamt">${this.kurz(st)}/${spalten.length * this.STERNE}</span>`, zahl: z.gespielt ? st : null };
    }
    if (modus === 'richtige') {
      const n = z.bestwerte.reduce((a, v) => a + (v?.sterne && v.richtig > 0 ? v.richtig : 0), 0);
      return { html: z.gespielt ? `<span class="mt-wert gesamt">${n}</span>` : '<span class="hint">–</span>', zahl: z.gespielt ? n : null };
    }
    if (modus === 'punkte') {
      const pk = z.bestwerte.reduce((a, v) => a + (v?.sterne ? v.punkte : 0), 0);
      return { html: z.gespielt ? `<span class="mt-wert gesamt">${pk}</span>` : '<span class="hint">–</span>', zahl: z.gespielt ? pk : null };
    }
    const liste = z.bestwerte.map(v => (v?.sterne ? v.prozent : mt.fehltAls6 ? 0 : null)).filter(p => p !== null);
    const p = liste.length ? Math.round(liste.reduce((a, x) => a + x, 0) / liste.length) : null;
    return { html: p === null ? '<span class="hint">–</span>' : `<span class="mt-wert gesamt n${this.noteAusProzent(p)}">${p}&nbsp;%</span>`, zahl: p };
  },

  legende(spalten) {
    const namen = [...new Set(spalten.map(s => s.spiel.stufen[s.stufe]))];
    const kurz = namen.filter(n => this.STUFE_KURZ[n]).map(n => `${this.STUFE_KURZ[n]} = ${n}`);
    const nummer = namen.some(n => !this.STUFE_KURZ[n]);
    const text = {
      note: `Note je Aufgabe aus dem Schnitt der 3 besten Runden (wer weniger gespielt hat: der gespielten);
        6&nbsp;Sterne = 1 · 5 = 2 · 4 = 3 · 3 = 4 · 2 = 5 · 1&nbsp;Stern = 6. Rechts der Durchschnitt.`,
      sterne: 'Sterne im Schnitt der 3 besten Runden (6/6 = Note 1 … 1/6 = Note 6). Rechts alle zusammen von den möglichen.',
      prozent: `Richtig beantwortet im Schnitt der 3 besten Runden, von 10 Aufgaben (Blitzlesen: richtige Noten vom Ziel für
        die 1, höchstens 100&nbsp;%). Gespeichert erst seit dem Update vom 01.11.2026 – ältere Runden zeigen –. Rechts der Durchschnitt.`,
      richtige: `Richtige Antworten der besten Runde, von 10 (Blitzlesen: Noten in 60 Sekunden – auch für ältere Runden,
        aus den Punkten). Rechts alle zusammen.`,
      punkte: `Punkte-Rekord: die beste Runde, 10 je richtige Antwort und ein Bonus für Serien, höchstens 170 (Blitzlesen:
        10 je Note). Rechts alle zusammen.`,
    }[this.modus()];
    return `<p class="hint mt-legende">${text}
      ${kurz.length ? `${kurz.join(', ')}.` : ''} ${nummer ? 'Zahlen = Stufe 1, 2, 3 …' : ''}
      Runden, Tage und Zeit zählen alle Spiele im Zeitraum; Tage = an wie vielen Tagen angemeldet im music-trainer,
      Zeit = Dauer der Runden (gemessen seit 01.11.2026). Fahre über ein Feld für die Einzelheiten.</p>`;
  },

  zuletzt(t) {
    if (!t) return 'noch nie';
    const d = Math.floor((Date.now() / 1000 - t) / 86400);
    return d <= 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`;
  },

  /* Zeilen je Kind der Klasse: Werte je Spalte, Note je Aufgabe (7 − Schnitt der 3 besten
     Runden) und deren Durchschnitt – für Tabelle, Scoreboard, Klassenliste und Kopieren */
  notenZeilen(cls) {
    const mt = cls.musiktrainer;
    const auswahl = this.spalten(mt);
    const werte = this.werte(Number(this.filter.zeitraum));
    const nachId = new Map(cls.students.filter(s => s.mt).map(s => [s.mt.id, s]));
    const zeilen = this.ergebnis.daten.schueler.filter(k => nachId.has(k.id)).map(k => {
      const s = nachId.get(k.id);
      const bestwerte = auswahl.map(a => werte[k.id]?.[a.schluessel]);
      const noten = bestwerte.map(v => (v?.sterne ? Math.min(6, 7 - v.sterne) : null));
      const zaehlen = noten.map(n => (n === null && mt.fehltAls6 ? 6 : n)).filter(n => n !== null);
      return {
        k, s, name: this.name(s), noten, bestwerte,
        gespielt: noten.filter(n => n !== null).length,
        schnitt: zaehlen.length ? zaehlen.reduce((a, n) => a + n, 0) / zaehlen.length : null,
      };
    });
    zeilen.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return { auswahl, zeilen, werte };
  },

  komma(x) { return x === null ? '–' : x.toFixed(1).replace('.', ','); },

  tabelle(cls, ziel) {
    const mt = cls.musiktrainer;
    const { auswahl, zeilen, werte } = this.notenZeilen(cls);
    const tage = Number(this.filter.zeitraum);
    if (!auswahl.length) {
      ziel.innerHTML = '<p class="hint">Oben mindestens einen Bereich, ein Spiel und eine Stufe wählen.</p>';
      return;
    }
    const uebung = this.uebung(tage);
    const modus = this.modus();
    // Pseudonyme auf dem Server, die es in der Klasse nicht mehr gibt – zum Löschen am Ende
    const fremd = this.ergebnis.daten.schueler.filter(k => !zeilen.some(z => z.k === k));
    const reihen = zeilen.map(z => ({ ...z, gesamt: this.gesamt(z, auswahl, mt), u: uebung[z.k.id] }));
    const sortierer = {
      name: () => 0,
      ergebnis: (a, b) => (a.gesamt.zahl === null) - (b.gesamt.zahl === null)
        || (modus === 'note' ? a.gesamt.zahl - b.gesamt.zahl : b.gesamt.zahl - a.gesamt.zahl),
      tage: (a, b) => (b.u?.tage.size || 0) - (a.u?.tage.size || 0),
      zuletzt: (a, b) => b.k.zuletzt - a.k.zuletzt,
    };
    reihen.sort(sortierer[this.filter.sortierung] || sortierer.name);
    const offen = zeilen.filter(z => z.gespielt < auswahl.length).length;
    const { oben, unten } = this.kopf(auswahl);
    const uebungZellen = (k, u) => `<td>${u?.runden || 0}</td><td>${u?.tage.size || 0}</td><td class="hint">${this.zeit(u?.sekunden)}</td>
      <td class="hint">${this.zuletzt(k.zuletzt)}</td>`;
    ziel.innerHTML = `
      ${this.meineNoteHinweis(cls)}
      <p class="hint">${this.score ? 'Score' : 'Note'} je Aufgabe ${tage ? `aus den letzten ${tage} Tagen` : 'insgesamt'}.
        ${mt.fehltAls6 ? 'Nicht Gespieltes zählt als 6.' : 'Nicht Gespieltes zählt nicht mit.'}
        ${offen ? `<strong>${offen}</strong> ${offen === 1 ? 'Kind hat' : 'Kinder haben'} noch offene Aufgaben (gelb).` : ''}</p>
      <div class="mt-tabelle-rahmen">
      <table class="mt-tabelle mt-notentabelle">
        <thead>
          <tr><th rowspan="2">Name</th>${oben}
            <th rowspan="2" class="mt-gesamtkopf">${{ note: 'Note', sterne: 'Sterne', prozent: 'Ø %', richtige: 'Richtige', punkte: 'Punkte' }[modus]}</th>
            <th rowspan="2" title="Runden in allen Spielen">Runden</th><th rowspan="2" title="Tage, an denen das Kind angemeldet im music-trainer war">Tage</th>
            <th rowspan="2" title="Übungszeit (gemessen seit 01.11.2026)">Zeit</th><th rowspan="2">Zuletzt</th></tr>
          <tr>${unten}</tr>
        </thead>
        <tbody>
          ${reihen.map(z => `<tr class="${z.gespielt < auswahl.length ? 'mt-ohne' : ''}">
            <td>${this.esc(z.name)}</td>
            ${z.bestwerte.map((v, i) => `<td>${this.zelle(v, auswahl[i].spiel, auswahl[i].stufe)}</td>`).join('')}
            <td>${z.gesamt.html}</td>${uebungZellen(z.k, z.u)}
          </tr>`).join('')}
          ${fremd.map(k => `<tr class="mt-fremd">
            <td><span class="hint">${this.esc(k.benutzername)} – nicht mehr in der Klasse</span>
              <button class="small danger" data-mt="kind-loeschen" data-id="${k.id}" data-name="${this.esc(k.benutzername)}" title="Vom Server löschen">${Icons.raw('trash')}</button></td>
            ${auswahl.map(a => `<td>${this.zelle(werte[k.id]?.[a.schluessel], a.spiel, a.stufe, 'punkt')}</td>`).join('')}
            <td></td>${uebungZellen(k, uebung[k.id])}
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
      ${this.legende(auswahl)}`;
  },

  /* ---------- „Meine Note“ der Kinder ---------- */
  /* Was die Kinder im music-trainer unter „Meine Note“ sehen, legt die Lehrkraft fest:
     beim Übertragen in die Klassenliste oder mit dem Knopf hier. Ein bloßes Umschalten der
     Kategorien – etwa fürs Scoreboard – ändert es nicht. */
  meineNoteHinweis(cls) {
    const mt = cls.musiktrainer;
    const klasse = this.ergebnis?.daten?.klasse;
    if (!klasse || !('benotung' in klasse))
      return '<p class="hint mt-meine-note">Damit die Kinder ihre Note im music-trainer unter „Meine Note“ sehen, einmal den neuen Worker einfügen (music-trainer/ANLEITUNG.md).</p>';
    const jetzt = this.spalten(mt).map(a => a.schluessel).sort();
    const gleich = JSON.stringify([...(mt.benotung || [])].sort()) === JSON.stringify(jetzt);
    const n = (mt.benotung || []).length;
    return `<p class="hint mt-meine-note">${n
      ? `„Meine Note“ der Kinder: <strong>${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'}</strong>${mt.benotungSeit ? `, festgelegt am ${new Date(mt.benotungSeit + 'T12:00').toLocaleDateString('de-DE')}` : ''}${gleich ? ' – genau die Auswahl oben.' : ' – nicht die Auswahl oben.'}`
      : '„Meine Note“ sehen die Kinder, sobald du eine Auswahl festlegst.'}
      ${gleich ? '' : `<button class="small" data-mt="meine" title="Die Kinder sehen dann unter „Meine Note“ genau diese Spiele und Stufen">Auswahl oben für „Meine Note“ übernehmen</button>`}</p>`;
  },

  meineNoteSetzen(cls) {
    const mt = cls.musiktrainer;
    mt.benotung = this.spalten(mt).map(a => a.schluessel);
    mt.benotungSeit = new Date().toISOString().slice(0, 10);
    Classes.persist();
    this.laden();
  },

  /* Die Auswahl liegt auch beim Worker: Daraus zeigt der music-trainer jedem angemeldeten
     Kind „Meine Note“ – nur seine eigene. Maßgeblich ist die Auswahl hier; weicht der
     Server ab, geht sie hin. */
  async benotungSenden(cls) {
    const mt = cls?.musiktrainer;
    const klasse = mt && this.ergebnis?.klasseId === mt.id && this.ergebnis.daten.klasse;
    if (!klasse || !('benotung' in klasse)) return;      // älterer Worker kennt das noch nicht
    const soll = { liste: [...(mt.benotung || [])].sort(), fehltAls6: !!mt.fehltAls6 };
    const ist = klasse.benotung ? { liste: [...klasse.benotung.liste].sort(), fehltAls6: !!klasse.benotung.fehltAls6 } : { liste: [], fehltAls6: false };
    if (JSON.stringify(ist) === JSON.stringify(soll)) return;
    if (this.benotungSendet) { this.benotungNochmal = true; return; }
    this.benotungSendet = true;
    try {
      const r = await this.api(`/api/lehrer/klassen/${mt.id}`, { methode: 'PATCH', body: { benotung: soll } });
      klasse.benotung = r.benotung;
    } catch (err) {
      console.warn('music-trainer: Auswahl für die Note nicht gespeichert –', err.message);
    } finally {
      this.benotungSendet = false;
      if (this.benotungNochmal) { this.benotungNochmal = false; this.benotungSenden(this.klasse()); }
    }
  },

  /* Noten der rechten Spalte als Spalte unter „Projekte & Noten“ (die Klassenliste mit
     Noten). Gibt es die Spalte vom letzten Mal noch und ist sie nicht schon als
     „eingetragen“ abgehakt, wird sie aktualisiert – sonst kommt eine neue dazu.
     Was dabei zählt, sehen die Kinder ab dann unter „Meine Note“. */
  uebertragen(cls) {
    if (!this.ergebnis) return;
    const mt = cls.musiktrainer;
    const { auswahl, zeilen } = this.notenZeilen(cls);
    if (!auswahl.length) return alert('Erst oben Bereich, Spiel und Stufe wählen.');
    const mit = zeilen.filter(z => z.schnitt !== null);
    if (!mit.length) return alert('Noch hat niemand etwas davon gespielt.');
    const tage = Number(this.filter.zeitraum);
    const name = `music-trainer: ${this.kategorienText(mt)}${tage ? ` (letzte ${tage} Tage)` : ''}`;
    let p = cls.projects.find(x => x.id === mt.projektId && !x.entered);
    const ohne = zeilen.length - mit.length;
    if (!confirm(`Noten in die Klassenliste übertragen?\n\n„${name}“\n` +
      `${mit.length} Kinder bekommen ihre Note aus ${auswahl.length} ${auswahl.length === 1 ? 'Aufgabe' : 'Aufgaben'}` +
      (ohne ? `, ${ohne} ${ohne === 1 ? 'Kind hat' : 'Kinder haben'} nichts davon gespielt und ${ohne === 1 ? 'bleibt' : 'bleiben'} leer` : '') + '.\n' +
      (p ? `Die Spalte vom ${new Date(p.date + 'T12:00').toLocaleDateString('de-DE')} wird aktualisiert.\n` : 'Unter „Projekte & Noten“ kommt eine neue Spalte dazu.\n') +
      `\nDie Kinder sehen diese Aufgaben ab jetzt unter „Meine Note“.`)) return;
    const heute = new Date().toISOString().slice(0, 10);
    if (p) { p.name = name; p.date = heute; p.grades = {}; }
    else p = Classes.createProject(name, heute, null);
    mit.forEach(z => { p.grades[z.s.id] = this.komma(z.schnitt); });
    mt.projektId = p.id;
    mt.benotung = auswahl.map(a => a.schluessel);
    mt.benotungSeit = heute;
    Classes.currentProjectId = p.id;
    Classes.persist();
    Classes.renderProjects();
    this.benotungSenden(cls);
    document.querySelector('.subtab-btn[data-subtab="projekte"]').click();
  },

  async kopieren(cls) {
    if (!this.ergebnis) return;
    const { zeilen } = this.notenZeilen(cls);
    const text = zeilen.map(z => `${z.name}\t${this.komma(z.schnitt)}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert(`${zeilen.length} Zeilen kopiert (Name und Note).`);
    } catch {
      prompt('Kopieren ging nicht automatisch – hier markieren und kopieren:', text);
    }
  },

  /* ---------- Scoreboard: die Tabelle als Rangliste im Vollbild ---------- */
  scoreboardZeigen(cls) {
    if (!this.ergebnis || !cls?.musiktrainer) return;
    const mt = cls.musiktrainer;
    const { auswahl, zeilen } = this.notenZeilen(cls);
    if (!auswahl.length) return alert('Erst oben Bereich, Spiel und Stufe wählen.');
    this.qrSeite = null;
    const b = this.beamerEbene();
    const modus = this.modus();
    // Gewertet wird, was angezeigt ist (eine Nachkommastelle) – gleiche Zahl, gleicher Platz
    const reihen = zeilen.map(z => {
      const gesamt = this.gesamt(z, auswahl, mt);
      return { ...z, gesamt, wert: gesamt.zahl === null ? null : Math.round(gesamt.zahl * 10) };
    });
    // Beste zuerst; wer nichts gespielt hat, steht ohne Platz am Ende
    reihen.sort((a, c) => (a.wert === null) - (c.wert === null)
      || (modus === 'note' ? a.wert - c.wert : c.wert - a.wert)
      || a.name.localeCompare(c.name, 'de'));
    let platz = 0, vorher;
    reihen.forEach((z, i) => {
      if (z.wert === null) { z.platz = ''; return; }
      if (z.wert !== vorher) platz = i + 1;
      vorher = z.wert;
      z.platz = `${platz}.`;
    });
    const vornamen = localStorage.getItem('schooltool-mt-scoreboard-namen') !== 'benutzer';
    const doppelt = s => zeilen.filter(z => z.s.first === s.first).length > 1;
    const name = s => (vornamen ? (doppelt(s) && s.last ? `${s.first} ${s.last[0]}.` : s.first) : s.mt.name);
    const { oben, unten } = this.kopf(auswahl);
    b.innerHTML = `
      <div class="mt-beamer-kopf">
        <div>
          <h2>${this.esc(cls.name)} · ${this.esc(this.kategorienText(mt, true))}</h2>
          <p>${{ note: 'Note', sterne: 'Sterne', prozent: 'Prozent richtig', richtige: 'Richtige der besten Runde', punkte: 'Punkte-Rekord' }[modus]} je Aufgabe${['punkte', 'richtige'].includes(modus) ? '' : ' – Schnitt deiner 3 besten Runden'}. Üben lohnt sich!</p>
        </div>
        <button class="mt-beamer-zu" title="Schließen (Esc)">${Icons.raw('x')}</button>
      </div>
      <div class="mt-tabelle-rahmen">
      <table class="mt-tabelle mt-notentabelle mt-scoreboard">
        <thead>
          <tr><th rowspan="2">Platz</th><th rowspan="2">Name</th>${oben}
            <th rowspan="2" class="mt-gesamtkopf">${{ note: 'Note', sterne: 'Sterne', prozent: 'Ø %', richtige: 'Richtige', punkte: 'Punkte' }[modus]}</th></tr>
          <tr>${unten}</tr>
        </thead>
        <tbody>
          ${reihen.map(z => `<tr>
            <td class="mt-platz">${z.platz}</td><td class="mt-sb-name">${this.esc(name(z.s))}</td>
            ${z.bestwerte.map((v, i) => `<td>${this.zelle(v, auswahl[i].spiel, auswahl[i].stufe, 'punkt')}</td>`).join('')}
            <td>${z.gesamt.html}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
      <div class="mt-beamer-fuss">
        <label>Anzeige <select class="mt-sb-anzeige">
          ${[['note', 'Noten'], ['sterne', 'Sterne'], ['prozent', 'Prozent richtig'], ['richtige', 'Richtige'], ['punkte', 'Punkte']]
            .map(([v, t]) => `<option value="${v}" ${modus === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
        <label><input type="checkbox" class="mt-sb-namen" ${vornamen ? 'checked' : ''}> Vornamen (sonst Benutzernamen)</label>
      </div>`;
    // So groß wie möglich, aber alle Kinder ohne Scrollen auf dem Beamer
    const tabelle = b.querySelector('.mt-scoreboard');
    const rahmen = tabelle.parentElement;
    const platzDa = () => window.innerHeight - tabelle.getBoundingClientRect().top - b.querySelector('.mt-beamer-fuss').offsetHeight - 40;
    let groesse = 34;
    tabelle.style.fontSize = `${groesse}px`;
    while (groesse > 12 && (tabelle.offsetHeight > platzDa() || rahmen.scrollWidth > rahmen.clientWidth)) {
      tabelle.style.fontSize = `${--groesse}px`;
    }
  },

  /* ---------- Beamer und Druck ---------- */
  anmeldeLink(benutzer, passwort) {
    return `${this.SPIEL_URL}#/anmelden?u=${encodeURIComponent(benutzer)}&p=${encodeURIComponent(passwort)}`;
  },

  /* Vollbild-Ebene für den Beamer; Esc schließt, Pfeiltasten blättern */
  beamerEbene() {
    let b = document.getElementById('mt-beamer');
    if (!b) {
      b = document.createElement('div');
      b.id = 'mt-beamer';
      b.className = 'mt-beamer';
      document.body.appendChild(b);
      document.addEventListener('keydown', e => {
        if (b.hidden) return;
        if (e.key === 'Escape') b.hidden = true;
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); this.qrBlaettern(1); }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.qrBlaettern(-1); }
      });
      b.addEventListener('click', e => {
        if (e.target.closest('.mt-beamer-zu')) b.hidden = true;
        else if (e.target.closest('[data-blaettern]')) this.qrBlaettern(+e.target.closest('[data-blaettern]').dataset.blaettern);
      });
      b.addEventListener('change', e => {
        if (e.target.matches('.mt-sb-anzeige')) {
          this.score = e.target.value !== 'note';
          if (this.score) this.scoreArt = e.target.value;
          localStorage.setItem('schooltool-mt-score', this.score ? 'an' : 'aus');
          localStorage.setItem('schooltool-mt-score-art', this.scoreArt);
          this.render();
          return this.scoreboardZeigen(this.klasse());
        }
        if (e.target.matches('.mt-sb-namen')) {
          localStorage.setItem('schooltool-mt-scoreboard-namen', e.target.checked ? 'vornamen' : 'benutzer');
          return this.scoreboardZeigen(this.klasse());
        }
        if (e.target.matches('.mt-spiegel-an')) {
          localStorage.setItem('schooltool-mt-spiegel', e.target.checked ? 'an' : 'aus');
          return this.klasseZeigen(this.klasse());
        }
        if (!e.target.matches('.mt-pro-seite')) return;
        localStorage.setItem('schooltool-mt-pro-seite', e.target.value);
        this.qrSeite.proSeite = +e.target.value;
        this.qrSeite.seite = 0;
        this.qrZeichnen();
      });
    }
    b.hidden = false;
    return b;
  },

  /* QR-Codes seitenweise: wenige große Codes je Seite, damit die Kamera
     von hinten den eigenen Code sicher erkennt und nicht den Nachbarcode. */
  qrZeigen(titel, passwort, kinder) {
    const gemerkt = Number(localStorage.getItem('schooltool-mt-pro-seite')) || 4;
    this.qrSeite = { titel, passwort, kinder, seite: 0, proSeite: gemerkt };
    this.qrZeichnen();
  },

  qrBlaettern(r) {
    const q = this.qrSeite;
    if (!q || document.getElementById('mt-beamer')?.querySelector('.mt-namensliste')) return;
    const seiten = Math.ceil(q.kinder.length / q.proSeite);
    const neu = Math.max(0, Math.min(seiten - 1, q.seite + r));
    if (neu === q.seite) return;
    q.seite = neu;
    this.qrZeichnen();
  },

  qrZeichnen() {
    const b = this.beamerEbene();
    const { titel, passwort, kinder, seite, proSeite } = this.qrSeite;
    const seiten = Math.max(1, Math.ceil(kinder.length / proSeite));
    const teil = kinder.slice(seite * proSeite, (seite + 1) * proSeite);
    b.innerHTML = `
      <div class="mt-beamer-kopf">
        <div>
          <h2>${this.esc(titel)}: Anmelden im music-trainer</h2>
          <p>iPad-Kamera öffnen, <b>deinen</b> Code scannen, Link antippen – fertig.</p>
        </div>
        <div class="mt-beamer-pw"><span>Passwort</span><code>${this.esc(passwort)}</code></div>
        <button class="mt-beamer-zu" title="Schließen (Esc)">${Icons.raw('x')}</button>
      </div>
      <div class="mt-qr-raster" style="--spalten:${Math.min(teil.length, Math.ceil(Math.sqrt(proSeite)))}">
        ${teil.map((k, i) => `
          <div class="mt-qr-karte">
            <span class="mt-qr-bild" id="mt-qr-${i}"></span>
            <span class="mt-qr-name">${this.esc(k.vorname || k.name)}</span>
            <span class="mt-qr-benutzer">${this.esc(k.benutzer)}</span>
          </div>`).join('')}
      </div>
      <div class="mt-beamer-fuss">
        <button data-blaettern="-1" ${seite ? '' : 'disabled'} title="Zurück (Pfeil links)">${Icons.raw('chevronUp', 'mt-links')}</button>
        <span>Seite ${seite + 1} von ${seiten}</span>
        <button data-blaettern="1" ${seite < seiten - 1 ? '' : 'disabled'} title="Weiter (Pfeil rechts oder Leertaste)">${Icons.raw('chevronUp', 'mt-rechts')}</button>
        <label>Codes je Seite <select class="mt-pro-seite">
          ${[1, 2, 4, 6, 9].map(n => `<option ${n === proSeite ? 'selected' : ''}>${n}</option>`).join('')}
        </select></label>
      </div>`;
    // So groß wie möglich: Platz je Code aus Fenstergröße, Spalten und Zeilen
    const spalten = Math.min(teil.length, Math.ceil(Math.sqrt(proSeite)));
    const zeilen = Math.ceil(teil.length / spalten);
    const breit = (window.innerWidth - 80) / spalten - 60;
    const hoch = (window.innerHeight - 260) / zeilen - 90;
    b.style.setProperty('--qr', Math.max(120, Math.min(breit, hoch, 520)) + 'px');
    teil.forEach((k, i) => new QRCode(document.getElementById(`mt-qr-${i}`), {
      text: this.anmeldeLink(k.benutzer, passwort), width: 520, height: 520, correctLevel: QRCode.CorrectLevel.M,
    }));
  },

  /* Für die Klasse: Notenschlüssel, welche Aufgaben zählen und der Notenspiegel –
     ohne Namen, damit niemand die Noten der anderen sieht. Die eigene Note
     sieht jedes Kind im music-trainer unter „Meine Note“. */
  klasseZeigen(cls) {
    if (!this.ergebnis) return;
    const { auswahl, zeilen } = this.notenZeilen(cls);
    if (!auswahl.length) return alert('Erst oben Bereich, Spiel und Stufe wählen.');
    this.qrSeite = null;
    const b = this.beamerEbene();
    const spiele = [];
    auswahl.forEach(a => {
      const g = spiele[spiele.length - 1];
      if (g?.spiel === a.spiel) g.stufen.push(a.stufe);
      else spiele.push({ spiel: a.spiel, stufen: [a.stufe] });
    });
    const spiegel = [1, 2, 3, 4, 5, 6].map(n => zeilen.filter(z => z.schnitt !== null && Math.round(z.schnitt) === n).length);
    const ohne = zeilen.filter(z => z.schnitt === null).length;
    const hoechst = Math.max(1, ...spiegel, ohne);
    const spiegelAn = localStorage.getItem('schooltool-mt-spiegel') !== 'aus';
    const blitz = auswahl.some(a => a.spiel.id.endsWith('-blitz'));
    b.innerHTML = `
      <div class="mt-beamer-kopf">
        <div>
          <h2>${this.esc(cls.name)}: So entsteht deine music-trainer-Note</h2>
          <p>Je Aufgabe zählt der <b>Schnitt deiner 3 besten Runden</b> – du kannst so oft üben, wie du willst.</p>
        </div>
        <button class="mt-beamer-zu" title="Schließen (Esc)">${Icons.raw('x')}</button>
      </div>
      <div class="mt-klasse">
        <section class="mt-klasse-block">
          <h3>Sterne → Note</h3>
          <div class="mt-schluessel">
            ${[6, 5, 4, 3, 2, 1].map(st => `<div><span class="mt-sterne">${'★'.repeat(st)}<span>${'★'.repeat(6 - st)}</span></span>
              <span class="mt-kreis gross n${7 - st}">${7 - st}</span></div>`).join('')}
          </div>
          <p>Eine Runde hat 10 Aufgaben: <b>10</b> richtig = 6 Sterne, <b>9</b> = 5, <b>7–8</b> = 4, <b>5–6</b> = 3, <b>3–4</b> = 2, darunter 1 Stern.
            ${blitz ? 'Beim Blitzlesen zählt, wie viele Noten du in 60 Sekunden schaffst.' : ''}</p>
        </section>
        <section class="mt-klasse-block">
          <h3>${auswahl.length === 1 ? 'Diese Aufgabe zählt' : `Diese ${auswahl.length} Aufgaben zählen`}</h3>
          <ul class="mt-zaehlt">${spiele.map(g => `<li><b>${this.esc(g.spiel.bereich)}: ${this.esc(g.spiel.titel)}</b>
            <span>${g.stufen.map(i => this.esc(g.spiel.stufen[i])).join(' · ')}</span></li>`).join('')}</ul>
          <p>Deine Note ist der Durchschnitt dieser Aufgaben. ${cls.musiktrainer.fehltAls6 ? 'Was du nicht gespielt hast, zählt als <b>6</b>.' : 'Was du noch nicht gespielt hast, zählt nicht mit.'}</p>
          <p>Deine eigene Note siehst du im music-trainer nach dem Anmelden unter <b>Meine Note</b>.</p>
        </section>
        ${spiegelAn ? `<section class="mt-klasse-block mt-spiegel-block">
          <h3>Notenspiegel der Klasse</h3>
          <div class="mt-spiegel">
            ${spiegel.map((n, i) => `<div><b>${n}</b><span class="mt-balken n${i + 1}" style="--hoehe:${n / hoechst}"></span><span class="mt-kreis n${i + 1}">${i + 1}</span></div>`).join('')}
            <div><b>${ohne}</b><span class="mt-balken offen" style="--hoehe:${ohne / hoechst}"></span><span class="mt-kreis offen">offen</span></div>
          </div>
        </section>` : ''}
      </div>
      <div class="mt-beamer-fuss">
        <label><input type="checkbox" class="mt-spiegel-an" ${spiegelAn ? 'checked' : ''}> Notenspiegel zeigen</label>
      </div>`;
  },

  /* Alle Namen mit Benutzernamen zum Abschreiben; das Passwort einmal groß */
  namenslisteZeigen(titel, passwort, kinder) {
    this.qrSeite = null;
    const b = this.beamerEbene();
    const sortiert = [...kinder].sort((a, c) => a.name.localeCompare(c.name, 'de'));
    b.innerHTML = `
      <div class="mt-beamer-kopf">
        <div>
          <h2>${this.esc(titel)}: deine Anmeldung</h2>
          <p>Schreib dir Adresse, Benutzername und Passwort auf – dann kannst du auch zu Hause spielen.</p>
        </div>
        <button class="mt-beamer-zu" title="Schließen (Esc)">${Icons.raw('x')}</button>
      </div>
      <div class="mt-zugangsblock" title="Der QR-Code führt nur zur Anmeldeseite – Benutzername und Passwort tippt jedes Kind selbst">
        <div class="mt-allgemein-qr" id="mt-allgemein-qr"></div>
        <div class="mt-adresse">${this.esc(this.KURZ_URL)}</div>
        <div class="mt-allgemein-qr mt-qr-platz" aria-hidden="true"></div>
      </div>
      <div class="mt-namensliste${sortiert.length > 24 ? ' drei' : ''}" style="--zeilen:${Math.ceil(sortiert.length / (sortiert.length > 24 ? 3 : sortiert.length > 16 ? 2 : 1))}">
        ${sortiert.map(k => `<div class="mt-namenszeile"><span>${this.esc(k.name)}</span><code>${this.esc(k.benutzer)}</code></div>`).join('')}
      </div>
      <div class="mt-passwort-gross"><span>Passwort für alle</span><code>${this.esc(passwort)}</code></div>      </div>`;
    this.allgemeinQr(document.getElementById("mt-allgemein-qr"), 460);
  },

  /* Allgemeiner Link: nur zur Anmeldeseite, ohne Benutzername und Passwort */
  allgemeinLink() { return this.SPIEL_URL + '#/anmelden'; },
  allgemeinQr(feld, groesse) {
    if (!feld || typeof QRCode === 'undefined') return;
    new QRCode(feld, { text: this.allgemeinLink(), width: groesse, height: groesse, correctLevel: QRCode.CorrectLevel.M });
  },

  /* Eine Seite zum Aushängen oder Austeilen: Adresse mit QR-Code, Passwort einmal,
     darunter alle Namen mit Benutzernamen – jedes Kind tippt seine Daten selbst ein */
  listeDrucken(titel, passwort, kinder) {
    let d = document.getElementById('mt-druck');
    if (!d) { d = document.createElement('div'); d.id = 'mt-druck'; document.body.appendChild(d); }
    const sortiert = [...kinder].sort((a, c) => a.name.localeCompare(c.name, 'de'));
    const adresse = this.KURZ_URL;
    d.innerHTML = `<div class="mt-liste">
      <div class="mt-liste-kopf">
        <div>
          <h1>music-trainer · ${this.esc(titel)}</h1>
          <div class="mt-liste-zeile"><span>Adresse</span><b>${this.esc(adresse)}</b></div>
          <div class="mt-liste-zeile"><span>Passwort für alle</span><b>${this.esc(passwort)}</b></div>
          <p>Seite öffnen (oder QR-Code scannen), „Anmelden“ tippen, deinen Benutzernamen und das Passwort eingeben. Schreib dir alles auf – dann kannst du auch zu Hause spielen.</p>
        </div>
        <div class="mt-liste-qr"><div id="mt-liste-qr"></div><span>${this.esc(adresse)}</span></div>
      </div>
      <table class="mt-liste-tabelle">
        <thead><tr><th>Name</th><th>Benutzername</th></tr></thead>
        <tbody>${sortiert.map(k => `<tr><td>${this.esc(k.name)}</td><td>${this.esc(k.benutzer)}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
    this.allgemeinQr(document.getElementById('mt-liste-qr'), 300);
    document.body.classList.add('mt-drucken');
    window.addEventListener('afterprint', () => document.body.classList.remove('mt-drucken'), { once: true });
    setTimeout(() => window.print(), 300);
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
          <div class="mt-karte-zeile adresse"><span>Adresse</span><b>${this.esc(this.KURZ_URL)}</b></div>
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
    // je Stufe die Note der besten Runde (null = noch nicht gespielt)
    const zelle = (k, sp) => {
      let runden = 0;
      const noten = [], info = [];
      sp.spiele.forEach(spiel => this.reihe(spiel).forEach(i => {
        const n = spiel.stufen[i];
        const v = k.fortschritt[spiel.id]?.[i];
        const note = v?.sterne ? 7 - v.sterne : null;
        noten.push({ note, stufe: n });
        if (!v) return;
        runden += v.runden;
        info.push(`${spiel.titel} – ${n}: Note ${note ?? 6} (${v.runden}× gespielt)`);
      }));
      const gespielt = noten.map(n => n.note).filter(n => n !== null);
      const schnitt = gespielt.length ? gespielt.reduce((a, n) => a + n, 0) / gespielt.length : null;
      return { noten, gespielt, schnitt, runden, info: info.join('\n') || 'noch nicht gespielt' };
    };
    const note = (n, kreis) => n === null ? '<span class="hint">–</span>'
      : kreis ? `<span class="mt-kreis klein n${n}">${n}</span>` : this.gesamtNote(n);
    // Ein Bereich gewählt: Noten aller Stufen nebeneinander; sonst der Schnitt des Bereichs
    const inhalt = c => bereich
      ? `<span class="mt-stufennoten">${c.noten.map(n => `<span title="${this.esc(n.stufe)}">${note(n.note, true)}</span>`).join('')}</span>`
      : note(c.schnitt) + (c.gespielt.length ? ` <span class="hint">(${c.gespielt.length} ${c.gespielt.length === 1 ? 'Stufe' : 'Stufen'})</span>` : '');
    ziel.innerHTML = `
      <div class="inline-form mt-filter">
        <label>Bereich <select data-eigen-bereich="${g.id}"><option value="">Alle Bereiche</option>
          ${bereiche.map(b => `<option ${b === bereich ? 'selected' : ''}>${b}</option>`).join('')}
        </select></label>
      </div>
      <div class="mt-tabelle-rahmen">
      <table class="mt-tabelle">
        <thead><tr><th>Zugang</th>${spalten.map(sp => `<th>${this.esc(sp.titel)}</th>`).join('')}<th>Schnitt</th><th>Runden</th><th>Zuletzt</th></tr></thead>
        <tbody>
          ${daten.schueler.map(k => {
            const zellen = spalten.map(sp => zelle(k, sp));
            const alle = zellen.flatMap(c => c.gespielt);
            return `<tr><td>${this.esc(k.benutzername)}</td>
              ${zellen.map(c => `<td class="mt-noten-zelle" title="${this.esc(c.info)}">${inhalt(c)}</td>`).join('')}
              <td class="mt-summe">${note(alle.length ? alle.reduce((a, n) => a + n, 0) / alle.length : null)}</td>
              <td>${zellen.reduce((a, c) => a + c.runden, 0)}</td>
              <td class="hint">${this.zuletzt(k.zuletzt)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      <p class="hint">Note der besten Runde je Stufe (6 Sterne = Note 1). ${bereich
        ? 'Je Spiel stehen die Stufen von leicht nach schwer nebeneinander; – = noch nicht gespielt.'
        : 'Je Bereich der Schnitt der gespielten Stufen. Wähle einen Bereich für die Noten je Stufe.'}
        Fahre über ein Feld für Einzelheiten.</p>`;
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
