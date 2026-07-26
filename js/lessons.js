/* Stundenthemen: globaler Katalog + Fortschritt je Klasse.

   Katalog (data.topics): einmal aus TOPICS_SEED befüllt, danach dauerhaft
   gespeichert. Eigene Themen kommen dazu und bleiben bei Updates erhalten.
   Fortschritt (class.lessons): { topicId: { s: 'progress'|'done', d1, d2 } } */
const Lessons = {
  STATES: { open: 'Offen', progress: 'Läuft', done: 'Fertig' },

  init() {
    this.syncCatalog();

    // Thema zur Klasse hinzufügen – per Vorschlagsliste aus der Sammlung
    document.getElementById('form-add-lesson').addEventListener('submit', e => {
      e.preventDefault();
      this.addTypedTopic();
    });
    document.getElementById('lesson-filter').addEventListener('input', () => this.render());
    document.getElementById('lesson-only-grade').addEventListener('input', () => this.fillTopicOptions());
  },

  /* Getipptes Thema der Klasse zuordnen; unbekannte Themen auf Nachfrage anlegen */
  addTypedTopic() {
    const cls = Classes.currentClass();
    const feld = document.getElementById('lesson-add');
    const name = feld.value.trim();
    if (!cls || !name) return;

    let topic = Classes.data.topics.find(t => !t.hidden && t.name.toLowerCase() === name.toLowerCase());
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
    const schonDa = this.lessonsOf(cls);
    dl.innerHTML = '';
    for (const t of Classes.data.topics) {
      if (t.hidden || schonDa[t.id]) continue;
      if (nurStufe && cls.grade && t.grades && t.grades.length && !t.grades.includes(cls.grade)) continue;
      const o = document.createElement('option');
      o.value = t.name;
      if (t.grades && t.grades.length) o.label = 'Kl. ' + this.gradeLabel(t.grades);
      dl.appendChild(o);
    }
  },

  /* Neue Themen aus dem Katalog übernehmen, vorhandene unangetastet lassen */
  syncCatalog() {
    const d = Classes.data;
    if (!Array.isArray(d.topics)) d.topics = [];
    const known = new Set(d.topics.map(t => (t.seedFolder || t.name).toLowerCase()));
    let added = 0;
    for (const s of (typeof TOPICS_SEED !== 'undefined' ? TOPICS_SEED : [])) {
      if (known.has(s.f.toLowerCase())) continue;
      d.topics.push({ id: Store.uid(), name: s.t, grades: s.g, seedFolder: s.f });
      added++;
    }
    if (added) Classes.persist();
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
      .map(id => ({ topic: Classes.data.topics.find(t => t.id === id), eintrag: l[id] }))
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
      if (t.seedFolder) name.title = 'Ordner: ' + t.seedFolder;
      main.appendChild(name);

      const meta = document.createElement('span');
      meta.className = 'lesson-meta';
      const bits = [];
      if (t.grades && t.grades.length) bits.push('Kl. ' + this.gradeLabel(t.grades));
      if (t.custom) bits.push('eigenes Thema');
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

      li.append(main, btns);
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
