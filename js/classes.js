/* Klassenverwaltung: Schülerlisten, Projekte/Noten, Gruppen, Sitzplan */
const Classes = {
  data: null,
  currentClassId: null,
  currentProjectId: null,
  pendingGroups: null,
  seatplanUrl: null,

  init() {
    this.data = Store.load();

    document.getElementById('form-new-class').addEventListener('submit', e => {
      e.preventDefault();
      const input = document.getElementById('new-class-name');
      const name = input.value.trim();
      if (!name) return;
      const cls = { id: Store.uid(), name, students: [], projects: [] };
      this.data.classes.push(cls);
      this.persist();
      input.value = '';
      this.selectClass(cls.id);
    });

    document.getElementById('btn-delete-class').addEventListener('click', () => {
      const cls = this.currentClass();
      if (!cls) return;
      if (!confirm(`Klasse „${cls.name}“ mit allen Noten wirklich löschen?`)) return;
      Store.deleteSeatplan(cls.id);
      this.data.classes = this.data.classes.filter(c => c.id !== cls.id);
      this.currentClassId = null;
      this.persist();
      this.renderClassList();
      this.renderDetail();
    });

    // Subtabs
    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.subtab-page').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('subtab-' + btn.dataset.subtab).classList.add('active');
      });
    });

    // Schüler
    document.getElementById('btn-add-students').addEventListener('click', () => {
      const ta = document.getElementById('student-input');
      this.addStudents(ta.value, false);
      ta.value = '';
    });
    document.getElementById('btn-append-students').addEventListener('click', () => {
      const ta = document.getElementById('student-input');
      this.addStudents(ta.value, true);
      ta.value = '';
    });
    document.getElementById('btn-sort-students').addEventListener('click', () => {
      const cls = this.currentClass();
      if (!cls) return;
      this.sortStudents(cls);
      this.persist();
      this.renderStudents();
    });
    document.getElementById('student-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        try {
          const names = await this.extractNamesFromPdf(file);
          if (!names.length) { alert('In der PDF wurden keine Namen gefunden.'); return; }
          document.getElementById('student-input').value = names.join('\n');
          alert(`${names.length} Namen gefunden. Bitte im Textfeld kontrollieren und dann „Hinzufügen“ klicken.`);
        } catch (err) {
          alert('PDF konnte nicht gelesen werden: ' + err.message);
        }
      } else {
        const reader = new FileReader();
        reader.onload = () => this.addStudents(reader.result);
        reader.readAsText(file);
      }
    });

    // Projekte
    document.getElementById('form-new-project').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('new-project-name').value.trim();
      if (!name) return;
      const date = document.getElementById('new-project-date').value || new Date().toISOString().slice(0, 10);
      this.createProject(name, date, null);
      document.getElementById('new-project-name').value = '';
    });
    document.getElementById('btn-delete-project').addEventListener('click', () => {
      const cls = this.currentClass(), p = this.currentProject();
      if (!p || !confirm(`Projekt „${p.name}“ samt Noten löschen?`)) return;
      cls.projects = cls.projects.filter(x => x.id !== p.id);
      this.currentProjectId = null;
      this.persist();
      this.renderProjects();
    });
    document.getElementById('btn-print-project').addEventListener('click', () => {
      const detail = document.getElementById('project-detail');
      detail.classList.add('print-area');
      window.print();
      detail.classList.remove('print-area');
    });
    document.getElementById('btn-export-project').addEventListener('click', () => this.exportProjectCsv());

    // Gruppen
    document.getElementById('btn-make-groups').addEventListener('click', () => this.makeGroups());
    document.getElementById('btn-save-groups').addEventListener('click', () => this.saveGroupsAsProject());

    // Gruppen-Import aus PDF
    document.getElementById('groups-pdf').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      try {
        const { title, groups } = await this.extractGroupsFromPdf(file);
        if (!groups.length) { alert('In der PDF wurde keine Gruppen-Tabelle erkannt.'); return; }
        document.getElementById('group-import-text').value = groups
          .map(g => `${g.product || 'Gruppe'} | ${g.grade || '-'} | ${g.names.join(', ')}`)
          .join('\n');
        document.getElementById('group-import-name').value = title || file.name.replace(/\.pdf$/i, '');
        document.getElementById('group-import-date').value = new Date().toISOString().slice(0, 10);
        document.getElementById('group-import-info').textContent =
          `${groups.length} Gruppen mit insgesamt ${groups.reduce((a, g) => a + g.names.length, 0)} Namen erkannt.`;
        document.getElementById('group-import-preview').hidden = false;
      } catch (err) {
        alert('PDF konnte nicht gelesen werden: ' + err.message);
      }
    });
    document.getElementById('btn-group-import-cancel').addEventListener('click', () => {
      document.getElementById('group-import-preview').hidden = true;
    });
    document.getElementById('btn-group-import-save').addEventListener('click', () => this.saveImportedGroups());

    // Sitzplan
    document.getElementById('seatplan-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file || !this.currentClassId) return;
      await Store.putSeatplan(this.currentClassId, file);
      e.target.value = '';
      this.renderSeatplan();
    });
    document.getElementById('btn-delete-seatplan').addEventListener('click', async () => {
      if (!confirm('Sitzplan entfernen?')) return;
      await Store.deleteSeatplan(this.currentClassId);
      this.renderSeatplan();
    });

    this.renderClassList();
    this.renderDetail();
  },

  persist() { Store.save(this.data); },
  currentClass() { return this.data.classes.find(c => c.id === this.currentClassId) || null; },
  currentProject() {
    const cls = this.currentClass();
    return cls ? cls.projects.find(p => p.id === this.currentProjectId) || null : null;
  },

  selectClass(id) {
    this.currentClassId = id;
    this.currentProjectId = null;
    this.pendingGroups = null;
    this.renderClassList();
    this.renderDetail();
  },

  /* ---------- Rendern ---------- */
  renderClassList() {
    const ul = document.getElementById('class-list');
    ul.innerHTML = '';
    for (const cls of this.data.classes) {
      const li = document.createElement('li');
      li.classList.toggle('active', cls.id === this.currentClassId);
      li.innerHTML = `<span></span><span class="count"></span>`;
      li.firstChild.textContent = cls.name;
      li.lastChild.textContent = `${cls.students.length} SuS`;
      li.addEventListener('click', () => this.selectClass(cls.id));
      ul.appendChild(li);
    }
    if (typeof Tools !== 'undefined') Tools.refreshClassSelect();
  },

  renderDetail() {
    const cls = this.currentClass();
    document.getElementById('class-empty').hidden = !!cls;
    document.getElementById('class-detail').hidden = !cls;
    if (!cls) return;
    document.getElementById('class-title').textContent = cls.name;
    this.renderStudents();
    this.renderProjects();
    this.renderGroupResult();
    this.renderSeatplan();
  },

  /* ---------- Schüler ---------- */
  parseName(line) {
    line = line.replace(/^\d+[.)]?\s*/, '').replace(/[;\t]+/g, ',').trim();
    if (!line) return null;
    if (line.includes(',')) {
      const [last, first] = line.split(',').map(s => s.trim());
      return { first: first || '', last };
    }
    const parts = line.split(/\s+/);
    const last = parts.pop();
    return { first: parts.join(' '), last };
  },

  /* Klassenlisten-PDF: Text auslesen, Zeilen rekonstruieren und Namen herausfiltern */
  async extractNamesFromPdf(file) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const lines = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      // Textstücke nach Y-Position zu Zeilen gruppieren
      const rows = new Map();
      for (const item of content.items) {
        if (!item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push(item);
      }
      [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .forEach(([, items]) => {
          items.sort((a, b) => a.transform[4] - b.transform[4]);
          lines.push(items.map(i => i.str.trim()).join(' '));
        });
    }
    const skip = /klassenliste|klassenleitung|insgesamt|männlich|weiblich|schule|stand\s*:|^\s*nr\.?\s+name/i;
    const names = [];
    for (let line of lines) {
      if (skip.test(line)) continue;
      line = line.replace(/^\s*\d+\s+/, '').trim();       // laufende Nummer entfernen
      // Nur Zeilen der Form „Nachname, Vorname“ übernehmen
      const m = line.match(/^([A-Za-zÄÖÜäöüßéèáà' -]+,\s*[A-Za-zÄÖÜäöüßéèáà' .-]+?)\s*(?:\d.*)?$/);
      if (m && m[1].includes(',')) names.push(m[1].trim());
    }
    return names;
  },

  addStudents(text, append = false) {
    const cls = this.currentClass();
    if (!cls) return;
    for (const line of text.split(/\r?\n/)) {
      const n = this.parseName(line);
      if (n) cls.students.push({ id: Store.uid(), first: n.first, last: n.last });
    }
    if (!append) this.sortStudents(cls);
    this.persist();
    this.renderClassList();
    this.renderStudents();
  },

  sortStudents(cls) {
    cls.students.sort((a, b) =>
      (a.last + a.first).localeCompare(b.last + b.first, 'de', { sensitivity: 'base' }));
  },

  studentName(s) { return s.first ? `${s.last}, ${s.first}` : s.last; },

  renderStudents() {
    const cls = this.currentClass();
    const ol = document.getElementById('student-list');
    document.getElementById('student-count').textContent = cls.students.length;
    ol.innerHTML = '';
    cls.students.forEach((s, idx) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = this.studentName(s) + ' ';
      const move = (dir) => {
        const j = idx + dir;
        if (j < 0 || j >= cls.students.length) return;
        [cls.students[idx], cls.students[j]] = [cls.students[j], cls.students[idx]];
        this.persist();
        this.renderStudents();
      };
      const up = document.createElement('button');
      up.className = 'move';
      up.innerHTML = Icons.raw('chevronUp');
      up.title = 'Nach oben verschieben';
      up.addEventListener('click', () => move(-1));
      const down = document.createElement('button');
      down.className = 'move';
      down.innerHTML = Icons.raw('chevronDown');
      down.title = 'Nach unten verschieben';
      down.addEventListener('click', () => move(1));
      const del = document.createElement('button');
      del.className = 'del';
      del.innerHTML = Icons.raw('x');
      del.title = 'Schüler entfernen';
      del.addEventListener('click', () => {
        if (!confirm(`${this.studentName(s)} aus der Liste entfernen?`)) return;
        cls.students = cls.students.filter(x => x.id !== s.id);
        this.persist();
        this.renderClassList();
        this.renderStudents();
      });
      li.append(span, up, down, del);
      ol.appendChild(li);
    });
  },

  /* ---------- Projekte & Noten ---------- */
  createProject(name, date, groups) {
    const cls = this.currentClass();
    const p = { id: Store.uid(), name, date, entered: false, grades: {}, groups };
    cls.projects.push(p);
    this.currentProjectId = p.id;
    this.persist();
    this.renderProjects();
    return p;
  },

  parseGrade(str) {
    if (!str) return null;
    const m = String(str).trim().replace(',', '.').match(/^([1-6])(?:\.(\d))?\s*([+-])?(?:\s*-\s*([1-6]))?$/);
    if (!m) return null;
    let v = parseFloat(m[1] + (m[2] ? '.' + m[2] : ''));
    if (m[4]) v = (v + parseInt(m[4], 10)) / 2;      // „2-3“
    else if (m[3] === '+') v -= 0.25;
    else if (m[3] === '-') v += 0.25;
    return v;
  },

  projectAverage(p) {
    const vals = Object.values(p.grades).map(g => this.parseGrade(g)).filter(v => v !== null);
    if (!vals.length) return null;
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2).replace('.', ',');
  },

  renderProjects() {
    const cls = this.currentClass();
    const ul = document.getElementById('project-list');
    ul.innerHTML = '';
    const sorted = [...cls.projects].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const p of sorted) {
      const li = document.createElement('li');
      li.classList.toggle('active', p.id === this.currentProjectId);
      li.classList.toggle('is-entered', p.entered);
      const name = document.createElement('span');
      name.className = 'pname';
      name.textContent = p.name;
      if (p.entered) name.insertAdjacentHTML('beforeend', Icons.raw('check', 'entered-mark'));
      const date = document.createElement('span');
      date.className = 'pdate';
      date.textContent = p.date ? new Date(p.date + 'T12:00').toLocaleDateString('de-DE') : '';
      const avg = document.createElement('span');
      avg.className = 'pavg';
      const a = this.projectAverage(p);
      avg.textContent = a ? `Ø ${a}` : '';
      const label = document.createElement('label');
      label.className = 'entered';
      label.title = 'Abhaken, wenn die Noten im Notenmanager der Schule eingetragen sind';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = p.entered;
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => { p.entered = cb.checked; this.persist(); this.renderProjects(); });
      label.append(cb, 'eingetragen');
      li.append(name, date, avg, label);
      li.addEventListener('click', () => {
        this.currentProjectId = p.id;
        this.renderProjects();
      });
      ul.appendChild(li);
    }
    this.renderProjectDetail();
  },

  renderProjectDetail() {
    const cls = this.currentClass(), p = this.currentProject();
    const detail = document.getElementById('project-detail');
    detail.hidden = !p;
    if (!p) return;
    const dateStr = p.date ? new Date(p.date + 'T12:00').toLocaleDateString('de-DE') : '';
    document.getElementById('project-title').textContent = `${p.name}${dateStr ? ' – ' + dateStr : ''} (${cls.name})`;

    // Gruppen-Schnelleingabe, falls das Projekt aus einer Gruppenauslosung entstand
    const groupsInfo = document.getElementById('project-groups-info');
    groupsInfo.innerHTML = '';
    if (p.groups && p.groups.length) {
      const wrap = document.createElement('div');
      wrap.className = 'group-result';
      p.groups.forEach((g, i) => {
        const box = document.createElement('div');
        box.className = 'group-box';
        const h = document.createElement('h4');
        const label = (p.groupNames && p.groupNames[i]) ? ` – ${p.groupNames[i]}` : '';
        h.textContent = `Gruppe ${i + 1}${label} `;
        const input = document.createElement('input');
        input.className = 'grade';
        input.placeholder = 'Note';
        input.title = 'Note für die ganze Gruppe – wird allen Mitgliedern zugewiesen';
        // Wenn alle Mitglieder dieselbe Note haben, diese anzeigen
        const memberGrades = g.map(sid => p.grades[sid] || '');
        if (memberGrades.length && memberGrades.every(x => x && x === memberGrades[0])) input.value = memberGrades[0];
        input.addEventListener('change', () => {
          g.forEach(sid => { if (input.value.trim()) p.grades[sid] = input.value.trim(); });
          this.persist();
          this.renderProjectDetail();
        });
        h.appendChild(input);
        const ul = document.createElement('ul');
        g.forEach(sid => {
          const s = cls.students.find(x => x.id === sid);
          if (!s) return;
          const li = document.createElement('li');
          const nameSpan = document.createElement('span');
          nameSpan.textContent = this.studentName(s) + ' ';
          const single = document.createElement('input');
          single.className = 'grade single';
          single.placeholder = '·';
          single.title = `Einzelnote für ${this.studentName(s)} – überschreibt die Gruppennote`;
          single.value = p.grades[s.id] || '';
          single.addEventListener('change', () => {
            if (single.value.trim()) p.grades[s.id] = single.value.trim();
            else delete p.grades[s.id];
            this.persist();
            this.renderGradeTable();
            document.getElementById('grade-summary').textContent = this.summaryText(p);
          });
          li.append(nameSpan, single);
          ul.appendChild(li);
        });
        box.append(h, ul);
        wrap.appendChild(box);
      });
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Gruppennote eintragen → sie gilt für alle Mitglieder. Soll ein einzelner Schüler abweichen (z. B. Gruppe Note 1, ein Schüler Note 2), trägst du seine Note einfach in das Feld neben seinem Namen ein.';
      groupsInfo.append(hint, wrap);
    }

    this.renderGradeTable();
    document.getElementById('grade-summary').textContent = this.summaryText(p);
  },

  summaryText(p) {
    const graded = Object.values(p.grades).filter(g => g && String(g).trim()).length;
    const avg = this.projectAverage(p);
    return `${graded} von ${this.currentClass().students.length} benotet${avg ? ` · Schnitt: ${avg}` : ''}`;
  },

  renderGradeTable() {
    const cls = this.currentClass(), p = this.currentProject();
    const table = document.getElementById('grade-table');
    table.innerHTML = '<tr><th class="num">Nr.</th><th>Name</th><th>Note</th><th class="gname">Gruppe</th></tr>';
    const groupOf = {};
    (p.groups || []).forEach((g, i) => g.forEach(sid => groupOf[sid] = i + 1));
    cls.students.forEach((s, i) => {
      const tr = document.createElement('tr');
      const tdNum = document.createElement('td');
      tdNum.className = 'num';
      tdNum.textContent = i + 1;
      const tdName = document.createElement('td');
      tdName.textContent = this.studentName(s);
      const tdGrade = document.createElement('td');
      const input = document.createElement('input');
      input.className = 'grade';
      input.value = p.grades[s.id] || '';
      input.addEventListener('change', () => {
        if (input.value.trim()) p.grades[s.id] = input.value.trim();
        else delete p.grades[s.id];
        this.persist();
        document.getElementById('grade-summary').textContent = this.summaryText(p);
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const inputs = [...table.querySelectorAll('input.grade')];
          const next = inputs[inputs.indexOf(input) + 1];
          if (next) next.focus();
        }
      });
      tdGrade.appendChild(input);
      const tdGroup = document.createElement('td');
      tdGroup.className = 'gname';
      tdGroup.textContent = groupOf[s.id] ? `G${groupOf[s.id]}` : '';
      tr.append(tdNum, tdName, tdGrade, tdGroup);
      table.appendChild(tr);
    });
  },

  exportProjectCsv() {
    const cls = this.currentClass(), p = this.currentProject();
    if (!p) return;
    let csv = 'Nr;Name;Note\n';
    cls.students.forEach((s, i) => {
      csv += `${i + 1};${this.studentName(s)};${p.grades[s.id] || ''}\n`;
    });
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cls.name}-${p.name}.csv`.replace(/[^\wäöüÄÖÜß.-]+/g, '_');
    a.click();
    URL.revokeObjectURL(a.href);
  },

  /* ---------- Gruppen ---------- */
  makeGroups() {
    const cls = this.currentClass();
    if (!cls.students.length) { alert('Diese Klasse hat noch keine Schüler.'); return; }
    const n = parseInt(document.getElementById('group-n').value, 10);
    if (!n || n < 1) return;
    const mode = document.getElementById('group-mode').value;
    const ids = cls.students.map(s => s.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const count = mode === 'count' ? Math.min(n, ids.length) : Math.max(1, Math.round(ids.length / n));
    const groups = Array.from({ length: count }, () => []);
    ids.forEach((id, i) => groups[i % count].push(id));
    this.pendingGroups = groups;
    this.renderGroupResult();
  },

  renderGroupResult() {
    const cls = this.currentClass();
    const wrap = document.getElementById('group-result');
    document.getElementById('btn-save-groups').hidden = !this.pendingGroups;
    wrap.innerHTML = '';
    if (!this.pendingGroups) return;
    this.pendingGroups.forEach((g, i) => {
      const box = document.createElement('div');
      box.className = 'group-box';
      const h = document.createElement('h4');
      h.textContent = `Gruppe ${i + 1}`;
      const ul = document.createElement('ul');
      g.forEach(sid => {
        const s = cls.students.find(x => x.id === sid);
        if (!s) return;
        const li = document.createElement('li');
        li.textContent = this.studentName(s);
        ul.appendChild(li);
      });
      box.append(h, ul);
      wrap.appendChild(box);
    });
  },

  saveGroupsAsProject() {
    if (!this.pendingGroups) return;
    const name = prompt('Name des Projekts (z. B. „Bandklassen-Projekt“):');
    if (!name) return;
    this.createProject(name.trim(), new Date().toISOString().slice(0, 10), this.pendingGroups);
    this.pendingGroups = null;
    this.renderGroupResult();
    // Zum Projekte-Tab wechseln, damit direkt benotet werden kann
    document.querySelector('[data-subtab="projekte"]').click();
  },

  /* ---------- Gruppen-Import aus PDF ---------- */
  /* Liest eine zweispaltige Tabelle „Gruppe | Produkt/Thema“: links Namen
     (kommagetrennt, ggf. über mehrere Zeilen), rechts Produkt und evtl. getippte Note.
     Neue Tabellenzeile = rechts steht wieder Text, nachdem die Namensliste
     der vorigen Gruppe abgeschlossen war (letzte Zeile ohne Komma). */
  async extractGroupsFromPdf(file) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const groups = [];
    let title = '';
    let cur = null;
    let curClosed = true;

    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const pageWidth = page.getViewport({ scale: 1 }).width;
      // Spaltengrenze: x-Position der Überschrift „Produkt“/„Thema“, sonst 55 % der Seitenbreite
      let split = pageWidth * 0.55;
      for (const item of content.items) {
        if (/^\s*(produkt|thema|note)\b/i.test(item.str)) { split = item.transform[4] - 5; break; }
      }
      // Textstücke zu Zeilen gruppieren
      const rows = new Map();
      for (const item of content.items) {
        if (!item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push(item);
      }
      const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => {
        items.sort((a, b) => a.transform[4] - b.transform[4]);
        const left = items.filter(i => i.transform[4] < split).map(i => i.str.trim()).join(' ').trim();
        const right = items.filter(i => i.transform[4] >= split).map(i => i.str.trim()).join(' ').trim();
        return { left, right };
      });

      for (const line of lines) {
        if (/gruppe\s*\(|vor-\s*und\s*nachnamen|^\s*(produkt|thema|note)\s*$/i.test(line.left + ' ' + line.right)) continue;
        if (line.right && curClosed) {
          if (cur) groups.push(cur);
          cur = { namesRaw: [], product: line.right };
          curClosed = false;
        } else if (line.right && cur) {
          cur.product += ' ' + line.right; // mehrzeiliger Produktname
        }
        if (line.left) {
          if (!cur) { if (!title) title = line.left; continue; } // Titelzeile vor der Tabelle
          cur.namesRaw.push(line.left);
          curClosed = !/,\s*$/.test(line.left); // Zeile ohne Schlusskomma beendet die Namensliste
        }
      }
    }
    if (cur) groups.push(cur);

    return {
      title,
      groups: groups.map(g => {
        let chunks = g.namesRaw.join(',').split(',').map(s => s.trim()).filter(Boolean);
        // Einzelwörter verwerfen, die in einem anderen Namen derselben Gruppe stecken (Tippfehler-Duplikate)
        chunks = chunks.filter((c, i) =>
          c.includes(' ') || !chunks.some((o, j) => j !== i && o.toLowerCase().includes(c.toLowerCase())));
        let product = g.product.trim();
        let grade = '';
        const m = product.match(/\s([1-6](?:[.,]\d)?[+-]?)$/); // getippte Note am Ende
        if (m) { grade = m[1]; product = product.slice(0, m.index).trim(); }
        return { product, grade, names: chunks };
      }).filter(g => g.names.length),
    };
  },

  _capitalize(s) {
    return s.replace(/(^|[\s-])(\p{Ll})/gu, (_, p, c) => p + c.toUpperCase());
  },

  /* Namen der Klassenliste zuordnen; Unbekannte werden unten angehängt */
  findOrCreateStudent(cls, nameStr, created) {
    const n = this.parseName(nameStr);
    if (!n || !n.last) return null;
    const norm = s => (s || '').toLowerCase().trim();
    let s = cls.students.find(x => norm(x.last) === norm(n.last) &&
      (norm(x.first) === norm(n.first) || norm(x.first).startsWith(norm(n.first)) || norm(n.first).startsWith(norm(x.first))));
    if (!s) {
      s = { id: Store.uid(), first: this._capitalize(n.first), last: this._capitalize(n.last) };
      cls.students.push(s);
      created.push(this.studentName(s));
    }
    return s.id;
  },

  saveImportedGroups() {
    const cls = this.currentClass();
    if (!cls) return;
    const name = document.getElementById('group-import-name').value.trim() || 'Importiertes Projekt';
    const date = document.getElementById('group-import-date').value || new Date().toISOString().slice(0, 10);
    const created = [];
    const groups = [], groupNames = [], grades = {};
    for (const line of document.getElementById('group-import-text').value.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split('|');
      if (parts.length < 3) { alert(`Zeile hat nicht das Format „Produkt | Note | Namen“:\n${line}`); return; }
      const product = parts[0].trim();
      const grade = parts[1].trim().replace(/^-$/, '');
      const ids = parts.slice(2).join('|').split(',').map(s => s.trim()).filter(Boolean)
        .map(nm => this.findOrCreateStudent(cls, nm, created)).filter(Boolean);
      if (!ids.length) continue;
      groups.push(ids);
      groupNames.push(product);
      if (grade) ids.forEach(id => grades[id] = grade);
    }
    if (!groups.length) { alert('Keine Gruppen gefunden.'); return; }
    const p = { id: Store.uid(), name, date, entered: false, grades, groups, groupNames };
    cls.projects.push(p);
    this.currentProjectId = p.id;
    this.persist();
    document.getElementById('group-import-preview').hidden = true;
    this.renderClassList();
    this.renderStudents();
    this.renderProjects();
    if (created.length) alert(`Neu in die Klassenliste aufgenommen (unten angehängt):\n${created.join('\n')}`);
    document.querySelector('[data-subtab="projekte"]').click();
  },

  /* ---------- Sitzplan ---------- */
  async renderSeatplan() {
    const view = document.getElementById('seatplan-view');
    const delBtn = document.getElementById('btn-delete-seatplan');
    if (this.seatplanUrl) { URL.revokeObjectURL(this.seatplanUrl); this.seatplanUrl = null; }
    view.innerHTML = '';
    const entry = await Store.getSeatplan(this.currentClassId);
    delBtn.hidden = !entry;
    if (!entry) {
      view.innerHTML = '<p class="hint">Noch kein Sitzplan hochgeladen. Der Plan wird lokal im Browser gespeichert.</p>';
      return;
    }
    this.seatplanUrl = URL.createObjectURL(entry.blob);
    if (entry.type === 'application/pdf') {
      const iframe = document.createElement('iframe');
      iframe.src = this.seatplanUrl;
      iframe.title = 'Sitzplan';
      view.appendChild(iframe);
    } else {
      const img = document.createElement('img');
      img.src = this.seatplanUrl;
      img.alt = 'Sitzplan';
      view.appendChild(img);
    }
  },
};
