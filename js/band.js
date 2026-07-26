/* Schulband: Mitglieder, Songs, Termine/Auftritte und Probenplan.
   Die Daten hängen an Classes.data.band und landen dadurch automatisch
   im gemeinsamen Speicher und in jedem Backup. */
const Band = {
  AREAS: { band: 'Schulband', technik: 'Technikteam', beide: 'Band + Technik' },
  KEYS: ['', 'C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'H/B',
         'Am', 'A#m/Bbm', 'Hm/Bm', 'Cm', 'C#m', 'Dm', 'D#m/Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m'],

  d() {
    const data = Classes.data;
    if (!data.band) data.band = {};
    const b = data.band;
    ['members', 'songs', 'gigs', 'rehearsals'].forEach(k => { if (!Array.isArray(b[k])) b[k] = []; });
    return b;
  },
  save() { Classes.persist(); },

  init() {
    // Unterreiter
    document.querySelectorAll('.bandtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.bandtab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.bandtab-page').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('bandtab-' + btn.dataset.bandtab).classList.add('active');
        this.renderAll();
      });
    });

    /* ---- Mitglieder ---- */
    document.getElementById('form-new-member').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('member-name').value.trim();
      if (!name) return;
      this.d().members.push({
        id: Store.uid(), name,
        klasse: document.getElementById('member-class').value.trim(),
        area: document.getElementById('member-area').value,
        instrument: document.getElementById('member-instrument').value.trim(),
      });
      this.save();
      ['member-name', 'member-class', 'member-instrument'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('member-from-class').value = '';
      this.renderMembers();
    });
    document.getElementById('member-from-class').addEventListener('change', e => {
      const [clsId, sid] = e.target.value.split('|');
      const cls = Classes.data.classes.find(c => c.id === clsId);
      const s = cls && cls.students.find(x => x.id === sid);
      if (!s) return;
      document.getElementById('member-name').value = Classes.studentName(s);
      document.getElementById('member-class').value = this.shortClass(cls.name);
      document.getElementById('member-instrument').focus();
    });
    document.getElementById('member-filter').addEventListener('change', () => this.renderMembers());
    document.getElementById('btn-print-members').addEventListener('click', () => this.printMembers());
    document.getElementById('btn-export-members').addEventListener('click', () => this.exportMembers());

    /* ---- Songs ---- */
    document.getElementById('form-new-song').addEventListener('submit', e => {
      e.preventDefault();
      const title = document.getElementById('song-title').value.trim();
      if (!title) return;
      this.d().songs.push({
        id: Store.uid(), title,
        artist: document.getElementById('song-artist').value.trim(),
        key: '', capo: '', tempo: '', notes: '',
      });
      this.save();
      document.getElementById('song-title').value = '';
      document.getElementById('song-artist').value = '';
      this.renderSongs();
    });
    document.getElementById('btn-print-songs').addEventListener('click', () => this.printSongs(this.d().songs, 'Songliste'));
    document.getElementById('btn-print-songs-sel').addEventListener('click', () => {
      const sel = [...document.querySelectorAll('#song-table input.song-pick:checked')].map(c => c.dataset.id);
      if (!sel.length) { alert('Keine Songs ausgewählt.'); return; }
      this.printSongs(this.d().songs.filter(s => sel.includes(s.id)), 'Songs (Auswahl)');
    });

    /* ---- Termine ---- */
    document.getElementById('form-new-gig').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('gig-name').value.trim();
      if (!name) return;
      const gig = {
        id: Store.uid(), name,
        date: document.getElementById('gig-date').value,
        time: '', place: '', notes: '', songIds: [],
      };
      this.d().gigs.push(gig);
      this.currentGigId = gig.id;
      this.save();
      document.getElementById('gig-name').value = '';
      this.renderGigs();
    });
    document.getElementById('btn-delete-gig').addEventListener('click', () => {
      const g = this.currentGig();
      if (!g || !confirm(`Termin „${g.name}“ löschen?`)) return;
      this.d().gigs = this.d().gigs.filter(x => x.id !== g.id);
      this.currentGigId = null;
      this.save();
      this.renderGigs();
    });
    document.getElementById('btn-print-gig').addEventListener('click', () => {
      const g = this.currentGig();
      if (!g) return;
      const songs = g.songIds.map(id => this.song(id)).filter(Boolean);
      this.printSongs(songs, `Setlist: ${g.name}`, this.gigSubtitle(g));
    });
    [['gig-f-date', 'date'], ['gig-f-time', 'time'], ['gig-f-place', 'place'], ['gig-f-notes', 'notes']]
      .forEach(([id, field]) => document.getElementById(id).addEventListener('change', e => {
        const g = this.currentGig();
        if (!g) return;
        g[field] = e.target.value;
        this.save();
        if (field === 'date') this.renderGigs();
      }));
    document.getElementById('gig-add-song').addEventListener('change', e => {
      const g = this.currentGig();
      if (!g || !e.target.value) return;
      if (!g.songIds.includes(e.target.value)) g.songIds.push(e.target.value);
      e.target.value = '';
      this.save();
      this.renderGigDetail();
    });

    /* ---- Probenplan ---- */
    document.getElementById('form-new-rehearsal').addEventListener('submit', e => {
      e.preventDefault();
      const date = document.getElementById('rehearsal-date').value;
      if (!date) return;
      if (this.d().rehearsals.some(r => r.date === date)) { alert('Für diesen Tag gibt es schon eine Probe.'); return; }
      const r = { id: Store.uid(), date, notes: '', songs: {} };
      this.d().rehearsals.push(r);
      this.currentRehearsalId = r.id;
      this.save();
      this.renderRehearsals();
    });
    document.getElementById('btn-delete-rehearsal').addEventListener('click', () => {
      const r = this.currentRehearsal();
      if (!r || !confirm(`Probe vom ${this.fmt(r.date)} löschen?`)) return;
      this.d().rehearsals = this.d().rehearsals.filter(x => x.id !== r.id);
      this.currentRehearsalId = null;
      this.save();
      this.renderRehearsals();
    });
    document.getElementById('rehearsal-notes').addEventListener('change', e => {
      const r = this.currentRehearsal();
      if (!r) return;
      r.notes = e.target.value;
      this.save();
    });
    document.getElementById('btn-print-rehearsal').addEventListener('click', () => this.printRehearsal());

    this.renderAll();
  },

  renderAll() {
    this.renderMembers();
    this.renderSongs();
    this.renderGigs();
    this.renderRehearsals();
    this.fillClassPicker();
  },

  /* ---------- Hilfsfunktionen ---------- */
  song(id) { return this.d().songs.find(s => s.id === id); },
  currentGig() { return this.d().gigs.find(g => g.id === this.currentGigId) || null; },
  currentRehearsal() { return this.d().rehearsals.find(r => r.id === this.currentRehearsalId) || null; },
  fmt(d) { return d ? new Date(d + 'T12:00').toLocaleDateString('de-DE') : ''; },

  /* „5c Musik“ → „5c“ */
  shortClass(name) {
    const m = String(name).match(/\b(\d{1,2}\s*[a-zA-Z]?)\b/);
    return m ? m[1].replace(/\s+/g, '') : '';
  },

  /* Klassen natürlich sortieren: 5a < 5b < 6a < 10a; ohne Angabe ans Ende */
  classSortKey(k) {
    const m = String(k || '').match(/^(\d{1,2})\s*([a-zA-Z]*)/);
    if (!m) return [999, String(k || '').toLowerCase()];
    return [parseInt(m[1], 10), m[2].toLowerCase()];
  },
  byClass(a, b) {
    const ka = this.classSortKey(a.klasse), kb = this.classSortKey(b.klasse);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] < kb[1] ? -1 : 1;
    return a.name.localeCompare(b.name, 'de');
  },

  filteredMembers() {
    const f = document.getElementById('member-filter').value;
    return this.d().members
      .filter(m => f === 'alle' || m.area === f || m.area === 'beide')
      .sort((a, b) => this.byClass(a, b));
  },

  fillClassPicker() {
    const sel = document.getElementById('member-from-class');
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = '<option value="">aus Klasse übernehmen …</option>';
    for (const cls of Classes.data.classes) {
      if (!cls.students.length) continue;
      const grp = document.createElement('optgroup');
      grp.label = cls.name;
      for (const s of cls.students) {
        const o = document.createElement('option');
        o.value = cls.id + '|' + s.id;
        o.textContent = Classes.studentName(s);
        grp.appendChild(o);
      }
      sel.appendChild(grp);
    }
    sel.value = keep;
  },

  /* ---------- Mitglieder ---------- */
  renderMembers() {
    const table = document.getElementById('member-table');
    if (!table) return;
    const list = this.filteredMembers();
    document.getElementById('member-count').textContent = list.length;
    table.innerHTML = '<tr><th>Klasse</th><th>Name</th><th>Bereich</th><th>Instrument / Aufgabe</th><th></th></tr>';
    if (!list.length) {
      table.innerHTML += '<tr><td colspan="5" class="hint">Noch keine Mitglieder aufgenommen.</td></tr>';
      return;
    }
    for (const m of list) {
      const tr = document.createElement('tr');

      const tdK = document.createElement('td');
      tdK.appendChild(this.editable(m.klasse, '–', v => { m.klasse = v; this.save(); this.renderMembers(); }, 5));
      const tdN = document.createElement('td');
      tdN.appendChild(this.editable(m.name, '', v => { if (v) { m.name = v; this.save(); this.renderMembers(); } }, 20));

      const tdA = document.createElement('td');
      const sel = document.createElement('select');
      sel.className = 'small-select';
      Object.entries(this.AREAS).forEach(([v, label]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        if (m.area === v) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { m.area = sel.value; this.save(); this.renderMembers(); });
      tdA.appendChild(sel);

      const tdI = document.createElement('td');
      tdI.appendChild(this.editable(m.instrument, '–', v => { m.instrument = v; this.save(); }, 18));

      const tdX = document.createElement('td');
      const del = document.createElement('button');
      del.className = 'small danger';
      del.innerHTML = Icons.raw('x');
      del.title = 'Aus der Band entfernen';
      del.addEventListener('click', () => {
        if (!confirm(`${m.name} aus der Liste entfernen?`)) return;
        this.d().members = this.d().members.filter(x => x.id !== m.id);
        this.save();
        this.renderMembers();
      });
      tdX.appendChild(del);

      tr.append(tdK, tdN, tdA, tdI, tdX);
      table.appendChild(tr);
    }
  },

  /* Textzelle, die beim Klick zum Eingabefeld wird */
  editable(value, placeholder, onSave, size) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-input';
    input.value = value || '';
    input.placeholder = placeholder;
    if (size) input.size = size;
    input.addEventListener('change', () => onSave(input.value.trim()));
    return input;
  },

  printMembers() {
    const list = this.filteredMembers();
    if (!list.length) { alert('Die Liste ist leer.'); return; }
    const f = document.getElementById('member-filter').value;
    const titel = f === 'band' ? 'Schulband' : f === 'technik' ? 'Technikteam' : 'Schulband und Technikteam';
    const rows = list.map(m => `<tr><td>${this.esc(m.klasse) || '–'}</td><td>${this.esc(m.name)}</td>` +
      `<td>${this.AREAS[m.area] || ''}</td><td>${this.esc(m.instrument) || ''}</td></tr>`).join('');
    this.printHtml(titel,
      `<p>${list.length} Mitglieder · Stand ${new Date().toLocaleDateString('de-DE')}</p>
       <table><tr><th>Klasse</th><th>Name</th><th>Bereich</th><th>Instrument / Aufgabe</th></tr>${rows}</table>`);
  },

  exportMembers() {
    const list = this.filteredMembers();
    if (!list.length) { alert('Die Liste ist leer.'); return; }
    let csv = 'Klasse;Name;Bereich;Instrument\n';
    list.forEach(m => csv += `${m.klasse};${m.name};${this.AREAS[m.area] || ''};${m.instrument || ''}\n`);
    this.download(csv, 'Schulband-Mitglieder.csv', 'text/csv;charset=utf-8');
  },

  /* ---------- Songs ---------- */
  renderSongs() {
    const table = document.getElementById('song-table');
    if (!table) return;
    const songs = this.d().songs;
    document.getElementById('song-count').textContent = songs.length;
    table.innerHTML = '<tr><th></th><th>Titel</th><th>Interpret</th><th>Tonart</th><th>Capo</th>' +
      '<th>Tempo</th><th>Anmerkungen</th><th></th></tr>';
    if (!songs.length) {
      table.innerHTML += '<tr><td colspan="8" class="hint">Noch keine Songs angelegt.</td></tr>';
      this.fillGigSongPicker();
      return;
    }
    for (const s of songs) {
      const tr = document.createElement('tr');

      const tdPick = document.createElement('td');
      const pick = document.createElement('input');
      pick.type = 'checkbox';
      pick.className = 'song-pick';
      pick.dataset.id = s.id;
      pick.title = 'Für „Ausgewählte drucken“ markieren';
      tdPick.appendChild(pick);

      const tdT = document.createElement('td');
      tdT.appendChild(this.editable(s.title, '', v => { if (v) { s.title = v; this.save(); this.renderAll(); } }, 22));
      const tdA = document.createElement('td');
      tdA.appendChild(this.editable(s.artist, '–', v => { s.artist = v; this.save(); }, 16));

      const tdK = document.createElement('td');
      const key = document.createElement('select');
      key.className = 'small-select';
      this.KEYS.forEach(k => {
        const o = document.createElement('option');
        o.value = k; o.textContent = k || '–';
        if (s.key === k) o.selected = true;
        key.appendChild(o);
      });
      key.addEventListener('change', () => { s.key = key.value; this.save(); });
      tdK.appendChild(key);

      const tdC = document.createElement('td');
      const capo = document.createElement('select');
      capo.className = 'small-select';
      ['', '0', '1', '2', '3', '4', '5', '6', '7'].forEach(c => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = c === '' ? '–' : (c === '0' ? 'ohne' : '+' + c);
        if (String(s.capo) === c) o.selected = true;
        capo.appendChild(o);
      });
      capo.addEventListener('change', () => { s.capo = capo.value; this.save(); });
      tdC.appendChild(capo);

      const tdTe = document.createElement('td');
      const tempo = document.createElement('input');
      tempo.type = 'number';
      tempo.className = 'cell-input tempo';
      tempo.min = 30; tempo.max = 260;
      tempo.placeholder = 'BPM';
      tempo.value = s.tempo || '';
      tempo.addEventListener('change', () => { s.tempo = tempo.value; this.save(); });
      tdTe.appendChild(tempo);

      const tdN = document.createElement('td');
      const notes = document.createElement('textarea');
      notes.className = 'cell-input notes';
      notes.rows = 1;
      notes.placeholder = 'Anmerkungen …';
      notes.value = s.notes || '';
      notes.addEventListener('change', () => { s.notes = notes.value; this.save(); });
      tdN.appendChild(notes);

      const tdX = document.createElement('td');
      const del = document.createElement('button');
      del.className = 'small danger';
      del.innerHTML = Icons.raw('x');
      del.title = 'Song löschen';
      del.addEventListener('click', () => {
        if (!confirm(`Song „${s.title}“ löschen? Er verschwindet auch aus Setlisten und Probenplänen.`)) return;
        this.d().songs = this.d().songs.filter(x => x.id !== s.id);
        this.d().gigs.forEach(g => g.songIds = g.songIds.filter(id => id !== s.id));
        this.d().rehearsals.forEach(r => delete r.songs[s.id]);
        this.save();
        this.renderAll();
      });
      tdX.appendChild(del);

      tr.append(tdPick, tdT, tdA, tdK, tdC, tdTe, tdN, tdX);
      table.appendChild(tr);
    }
    this.fillGigSongPicker();
  },

  songLine(s) {
    const bits = [];
    if (s.key) bits.push('Tonart ' + s.key);
    if (s.capo !== '' && s.capo != null) bits.push(s.capo === '0' ? 'kein Capo' : 'Capo +' + s.capo);
    if (s.tempo) bits.push(s.tempo + ' BPM');
    return bits.join(' · ');
  },

  printSongs(songs, titel, untertitel) {
    if (!songs.length) { alert('Keine Songs zum Drucken.'); return; }
    const rows = songs.map((s, i) => `<tr><td>${i + 1}</td><td><strong>${this.esc(s.title)}</strong>` +
      (s.artist ? `<br><span class="sub">${this.esc(s.artist)}</span>` : '') + '</td>' +
      `<td>${this.esc(this.songLine(s)) || '–'}</td><td>${this.esc(s.notes || '')}</td></tr>`).join('');
    this.printHtml(titel,
      (untertitel ? `<p>${this.esc(untertitel)}</p>` : '') +
      `<table><tr><th>Nr.</th><th>Song</th><th>Tonart / Capo / Tempo</th><th>Anmerkungen</th></tr>${rows}</table>`);
  },

  /* ---------- Termine ---------- */
  renderGigs() {
    const ul = document.getElementById('gig-list');
    if (!ul) return;
    ul.innerHTML = '';
    const gigs = [...this.d().gigs].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    if (!gigs.length) ul.innerHTML = '<li class="hint">Noch keine Termine angelegt.</li>';
    for (const g of gigs) {
      const li = document.createElement('li');
      li.classList.toggle('active', g.id === this.currentGigId);
      const name = document.createElement('span');
      name.className = 'pname';
      name.textContent = g.name;
      const date = document.createElement('span');
      date.className = 'pdate';
      date.textContent = [this.fmt(g.date), g.time, g.place].filter(Boolean).join(' · ');
      const cnt = document.createElement('span');
      cnt.className = 'pavg';
      cnt.textContent = g.songIds.length ? `${g.songIds.length} Songs` : '';
      li.append(name, date, cnt);
      li.addEventListener('click', () => { this.currentGigId = g.id; this.renderGigs(); });
      ul.appendChild(li);
    }
    this.renderGigDetail();
  },

  gigSubtitle(g) {
    return [this.fmt(g.date), g.time, g.place].filter(Boolean).join(' · ');
  },

  renderGigDetail() {
    const g = this.currentGig();
    document.getElementById('gig-detail').hidden = !g;
    if (!g) return;
    document.getElementById('gig-title').textContent = g.name;
    document.getElementById('gig-f-date').value = g.date || '';
    document.getElementById('gig-f-time').value = g.time || '';
    document.getElementById('gig-f-place').value = g.place || '';
    document.getElementById('gig-f-notes').value = g.notes || '';
    document.getElementById('gig-song-count').textContent = g.songIds.length;

    const ol = document.getElementById('gig-songs');
    ol.innerHTML = '';
    g.songIds.forEach(id => {
      const s = this.song(id);
      if (!s) return;
      const li = document.createElement('li');
      li.dataset.id = id;

      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.title = 'Reihenfolge ziehen';
      handle.innerHTML = Icons.raw('grip');
      handle.addEventListener('pointerdown', ev => this.startSongDrag(ev, li));

      const label = document.createElement('span');
      label.className = 'sname';
      const extra = this.songLine(s);
      label.innerHTML = `<strong>${this.esc(s.title)}</strong>` +
        (s.artist ? ` <span class="hint">– ${this.esc(s.artist)}</span>` : '') +
        (extra ? ` <span class="hint">(${this.esc(extra)})</span>` : '');

      const del = document.createElement('button');
      del.className = 'del';
      del.innerHTML = Icons.raw('x');
      del.title = 'Aus der Setlist entfernen';
      del.addEventListener('click', () => {
        g.songIds = g.songIds.filter(x => x !== id);
        this.save();
        this.renderGigDetail();
      });

      li.append(handle, label, del);
      ol.appendChild(li);
    });
    this.fillGigSongPicker();
  },

  fillGigSongPicker() {
    const sel = document.getElementById('gig-add-song');
    if (!sel) return;
    const g = this.currentGig();
    sel.innerHTML = '<option value="">Song zur Setlist hinzufügen …</option>';
    for (const s of this.d().songs) {
      if (g && g.songIds.includes(s.id)) continue;
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.title + (s.artist ? ' – ' + s.artist : '');
      sel.appendChild(o);
    }
  },

  startSongDrag(e, li) {
    if (e.button > 0) return;
    e.preventDefault();
    const ol = document.getElementById('gig-songs');
    li.classList.add('dragging');
    try { li.setPointerCapture(e.pointerId); } catch (_) { /* ältere Browser */ }
    const onMove = ev => {
      const others = [...ol.querySelectorAll('li:not(.dragging)')];
      const after = others.find(x => {
        const r = x.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (after) ol.insertBefore(li, after); else ol.appendChild(li);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      li.classList.remove('dragging');
      const g = this.currentGig();
      if (g) {
        g.songIds = [...ol.querySelectorAll('li')].map(x => x.dataset.id);
        this.save();
      }
      this.renderGigDetail();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  },

  /* ---------- Probenplan ---------- */
  renderRehearsals() {
    const ul = document.getElementById('rehearsal-list');
    if (!ul) return;
    ul.innerHTML = '';
    const list = [...this.d().rehearsals].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!list.length) ul.innerHTML = '<li class="hint">Noch keine Probentermine angelegt.</li>';
    for (const r of list) {
      const li = document.createElement('li');
      li.classList.toggle('active', r.id === this.currentRehearsalId);
      const name = document.createElement('span');
      name.className = 'pname';
      name.textContent = this.fmt(r.date);
      const cnt = document.createElement('span');
      cnt.className = 'pavg';
      const n = Object.keys(r.songs || {}).length;
      cnt.textContent = n ? `${n} Songs geprobt` : 'nichts eingetragen';
      li.append(name, cnt);
      li.addEventListener('click', () => { this.currentRehearsalId = r.id; this.renderRehearsals(); });
      ul.appendChild(li);
    }
    this.renderRehearsalDetail();
  },

  renderRehearsalDetail() {
    const r = this.currentRehearsal();
    document.getElementById('rehearsal-detail').hidden = !r;
    if (!r) return;
    document.getElementById('rehearsal-title').textContent = 'Probe am ' + this.fmt(r.date);
    document.getElementById('rehearsal-notes').value = r.notes || '';

    const table = document.getElementById('rehearsal-table');
    table.innerHTML = '<tr><th>geprobt</th><th>Song</th><th>Anmerkung zu dieser Probe</th></tr>';
    const songs = this.d().songs;
    if (!songs.length) {
      table.innerHTML += '<tr><td colspan="3" class="hint">Erst im Bereich „Songs“ Stücke anlegen.</td></tr>';
      return;
    }
    for (const s of songs) {
      const done = Object.prototype.hasOwnProperty.call(r.songs, s.id);
      const tr = document.createElement('tr');
      if (done) tr.className = 'rehearsed';

      const tdC = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = done;
      cb.addEventListener('change', () => {
        if (cb.checked) r.songs[s.id] = r.songs[s.id] || '';
        else delete r.songs[s.id];
        this.save();
        this.renderRehearsals();
      });
      tdC.appendChild(cb);

      const tdT = document.createElement('td');
      tdT.textContent = s.title + (s.artist ? ' – ' + s.artist : '');

      const tdN = document.createElement('td');
      const note = document.createElement('input');
      note.type = 'text';
      note.className = 'cell-input';
      note.placeholder = 'z. B. Tempo schneller, Bridge nochmal';
      note.value = r.songs[s.id] || '';
      note.addEventListener('change', () => {
        r.songs[s.id] = note.value;      // Eintrag markiert den Song zugleich als geprobt
        cb.checked = true;
        tr.className = 'rehearsed';
        this.save();
        this.renderRehearsals();
      });
      tdN.appendChild(note);

      tr.append(tdC, tdT, tdN);
      table.appendChild(tr);
    }
  },

  printRehearsal() {
    const r = this.currentRehearsal();
    if (!r) return;
    const done = this.d().songs.filter(s => Object.prototype.hasOwnProperty.call(r.songs, s.id));
    const rows = done.map((s, i) => `<tr><td>${i + 1}</td><td><strong>${this.esc(s.title)}</strong>` +
      (s.artist ? `<br><span class="sub">${this.esc(s.artist)}</span>` : '') + '</td>' +
      `<td>${this.esc(this.songLine(s)) || '–'}</td><td>${this.esc(r.songs[s.id] || '')}</td></tr>`).join('');
    this.printHtml('Probe am ' + this.fmt(r.date),
      (r.notes ? `<p>${this.esc(r.notes)}</p>` : '') +
      (done.length
        ? `<table><tr><th>Nr.</th><th>Song</th><th>Tonart / Capo / Tempo</th><th>Anmerkung</th></tr>${rows}</table>`
        : '<p>Für diese Probe sind noch keine Songs eingetragen.</p>'));
  },

  /* ---------- Drucken und Export ---------- */
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  printHtml(titel, inhalt) {
    document.querySelectorAll('.print-area').forEach(el => el.remove());
    const box = document.createElement('div');
    box.className = 'print-area band-print';
    box.innerHTML = `<h1>${this.esc(titel)}</h1>${inhalt}`;
    document.body.appendChild(box);
    window.print();
    setTimeout(() => box.remove(), 500);
  },

  download(text, filename, type) {
    const blob = new Blob(['﻿' + text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
