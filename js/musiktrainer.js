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
    // Rhythmus Prüfung (music-trainer js/pruefung.js): gemeldet werden nur Durchgänge bei „Sterne sammeln“,
    // die Prüfung selbst speichert nichts. Stufe 0–4 = Klasse 5 Note 5–1, 5–9 = Klasse 6 Note 5–1
    { id: 'rhythmus-pruefung', bereich: 'Rhythmus', titel: 'Rhythmus Prüfung',
      stufen: [5, 6].flatMap(k => [5, 4, 3, 2, 1].map(n => `Klasse ${k} · Note ${n}`)) },
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
  filter: { zeitraum: '0', sortierung: 'name', umgekehrt: false },
  detail: null,            // Einzelansicht: { ids (Reihenfolge der Tabelle), i }
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
    // Unten in „Meine Klassen“: öffnet die eigenen Zugänge rechts anstelle einer Klasse
    document.getElementById('btn-mt-eigene')?.addEventListener('click', () => this.eigeneZeigen());
  },

  eigeneZeigen() {
    Classes.selectClass(null);
    Classes.mtEigeneOffen = true;
    Classes.renderDetail();
    this.renderEigene();
    const ansicht = document.getElementById('mt-eigene-ansicht');
    if (ansicht && window.innerWidth <= 800) ansicht.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },

  esc(s) { return Band.esc(s).replace(/"/g, '&quot;'); },
  klasse() { return Classes.currentClass(); },
  name(s) { return `${s.first || ''} ${s.last || ''}`.trim(); },
  /* Für Tabelle und Einzelansicht: „Nachname, Vorname“, sortiert nach Nachnamen */
  nachname(s) { return s.first ? `${s.last || ''}, ${s.first}`.replace(/^, /, '') : (s.last || ''); },
  nachNachname(a, b) {
    return (a.last || '').localeCompare(b.last || '', 'de', { sensitivity: 'base' })
      || (a.first || '').localeCompare(b.first || '', 'de', { sensitivity: 'base' });
  },

  /* Kleines Gesicht aus dem Sitzplan (liegt nur lokal in IndexedDB, kein Firebase);
     ohne Foto die Initialen. Eingesetzt wird es nach dem Zeichnen von gesichterEinsetzen(). */
  gesichtHtml(s, extra = '') {
    const ini = ((s.first || '')[0] || '') + ((s.last || '')[0] || '');
    return `<span class="mini-gesicht ohne${extra}" data-mt-gesicht="${this.esc(s.id)}" data-initialen="${this.esc(ini)}"></span>`;
  },
  gesichterEinsetzen(cls, ziel, kante = 96) {
    if (typeof Schueler === 'undefined' || typeof Sitzplan === 'undefined') return;
    ziel.querySelectorAll('[data-mt-gesicht]').forEach(el => {
      const s = cls.students.find(x => String(x.id) === el.dataset.mtGesicht);
      const quelle = s && Schueler.fotoQuelle({ cls, s });
      if (quelle) Schueler.gesichtEinsetzen(el, quelle.cls, quelle.s, kante);
    });
  },

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
      <div class="inline-form mt-notiz">
        <input type="text" placeholder="Notiz – Kürzel tippen, Enter kopiert" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        <span class="hint mt-notiz-info"></span>
      </div>
      <p class="hint">Das Lehrer-Passwort aus dem Cloudflare-Worker (LEHRER_PASSWORT). Die Anmeldung gilt 12 Stunden auf diesem Gerät.</p>`;
    Icons.hydrate(ziel);
    const form = ziel.querySelector('form');
    form.querySelector('input').focus();
    /* Notizfeld: Textersetzung klappt nicht in Passwortfeldern, hier schon.
       Enter kopiert den Text, setzt ihn ins Passwortfeld und leert die Notiz
       (nichts wird gespeichert). */
    const notiz = ziel.querySelector('.mt-notiz input'), info = ziel.querySelector('.mt-notiz-info');
    notiz.addEventListener('keydown', async e => {
      if (e.key !== 'Enter' || !notiz.value) return;
      e.preventDefault();
      const text = notiz.value;
      let kopiert = false;
      try { await navigator.clipboard.writeText(text); kopiert = true; }
      catch { notiz.select(); kopiert = document.execCommand && document.execCommand('copy'); }
      const pw = form.querySelector('input');
      pw.value = text;
      notiz.value = '';
      pw.focus();
      info.textContent = (kopiert ? 'Kopiert und ' : '') + 'ins Passwortfeld gesetzt – Enter meldet an.';
    });
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
        <div class="btn-row mt-ohne-login">
          <button data-mt="nurqr" data-icon="expand" title="Großer QR-Code zum music-trainer am Beamer – die Kinder spielen ohne Anmeldung">Nur QR-Code am Beamer (ohne Anmeldung)</button>
        </div>
        <div id="mt-login"></div>`;
      Icons.hydrate(this.el);
      return;
    }
    this.el.innerHTML = `
      <div class="projekt-header">
        <h3 data-icon="music">music-trainer</h3>
        <div class="btn-row">
          <button class="primary" data-mt="namen" data-icon="list">Namensliste am Beamer</button>
          <button data-mt="qr" data-icon="expand" title="Ein QR-Code je Kind – als Notlösung, wenn das Eintippen nicht klappt">QR-Anmeldung am Beamer</button>
          <button data-mt="nurqr" data-icon="expand" title="Großer QR-Code zum music-trainer – zum Spielen ohne Anmeldung">Nur QR-Code</button>
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
          ${[['name', 'Nachname'], ['ergebnis', this.score ? 'Score' : 'Note'], ['runden', 'Runden'], ['tage', 'Übungstage'], ['zeit', 'Übungszeit'], ['zuletzt', 'Zuletzt aktiv']]
            .map(([v, t]) => `<option value="${v}" ${this.filter.sortierung === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
        <label class="mt-haken"><input type="checkbox" data-mt-option="fehltAls6" ${mt.fehltAls6 ? 'checked' : ''}> Nicht gespielt zählt als 6</label>
      </div>
      <div class="btn-row mt-knoepfe">
        <button class="small" data-mt="scoreboard" data-icon="expand" title="Die Tabelle als Rangliste im Vollbild – zum Zeigen am Beamer">Scoreboard</button>
        <button class="small" data-mt="statistik" data-icon="gauge" title="Wie viel, wann und was geübt wird – ohne Namen, auch für den Beamer">Statistik</button>
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
      mt.kategorien.gesehen = MT_SPIELE.map(sp => sp.id);
    }
    // Neue Spiele (z. B. die Rhythmus Prüfung, 11.2026) kommen bei schon eingerichteten Klassen
    // erst abgewählt dazu – sonst änderte sich die Notenspalte (etwa mit „Nicht gespielt zählt als 6“)
    const k = mt.kategorien;
    if (!k.gesehen) k.gesehen = MT_SPIELE.map(sp => sp.id).filter(id => id !== 'rhythmus-pruefung');
    const neu = MT_SPIELE.map(sp => sp.id).filter(id => !k.gesehen.includes(id));
    if (neu.length) {
      k.ohne = [...new Set([...(k.ohne || []), ...neu])];
      k.gesehen = [...k.gesehen, ...neu];
    }
    return k;
  },

  /* Die gewählten Stufen eines Bereichs – oder eines Spiels: Haben die Spiele eines Bereichs
     verschieden benannte Stufen (Rhythmus, Hören), wählt man sie je Spiel, gemerkt unter
     stufenJe['spiel:<id>']. Ohne eigene Wahl gilt die des Bereichs wie bisher – alte Auswahlen
     und alle Ergebnisse (sie hängen an Spiel und Stufennummer) bleiben, wie sie waren. */
  stufenVon(k, bereich, sp) {
    if (sp && k.stufenJe?.['spiel:' + sp.id]) return k.stufenJe['spiel:' + sp.id];
    return k.stufenJe?.[bereich] || k.stufen || [];
  },

  /* Stufen je Spiel wählen? Ja, wenn die Spiele eines Bereichs ihre Stufen verschieden nennen */
  jeSpiel(spiele) {
    const zahl = Math.max(0, ...spiele.map(sp => sp.stufen.length));
    return Array.from({ length: zahl }, (_, i) => new Set(spiele.map(sp => sp.stufen[i]).filter(Boolean)).size > 1).some(Boolean);
  },

  /* Die Spalten: gewählte Bereiche × Spiele × Stufen, in der Reihenfolge der Spielliste und der Stufen */
  spalten(mt) {
    const k = this.kategorien(mt);
    return MT_SPIELE.filter(sp => k.bereiche.includes(sp.bereich) && !k.ohne.includes(sp.id))
      .flatMap(sp => this.reihe(sp).filter(i => this.stufenVon(k, sp.bereich, sp).includes(i))
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
    const chip = (art, wert, an, text, titel = '', bereich = '', spiel = '') => `<label class="mt-chip"${titel ? ` title="${this.esc(titel)}"` : ''}>
      <input type="checkbox" data-kat="${art}" value="${this.esc(wert)}"${bereich ? ` data-bereich="${this.esc(bereich)}"` : ''}${spiel ? ` data-spiel="${this.esc(spiel)}"` : ''} ${an ? 'checked' : ''}>${text}</label>`;
    // Zeilentitel als Knopf: wählt die ganze Zeile an – oder ab, wenn schon alles an ist
    const titel = text => `<button type="button" class="mt-kat-titel" data-mt="kat-alle" title="Ganze Zeile an- oder abwählen">${this.esc(text)}</button>`;
    // Stufen nach Gruppe teilen: „Klasse 5 · 3“ → Gruppe „Klasse 5“, Chip „3“
    const gruppen = liste => {
      const g = new Map();
      for (const st of liste) {
        const m = /^(.*\S)\s*·\s*(.+)$/.exec(st.name);
        const name = m ? m[1] : 'Stufe';
        if (!g.has(name)) g.set(name, []);
        g.get(name).push({ ...st, kurz: m ? m[2] : st.name, titel: st.titel || st.name });
      }
      return [...g];
    };
    const vorher = mt.kategorienVorher;
    return `
      <div class="mt-kategorien">
        <div class="mt-kat-knoepfe">
          <button type="button" class="small" data-mt="kat-alles" data-icon="list" title="Alle Bereiche, Spiele und Stufen – zeigt, wer schon wo war">Alle Spiele zeigen</button>
          ${vorher ? `<button type="button" class="small" data-mt="kat-zurueck" title="Die Auswahl von vor „Alle Spiele zeigen“ wiederherstellen">Vorige Auswahl</button>` : ''}
        </div>
        <div class="mt-kat-zeile">${titel('Bereich')}
          <span class="mt-kat-chips">${bereiche.map(b => chip('bereich', b, k.bereiche.includes(b), this.esc(b))).join('')}</span></div>
        ${spiele.length ? `
        <div class="mt-kat-zeile">${titel('Spiel')}
          <span class="mt-kat-chips">${spiele.map(sp => chip('spiel', sp.id, !k.ohne.includes(sp.id),
            this.esc(sp.titel) + (doppelt(sp) ? ` <span class="hint">${this.esc(sp.bereich)}</span>` : ''), `${sp.bereich}: ${sp.titel}`)).join('')}</span></div>` : ''}
        ${mitStufen.map(b => {
          const imBereich = aktiv.filter(sp => sp.bereich === b);
          // Gleich benannte Stufen: eine Auswahl für alle Spiele des Bereichs (wie bisher)
          const ueber = mitStufen.length > 1 ? `<div class="mt-kat-ueber">${this.esc(b)}</div>` : '';
          // Ob je Spiel gewählt wird, hängt an allen Spielen des Bereichs – so sieht der Bereich
          // gleich aus, egal welche Spiele gerade angewählt sind
          if (!this.jeSpiel(MT_SPIELE.filter(sp => sp.bereich === b))) return ueber + gruppen(this.stufenListe(imBereich)).map(([g, liste]) => `
        <div class="mt-kat-zeile">
          ${titel(g)}
          <span class="mt-kat-chips">${liste.map(s => chip('stufe', s.i, this.stufenVon(k, b).includes(s.i), this.esc(s.kurz), s.titel, b)).join('')}</span></div>`).join('');
          // Verschieden benannt: je Spiel eigene Zeilen, „Klasse 5 · 3“ in Gruppen geteilt
          // Spielname als kleine Überschrift über seinen Zeilen – die Beschriftung links bleibt
          // überall gleich breit, nichts verrutscht beim An- und Abwählen
          return ueber + imBereich.map(sp => `<div class="mt-kat-spiel">${this.esc(sp.titel)}</div>` +
            gruppen(this.reihe(sp).map(i => ({ i, name: sp.stufen[i], titel: '' }))).map(([g, liste]) => `
        <div class="mt-kat-zeile">
          ${titel(g === 'Stufe' ? 'Stufen' : g)}
          <span class="mt-kat-chips">${liste.map(s => chip('stufe', s.i, this.stufenVon(k, b, sp).includes(s.i), this.esc(s.kurz), `${sp.titel}: ${s.titel}`, b, sp.id)).join('')}</span></div>`).join('')).join('');
        }).join('')}
      </div>`;
  },

  /* Kurzbeschreibung der Wahl, z. B. „Stammtöne · Junior 1, Junior 2“ – für Scoreboard und Notenspalte;
     kurz: ohne die Liste abgewählter Spiele (Überschrift am Beamer) */
  kategorienText(mt, kurz) {
    const k = this.kategorien(mt);
    const spalten = this.spalten(mt);
    const teile = [...new Set(spalten.map(s => s.spiel.bereich))].map(b => {
      const spiele = [...new Set(spalten.filter(s => s.spiel.bereich === b).map(s => s.spiel))];
      if (this.jeSpiel(MT_SPIELE.filter(sp => sp.bereich === b)))
        return `${b} · ${spiele.map(sp => `${sp.titel} ${spalten.filter(s => s.spiel === sp).map(s => sp.stufen[s.stufe]).join(', ')}`).join('; ')}`;
      return `${b} · ${this.stufenListe(spiele).filter(s => this.stufenVon(k, b).includes(s.i)).map(s => s.name).join(', ')}`;
    });
    const ohne = MT_SPIELE.filter(sp => k.bereiche.includes(sp.bereich) && k.ohne.includes(sp.id)).map(sp => sp.titel);
    return `${teile.join(' + ') || k.bereiche.join(' + ')}${ohne.length && !kurz ? ` (ohne ${ohne.join(', ')})` : ''}`;
  },

  async klick(e) {
    const kopf = e.target.closest('[data-sort]');
    if (kopf) {
      // Spaltenkopf: nach dieser Spalte sortieren, nochmal geklickt andersherum
      const art = kopf.dataset.sort;
      this.filter.umgekehrt = this.filter.sortierung === art ? !this.filter.umgekehrt : false;
      this.filter.sortierung = art;
      return this.render();
    }
    const zeile = e.target.closest('tr[data-kind]');
    if (zeile && !e.target.closest('button')) return this.detailZeigen(zeile.dataset.kind);
    const b = e.target.closest('[data-mt]');
    if (!b) return;
    const aktion = b.dataset.mt;
    const cls = this.klasse();
    if (aktion === 'kat-alle') {
      // Ganze Zeile: ist schon alles an, alles ab – sonst alles an
      const felder = [...b.closest('.mt-kat-zeile').querySelectorAll('input[data-kat]')];
      const an = !felder.every(f => f.checked);
      const k = this.kategorien(cls.musiktrainer);
      felder.forEach(f => this.katSetzen(k, f, an));
      Classes.persist();
      return this.render();
    }
    if (aktion === 'kat-alles') {
      // Alles anwählen; die bisherige Wahl wird gemerkt und lässt sich zurückholen
      const mt = cls.musiktrainer, k = this.kategorien(mt);
      const bereiche = [...new Set(MT_SPIELE.map(sp => sp.bereich))];
      const alles = {
        bereiche, ohne: [], stufen: k.stufen || [], gesehen: MT_SPIELE.map(sp => sp.id),
        stufenJe: Object.fromEntries(bereiche.map(bb => [bb, [...new Set(MT_SPIELE.filter(sp => sp.bereich === bb).flatMap(sp => this.reihe(sp)))]])),
      };
      if (JSON.stringify(k) !== JSON.stringify(alles)) mt.kategorienVorher = JSON.parse(JSON.stringify(k));
      mt.kategorien = alles;
      Classes.persist();
      return this.render();
    }
    if (aktion === 'kat-zurueck') {
      const mt = cls.musiktrainer;
      if (mt.kategorienVorher) { mt.kategorien = mt.kategorienVorher; delete mt.kategorienVorher; }
      Classes.persist();
      return this.render();
    }
    if (aktion === 'nurqr') return this.nurQrZeigen(cls ? cls.name : '');
    if (aktion === 'einrichten') return this.einrichten(cls);
    if (aktion === 'nachtragen') return this.nachtragen(cls);
    if (aktion === 'laden') { this.ergebnis = null; this.statCache = {}; return this.laden(); }
    if (aktion === 'kopieren') return this.kopieren(cls);
    if (aktion === 'klasse') return this.klasseZeigen(cls);
    if (aktion === 'scoreboard') return this.scoreboardZeigen(cls);
    if (aktion === 'statistik') { this.statOptionen().ansicht = 'klasse'; return this.statistikZeigen(cls); }
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

  /* Ein Häkchen bei Bereich, Spiel oder Stufe übernehmen */
  katSetzen(k, feld, an) {
    const kat = feld.dataset.kat, wert = feld.value;
    if (kat === 'bereich') k.bereiche = an ? [...new Set([...k.bereiche, wert])] : k.bereiche.filter(x => x !== wert);
    if (kat === 'spiel') k.ohne = an ? k.ohne.filter(x => x !== wert) : [...new Set([...k.ohne, wert])];
    if (kat === 'stufe') {
      const b = feld.dataset.bereich;
      const sp = feld.dataset.spiel ? MT_SPIELE.find(x => x.id === feld.dataset.spiel) : null;
      const alt = this.stufenVon(k, b, sp);
      const schluessel = sp ? 'spiel:' + sp.id : b;
      k.stufenJe = { ...k.stufenJe, [schluessel]: an ? [...new Set([...alt, Number(wert)])] : alt.filter(x => x !== Number(wert)) };
    }
  },

  aenderung(e) {
    const cls = this.klasse();
    if (e.target.dataset.kat) {
      // Bereich, Spiel oder Stufe an- oder abwählen; Spiele und Stufen hängen an den Bereichen
      this.katSetzen(this.kategorien(cls.musiktrainer), e.target, e.target.checked);
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
    if (f === 'sortierung') this.filter.umgekehrt = false;
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
    const kind = id => (u[id] ||= { runden: 0, tage: new Set(), sekunden: 0, zuhause: 0, zuhauseRunden: 0 });
    this.ergebnis.daten.verlauf.forEach(v => {
      if (v.zeit < seit) return;
      const k = kind(v.schueler_id);
      k.runden++;
      k.tage.add(tag(v.zeit));
      k.sekunden += v.dauer || 0;
      if (!this.schulzeit(v.zeit)) { k.zuhause += v.dauer || 0; k.zuhauseRunden++; }
    });
    (this.ergebnis.daten.besuche || []).forEach(b => { if (b.tag >= tag(seit)) kind(b.schueler_id).tage.add(b.tag); });
    return u;
  },

  /* Schulzeit: Mo–Fr 7:30–13:30 (Ferien und Feiertage zählen nicht als Schulzeit-Ausnahme) */
  schulzeit(t) {
    const dt = new Date(t * 1000);
    const wt = (dt.getDay() + 6) % 7, m = dt.getHours() * 60 + dt.getMinutes();
    return wt < 5 && m >= 450 && m < 810;
  },

  /* Runden außerhalb der Schulzeit zu Sitzungen bündeln: Liegen zwischen zwei Runden mehr
     als 15 Minuten Pause, beginnt eine neue. zeit ist das Ende der Runde, dauer ihre Länge. */
  sitzungen(runden) {
    const liste = [];
    runden.filter(v => !this.schulzeit(v.zeit)).sort((a, b) => a.zeit - b.zeit).forEach(v => {
      const d = v.dauer || 0, von = v.zeit - d;
      const l = liste[liste.length - 1];
      if (l && von - l.bis <= 15 * 60) { l.bis = Math.max(l.bis, v.zeit); l.sek += d; l.runden++; }
      else liste.push({ von, bis: v.zeit, sek: d, runden: 1 });
    });
    return liste;
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
        k, s, name: this.nachname(s), noten, bestwerte,
        gespielt: noten.filter(n => n !== null).length,
        schnitt: zaehlen.length ? zaehlen.reduce((a, n) => a + n, 0) / zaehlen.length : null,
      };
    });
    zeilen.sort((a, b) => this.nachNachname(a.s, b.s));
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
    // Jede Spalte sortiert zuerst mit dem Besten oben (Name: A–Z); umgekehrt dreht das um.
    // Wer keinen Wert hat, bleibt unten; bei Gleichstand nach Nachnamen.
    const art = this.filter.sortierung;
    const zahl = {
      name: () => 0,
      ergebnis: z => z.gesamt.zahl === null ? null : (modus === 'note' ? -z.gesamt.zahl : z.gesamt.zahl),
      runden: z => z.u?.runden || 0,
      tage: z => z.u?.tage.size || 0,
      zeit: z => z.u?.sekunden || 0,
      zuhause: z => z.u?.zuhause || 0,
      zuletzt: z => z.k.zuletzt || null,
    }[art] || (() => 0);
    const dreh = this.filter.umgekehrt ? -1 : 1;
    reihen.sort((a, b) => {
      const x = zahl(a), y = zahl(b);
      return (x === null) - (y === null) || (x !== null && y !== null ? dreh * (y - x) : 0)
        || (art === 'name' ? dreh : 1) * this.nachNachname(a.s, b.s);
    });
    this.reihenfolge = reihen.map(z => String(z.s.id));
    const pfeil = a => (art === a ? `<span class="mt-sortpfeil">${this.filter.umgekehrt ? '▲' : '▼'}</span>` : '');
    const sortKopf = (a, text, titel = '') => `<th rowspan="2" data-sort="${a}" class="mt-sortierbar${art === a ? ' aktiv' : ''}"
      title="${this.esc(titel ? `${titel} – klicken zum Sortieren` : 'Klicken zum Sortieren')}">${text}${pfeil(a)}</th>`;
    const offen = zeilen.filter(z => z.gespielt < auswahl.length).length;
    const { oben, unten } = this.kopf(auswahl);
    const uebungZellen = (k, u) => `<td>${u?.runden || 0}</td><td>${u?.tage.size || 0}</td><td class="hint">${this.zeit(u?.sekunden)}</td>
      <td class="hint" title="${u?.zuhauseRunden || 0} Runden außerhalb der Schulzeit">${this.zeit(u?.zuhause)}</td>
      <td class="hint">${this.zuletzt(k.zuletzt)}</td>`;
    ziel.innerHTML = `
      ${this.meineNoteHinweis(cls)}
      <p class="hint">${this.score ? 'Score' : 'Note'} je Aufgabe ${tage ? `aus den letzten ${tage} Tagen` : 'insgesamt'}.
        ${mt.fehltAls6 ? 'Nicht Gespieltes zählt als 6.' : 'Nicht Gespieltes zählt nicht mit.'}
        ${offen ? `<strong>${offen}</strong> ${offen === 1 ? 'Kind hat' : 'Kinder haben'} noch offene Aufgaben (gelb).` : ''}</p>
      <div class="mt-tabelle-rahmen">
      <table class="mt-tabelle mt-notentabelle">
        <thead>
          <tr>${sortKopf('name', 'Name')}${oben}
            ${sortKopf('ergebnis', { note: 'Note', sterne: 'Sterne', prozent: 'Ø %', richtige: 'Richtige', punkte: 'Punkte' }[modus]).replace('class="', 'class="mt-gesamtkopf ')}
            ${sortKopf('runden', 'Runden', 'Runden in allen Spielen')}${sortKopf('tage', 'Tage', 'Tage, an denen das Kind angemeldet im music-trainer war')}
            ${sortKopf('zeit', 'Zeit', 'Übungszeit (gemessen seit 01.11.2026)')}${sortKopf('zuhause', 'Zuhause', 'Übungszeit außerhalb der Schulzeit (Mo–Fr 7:30–13:30 zählt als Schule)')}${sortKopf('zuletzt', 'Zuletzt')}</tr>
          <tr>${unten}</tr>
        </thead>
        <tbody>
          ${reihen.map(z => `<tr class="mt-kindzeile${z.gespielt < auswahl.length ? ' mt-ohne' : ''}" data-kind="${this.esc(z.s.id)}" title="Klicken für die Statistik">
            <td class="mt-name-zelle">${this.gesichtHtml(z.s)}<span>${this.esc(z.name)}</span></td>
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
    this.gesichterEinsetzen(cls, ziel);
    // Ist die Einzelansicht offen (etwa nach „Aktualisieren“), zeigt sie die neuen Zahlen
    if (document.getElementById('mt-detail')?.open) this.detailZeichnen();
  },

  /* ---------- Einzelansicht: Statistik eines Kindes, Pfeiltasten blättern ---------- */
  detailZeigen(id) {
    const ids = this.reihenfolge || [];
    const i = ids.indexOf(String(id));
    if (i < 0) return;
    this.detail = { ids, i };
    let dlg = document.getElementById('mt-detail');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'mt-detail';
      dlg.className = 'mt-detail';
      dlg.setAttribute('aria-label', 'Statistik eines Kindes');
      document.body.appendChild(dlg);
      dlg.addEventListener('keydown', e => {
        if (e.target.matches('input, select, textarea')) return;
        const r = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[e.key];
        if (r) { e.preventDefault(); this.detailBlaettern(r); }
      });
      dlg.addEventListener('click', e => {
        if (e.target === dlg || e.target.closest('.mt-detail-zu')) return dlg.close();
        const b = e.target.closest('[data-detail]');
        if (b) this.detailBlaettern(+b.dataset.detail);
      });
    }
    this.detailZeichnen();
    if (!dlg.open) dlg.showModal();
    dlg.focus();
  },

  detailBlaettern(r) {
    const d = this.detail;
    if (!d) return;
    const neu = Math.max(0, Math.min(d.ids.length - 1, d.i + r));
    if (neu === d.i) return;
    d.i = neu;
    this.detailZeichnen();
  },

  detailZeichnen() {
    const dlg = document.getElementById('mt-detail');
    const cls = this.klasse();
    const d = this.detail;
    if (!dlg || !d || !cls?.musiktrainer || !this.ergebnis) return;
    const mt = cls.musiktrainer;
    const { auswahl, zeilen } = this.notenZeilen(cls);
    const z = zeilen.find(x => String(x.s.id) === d.ids[d.i]);
    if (!z) { dlg.close(); return; }
    const tage = Number(this.filter.zeitraum);
    const seit = tage ? Date.now() / 1000 - tage * 86400 : 0;
    const u = this.uebung(tage)[z.k.id];
    const w = this.werte(tage)[z.k.id] || {};
    const gesamt = this.gesamt(z, auswahl, mt);
    const runden = this.ergebnis.daten.verlauf.filter(v => v.schueler_id === z.k.id && v.zeit >= seit).sort((a, b) => b.zeit - a.zeit);
    const spielVon = id => MT_SPIELE.find(sp => sp.id === id);
    const stufeName = (sp, i) => sp?.stufen[i] ?? `Stufe ${Number(i) + 1}`;
    // Eine Zeile je Aufgabe: was zählt (oben gewählt) und was das Kind sonst noch gespielt hat
    const zeile = (sp, stufe, v, zaehlt) => `<tr class="${zaehlt ? '' : 'mt-detail-extra'}">
      <td>${this.esc(sp?.titel || '?')} <span class="hint">${this.esc(stufeName(sp, stufe))}</span></td>
      <td>${sp ? this.zelle(v, sp, stufe, zaehlt ? 'offen' : 'punkt') : ''}</td>
      <td>${v?.beste?.length ? v.beste.map(n => `${n}`).join(' · ') : '<span class="hint">–</span>'}</td>
      <td>${v?.prozent != null ? `${Math.round(v.prozent)}&nbsp;%` : '<span class="hint">–</span>'}</td>
      <td>${v ? v.punkte : '<span class="hint">–</span>'}</td>
      <td>${v?.runden || 0}</td></tr>`;
    const gewaehlt = new Set(auswahl.map(a => a.schluessel));
    const sonst = Object.keys(w).filter(k => !gewaehlt.has(k)).map(k => {
      const [id, st] = k.split('|');
      return { sp: spielVon(id), stufe: Number(st), v: w[k], k };
    }).sort((a, b) => MT_SPIELE.indexOf(a.sp) - MT_SPIELE.indexOf(b.sp)
      || (a.sp ? this.reihe(a.sp).indexOf(a.stufe) - this.reihe(a.sp).indexOf(b.stufe) : 0));
    const datum = t => new Date(t * 1000).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    // Gleicher Platz bei gleicher (angezeigter) Note wie im Scoreboard
    const wert = x => (x.zahl === null ? null : Math.round(x.zahl * 10));
    const alle = zeilen.map(x => wert(this.gesamt(x, auswahl, mt))).filter(x => x !== null);
    const meins = wert(gesamt);
    const platz = meins === null ? null : 1 + alle.filter(x => (this.modus() === 'note' ? x < meins : x > meins)).length;
    dlg.innerHTML = `
      <div class="mt-detail-kopf">
        ${this.gesichtHtml(z.s, ' mt-detail-gesicht')}
        <div class="mt-detail-titel">
          <h2>${this.esc(z.name)}</h2>
          <p class="hint">${this.esc(z.s.mt?.name || '')} · ${this.esc(cls.name)} · ${tage ? `letzte ${tage} Tage` : 'gesamt'}</p>
        </div>
        <div class="mt-detail-gesamt">${gesamt.html}${platz ? `<span class="hint">Platz ${platz} von ${alle.length}</span>` : ''}</div>
        <button class="mt-detail-zu" title="Schließen (Esc)">${Icons.raw('x')}</button>
      </div>
      <div class="mt-detail-zahlen">
        <div><b>${u?.runden || 0}</b><span>Runden</span></div>
        <div><b>${u?.tage.size || 0}</b><span>Tage</span></div>
        <div><b>${this.zeit(u?.sekunden)}</b><span>Zeit</span></div>
        <div title="Außerhalb von Mo–Fr 7:30–13:30"><b>${this.zeit(u?.zuhause)}</b><span>davon zuhause</span></div>
        <div><b>${this.zuletzt(z.k.zuletzt)}</b><span>zuletzt</span></div>
      </div>
      <div class="mt-tabelle-rahmen">
      <table class="mt-tabelle mt-detail-tabelle">
        <thead><tr><th>Aufgabe</th><th>${{ note: 'Note', sterne: 'Sterne', prozent: '%', richtige: 'Richtige', punkte: 'Punkte' }[this.modus()]}</th>
          <th title="Sterne der 3 besten Runden">Beste Runden</th><th title="Richtig im Schnitt der 3 besten Runden">Ø richtig</th><th>Rekord</th><th>Runden</th></tr></thead>
        <tbody>
          ${auswahl.map((a, i) => zeile(a.spiel, a.stufe, z.bestwerte[i], true)).join('')}
          ${sonst.length ? `<tr class="mt-detail-trenner"><td colspan="6">Außerdem gespielt (zählt nicht zur Note)</td></tr>
            ${sonst.map(x => zeile(x.sp, x.stufe, x.v, false)).join('')}` : ''}
        </tbody>
      </table>
      </div>
      ${runden.length ? `<h3 class="mt-detail-h3">Letzte Runden</h3>
      <ul class="mt-detail-runden">${runden.slice(0, 8).map(v => {
        const sp = spielVon(v.spiel);
        return `<li><span class="hint">${datum(v.zeit)}</span> ${this.esc(sp?.titel || v.spiel)} <span class="hint">${this.esc(stufeName(sp, v.stufe))}</span>
          <b>${'★'.repeat(v.sterne)}<span class="mt-detail-leer">${'★'.repeat(Math.max(0, this.STERNE - v.sterne))}</span></b></li>`;
      }).join('')}</ul>` : '<p class="hint">In diesem Zeitraum noch keine Runde gespielt.</p>'}
      ${this.sitzungenHtml(runden)}
      <div class="mt-detail-fuss">
        <button data-detail="-1" ${d.i ? '' : 'disabled'} title="Voriges Kind (Pfeil links)">${Icons.raw('chevronUp', 'mt-links')}</button>
        <span>${d.i + 1} von ${d.ids.length} <span class="hint">· Pfeiltasten blättern</span></span>
        <button data-detail="1" ${d.i < d.ids.length - 1 ? '' : 'disabled'} title="Nächstes Kind (Pfeil rechts)">${Icons.raw('chevronUp', 'mt-rechts')}</button>
      </div>`;
    this.gesichterEinsetzen(cls, dlg, 240);
  },

  /* Liste der Übungszeiten außerhalb der Schulzeit, neueste zuerst */
  sitzungenHtml(runden) {
    const liste = this.sitzungen(runden).reverse();
    if (!liste.length) return '<h3 class="mt-detail-h3">Außerhalb der Schulzeit</h3><p class="hint">Keine Runden außerhalb der Schulzeit in diesem Zeitraum.</p>';
    const uhr = t => new Date(t * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const tag = t => new Date(t * 1000).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const summe = liste.reduce((a, x) => a + x.sek, 0);
    return `<h3 class="mt-detail-h3">Außerhalb der Schulzeit <span class="hint">· ${liste.length} ${liste.length === 1 ? 'Mal' : 'Mal'}, ${this.zeit(summe)}</span></h3>
      <ul class="mt-detail-runden mt-sitzungen">${liste.slice(0, 10).map(x => `<li><span class="hint">${tag(x.von)}</span>
        ${uhr(x.von)}–${uhr(x.bis)} Uhr <b>${x.sek ? this.zeit(x.sek) : '<span class="hint">ohne Zeit</span>'}</b>
        <span class="hint">${x.runden} ${x.runden === 1 ? 'Runde' : 'Runden'}</span></li>`).join('')}</ul>
      ${liste.length > 10 ? `<p class="hint">… und ${liste.length - 10} weitere.</p>` : ''}`;
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
        ${(() => {
          const st = this.statRechnen(this.ergebnis.daten, +this.filter.zeitraum || 0);
          return st.runden ? `<div class="st-chip" title="Summe aller Runden der Klasse${+this.filter.zeitraum ? ` in den letzten ${this.filter.zeitraum} Tagen` : ''} (Minuten seit 01.11.2026)">
            <span>Gemeinsam geübt</span><b>${this.minuten(st.sek)}</b><small>${this.tausend(st.runden)} Runden</small></div>` : '';
        })()}
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
        <span class="mt-sb-anzeige">Anzeige
          ${[['note', 'Noten'], ['sterne', 'Sterne'], ['prozent', 'Prozent richtig'], ['richtige', 'Richtige'], ['punkte', 'Punkte']]
            .map(([v, t]) => `<button type="button" class="small${modus === v ? ' primary' : ''}" data-sb-anzeige="${v}">${t}</button>`).join('')}
        </span>
        <label><input type="checkbox" class="mt-sb-namen" ${vornamen ? 'checked' : ''}> Vornamen (sonst Benutzernamen)</label>
      </div>`;
    // So groß wie möglich, aber alle Kinder ohne Scrollen auf dem Beamer –
    // nach dem Wechsel ins Vollbild (kommt erst kurz nach dem Klick) noch einmal
    const tabelle = b.querySelector('.mt-scoreboard');
    const rahmen = tabelle.parentElement;
    this.beamerAnpassen = () => {
      const platzDa = () => window.innerHeight - tabelle.getBoundingClientRect().top - b.querySelector('.mt-beamer-fuss').offsetHeight - 40;
      let groesse = 34;
      tabelle.style.fontSize = `${groesse}px`;
      while (groesse > 12 && (tabelle.offsetHeight > platzDa() || rahmen.scrollWidth > rahmen.clientWidth)) {
        tabelle.style.fontSize = `${--groesse}px`;
      }
    };
    this.beamerAnpassen();
  },

  /* ---------- Statistik: wie viel, wann und was geübt wird ---------- */
  /* Ohne Namen, damit sie auch am Beamer gezeigt werden kann. Minuten gibt es erst seit
     01.11.2026 (Dauer der Runden), Runden und Anmeldetage für das ganze Jahr. */
  STAT_AB: Date.UTC(2026, 10, 1) / 1000,
  statOpt: null,

  statOptionen() {
    if (!this.statOpt) {
      let o = {};
      try { o = JSON.parse(localStorage.getItem('schooltool-mt-statistik') || '{}'); } catch { /* egal */ }
      this.statOpt = { mass: o.mass || 'min', zeitraum: o.zeitraum || '28', ansicht: 'klasse' };
    }
    return this.statOpt;
  },

  statTag(t) { return Math.floor((t + 3600) / 86400); },   // wie im Worker: grob deutsche Zeit

  /* Zahlen einer Klasse im Zeitraum (tage = 0: alles, was der Server hat) */
  statRechnen(daten, tage) {
    const jetztT = Date.now() / 1000;
    const seit = tage ? jetztT - tage * 86400 : 0;
    const runden = daten.verlauf.filter(v => v.zeit >= seit);
    const kinder = daten.schueler.length;
    const proKind = {};
    const kind = id => (proKind[id] ||= { sek: 0, runden: 0 });
    let sek = 0, schulSek = 0, schulRunden = 0, mitDauer = 0;
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    const heatRunden = Array.from({ length: 7 }, () => Array(24).fill(0));
    const proSpiel = {};
    const proTag = {};
    runden.forEach(v => {
      const d = v.dauer || 0;
      sek += d;
      if (v.dauer != null) mitDauer++;
      const k = kind(v.schueler_id); k.sek += d; k.runden++;
      const dt = new Date(v.zeit * 1000);
      const wt = (dt.getDay() + 6) % 7, h = dt.getHours();
      heat[wt][h] += d; heatRunden[wt][h]++;
      if (this.schulzeit(v.zeit)) { schulSek += d; schulRunden++; }   // Mo–Fr 7:30–13:30
      const sp = (proSpiel[v.spiel] ||= { sek: 0, runden: 0 }); sp.sek += d; sp.runden++;
      const tg = (proTag[this.statTag(v.zeit)] ||= { sek: 0, runden: 0 }); tg.sek += d; tg.runden++;
    });
    const besuche = (daten.besuche || []).filter(b => b.tag >= this.statTag(seit));
    const letzte7 = daten.verlauf.filter(v => v.zeit >= jetztT - 7 * 86400);
    // Außerhalb der Schulzeit: Sitzungen je Kind (ohne Namen)
    const jeKind = {};
    runden.forEach(v => (jeKind[v.schueler_id] ||= []).push(v));
    const sitzungen = Object.values(jeKind).flatMap(r => this.sitzungen(r));
    const zuhauseKinder = Object.values(jeKind).filter(r => r.some(v => !this.schulzeit(v.zeit))).length;
    return {
      sitzungen, zuhauseKinder,
      kinder, runden: runden.length, sek, mitDauer, schulSek, schulRunden,
      aktiv: Object.keys(proKind).length,
      anmeldetage: besuche.length,
      proKind, heat, heatRunden, proSpiel, proTag,
      sek7: letzte7.reduce((s, v) => s + (v.dauer || 0), 0), runden7: letzte7.length,
      erste: daten.verlauf.length ? daten.verlauf[0].zeit : null,
    };
  },

  minuten(sek) {
    const min = Math.round(sek / 60);
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
  },
  tausend(n) { return n.toLocaleString('de-DE'); },

  async statistikZeigen(cls) {
    if (!this.ergebnis || !cls?.musiktrainer) return;
    const o = this.statOptionen();
    const b = this.beamerEbene();
    const knopf = (art, wert, text) => `<button type="button" class="small${o[art] === wert ? ' primary' : ''}" data-stat="${art}" data-wert="${wert}">${text}</button>`;
    const kopf = `
      <div class="mt-beamer-kopf">
        <div>
          <h2>${o.ansicht === 'alle' ? 'Alle Klassen' : this.esc(cls.name)} · music-trainer-Statistik</h2>
          <p>${o.zeitraum === '0' ? 'Alles, was der Server hat (bis 365 Tage)' : `Letzte ${o.zeitraum} Tage`}. Minuten werden seit 01.11.2026 gezählt.</p>
        </div>
        <button class="mt-beamer-zu" title="Schließen (Esc)">${Icons.raw('x')}</button>
      </div>
      <div class="st-filter">
        <span>${knopf('ansicht', 'klasse', 'Diese Klasse')}${knopf('ansicht', 'alle', 'Alle Klassen')}</span>
        <span>${knopf('zeitraum', '7', '7 Tage')}${knopf('zeitraum', '28', '4 Wochen')}${knopf('zeitraum', '90', '3 Monate')}${knopf('zeitraum', '0', 'Gesamt')}</span>
        <span>${knopf('mass', 'min', 'Minuten')}${knopf('mass', 'runden', 'Runden')}</span>
      </div>`;
    if (o.ansicht === 'alle') {
      b.innerHTML = kopf + '<p class="hint st-laden">Lade alle Klassen …</p>';
      const html = await this.statAlleKlassen(o);
      if (b.hidden || this.statOpt.ansicht !== 'alle') return;
      b.innerHTML = kopf + html;
      return;
    }
    b.innerHTML = kopf + this.statKlasse(this.ergebnis.daten, o);
  },

  /* Eine Klasse: Kennzahlen, Verlauf, Wochentag × Uhrzeit, Spiele, Verteilung der Kinder */
  statKlasse(daten, o) {
    const s = this.statRechnen(daten, +o.zeitraum);
    const min = o.mass === 'min';
    const wert = x => (min ? x.sek / 60 : x.runden);
    const text = x => (min ? this.minuten(x.sek) : `${this.tausend(x.runden)} Runden`);
    const schulAnteil = min ? (s.sek ? s.schulSek / s.sek : null) : (s.runden ? s.schulRunden / s.runden : null);
    const kacheln = `
      <div class="st-kacheln">
        <div class="st-kachel st-gross"><b>${this.minuten(s.sek)}</b><span>gemeinsam geübt</span></div>
        <div class="st-kachel"><b>${this.tausend(s.runden)}</b><span>Runden gespielt</span></div>
        <div class="st-kachel"><b>${s.aktiv} <small>von ${s.kinder}</small></b><span>Kinder haben geübt</span></div>
        <div class="st-kachel" title="Tage, an denen ein Kind angemeldet war – je Kind und Tag einmal gezählt"><b>${this.tausend(s.anmeldetage)}</b><span>Anmeldetage</span></div>
        <div class="st-kachel"><b>${s.aktiv ? this.minuten(s.sek / s.aktiv) : '–'}</b><span>je übendem Kind</span></div>
        <div class="st-kachel" title="Runden außerhalb von Mo–Fr 7:30–13:30 Uhr"><b>${schulAnteil === null ? '–' : Math.round(100 * (1 - schulAnteil)) + ' %'}</b><span>außerhalb der Schulzeit</span></div>
      </div>`;

    // Verlauf: je Tag (bis 4 Wochen) oder je Woche
    const heute = this.statTag(Date.now() / 1000);
    let spanne = +o.zeitraum || Math.max(7, s.erste ? heute - this.statTag(s.erste) + 1 : 28);
    // Minuten gibt es erst ab 01.11.2026 – davor wären es leere Säulen, die wie „nicht geübt“ aussehen
    const abMinuten = heute - this.statTag(this.STAT_AB) + 1;
    const gekappt = min && spanne > abMinuten;
    if (gekappt) spanne = Math.max(1, abMinuten);
    const jeWoche = spanne > 31;
    const balken = [];
    if (jeWoche) {
      const montag = t => t - ((new Date(t * 86400000).getUTCDay() + 6) % 7);   // Tag 0 = Do., 1.1.1970
      const erste = montag(heute - spanne + 1);
      for (let w = erste; w <= heute; w += 7) {
        const x = { sek: 0, runden: 0 };
        for (let t = w; t < w + 7; t++) { const d = s.proTag[t]; if (d) { x.sek += d.sek; x.runden += d.runden; } }
        balken.push({ ...x, label: this.statDatum(w), titel: `Woche ab ${this.statDatum(w)}` });
      }
    } else {
      for (let t = heute - spanne + 1; t <= heute; t++) {
        const d = s.proTag[t] || { sek: 0, runden: 0 };
        const wt = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][(new Date(t * 86400000).getUTCDay() + 6) % 7];
        balken.push({ ...d, label: spanne <= 7 ? wt : this.statDatum(t), titel: `${wt} ${this.statDatum(t)}`, wochenende: ['Sa', 'So'].includes(wt) });
      }
    }
    const verlauf = this.statSaeulen(balken, wert, text, jeWoche ? 'je Woche' : 'je Tag');

    // Wochentag × Uhrzeit
    const heat = min ? s.heat.map(r => r.map(x => x / 60)) : s.heatRunden;
    const stunden = [];
    for (let h = 6; h <= 22; h++) stunden.push(h);
    const hmax = Math.max(1e-9, ...heat.flat());
    const tageN = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const karte = `
      <div class="st-karte" style="--spalten:${stunden.length}">
        <span></span>${stunden.map(h => `<span class="st-achse">${h % 2 === 0 ? h : ''}</span>`).join('')}
        ${tageN.map((t, wt) => `<span class="st-achse">${t}</span>${stunden.map(h => {
          const v = heat[wt][h] + (h === 6 ? heat[wt].slice(0, 6).reduce((a, c) => a + c, 0) : 0) + (h === 22 ? heat[wt][23] : 0);
          const schule = wt < 5 && h >= 8 && h < 13;
          return `<span class="st-zelle${schule ? ' schule' : ''}" style="--a:${v ? 0.12 + 0.88 * Math.min(1, v / hmax) : 0}" title="${t} ${h}–${h + 1} Uhr: ${min ? Math.round(v) + ' min' : v + ' Runden'}"></span>`;
        }).join('')}`).join('')}
      </div>
      <p class="st-legende"><span class="st-zelle" style="--a:.15"></span> wenig <span class="st-zelle" style="--a:1"></span> viel · umrandet: Mo–Fr 8–13 Uhr</p>`;

    // Spiele
    const spiele = Object.entries(s.proSpiel).map(([id, x]) => {
      const sp = MT_SPIELE.find(g => g.id === id);
      return { ...x, name: sp ? `${sp.bereich}: ${sp.titel}` : id };
    }).sort((a, c) => wert(c) - wert(a));
    const top = spiele.slice(0, 8);
    if (spiele.length > 8) top.push(spiele.slice(8).reduce((r, x) => ({ sek: r.sek + x.sek, runden: r.runden + x.runden, name: r.name }), { sek: 0, runden: 0, name: `${spiele.length - 8} weitere` }));
    const spielBalken = this.statLiegend(top, wert, text);

    // Kinder nach Übungsmenge (ohne Namen)
    const grenzen = min ? [[0, 0, 'nicht geübt'], [1, 9, 'unter 10 min'], [10, 29, '10–29 min'], [30, 59, '30–59 min'], [60, Infinity, '1 h und mehr']]
      : [[0, 0, 'keine Runde'], [1, 4, '1–4'], [5, 14, '5–14'], [15, 29, '15–29'], [30, Infinity, '30 und mehr']];
    const mengen = daten.schueler.map(k => { const x = s.proKind[k.id]; return x ? (min ? Math.round(x.sek / 60) : x.runden) : 0; });
    const vert = grenzen.map(([a, z, label]) => ({ label, n: mengen.filter(m => m >= a && m <= z).length }));
    const vmax = Math.max(1, ...vert.map(v => v.n));
    const verteilung = `<div class="st-verteilung">${vert.map(v => `
      <div title="${v.n} ${v.n === 1 ? 'Kind' : 'Kinder'}: ${v.label}"><b>${v.n}</b><span class="st-fuell" style="--h:${v.n / vmax}"></span><span class="st-achse">${v.label}</span></div>`).join('')}</div>`;

    // Außerhalb der Schulzeit (ohne Namen – wer, steht in der Klassenliste unter „Zuhause“)
    const zs = s.sitzungen, zSek = zs.reduce((a, x) => a + x.sek, 0);
    const laengste = zs.reduce((a, x) => Math.max(a, x.sek), 0);
    const zuhause = zs.length ? `
      <div class="st-zuhause">
        <div><b>${s.zuhauseKinder} <small>von ${s.kinder}</small></b><span>Kinder</span></div>
        <div><b>${this.tausend(zs.length)}</b><span>Mal geübt</span></div>
        <div><b>${this.minuten(zSek)}</b><span>zusammen</span></div>
        <div><b>${this.minuten(zSek / zs.length)}</b><span>Ø je Mal</span></div>
        <div><b>${this.minuten(laengste)}</b><span>am längsten</span></div>
      </div>
      <p class="hint">Ein „Mal“ endet nach 15 Minuten Pause. Wer es war, zeigt die Klassenliste in der Spalte „Zuhause“ und der Klick auf ein Kind.</p>`
      : '<p>Noch niemand hat außerhalb der Schulzeit geübt.</p>';

    return `
      ${kacheln}
      <div class="st-raster">
        <section class="mt-klasse-block st-breit"><h3>Außerhalb der Schulzeit <small class="hint">(nicht Mo–Fr 7:30–13:30)</small></h3>${zuhause}</section>
        <section class="mt-klasse-block st-breit"><h3>${min ? 'Minuten' : 'Runden'} ${jeWoche ? 'je Woche' : 'je Tag'}${gekappt ? ' <small class="hint">(ab 01.11.2026 – davor wurden keine Minuten gespeichert; unter „Runden“ siehst du den ganzen Zeitraum)</small>' : ''}</h3>${verlauf}</section>
        <section class="mt-klasse-block"><h3>Wann wird geübt?</h3>${karte}</section>
        <section class="mt-klasse-block"><h3>Was wird gespielt?</h3>${spielBalken || '<p>Noch keine Runden.</p>'}</section>
        <section class="mt-klasse-block"><h3>Wie viel üben die Kinder?</h3>${verteilung}</section>
      </div>`;
  },

  statDatum(tag) {
    const d = new Date(tag * 86400000);
    return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
  },

  /* Senkrechte Säulen mit Wert über der höchsten; Beschriftung nur jede n-te */
  statSaeulen(balken, wert, text, je) {
    const max = Math.max(1e-9, ...balken.map(wert));
    const jede = Math.ceil(balken.length / 14);
    const summe = balken.reduce((r, x) => ({ sek: r.sek + x.sek, runden: r.runden + x.runden }), { sek: 0, runden: 0 });
    const hoechst = balken.reduce((a, x) => (wert(x) > wert(a) ? x : a), balken[0]);
    return `
      <div class="st-saeulen" style="--n:${balken.length}">
        ${balken.map((x, i) => `<div class="st-saeule${x.wochenende ? ' we' : ''}" title="${this.esc(x.titel)}: ${text(x)}">
          ${x === hoechst && wert(x) > 0 ? `<b>${text(x).replace(' Runden', '')}</b>` : ''}
          <span class="st-fuell" style="--h:${wert(x) / max}"></span>
          <span class="st-achse">${i % jede === 0 ? x.label : ''}</span></div>`).join('')}
      </div>
      <p class="st-legende">Zusammen ${text(summe)} · Ø ${text({ sek: summe.sek / balken.length, runden: Math.round(summe.runden / balken.length) })} ${je}</p>`;
  },

  /* Liegende Balken, Wert direkt dahinter */
  statLiegend(zeilen, wert, text) {
    if (!zeilen.length) return '';
    const max = Math.max(1e-9, ...zeilen.map(wert));
    return `<div class="st-liegend">${zeilen.map(z => `
      <span class="st-name">${this.esc(z.name)}</span>
      <span class="st-bahn"><span class="st-fuell" style="--w:${wert(z) / max}"></span></span>
      <span class="st-wert">${text(z).replace(' Runden', '')}</span>`).join('')}</div>`;
  },

  /* Alle Klassen mit music-trainer: nacheinander laden (Cloudflare, nicht Firebase) und vergleichen */
  statCache: {},
  async statAlleKlassen(o) {
    const klassen = Classes.data.classes.filter(c => c.musiktrainer?.id);
    const reihen = [];
    for (const c of klassen) {
      let daten = this.ergebnis?.klasseId === c.musiktrainer.id ? this.ergebnis.daten : this.statCache[c.musiktrainer.id];
      if (!daten) {
        try {
          daten = await this.api(`/api/lehrer/klassen/${c.musiktrainer.id}?seit=${Math.floor(Date.now() / 1000) - 366 * 86400}`);
          this.statCache[c.musiktrainer.id] = daten;
        } catch (err) {
          if (err.status === 401) return '<p class="hint">Bitte erst im school-tool beim music-trainer anmelden.</p>';
          continue;   // Klasse auf dem Server gelöscht
        }
      }
      reihen.push({ name: c.name, ...this.statRechnen(daten, +o.zeitraum) });
    }
    if (!reihen.length) return '<p class="hint">Noch keine Klasse mit dem music-trainer verbunden.</p>';
    const min = o.mass === 'min';
    const wert = x => (min ? x.sek / 60 : x.runden);
    const text = x => (min ? this.minuten(x.sek) : `${this.tausend(x.runden)} Runden`);
    reihen.sort((a, c) => wert(c) - wert(a));
    const summe = reihen.reduce((r, x) => ({ sek: r.sek + x.sek, runden: r.runden + x.runden, kinder: r.kinder + x.kinder, aktiv: r.aktiv + x.aktiv, anmeldetage: r.anmeldetage + x.anmeldetage }),
      { sek: 0, runden: 0, kinder: 0, aktiv: 0, anmeldetage: 0 });
    return `
      <div class="st-kacheln">
        <div class="st-kachel st-gross"><b>${this.minuten(summe.sek)}</b><span>in ${reihen.length} Klassen geübt</span></div>
        <div class="st-kachel"><b>${this.tausend(summe.runden)}</b><span>Runden gespielt</span></div>
        <div class="st-kachel"><b>${summe.aktiv} <small>von ${summe.kinder}</small></b><span>Kinder haben geübt</span></div>
        <div class="st-kachel" title="Tage, an denen ein Kind angemeldet war – je Kind und Tag einmal gezählt"><b>${this.tausend(summe.anmeldetage)}</b><span>Anmeldetage</span></div>
        <div class="st-kachel"><b>${summe.aktiv ? this.minuten(summe.sek / summe.aktiv) : '–'}</b><span>je übendem Kind</span></div>
      </div>
      <div class="st-raster">
        <section class="mt-klasse-block st-breit"><h3>${min ? 'Minuten' : 'Runden'} je Klasse</h3>${this.statLiegend(reihen, wert, text)}</section>
        <section class="mt-klasse-block st-breit">
          <div class="mt-tabelle-rahmen"><table class="mt-tabelle st-tabelle">
            <thead><tr><th>Klasse</th><th>Kinder geübt</th><th>Runden</th><th>Minuten</th><th>Anmeldetage</th><th>Ø je Kind</th><th>Letzte 7 Tage</th></tr></thead>
            <tbody>${reihen.map(r => `<tr><td><b>${this.esc(r.name)}</b></td><td>${r.aktiv} von ${r.kinder}</td><td>${this.tausend(r.runden)}</td>
              <td>${this.minuten(r.sek)}</td><td>${this.tausend(r.anmeldetage)}</td><td>${r.aktiv ? this.minuten(r.sek / r.aktiv) : '–'}</td>
              <td>${this.minuten(r.sek7)} · ${r.runden7} R.</td></tr>`).join('')}</tbody>
          </table></div>
        </section>
      </div>`;
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
        if (e.key === 'Escape') this.beamerZu();
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); this.qrBlaettern(1); }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.qrBlaettern(-1); }
      });
      b.addEventListener('click', e => {
        const stat = e.target.closest('[data-stat]');
        if (stat) {
          const o = this.statOptionen();
          o[stat.dataset.stat] = stat.dataset.wert;
          try { localStorage.setItem('schooltool-mt-statistik', JSON.stringify({ mass: o.mass, zeitraum: o.zeitraum })); } catch { /* egal */ }
          return this.statistikZeigen(this.klasse());
        }
        const anzeige = e.target.closest('[data-sb-anzeige]');
        if (anzeige) {
          this.score = anzeige.dataset.sbAnzeige !== 'note';
          if (this.score) this.scoreArt = anzeige.dataset.sbAnzeige;
          localStorage.setItem('schooltool-mt-score', this.score ? 'an' : 'aus');
          localStorage.setItem('schooltool-mt-score-art', this.scoreArt);
          this.render();
          return this.scoreboardZeigen(this.klasse());
        }
        if (e.target.closest('.mt-beamer-zu')) this.beamerZu();
        else if (e.target.closest('[data-blaettern]')) this.qrBlaettern(+e.target.closest('[data-blaettern]').dataset.blaettern);
      });
      b.addEventListener('change', e => {
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
      // Verlässt man das Vollbild (Esc fängt der Browser selbst ab), geht die Ansicht mit zu
      const raus = () => {
        const voll = document.fullscreenElement || document.webkitFullscreenElement;
        if (!voll && b.dataset.vollbild) { delete b.dataset.vollbild; b.hidden = true; }
      };
      document.addEventListener('fullscreenchange', raus);
      // Größe ändert sich (Vollbild an/aus, Fenster): die offene Ansicht neu einpassen
      window.addEventListener('resize', () => { if (!b.hidden && this.beamerAnpassen) this.beamerAnpassen(); });
      document.addEventListener('webkitfullscreenchange', raus);
    }
    this.beamerAnpassen = null;
    b.hidden = false;
    this.beamerVollbild(b);
    return b;
  },

  /* Beamer-Ansichten gleich im Vollbild – nur aus einem Klick heraus erlaubt; klappt es nicht, bleibt die Ebene */
  beamerVollbild(b) {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const rein = b.requestFullscreen || b.webkitRequestFullscreen;
    if (!rein) return;
    try {
      const p = rein.call(b);
      b.dataset.vollbild = '1';
      if (p && p.then) p.then(() => this.beamerAnpassen && this.beamerAnpassen(), () => { delete b.dataset.vollbild; });
    } catch (e) { delete b.dataset.vollbild; }
  },

  beamerZu() {
    const b = document.getElementById('mt-beamer');
    if (b) { delete b.dataset.vollbild; b.hidden = true; }
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* schon draußen */ }
    }
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
    b.innerHTML = `<div class="mt-namen-ansicht">
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
      <div class="mt-namensliste">
        ${sortiert.map(k => `<div class="mt-namenszeile"><span>${this.esc(k.name)}</span><code>${this.esc(k.benutzer)}</code></div>`).join('')}
      </div>
      <div class="mt-passwort-gross"><span>Passwort für alle</span><code>${this.esc(passwort)}</code></div>
    </div>`;
    this.allgemeinQr(document.getElementById('mt-allgemein-qr'), 460);
    // Das Vollbild kommt erst kurz nach dem Klick – dann über den resize-Lauscher neu einpassen
    this.beamerAnpassen = () => this.namenslisteEinpassen(b, sortiert.length);
    this.beamerAnpassen();
  },

  /* Namensliste ohne Scrollen: Spaltenzahl und Schrift so wählen, dass die Namen
     möglichst groß sind und alles auf den Bildschirm passt. Wird es eng, schrumpfen
     auch QR-Code, Adresse und Passwort. */
  namenslisteEinpassen(b, anzahl) {
    const ansicht = b.querySelector('.mt-namen-ansicht');
    if (!ansicht || !anzahl) return;
    const zeilen = [...ansicht.querySelectorAll('.mt-namenszeile')];
    // Die mittig ausgerichtete Liste läuft sonst links unbemerkt über den Rand
    const breitOk = () => {
      const r = ansicht.getBoundingClientRect();
      return zeilen.every(z => { const q = z.getBoundingClientRect(); return q.left >= r.left - 1 && q.right <= r.right + 1; });
    };
    const passt = () => b.scrollHeight <= b.clientHeight + 1 && b.scrollWidth <= b.clientWidth + 1 && breitOk();
    const setze = (s, spalten, n) => {
      ansicht.style.setProperty('--s', s);
      ansicht.style.setProperty('--n', `${n}px`);
      ansicht.style.setProperty('--zeilen', Math.ceil(anzahl / spalten));
    };
    let best = null;
    for (const s of [1, 0.8, 0.62, 0.48]) {
      for (let spalten = 1; spalten <= Math.min(4, anzahl); spalten++) {
        for (let n = 40; n >= 13; n--) {
          if (best && n <= best.n) break;
          setze(s, spalten, n);
          if (passt()) { best = { s, spalten, n }; break; }
        }
      }
      if (best && best.n >= 22) break; // Namen groß genug – QR-Code nicht weiter verkleinern
    }
    best = best || { s: 0.48, spalten: Math.min(4, anzahl), n: 13 };
    setze(best.s, best.spalten, best.n);
  },

  /* Nur der QR-Code zum Spiel, groß am Beamer – für Klassen ohne Logins:
     Die Kinder scannen und spielen gleich, ohne Anmeldung (dann wird nichts
     gespeichert, und es geht nichts an den Server). */
  nurQrZeigen(titel) {
    this.qrSeite = null;
    const b = this.beamerEbene();
    b.innerHTML = `<div class="mt-nurqr-ansicht">
      <div class="mt-beamer-kopf">
        <div>
          <h2>${titel ? this.esc(titel) + ': ' : ''}music-trainer</h2>
          <p>QR-Code scannen oder die Adresse eintippen – und los. Eine Anmeldung brauchst du nicht.</p>
        </div>
        <button class="mt-beamer-zu" title="Schließen (Esc)">${Icons.raw('x')}</button>
      </div>
      <div class="mt-nurqr-mitte">
        <div class="mt-allgemein-qr mt-nurqr-bild" id="mt-nurqr"></div>
        <div class="mt-adresse mt-nurqr-adresse">${this.esc(this.KURZ_URL)}</div>
      </div>
    </div>`;
    const feld = document.getElementById('mt-nurqr');
    if (feld && typeof QRCode !== 'undefined') {
      new QRCode(feld, { text: this.SPIEL_URL, width: 640, height: 640, correctLevel: QRCode.CorrectLevel.M });
    }
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
      this.eigeneEl.innerHTML = '<p class="hint">Erst den music-trainer-Worker eintragen (siehe bei einer Klasse den Unterreiter music-trainer).</p>';
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
              <button class="small" data-eigen="pw-aendern" data-g="${gi}" data-icon="pen" title="Passwort der Gruppe ändern – die Kärtchen danach neu drucken">Passwort ändern</button>
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
      <div class="mt-server-suche">
        <button class="small" data-eigen="suchen" data-icon="list" title="Findet Gruppen, die es auf dem music-trainer-Server gibt, die hier aber fehlen – etwa nach einem verlorenen Sync">Fehlende Gruppen auf dem Server suchen</button>
        <div id="mt-server-treffer"></div>
      </div>
      <div id="mt-eigene-login"></div>`;
    Icons.hydrate(this.eigeneEl);
    if (this.serverTreffer) this.serverTrefferZeigen(document.getElementById('mt-server-treffer'));
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

  /* Gruppen auf dem Server, die hier fehlen: Der Worker hat keine Liste aller Klassen, darum
     der Reihe nach die Nummern abfragen (bekannte Klassen und Gruppen überspringen), bis nach
     der höchsten bekannten Nummer 25 hintereinander frei sind. Nur lesen, nichts ändern. */
  async serverSuchen(ziel) {
    const bekannt = new Set([...this.gruppen().map(g => Number(g.id)),
      ...Classes.data.classes.map(c => Number(c.musiktrainer?.id)).filter(Boolean)]);
    const max = Math.max(0, ...bekannt);
    const treffer = [];
    let frei = 0;
    ziel.innerHTML = '<p class="hint">Suche …</p>';
    // „seit“ in der Zukunft: der Server schickt Verlauf und Besuche nicht mit – nur Name, Passwort, Zugänge
    const seit = Math.floor(Date.now() / 1000) + 86400;
    for (let start = 1; start <= 400 && (start <= max || frei < 25); start += 8) {
      ziel.innerHTML = `<p class="hint">Suche … Nummer ${start} von etwa ${Math.max(max, start) + 25}${treffer.length ? ` · ${treffer.length} gefunden` : ''}</p>`;
      const nummern = Array.from({ length: 8 }, (_, i) => start + i).filter(n => !bekannt.has(n));
      const antworten = await Promise.all(nummern.map(n => this.api(`/api/lehrer/klassen/${n}?seit=${seit}`)
        .catch(err => { if (err.status === 404) return null; throw err; })));
      for (const d of antworten) {
        if (d) { treffer.push(d); frei = 0; } else frei++;
      }
    }
    // Klassen aus dem Reiter Klassen nicht vorschlagen – auch ältere Server-Einträge mit demselben
    // Namen nicht (z. B. eine früher eingerichtete 5e), das sind keine eigenen Gruppen
    const klassenNamen = new Set(Classes.data.classes.map(c => (c.name || '').trim().toLowerCase()));
    this.serverTreffer = treffer.filter(d => !klassenNamen.has((d.klasse.name || '').trim().toLowerCase()));
    this.serverTrefferZeigen(ziel);
  },

  serverTrefferZeigen(ziel) {
    const t = this.serverTreffer || [];
    ziel.innerHTML = t.length ? `
      <p class="hint">Auf dem Server, aber hier nicht eingetragen – übernimm nur, was zu dir gehört:</p>
      <ul class="mt-zugaenge mt-treffer">
        ${t.map(d => `<li><strong>${this.esc(d.klasse.name)}</strong> <span class="hint">Passwort <code>${this.esc(d.klasse.passwort)}</code> ·
          ${d.schueler.length ? d.schueler.map(k => this.esc(k.benutzername)).join(', ') : 'keine Zugänge'}</span>
          <button class="small primary" data-eigen="uebernehmen" data-id="${d.klasse.id}">Übernehmen</button></li>`).join('')}
      </ul>` : '<p class="hint">Keine fehlenden Gruppen gefunden – alle eigenen Gruppen sind hier eingetragen.</p>';
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
      if (b.dataset.eigen === 'pw-aendern') {
        const neu = (prompt(`Neues Passwort für „${g.name}“ (mind. 4 Zeichen):`, g.passwort) || '').trim();
        if (!neu || neu === g.passwort) return;
        if (neu.length < 4) return alert('Das Passwort braucht mindestens 4 Zeichen.');
        const r = await this.api(`/api/lehrer/klassen/${g.id}`, { methode: 'PATCH', body: { passwort: neu } });
        g.passwort = r.passwort;
        alert('Passwort geändert. Die alten Kärtchen und QR-Codes gelten nicht mehr – bitte neu drucken.');
      }
      // await: sonst ginge ein Fehler (z. B. Anmeldung abgelaufen) am catch unten vorbei
      if (b.dataset.eigen === 'suchen') {
        const ziel = document.getElementById('mt-server-treffer');
        try { return await this.serverSuchen(ziel); } catch (err) { ziel.innerHTML = ''; throw err; }
      }
      if (b.dataset.eigen === 'uebernehmen') {
        const d = this.serverTreffer?.find(t => String(t.klasse.id) === b.dataset.id);
        if (!d || gruppen.some(x => x.id === d.klasse.id)) return;
        gruppen.push({ id: d.klasse.id, name: d.klasse.name, passwort: d.klasse.passwort,
          kinder: d.schueler.map(k => ({ id: k.id, name: k.benutzername })) });
        this.serverTreffer = this.serverTreffer.filter(t => t !== d);
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
