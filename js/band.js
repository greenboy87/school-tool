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
    ['members', 'songs', 'ideas', 'gigs', 'rehearsals'].forEach(k => { if (!Array.isArray(b[k])) b[k] = []; });
    if (typeof b.notizen !== 'string') b.notizen = '';
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
      const m = {
        id: Store.uid(), name,
        klasse: document.getElementById('member-class').value.trim(),
        area: document.getElementById('member-area').value,
        instrument: document.getElementById('member-instrument').value.trim(),
      };
      // Aus der Suche uebernommen und der Name nicht veraendert: gleich verknuepfen
      const v = this.vorgemerkt;
      if (v && v.name === name) { m.studentId = v.sid; m.classId = v.clsId; }
      this.vorgemerkt = null;
      this.d().members.push(m);
      this.save();
      ['member-name', 'member-class', 'member-instrument'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('member-aufnehmen').open = false;
      this.renderMembers();
      this.mitgliedZeigen(m.id);
    });
    const suchFeld = document.getElementById('member-suche');
    suchFeld.addEventListener('input', () => { this.suchMarkiert = 0; this.mitgliedSuchen(); });
    suchFeld.addEventListener('keydown', e => {
      const zeilen = [...document.querySelectorAll('#member-suche-treffer li[data-schueler]')];
      if (e.key === 'Escape') { suchFeld.value = ''; this.mitgliedSuchen(); return; }
      if (!zeilen.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = zeilen.length;
        this.suchMarkiert = (this.suchMarkiert + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        zeilen.forEach((z, i) => z.classList.toggle('markiert', i === this.suchMarkiert));
        zeilen[this.suchMarkiert].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        zeilen[Math.min(this.suchMarkiert, zeilen.length - 1)].click();
      }
    });
    Schueler.fotoFeldVerdrahten(document.getElementById('member-foto'),
      document.getElementById('btn-member-foto'), document.getElementById('member-foto-datei'), () => {
        const m = this.d().members.find(x => x.id === this.aktivesMitglied);
        return m ? this.schuelerVon(m) : null;
      });
    document.getElementById('btn-member-zum-schueler').addEventListener('click', () => {
      const m = this.d().members.find(x => x.id === this.aktivesMitglied);
      if (m && m.studentId) Schueler.oeffne(m.classId, m.studentId);
    });
    document.getElementById('btn-bulk-members').addEventListener('click', () => {
      const ta = document.getElementById('member-bulk');
      const neue = this.parseMemberLines(ta.value, document.getElementById('member-area').value);
      if (!neue.length) { alert('Keine verwertbaren Zeilen gefunden.\nFormat: Name; Klasse; Instrument'); return; }
      this.d().members.push(...neue);
      this.save();
      ta.value = '';
      const verknuepft = this.syncWithClasses();
      this.renderMembers();
      alert(`${neue.length} Mitglieder aufgenommen.` +
        (verknuepft ? `\n${verknuepft} davon konnten direkt einem Schüler aus deinen Klassenlisten zugeordnet werden.` : ''));
    });
    document.getElementById('btn-sync-members').addEventListener('click', () => {
      const n = this.syncWithClasses();
      this.renderMembers();
      alert(n ? `${n} Mitglieder wurden mit Schülern aus deinen Klassenlisten verknüpft.`
              : 'Es gab nichts Neues zu verknüpfen – entweder sind schon alle zugeordnet, ' +
                'oder die Namen stehen (noch) in keiner Klassenliste.');
    });
    // Schalter ueber der Liste; die Einstellung bleibt auf diesem Geraet
    const ansicht = this.ansichtLesen();
    ['band', 'technik', 'rolle', 'leitung'].forEach(k => {
      const box = document.getElementById('member-zeige-' + k);
      if (typeof ansicht[k] === 'boolean') box.checked = ansicht[k];
      box.addEventListener('change', () => {
        /* Band und Technik wie eine Wippe: Wer die eine ausschaltet, waehrend
           die andere schon aus ist, bekommt die andere – eine leere Liste
           hilft niemandem. */
        const anderer = { band: 'technik', technik: 'band' }[k];
        if (anderer && !box.checked && !document.getElementById('member-zeige-' + anderer).checked) {
          document.getElementById('member-zeige-' + anderer).checked = true;
        }
        this.ansichtMerken();
        this.renderMembers();
      });
    });
    document.getElementById('member-pick-all').addEventListener('change', e => {
      for (const m of this.filteredMembers()) {
        if (e.target.checked) this.gewaehlteMitglieder.add(m.id);
        else this.gewaehlteMitglieder.delete(m.id);
      }
      this.renderMembers();
    });
    // Steckbrief: Aenderungen sofort speichern, Liste nachziehen
    const aktiv = () => this.d().members.find(m => m.id === this.aktivesMitglied);
    const feld = (id, key, pflicht) => document.getElementById(id).addEventListener('change', e => {
      const m = aktiv();
      if (!m) return;
      const v = e.target.value.trim();
      if (pflicht && !v) { e.target.value = m[key] || ''; return; }
      m[key] = v;
      this.save();
      this.renderMembers();
    });
    feld('mp-name', 'name', true);
    feld('mp-klasse', 'klasse');
    feld('mp-bereich', 'area');
    feld('mp-instrument', 'instrument');
    document.getElementById('btn-member-zu').addEventListener('click', () => this.mitgliedZeigen(null));
    document.getElementById('btn-member-vor').addEventListener('click', () => this.mitgliedBlaettern(-1));
    document.getElementById('btn-member-weiter').addEventListener('click', () => this.mitgliedBlaettern(1));
    document.getElementById('btn-member-entfernen').addEventListener('click', () => {
      const m = aktiv();
      if (!m || !confirm(`${m.name} aus der Band entfernen?`)) return;
      this.d().members = this.d().members.filter(x => x.id !== m.id);
      this.aktivesMitglied = null;
      this.save();
      this.renderMembers();
    });
    // Pfeiltasten und Esc, solange der Mitglieder-Reiter sichtbar ist und
    // niemand in einem Feld tippt
    document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea, select')) return;
      const sichtbar = id => {
        const seite = document.getElementById(id);
        return seite.classList.contains('active') && seite.offsetParent;
      };
      let blaettern, schliessen;
      if (this.aktivesMitglied && sichtbar('bandtab-mitglieder')) {
        blaettern = d => this.mitgliedBlaettern(d);
        schliessen = () => this.mitgliedZeigen(null);
      } else {
        const pre = [['song', 'bandtab-songs'], ['idea', 'bandtab-ideen']]
          .find(([p, id]) => this.songAktiv[p] && sichtbar(id));
        if (!pre) return;
        blaettern = d => this.songBlaettern(pre[0], d);
        schliessen = () => this.songZeigen(pre[0], null);
      }
      if (e.key === 'ArrowUp') { e.preventDefault(); blaettern(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); blaettern(1); }
      else if (e.key === 'Escape') schliessen();
    });
    document.getElementById('btn-print-members').addEventListener('click', () => this.printMembers());
    document.getElementById('btn-print-members-sel')
      .addEventListener('click', () => this.printMembersAuswahl());
    document.getElementById('btn-export-members').addEventListener('click', () => this.exportMembers());
    document.getElementById('btn-copy-members').addEventListener('click', e => this.mitgliederKopieren(e.currentTarget, false));
    document.getElementById('btn-copy-member-namen').addEventListener('click', e => this.mitgliederKopieren(e.currentTarget, true));

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
      const sel = this.songsGewaehlt('song');
      if (!sel.length) { alert('Keine Songs ausgewählt.'); return; }
      this.printSongs(sel, 'Songs (Auswahl)');
    });

    /* ---- Songvorschläge ---- */
    document.getElementById('form-new-idea').addEventListener('submit', e => {
      e.preventDefault();
      const title = document.getElementById('idea-title').value.trim();
      if (!title) return;
      this.d().ideas.push({
        id: Store.uid(), title,
        artist: document.getElementById('idea-artist').value.trim(),
        key: '', capo: '', tempo: '', notes: '',
      });
      this.save();
      document.getElementById('idea-title').value = '';
      document.getElementById('idea-artist').value = '';
      this.renderIdeas();
    });
    document.getElementById('btn-print-ideas').addEventListener('click', () => this.printSongs(this.d().ideas, 'Songvorschläge'));
    document.getElementById('btn-print-ideas-sel').addEventListener('click', () => {
      const sel = this.songsGewaehlt('idea');
      if (!sel.length) { alert('Keine Vorschläge ausgewählt.'); return; }
      this.printSongs(sel, 'Songvorschläge (Auswahl)');
    });
    ['song', 'idea'].forEach(pre => this.songAnsichtBinden(pre));

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
    document.getElementById('kal-prev').addEventListener('click', () => this.kalSchiebe(-1));
    document.getElementById('kal-next').addEventListener('click', () => this.kalSchiebe(1));
    document.getElementById('kal-heute').addEventListener('click', () => {
      this.kalMonat = null;
      this.renderGigKalender();
    });
    document.getElementById('btn-delete-gig').addEventListener('click', () => {
      const g = this.currentGig();
      if (!g || !confirm(`Termin „${g.name}“ löschen?`)) return;
      // Bilder mit entfernen, sonst bleiben sie unauffindbar im Speicher liegen
      (g.fotos || []).forEach(id => Store.deleteFoto(id).catch(() => {}));
      this.d().gigs = this.d().gigs.filter(x => x.id !== g.id);
      this.currentGigId = null;
      this.save();
      this.renderGigs();
    });
    document.getElementById('btn-print-gig').addEventListener('click', () => {
      const g = this.currentGig();
      if (!g) return;
      const verknuepft = this.gigSetlist(g);
      if (verknuepft) { Setlisten.druckeFuerTermin(verknuepft, g); return; }
      const songs = g.songIds.map(id => this.song(id)).filter(Boolean);
      this.printSongs(songs, g.name, this.gigSubtitle(g));
    });
    document.getElementById('gig-setlist').addEventListener('change', e => {
      const g = this.currentGig();
      if (!g) return;
      g.setlistId = e.target.value || null;
      this.save();
      this.renderGigDetail();
    });
    /* Bisher liess sich die Verknuepfung nur ueber den ersten Eintrag der
       Auswahlliste loesen – dass „eigene Liste nur fuer diesen Termin“ das
       Loesen bedeutet, sieht man ihr nicht an. Und zum Bearbeiten musste man
       den Reiter wechseln und die Setlist dort wiederfinden. */
    document.getElementById('btn-gig-setlist-los').addEventListener('click', () => {
      const g = this.currentGig();
      if (!g || !g.setlistId) return;
      const l = this.gigSetlist(g);
      if (!confirm(`Verknüpfung zu „${l ? l.name : 'der Setlist'}“ lösen?\n\n` +
        'Die Setlist selbst bleibt erhalten; dieser Termin bekommt wieder eine ' +
        'eigene Songliste.')) return;
      g.setlistId = null;
      this.save();
      this.renderGigDetail();
    });
    document.getElementById('btn-gig-setlist-auf').addEventListener('click', () => {
      const g = this.currentGig();
      if (g && g.setlistId) this.zurSetlist(g.setlistId);
    });
    [['gig-f-date', 'date'], ['gig-f-time', 'time'], ['gig-f-place', 'place'], ['gig-f-notes', 'notes']]
      .forEach(([id, field]) => document.getElementById(id).addEventListener('change', e => {
        const g = this.currentGig();
        if (!g) return;
        g[field] = e.target.value;
        this.save();
        if (field === 'date') this.renderGigs();
      }));
    /* ---- Fotos am Termin ---- */
    const ablage = document.getElementById('gig-fotos-ablage');
    document.getElementById('btn-gig-foto').addEventListener('click', () =>
      document.getElementById('gig-foto-datei').click());
    document.getElementById('gig-foto-datei').addEventListener('change', e => {
      this.fotosAufnehmen([...e.target.files]);
      e.target.value = '';
    });
    // Einfügen aus der Zwischenablage – funktioniert nur, wenn ein Termin offen ist
    document.addEventListener('paste', e => {
      if (!this.currentGig()) return;
      if (!document.getElementById('bandtab-termine').classList.contains('active')) return;
      const bilder = [...(e.clipboardData ? e.clipboardData.items : [])]
        .filter(i => i.type && i.type.startsWith('image/'))
        .map(i => i.getAsFile()).filter(Boolean);
      if (!bilder.length) return;
      e.preventDefault();
      this.fotosAufnehmen(bilder);
    });
    ['dragenter', 'dragover'].forEach(ev => ablage.addEventListener(ev, e => {
      e.preventDefault(); ablage.classList.add('drop-active');
    }));
    ['dragleave', 'drop'].forEach(ev => ablage.addEventListener(ev, () =>
      ablage.classList.remove('drop-active')));
    ablage.addEventListener('drop', e => {
      e.preventDefault();
      this.fotosAufnehmen([...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
    });

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
    const probeSuche = document.getElementById('rehearsal-suche');
    probeSuche.addEventListener('input', () => { this.probeMarkiert = 0; this.probeSuchen(); });
    probeSuche.addEventListener('keydown', e => {
      const zeilen = [...document.querySelectorAll('#rehearsal-suche-treffer li[data-wahl]')];
      if (e.key === 'Escape') { probeSuche.value = ''; this.probeSuchen(); return; }
      if (!zeilen.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = zeilen.length;
        this.probeMarkiert = (this.probeMarkiert + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        zeilen.forEach((z, i) => z.classList.toggle('markiert', i === this.probeMarkiert));
        zeilen[this.probeMarkiert].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        zeilen[Math.min(this.probeMarkiert, zeilen.length - 1)].click();
      }
    });

    this.renderAll();
  },

  renderAll() {
    this.syncWithClasses();   // erkennt auch Klassenlisten, die erst später dazukommen
    this.renderMembers();
    this.renderSongs();
    this.renderIdeas();
    this.renderGigs();
    this.renderRehearsals();
    // Setlisten greifen auf die Songs zu – nach jeder Songänderung neu zeichnen
    if (window.Setlisten) Setlisten.render();
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

  /* Mehrere Zeilen „Name; Klasse; Instrument“ einlesen (auch mit Tabulatoren) */
  parseMemberLines(text, standardBereich) {
    const out = [];
    for (let line of String(text || '').split(/\r?\n/)) {
      line = line.trim().replace(/^\d+[.)]?\s+/, '');   // laufende Nummer weg
      if (!line) continue;
      const teile = line.split(/\t|;|\|/).map(s => s.trim());
      const name = teile[0];
      if (!name) continue;
      const instrument = teile[2] || '';
      out.push({
        id: Store.uid(), name,
        klasse: teile[1] || '',
        // „Tech“ als Instrument heißt Technikteam
        area: /^tech/i.test(instrument) ? 'technik' : standardBereich,
        instrument,
      });
    }
    return out;
  },

  /* Namen über alle Klassenlisten suchen – beide Namensreihenfolgen, ohne Groß-/Kleinschreibung */
  matchStudents(name) {
    const n = Classes.parseName(name);
    if (!n || !n.last) return [];
    const norm = s => (s || '').toLowerCase().trim();
    const treffer = [];
    for (const cls of Classes.data.classes) {
      for (const s of cls.students) {
        const passt = [n, { first: n.last, last: n.first }].some(c => c.last &&
          norm(s.last) === norm(c.last) &&
          (!norm(c.first) || norm(s.first) === norm(c.first) ||
           norm(s.first).startsWith(norm(c.first)) || norm(c.first).startsWith(norm(s.first))));
        if (passt) treffer.push({ cls, s });
      }
    }
    return treffer;
  },

  /* Bandmitglieder mit Schülern aus den Klassenlisten verknüpfen.
     Läuft auch automatisch beim Öffnen – Klassenlisten, die erst später
     dazukommen, werden dadurch nachträglich erkannt. Bei mehreren gleichnamigen
     Schülern wird bewusst nicht verknüpft, um Fehlzuordnungen zu vermeiden. */
  syncWithClasses() {
    let neu = 0, geaendert = false;
    for (const m of this.d().members) {
      if (m.studentId) {
        const cls = Classes.data.classes.find(c => c.id === m.classId);
        const s = cls && cls.students.find(x => x.id === m.studentId);
        if (!s) { delete m.studentId; delete m.classId; geaendert = true; }  // Schüler gelöscht
        continue;
      }
      const treffer = this.matchStudents(m.name);
      if (treffer.length !== 1) continue;
      m.studentId = treffer[0].s.id;
      m.classId = treffer[0].cls.id;
      if (!m.klasse) m.klasse = this.shortClass(treffer[0].cls.name);
      neu++; geaendert = true;
    }
    if (geaendert) this.save();
    return neu;
  },

  ANSICHT_KEY: 'schooltool-band-ansicht',
  ansichtLesen() {
    try { return JSON.parse(localStorage.getItem(this.ANSICHT_KEY)) || {}; } catch (e) { return {}; }
  },
  ansichtMerken() {
    const a = {};
    ['band', 'technik', 'rolle', 'leitung'].forEach(k => { a[k] = document.getElementById('member-zeige-' + k).checked; });
    try { localStorage.setItem(this.ANSICHT_KEY, JSON.stringify(a)); } catch (e) { /* privates Fenster */ }
  },
  /* 'alle', 'band' oder 'technik' – aus den beiden Schaltern */
  memberFilter() {
    const band = document.getElementById('member-zeige-band').checked;
    const technik = document.getElementById('member-zeige-technik').checked;
    return band && technik ? 'alle' : technik ? 'technik' : 'band';
  },

  filteredMembers() {
    const f = this.memberFilter();
    return this.d().members
      .filter(m => f === 'alle' || m.area === f || m.area === 'beide')
      .sort((a, b) => this.byClass(a, b));
  },

  /* Schueler aus allen Klassen suchen – dieselbe Suche wie im Reiter
     „Klassen“. Ein Treffer fuellt das Formular, das Instrument fehlt dann noch. */
  suchMarkiert: 0,
  vorgemerkt: null,

  mitgliedSuchen() {
    const feld = document.getElementById('member-suche');
    const box = document.getElementById('member-suche-treffer');
    const suche = feld.value.trim().toLowerCase();
    box.innerHTML = '';
    // Ein einzelner Buchstabe traefe die halbe Schule – erst ab zwei lohnt es
    if (suche.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const treffer = Schueler.finde(suche);
    if (!treffer.length) {
      box.innerHTML = '<li class="hint">Kein Schüler gefunden – unten unter „Mitglied aufnehmen“ von Hand eintragen.</li>';
      return;
    }
    const dabei = new Map(this.d().members.filter(m => m.studentId).map(m => [m.studentId, m]));
    Schueler.neuerDurchgang();
    treffer.slice(0, 25).forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'treffer-mit-bild' + (i === this.suchMarkiert ? ' markiert' : '');
      li.dataset.schueler = t.s.id;
      const bild = document.createElement('span');
      bild.className = 'mini-gesicht ohne';
      bild.dataset.initialen = ((t.s.first || '')[0] || '') + ((t.s.last || '')[0] || '');
      const quelle = Schueler.fotoQuelle(t);
      if (quelle) Schueler.gesichtEinsetzen(bild, quelle.cls, quelle.s);
      const text = document.createElement('span');
      text.className = 'treffer-text';
      const name = document.createElement('span');
      name.className = 'treffer-name';
      name.textContent = t.name;
      const wo = document.createElement('span');
      wo.className = 'treffer-klasse';
      const schon = dabei.get(t.s.id);
      wo.textContent = t.cls.name + (schon ? ' · schon in der Band' : '');
      text.append(name, wo);
      li.append(bild, text);
      li.addEventListener('click', () => {
        feld.value = '';
        this.mitgliedSuchen();
        // Wer schon dabei ist, wird nicht doppelt aufgenommen, sondern gezeigt
        if (schon) { this.mitgliedZeigen(schon.id); return; }
        this.vorgemerkt = { name: t.name, sid: t.s.id, clsId: t.cls.id };
        document.getElementById('member-aufnehmen').open = true;
        document.getElementById('member-name').value = t.name;
        document.getElementById('member-class').value = this.shortClass(t.cls.name);
        document.getElementById('member-instrument').focus();
      });
      box.appendChild(li);
    });
    if (treffer.length > 25) {
      box.insertAdjacentHTML('beforeend', `<li class="hint">… und ${treffer.length - 25} weitere – genauer tippen.</li>`);
    }
  },

  /* Der verknuepfte Schueler samt Klasse – Grundlage fuer Foto und Steckbrief */
  schuelerVon(m) {
    if (!m.studentId) return null;
    const cls = Classes.data.classes.find(c => c.id === m.classId);
    const s = cls && cls.students.find(x => x.id === m.studentId);
    return s ? { cls, s, name: Classes.studentName(s) } : null;
  },

  /* Gesicht aus dem Sitzplan – aus der eigenen Klasse oder vom Namensvetter
     in einer anderen (wie im Schueler-Steckbrief) */
  gesichtFuerMitglied(el, m, kante) {
    el.style.backgroundImage = '';
    el.dataset.gesichtFuer = '';
    el.classList.add('ohne');
    const teile = m.name.includes(',')
      ? m.name.split(',').map(x => x.trim()).reverse()
      : m.name.split(/\s+/);
    el.dataset.initialen = ((teile[0] || '')[0] || '') + ((teile[teile.length - 1] || '')[0] || '');
    const t = this.schuelerVon(m);
    const quelle = t && Schueler.fotoQuelle(t);
    if (quelle) Schueler.gesichtEinsetzen(el, quelle.cls, quelle.s, kante);
    return !!quelle;
  },


  /* ---------- Mitglieder ---------- */
  /* Angekreuzte Mitglieder – als Menge, damit die Auswahl das Neuzeichnen
     ueberlebt: Die Liste wird bei jeder Kleinigkeit neu aufgebaut, und wer
     gerade fuenf Namen zusammengesucht hat, will sie nicht wieder verlieren. */
  gewaehlteMitglieder: new Set(),

  gewaehlte() {
    const ids = new Set(this.d().members.map(m => m.id));
    // Geloeschte Mitglieder aus der Auswahl entfernen
    for (const id of [...this.gewaehlteMitglieder]) if (!ids.has(id)) this.gewaehlteMitglieder.delete(id);
    return this.d().members.filter(m => this.gewaehlteMitglieder.has(m.id));
  },

  /* Zaehler am Knopf und Zustand des Kopf-Kaestchens nachziehen */
  auswahlAnzeigen() {
    const knopf = document.getElementById('btn-print-members-sel');
    const anzahl = this.gewaehlte().length;
    if (knopf) {
      knopf.innerHTML = Icons.raw('printer') + 'Ausgewählte drucken' + (anzahl ? ` (${anzahl})` : '');
      knopf.disabled = !anzahl;
    }
    const alle = document.getElementById('member-pick-all');
    if (alle) {
      const sichtbar = this.filteredMembers();
      const gewaehltSichtbar = sichtbar.filter(m => this.gewaehlteMitglieder.has(m.id)).length;
      alle.checked = sichtbar.length > 0 && gewaehltSichtbar === sichtbar.length;
      alle.indeterminate = gewaehltSichtbar > 0 && gewaehltSichtbar < sichtbar.length;
    }
  },

  /* Das Mitglied, dessen Steckbrief rechts offen ist */
  aktivesMitglied: null,

  /* Klassenleitung als kleine Kuerzel-Marken (1 = KL, 2 = 2. KL) */
  leitungsMarken(klasse) {
    const box = document.createElement('span');
    box.className = 'leitungs-zelle';
    const personen = Classes.leitungsPersonen(klasse);
    personen.forEach((pn, idx) => {
      if (idx) box.append(' ');
      /* Der Tooltip haengt an jeder Person einzeln: Wer auf „PT“ zeigt, will
         wissen, wer PT ist – nicht die ganze Klassenleitung auf einmal lesen.
         data-tip statt title, der eingebaute Tooltip kaeme erst nach etwa
         einer Sekunde. aria-label bleibt fuer Screenreader. */
      const person = document.createElement('span');
      person.className = 'leitungs-person';
      const text = (pn.rolle === 'KL' ? '1. Klassenleitung' : '2. Klassenleitung') +
        ': ' + (pn.name || pn.kuerzel + ' (nicht in der Lehrerliste)');
      person.dataset.tip = text;
      person.setAttribute('aria-label', text);
      const ziffer = document.createElement('b');
      ziffer.className = 'rolle-ziffer rolle-' + Classes.rolleZiffer(pn.rolle);
      ziffer.textContent = Classes.rolleZiffer(pn.rolle);
      const kz = document.createElement('span');
      kz.textContent = pn.kuerzel;
      person.append(ziffer, kz);
      box.appendChild(person);
    });
    return box;
  },

  /* Schlichte Liste: Klasse, Name, auf Wunsch Rolle und
     Klassenleitung. Bearbeitet wird rechts im Steckbrief. */
  renderMembers() {
    const box = document.getElementById('member-list');
    if (!box) return;
    const list = this.filteredMembers();
    document.getElementById('member-count').textContent = list.length;
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = this.d().members.length
        ? '<p class="hint">In dieser Gruppe ist niemand.</p>'
        : '<p class="hint">Noch keine Mitglieder aufgenommen – rechts unter „Mitglied aufnehmen“ geht’s los.</p>';
    }

    const mitRolle = document.getElementById('member-zeige-rolle').checked;
    const mitLeitung = document.getElementById('member-zeige-leitung').checked;
    const ul = document.createElement('ul');
    ul.className = 'member-zeilen';
    if (list.length) box.appendChild(ul);
    for (const m of list) {
      const li = document.createElement('li');
      li.dataset.id = m.id;
      li.classList.toggle('aktiv', m.id === this.aktivesMitglied);

      const pick = document.createElement('input');
      pick.type = 'checkbox';
      pick.className = 'member-pick';
      pick.checked = this.gewaehlteMitglieder.has(m.id);
      pick.title = `${m.name} für den Ausdruck auswählen`;
      // Nur die Menge pflegen, nicht neu zeichnen – sonst springt die Liste
      // unter dem Finger weg, waehrend man mehrere ankreuzt
      pick.addEventListener('change', () => {
        if (pick.checked) this.gewaehlteMitglieder.add(m.id);
        else this.gewaehlteMitglieder.delete(m.id);
        li.classList.toggle('gewaehlt', pick.checked);
        this.auswahlAnzeigen();
      });
      li.classList.toggle('gewaehlt', pick.checked);

      const klasse = document.createElement('span');
      klasse.className = 'n-klasse';
      klasse.textContent = m.klasse || '–';

      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'mname';
      name.textContent = m.name;
      name.title = 'Steckbrief zeigen – nochmal tippen zum Schließen';
      name.addEventListener('click', () => this.mitgliedZeigen(m.id === this.aktivesMitglied ? null : m.id));

      li.append(pick, klasse, name);
      if (m.studentId) {
        const mark = document.createElement('span');
        mark.className = 'link-mark';
        mark.innerHTML = Icons.raw('check');
        const cls = Classes.data.classes.find(c => c.id === m.classId);
        mark.title = 'Mit der Klassenliste verknüpft' + (cls ? ` (${cls.name})` : '');
        li.appendChild(mark);
      }
      const rechts = document.createElement('span');
      rechts.className = 'member-rechts';
      if (mitRolle) {
        const instr = document.createElement('span');
        instr.className = 'minstr';
        instr.textContent = m.instrument || '';
        rechts.appendChild(instr);
        if (m.area !== 'band') {
          const tag = document.createElement('span');
          tag.className = 'bereich-tag bereich-' + m.area;
          tag.textContent = m.area === 'technik' ? 'Technik' : 'Band + Technik';
          rechts.appendChild(tag);
        }
      }
      if (mitLeitung && m.klasse) rechts.appendChild(this.leitungsMarken(m.klasse));
      li.appendChild(rechts);
      ul.appendChild(li);
    }
    this.auswahlAnzeigen();
    this.renderBesetzung();
    this.renderMemberProfil();
  },

  mitgliedZeigen(id) {
    this.aktivesMitglied = id;
    document.querySelectorAll('#member-list li').forEach(li =>
      li.classList.toggle('aktiv', li.dataset.id === id));
    this.renderMemberProfil();
    this.renderBesetzung();
    if (id && window.matchMedia('(max-width: 800px)').matches) {
      document.getElementById('member-steckbrief').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  /* Pfeil hoch/runter im Steckbrief: innerhalb der angezeigten Liste */
  mitgliedBlaettern(dir) {
    const list = this.filteredMembers();
    const i = list.findIndex(m => m.id === this.aktivesMitglied);
    const ziel = list[i + dir];
    if (ziel) this.mitgliedZeigen(ziel.id);
  },

  renderMemberProfil() {
    const box = document.getElementById('member-steckbrief');
    if (!box) return;
    const list = this.filteredMembers();
    const i = list.findIndex(m => m.id === this.aktivesMitglied);
    const m = list[i];
    if (!m) { this.aktivesMitglied = null; box.hidden = true; return; }
    box.hidden = false;
    document.getElementById('member-profil-name').textContent = m.name;
    const hatFoto = this.gesichtFuerMitglied(document.getElementById('member-foto'), m, 320);
    const verknuepft = !!this.schuelerVon(m);
    document.getElementById('btn-member-zum-schueler').hidden = !verknuepft;
    const fotoKnopf = document.getElementById('btn-member-foto');
    fotoKnopf.hidden = !verknuepft;
    fotoKnopf.innerHTML = Icons.raw('upload') + (hatFoto ? 'Foto ersetzen' : 'Foto hochladen');
    document.getElementById('member-foto').classList.toggle('hochladbar', verknuepft);
    document.getElementById('member-foto').title = verknuepft ? 'Foto hochladen – oder ein Bild hierher ziehen' : '';
    document.getElementById('member-foto-hinweis').hidden = verknuepft;
    document.getElementById('member-position').textContent = `${i + 1} von ${list.length}`;
    const vor = document.getElementById('btn-member-vor');
    const weiter = document.getElementById('btn-member-weiter');
    vor.disabled = i === 0;
    weiter.disabled = i === list.length - 1;
    vor.querySelector('span').textContent = list[i - 1] ? list[i - 1].name : '';
    weiter.querySelector('span').textContent = list[i + 1] ? list[i + 1].name : '';

    // Felder nicht ueberschreiben, waehrend jemand darin tippt
    const setze = (id, wert) => {
      const el = document.getElementById(id);
      if (document.activeElement !== el) el.value = wert || '';
    };
    setze('mp-name', m.name);
    setze('mp-klasse', m.klasse);
    setze('mp-bereich', m.area);
    setze('mp-instrument', m.instrument);

    const dl = document.getElementById('member-profil-angaben');
    dl.innerHTML = '';
    const zeile = (dt, inhalt) => {
      const t = document.createElement('dt'); t.textContent = dt;
      const d = document.createElement('dd');
      if (typeof inhalt === 'string') d.textContent = inhalt; else d.appendChild(inhalt);
      dl.append(t, d);
    };
    const personen = Classes.leitungsPersonen(m.klasse);
    zeile('Klassenleitung', personen.length
      ? personen.map(pn => `${Classes.rolleZiffer(pn.rolle)}. ${pn.name || pn.kuerzel}`).join(', ')
      : (m.klasse ? `für „${m.klasse}“ nicht eingetragen (Reiter „Lehrer“)` : '–'));
    const cls = m.studentId && Classes.data.classes.find(c => c.id === m.classId);
    zeile('Klassenliste', cls ? `verknüpft (${cls.name})` : 'nicht verknüpft');
  },

  /* Rechts, solange niemand gewaehlt ist: wer spielt was */
  renderBesetzung() {
    const box = document.getElementById('member-besetzung');
    if (!box) return;
    box.hidden = !!this.aktivesMitglied;
    const alle = this.d().members;
    box.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = 'Besetzung';
    box.appendChild(h);
    if (!alle.length) {
      box.insertAdjacentHTML('beforeend', '<p class="hint">Hier erscheint die Übersicht, sobald Mitglieder aufgenommen sind.</p>');
      return;
    }
    const band = alle.filter(m => m.area !== 'technik').length;
    const technik = alle.filter(m => m.area !== 'band').length;
    const klassen = new Set(alle.map(m => (m.klasse || '').trim()).filter(Boolean)).size;
    const zahlen = document.createElement('div');
    zahlen.className = 'besetzung-zahlen';
    [[band, 'Band'], [technik, 'Technik'], [klassen, klassen === 1 ? 'Klasse' : 'Klassen']].forEach(([n, t]) => {
      const d = document.createElement('div');
      d.innerHTML = `<b>${n}</b><span>${t}</span>`;
      zahlen.appendChild(d);
    });
    box.appendChild(zahlen);

    // Instrumente zaehlen; Schreibweisen wie „e-bass“ und „E-Bass“ zusammenfassen
    const zaehler = new Map();
    for (const m of alle) {
      if (m.area === 'technik') continue;
      const roh = (m.instrument || '').trim() || 'ohne Angabe';
      const key = roh.toLowerCase();
      const e = zaehler.get(key) || { name: roh, n: 0 };
      e.n++;
      zaehler.set(key, e);
    }
    if (zaehler.size) {
      const chips = document.createElement('div');
      chips.className = 'besetzung-chips';
      [...zaehler.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'de'))
        .forEach(e => {
          const c = document.createElement('span');
          c.className = 'besetzung-chip';
          c.textContent = e.name;
          const n = document.createElement('b');
          n.textContent = e.n;
          c.appendChild(n);
          chips.appendChild(c);
        });
      box.appendChild(chips);
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
    const f = this.memberFilter();
    const titel = f === 'band' ? 'Schulband' : f === 'technik' ? 'Technikteam' : 'Schulband und Technikteam';
    this.druckeMitglieder(list, titel);
  },

  /* Nur die Angekreuzten – fuer Befreiungen, bei denen nicht die ganze Band
     gemeldet wird, sondern drei Namen. */
  printMembersAuswahl() {
    const list = this.gewaehlte();
    if (!list.length) { alert('Es ist niemand ausgewählt.'); return; }
    this.druckeMitglieder(list, 'Schulband – Auswahl');
  },

  /* Im Ausdruck die Namen, nicht die Kuerzel: Das Blatt geht ins Sekretariat
     oder an Kollegen, die die Kuerzel nicht alle im Kopf haben. */
  leitungText(klasse) {
    const p = Classes.leitungsPersonen(klasse);
    if (!p.length) return '';
    return p.map(x => `${Classes.rolleZiffer(x.rolle)}. ${x.name || x.kuerzel}`).join(', ');
  },

  /* Rolle wie in der Liste: Instrument bzw. Aufgabe, dazu der Bereich,
     wenn jemand (auch) im Technikteam ist */
  rolleText(m) {
    const instrument = (m.instrument || '').trim();
    if (m.area === 'technik') return instrument && !/^tech/i.test(instrument) ? `${instrument} · Technik` : 'Technik';
    if (m.area === 'beide') return [instrument, 'Band + Technik'].filter(Boolean).join(' · ');
    return instrument;
  },

  /* Spalten wie auf dem Bildschirm: Klasse und Name immer, Rolle und
     Klassenleitung je nach Schalter */
  mitgliederSpalten() {
    const sp = [
      { titel: 'Klasse', cls: 'klasse', wert: m => m.klasse || '–' },
      { titel: 'Name', wert: m => m.name },
    ];
    if (document.getElementById('member-zeige-rolle').checked) sp.push({ titel: 'Rolle', wert: m => this.rolleText(m) });
    if (document.getElementById('member-zeige-leitung').checked) sp.push({ titel: 'Klassenleitung', wert: m => this.leitungText(m.klasse) || '–' });
    return sp;
  },

  /* Schwarz-weiß und eng wie die Liste im Browser – ohne Steckbrief und Besetzung */
  druckeMitglieder(list, titel) {
    const sp = this.mitgliederSpalten();
    const tabelle = this.printTable(sp.map(({ titel: t, cls }) => ({ titel: t, cls })),
      list.map(m => sp.map(x => this.esc(x.wert(m)))), 'kompakt sw-liste');
    const feld = document.getElementById('member-anlass');
    const anlass = feld ? feld.value.trim() : '';
    // Der Anlass steht unter dem Titel, die Zahl klein darunter – auf
    // einer Befreiung ist der Anlass das, was das Sekretariat sucht.
    this.printHtml(titel, tabelle, `${list.length} Schüler`, anlass, 'sw');
  },

  /* Angekreuzte – oder, wenn keiner angekreuzt ist, alle angezeigten – in die
     Zwischenablage. Spalten durch Tabulator getrennt: In einer Tabelle landen
     sie gleich in eigenen Spalten, im Text stehen sie sauber untereinander. */
  async mitgliederKopieren(knopf, nurNamen) {
    const gewaehlt = this.gewaehlte();
    const list = (gewaehlt.length ? gewaehlt : this.filteredMembers())
      .sort((a, b) => this.byClass(a, b));
    if (!list.length) { alert('Die Liste ist leer.'); return; }
    const sp = this.mitgliederSpalten();
    const text = list.map(m => nurNamen ? m.name : sp.map(x => x.wert(m)).join('\t')).join('\n');
    let ok = true;
    try { await navigator.clipboard.writeText(text); } catch (e) { ok = this.kopierenAlt(text); }
    const alt = knopf.innerHTML;
    knopf.textContent = ok ? `✓ ${list.length} kopiert` : 'Kopieren ging nicht';
    knopf.disabled = true;
    setTimeout(() => { knopf.innerHTML = alt; knopf.disabled = false; }, 1800);
  },

  /* Rueckfalltuer fuer Browser, die die Zwischenablage nicht direkt freigeben */
  kopierenAlt(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  },

  exportMembers() {
    const list = this.filteredMembers();
    if (!list.length) { alert('Die Liste ist leer.'); return; }
    let csv = 'Klasse;Name;Bereich;Instrument;Klassenleitung\n';
    list.forEach(m => csv += `${m.klasse};${m.name};${this.AREAS[m.area] || ''};` +
                             `${m.instrument || ''};${this.leitungText(m.klasse)}\n`);
    this.download(csv, 'Schulband-Mitglieder.csv', 'text/csv;charset=utf-8');
  },

  /* Die Klassen, aus denen Band- oder Technikmitglieder kommen. Der Reiter
     „Lehrer“ filtert damit auf die Klassenleitungen, die einen betreffen. */
  klassenMitMitgliedern() {
    const raus = new Set();
    for (const m of this.d().members) {
      const k = String(m.klasse || '').trim();
      if (k) raus.add(Classes.klassenKern(k));
    }
    return raus;
  },

  /* Die Band- und Technikmitglieder einer Klasse – „7a“ trifft auch „7a_I“.
     Der Reiter „Lehrer“ zeigt damit, um welche Kinder es bei einer
     Klassenleitung ueberhaupt geht. */
  mitgliederAusKlasse(klassenname) {
    const kern = Classes.klassenKern(klassenname);
    if (!kern) return [];
    return this.d().members
      .filter(m => m.klasse && Classes.klassenKern(m.klasse) === kern)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  },

  /* ---------- Songs und Songvorschläge ---------- */
  renderSongs() {
    this.renderSongListe('song');
    this.fillGigSongPicker();
  },
  renderIdeas() {
    this.renderSongListe('idea');
  },

  /* Songs und Vorschlaege sehen gleich aus: links eine schlichte Liste,
     rechts der Steckbrief zum Bearbeiten. pre = 'song' oder 'idea'. */
  songAuswahl: { song: new Set(), idea: new Set() },
  songAktiv: { song: null, idea: null },
  SONG_ANSICHT_KEY: 'schooltool-band-songansicht',

  songListe(pre) { return pre === 'song' ? this.d().songs : this.d().ideas; },
  songsGewaehlt(pre) { return this.songListe(pre).filter(s => this.songAuswahl[pre].has(s.id)); },

  songAnsichtBinden(pre) {
    const $ = id => document.getElementById(id);
    const keySel = $(pre + '-f-key');
    this.KEYS.forEach(k => keySel.add(new Option(k || '–', k)));
    const capoSel = $(pre + '-f-capo');
    ['', '0', '1', '2', '3', '4', '5', '6', '7'].forEach(c =>
      capoSel.add(new Option(c === '' ? '–' : (c === '0' ? 'ohne' : '+' + c), c)));

    let ansicht = {};
    try { ansicht = JSON.parse(localStorage.getItem(this.SONG_ANSICHT_KEY)) || {}; } catch (e) { /* leer */ }
    const notizSchalter = $(pre + '-zeige-notizen');
    notizSchalter.checked = !!ansicht[pre];
    notizSchalter.addEventListener('change', () => {
      ansicht[pre] = notizSchalter.checked;
      try { localStorage.setItem(this.SONG_ANSICHT_KEY, JSON.stringify(ansicht)); } catch (e) { /* privates Fenster */ }
      this.renderSongListe(pre);
    });

    $(pre + '-pick-all').addEventListener('change', e => {
      for (const s of this.songListe(pre)) {
        if (e.target.checked) this.songAuswahl[pre].add(s.id); else this.songAuswahl[pre].delete(s.id);
      }
      this.renderSongListe(pre);
    });

    const aktiv = () => this.songListe(pre).find(s => s.id === this.songAktiv[pre]);
    [['title', true], ['artist'], ['key'], ['capo'], ['tempo'], ['notes']].forEach(([k, pflicht]) => {
      $(`${pre}-f-${k}`).addEventListener('change', e => {
        const s = aktiv();
        if (!s) return;
        const v = k === 'notes' ? e.target.value : e.target.value.trim();
        if (pflicht && !v) { e.target.value = s[k] || ''; return; }
        s[k] = v;
        this.save();
        if (pre === 'song') this.renderAll(); else this.renderSongListe(pre);
      });
    });
    $(`btn-${pre}-zu`).addEventListener('click', () => this.songZeigen(pre, null));
    $(`btn-${pre}-vor`).addEventListener('click', () => this.songBlaettern(pre, -1));
    $(`btn-${pre}-weiter`).addEventListener('click', () => this.songBlaettern(pre, 1));
    $(`btn-${pre}-loeschen`).addEventListener('click', () => {
      const s = aktiv();
      if (!s) return;
      const frage = pre === 'idea'
        ? `Vorschlag „${s.title}“ löschen?`
        : `Song „${s.title}“ löschen? Er verschwindet auch aus Setlisten.`;
      if (!confirm(frage)) return;
      if (pre === 'idea') {
        this.d().ideas = this.d().ideas.filter(x => x.id !== s.id);
      } else {
        this.d().songs = this.d().songs.filter(x => x.id !== s.id);
        this.d().gigs.forEach(g => g.songIds = g.songIds.filter(id => id !== s.id));
      }
      // In Probenplänen bleibt der Song als freier Eintrag stehen
      this.d().rehearsals.forEach(r => {
        if (!Object.prototype.hasOwnProperty.call(r.songs, s.id)) return;
        if (!r.frei) r.frei = {};
        r.frei[s.id] = { title: s.title, artist: s.artist || '' };
      });
      this.songAktiv[pre] = null;
      this.save();
      this.renderAll();
    });
    if (pre === 'idea') {
      $('btn-idea-uebernehmen').addEventListener('click', () => {
        const s = aktiv();
        if (!s) return;
        const schonDa = this.d().songs.some(x => x.title.toLowerCase() === s.title.toLowerCase());
        if (schonDa && !confirm(`„${s.title}“ steht schon in den Songs. Trotzdem noch einmal kopieren?`)) return;
        this.d().songs.push({ ...s, id: Store.uid() });
        this.save();
        this.renderAll();
        alert(`„${s.title}“ ist jetzt im Song-Bereich.`);
      });
    }
  },

  renderSongListe(pre) {
    const box = document.getElementById(pre + '-list');
    if (!box) return;
    const songs = this.songListe(pre);
    const auswahl = this.songAuswahl[pre];
    // Geloeschte aus der Auswahl nehmen
    const ids = new Set(songs.map(s => s.id));
    for (const id of [...auswahl]) if (!ids.has(id)) auswahl.delete(id);

    document.getElementById(pre + '-count').textContent = songs.length;
    box.innerHTML = '';
    if (!songs.length) {
      box.innerHTML = `<p class="hint">Noch ${pre === 'idea' ? 'keine Vorschläge' : 'keine Songs'} angelegt – rechts geht’s los.</p>`;
    } else {
      const mitNotizen = document.getElementById(pre + '-zeige-notizen').checked;
      const ul = document.createElement('ul');
      ul.className = 'member-zeilen song-zeilen';
      for (const s of songs) {
        const li = document.createElement('li');
        li.dataset.id = s.id;
        li.classList.toggle('aktiv', s.id === this.songAktiv[pre]);
        const pick = document.createElement('input');
        pick.type = 'checkbox';
        pick.checked = auswahl.has(s.id);
        pick.title = 'Für „Ausgewählte drucken“ markieren';
        pick.addEventListener('change', () => {
          if (pick.checked) auswahl.add(s.id); else auswahl.delete(s.id);
          li.classList.toggle('gewaehlt', pick.checked);
          this.songAuswahlAnzeigen(pre);
        });
        li.classList.toggle('gewaehlt', pick.checked);

        const text = document.createElement('div');
        text.className = 'song-text';
        const titel = document.createElement('button');
        titel.type = 'button';
        titel.className = 'mname';
        titel.textContent = s.title;
        titel.title = 'Details zeigen – nochmal tippen zum Schließen';
        titel.addEventListener('click', () => this.songZeigen(pre, s.id === this.songAktiv[pre] ? null : s.id));
        text.appendChild(titel);
        if (s.artist) {
          const a = document.createElement('span');
          a.className = 'song-artist';
          a.textContent = s.artist;
          text.appendChild(a);
        }
        if (mitNotizen && s.notes) {
          const n = document.createElement('div');
          n.className = 'song-notiz';
          n.textContent = s.notes;
          text.appendChild(n);
        }
        const rechts = document.createElement('span');
        rechts.className = 'member-rechts minstr';
        rechts.textContent = this.songLine(s);
        li.append(pick, text, rechts);
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
    this.songAuswahlAnzeigen(pre);
    this.renderSongProfil(pre);
  },

  songAuswahlAnzeigen(pre) {
    const songs = this.songListe(pre);
    const n = this.songsGewaehlt(pre).length;
    const knopf = document.getElementById(`btn-print-${pre}s-sel`);
    knopf.innerHTML = Icons.raw('printer') + 'Ausgewählte drucken' + (n ? ` (${n})` : '');
    knopf.disabled = !n;
    const alle = document.getElementById(pre + '-pick-all');
    alle.checked = songs.length > 0 && n === songs.length;
    alle.indeterminate = n > 0 && n < songs.length;
  },

  songZeigen(pre, id) {
    this.songAktiv[pre] = id;
    document.querySelectorAll(`#${pre}-list li`).forEach(li =>
      li.classList.toggle('aktiv', li.dataset.id === id));
    this.renderSongProfil(pre);
    if (id && window.matchMedia('(max-width: 800px)').matches) {
      document.getElementById(pre + '-steckbrief').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  songBlaettern(pre, dir) {
    const songs = this.songListe(pre);
    const i = songs.findIndex(s => s.id === this.songAktiv[pre]);
    if (songs[i + dir]) this.songZeigen(pre, songs[i + dir].id);
  },

  renderSongProfil(pre) {
    const box = document.getElementById(pre + '-steckbrief');
    const songs = this.songListe(pre);
    const i = songs.findIndex(s => s.id === this.songAktiv[pre]);
    const s = songs[i];
    if (!s) { this.songAktiv[pre] = null; box.hidden = true; return; }
    box.hidden = false;
    document.getElementById(pre + '-profil-titel').textContent = s.title;
    document.getElementById(pre + '-position').textContent = `${i + 1} von ${songs.length}`;
    const vor = document.getElementById(`btn-${pre}-vor`);
    const weiter = document.getElementById(`btn-${pre}-weiter`);
    vor.disabled = i === 0;
    weiter.disabled = i === songs.length - 1;
    vor.querySelector('span').textContent = songs[i - 1] ? songs[i - 1].title : '';
    weiter.querySelector('span').textContent = songs[i + 1] ? songs[i + 1].title : '';
    // Felder nicht ueberschreiben, waehrend jemand darin tippt
    ['title', 'artist', 'key', 'capo', 'tempo', 'notes'].forEach(k => {
      const el = document.getElementById(`${pre}-f-${k}`);
      if (document.activeElement !== el) el.value = s[k] == null ? '' : String(s[k]);
    });
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
    const tabelle = this.printTable(
      [{ titel: 'Nr.', cls: 'num' }, { titel: 'Song' },
       { titel: 'Tonart · Capo · Tempo' }, { titel: 'Anmerkungen' }],
      songs.map((s, i) => [
        i + 1,
        `<strong>${this.esc(s.title)}</strong>` +
          (s.artist ? `<span class="sub">${this.esc(s.artist)}</span>` : ''),
        this.esc(this.songLine(s)) || '–',
        this.esc(s.notes || ''),
      ]));
    this.printHtml(titel, tabelle, untertitel || `${songs.length} Songs`);
  },

  /* ---------- Termine ---------- */
  renderGigs() {
    const ul = document.getElementById('gig-list');
    if (!ul) return;
    ul.innerHTML = '';
    const gigs = [...this.d().gigs].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    if (!gigs.length) ul.innerHTML = '<li class="hint">Noch keine Termine angelegt.</li>';
    this.renderGigKalender();
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
      // Nochmal auf denselben Termin: wieder zuklappen
      li.addEventListener('click', () => {
        this.currentGigId = this.currentGigId === g.id ? null : g.id;
        this.renderGigs();
      });
      ul.appendChild(li);
    }
    this.renderGigDetail();
  },

  /* ---------- Kleiner Monatskalender über den Terminen ----------
     Spalten Mo–So; Tage mit Auftritt sind eingefärbt und führen per Klick
     zum Termin. Gerechnet wird mit 'YYYY-MM-DD'-Zeichenketten, weil
     Date.toISOString() je nach Sommerzeit einen Tag zurückrutscht. */
  kalMonat: null,            // erster Tag des angezeigten Monats, null = laufender Monat

  kalSchiebe(schritte) {
    const m = this.kalMonat || new Date();
    this.kalMonat = new Date(m.getFullYear(), m.getMonth() + schritte, 1);
    this.renderGigKalender();
  },

  isoTag(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  },

  renderGigKalender() {
    const gitter = document.getElementById('kal-gitter');
    if (!gitter) return;
    const heute = new Date();
    const monat = this.kalMonat || new Date(heute.getFullYear(), heute.getMonth(), 1);
    document.getElementById('kal-titel').textContent =
      monat.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    // An einem Tag können mehrere Termine liegen – daher je Tag eine Liste
    const proTag = {};
    for (const g of this.d().gigs) {
      if (!g.date) continue;
      if (!proTag[g.date]) proTag[g.date] = [];
      proTag[g.date].push(g);
    }

    gitter.innerHTML = '';
    for (const wt of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) {
      const kopf = document.createElement('div');
      kopf.className = 'kal-wt';
      kopf.textContent = wt;
      gitter.appendChild(kopf);
    }

    // getDay() zählt ab Sonntag; der Versatz dreht die Woche auf Montag
    const versatz = (monat.getDay() + 6) % 7;
    const tageImMonat = new Date(monat.getFullYear(), monat.getMonth() + 1, 0).getDate();
    const felder = Math.ceil((versatz + tageImMonat) / 7) * 7;
    const heuteIso = this.isoTag(heute);

    for (let i = 0; i < felder; i++) {
      const tag = new Date(monat.getFullYear(), monat.getMonth(), 1 - versatz + i);
      const iso = this.isoTag(tag);
      const zelle = document.createElement('div');
      zelle.className = 'kal-tag';
      zelle.textContent = tag.getDate();
      if (tag.getMonth() !== monat.getMonth()) zelle.classList.add('fremd');
      if (iso === heuteIso) zelle.classList.add('heute');
      const termine = proTag[iso];
      if (termine) {
        zelle.classList.add('auftritt');
        zelle.title = termine
          .map(g => [g.name, g.time, g.place].filter(Boolean).join(' · '))
          .join('\n');
        zelle.addEventListener('click', () => {
          this.currentGigId = termine[0].id;
          this.renderGigs();
        });
      }
      gitter.appendChild(zelle);
    }
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
    this.renderGigFotos();

    this.fuelleSetlistWahl(g);
    const verknuepft = this.gigSetlist(g);
    // Die beiden Knoepfe ergeben nur Sinn, solange eine Setlist verknuepft ist
    document.getElementById('btn-gig-setlist-auf').hidden = !verknuepft;
    document.getElementById('btn-gig-setlist-los').hidden = !verknuepft;
    const hinweis = document.getElementById('gig-setlist-hinweis');
    const ol = document.getElementById('gig-songs');
    const auswahl = document.getElementById('gig-add-song');
    ol.innerHTML = '';

    if (verknuepft) {
      // Verknüpft: die Songs kommen aus der Setlist und werden auch dort gepflegt –
      // so muss dieselbe Liste nicht zweimal angelegt werden.
      document.getElementById('gig-song-count').textContent = verknuepft.eintraege.length;
      auswahl.hidden = true;
      hinweis.textContent = `Die Songs stammen aus der Setlist „${verknuepft.name}“ ` +
        `(${verknuepft.kategorie}). „Bearbeiten“ öffnet sie; Änderungen erscheinen ` +
        'hier automatisch. „Verknüpfung lösen“ gibt diesem Termin wieder eine eigene Liste.';
      for (const eintrag of verknuepft.eintraege) {
        const s = this.song(eintrag.songId);
        if (!s) continue;
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'sname';
        const extra = this.songLine(s);
        label.innerHTML = `<strong>${this.esc(s.title)}</strong>` +
          (s.artist ? ` <span class="hint">– ${this.esc(s.artist)}</span>` : '') +
          (extra ? ` <span class="hint">(${this.esc(extra)})</span>` : '');
        li.appendChild(label);
        const anm = [];
        if (s.notes && s.notes.trim() && !eintrag.eigeneAus) anm.push(s.notes.trim());
        if (eintrag.notiz && eintrag.notiz.trim()) anm.push(eintrag.notiz.trim());
        if (anm.length) {
          const p = document.createElement('span');
          p.className = 'hint gig-anmerkung';
          p.textContent = anm.join(' · ');
          li.appendChild(p);
        }
        ol.appendChild(li);
      }
      if (!verknuepft.eintraege.length) {
        ol.innerHTML = '<li class="hint">Diese Setlist enthält noch keine Songs.</li>';
      }
      return;
    }

    auswahl.hidden = false;
    hinweis.textContent = 'Ohne Verknüpfung stellst du die Songs hier nur für diesen ' +
      'Termin zusammen.';
    document.getElementById('gig-song-count').textContent = g.songIds.length;
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

  /* ---------- Fotos am Termin ----------
     Die Bilder liegen wie die Sitzpläne in IndexedDB, nicht im normalen
     Datensatz – der Termin merkt sich nur die Kennungen. */
  MAX_FOTO: 4 * 1024 * 1024,

  async fotosAufnehmen(dateien) {
    const g = this.currentGig();
    if (!g || !dateien.length) return;
    if (!Array.isArray(g.fotos)) g.fotos = [];
    const zuGross = [];
    for (const datei of dateien) {
      if (datei.size > this.MAX_FOTO) { zuGross.push(datei.name || 'Bild'); continue; }
      const id = Store.uid();
      await Store.putFoto(id, datei);
      g.fotos.push(id);
    }
    this.save();
    await this.renderGigFotos();
    if (zuGross.length) alert('Zu groß für den Sync (Grenze 4 MB):\n' + zuGross.join('\n'));
  },

  async renderGigFotos() {
    const box = document.getElementById('gig-fotos');
    if (!box) return;
    const g = this.currentGig();
    box.innerHTML = '';
    // Alte Vorschau-Adressen freigeben, sonst wächst der Speicher
    (this._fotoUrls || []).forEach(u => URL.revokeObjectURL(u));
    this._fotoUrls = [];
    if (!g || !Array.isArray(g.fotos) || !g.fotos.length) return;

    for (const id of [...g.fotos]) {
      const eintrag = await Store.getFoto(id);
      if (!eintrag || !eintrag.blob) { g.fotos = g.fotos.filter(x => x !== id); continue; }
      const url = URL.createObjectURL(eintrag.blob);
      this._fotoUrls.push(url);

      const kachel = document.createElement('div');
      kachel.className = 'foto-kachel';
      // Das Bild steht in voller Breite da; der Link ist nur für die Originalgröße
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.title = 'In Originalgröße öffnen';
      const img = document.createElement('img');
      img.src = url;
      img.alt = eintrag.name || 'Foto';
      // Bewusst kein loading="lazy": Die Bilder stecken in einem Bereich, der erst
      // beim Öffnen des Termins sichtbar wird – dann blieben sie leer stehen.
      a.appendChild(img);
      const weg = document.createElement('button');
      weg.className = 'del';
      weg.type = 'button';
      weg.innerHTML = Icons.raw('x');
      weg.title = 'Bild entfernen';
      weg.addEventListener('click', async () => {
        if (!confirm('Dieses Bild entfernen?')) return;
        g.fotos = g.fotos.filter(x => x !== id);
        await Store.deleteFoto(id);
        this.save();
        this.renderGigFotos();
      });
      kachel.append(a, weg);
      box.appendChild(kachel);
    }
  },

  /* Die mit einem Termin verknüpfte Setlist – oder null bei eigener Liste */
  gigSetlist(g) {
    if (!g || !g.setlistId || !window.Setlisten) return null;
    return Setlisten.d().setlists.find(s => s.id === g.setlistId) || null;
  },

  /* Zur verknuepften Setlist springen: Reiter wechseln, Kategorie einblenden,
     Setlist oeffnen. Ohne das Einblenden staende sie hinter einem Filter und
     man suchte sie vergeblich. */
  zurSetlist(id) {
    if (!window.Setlisten) return;
    const l = Setlisten.d().setlists.find(s => s.id === id);
    if (!l) { alert('Diese Setlist gibt es nicht mehr.'); return; }
    if (Setlisten.auswahl().size) {
      Setlisten.auswahl().add(l.kategorie);
      Setlisten.merkeAuswahl();
    }
    Setlisten.aktuelleId = id;
    const knopf = document.querySelector('.bandtab-btn[data-bandtab="setlisten"]');
    if (knopf) knopf.click();
    Setlisten.render();
    const box = document.getElementById('setlist-detail');
    if (box && !box.hidden) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },

  fuelleSetlistWahl(g) {
    const sel = document.getElementById('gig-setlist');
    if (!sel || !window.Setlisten) return;
    sel.innerHTML = '<option value="">— eigene Liste nur für diesen Termin —</option>';
    for (const l of Setlisten.d().setlists) {
      const o = document.createElement('option');
      o.value = l.id;
      o.textContent = `${l.kategorie}: ${l.name}` + (l.datum ? ` (${this.fmt(l.datum)})` : '');
      o.selected = g.setlistId === l.id;
      sel.appendChild(o);
    }
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
      const n = this.probeEintraege(r).length;
      cnt.textContent = n ? `${n} Songs geprobt` : 'nichts eingetragen';
      li.append(name, cnt);
      li.addEventListener('click', () => { this.currentRehearsalId = r.id; this.renderRehearsals(); });
      ul.appendChild(li);
    }
    this.renderRehearsalDetail();
  },

  /* Eine Probe merkt sich in r.songs { id: Anmerkung } – in der Reihenfolge,
     in der die Songs hinzukamen. Die id zeigt auf einen Song, einen Vorschlag
     oder einen freien Eintrag in r.frei { id: { title, artist } }. */
  probeEintrag(r, id) {
    const s = this.song(id);
    if (s) return { ...s, herkunft: 'song' };
    const v = this.d().ideas.find(x => x.id === id);
    if (v) return { ...v, herkunft: 'idea' };
    const f = r.frei && r.frei[id];
    if (f) return { id, title: f.title, artist: f.artist || '', herkunft: 'frei' };
    return null;
  },
  probeEintraege(r) {
    return Object.keys(r.songs || {}).map(id => this.probeEintrag(r, id)).filter(Boolean);
  },

  probeSuchen() {
    const ul = document.getElementById('rehearsal-suche-treffer');
    const r = this.currentRehearsal();
    const text = document.getElementById('rehearsal-suche').value.trim();
    ul.innerHTML = '';
    if (!r || !text) { ul.hidden = true; return; }
    const q = text.toLowerCase();
    const passt = s => s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q);
    const treffer = [
      ...this.d().songs.filter(passt).map(s => ({ s, art: 'Song' })),
      ...this.d().ideas.filter(passt).map(s => ({ s, art: 'Vorschlag' })),
    ].filter(t => !Object.prototype.hasOwnProperty.call(r.songs, t.s.id)).slice(0, 12);

    const zeile = (name, unter, los) => {
      const li = document.createElement('li');
      li.dataset.wahl = '1';
      const n = document.createElement('span');
      n.className = 'treffer-name';
      n.textContent = name;
      const u = document.createElement('span');
      u.className = 'treffer-klasse';
      u.textContent = unter;
      li.append(n, u);
      li.addEventListener('click', los);
      ul.appendChild(li);
    };
    for (const { s, art } of treffer) {
      zeile(s.title, art + (s.artist ? ' · ' + s.artist : ''), () => this.probeHinzu(r, s.id));
    }
    // Frei eintragen, solange kein Song genau so heißt
    const genau = [...this.d().songs, ...this.d().ideas, ...this.probeEintraege(r)]
      .some(s => s.title.toLowerCase() === q);
    if (!genau) {
      zeile(`„${text}“ frei eintragen`, 'steht weder in „Songs“ noch in „Vorschläge“', () => {
        const id = Store.uid();
        if (!r.frei) r.frei = {};
        r.frei[id] = { title: text, artist: '' };
        this.probeHinzu(r, id);
      });
    }
    if (!ul.children.length) ul.innerHTML = '<li class="hint">Schon in dieser Probe.</li>';
    const zeilen = ul.querySelectorAll('li[data-wahl]');
    if (zeilen.length) zeilen[Math.min(this.probeMarkiert || 0, zeilen.length - 1)].classList.add('markiert');
    ul.hidden = false;
  },

  probeHinzu(r, id) {
    if (!Object.prototype.hasOwnProperty.call(r.songs, id)) r.songs[id] = '';
    this.save();
    const feld = document.getElementById('rehearsal-suche');
    feld.value = '';
    this.probeSuchen();
    this.renderRehearsals();
    feld.focus();
  },

  /* Freien Eintrag zum Vorschlag oder Song machen. Die id bleibt, damit die
     Probe ihn weiter findet; gleichnamige freie Einträge in anderen Proben
     zeigen danach auf denselben Song. */
  freiUebernehmen(r, id, pre) {
    const f = r.frei && r.frei[id];
    if (!f) return;
    this.songListe(pre).push({ id, title: f.title, artist: f.artist || '', key: '', capo: '', tempo: '', notes: '' });
    const titel = f.title.toLowerCase();
    for (const p of this.d().rehearsals) {
      if (!p.frei) continue;
      for (const [fid, x] of Object.entries(p.frei)) {
        if (x.title.toLowerCase() !== titel) continue;
        delete p.frei[fid];
        if (fid === id) continue;
        if (Object.prototype.hasOwnProperty.call(p.songs, id)) { delete p.songs[fid]; continue; }
        // Schlüssel umbenennen, Reihenfolge behalten
        p.songs = Object.fromEntries(Object.entries(p.songs).map(([k, v]) => [k === fid ? id : k, v]));
      }
    }
    this.save();
    this.renderAll();
  },

  renderRehearsalDetail() {
    const r = this.currentRehearsal();
    document.getElementById('rehearsal-detail').hidden = !r;
    if (!r) return;
    document.getElementById('rehearsal-title').textContent = 'Probe am ' + this.fmt(r.date);
    document.getElementById('rehearsal-notes').value = r.notes || '';
    this.probeSuchen();

    const table = document.getElementById('rehearsal-table');
    table.innerHTML = '<tr><th>Song</th><th>Anmerkung zu dieser Probe</th><th></th></tr>';
    const eintraege = this.probeEintraege(r);
    if (!eintraege.length) {
      table.innerHTML += '<tr><td colspan="3" class="hint">Noch keine Songs in dieser Probe – ' +
        'oben suchen und hinzufügen.</td></tr>';
      return;
    }
    for (const s of eintraege) {
      const tr = document.createElement('tr');

      const tdT = document.createElement('td');
      tdT.textContent = s.title + (s.artist ? ' – ' + s.artist : '');
      if (s.herkunft === 'idea') {
        const tag = document.createElement('span');
        tag.className = 'probe-herkunft';
        tag.textContent = 'Vorschlag';
        tdT.appendChild(tag);
      } else if (s.herkunft === 'frei') {
        const knoepfe = document.createElement('div');
        knoepfe.className = 'probe-frei';
        [['idea', 'In Vorschläge'], ['song', 'In Songs']].forEach(([pre, label]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'small';
          b.textContent = '→ ' + label;
          b.title = `„${s.title}“ mit einem Klick in ${pre === 'song' ? '„Songs“' : '„Vorschläge“'} übernehmen`;
          b.addEventListener('click', () => this.freiUebernehmen(r, s.id, pre));
          knoepfe.appendChild(b);
        });
        tdT.appendChild(knoepfe);
      }

      const tdN = document.createElement('td');
      const note = document.createElement('input');
      note.type = 'text';
      note.className = 'cell-input';
      note.placeholder = 'z. B. Tempo schneller, Bridge nochmal';
      note.value = r.songs[s.id] || '';
      note.addEventListener('change', () => {
        r.songs[s.id] = note.value;
        this.save();
      });
      tdN.appendChild(note);

      const tdX = document.createElement('td');
      tdX.className = 'pick-spalte';
      const weg = document.createElement('button');
      weg.type = 'button';
      weg.className = 'probe-weg';
      weg.textContent = '×';
      weg.title = 'Aus dieser Probe nehmen';
      weg.addEventListener('click', () => {
        delete r.songs[s.id];
        if (r.frei) delete r.frei[s.id];
        this.save();
        this.renderRehearsals();
      });
      tdX.appendChild(weg);

      tr.append(tdT, tdN, tdX);
      table.appendChild(tr);
    }
  },

  printRehearsal() {
    const r = this.currentRehearsal();
    if (!r) return;
    const done = this.probeEintraege(r);
    const inhalt = (r.notes ? `<p>${this.esc(r.notes)}</p>` : '') + (done.length
      ? this.printTable(
          [{ titel: 'Nr.', cls: 'num' }, { titel: 'Song' },
           { titel: 'Tonart · Capo · Tempo' }, { titel: 'Anmerkung zur Probe' }],
          done.map((s, i) => [
            i + 1,
            `<strong>${this.esc(s.title)}</strong>` +
              (s.artist ? `<span class="sub">${this.esc(s.artist)}</span>` : ''),
            this.esc(this.songLine(s)) || '–',
            this.esc(r.songs[s.id] || ''),
          ]))
      : '<p>Für diese Probe sind noch keine Songs eingetragen.</p>');
    this.printHtml('Probe', inhalt, this.fmt(r.date) + (done.length ? ` · ${done.length} Songs` : ''));
  },

  /* ---------- Drucken und Export ---------- */
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /* Einheitliches Druckbild: Titel, Eckdaten-Zeile, Inhalt, Fußzeile.
     `links`/`rechts` sind die kleinen Angaben unter dem Titel. */
  printHtml(titel, inhalt, links, rechts, stil) {
    document.querySelectorAll('.print-area').forEach(el => el.remove());
    const heute = new Date().toLocaleDateString('de-DE',
      { day: '2-digit', month: 'long', year: 'numeric' });
    const box = document.createElement('div');
    box.className = 'print-area band-print' + (stil ? ' ' + stil : '');
    // Der Termin des Ereignisses steht groß unter dem Titel; das Druckdatum
    // gehört klein in die Fußzeile – nicht umgekehrt.
    box.innerHTML =
      `<h1>${this.esc(titel)}</h1>` +
      (rechts ? `<div class="termin">${this.esc(rechts)}</div>` : '') +
      (links ? `<div class="meta"><span>${this.esc(links)}</span></div>` : '') +
      inhalt +
      `<div class="fuss">School-Tool · gedruckt am ${heute}</div>`;
    document.body.appendChild(box);
    // Der Seitentitel wird beim „Als PDF speichern“ zum Dateinamen – sonst hieße
    // jede Datei „School-Tool – Lehrer-Werkzeuge“.
    const alterTitel = document.title;
    document.title = this.dateiname(titel);
    window.print();
    document.title = alterTitel;
    setTimeout(() => box.remove(), 500);
  },

  /* Die Überschrift wird zum Dateinamen – Zeichen raus, die Dateisysteme nicht mögen */
  dateiname(titel) {
    return String(titel || '')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90) || 'School-Tool';
  },

  /* Tabelle fürs Druckbild bauen – mit thead, damit die Kopfzeile auf jeder Seite steht */
  /* zusatzKlasse: z. B. „kompakt“ für enge Zeilen, damit lange Listen auf eine Seite passen */
  printTable(spalten, zeilen, zusatzKlasse) {
    const kopf = spalten.map(s => `<th${s.cls ? ` class="${s.cls}"` : ''}>${this.esc(s.titel)}</th>`).join('');
    const koerper = zeilen.map(z => '<tr>' + z.map((zelle, i) =>
      `<td${spalten[i].cls ? ` class="${spalten[i].cls}"` : ''}>${zelle}</td>`).join('') + '</tr>').join('');
    return `<table${zusatzKlasse ? ` class="${zusatzKlasse}"` : ''}>` +
      `<thead><tr>${kopf}</tr></thead><tbody>${koerper}</tbody></table>`;
  },

  download(text, filename, type) {
    const blob = new Blob(['﻿' + text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    // nicht sofort freigeben: Safari (iPad) holt die Datei erst nach dem Klick
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  },
};
