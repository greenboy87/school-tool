/* Stundenthemen: Stundenkatalog + eigene Themen + Fortschritt je Klasse.

   Stundenkatalog: kommt aus dem Repo „stundenkatalog“ (katalog.json, erzeugt von
   katalog_aktualisieren.py). Er wird bei jedem Öffnen frisch geladen und nur
   lokal zwischengespeichert – er gehört nicht zu den Klassendaten und läuft
   deshalb auch nicht durch den Tresor. Katalog-Themen haben die ID „kat:<Ordner>“.
   Eigene Themen (data.topics) kommen dazu und werden mit den Klassen gesichert.
   Fortschritt (class.lessons): { topicId: { s: 'progress'|'done', d1, d2, t } }
   t = Titel beim Hinzufügen, falls der Ordner später umbenannt wird.
   sw = Schlagwort fürs Klassenbuch, selbst gesetzt (sonst aus dem Titel geraten). */
const Lessons = {
  STATES: { open: 'Offen', progress: 'Läuft', done: 'Fertig' },
  KATALOG_URL: 'https://greenboy87.github.io/stundenkatalog/katalog.json',
  KATALOG_SEITE: 'https://greenboy87.github.io/stundenkatalog/',
  CACHE_KEY: 'schooltool-katalog',
  katalog: null,      // { erstellt, macBasis, stunden: [{ id, titel, klassen, tags }] }
  katalogIds: new Map(),

  init() {
    this.katalogSetzen(this.cacheLesen());
    this.katalogLaden();

    // Thema zur Klasse hinzufügen – per Vorschlagsliste aus der Sammlung
    document.getElementById('form-add-lesson').addEventListener('submit', e => {
      e.preventDefault();
      this.addTypedTopic();
    });
    document.getElementById('lesson-filter').addEventListener('input', () => this.render());
    document.getElementById('lesson-only-grade').addEventListener('input', () => this.fillTopicOptions());
    document.getElementById('lesson-tag').addEventListener('input', () => this.fillTopicOptions());
    document.getElementById('btn-katalog').addEventListener('click', () => this.katalogFenster());
    window.addEventListener('message', e => this.katalogNachricht(e));
  },

  /* ----- Katalogseite als Fenster: alle Filter von dort, „+ zur Klasse“ landet hier ----- */
  katalogFenster() {
    const cls = Classes.currentClass();
    if (!cls) return;
    let f = document.getElementById('katalog-fenster');
    if (!f) {
      f = document.createElement('div');
      f.id = 'katalog-fenster';
      f.className = 'katalog-fenster';
      f.innerHTML = `
        <div class="katalog-kopf">
          <h3 id="katalog-titel"></h3>
          <button class="primary" id="katalog-zu">${Icons.raw('check')}Fertig</button>
        </div>
        <iframe src="${this.KATALOG_SEITE}?schooltool" title="Stundenkatalog" allow="clipboard-write"></iframe>`;
      document.body.appendChild(f);
      f.querySelector('#katalog-zu').addEventListener('click', () => { f.hidden = true; this.render(); });
    }
    f.hidden = false;
    document.getElementById('katalog-titel').textContent = 'Stundenkatalog – ' + cls.name;
    this.katalogMelden();
  },

  /* Der Katalogseite sagen, was die Klasse schon hat */
  katalogMelden() {
    const f = document.getElementById('katalog-fenster');
    const cls = Classes.currentClass();
    if (!f || f.hidden || !cls) return;
    const ids = Object.keys(this.lessonsOf(cls)).filter(id => id.startsWith('kat:')).map(id => id.slice(4));
    f.querySelector('iframe').contentWindow.postMessage({ typ: 'katalog-da', ids, klasse: cls.name }, new URL(this.KATALOG_SEITE).origin);
  },

  katalogNachricht(e) {
    if (e.origin !== new URL(this.KATALOG_SEITE).origin || !e.data) return;
    if (e.data.typ === 'katalog-bereit') { this.katalogMelden(); return; }
    if (e.data.typ !== 'katalog-add' || typeof e.data.id !== 'string') return;
    const cls = Classes.currentClass();
    if (!cls) return;
    const l = this.lessonsOf(cls);
    const id = 'kat:' + e.data.id;
    if (l[id]) return;
    const s = this.katalogIds.get(e.data.id);
    l[id] = { s: 'open', added: Date.now(), t: s ? s.titel : String(e.data.titel || e.data.id).slice(0, 200) };
    Classes.persist();
    this.render();
  },

  /* ----- Stundenkatalog ----- */
  cacheLesen() {
    try { return JSON.parse(localStorage.getItem(this.CACHE_KEY)); }
    catch (e) { return null; }
  },

  katalogSetzen(k) {
    if (!k || !Array.isArray(k.stunden)) return;
    this.katalog = k;
    this.katalogIds = new Map(k.stunden.map(s => [s.id, s]));
    this.fillTagOptions();
    this.migrieren();
  },

  /* no-cache: der Browser fragt nach, bekommt aber bei unverändertem Katalog nur „304“ */
  async katalogLaden() {
    try {
      const r = await fetch(this.KATALOG_URL, { cache: 'no-cache' });
      if (!r.ok) return;
      const k = await r.json();
      if (this.katalog && this.katalog.erstellt === k.erstellt) return;
      try { localStorage.setItem(this.CACHE_KEY, JSON.stringify(k)); } catch (e) { /* voll – dann eben ohne Zwischenspeicher */ }
      this.katalogSetzen(k);
      this.render();
    } catch (e) { /* offline: Zwischenspeicher reicht */ }
  },

  /* Einmalig: Themen aus der alten Ordnerliste (topics-seed.js) auf den Katalog umstellen.
     Zugeordnete Themen samt Stand wandern zum passenden Katalogeintrag; was keinen
     Treffer hat, bleibt als eigenes Thema. Ungenutzte alte Themen fliegen raus. */
  migrieren() {
    const d = Classes.data;
    if (!Array.isArray(d.topics)) d.topics = [];
    const alte = d.topics.filter(t => t.seedFolder);
    if (!alte.length) return;
    const nachName = new Map();
    for (const s of this.katalog.stunden) {
      for (const n of [s.id, s.titel]) if (!nachName.has(n.toLowerCase())) nachName.set(n.toLowerCase(), s);
    }
    const treffer = t => {
      const f = t.seedFolder.toLowerCase();
      return nachName.get(f) || nachName.get(f.replace(/^klasse [\d\s,–-]+ - /, '')) || nachName.get(t.name.toLowerCase());
    };
    const genutzt = new Set(d.classes.flatMap(c => Object.keys(c.lessons || {})));
    const bleiben = [];
    for (const t of d.topics) {
      if (!t.seedFolder) { bleiben.push(t); continue; }
      const s = treffer(t);
      if (s) {
        for (const c of d.classes) {
          const l = c.lessons;
          if (!l || !l[t.id]) continue;
          if (!l['kat:' + s.id]) l['kat:' + s.id] = { ...l[t.id], t: s.titel };
          delete l[t.id];
        }
      } else if (genutzt.has(t.id)) {
        delete t.seedFolder;
        t.custom = true;
        bleiben.push(t);
      }
    }
    d.topics = bleiben;
    Classes.persist();
  },

  /* Ein Thema – aus dem Katalog oder aus den eigenen Themen */
  topicById(id, eintrag) {
    if (id.startsWith('kat:')) {
      const s = this.katalogIds.get(id.slice(4));
      if (s) return { id, name: s.titel, grades: s.klassen, tags: s.tags, ordner: s.id, haupt: s.haupt, ab: s.ab };
      // Ordner umbenannt oder Katalog noch nicht geladen: mit dem gemerkten Titel weiter
      return { id, name: (eintrag && eintrag.t) || id.slice(4).split('/').pop(), grades: [], fehlt: !!this.katalog };
    }
    return Classes.data.topics.find(t => t.id === id);
  },

  allTopics() {
    const kat = this.katalog ? this.katalog.stunden.map(s => this.topicById('kat:' + s.id)) : [];
    return kat.concat(Classes.data.topics.filter(t => !t.hidden));
  },

  fillTagOptions() {
    const sel = document.getElementById('lesson-tag');
    if (!sel || !this.katalog) return;
    const wert = sel.value;
    const zahl = new Map();
    for (const s of this.katalog.stunden) for (const t of s.tags) zahl.set(t, (zahl.get(t) || 0) + 1);
    sel.innerHTML = '<option value="">alle Tags</option>';
    for (const t of [...zahl.keys()].sort((a, b) => a.localeCompare(b, 'de'))) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = `${t} (${zahl.get(t)})`;
      sel.appendChild(o);
    }
    sel.value = wert;
  },

  /* Ordner oder Datei im iCloud-Ordner öffnen – über dieselben Kurzbefehle wie die Katalogseite.
     pfad ist relativ zu Musikseminarsave, z. B. „Klasse 7 - Wellerman/Wellerman.pptx“ */
  oeffnen(pfad) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
    const mac = !ios && /Mac/i.test(navigator.platform || navigator.userAgent);
    if (ios) {
      try { navigator.clipboard.writeText(pfad); } catch (e) { /* Kurzbefehl bekommt den Pfad trotzdem */ }
      location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent('Katalog öffnen iOS') +
        '&input=text&text=' + encodeURIComponent(pfad);
    } else if (mac && this.katalog) {
      location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent('Katalog öffnen') +
        '&input=text&text=' + encodeURIComponent(this.katalog.macBasis + '/' + pfad);
    } else {
      window.open(this.KATALOG_SEITE, '_blank', 'noopener');
    }
  },

  /* Getipptes Thema der Klasse zuordnen; unbekannte Themen auf Nachfrage anlegen */
  addTypedTopic() {
    const cls = Classes.currentClass();
    const feld = document.getElementById('lesson-add');
    const name = feld.value.trim();
    if (!cls || !name) return;

    const passend = this.allTopics().filter(t => t.name.toLowerCase() === name.toLowerCase());
    // Gleicher Titel in mehreren Ordnern: den für diese Jahrgangsstufe nehmen
    let topic = passend.find(t => cls.grade && t.grades && t.grades.includes(cls.grade)) || passend[0];
    if (!topic) {
      if (!confirm(`„${name}“ steht noch nicht in deiner Themensammlung.\n\nJetzt neu anlegen? ` +
        'Das Thema steht danach in allen Klassen zur Verfügung.')) return;
      const grades = cls.grade ? [cls.grade] : [];
      topic = { id: Store.uid(), name, grades, custom: true };
      Classes.data.topics.push(topic);
    }

    const l = this.lessonsOf(cls);
    if (l[topic.id]) { alert(`„${topic.name}“ ist dieser Klasse schon zugeordnet.`); feld.value = ''; return; }
    l[topic.id] = { s: 'open', added: Date.now() };
    if (topic.ordner) l[topic.id].t = topic.name;
    Classes.persist();
    feld.value = '';
    this.render();
  },

  /* Vorschlagsliste füllen: passende Jahrgangsstufe, ohne bereits zugeordnete */
  fillTopicOptions() {
    const dl = document.getElementById('topic-options');
    const cls = Classes.currentClass();
    if (!dl || !cls) return;
    const nurStufe = document.getElementById('lesson-only-grade').checked;
    const tag = document.getElementById('lesson-tag').value;
    const schonDa = this.lessonsOf(cls);
    dl.innerHTML = '';
    const gesehen = new Set();
    for (const t of this.allTopics()) {
      if (schonDa[t.id] || gesehen.has(t.name.toLowerCase())) continue;
      if (nurStufe && cls.grade && t.grades && t.grades.length && !t.grades.includes(cls.grade)) continue;
      if (tag && !(t.tags || []).includes(tag)) continue;
      gesehen.add(t.name.toLowerCase());
      const o = document.createElement('option');
      o.value = t.name;
      const bits = [];
      if (t.grades && t.grades.length) bits.push('Kl. ' + this.gradeLabel(t.grades));
      if (t.tags && t.tags.length) bits.push(t.tags.slice(0, 3).join(', '));
      if (bits.length) o.label = bits.join(' · ');
      dl.appendChild(o);
    }
  },

  lessonsOf(cls) {
    if (!cls.lessons) cls.lessons = {};
    return cls.lessons;
  },

  setState(cls, topicId, state) {
    const l = this.lessonsOf(cls);
    const today = new Date().toISOString().slice(0, 10);
    const entry = l[topicId] || { added: Date.now() };
    entry.s = state;
    if (state === 'open') { delete entry.d1; delete entry.d2; }
    if (state === 'progress') { entry.d1 = entry.d1 || today; delete entry.d2; }
    if (state === 'done') { entry.d1 = entry.d1 || today; entry.d2 = today; }
    l[topicId] = entry;
    Classes.persist();
    this.render();
  },

  /* Thema wieder aus der Klasse nehmen (die Sammlung bleibt unberührt) */
  removeTopic(cls, topicId) {
    delete this.lessonsOf(cls)[topicId];
    Classes.persist();
    this.render();
  },

  /* Schlagwort fürs digitale Klassenbuch: selbst gesetztes gilt für alle Klassen,
     sonst aus dem Titel geraten („1a_Metrum Puls Tempo by phil“ → „Metrum Puls Tempo“) */
  schlagwort(topic) {
    for (const c of Classes.data.classes) {
      const e = c.lessons && c.lessons[topic.id];
      if (e && e.sw) return e.sw;
    }
    return topic.name
      .replace(/^(ex|klasse)\b[\s\d,–-]*-\s*/i, '')
      .replace(/^\d+[a-z]?(\s*\d+)?[_.\s-]*/i, '')
      .replace(/\s+by\s+\S+.*$/, '')
      .replace(/\s+(mip|wh|neu|alt|test)\b.*$/i, '')
      .replace(/[\s+_-]+$/, '')
      .replace(/_/g, ' ')
      .trim() || topic.name;
  },

  schlagwortAendern(cls, topic) {
    const neu = prompt(`Schlagwort für „${topic.name}“ (gilt für alle Klassen):`, this.schlagwort(topic));
    if (neu === null) return;
    const sw = neu.trim().slice(0, 120);
    for (const c of Classes.data.classes) {
      const e = c.lessons && c.lessons[topic.id];
      if (e) { if (sw) e.sw = sw; else delete e.sw; }
    }
    Classes.persist();
    this.render();
  },

  async schlagwortKopieren(knopf, text) {
    let ok = true;
    try { await navigator.clipboard.writeText(text); } catch (e) { ok = Band.kopierenAlt(text); }
    const alt = knopf.innerHTML;
    knopf.textContent = ok ? '✓ kopiert' : 'Kopieren ging nicht';
    knopf.disabled = true;
    setTimeout(() => { knopf.innerHTML = alt; knopf.disabled = false; }, 1500);
  },

  stateOf(cls, topicId) {
    const e = this.lessonsOf(cls)[topicId];
    return e ? (e.s || 'open') : 'open';
  },

  /* In welchen anderen Klassen wurde das Thema schon abgeschlossen? */
  historyFor(topicId, exceptClassId) {
    return Classes.data.classes
      .filter(c => c.id !== exceptClassId && c.lessons && c.lessons[topicId] &&
        c.lessons[topicId].s === 'done')
      .map(c => `${c.name}${c.year ? ' (' + c.year + ')' : ''}`);
  },

  /* Nur die Themen, die dieser Klasse zugeordnet sind – in der Reihenfolge des Hinzufügens */
  assignedTopics(cls) {
    const l = this.lessonsOf(cls);
    return Object.keys(l)
      .map(id => ({ topic: this.topicById(id, l[id]), eintrag: l[id] }))
      .filter(x => x.topic)
      .sort((a, b) => (a.eintrag.added || 0) - (b.eintrag.added || 0))
      .map(x => x.topic);
  },

  visibleTopics(cls) {
    const filter = document.getElementById('lesson-filter').value;
    return this.assignedTopics(cls)
      .filter(t => filter === 'all' || this.stateOf(cls, t.id) === filter);
  },

  render() {
    const cls = Classes.currentClass();
    if (!cls) return;
    this.fillTopicOptions();
    const list = document.getElementById('lesson-list');
    const topics = this.visibleTopics(cls);

    // Fortschritt bezieht sich auf die zugeordneten Themen
    const zugeordnet = this.assignedTopics(cls);
    const done = zugeordnet.filter(t => this.stateOf(cls, t.id) === 'done').length;
    const running = zugeordnet.filter(t => this.stateOf(cls, t.id) === 'progress').length;
    document.getElementById('lesson-progress').textContent = zugeordnet.length
      ? `${done} von ${zugeordnet.length} Themen abgeschlossen` + (running ? ` · ${running} laufend` : '')
      : 'noch keine Themen zugeordnet';
    const bar = document.getElementById('lesson-bar');
    bar.style.width = zugeordnet.length ? (done / zugeordnet.length * 100) + '%' : '0%';

    list.innerHTML = '';
    if (!topics.length) {
      list.innerHTML = zugeordnet.length
        ? '<p class="hint">Mit diesem Filter ist gerade nichts zu sehen.</p>'
        : '<p class="hint">Noch nichts geplant – oben ein Thema tippen und hinzufügen.</p>';
      return;
    }
    for (const t of topics) {
      const st = this.stateOf(cls, t.id);
      const entry = this.lessonsOf(cls)[t.id];
      const li = document.createElement('li');
      li.className = 'lesson-item state-' + st;

      const main = document.createElement('div');
      main.className = 'lesson-main';
      const name = document.createElement('span');
      name.className = 'lesson-name';
      name.textContent = t.name;
      if (t.ordner) name.title = 'Ordner: ' + t.ordner;
      main.appendChild(name);

      const meta = document.createElement('span');
      meta.className = 'lesson-meta';
      const bits = [];
      if (t.grades && t.grades.length) bits.push('Kl. ' + this.gradeLabel(t.grades));
      if (t.tags && t.tags.length) bits.push(t.tags.slice(0, 3).join(', '));
      if (t.custom) bits.push('eigenes Thema');
      if (t.fehlt) bits.push('nicht mehr im Stundenkatalog');
      if (entry && entry.d2) bits.push('fertig am ' + this.fmt(entry.d2));
      else if (entry && entry.d1) bits.push('seit ' + this.fmt(entry.d1));
      const hist = this.historyFor(t.id, cls.id);
      if (hist.length) bits.push('schon gemacht: ' + hist.join(', '));
      meta.textContent = bits.join(' · ');
      main.appendChild(meta);

      const btns = document.createElement('div');
      btns.className = 'lesson-states';
      for (const [key, label] of Object.entries(this.STATES)) {
        const b = document.createElement('button');
        b.className = 'small state-btn' + (st === key ? ' active' : '');
        b.textContent = label;
        b.addEventListener('click', () => this.setState(cls, t.id, key));
        btns.appendChild(b);
      }
      let mat = null;
      if (t.ordner) {
        mat = document.createElement('div');
        mat.className = 'lesson-material';
        const knopf = (icon, text, pfad, titel) => {
          const b = document.createElement('button');
          b.className = 'small';
          b.innerHTML = Icons.raw(icon) + text;
          b.title = titel + ': ' + pfad;
          b.addEventListener('click', () => this.oeffnen(pfad));
          mat.appendChild(b);
        };
        if (t.haupt) knopf('play', /\.pdf$/i.test(t.haupt) ? 'PDF' : 'Präsentation', t.haupt, 'Öffnen');
        if (t.ab) knopf('file', 'Arbeitsblatt', t.ab, 'Öffnen');
        knopf('folder', '', t.ordner, 'Ordner öffnen');
      }
      // Laufende Stunde: Schlagwort mit einem Klick in die Zwischenablage
      let sw = null;
      if (st === 'progress') {
        sw = document.createElement('div');
        sw.className = 'lesson-schlagwort';
        const wort = this.schlagwort(t);
        const kopie = document.createElement('button');
        kopie.className = 'small';
        kopie.innerHTML = Icons.raw('clipboard');
        kopie.append(wort);
        kopie.title = 'Schlagwort kopieren (fürs Klassenbuch einfügen mit Strg+V)';
        kopie.addEventListener('click', () => this.schlagwortKopieren(kopie, wort));
        const stift = document.createElement('button');
        stift.className = 'small';
        stift.innerHTML = Icons.raw('pen');
        stift.title = 'Schlagwort ändern';
        stift.addEventListener('click', () => this.schlagwortAendern(cls, t));
        sw.append(kopie, stift);
      }

      const weg = document.createElement('button');
      weg.className = 'small danger';
      weg.innerHTML = Icons.raw('x');
      weg.title = 'Thema aus dieser Klasse nehmen (bleibt in der Sammlung erhalten)';
      weg.addEventListener('click', () => {
        if (this.stateOf(cls, t.id) !== 'open' &&
            !confirm(`„${t.name}“ aus der Klasse nehmen? Der bisherige Stand geht dabei verloren.`)) return;
        this.removeTopic(cls, t.id);
      });
      btns.appendChild(weg);

      li.append(main, ...(sw ? [sw] : []), ...(mat ? [mat] : []), btns);
      list.appendChild(li);
    }
  },

  gradeLabel(g) {
    if (g.length > 2 && g[g.length - 1] - g[0] === g.length - 1) return `${g[0]}–${g[g.length - 1]}`;
    return g.join(', ');
  },

  fmt(d) {
    return new Date(d + 'T12:00').toLocaleDateString('de-DE');
  },
};
