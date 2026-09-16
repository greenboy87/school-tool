/* Klassenverwaltung: Schülerlisten, Projekte/Noten, Gruppen, Sitzplan */
const Classes = {
  data: null,
  currentClassId: null,
  currentProjectId: null,
  pendingGroups: null,
  seatplanUrl: null,

  init() {
    this.data = Store.load();

    // Klassen aus früheren Versionen um Schuljahr, Jahrgangsstufe und Stunden ergänzen
    let migrated = false;
    if (!this.data.migrations) this.data.migrations = {};
    // Einmalig: Start mit dem laufenden Schuljahr, auch für vorher angelegte Klassen
    if (!this.data.migrations.startYear) {
      this.data.classes.forEach(c => c.year = this.currentSchoolYear());
      this.data.migrations.startYear = true;
      migrated = true;
    }
    for (const c of this.data.classes) {
      if (!c.year) { c.year = this.currentSchoolYear(); migrated = true; }
      if (c.grade === undefined) { c.grade = this.gradeFromName(c.name); migrated = true; }
      if (!c.lessons) { c.lessons = {}; migrated = true; }
    }
    if (migrated) this.persist();

    if (!this.SHOW_YEARS) {
      document.querySelector('.year-filter').hidden = true;
      document.getElementById('new-class-year').hidden = true;
      document.getElementById('btn-carry-class').hidden = true;
    }

    document.getElementById('new-class-year').value = this.currentSchoolYear();
    document.getElementById('form-new-class').addEventListener('submit', e => {
      e.preventDefault();
      const input = document.getElementById('new-class-name');
      const yearEl = document.getElementById('new-class-year');
      const name = input.value.trim();
      if (!name) return;
      const cls = {
        id: Store.uid(), name,
        // Jahrgangsstufe steckt im Namen („9c“ → 9); sie steuert nur die Themenvorschläge
        grade: this.gradeFromName(name),
        year: yearEl.value.trim() || this.currentSchoolYear(),
        students: [], projects: [], lessons: {},
      };
      this.data.classes.push(cls);
      this.persist();
      input.value = '';
      this.yearFilter = cls.year;
      this.selectClass(cls.id);
    });

    document.getElementById('year-filter').addEventListener('change', e => {
      this.yearFilter = e.target.value;
      this.renderClassList();
    });

    document.getElementById('btn-carry-class').addEventListener('click', () => this.carryToNextYear());

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
    document.getElementById('btn-print-students').addEventListener('click', () => this.printStudents());
    document.getElementById('btn-export-students').addEventListener('click', () => this.exportStudents());
    document.getElementById('btn-clear-students').addEventListener('click', () => {
      const cls = this.currentClass();
      if (!cls) return;
      if (!cls.students.length) { alert('Die Liste ist schon leer.'); return; }
      if (!confirm(`Alle ${cls.students.length} Schüler aus „${cls.name}“ entfernen?\n\n` +
        'Projekte und Stunden der Klasse bleiben erhalten; bereits vergebene Noten ' +
        'verlieren aber ihre Zuordnung.')) return;
      cls.students = [];
      this.persist();
      this.renderClassList();
      this.renderStudents();
      this.renderProjects();
    });

    for (const [id, pos] of [['medien-1', 0], ['medien-2', 1]]) {
      const sel = document.getElementById(id);
      if (!sel) continue;
      sel.addEventListener('change', () => {
        const cls = this.currentClass();
        if (!cls) return;
        const liste = this.medien(cls);
        liste[pos] = sel.value || '';
        // Derselbe Schueler zweimal waere ein Versehen – den anderen freigeben
        const andere = pos === 0 ? 1 : 0;
        if (sel.value && liste[andere] === sel.value) liste[andere] = '';
        this.persist();
        this.fuelleMedienmanager();
      });
    }

    const ordnenKnopf = document.getElementById('btn-klassen-ordnen');
    if (ordnenKnopf) {
      ordnenKnopf.addEventListener('click', () => {
        this.klassenOrdnen = !this.klassenOrdnen;
        this.renderClassList();
      });
      document.getElementById('btn-klassen-az').addEventListener('click', () => {
        if (!confirm('Klassen natürlich sortieren?\n\n5a vor 5b vor 6a vor 10a. ' +
          'Eine von Hand gesetzte Reihenfolge geht dabei verloren.')) return;
        this.data.classes.sort((a, b) =>
          this.vergleicheSchluessel(this.klassenOrdnung(a.name), this.klassenOrdnung(b.name)));
        this.persist();
        this.renderClassList();
      });
    }

    // Suche ueber alle Klassen hinweg
    const suchfeld = document.getElementById('schueler-suche');
    if (suchfeld) {
      suchfeld.addEventListener('input', () => this.sucheSchueler());
      // Esc raeumt die Trefferliste weg, ohne das Feld erst leeren zu muessen
      suchfeld.addEventListener('keydown', e => {
        if (e.key === 'Escape') { suchfeld.value = ''; this.sucheSchueler(); }
      });
    }

    // Klassenleitung: zwei Felder mit Kuerzeln, „WW/PG“ ist erlaubt
    for (const [id, feld] of [['kl-haupt', 'kl'], ['kl-co', 'co']]) {
      const el = document.getElementById(id);
      if (!el) continue;
      const uebernehmen = () => {
        const cls = this.currentClass();
        if (!cls) return;
        if (!cls.leitung) cls.leitung = {};
        cls.leitung[feld] = el.value.trim();
        this.persist();
        this.zeigeLeitungsNamen();
        this.renderClassList();
      };
      el.addEventListener('input', uebernehmen);
      // Wer den Namen tippt statt des Kürzels, soll nicht ins Leere laufen:
      // beim Verlassen des Feldes wird ein eindeutiger Name zum Kürzel
      el.addEventListener('change', () => {
        const kuerzel = this.kuerzelZuName(el.value);
        if (kuerzel) el.value = kuerzel;
        uebernehmen();
      });
    }

    // Lehrkraefte-Liste
    const lsuche = document.getElementById('lehrer-suche');
    if (lsuche) {
      lsuche.addEventListener('input', () => this.renderLehrer());
      lsuche.addEventListener('keydown', e => {
        if (e.key === 'Escape') { lsuche.value = ''; this.renderLehrer(); }
      });
    }
    const lsort = document.getElementById('lehrer-sortierung');
    if (lsort) lsort.addEventListener('change', () => {
      localStorage.setItem('lehrer-sortierung', lsort.value);
      this.renderLehrer();
    });
    const lrolle = document.getElementById('lehrer-rolle');
    if (lrolle) lrolle.addEventListener('change', () => {
      localStorage.setItem('lehrer-rolle', lrolle.value);
      this.renderLehrer();
    });
    const lband = document.getElementById('lehrer-nur-band');
    if (lband) lband.addEventListener('change', () => {
      localStorage.setItem('lehrer-nur-band', lband.checked ? '1' : '0');
      this.renderLehrer();
    });

    document.getElementById('student-file').addEventListener('change', e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) this.handleStudentFile(file);
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
    document.getElementById('btn-print-project').addEventListener('click', () => this.printProject());
    document.getElementById('btn-export-project').addEventListener('click', () => this.exportProjectCsv());

    // Gruppen
    document.getElementById('btn-make-groups').addEventListener('click', () => this.makeGroups());
    document.getElementById('btn-save-groups').addEventListener('click', () => this.saveGroupsAsProject());

    // Gruppen von Hand zusammenstellen
    document.getElementById('btn-add-manual-group').addEventListener('click', () => {
      this.manualGroups.push({ name: '', members: ['', '', '', ''] });
      this.renderManualGroups();
    });
    document.getElementById('btn-save-manual').addEventListener('click', () => this.saveManualGroups());

    // Gruppen-Import aus PDF: erst lokal (kostenlos), bei Bedarf per KI
    document.getElementById('groups-pdf').addEventListener('change', e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) this.handleGroupsFile(file);
    });

    document.getElementById('btn-ai-import').addEventListener('click', () => {
      if (!this.pendingGroupFile) return;
      if (!AiImport.getKey()) {
        alert('Bitte zuerst unter „KI-Import einrichten“ einen API-Schlüssel hinterlegen.');
        return;
      }
      this.runAiImport();
    });

    // API-Schlüssel verwalten
    const keyInput = document.getElementById('ai-key');
    const keyStatus = document.getElementById('ai-key-status');
    if (AiImport.getKey()) { keyInput.value = AiImport.getKey(); keyStatus.textContent = 'Schlüssel gespeichert.'; }
    document.getElementById('btn-ai-key-save').addEventListener('click', () => {
      AiImport.setKey(keyInput.value);
      keyStatus.textContent = AiImport.getKey() ? 'Schlüssel gespeichert.' : 'Schlüssel entfernt.';
    });
    document.getElementById('btn-group-import-cancel').addEventListener('click', () => {
      document.getElementById('group-import-preview').hidden = true;
    });
    document.getElementById('btn-group-import-save').addEventListener('click', () => this.saveImportedGroups());

    // Sitzplan
    document.getElementById('seatplan-file').addEventListener('change', e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) this.handleSeatplanFile(file);
    });

    // Dateien lassen sich auch einfach in den jeweiligen Bereich ziehen
    this.setupDropZones();
    document.getElementById('btn-delete-seatplan').addEventListener('click', async () => {
      if (!confirm('Sitzplan entfernen?')) return;
      await Store.deleteSeatplan(this.currentClassId);
      this.renderSeatplan();
    });

    this.renderLehrer();
    this.renderClassList();
    this.renderDetail();
  },

  persist() { Store.save(this.data); },

  /* ---------- Dateien: Auswahl-Dialog und Ziehen führen hierher ---------- */
  async handleStudentFile(file) {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
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
  },

  async handleGroupsFile(file) {
    this.pendingGroupFile = file;
    document.getElementById('btn-ai-import').hidden = false;
    try {
      const { title, groups } = await this.extractGroupsFromPdf(file);
      if (!groups.length) throw new Error('leer');
      this.showGroupPreview(
        title || file.name.replace(/\.pdf$/i, ''),
        groups.map(g => `${g.product || 'Gruppe'} | ${g.grade || '-'} | ${g.names.join(', ')}`),
        `${groups.length} Gruppen mit insgesamt ${groups.reduce((a, g) => a + g.names.length, 0)} Namen erkannt. ` +
        'Falls etwas fehlt (z. B. handschriftliche Noten): „Mit KI auslesen“.');
    } catch (err) {
      // Kein Text auslesbar → gescannt oder handschriftlich
      if (AiImport.getKey()) {
        if (confirm('In der PDF ist kein auslesbarer Text (vermutlich gescannt oder handschriftlich).\n\n' +
          'Mit KI auslesen? Das PDF wird dazu an die Claude-API gesendet.')) this.runAiImport();
      } else {
        alert('In der PDF ist kein auslesbarer Text (vermutlich gescannt oder handschriftlich).\n\n' +
          'Solche Dokumente kann der KI-Import auswerten – dafür unten unter „KI-Import einrichten“ ' +
          'einen API-Schlüssel hinterlegen.');
      }
    }
  },

  async handleSeatplanFile(file) {
    if (!this.currentClassId) return;
    await Store.putSeatplan(this.currentClassId, file);
    this.renderSeatplan();
  },

  /* ---------- Dateien per Ziehen ablegen ---------- */
  setupDropZones() {
    // Verhindert, dass der Browser eine daneben abgelegte Datei einfach öffnet
    ['dragover', 'drop'].forEach(ev =>
      document.addEventListener(ev, e => e.preventDefault()));

    const isPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    this.makeDropZone(document.getElementById('subtab-schueler'),
      f => isPdf(f) || /\.(txt|csv)$/i.test(f.name),
      'PDF, TXT oder CSV mit der Klassenliste',
      f => this.handleStudentFile(f));
    this.makeDropZone(document.getElementById('subtab-projekte'),
      isPdf, 'PDF mit der Gruppeneinteilung',
      f => this.handleGroupsFile(f));
    this.makeDropZone(document.getElementById('subtab-sitzplan'),
      f => isPdf(f) || /^image\//.test(f.type),
      'PDF oder Bild des Sitzplans',
      f => this.handleSeatplanFile(f));
  },

  makeDropZone(el, accepts, hint, onFile) {
    if (!el) return;
    let depth = 0; // zählt Ein-/Austritte, damit Kindelemente das Markieren nicht abbrechen
    el.addEventListener('dragenter', e => {
      if (!this._hasFiles(e)) return;
      e.preventDefault();
      if (++depth === 1) el.classList.add('drop-active');
    });
    el.addEventListener('dragover', e => {
      if (!this._hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    el.addEventListener('dragleave', () => {
      if (--depth <= 0) { depth = 0; el.classList.remove('drop-active'); }
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      el.classList.remove('drop-active');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!accepts(file)) { alert(`„${file.name}“ passt hier nicht.\nErwartet wird: ${hint}.`); return; }
      onFile(file);
    });
  },

  _hasFiles(e) {
    return e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  },

  /* ---------- Schüler per Ziehen umsortieren ---------- */
  startStudentDrag(e, li) {
    if (e.button > 0) return;           // nur linke Maustaste / Finger
    e.preventDefault();
    const ol = document.getElementById('student-list');
    li.classList.add('dragging');
    try { li.setPointerCapture(e.pointerId); } catch (_) { /* ältere Browser */ }

    const onMove = ev => {
      // Vor das erste Element schieben, dessen Mitte unterhalb des Zeigers liegt
      const others = [...ol.querySelectorAll('li:not(.dragging)')];
      const after = others.find(x => {
        const r = x.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (after) ol.insertBefore(li, after);
      else ol.appendChild(li);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      li.classList.remove('dragging');
      this.commitStudentOrder();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  },

  /* Reihenfolge aus dem DOM in die Daten übernehmen */
  commitStudentOrder() {
    const cls = this.currentClass();
    if (!cls) return;
    const order = new Map();
    [...document.querySelectorAll('#student-list li')].forEach((li, i) => order.set(li.dataset.id, i));
    cls.students.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    this.persist();
    this.renderStudents();
  },

  /* ---------- Schuljahr ---------- */
  /* Auf „false“ bleiben Schuljahr-Auswahl, Jahresfeld und die Übernahme ins Folgejahr
     ausgeblendet – das Schuljahr wird trotzdem bei jeder Klasse mitgespeichert.
     Für die Jahresübersicht später einfach auf true setzen. */
  SHOW_YEARS: false,

  /* Der Wechsel passiert im Juli: In den Sommerferien plant man schon das kommende
     Schuljahr. Juli 2026 → „2026/27“, Juni 2026 → „2025/26“. */
  currentSchoolYear(d = new Date()) {
    const y = d.getFullYear();
    const start = d.getMonth() >= 6 ? y : y - 1;
    return `${start}/${String(start + 1).slice(2)}`;
  },

  nextSchoolYear(year) {
    const m = String(year || '').match(/^(\d{4})/);
    const start = m ? parseInt(m[1], 10) + 1 : new Date().getFullYear();
    return `${start}/${String(start + 1).slice(2)}`;
  },

  /* Jahrgangsstufe im Namen: „5c Musik“ → 5. Die Ziffer darf direkt an einem
     Buchstaben kleben („5c“), deshalb keine Wortgrenze. */
  GRADE_RE: /(^|\D)(10|[5-9])(?!\d)/,

  gradeFromName(name) {
    const m = String(name).match(this.GRADE_RE);
    return m ? parseInt(m[2], 10) : null;
  },

  /* Klassennamen hochzählen: „5c Musik“ → „6c Musik“ */
  nextClassName(name, grade) {
    if (!grade || grade >= 10) return name;
    return name.replace(this.GRADE_RE, (_, pre) => pre + (grade + 1));
  },

  carryToNextYear() {
    const cls = this.currentClass();
    if (!cls) return;
    const year = this.nextSchoolYear(cls.year);
    const grade = cls.grade ? Math.min(10, cls.grade + 1) : null;
    const name = this.nextClassName(cls.name, cls.grade);
    if (!confirm(`Kopie für ${year} anlegen?\n\n„${name}“${grade ? ', Jahrgangsstufe ' + grade : ''}\n` +
      `${cls.students.length} Schüler werden übernommen, Stunden und Noten starten neu.\n` +
      `„${cls.name}“ bleibt als Rückblick erhalten.`)) return;
    const copy = {
      id: Store.uid(), name, grade, year,
      students: cls.students.map(s => ({ ...s, id: Store.uid() })),
      projects: [], lessons: {},
    };
    this.data.classes.push(copy);
    this.persist();
    this.yearFilter = year;
    this.selectClass(copy.id);
  },

  years() {
    const set = new Set(this.data.classes.map(c => c.year).filter(Boolean));
    set.add(this.currentSchoolYear());
    return [...set].sort().reverse();
  },
  currentClass() { return this.data.classes.find(c => c.id === this.currentClassId) || null; },
  currentProject() {
    const cls = this.currentClass();
    return cls ? cls.projects.find(p => p.id === this.currentProjectId) || null : null;
  },

  selectClass(id) {
    // Erst die offene Notiz der bisherigen Klasse festschreiben
    if (typeof Notes !== 'undefined') Notes.klassenNotizSichern();
    this.currentClassId = id;
    this.currentProjectId = null;
    this.gruppenBearbeiten = false;
    this.pendingGroups = null;
    this.renderClassList();
    this.renderDetail();
  },

  /* ---------- Lehrkräfte ----------
     Kürzel -> Name, rein zur Anzeige. Die Liste liegt wie alles andere nur im
     Browser dieses Geräts; im Repository hat sie nichts verloren. */
  lehrer() {
    if (!this.data.lehrer || typeof this.data.lehrer !== 'object') this.data.lehrer = {};
    return this.data.lehrer;
  },

  /* Erlaubt „Name; KÜRZEL“, Tabulatoren aus einer Tabelle und „Name   KÜRZEL“.
     Kopfzeilen wie „Lehrkraft  Kürzel“ fallen durch, weil „Kürzel“ nicht
     durchgehend groß geschrieben ist. */
  parseLehrer(text) {
    const gefunden = [];
    for (const zeile of String(text).split(/\r?\n/)) {
      const z = zeile.trim();
      if (!z) continue;
      let name = null, kuerzel = null;
      const teile = z.split(/\s*[;\t]\s*/).filter(Boolean);
      if (teile.length >= 2) {
        kuerzel = teile[teile.length - 1];
        name = teile.slice(0, -1).join('; ');
      } else {
        const m = z.match(/^(.*\S)\s{1,}([A-ZÄÖÜ]{1,6})$/);
        if (m) { name = m[1]; kuerzel = m[2]; }
      }
      if (!name || !kuerzel) continue;
      kuerzel = kuerzel.trim().toUpperCase();
      if (!/^[A-ZÄÖÜ]{1,6}$/.test(kuerzel)) continue;
      gefunden.push({ kuerzel, name: name.trim() });
    }
    return gefunden;
  },

  /* „WW/PG“ steht in der Vorlage für zwei Personen – beide auflösen.
     Ein unbekanntes Kürzel wird als solches gekennzeichnet, statt still zu fehlen. */
  lehrerName(kuerzel) {
    const roh = String(kuerzel || '').trim();
    if (!roh) return '';
    const liste = this.lehrer();
    const teile = roh.split('/').map(t => t.trim()).filter(Boolean);
    const namen = teile.map(t => liste[t.toUpperCase()] || null);
    // Auch wenn KEIN Kürzel bekannt ist, muss etwas dastehen – sonst sieht es
    // aus, als wäre das Feld leer, statt dass die Lehrerliste unvollständig ist
    return teile.map((t, i) => namen[i] || `${t} – nicht in der Liste`).join(' · ');
  },

  /* „Grünig“ oder „grünig, thomas“ -> „GT“. Nur bei genau einem Treffer, sonst
     bliebe offen, wer gemeint ist. Ein bereits gültiges Kürzel bleibt stehen. */
  kuerzelZuName(eingabe) {
    const text = String(eingabe || '').trim().toLowerCase();
    if (!text) return null;
    const liste = this.lehrer();
    if (liste[text.toUpperCase()]) return null;          // ist schon ein Kürzel
    const treffer = Object.keys(liste).filter(k => liste[k].toLowerCase().includes(text));
    return treffer.length === 1 ? treffer[0] : null;
  },

  /* ---------- Klassenleitungen im Block einlesen ----------
     „5a; BU; GT“ – 39 Klassen von Hand einzutippen ist die Art Arbeit, die
     niemand zweimal macht. Klassennamen werden tolerant verglichen, weil die
     Klasse hier „5a Musik“ heißen kann und in der Tabelle nur „5a“. */
  parseLeitungen(text) {
    const zeilen = [];
    for (const roh of String(text).split(/\r?\n/)) {
      const z = roh.trim();
      if (!z || z.startsWith('#')) continue;
      const teile = z.split(/\s*[;\t]\s*/);
      if (teile.length < 2) continue;
      const klasse = teile[0].trim();
      if (!klasse) continue;
      zeilen.push({ klasse, kl: (teile[1] || '').trim(), co: (teile[2] || '').trim() });
    }
    return zeilen;
  },

  normKlasse(name) { return String(name || '').toLowerCase().replace(/[\s_.\-\/]/g, ''); },

  /* Der Kern einer Klassenbezeichnung: „5e_TEC“ -> „5e“, „10f_I/IIIb“ -> „10f“,
     „5a Musik“ -> „5a“. Zweige und Fächer hängen mal hier, mal dort dran –
     verglichen wird deshalb nur der Teil, der die Klasse wirklich benennt.
     Ohne Ziffern (etwa „Deutschklasse“) bleibt der ganze Name stehen. */
  klassenKern(name) {
    const roh = String(name || '').trim().toLowerCase();
    const m = roh.match(/^(\d{1,2})\s*([a-zäöü]?)/);
    return m && m[1] ? m[1] + m[2] : this.normKlasse(roh);
  },

  /* Die Leitungszeile zu einer Klassenbezeichnung – „7a“ findet auch „7a_I“.
     Nur bei genau einem Treffer, sonst bliebe offen, welche Klasse gemeint ist. */
  leitungFuerKlasse(name) {
    const kern = this.klassenKern(name);
    if (!kern) return null;
    const treffer = this.leitungen().filter(z => this.klassenKern(z.klasse) === kern);
    return treffer.length === 1 ? treffer[0] : null;
  },

  /* [{kuerzel, name, rolle}] – fuer die Anzeige an einem Bandmitglied */
  leitungsPersonen(klassenname) {
    const z = this.leitungFuerKlasse(klassenname);
    if (!z) return [];
    const liste = this.lehrer();
    const raus = [];
    for (const [feld, rolle] of [['kl', 'KL'], ['co', 'Co']]) {
      for (const teil of String(z[feld] || '').split('/')) {
        const k = teil.trim().toUpperCase();
        if (k) raus.push({ kuerzel: k, name: liste[k] || '', rolle });
      }
    }
    return raus;
  },

  findeKlasse(name) {
    const gesucht = this.normKlasse(name);
    if (!gesucht) return null;
    const alle = this.data.classes;
    const kern = this.klassenKern(name);
    const treffer = alle.filter(c => this.klassenKern(c.name) === kern);
    return alle.find(c => this.normKlasse(c.name) === gesucht)
        // Nur bei genau einer Klasse mit diesem Kern – sonst bliebe offen,
        // welche gemeint ist, und die Leitung landete in der falschen
        || (treffer.length === 1 ? treffer[0] : null)
        || null;
  },

  /* Die Leitungstabelle der ganzen Schule – unabhaengig davon, welche Klassen
     hier angelegt sind. Nur so steht in der Lehrerliste auch die Leitung einer
     Klasse, die man selbst gar nicht unterrichtet. */
  leitungen() {
    if (!Array.isArray(this.data.leitungen)) this.data.leitungen = [];
    return this.data.leitungen;
  },

  /* Zum Anzeigen reicht die Klasse selbst: „7d_IIIa“ -> „7d“, „5e_TEC“ -> „5e“,
     „10f_I/IIIb“ -> „10f“. Der Zweig dahinter steht in jeder zweiten Zeile und
     macht die Liste unruhig, ohne etwas zu sagen, was man hier braucht.
     Ohne fuehrende Zahl („Deutschklasse“) bleibt der Name, wie er ist. */
  klasseKurz(name) {
    const m = String(name || '').trim().match(/^(\d{1,2})\s*([a-zA-ZäöüÄÖÜ]?)/);
    return m && m[1] ? m[1] + (m[2] || '') : String(name || '').trim();
  },

  /* Alle Leitungen eines Kuerzels: [{klasse, rolle}]. „WW/PG“ in einem Feld
     zaehlt fuer beide Personen. */
  rollenVon(kuerzel) {
    const k = String(kuerzel || '').toUpperCase();
    if (!k) return [];
    const gefunden = [];
    for (const z of this.leitungen()) {
      const passt = feld => String(feld || '').split('/').some(t => t.trim().toUpperCase() === k);
      if (passt(z.kl)) gefunden.push({ klasse: z.klasse, rolle: 'KL' });
      else if (passt(z.co)) gefunden.push({ klasse: z.klasse, rolle: 'Co' });
    }
    return gefunden;
  },

  /* „1. 5a“ bzw. „2. 7c“ – die Ziffer sagt 1. oder 2. Klassenleitung.
     Mehrere Rollen durch · getrennt. */
  rolleZiffer(rolle) { return rolle === 'KL' ? '1' : '2'; },

  rolleVon(kuerzel) {
    return this.rollenVon(kuerzel)
      .map(r => `${this.rolleZiffer(r.rolle)}. ${this.klasseKurz(r.klasse)}`).join(' · ');
  },

  /* Fuer Tooltips und die Suche ausgeschrieben – „1.“ allein findet man nicht */
  rolleLang(kuerzel) {
    return this.rollenVon(kuerzel)
      .map(r => (r.rolle === 'KL' ? '1. Klassenleitung' : '2. Klassenleitung') + ' ' +
                this.klasseKurz(r.klasse))
      .join(' · ');
  },

  /* Klassen natuerlich ordnen: 5a < 5b < 6a < 10a. Ohne fuehrende Zahl
     („Deutschklasse“) ans Ende, dort alphabetisch. */
  klassenOrdnung(klasse) {
    const m = String(klasse || '').match(/^(\d{1,2})\s*([a-zäöü]?)/i);
    if (!m) return [99, String(klasse || '').toLowerCase(), ''];
    return [parseInt(m[1], 10), (m[2] || '').toLowerCase(), ''];
  },

  /* Sortierschluessel fuer „nach Klassenleitung“: erst die Leitenden nach
     Klasse (KL vor Co), dann alle ohne Leitung nach Namen. */
  leitungsSchluessel(kuerzel) {
    const rollen = this.rollenVon(kuerzel);
    if (!rollen.length) return [1, 99, '', 9];
    const erste = rollen[0];
    const o = this.klassenOrdnung(erste.klasse);
    return [0, o[0], o[1], erste.rolle === 'KL' ? 0 : 1];
  },

  vergleicheSchluessel(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i], y = b[i];
      if (x === y) continue;
      if (typeof x === 'number' && typeof y === 'number') return x - y;
      return String(x).localeCompare(String(y), 'de');
    }
    return 0;
  },

  /* Einmal im Schuljahr von Hand aufgerufen (Konsole), nicht ueber die
     Oberflaeche: Die Listen aendern sich einmal jaehrlich, ein Eingabefeld
     dafuer stuende das ganze Jahr ungenutzt im Reiter herum.
       Classes.listenEinlesen(lehrerText, leitungsText)
     Format: „Name; KUERZEL“ bzw. „Klasse; KL; Co“, eine Zeile je Eintrag. */
  listenEinlesen(lehrerText, leitungsText) {
    const bericht = {};
    if (lehrerText) {
      const liste = this.lehrer();
      const gefunden = this.parseLehrer(lehrerText);
      for (const e of gefunden) liste[e.kuerzel] = e.name;
      bericht.lehrkraefte = Object.keys(liste).length;
    }
    if (leitungsText) {
      const zeilen = this.parseLeitungen(leitungsText);
      this.data.leitungen = zeilen;
      bericht.leitungen = zeilen.length;
      // Die eigenen Klassen bekommen ihre Leitung zusaetzlich direkt eingetragen
      let gesetzt = 0;
      for (const z of zeilen) {
        const cls = this.findeKlasse(z.klasse);
        if (!cls) continue;
        cls.leitung = { kl: z.kl, co: z.co };
        gesetzt++;
      }
      bericht.eigeneKlassen = gesetzt;
    }
    this.persist();
    this.renderLehrer();
    this.renderClassList();
    this.zeigeLeitungsNamen();
    return bericht;
  },

  /* Sortierung merkt sich das Geraet – sie jedes Mal neu zu waehlen nervt */
  lehrerSortierung() { return localStorage.getItem('lehrer-sortierung') || 'name'; },

  /* „alle“, „1“ (1. Klassenleitung) oder „2“ (Co) – merkt sich das Geraet */
  lehrerRolle() { return localStorage.getItem('lehrer-rolle') || 'alle'; },

  lehrerNurBand() { return localStorage.getItem('lehrer-nur-band') === '1'; },

  renderLehrer() {
    const box = document.getElementById('lehrer-liste');
    if (!box) return;
    const liste = this.lehrer();
    const alle = Object.keys(liste);

    const feld = document.getElementById('lehrer-suche');
    const suche = (feld ? feld.value : '').trim().toLowerCase();
    const wahl = document.getElementById('lehrer-sortierung');
    if (wahl && wahl.value !== this.lehrerSortierung()) wahl.value = this.lehrerSortierung();
    const sortierung = this.lehrerSortierung();

    const rollenWahl = document.getElementById('lehrer-rolle');
    if (rollenWahl && rollenWahl.value !== this.lehrerRolle()) rollenWahl.value = this.lehrerRolle();
    const rollenFilter = this.lehrerRolle();

    const bandHaken = document.getElementById('lehrer-nur-band');
    if (bandHaken) bandHaken.checked = this.lehrerNurBand();
    const nurBand = this.lehrerNurBand();

    // Gesucht wird ueber alles, was in der Zeile steht: Kuerzel, Name und Rolle.
    // „5a“ findet damit die Leitung genauso wie „KL“ alle Klassenleitungen.
    // Gesucht wird auch ueber die volle Klassenbezeichnung, obwohl nur die
    // kurze dasteht – „7d_IIIa“ aus einem Aushang soll trotzdem treffen
    const zeile = k => `${k} ${liste[k]} ${this.rolleVon(k)} ${this.rolleLang(k)} ` +
      this.rollenVon(k).map(r => r.klasse).join(' ');
    let gezeigt = suche ? alle.filter(k => zeile(k).toLowerCase().includes(suche)) : alle.slice();
    if (rollenFilter !== 'alle') {
      const gesucht = rollenFilter === '1' ? 'KL' : 'Co';
      gezeigt = gezeigt.filter(k => this.rollenVon(k).some(r => r.rolle === gesucht));
    }
    if (nurBand && typeof Band !== 'undefined') {
      // Nur wer eine Klasse leitet, aus der jemand in Band oder Technik ist –
      // genau die Kollegen, mit denen man wegen Proben und Auftritten zu tun hat
      const klassen = Band.klassenMitMitgliedern();
      gezeigt = gezeigt.filter(k =>
        this.rollenVon(k).some(r => klassen.has(this.klassenKern(r.klasse))));
    }

    gezeigt.sort((a, b) => sortierung === 'klasse'
      ? this.vergleicheSchluessel(
          [...this.leitungsSchluessel(a), liste[a]],
          [...this.leitungsSchluessel(b), liste[b]])
      : liste[a].localeCompare(liste[b], 'de'));

    const zahl = document.getElementById('lehrer-zahl');
    const eingegrenzt = suche || rollenFilter !== 'alle' || nurBand;
    if (zahl) zahl.textContent = eingegrenzt ? `${gezeigt.length} von ${alle.length}` : String(alle.length);

    box.innerHTML = '';
    if (!alle.length) {
      box.innerHTML = '<p class="hint">Noch keine Lehrkräfte hinterlegt.</p>';
    } else if (!gezeigt.length) {
      box.innerHTML = '<p class="hint">Keine Lehrkraft passt zur Auswahl.</p>';
    } else {
      const ul = document.createElement('ul');
      ul.className = 'lehrer-spalten';
      for (const k of gezeigt) {
        const li = document.createElement('li');
        const kz = document.createElement('strong');
        kz.textContent = k;
        // Der Name als eigene Zelle, sonst kann das Raster ihn nicht ausrichten
        const nm = document.createElement('span');
        nm.className = 'lehrer-name';
        nm.textContent = liste[k];
        li.append(kz, nm);
        li.title = liste[k];
        const rollen = this.rollenVon(k);
        if (rollen.length) {
          // Die Ziffer als eigenes Abzeichen, nicht als Text: „1" und „2" muss
          // man im Ueberfliegen erkennen, ohne die Klasse mitzulesen
          const tag = document.createElement('span');
          tag.className = 'kl-rolle';
          rollen.forEach((r, i) => {
            if (i) tag.append(' · ');
            const ziffer = document.createElement('b');
            ziffer.className = 'rolle-ziffer rolle-' + this.rolleZiffer(r.rolle);
            ziffer.textContent = this.rolleZiffer(r.rolle);
            ziffer.title = r.rolle === 'KL' ? '1. Klassenleitung' : '2. Klassenleitung';
            tag.append(ziffer, ' ' + this.klasseKurz(r.klasse));
          });
          li.appendChild(tag);
          li.classList.add('hat-leitung');
          li.title = liste[k] + ' – ' + this.rolleLang(k);
        }

        /* Beim Filtern auf Band und Technik auch, um wen es geht: Die Frage
           lautet ja nicht „wer leitet die 7a“, sondern „wen muss ich bei
           Martin Kainz abmelden“. Nur in dieser Ansicht, sonst waere die
           Liste des ganzen Kollegiums doppelt so hoch. */
        if (nurBand && typeof Band !== 'undefined') {
          const gruppen = [];
          for (const r of this.rollenVon(k)) {
            const namen = Band.mitgliederAusKlasse(r.klasse).map(m => m.name);
            if (namen.length) gruppen.push({ klasse: r.klasse, namen });
          }
          /* Ein Name je Zeile: Die Namen tragen selbst ein Komma
             („Bauer, Anna“), nebeneinander waere die Aufzaehlung nicht zu
             entwirren – und untereinander zaehlt man sie mit einem Blick.
             Wer zwei Klassen leitet, bekommt je Klasse eine Ueberschrift. */
          for (const g of gruppen) {
            if (gruppen.length > 1) {
              const kopf = document.createElement('div');
              kopf.className = 'band-klasse';
              kopf.textContent = this.klasseKurz(g.klasse);
              li.appendChild(kopf);
            }
            for (const n of g.namen) {
              const zeile = document.createElement('div');
              zeile.className = 'band-schueler';
              zeile.textContent = n;
              li.appendChild(zeile);
            }
          }
        }
        ul.appendChild(li);
      }
      box.appendChild(ul);
      this.namensspalteMessen(ul);
    }

    // Vorschlagsliste an den beiden Feldern der Klassenleitung – immer vollstaendig,
    // die Suche oben filtert nur die Anzeige
    const dl = document.getElementById('lehrer-kuerzel');
    if (dl) {
      dl.innerHTML = '';
      for (const k of alle.slice().sort()) {
        const o = document.createElement('option');
        o.value = k;
        o.label = liste[k];
        dl.appendChild(o);
      }
    }
    // Frisch gezeichnete Liste muss den gemerkten Klappzustand uebernehmen
    if (window.Einklappen) Einklappen.anwenden('lehrer');
  },

  /* Die Namensspalte so breit machen wie der laengste angezeigte Name – keinen
     Millimeter mehr. Eine feste Breite muesste auf den laengsten denkbaren
     Namen ausgelegt sein und liesse bei allen anderen eine Luecke stehen.
     Gemessen wird auf einem Canvas mit derselben Schrift wie die Liste. */
  namensspalteMessen(ul) {
    const namen = [...ul.querySelectorAll('.lehrer-name')];
    if (!namen.length) return;
    const stil = getComputedStyle(namen[0]);
    const schrift = `${stil.fontWeight} ${stil.fontSize} ${stil.fontFamily}`;
    const mess = this._messCanvas || (this._messCanvas = document.createElement('canvas'));
    const ctx = mess.getContext('2d');
    ctx.font = schrift;
    let breit = 0;
    for (const n of namen) breit = Math.max(breit, ctx.measureText(n.textContent).width);
    // Ein Hauch Zuschlag gegen Rundungsfehler, sonst kuerzt der laengste Name
    const namensbreite = Math.ceil(breit + 2);
    ul.style.setProperty('--namensspalte', namensbreite + 'px');

    /* Und daraus die Spaltenbreite: Eine feste Breite von 25rem war auf den
       breitesten denkbaren Eintrag ausgelegt – damit passten nur zwei Spalten
       nebeneinander und die Liste wurde ueber 1100px hoch, obwohl das Fenster
       Platz gehabt haette. Gerechnet wird aus dem, was wirklich dasteht. */
    const zeile = ul.querySelector('li');
    const stilZ = zeile ? getComputedStyle(zeile) : null;
    const kuerzelBreite = stilZ ? parseFloat(stilZ.gridTemplateColumns) || 40 : 40;
    const luecke = stilZ ? parseFloat(stilZ.columnGap) || 8 : 8;
    /* Die Rollenspalte ist im Raster „1fr“ und dehnt sich auf die Restbreite –
       gemessen kaeme die Breite der Spalte heraus, nicht die des Inhalts.
       Deshalb auch hier den Text messen, plus Zuschlag je Ziffern-Abzeichen. */
    let rolle = 0;
    const erstes = ul.querySelector('.kl-rolle');
    if (erstes) {
      const sr = getComputedStyle(erstes);
      ctx.font = `${sr.fontWeight} ${sr.fontSize} ${sr.fontFamily}`;
      for (const r of ul.querySelectorAll('.kl-rolle')) {
        const abzeichen = r.querySelectorAll('.rolle-ziffer').length;
        rolle = Math.max(rolle, ctx.measureText(r.textContent).width + abzeichen * 10);
      }
    }
    /* Stehen die Bandmitglieder mit darunter, muessen auch deren Namen in die
       Spalte passen – sie beginnen erst bei der Namensspalte, brauchen also
       weniger Platz als eine ganze Zeile. */
    let schueler = 0;
    const ersterS = ul.querySelector('.band-schueler');
    if (ersterS) {
      const ss = getComputedStyle(ersterS);
      ctx.font = `${ss.fontWeight} ${ss.fontSize} ${ss.fontFamily}`;
      const einzug = parseFloat(ss.paddingLeft) + parseFloat(ss.borderLeftWidth) || 10;
      for (const z of ul.querySelectorAll('.band-schueler, .band-klasse')) {
        schueler = Math.max(schueler,
          kuerzelBreite + luecke + einzug + ctx.measureText(z.textContent).width);
      }
    }
    const noetig = Math.max(
      kuerzelBreite + luecke * 2 + namensbreite + Math.ceil(rolle) + 6,
      Math.ceil(schueler) + 6);
    ul.style.columnWidth = Math.max(13 * 16, noetig) + 'px';
  },

  zeigeLeitungsNamen() {
    const cls = this.currentClass();
    for (const [id, feld] of [['kl-haupt', 'kl'], ['kl-co', 'co']]) {
      const el = document.getElementById(id);
      const anzeige = document.getElementById(id + '-name');
      if (!el || !anzeige) continue;
      const wert = (cls && cls.leitung && cls.leitung[feld]) || '';
      if (document.activeElement !== el) el.value = wert;
      // Ohne eingelesene Liste kann gar kein Kürzel bekannt sein – dann ist
      // „nicht in der Liste“ irreführend und schickt auf die falsche Fährte
      const leer = !Object.keys(this.lehrer()).length;
      anzeige.textContent = !wert ? ''
        : leer ? 'Noch keine Lehrerliste – im Reiter „Lehrer“ zu sehen'
        : this.lehrerName(wert);
      anzeige.classList.toggle('unbekannt', /nicht in der Liste|Noch keine Lehrerliste/.test(anzeige.textContent));
    }
  },

  /* Klasse um einen Platz verschieben. Gearbeitet wird im vollen Feld, denn
     der Nachbar in der angezeigten (nach Schuljahr gefilterten) Liste kann
     dort weiter entfernt liegen. */
  verschiebeKlasse(cls, richtung) {
    const alle = this.data.classes;
    const sichtbar = alle.filter(c =>
      this.yearFilter === 'all' || (c.year || '') === this.yearFilter);
    const nachbar = sichtbar[sichtbar.indexOf(cls) + richtung];
    if (!nachbar) return;
    const a = alle.indexOf(cls), b = alle.indexOf(nachbar);
    alle[a] = nachbar;
    alle[b] = cls;
    this.persist();
    this.renderClassList();
  },

  /* ---------- Medienmanager ----------
     Zwei Schueler je Klasse, jederzeit aenderbar. Gespeichert werden die
     Schueler-Kennungen, nicht die Namen – sonst zeigte der Eintrag ins Leere,
     sobald jemand umbenannt wird. */
  medien(cls) {
    if (!Array.isArray(cls.medien)) cls.medien = [];
    return cls.medien;
  },

  fuelleMedienmanager() {
    const cls = this.currentClass();
    for (const [id, pos] of [['medien-1', 0], ['medien-2', 1]]) {
      const sel = document.getElementById(id);
      if (!sel) continue;
      sel.innerHTML = '';
      const leer = document.createElement('option');
      leer.value = '';
      leer.textContent = '—';
      sel.appendChild(leer);
      if (!cls) { sel.value = ''; continue; }
      for (const s of cls.students) {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = this.studentName(s);
        sel.appendChild(o);
      }
      const gewaehlt = this.medien(cls)[pos] || '';
      // Wer die Klasse verlassen hat, faellt still heraus
      sel.value = cls.students.some(s => s.id === gewaehlt) ? gewaehlt : '';
    }
  },

  /* ---------- Suche über alle Klassen ----------
     Beantwortet die Frage „in welcher Klasse ist dieser Schüler?“, ohne dass man
     die Klassen der Reihe nach durchklickt. */
  sucheSchueler() {
    const feld = document.getElementById('schueler-suche');
    const box = document.getElementById('suche-treffer');
    if (!feld || !box) return;
    const suche = feld.value.trim().toLowerCase();
    box.innerHTML = '';
    // Ein einzelner Buchstabe träfe die halbe Schule – erst ab zwei lohnt es
    if (suche.length < 2) { box.hidden = true; return; }

    const treffer = [];
    for (const cls of this.data.classes) {
      for (const s of cls.students) {
        const name = this.studentName(s);
        if (name.toLowerCase().includes(suche)) treffer.push({ cls, s, name });
      }
    }
    treffer.sort((a, b) => a.name.localeCompare(b.name, 'de') ||
                           a.cls.name.localeCompare(b.cls.name, 'de'));

    box.hidden = false;
    if (!treffer.length) {
      const li = document.createElement('li');
      li.className = 'hint';
      li.textContent = 'Kein Schüler gefunden.';
      box.appendChild(li);
      return;
    }
    // Bei einem Allerweltsnamen wird die Liste sonst unübersichtlich lang
    const zuViel = treffer.length - 25;
    for (const t of treffer.slice(0, 25)) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'treffer-name';
      name.textContent = t.name;
      const wo = document.createElement('span');
      wo.className = 'treffer-klasse';
      // In der Trefferzeile den Namen, solange er bekannt ist – sonst das
      // blanke Kürzel, statt die Zeile mit „nicht in der Liste“ zu füllen
      const kl = ((t.cls.leitung || {}).kl || '').trim();
      const leitung = kl ? (this.lehrer()[kl.toUpperCase()] || kl) : '';
      wo.textContent = t.cls.name + (leitung ? ` · KL ${leitung}` : '');
      li.append(name, wo);
      li.addEventListener('click', () => this.springeZuSchueler(t.cls.id, t.s.id));
      box.appendChild(li);
    }
    if (zuViel > 0) {
      const li = document.createElement('li');
      li.className = 'hint';
      li.textContent = `… und ${zuViel} weitere. Tippe mehr Buchstaben.`;
      box.appendChild(li);
    }
  },

  springeZuSchueler(klasseId, schuelerId) {
    // Der Schuljahr-Filter könnte die Klasse ausblenden – dann wäre der Treffer
    // zwar gefunden, die Klasse links aber unsichtbar
    const cls = this.data.classes.find(c => c.id === klasseId);
    if (cls && this.yearFilter !== 'all' && (cls.year || '') !== this.yearFilter) {
      this.yearFilter = 'all';
    }
    this.selectClass(klasseId);
    // Auf den Unterreiter „Schüler“ zurück, sonst landet man im Sitzplan
    const knopf = document.querySelector('.subtab-btn[data-subtab="schueler"]');
    if (knopf && !knopf.classList.contains('active')) knopf.click();
    const zeile = document.querySelector(`#student-list li[data-id="${schuelerId}"]`);
    if (zeile) {
      zeile.classList.add('gefunden');
      zeile.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => zeile.classList.remove('gefunden'), 2500);
    }
  },

  /* ---------- Rendern ---------- */
  renderClassList() {
    // Schuljahr-Auswahl
    const sel = document.getElementById('year-filter');
    if (this.yearFilter === undefined) {
      const cur = this.currentSchoolYear();
      this.yearFilter = !this.SHOW_YEARS ? 'all'
        : (this.data.classes.some(c => c.year === cur) ? cur : 'all');
    }
    sel.innerHTML = '';
    for (const [val, label] of [['all', 'alle'], ...this.years().map(y => [y, y])]) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = label;
      sel.appendChild(o);
    }
    sel.value = this.yearFilter;

    const ul = document.getElementById('class-list');
    ul.innerHTML = '';
    const shown = this.data.classes.filter(c =>
      this.yearFilter === 'all' || (c.year || '') === this.yearFilter);
    const ordnenZeile = document.getElementById('klassen-ordnen-zeile');
    if (ordnenZeile) ordnenZeile.hidden = !this.klassenOrdnen;
    const knopf = document.getElementById('btn-klassen-ordnen');
    if (knopf) {
      knopf.textContent = this.klassenOrdnen ? 'Fertig' : 'Ordnen';
      knopf.classList.toggle('primary', !!this.klassenOrdnen);
    }

    shown.forEach((cls, i) => {
      const li = document.createElement('li');
      li.classList.toggle('active', cls.id === this.currentClassId);
      const name = document.createElement('span');
      name.textContent = cls.name;
      const count = document.createElement('span');
      count.className = 'count';
      const doneCount = Object.values(cls.lessons || {}).filter(e => e.s === 'done').length;
      const kl = ((cls.leitung || {}).kl || '').trim();
      count.textContent = `${cls.students.length} SuS` + (doneCount ? ` · ${doneCount} Std.` : '') +
        (kl ? ` · KL ${kl}` : '');
      if (kl) count.title = 'Klassenleitung: ' + (this.lehrerName(kl) || kl);
      li.append(name, count);
      if (this.klassenOrdnen) {
        /* Verschoben wird im vollen Feld, angezeigt wird die gefilterte Liste –
           der Nachbar im selben Schuljahr kann dort weiter entfernt liegen. */
        const werkzeuge = document.createElement('span');
        werkzeuge.className = 'klassen-pfeile';
        const pfeil = (icon, titel, richtung, aus) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'small';
          b.innerHTML = Icons.raw(icon);
          b.title = titel;
          b.disabled = aus;
          b.addEventListener('click', ev => {
            ev.stopPropagation();          // sonst waehlt der Klick die Klasse aus
            this.verschiebeKlasse(cls, richtung);
          });
          return b;
        };
        werkzeuge.append(
          pfeil('chevronUp', 'Nach oben', -1, i === 0),
          pfeil('chevronDown', 'Nach unten', 1, i === shown.length - 1));
        li.appendChild(werkzeuge);
      }
      li.addEventListener('click', () => this.selectClass(cls.id));
      ul.appendChild(li);
    });
    if (!shown.length) {
      const li = document.createElement('li');
      li.className = 'hint';
      li.textContent = 'Keine Klassen in diesem Schuljahr.';
      ul.appendChild(li);
    }
    if (typeof Tools !== 'undefined') Tools.refreshClassSelect();
  },

  renderDetail() {
    const cls = this.currentClass();
    document.getElementById('class-empty').hidden = !!cls;
    document.getElementById('class-detail').hidden = !cls;
    if (!cls) return;
    const sub = [cls.grade ? `Jgst. ${cls.grade}` : null,
                 this.SHOW_YEARS ? cls.year : null].filter(Boolean).join(' · ');
    document.getElementById('class-title').innerHTML = '';
    document.getElementById('class-title').append(cls.name);
    if (sub) {
      const span = document.createElement('span');
      span.className = 'class-sub';
      span.textContent = sub;
      document.getElementById('class-title').appendChild(span);
    }
    this.zeigeLeitungsNamen();
    this.fuelleMedienmanager();
    if (typeof Notes !== 'undefined') Notes.klassenNotizLaden();
    this.renderStudents();
    this.renderProjects();
    this.renderGroupResult();
    this.renderManualGroups();
    this.renderSeatplan();
    if (typeof Lessons !== 'undefined') Lessons.render();
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
    /* Buchstaben als Unicode-Klasse statt als Handliste: „Doğan“ fiel sonst
       durch, und jede weitere Schreibweise haette man einzeln nachtragen
       muessen – tuerkisch, polnisch, vietnamesisch, was die Klasse so hergibt. */
    const NAME_MIT_KOMMA = /^(\p{L}[\p{L}' -]*,\s*\p{L}[\p{L}' .-]*?)\s*(?:\d.*)?$/u;
    const NUR_NAME = /^[\p{L}][\p{L}' -]*$/u;
    const names = [];
    const ohneKomma = [];          // Zeilen ohne Komma, Reihenfolge noch offen

    for (let roh of lines) {
      if (skip.test(roh)) continue;
      const line = roh.replace(/^\s*\d{1,3}[.)]?\s+/, '').trim();   // laufende Nummer weg
      // „Nachname, Vorname“ – daran ist die Reihenfolge eindeutig
      const m = line.match(NAME_MIT_KOMMA);
      if (m && m[1].includes(',')) { names.push(m[1].trim()); continue; }

      /* Manche Programme drucken „12  Armstroff Jan  5 B“: Nummer vorne,
         Klasse hinten, kein Komma. Beides abschneiden, der Rest ist der Name. */
      if (!/^\s*\d{1,3}[.)]?\s+/.test(roh)) continue;      // ohne Nummer kein Listeneintrag
      const rest = line.replace(/\s+\d{1,2}\s*[A-Za-zÄÖÜ]?(?:[_-][A-Za-z0-9]+)?$/, '').trim();
      const worte = rest.split(/\s+/).filter(Boolean);
      if (worte.length < 2 || worte.length > 4) continue;
      if (!worte.every(w => NUR_NAME.test(w) && /^\p{Lu}/u.test(w))) continue;
      ohneKomma.push(worte);
    }

    if (ohneKomma.length) names.push(...this.nameReihenfolge(ohneKomma));
    return names;
  },

  /* Steht in „Armstroff Jan“ der Nachname vorn oder hinten? Eine Klassenliste
     ist alphabetisch sortiert – also nach der Spalte, die den Nachnamen
     enthaelt. Welche der beiden Aussenspalten besser sortiert ist, gewinnt.
     Ohne klares Bild bleibt es bei „Vorname Nachname“ wie bisher. */
  nameReihenfolge(eintraege) {
    const sortiert = (hole) => {
      let gut = 0, gesamt = 0;
      for (let i = 1; i < eintraege.length; i++) {
        gesamt++;
        if (hole(eintraege[i - 1]).localeCompare(hole(eintraege[i]), 'de') <= 0) gut++;
      }
      return gesamt ? gut / gesamt : 0;
    };
    const vorne = sortiert(w => w[0]);
    const hinten = sortiert(w => w[w.length - 1]);
    const nachnameVorn = vorne >= 0.8 && vorne > hinten;
    return eintraege.map(w => nachnameVorn
      ? `${w[0]}, ${w.slice(1).join(' ')}`
      : `${w[w.length - 1]}, ${w.slice(0, -1).join(' ')}`);
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
      li.dataset.id = s.id;
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.title = 'Zum Umsortieren ziehen';
      handle.innerHTML = Icons.raw('grip');
      handle.addEventListener('pointerdown', ev => this.startStudentDrag(ev, li));
      const span = document.createElement('span');
      span.className = 'sname';
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
      li.append(handle, span, up, down, del);
      ol.appendChild(li);
    });
    if (window.Einklappen) Einklappen.anwenden('schueler');
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
    // Titel ist direkt bearbeitbar, Datum daneben änderbar
    const titel = document.getElementById('project-title');
    titel.innerHTML = '';
    const nameFeld = document.createElement('input');
    nameFeld.type = 'text';
    nameFeld.className = 'cell-input project-name';
    nameFeld.value = p.name;
    nameFeld.title = 'Projektnamen ändern';
    nameFeld.addEventListener('change', () => {
      const neu = nameFeld.value.trim();
      if (!neu) { nameFeld.value = p.name; return; }
      p.name = neu;
      this.persist();
      this.renderProjects();
    });
    const datumFeld = document.createElement('input');
    datumFeld.type = 'date';
    datumFeld.className = 'cell-input project-date';
    datumFeld.value = p.date || '';
    datumFeld.title = 'Datum ändern';
    datumFeld.addEventListener('change', () => {
      p.date = datumFeld.value;
      this.persist();
      this.renderProjects();
    });
    titel.append(nameFeld, datumFeld);

    // Gruppen-Schnelleingabe, falls das Projekt aus einer Gruppenauslosung entstand
    const groupsInfo = document.getElementById('project-groups-info');
    groupsInfo.innerHTML = '';
    if (p.groups && p.groups.length) {
      const bearbeiten = !!this.gruppenBearbeiten;
      const wrap = document.createElement('div');
      wrap.className = 'group-result';
      p.groups.forEach((g, i) => {
        const box = document.createElement('div');
        box.className = 'group-box';
        const h = document.createElement('h4');
        const nr = document.createElement('span');
        nr.className = 'gruppen-nr';
        nr.textContent = `${i + 1}.`;
        // Gruppenname jederzeit änderbar
        const nameFeld = document.createElement('input');
        nameFeld.type = 'text';
        nameFeld.className = 'cell-input gruppen-name';
        nameFeld.value = (p.groupNames && p.groupNames[i]) || '';
        nameFeld.placeholder = `Gruppe ${i + 1}`;
        nameFeld.title = 'Gruppennamen ändern';
        nameFeld.addEventListener('change', () => {
          if (!p.groupNames) p.groupNames = [];
          p.groupNames[i] = nameFeld.value.trim();
          this.persist();
          this.renderProjects();
        });
        h.append(nr, nameFeld);
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
          /* Umhaengen per Auswahlfeld statt per Ziehen: auf dem iPad ist ein
             Select verlaesslich, Drag-and-drop nicht. Im Normalfall steht es
             nicht da – ein Feld hinter jedem Namen macht die Uebersicht
             unlesbar, und umgehaengt wird selten. */
          if (!bearbeiten) { li.append(nameSpan, single); ul.appendChild(li); return; }
          const wohin = document.createElement('select');
          wohin.className = 'small-select gruppen-wechsel';
          wohin.title = `${this.studentName(s)} in eine andere Gruppe verschieben`;
          p.groups.forEach((_, j) => {
            const o = document.createElement('option');
            o.value = String(j);
            o.textContent = String(j + 1);
            wohin.appendChild(o);
          });
          const raus = document.createElement('option');
          raus.value = '';
          raus.textContent = '—';
          wohin.appendChild(raus);
          wohin.value = String(i);
          wohin.addEventListener('change', () => {
            this.verschiebeInGruppe(p, s.id, wohin.value === '' ? null : parseInt(wohin.value, 10));
          });
          li.append(nameSpan, single, wohin);
          ul.appendChild(li);
        });

        // Gruppe aufloesen – die Mitglieder stehen danach unter „Ohne Gruppe“
        if (bearbeiten) {
        const weg = document.createElement('button');
        weg.className = 'small gruppe-weg';
        weg.type = 'button';
        weg.textContent = '×';
        weg.title = 'Diese Gruppe auflösen – die Schüler bleiben in der Klasse';
        weg.addEventListener('click', () => {
          const wieViele = g.length;
          if (wieViele && !confirm(
            `Gruppe ${i + 1} auflösen?\n\n${wieViele} Schüler stehen danach unter „Ohne Gruppe“. ` +
            'Ihre Noten bleiben erhalten.')) return;
          p.groups.splice(i, 1);
          if (p.groupNames) p.groupNames.splice(i, 1);
          this.persist();
          this.renderProjectDetail();
        });
        h.appendChild(weg);
        }
        box.append(h, ul);
        wrap.appendChild(box);
      });
      // Wer in keiner Gruppe steht, muss sichtbar bleiben – sonst geht er
      // beim Umhaengen still verloren
      const drin = new Set(p.groups.flat());
      const offen = cls.students.filter(x => !drin.has(x.id));
      const zeile = document.createElement('p');
      zeile.className = 'hint ohne-gruppe';
      if (offen.length) {
        zeile.append(`Ohne Gruppe (${offen.length}): `);
        offen.forEach((s2, k) => {
          const wahl = document.createElement('select');
          wahl.className = 'small-select';
          wahl.title = `${this.studentName(s2)} einer Gruppe zuordnen`;
          const kopf = document.createElement('option');
          kopf.value = '';
          kopf.textContent = this.studentName(s2);
          wahl.appendChild(kopf);
          p.groups.forEach((_, j) => {
            const o = document.createElement('option');
            o.value = String(j);
            o.textContent = 'in Gruppe ' + (j + 1);
            wahl.appendChild(o);
          });
          wahl.addEventListener('change', () => {
            if (wahl.value !== '') this.verschiebeInGruppe(p, s2.id, parseInt(wahl.value, 10));
          });
          zeile.appendChild(wahl);
          if (k < offen.length - 1) zeile.append(' ');
        });
      } else {
        zeile.textContent = 'Alle Schüler sind einer Gruppe zugeordnet.';
      }

      const neueGruppe = document.createElement('button');
      neueGruppe.type = 'button';
      neueGruppe.className = 'small';
      neueGruppe.textContent = '+ Gruppe';
      neueGruppe.title = 'Leere Gruppe anlegen – Schüler hängst du danach über die Auswahlfelder um';
      neueGruppe.addEventListener('click', () => {
        p.groups.push([]);
        if (!p.groupNames) p.groupNames = [];
        p.groupNames.push('');
        this.persist();
        this.renderProjectDetail();
      });

      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Gruppennote eintragen → sie gilt für alle Mitglieder. Soll ein einzelner Schüler abweichen (z. B. Gruppe Note 1, ein Schüler Note 2), trägst du seine Note einfach in das Feld neben seinem Namen ein.';

      const schalter = document.createElement('button');
      schalter.type = 'button';
      schalter.className = 'small' + (bearbeiten ? ' primary' : '');
      schalter.textContent = bearbeiten ? 'Fertig' : 'Gruppen bearbeiten';
      schalter.title = bearbeiten
        ? 'Bearbeiten beenden – die Auswahlfelder verschwinden wieder'
        : 'Schüler umhängen, Gruppen anlegen oder auflösen';
      schalter.addEventListener('click', () => {
        this.gruppenBearbeiten = !this.gruppenBearbeiten;
        this.renderProjectDetail();
      });

      const knopfzeile = document.createElement('div');
      knopfzeile.className = 'btn-row gruppen-werkzeuge';
      knopfzeile.appendChild(schalter);
      if (bearbeiten) {
        knopfzeile.appendChild(neueGruppe);
        const wie = document.createElement('span');
        wie.className = 'hint';
        wie.textContent = 'Zahl hinter dem Namen hängt um, „—“ nimmt heraus. Noten bleiben am Schüler.';
        knopfzeile.appendChild(wie);
      } else if (offen.length) {
        // Im Ruhezustand keine Auswahlfelder, aber der Hinweis muss bleiben –
        // sonst merkt niemand, dass jemand in keiner Gruppe steht
        const warnung = document.createElement('span');
        warnung.className = 'hint ohne-gruppe-hinweis';
        warnung.textContent = `${offen.length} ohne Gruppe: ` +
          offen.map(x => this.studentName(x)).join(', ');
        knopfzeile.appendChild(warnung);
      }

      groupsInfo.append(hint, wrap, knopfzeile);
      if (bearbeiten) groupsInfo.appendChild(zeile);
    }

    this.renderGradeTable();
    document.getElementById('grade-summary').textContent = this.summaryText(p);
    if (window.Einklappen) Einklappen.anwenden('noten');
  },

  summaryText(p) {
    const graded = Object.values(p.grades).filter(g => g && String(g).trim()).length;
    const avg = this.projectAverage(p);
    return `${graded} von ${this.currentClass().students.length} benotet${avg ? ` · Schnitt: ${avg}` : ''}`;
  },

  /* Schueler in eine andere Gruppe haengen – oder mit null ganz heraus.
     Erst ueberall entfernen, dann einfuegen: sonst stuende er nach einem
     Fehlgriff in zwei Gruppen zugleich. Die Note haengt am Schueler und
     wandert deshalb von selbst mit. */
  verschiebeInGruppe(p, schuelerId, zielIndex) {
    p.groups = p.groups.map(g => g.filter(x => x !== schuelerId));
    if (zielIndex !== null && p.groups[zielIndex]) p.groups[zielIndex].push(schuelerId);
    this.persist();
    this.renderProjectDetail();
  },

  renderGradeTable() {
    const cls = this.currentClass(), p = this.currentProject();
    const table = document.getElementById('grade-table');
    table.innerHTML = '<tr><th class="num">Nr.</th><th>Name</th><th>Note</th><th class="gname">Gruppe</th></tr>';
    // Nummer UND Name: „G1“ allein sagt beim Eintragen in den Notenmanager nicht,
    // um welche Gruppe es geht – der Name steht sonst nur im Gruppen-Reiter
    const groupOf = {};
    (p.groups || []).forEach((g, i) => {
      const name = (p.groupNames && p.groupNames[i] || '').trim();
      g.forEach(sid => groupOf[sid] = name ? `G${i + 1} – ${name}` : `G${i + 1}`);
    });
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
      tdGroup.textContent = groupOf[s.id] || '';
      tr.append(tdNum, tdName, tdGrade, tdGroup);
      table.appendChild(tr);
    });
  },

  /* Notenliste eines Projekts drucken – Gruppen werden mit ausgewiesen */
  printProject() {
    const cls = this.currentClass(), p = this.currentProject();
    if (!cls || !p) return;
    const gruppeVon = {};
    (p.groups || []).forEach((g, i) => g.forEach(sid =>
      gruppeVon[sid] = (p.groupNames && p.groupNames[i]) || 'Gruppe ' + (i + 1)));
    const mitGruppen = Object.keys(gruppeVon).length > 0;

    const spalten = [{ titel: 'Nr.', cls: 'num' }, { titel: 'Name' }];
    if (mitGruppen) spalten.push({ titel: 'Gruppe' });
    spalten.push({ titel: 'Note' });

    const zeilen = cls.students.map((s, i) => {
      const z = [i + 1, `<strong>${Band.esc(this.studentName(s))}</strong>`];
      if (mitGruppen) z.push(Band.esc(gruppeVon[s.id] || ''));
      z.push(p.grades[s.id] ? `<strong>${Band.esc(p.grades[s.id])}</strong>` : '<span class="kastl"></span>');
      return z;
    });

    const schnitt = this.projectAverage(p);
    Band.printHtml(p.name, Band.printTable(spalten, zeilen),
      `${cls.name}${p.date ? ' · ' + new Date(p.date + 'T12:00').toLocaleDateString('de-DE') : ''}` +
      (schnitt ? ` · Schnitt ${schnitt}` : ''));
  },

  /* Klassenliste drucken – mit leeren Spalten zum Abhaken im Unterricht */
  printStudents() {
    const cls = this.currentClass();
    if (!cls) return;
    if (!cls.students.length) { alert('Die Klassenliste ist leer.'); return; }
    // Acht leere Spalten zum Eintragen von Hand; enge Zeilen, damit auch große
    // Klassen auf eine Seite passen.
    const LEERE_SPALTEN = 8;
    const leer = Array.from({ length: LEERE_SPALTEN }, () => ({ titel: '', cls: 'leer' }));
    const tabelle = Band.printTable(
      [{ titel: 'Nr.', cls: 'num' }, { titel: 'Name' }, ...leer],
      cls.students.map((s, i) => [
        i + 1, Band.esc(this.studentName(s)),
        ...Array.from({ length: LEERE_SPALTEN }, () => ''),
      ]), 'kompakt');
    Band.printHtml(cls.name, tabelle,
      `${cls.students.length} Schülerinnen und Schüler` +
      (cls.grade ? ` · Jahrgangsstufe ${cls.grade}` : ''));
  },

  exportStudents() {
    const cls = this.currentClass();
    if (!cls || !cls.students.length) { alert('Die Klassenliste ist leer.'); return; }
    let csv = 'Nr;Name\n';
    cls.students.forEach((s, i) => csv += `${i + 1};${this.studentName(s)}\n`);
    Band.download(csv, `${cls.name}-Klassenliste.csv`.replace(/[^\wäöüÄÖÜß.-]+/g, '_'),
      'text/csv;charset=utf-8');
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
    const p = this.gruppenZiel('', '');
    if (!p) return;
    this.pendingGroups.forEach(ids => {
      p.groups.push(ids);
      p.groupNames.push('Gruppe ' + p.groups.length);
    });
    const anzahl = this.pendingGroups.length;
    this.pendingGroups = null;
    this.persist();
    this.renderGroupResult();
    this.renderProjects();
    this.zeigeProjektErgebnis(anzahl, "group-result");
  },

  /* Gruppen entstehen im Reiter „Gruppen“, das Projekt liegt aber unter
     „Projekte & Noten“. Ohne Rückmeldung sähe es am Knopf so aus, als sei
     nichts passiert – deshalb eine Meldung dort, wo geklickt wurde, samt
     Knopf zum Hinüberwechseln. */
  zeigeProjektErgebnis(anzahlGruppen, untenId) {
    const detail = document.getElementById('project-detail');
    if (!detail || detail.hidden) return;
    const p = this.currentProject();
    if (!p) return;
    const text = anzahlGruppen === 1
      ? `1 Gruppe zu „${p.name}“ hinzugefügt.`
      : `${anzahlGruppen} Gruppen zu „${p.name}“ hinzugefügt.`;

    // 1) Rückmeldung unten, direkt beim Knopf
    const unten = untenId ? document.getElementById(untenId) : null;
    if (unten) {
      const box = document.createElement('div');
      box.className = 'gespeichert-hinweis unten';
      const t = document.createElement('span');
      t.textContent = text + ' Zu finden im Reiter „Projekte & Noten“.';
      const hin = document.createElement('button');
      hin.className = 'small';
      hin.textContent = 'Dorthin wechseln';
      hin.addEventListener('click', () => this.zeigeProjekteReiter());
      box.append(t, hin);
      unten.replaceChildren(box);
    }

    // 2) Meldung oben am Projekt und kurzes Aufblitzen der neuen Gruppen
    const meldung = document.getElementById('project-saved-hint');
    if (meldung) {
      meldung.textContent = text;
      meldung.hidden = false;
      clearTimeout(this._meldungTimer);
      this._meldungTimer = setTimeout(() => { meldung.hidden = true; }, 8000);
    }
    const info = document.getElementById('project-groups-info');
    if (info) {
      info.classList.remove('frisch');
      void info.offsetWidth;             // Animation neu starten
      info.classList.add('frisch');
    }

  },

  /* Nach dem Anlegen von Gruppen: in den Reiter wechseln, wo das Projekt liegt */
  zeigeProjekteReiter() {
    const knopf = document.querySelector('.subtab-btn[data-subtab="projekte"]');
    if (knopf) knopf.click();
    const detail = document.getElementById('project-detail');
    if (detail && !detail.hidden) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  /* Zielprojekt für neu gebildete Gruppen: bestehendes ergänzen oder neues anlegen.
     So lassen sich Gruppen auch nachträglich zu einem Projekt hinzufügen. */
  gruppenZiel(nameVorschlag, datum) {
    const cls = this.currentClass();
    if (!cls) return null;
    const offen = this.currentProject();
    if (offen && confirm(
      `Gruppen zum geöffneten Projekt „${offen.name}“ hinzufügen?\n\n` +
      'Abbrechen: stattdessen ein neues Projekt anlegen.')) return offen;

    let name = (nameVorschlag || '').trim();
    if (!name) name = (prompt('Name des neuen Projekts:') || '').trim();
    if (!name) return null;
    const p = {
      id: Store.uid(), name,
      date: datum || new Date().toISOString().slice(0, 10),
      entered: false, grades: {}, groups: [], groupNames: [],
    };
    cls.projects.push(p);
    this.currentProjectId = p.id;
    return p;
  },

  /* ---------- Gruppen von Hand zusammenstellen ---------- */
  manualGroups: [],

  /* Vorschlagsliste für die Eingabefelder aus der aktuellen Klassenliste */
  fillStudentDatalist() {
    const dl = document.getElementById('student-options');
    const cls = this.currentClass();
    if (!dl) return;
    dl.innerHTML = '';
    if (!cls) return;
    for (const s of cls.students) {
      const o = document.createElement('option');
      o.value = this.studentName(s);
      dl.appendChild(o);
    }
  },

  renderManualGroups() {
    const wrap = document.getElementById('manual-groups');
    if (!wrap) return;
    this.fillStudentDatalist();
    wrap.innerHTML = '';
    if (!this.manualGroups.length) {
      wrap.innerHTML = '<p class="hint">Noch keine Gruppe angelegt – auf „Gruppe hinzufügen“ klicken.</p>';
      return;
    }
    this.manualGroups.forEach((g, gi) => {
      const box = document.createElement('div');
      box.className = 'group-box';

      const kopf = document.createElement('div');
      kopf.className = 'manual-head';
      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'cell-input';
      name.placeholder = `Gruppe ${gi + 1} – Name/Thema`;
      name.value = g.name;
      name.addEventListener('input', () => g.name = name.value);
      const weg = document.createElement('button');
      weg.className = 'small danger';
      weg.innerHTML = Icons.raw('x');
      weg.title = 'Diese Gruppe entfernen';
      weg.addEventListener('click', () => {
        this.manualGroups.splice(gi, 1);
        this.renderManualGroups();
      });
      kopf.append(name, weg);

      const liste = document.createElement('div');
      liste.className = 'manual-members';
      g.members.forEach((m, mi) => {
        const feld = document.createElement('input');
        feld.type = 'text';
        feld.className = 'cell-input';
        feld.setAttribute('list', 'student-options');
        feld.placeholder = 'Name …';
        feld.value = m;
        feld.addEventListener('input', () => g.members[mi] = feld.value);
        liste.appendChild(feld);
      });

      const mehr = document.createElement('button');
      mehr.className = 'small';
      mehr.textContent = '+ Feld';
      mehr.title = 'Noch einen Schüler zu dieser Gruppe';
      mehr.addEventListener('click', () => { g.members.push(''); this.renderManualGroups(); });

      box.append(kopf, liste, mehr);
      wrap.appendChild(box);
    });
  },

  saveManualGroups() {
    const cls = this.currentClass();
    if (!cls) return;
    const gefuellt = this.manualGroups
      .map(g => ({ name: g.name.trim(), members: g.members.map(m => m.trim()).filter(Boolean) }))
      .filter(g => g.members.length);
    if (!gefuellt.length) { alert('Es sind noch keine Namen eingetragen.'); return; }

    const p = this.gruppenZiel(
      document.getElementById('manual-project-name').value,
      document.getElementById('manual-project-date').value);
    if (!p) return;

    const created = [];
    gefuellt.forEach((g, i) => {
      const ids = g.members.map(m => this.findOrCreateStudent(cls, m, created)).filter(Boolean);
      if (!ids.length) return;
      p.groups.push(ids);
      p.groupNames.push(g.name || `Gruppe ${p.groups.length}`);
    });

    const anzahlNeu = this.manualGroups.length;
    this.manualGroups = [];
    document.getElementById('manual-project-name').value = '';
    this.persist();
    this.renderClassList();
    this.renderStudents();
    this.renderManualGroups();
    this.renderProjects();
    this.zeigeProjektErgebnis(anzahlNeu, "manual-groups");
    if (created.length) {
      alert(`Projekt angelegt.\n\nNeu in die Klassenliste aufgenommen (unten angehängt):\n${created.join('\n')}`);
    }
  },

  /* ---------- Gruppen-Import aus PDF ---------- */
  /* Liest eine zweispaltige Tabelle „Gruppe | Produkt/Thema“: links Namen
     (kommagetrennt, ggf. über mehrere Zeilen), rechts Produkt und evtl. getippte Note.
     Neue Tabellenzeile = rechts steht wieder Text, nachdem die Namensliste
     der vorigen Gruppe abgeschlossen war (letzte Zeile ohne Komma). */
  /* Welche Rolle hat eine Spaltenüberschrift? Reihenfolge der Prüfungen ist wichtig:
     „Gruppenname“ ist eine Bezeichnung, „Gruppe (Vor- und Nachnamen)“ dagegen die Namensspalte. */
  spaltenRolle(text) {
    const t = String(text).toLowerCase();
    if (/mitglied/.test(t)) return 'namen';
    if (/gruppenname|bandname|k(ü|ue)nstlername|produkt|thema|projekt|titel|song/.test(t)) return 'label';
    if (/namen|name\b/.test(t)) return 'namen';
    return null;
  },

  /* Textstücke einer Zeile zu einem String verbinden.
     Der Abstand taugt hier nicht als Trennzeichen: dieselbe Lücke trennt einmal
     „Sophia Aukofer“ und steckt einmal mitten in „Gjekra“. Zerrissene Wörter
     setzt darum bruchstueckeFuegen() wieder zusammen. */
  fuegeZusammen(items) {
    let out = '';
    let ende = null;
    for (const it of items) {
      const s = it.str.trim();
      if (!s) continue;
      // Nur wenn die Stücke einander berühren, gehören sie sicher zum selben Wort
      const klebt = ende !== null && it.transform[4] - ende <= (Math.abs(it.transform[3]) || 10) * 0.05;
      if (out && !klebt) out += ' ';
      out += s;
      ende = it.transform[4] + (it.width || 0);
    }
    return out.replace(/\s+/g, ' ').trim();
  },

  /* Zerrissene Wörter reparieren: Ein einzelner Großbuchstabe beginnt ein Wort
     („A ukofer“ → „Aukofer“), ein einzelner Kleinbuchstabe setzt das vorige fort
     („Gjek r a“ → „Gjekra“). */
  bruchstueckeFuegen(name) {
    const out = [];
    for (const teil of name.split(/\s+/).filter(Boolean)) {
      const letzter = out.length ? out[out.length - 1] : '';
      if (letzter && /^\p{Ll}$/u.test(teil)) { out[out.length - 1] += teil; continue; }
      if (letzter && /^\p{Lu}$/u.test(letzter)) { out[out.length - 1] += teil; continue; }
      out.push(teil);
    }
    return out.join(' ');
  },

  /* Aus der Kopfzeile ablesen, wo die Spaltengrenze liegt und welche Seite die Namen trägt.
     Dadurch funktionieren beide Anordnungen: „Namen | Produkt“ und „Gruppenname | Mitglieder“. */
  erkenneSpalten(items, pageWidth) {
    let namenX = null, labelX = null;
    for (const it of items) {
      const rolle = this.spaltenRolle(it.str);
      if (rolle === 'namen' && namenX === null) namenX = it.transform[4];
      if (rolle === 'label' && labelX === null) labelX = it.transform[4];
    }
    if (namenX !== null && labelX !== null && Math.abs(namenX - labelX) > 20) {
      return { split: (namenX + labelX) / 2, namenLinks: namenX < labelX };
    }
    if (namenX !== null) {
      // Nur die Namensspalte gefunden: Liegt sie rechts, steht die Bezeichnung links
      const rechts = namenX > pageWidth * 0.4;
      return { split: rechts ? namenX - 10 : pageWidth * 0.55, namenLinks: !rechts };
    }
    return { split: pageWidth * 0.55, namenLinks: true };   // Rückfallebene wie bisher
  },

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
      const { split, namenLinks } = this.erkenneSpalten(content.items, pageWidth);

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
        const links = this.fuegeZusammen(items.filter(i => i.transform[4] < split));
        const rechts = this.fuegeZusammen(items.filter(i => i.transform[4] >= split));
        return namenLinks ? { namen: links, label: rechts } : { namen: rechts, label: links };
      });

      for (const line of lines) {
        const ganz = line.namen + ' ' + line.label;
        // Kopfzeile überspringen
        if (this.spaltenRolle(line.namen) || this.spaltenRolle(line.label)) {
          if (/mitglied|vor-\s*und\s*nachnamen|nachnamen und/i.test(ganz) ||
              /^\s*(produkt|thema|note|gruppenname)\b/i.test(ganz.trim())) continue;
        }
        if (line.label && curClosed) {
          if (cur) groups.push(cur);
          cur = { namesRaw: [], product: line.label };
          curClosed = false;
        } else if (line.label && cur) {
          cur.product += ' ' + line.label;   // mehrzeilige Bezeichnung
        }
        if (line.namen) {
          if (!cur) { if (!title) title = line.namen; continue; }   // Titelzeile vor der Tabelle
          cur.namesRaw.push(line.namen);
          curClosed = !/,\s*$/.test(line.namen);   // Zeile ohne Schlusskomma beendet die Namensliste
        }
      }
    }
    if (cur) groups.push(cur);

    return {
      title,
      groups: groups.map(g => {
        // Ohne Kommas ist jede Zeile ein eigener Name. Mit Kommas trennt das Komma –
        // dann kann ein Name aber über den Zeilenumbruch laufen („… Sarah“ / „Hammerl“).
        // Als Fortsetzung gilt nur eine Zeile, die mit einem einzelnen Wort beginnt;
        // ein vollständiger Name („juliana Leitner“) bleibt ein eigener Eintrag.
        let chunks;
        if (g.namesRaw.some(z => z.includes(','))) {
          let text = '';
          for (const z of g.namesRaw) {
            const ersterTeil = z.split(',')[0].trim();
            if (!text) text = z;
            else if (/,\s*$/.test(text)) text += ' ' + z;
            else if (ersterTeil.split(/\s+/).length === 1) text += ' ' + z;
            else text += ', ' + z;
          }
          chunks = text.split(',');
        } else chunks = g.namesRaw;
        chunks = chunks.map(s => this.bruchstueckeFuegen(s.trim())).filter(Boolean);
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

  /* Vorschau füllen und anzeigen – gemeinsam für lokalen und KI-Import */
  showGroupPreview(title, lines, info) {
    document.getElementById('group-import-text').value = lines.join('\n');
    document.getElementById('group-import-name').value = title;
    document.getElementById('group-import-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('group-import-info').textContent = info;
    document.getElementById('group-import-preview').hidden = false;
  },

  /* Dokument von Claude auswerten lassen (auch Scans und Handschrift) */
  async runAiImport() {
    const file = this.pendingGroupFile;
    if (!file) return;
    const btn = document.getElementById('btn-ai-import');
    const status = document.getElementById('ai-status');
    btn.disabled = true;
    try {
      const res = await AiImport.extract(file, msg => status.textContent = msg);
      if (!res.groups || !res.groups.length) {
        status.textContent = '';
        alert('Die KI hat in diesem Dokument keine Gruppen gefunden.');
        return;
      }
      const lines = res.groups.map((g, i) => {
        const names = (g.members || [])
          .map(m => m.grade ? `${m.name}=${m.grade}` : m.name)
          .join(', ');
        return `${g.name || 'Gruppe ' + (i + 1)} | ${g.grade || '-'} | ${names}`;
      });
      const withGrades = res.groups.filter(g => g.grade ||
        (g.members || []).some(m => m.grade)).length;
      this.showGroupPreview(
        res.title || file.name.replace(/\.pdf$/i, ''),
        lines,
        `${res.groups.length} Gruppen mit ${res.groups.reduce((a, g) => a + (g.members || []).length, 0)} Namen erkannt, ` +
        `davon ${withGrades} mit Note. Bitte kontrollieren – besonders die Noten. ${AiImport.costText(res.usage)}`);
      status.textContent = '';
    } catch (err) {
      status.textContent = '';
      alert('KI-Auswertung fehlgeschlagen: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  },

  /* Namen der Klassenliste zuordnen; Unbekannte werden unten angehängt.
     Gruppenlisten schreiben Namen mal als „Vorname Nachname“, mal als
     „Nachname Vorname“ – deshalb beide Reihenfolgen prüfen, sonst entstehen
     Doppel-Einträge wie „Erik, Weber“ neben „Weber, Erik“. */
  findOrCreateStudent(cls, nameStr, created) {
    const n = this.parseName(nameStr);
    if (!n || !n.last) return null;
    const norm = s => (s || '').toLowerCase().trim();
    const fits = (a, b) => norm(a) === norm(b) ||
      (norm(a) && norm(b) && (norm(a).startsWith(norm(b)) || norm(b).startsWith(norm(a))));

    for (const c of [n, { first: n.last, last: n.first }]) {
      if (!c.last) continue;
      const hit = cls.students.find(x => norm(x.last) === norm(c.last) &&
        (!norm(c.first) || fits(x.first, c.first)));
      if (hit) return hit.id;
    }

    const s = { id: Store.uid(), first: this._capitalize(n.first), last: this._capitalize(n.last) };
    cls.students.push(s);
    created.push(this.studentName(s));
    return s.id;
  },

  saveImportedGroups() {
    const cls = this.currentClass();
    if (!cls) return;
    const p = this.gruppenZiel(
      document.getElementById('group-import-name').value || 'Importiertes Projekt',
      document.getElementById('group-import-date').value);
    if (!p) return;
    const created = [];
    const groups = [], groupNames = [], grades = {};
    for (const line of document.getElementById('group-import-text').value.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split('|');
      if (parts.length < 3) { alert(`Zeile hat nicht das Format „Produkt | Note | Namen“:\n${line}`); return; }
      const product = parts[0].trim();
      const grade = parts[1].trim().replace(/^-$/, '');
      const ids = [];
      for (const entry of parts.slice(2).join('|').split(',')) {
        // „Name=Note“ – die Einzelnote sticht die Gruppennote
        const [nameStr, single] = entry.split('=');
        if (!nameStr || !nameStr.trim()) continue;
        const id = this.findOrCreateStudent(cls, nameStr, created);
        if (!id) continue;
        ids.push(id);
        const own = (single || '').trim();
        if (own) grades[id] = own;
        else if (grade) grades[id] = grade;
      }
      if (!ids.length) continue;
      groups.push(ids);
      groupNames.push(product);
    }
    if (!groups.length) { alert('Keine Gruppen gefunden.'); return; }
    p.groups.push(...groups);
    p.groupNames.push(...groupNames);
    Object.assign(p.grades, grades);
    this.persist();
    document.getElementById('group-import-preview').hidden = true;
    this.renderClassList();
    this.renderStudents();
    this.renderProjects();
    if (created.length) alert(`Neu in die Klassenliste aufgenommen (unten angehängt):\n${created.join('\n')}`);
    document.querySelector('[data-subtab="projekte"]').click();
    this.zeigeProjektErgebnis(groups.length);
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
