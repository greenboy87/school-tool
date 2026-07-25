/* Stundenthemen: globaler Katalog + Fortschritt je Klasse.

   Katalog (data.topics): einmal aus TOPICS_SEED befüllt, danach dauerhaft
   gespeichert. Eigene Themen kommen dazu und bleiben bei Updates erhalten.
   Fortschritt (class.lessons): { topicId: { s: 'progress'|'done', d1, d2 } } */
const Lessons = {
  STATES: { open: 'Offen', progress: 'Läuft', done: 'Fertig' },

  init() {
    this.syncCatalog();

    document.getElementById('form-new-topic').addEventListener('submit', e => {
      e.preventDefault();
      const nameEl = document.getElementById('new-topic-name');
      const gradeEl = document.getElementById('new-topic-grades');
      const name = nameEl.value.trim();
      if (!name) return;
      const grades = (gradeEl.value.match(/\d{1,2}/g) || [])
        .map(Number).filter(g => g >= 5 && g <= 10);
      if (Classes.data.topics.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        alert('Dieses Thema gibt es schon.');
        return;
      }
      Classes.data.topics.push({ id: Store.uid(), name, grades, custom: true });
      Classes.persist();
      nameEl.value = '';
      gradeEl.value = '';
      this.render();
    });

    ['lesson-search', 'lesson-filter', 'lesson-only-grade'].forEach(id =>
      document.getElementById(id).addEventListener('input', () => this.render()));
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
    if (state === 'open') {
      delete l[topicId];
    } else {
      const entry = l[topicId] || {};
      entry.s = state;
      if (state === 'progress') { entry.d1 = entry.d1 || today; delete entry.d2; }
      if (state === 'done') { entry.d1 = entry.d1 || today; entry.d2 = today; }
      l[topicId] = entry;
    }
    Classes.persist();
    this.render();
  },

  stateOf(cls, topicId) {
    const e = this.lessonsOf(cls)[topicId];
    return e ? e.s : 'open';
  },

  /* In welchen anderen Klassen wurde das Thema schon abgeschlossen? */
  historyFor(topicId, exceptClassId) {
    return Classes.data.classes
      .filter(c => c.id !== exceptClassId && c.lessons && c.lessons[topicId] &&
        c.lessons[topicId].s === 'done')
      .map(c => `${c.name}${c.year ? ' (' + c.year + ')' : ''}`);
  },

  visibleTopics(cls) {
    const q = document.getElementById('lesson-search').value.trim().toLowerCase();
    const filter = document.getElementById('lesson-filter').value;
    const onlyGrade = document.getElementById('lesson-only-grade').checked;
    return Classes.data.topics.filter(t => {
      if (t.hidden) return false;
      if (onlyGrade && cls.grade && t.grades && t.grades.length &&
          !t.grades.includes(cls.grade)) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      const st = this.stateOf(cls, t.id);
      if (filter !== 'all' && filter !== st) return false;
      return true;
    });
  },

  render() {
    const cls = Classes.currentClass();
    if (!cls) return;
    const list = document.getElementById('lesson-list');
    const topics = this.visibleTopics(cls);

    // Fortschritt über alle (sichtbaren, klassenpassenden) Themen
    const relevant = Classes.data.topics.filter(t => !t.hidden &&
      (!cls.grade || !t.grades || !t.grades.length || t.grades.includes(cls.grade)));
    const done = relevant.filter(t => this.stateOf(cls, t.id) === 'done').length;
    const running = relevant.filter(t => this.stateOf(cls, t.id) === 'progress').length;
    document.getElementById('lesson-progress').textContent =
      `${done} von ${relevant.length} Themen abgeschlossen` +
      (running ? ` · ${running} laufend` : '');
    const bar = document.getElementById('lesson-bar');
    bar.style.width = relevant.length ? (done / relevant.length * 100) + '%' : '0%';

    list.innerHTML = '';
    if (!topics.length) {
      list.innerHTML = '<p class="hint">Keine Themen gefunden – Filter oder Suche anpassen.</p>';
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
      if (t.custom) {
        const del = document.createElement('button');
        del.className = 'small danger';
        del.innerHTML = Icons.raw('x');
        del.title = 'Eigenes Thema aus dem Katalog entfernen';
        del.addEventListener('click', () => {
          if (!confirm(`Thema „${t.name}“ dauerhaft entfernen?`)) return;
          Classes.data.topics = Classes.data.topics.filter(x => x.id !== t.id);
          Classes.persist();
          this.render();
        });
        btns.appendChild(del);
      }

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
