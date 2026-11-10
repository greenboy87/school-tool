/* Schüler-Steckbrief: ein Schüler auf einen Blick – Gesicht, Klasse, Noten,
   eigene Notizen. Er steht im Reiter „Klassen“ rechts neben der Klassenliste
   und erscheint, sobald ein Schüler gewählt ist. Die Gesichter stammen aus dem
   Sitzplan (Klassenfoto plus Rahmen je Schüler); hier wird nur ausgeschnitten,
   nichts neu gespeichert. */
const Schueler = {
  aktuell: null,          // { klasseId, schuelerId }
  markiert: 0,            // Pfeiltasten-Auswahl in der Trefferliste
  _bilder: {},            // Fotoschlüssel → geladenes Image (je Durchgang)
  _ausschnitte: {},       // Ausschnitt-Schlüssel → dataURL

  init() {
    const foto = document.getElementById('profil-foto');
    if (foto) {
      this.fotoFeldVerdrahten(foto, document.getElementById('btn-profil-foto'),
        document.getElementById('profil-foto-datei'), () => this.gewaehlt());
    }
    const notiz = document.getElementById('profil-notiz');
    if (notiz) {
      notiz.addEventListener('input', () => {
        const t = this.gewaehlt();
        if (!t) return;
        const text = notiz.value;
        if (text.trim()) t.s.notiz = text; else delete t.s.notiz;
        Classes.persist();
      });
    }
    this.bilderVerdrahten();
    // Notfallliste: Häkchen setzt s.notfall = { text }, der Text steht darunter
    const nf = document.getElementById('profil-notfall');
    const nfText = document.getElementById('profil-notfall-text');
    if (nf && nfText) {
      nf.addEventListener('change', () => {
        const t = this.gewaehlt();
        if (!t) return;
        if (nf.checked) {
          t.s.notfall = t.s.notfall || { text: '' };
        } else {
          if (t.s.notfall && t.s.notfall.text && !confirm('Von der Notfallliste nehmen? Der Notfall-Text wird dabei gelöscht.')) {
            nf.checked = true;
            return;
          }
          delete t.s.notfall;
        }
        nfText.value = (t.s.notfall || {}).text || '';
        nfText.hidden = !nf.checked;
        if (nf.checked) nfText.focus();
        Classes.persist();
        try { Classes.renderStudents(); } catch (e) {}
        if (window.Notfall) Notfall.zahlStellen();
      });
      nfText.addEventListener('input', () => {
        const t = this.gewaehlt();
        if (!t || !t.s.notfall) return;
        t.s.notfall.text = nfText.value;
        Classes.persist();
      });
    }
    // Nachteilsausgleich für Exen: Notenschutz und Zeitzuschlag, nur lokal
    ['profil-ex-ns', 'profil-ex-zuschlag', 'profil-ex-einheit'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(id === 'profil-ex-zuschlag' ? 'input' : 'change', () => this.exAngabenSpeichern());
    });
    const an = (id, f) => { const el = document.getElementById(id); if (el) el.addEventListener('click', f); };
    an('btn-profil-vor', () => this.blaettern(-1));
    an('btn-profil-weiter', () => this.blaettern(1));
    an('btn-steckbrief-zu', () => this.auswahlAufheben());
    an('btn-auswahl-weg', () => this.auswahlAufheben());
    an('btn-profil-name', () => this.umbenennen());

    // Esc wählt ab – nur wenn gerade nichts getippt wird. Ist ein Bild groß
    // offen, schließt Esc nur das Bild.
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !this.aktuell) return;
      const ziel = e.target;
      if (ziel && ziel.closest && ziel.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (typeof Sitzplan !== 'undefined' && Sitzplan.gesichter) return;
      if (document.querySelector('dialog[open]')) return;
      this.auswahlAufheben();
    });
  },

  /* Ist der Steckbrief gerade zu sehen? Dann gehören ↑/↓ den Schülern. */
  imSteckbrief() {
    const reiter = document.getElementById('tab-klassen');
    const sub = document.getElementById('subtab-schueler');
    return !!(this.zeigbar() && reiter && reiter.classList.contains('active') &&
              sub && sub.classList.contains('active'));
  },

  /* Gewählt und in der offenen Klasse */
  zeigbar() {
    const t = this.gewaehlt();
    return t && Classes.currentClassId === t.cls.id ? t : null;
  },

  /* Schüler wählen: Klasse öffnen (auch über den Schuljahr-Filter hinweg),
     Unterreiter „Schüler“, Steckbrief rechts. */
  oeffne(klasseId, schuelerId) {
    this.aktuell = { klasseId, schuelerId };
    this.auswahlKnopfStellen();
    this.fokusWeg();
    const reiter = document.querySelector('.tab-btn[data-tab="klassen"]');
    if (reiter && !reiter.classList.contains('active')) reiter.click();
    Classes.springeZuSchueler(klasseId, schuelerId);
    this.steckbriefInSicht();
  },

  /* Klick in der Klassenliste: wählen – oder, beim schon gewählten, abwählen */
  umschalten(klasseId, schuelerId) {
    const a = this.aktuell;
    if (a && a.klasseId === klasseId && a.schuelerId === schuelerId) { this.auswahlAufheben(); return; }
    this.aktuell = { klasseId, schuelerId };
    this.markierungStellen();
    this.zeigeProfil();
    this.auswahlKnopfStellen();
    this.steckbriefInSicht();
  },

  /* Voriger / nächster Schüler in der Reihenfolge der Klassenliste.
     Am Anfang und Ende der Liste ist Schluss, damit man merkt, wo man ist. */
  blaettern(schritt) {
    const t = this.zeigbar();
    if (!t) return false;
    const liste = t.cls.students;
    const ziel = liste[liste.indexOf(t.s) + schritt];
    if (!ziel) return false;
    this.aktuell = { klasseId: t.cls.id, schuelerId: ziel.id };
    this.markierungStellen();
    this.zeigeProfil();
    const zeile = document.querySelector(`#student-list li[data-id="${ziel.id}"]`);
    if (zeile) zeile.scrollIntoView({ block: 'nearest' });
    return true;
  },

  /* Die gewählte Zeile in der Klassenliste sichtbar markieren */
  markierungStellen() {
    const id = this.zeigbar() ? this.aktuell.schuelerId : null;
    document.querySelectorAll('#student-list li').forEach(li =>
      li.classList.toggle('gewaehlt', li.dataset.id === id));
  },

  /* Auf schmalen Bildschirmen steht der Steckbrief unter der Liste */
  steckbriefInSicht() {
    if (window.innerWidth > 800) return;
    const el = document.getElementById('steckbrief');
    if (el && !el.hidden) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },

  blaetterLeisteStellen(cls, s) {
    const liste = cls.students;
    const pos = liste.indexOf(s);
    const stelle = (id, nachbar) => {
      const knopf = document.getElementById(id);
      knopf.disabled = !nachbar;
      knopf.querySelector('span').textContent = nachbar ? Classes.studentName(nachbar) : '';
      knopf.classList.toggle('unsichtbar', !nachbar);
    };
    stelle('btn-profil-vor', liste[pos - 1]);
    stelle('btn-profil-weiter', liste[pos + 1]);
    document.getElementById('profil-position').textContent = `${pos + 1} von ${liste.length}`;
  },

  /* Alles zurück auf Anfang: Suchwort und Treffer weg, kein Schüler mehr
     gewählt, keine Markierung in der Liste. Die Klasse bleibt offen. */
  auswahlAufheben() {
    this.aktuell = null;
    this.markiert = 0;
    const feld = document.getElementById('schueler-suche');
    if (feld) { feld.value = ''; Classes.sucheSchueler(); feld.blur(); }
    document.querySelectorAll('#student-list li.gefunden').forEach(li => li.classList.remove('gefunden'));
    this.markierungStellen();
    this.auswahlKnopfStellen();
    this.zeigeProfil();
  },

  /* Das × gibt es nur, wenn etwas aufzuheben ist */
  auswahlKnopfStellen() {
    const knopf = document.getElementById('btn-auswahl-weg');
    if (!knopf) return;
    const feld = document.getElementById('schueler-suche');
    knopf.hidden = !((feld && feld.value) || this.aktuell);
  },

  /* Ein Suchfeld behielte sonst den Fokus und schluckte die Pfeiltasten */
  fokusWeg() {
    const a = document.activeElement;
    if (a && a !== document.body && a.blur) a.blur();
  },

  /* Pfeiltasten wandern durch die Treffer, Enter wählt den markierten */
  trefferTasten(e, feld, boxId) {
    const zeilen = [...document.querySelectorAll(`#${boxId} li[data-schueler]`)];
    if (!zeilen.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = zeilen.length;
      this.markiert = (this.markiert + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const z = zeilen[Math.min(this.markiert, zeilen.length - 1)];
      this.trefferWaehlen(feld, z.dataset.klasse, z.dataset.schueler);
      return;
    } else {
      return;
    }
    zeilen.forEach((z, i) => z.classList.toggle('markiert', i === this.markiert));
    zeilen[this.markiert].scrollIntoView({ block: 'nearest' });
  },

  /* Feld leeren, damit die Trefferliste nicht stehen bleibt – dann wählen */
  trefferWaehlen(feld, klasseId, schuelerId) {
    if (feld) { feld.value = ''; feld.dispatchEvent(new Event('input')); }
    this.oeffne(klasseId, schuelerId);
  },

  /* Alle Treffer über alle Klassen – dieselbe Regel wie in der Klassensuche */
  finde(suche) {
    const treffer = [];
    for (const cls of Classes.data.classes) {
      for (const s of cls.students) {
        const name = Classes.studentName(s);
        const andersrum = [s.first, s.last].filter(Boolean).join(' ');
        if (name.toLowerCase().includes(suche) || andersrum.toLowerCase().includes(suche)) {
          treffer.push({ cls, s, name });
        }
      }
    }
    treffer.sort((a, b) => a.name.localeCompare(b.name, 'de') ||
                           a.cls.name.localeCompare(b.cls.name, 'de'));
    return treffer;
  },

  /* Eine Trefferzeile mit kleinem Gesicht – geteilt mit der Klassensuche */
  trefferZeile(t, markiert) {
    const li = document.createElement('li');
    li.className = 'treffer-mit-bild' + (markiert ? ' markiert' : '');
    li.dataset.klasse = t.cls.id;
    li.dataset.schueler = t.s.id;
    const bild = document.createElement('span');
    bild.className = 'mini-gesicht ohne';
    bild.dataset.initialen = ((t.s.first || '')[0] || '') + ((t.s.last || '')[0] || '');
    const quelle = this.fotoQuelle(t);
    if (quelle) this.gesichtEinsetzen(bild, quelle.cls, quelle.s);
    const text = document.createElement('span');
    text.className = 'treffer-text';
    const name = document.createElement('span');
    name.className = 'treffer-name';
    name.textContent = t.name;
    const wo = document.createElement('span');
    wo.className = 'treffer-klasse';
    const kl = ((t.cls.leitung || {}).kl || '').trim();
    const leitung = kl ? (Classes.lehrer()[kl.toUpperCase()] || kl) : '';
    wo.textContent = t.cls.name + (leitung ? ` · KL ${leitung}` : '');
    text.append(name, wo);
    li.append(bild, text);
    li.addEventListener('click', () =>
      this.trefferWaehlen(document.getElementById('schueler-suche'), t.cls.id, t.s.id));
    return li;
  },

  gewaehlt() {
    if (!this.aktuell) return null;
    const cls = Classes.data.classes.find(c => c.id === this.aktuell.klasseId);
    const s = cls && cls.students.find(x => x.id === this.aktuell.schuelerId);
    return s ? { cls, s } : null;
  },

  /* Derselbe Name in anderen Klassen – etwa die Kopie fürs nächste Schuljahr
     oder ein Wahlkurs. Dort liegt womöglich das Foto, das hier fehlt. */
  auchIn(t) {
    const gleich = x => (x.last || '').toLowerCase() === (t.s.last || '').toLowerCase() &&
                        (x.first || '').toLowerCase() === (t.s.first || '').toLowerCase();
    const raus = [];
    for (const cls of Classes.data.classes) {
      if (cls.id === t.cls.id) continue;
      const s = cls.students.find(gleich);
      if (s) raus.push({ cls, s });
    }
    return raus;
  },

  /* Wo liegt ein Gesicht? Erst in der eigenen Klasse, sonst beim Namensvetter */
  fotoQuelle(t, andere = null) {
    if (Sitzplan.bildVon(t.cls, t.s.id)) return t;
    return (andere || this.auchIn(t)).find(a => Sitzplan.bildVon(a.cls, a.s.id)) || null;
  },

  /* Tippfehler im Namen korrigieren. Exen, Noten und Sitzplan hängen an der
     Schüler-ID, nicht am Namen – sie ziehen also von selbst mit. */
  umbenennen() {
    const t = this.gewaehlt();
    if (!t) return;
    const ein = prompt('Neuer Name – „Nachname, Vorname“ oder „Vorname Nachname“:', Classes.studentName(t.s));
    if (ein == null) return;
    const n = Classes.parseName(ein);
    if (!n || !n.last) { alert('Bitte einen Namen eingeben.'); return; }
    if (n.first === (t.s.first || '') && n.last === t.s.last) return;
    t.s.first = n.first;
    t.s.last = n.last;
    Classes.sortStudents(t.cls);
    Classes.persist();
    try { Classes.renderStudents(); } catch (e) {}
    document.dispatchEvent(new CustomEvent('ex-sitzungen'));
    this.zeigeProfil();
  },

  zeigeProfil() {
    const karte = document.getElementById('steckbrief');
    if (!karte) return;
    // Wer die Klasse wechselt, lässt die Wahl hinter sich
    if (this.aktuell && !this.zeigbar()) { this.aktuell = null; this.auswahlKnopfStellen(); }
    const t = this.zeigbar();
    karte.hidden = !t;
    if (!t) return;
    this.neuerDurchgang();
    const { cls, s } = t;
    const andere = this.auchIn(t);

    this.blaetterLeisteStellen(cls, s);
    document.getElementById('profil-name').textContent =
      [s.first, s.last].filter(Boolean).join(' ');

    // Das Gesicht aus dieser Klasse – sonst aus einer anderen mit demselben Namen
    const foto = document.getElementById('profil-foto');
    foto.style.backgroundImage = '';
    foto.dataset.gesichtFuer = '';
    foto.classList.add('ohne');
    foto.dataset.initialen = ((s.first || '')[0] || '') + ((s.last || '')[0] || '');
    const quelle = this.fotoQuelle(t, andere);
    if (quelle) this.gesichtEinsetzen(foto, quelle.cls, quelle.s, 320);
    document.getElementById('profil-foto-hinweis').hidden = !!quelle;
    document.getElementById('btn-profil-foto').innerHTML =
      Icons.raw('upload') + (quelle ? 'Foto ersetzen' : 'Foto hochladen');

    // Steckbrief-Zeilen
    const angaben = document.getElementById('profil-angaben');
    angaben.innerHTML = '';
    const zeile = (titel, wert) => {
      if (!wert) return;
      const dt = document.createElement('dt');
      dt.textContent = titel;
      const dd = document.createElement('dd');
      if (wert instanceof Node) dd.appendChild(wert); else dd.textContent = wert;
      angaben.append(dt, dd);
    };
    const lehrer = Classes.lehrer();
    const lt = k => { k = (k || '').trim(); return k ? (lehrer[k.toUpperCase()] || k) : ''; };
    const l = cls.leitung || {};
    zeile('Klassenleitung', [lt(l.kl), lt(l.co)].filter(Boolean).join(' / '));
    if (Classes.medien(cls).includes(s.id)) zeile('Aufgabe', 'Medienmanager');
    const platz = this.sitzplatz(cls, s);
    if (platz) zeile('Sitzplatz', platz);
    if (andere.length) {
      const wo = document.createElement('span');
      andere.forEach((a, i) => {
        if (i) wo.append(', ');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link-knopf';
        b.textContent = a.cls.name + (a.cls.year ? ` (${a.cls.year})` : '');
        b.addEventListener('click', () => this.oeffne(a.cls.id, a.s.id));
        wo.append(b);
      });
      zeile('Auch in', wo);
    }

    // Noten aus „Projekte & Noten“
    const noten = document.getElementById('profil-noten');
    noten.innerHTML = '';
    const mitNote = (cls.projects || []).filter(p => p.grades && p.grades[s.id]);
    if (!mitNote.length) {
      noten.innerHTML = '<li class="hint">Noch keine Noten eingetragen.</li>';
    } else {
      for (const p of mitNote) {
        const li = document.createElement('li');
        const n = document.createElement('span');
        n.textContent = p.name + (p.date ? ` · ${this.datum(p.date)}` : '');
        const g = document.createElement('strong');
        g.textContent = p.grades[s.id];
        li.append(n, g);
        noten.appendChild(li);
      }
    }

    document.getElementById('profil-notiz').value = s.notiz || '';
    const nf = document.getElementById('profil-notfall');
    if (nf) {
      nf.checked = !!s.notfall;
      const nfText = document.getElementById('profil-notfall-text');
      if (document.activeElement !== nfText) nfText.value = (s.notfall || {}).text || '';
      nfText.hidden = !s.notfall;
    }
    this.bilderZeichnen();
    const ex = document.getElementById('profil-ex-ns');
    if (ex) {
      ex.checked = !!s.exNotenschutz;
      document.getElementById('profil-ex-zuschlag').value = s.exZuschlag ? s.exZuschlag.wert : '';
      document.getElementById('profil-ex-einheit').value = s.exZuschlag ? s.exZuschlag.einheit : 'min';
    }
  },

  exAngabenSpeichern() {
    const t = this.gewaehlt();
    if (!t) return;
    if (document.getElementById('profil-ex-ns').checked) t.s.exNotenschutz = true; else delete t.s.exNotenschutz;
    const wert = Math.round(Number(document.getElementById('profil-ex-zuschlag').value));
    const einheit = document.getElementById('profil-ex-einheit').value === '%' ? '%' : 'min';
    if (wert > 0 && wert <= 120) t.s.exZuschlag = { wert, einheit }; else delete t.s.exZuschlag;
    Classes.persist();
  },

  datum(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${+m[3]}.${+m[2]}.${m[1]}` : iso;
  },

  /* Im Plan liegt Reihe 0 oben, die Tafel unten – also von der Tafel aus zählen.
     Bewusst nicht Sitzplan.plan(): das legte nebenbei einen leeren Plan an. */
  sitzplatz(cls, s) {
    const p = cls.sitzplan;
    if (!p || !p.belegt || !(p.reihen > 0)) return '';
    const k = Object.keys(p.belegt).find(k => p.belegt[k] === s.id);
    const m = k && /^(\d+)-(\d+)$/.exec(k);
    if (!m) return '';
    return `${p.reihen - +m[1]}. Reihe von vorn, ${+m[2] + 1}. Platz von links`;
  },

  /* ---------- Bilder mit eigenem Text ----------
     Zu jedem Schüler beliebig viele Bilder, jedes mit eigenem Text daneben –
     etwa ein Foto der Medikamente und dazu, wann was zu nehmen ist. Im Schüler
     steht nur [{ id, text }]; das Bild selbst liegt verkleinert in IndexedDB
     („fotos“) und geht von dort einzeln verschlüsselt durch den Sync, wie die
     Bilder zur Stunde. Der Dateiname reist dabei unverschlüsselt mit – deshalb
     heißt jedes Bild gleich und nie nach dem Kind. */
  BILD_NAME: 'Bild.jpg',
  _bildLauf: 0,            // zählt die Anzeigen – eine überholte lädt nicht weiter
  _bildUrls: [],
  _nachgeholt: {},         // Bild-ID → schon versucht, es vom Server zu holen

  bilderVerdrahten() {
    const bereich = document.getElementById('profil-bilder-bereich');
    if (!bereich) return;
    const eingabe = document.getElementById('profil-bild-datei');
    document.getElementById('btn-profil-bild').addEventListener('click', () => {
      if (this.gewaehlt()) eingabe.click();
    });
    eingabe.addEventListener('change', () => {
      const t = this.gewaehlt();
      const dateien = [...eingabe.files];
      eingabe.value = '';
      if (t) this.bilderDazu(t, dateien);
    });

    // Hierher ziehen. Der Unterreiter ringsum nimmt Klassenlisten an und
    // übergeht diesen Bereich (data-eigene-ablage).
    let tiefe = 0;
    const mitDateien = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    bereich.addEventListener('dragenter', e => {
      if (!mitDateien(e)) return;
      e.preventDefault();
      if (++tiefe === 1) bereich.classList.add('drop-active');
    });
    bereich.addEventListener('dragover', e => {
      if (!mitDateien(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    bereich.addEventListener('dragleave', () => {
      if (--tiefe <= 0) { tiefe = 0; bereich.classList.remove('drop-active'); }
    });
    bereich.addEventListener('drop', e => {
      tiefe = 0;
      bereich.classList.remove('drop-active');
      if (!mitDateien(e)) return;
      e.preventDefault();
      const t = this.gewaehlt();
      if (!t) return;
      const bilder = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type));
      if (!bilder.length) { alert('Hier lassen sich nur Bilder ablegen (JPG, PNG …).'); return; }
      this.bilderDazu(t, bilder);
    });

    document.addEventListener('paste', e => this.einfuegen(e));
    /* Safari bietet ⌘V außerhalb von Eingabefeldern nur an, wenn die Seite
       vorher meldet, dass sie das Einfügen selbst übernimmt */
    document.addEventListener('beforepaste', e => { if (this.imSteckbrief()) e.preventDefault(); });
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    document.querySelectorAll('.taste-einfuegen').forEach(k => { k.textContent = mac ? '⌘V' : 'Strg+V'; });
  },

  /* ⌘V / Strg+V: Bilder aus der Zwischenablage gehen zum gezeigten Schüler –
     ob gerade im Notizfeld getippt wird oder nirgends. In andere Eingabefelder
     (etwa die Suche) und in offene Fenster wird wie immer eingefügt, Text sowieso. */
  einfuegen(e) {
    if (e.defaultPrevented || !this.imSteckbrief() || document.querySelector('dialog[open]')) return;
    const ziel = e.target;
    const feld = ziel && ziel.closest && ziel.closest('input, textarea, select, [contenteditable="true"]');
    if (feld && !feld.closest('#steckbrief')) return;
    const bilder = this.bilderAus(e.clipboardData);
    if (!bilder.length) return;
    e.preventDefault();
    this.bilderDazu(this.zeigbar(), bilder);
  },

  /* Bilder aus der Zwischenablage: ein Bildschirmfoto, ein im Browser
     kopiertes Bild oder eine im Finder kopierte Bilddatei */
  bilderAus(daten) {
    if (!daten) return [];
    const bilder = [...(daten.items || [])]
      .filter(i => i.kind === 'file' && /^image\//.test(i.type))
      .map(i => i.getAsFile()).filter(Boolean);
    return bilder.length ? bilder : [...(daten.files || [])].filter(f => /^image\//.test(f.type));
  },

  /* Den Schüler frisch aus den Daten holen, nicht ein altes Objekt weiterreichen */
  schuelerZu(klasseId, schuelerId) {
    const cls = Classes.data.classes.find(c => c.id === klasseId);
    return (cls && cls.students.find(x => x.id === schuelerId)) || null;
  },

  /* Neue Bilder klein rechnen (lange Seite 1600 px), ablegen und an den
     Schüler hängen. t ist der Schüler beim Einfügen – auch wenn inzwischen
     weitergeblättert wurde. */
  async bilderDazu(t, dateien) {
    if (!t || !dateien.length) return;
    const neu = [];
    for (const datei of dateien) {
      let blob;
      try { blob = await Stundenplan.bildVerkleinern(datei); }
      catch (e) { alert(`„${datei.name || 'Bild'}“ ließ sich nicht lesen – am besten als JPG oder PNG versuchen.`); continue; }
      const id = 'schueler-' + Store.uid();
      try { await Store.putFoto(id, new File([blob], this.BILD_NAME, { type: blob.type || 'image/jpeg' })); }
      catch (e) { alert('Das Bild konnte nicht gespeichert werden.\n\n' + (e.message || e)); continue; }
      neu.push({ id });
    }
    if (!neu.length) return;
    // Erst jetzt in die Daten: Beim Sync danach liegt das Bild schon bereit
    const s = this.schuelerZu(t.cls.id, t.s.id) || t.s;
    s.bilder = (Array.isArray(s.bilder) ? s.bilder : []).concat(neu);
    Classes.persist();
    this.bilderZeichnen(neu[neu.length - 1].id);
  },

  /* Die Bilder des gezeigten Schülers: Vorschau links, eigener Text rechts.
     Bleiben Schüler und Bilder gleich, bleibt auch alles stehen – sonst
     flackerten die Vorschauen bei jedem Neuzeichnen der Klassenliste, und ein
     Textfeld verlöre mitten im Tippen den Cursor. fokus: ID eines neuen
     Bildes, dessen Textfeld gleich den Cursor bekommt. */
  async bilderZeichnen(fokus) {
    const box = document.getElementById('profil-bilder');
    if (!box) return;
    const t = this.zeigbar();
    const liste = t && Array.isArray(t.s.bilder) ? t.s.bilder : [];
    const zeichen = t ? `${t.cls.id}/${t.s.id}:${liste.map(b => b.id).join(',')}` : '';
    if (!fokus && box.dataset.zeichen === zeichen) return;
    box.dataset.zeichen = zeichen;
    const lauf = ++this._bildLauf;
    this._bildUrls.forEach(u => URL.revokeObjectURL(u));
    this._bildUrls = [];
    box.innerHTML = '';
    box.hidden = !liste.length;
    if (!liste.length) return;

    const klasseId = t.cls.id, schuelerId = t.s.id;
    const geladen = new Map();                 // Bild-ID → Blob, für die große Ansicht
    const eintrag = id => {
      const s = this.schuelerZu(klasseId, schuelerId);
      return s && Array.isArray(s.bilder) ? s.bilder.find(b => b.id === id) : null;
    };
    const zeilen = liste.map(b => {
      const zeile = document.createElement('div');
      zeile.className = 'profil-bild';
      const vorschau = document.createElement('button');
      vorschau.type = 'button';
      vorschau.className = 'profil-bild-vorschau leer';
      vorschau.addEventListener('click', () => {
        const s = this.schuelerZu(klasseId, schuelerId);
        const mit = ((s && s.bilder) || []).filter(x => geladen.has(x.id));
        const pos = mit.findIndex(x => x.id === b.id);
        if (pos < 0) return;
        Stundenplan.bilderZeigen(mit.map(x => geladen.get(x.id)), pos, mit.map(x => x.text || ''));
      });
      const text = document.createElement('textarea');
      text.rows = 3;
      text.value = b.text || '';
      text.placeholder = 'Was gehört zu diesem Bild? z. B. welches Medikament, wann, wo es liegt';
      text.setAttribute('aria-label', 'Text zum Bild');
      text.addEventListener('input', () => {
        const e = eintrag(b.id);
        if (!e) return;
        if (text.value.trim()) e.text = text.value; else delete e.text;
        Classes.persist();
      });
      const weg = document.createElement('button');
      weg.type = 'button';
      weg.className = 'del';
      weg.innerHTML = Icons.raw('trash');
      weg.title = 'Bild samt Text löschen';
      weg.setAttribute('aria-label', 'Bild löschen');
      weg.addEventListener('click', () => this.bildLoeschen(klasseId, schuelerId, b.id));
      zeile.append(vorschau, text, weg);
      box.append(zeile);
      if (b.id === fokus) { text.focus(); zeile.scrollIntoView({ block: 'nearest' }); }
      return { id: b.id, vorschau };
    });

    // Die Bilder selbst nachladen. Fehlt eines hier, einmal beim Server
    // nachfragen: Ein anderes Gerät lädt es erst nach seinem Hauptstand hoch,
    // die Übernahme hier kann schneller gewesen sein.
    for (const { id, vorschau } of zeilen) {
      let blob = await this.bildBlob(id);
      if (lauf !== this._bildLauf) return;
      if (!blob && !this._nachgeholt[id] && window.Tresor && Tresor.aktiv()) {
        this._nachgeholt[id] = true;
        vorschau.textContent = 'wird geholt …';
        try { if (await Tresor.dateiNachholen('fotos', id)) blob = await this.bildBlob(id); }
        catch (e) { console.error('Bild nachholen:', e); }
        if (lauf !== this._bildLauf) return;
      }
      if (!blob) {
        vorschau.textContent = 'Bild fehlt auf diesem Gerät';
        vorschau.title = 'Kommt mit dem nächsten Abgleich von dem Gerät, auf dem es eingefügt wurde';
        continue;
      }
      const url = URL.createObjectURL(blob);
      this._bildUrls.push(url);
      geladen.set(id, blob);
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Bild';
      img.draggable = false;                   // sonst landet es per Ziehen gleich doppelt hier
      vorschau.textContent = '';
      vorschau.title = 'Groß zeigen';
      vorschau.classList.remove('leer');
      vorschau.append(img);
    }
  },

  async bildBlob(id) {
    try {
      const e = await Store.getFoto(id);
      return e && e.blob ? e.blob : null;
    } catch (e) {
      console.error('Bild laden:', e);
      return null;
    }
  },

  bildLoeschen(klasseId, schuelerId, id) {
    const s = this.schuelerZu(klasseId, schuelerId);
    const b = s && Array.isArray(s.bilder) && s.bilder.find(x => x.id === id);
    if (!b) return;
    if (!confirm(b.text ? 'Dieses Bild samt Text löschen?' : 'Dieses Bild löschen?')) return;
    s.bilder = s.bilder.filter(x => x.id !== id);
    if (!s.bilder.length) delete s.bilder;
    Classes.persist();
    this.bilderAufraeumen([id]);
    this.bilderZeichnen();
  },

  /* Alle Bild-IDs einer Reihe von Schülern – zum Aufräumen beim Löschen */
  bildIds(schueler) {
    return (schueler || []).flatMap(s => Array.isArray(s.bilder) ? s.bilder.map(b => b.id) : []);
  },

  /* Bilder, auf die kein Schüler mehr zeigt, vom Gerät und vom Server löschen –
     sonst wanderten sie unauffindbar durch jeden Abgleich. Die Kopie fürs
     nächste Schuljahr teilt sich die Bilder mit dem Original; solange einer
     von beiden ein Bild noch hat, bleibt es. Aufrufen, nachdem die Daten
     schon ohne die Bilder dastehen. */
  bilderAufraeumen(ids) {
    const benutzt = new Set(this.bildIds(Classes.data.classes.flatMap(c => c.students || [])));
    for (const id of ids) {
      if (!id || benutzt.has(id)) continue;
      Store.deleteFoto(id).catch(() => {});
      if (window.Tresor && Tresor.dateiEntfernen) Tresor.dateiEntfernen('fotos', id);
    }
  },

  /* ---------- Gesichter ausschneiden ---------- */

  /* Zu Beginn jeder Anzeige: Das Klassenfoto könnte inzwischen ein anderes sein */
  /* Foto aus einem Steckbrief hochladen (Klassen oder Band). Alles, was
     Gesichter zeigt, wird danach neu gezeichnet. */
  async fotoHochladen(cls, s, datei) {
    if (!datei || !/^image\//.test(datei.type)) { alert('Bitte eine Bilddatei wählen (JPG oder PNG).'); return; }
    try {
      await Sitzplan.einzelfotoSetzen(cls, s.id, datei);
    } catch (e) {
      alert('Das Foto konnte nicht gespeichert werden.\n\n' + (e.message || e));
      return;
    }
    this._ausschnitte = {};
    this.neuerDurchgang();
    if (Classes.currentClass() && Classes.currentClass().id === cls.id) {
      Classes.renderStudents();
      Sitzplan.render();
    }
    this.zeigeProfil();
    if (typeof Band !== 'undefined') Band.renderMembers();
  },

  /* Ein Foto-Feld zum Hochladen machen: Klick oeffnet den Dateidialog,
     ein Bild darauf ziehen geht auch. wer() liefert { cls, s } oder null. */
  fotoFeldVerdrahten(feld, knopf, eingabe, wer) {
    const waehlen = () => { if (wer()) eingabe.click(); };
    feld.addEventListener('click', waehlen);
    knopf.addEventListener('click', waehlen);
    eingabe.addEventListener('change', () => {
      const t = wer();
      const datei = eingabe.files[0];
      eingabe.value = '';
      if (t && datei) this.fotoHochladen(t.cls, t.s, datei);
    });
    feld.addEventListener('dragover', e => { if (wer()) { e.preventDefault(); feld.classList.add('ziel'); } });
    feld.addEventListener('dragleave', () => feld.classList.remove('ziel'));
    feld.addEventListener('drop', e => {
      feld.classList.remove('ziel');
      const t = wer();
      const datei = e.dataTransfer && e.dataTransfer.files[0];
      if (!t || !datei) return;
      e.preventDefault();
      this.fotoHochladen(t.cls, t.s, datei);
    });
  },

  neuerDurchgang() { this._bilder = {}; },

  async gesichtEinsetzen(el, cls, s, kante = 96) {
    // Wer schnell weiterklickt, soll nicht das Gesicht des Vorgängers bekommen
    const fuer = el.dataset.gesichtFuer = cls.id + '/' + s.id;
    const url = await this.gesicht(cls, s.id, kante);
    if (!url || !el.isConnected || el.dataset.gesichtFuer !== fuer) return;
    el.style.backgroundImage = `url(${url})`;
    el.classList.remove('ohne');
  },

  async gesicht(cls, id, kante = 96) {
    const r = Sitzplan.bildVon(cls, id);
    if (!r) return null;
    const q = r.q || 0;
    const schluessel = Sitzplan.fotoSchluessel(cls, q);
    const merk = [schluessel, r.x, r.y, r.b, r.h, kante].join('|');
    if (this._ausschnitte[merk]) return this._ausschnitte[merk];
    if (!(schluessel in this._bilder)) this._bilder[schluessel] = this.ladeBild(schluessel);
    const bild = await this._bilder[schluessel];
    if (!bild) return null;
    const c = document.createElement('canvas');
    c.width = c.height = kante;
    c.getContext('2d').drawImage(bild,
      r.x * bild.width, r.y * bild.height, r.b * bild.width, r.h * bild.height,
      0, 0, kante, kante);
    return (this._ausschnitte[merk] = c.toDataURL('image/jpeg', 0.82));
  },

  async ladeBild(schluessel) {
    try {
      const eintrag = await Store.getFoto(schluessel);
      if (!eintrag || !eintrag.blob) return null;
      const url = URL.createObjectURL(eintrag.blob);
      return await new Promise(fertig => {
        const i = new Image();
        i.onload = () => { URL.revokeObjectURL(url); fertig(i); };
        i.onerror = () => { URL.revokeObjectURL(url); fertig(null); };
        i.src = url;
      });
    } catch (e) {
      console.error('Gesicht laden:', e);
      return null;
    }
  },
};
