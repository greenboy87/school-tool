/* Notfallliste: Schüler mit besonderen Medikamenten oder Hinweisen für
   Notsituationen, über alle Klassen auf einer Seite. Am Schüler steht
   s.notfall = { text } – vorhanden heißt „auf der Liste“. Die Bilder kommen
   aus dem Steckbrief (s.bilder), hier wird nichts doppelt gespeichert. */
const Notfall = {
  _lauf: 0,
  _urls: [],

  init() {
    const knopf = document.querySelector('.tab-btn[data-tab="notfall"]');
    const feld = document.getElementById('notfall-suche');
    if (!knopf || !feld) return;
    knopf.addEventListener('click', () => this.render());
    feld.addEventListener('input', () => this.suchen());
    feld.addEventListener('keydown', e => {
      if (e.key === 'Escape') { feld.value = ''; this.suchen(); }
      else if (e.key === 'Enter') {
        const erste = document.querySelector('#notfall-treffer li[data-schueler]');
        if (erste) { e.preventDefault(); erste.click(); }
      }
    });
  },

  /* Alle auf der Liste. Die Kopie fürs nächste Schuljahr trägt den Eintrag
     mit – vom selben Namen zählt deshalb nur das neueste Schuljahr. */
  eintraege() {
    const alle = [];
    for (const cls of Classes.data.classes) {
      for (const s of cls.students || []) if (s.notfall) alle.push({ cls, s });
    }
    const name = t => ((t.s.first || '') + '|' + (t.s.last || '')).toLowerCase();
    const neuestes = {};
    for (const t of alle) {
      const k = name(t);
      if (!(k in neuestes) || (t.cls.year || '') > neuestes[k]) neuestes[k] = t.cls.year || '';
    }
    return alle.filter(t => (t.cls.year || '') === neuestes[name(t)])
      .sort((a, b) => a.cls.name.localeCompare(b.cls.name, 'de', { numeric: true }) ||
                      Classes.studentName(a.s).localeCompare(Classes.studentName(b.s), 'de'));
  },

  render(fokus) {
    const box = document.getElementById('notfall-liste');
    if (!box) return;
    const lauf = ++this._lauf;
    this._urls.forEach(u => URL.revokeObjectURL(u));
    this._urls = [];
    box.innerHTML = '';
    Schueler.neuerDurchgang();
    const liste = this.eintraege();
    if (!liste.length) {
      box.innerHTML = '<p class="hint notfall-leer">Noch niemand auf der Liste.</p>';
      return;
    }
    let klasse = null;
    for (const t of liste) {
      if (t.cls !== klasse) {
        klasse = t.cls;
        const h = document.createElement('h3');
        h.className = 'notfall-klasse';
        h.textContent = t.cls.name + (t.cls.year ? ` (${t.cls.year})` : '');
        box.appendChild(h);
      }
      box.appendChild(this.eintrag(t, lauf, fokus));
    }
  },

  eintrag(t, lauf, fokus) {
    const { cls, s } = t;
    const karte = document.createElement('article');
    karte.className = 'notfall-eintrag';

    const gesicht = document.createElement('span');
    gesicht.className = 'mini-gesicht notfall-gesicht ohne';
    gesicht.dataset.initialen = ((s.first || '')[0] || '') + ((s.last || '')[0] || '');
    const quelle = Schueler.fotoQuelle(t);
    if (quelle) Schueler.gesichtEinsetzen(gesicht, quelle.cls, quelle.s, 160);

    const inhalt = document.createElement('div');
    inhalt.className = 'notfall-inhalt';
    const kopf = document.createElement('div');
    kopf.className = 'notfall-kopf';
    const name = document.createElement('strong');
    name.textContent = [s.first, s.last].filter(Boolean).join(' ');
    const zumSteckbrief = document.createElement('button');
    zumSteckbrief.type = 'button';
    zumSteckbrief.className = 'small';
    zumSteckbrief.textContent = 'Steckbrief';
    zumSteckbrief.title = 'Im Reiter „Klassen“ den Steckbrief öffnen';
    zumSteckbrief.addEventListener('click', () => Schueler.oeffne(cls.id, s.id));
    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'small notfall-weg';
    weg.innerHTML = Icons.raw('x');
    weg.title = 'Von der Notfallliste nehmen';
    weg.setAttribute('aria-label', 'Von der Notfallliste nehmen');
    weg.addEventListener('click', () => {
      const frage = `${Classes.studentName(s)} von der Notfallliste nehmen?` +
        (s.notfall && s.notfall.text ? '\n\nDer Notfall-Text wird dabei gelöscht. Bilder und Notizen im Steckbrief bleiben.' : '');
      if (!confirm(frage)) return;
      delete s.notfall;
      // Dasselbe Kind in einem anderen Schuljahr (Kopie) käme sonst wieder hoch
      Schueler.auchIn(t).forEach(a => { if ((a.cls.year || '') !== (cls.year || '')) delete a.s.notfall; });
      Classes.persist();
      this.render();
    });
    kopf.append(name, zumSteckbrief, weg);

    const text = document.createElement('textarea');
    text.rows = 3;
    text.value = (s.notfall && s.notfall.text) || '';
    text.placeholder = 'Was im Notfall? z. B. welches Medikament, wo es liegt, was zu tun ist, wen anrufen';
    text.setAttribute('aria-label', 'Notfall-Text für ' + Classes.studentName(s));
    text.addEventListener('input', () => {
      if (!s.notfall) return;
      s.notfall.text = text.value;
      Classes.persist();
    });
    inhalt.append(kopf, text);

    // Bilder aus dem Steckbrief, mit ihrem Text groß zu zeigen
    const bilder = Array.isArray(s.bilder) ? s.bilder : [];
    if (bilder.length) {
      const leiste = document.createElement('div');
      leiste.className = 'notfall-bilder';
      inhalt.appendChild(leiste);
      this.bilderLaden(leiste, bilder, lauf);
    }

    karte.append(gesicht, inhalt);
    if (fokus === s.id) setTimeout(() => { text.focus(); karte.scrollIntoView({ block: 'nearest' }); });
    return karte;
  },

  async bilderLaden(leiste, bilder, lauf) {
    const blobs = [];
    for (const b of bilder) {
      const blob = await Schueler.bildBlob(b.id);
      if (lauf !== this._lauf) return;
      if (blob) blobs.push({ b, blob });
    }
    blobs.forEach(({ b, blob }, i) => {
      const url = URL.createObjectURL(blob);
      this._urls.push(url);
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'notfall-bild';
      knopf.title = b.text ? b.text : 'Groß zeigen';
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Bild';
      img.draggable = false;
      knopf.appendChild(img);
      knopf.addEventListener('click', () =>
        Stundenplan.bilderZeigen(blobs.map(x => x.blob), i, blobs.map(x => x.b.text || '')));
      leiste.appendChild(knopf);
    });
    if (!blobs.length) leiste.remove();
  },

  /* Schüler suchen und mit einem Klick auf die Liste setzen */
  suchen() {
    const feld = document.getElementById('notfall-suche');
    const box = document.getElementById('notfall-treffer');
    const q = feld.value.trim().toLowerCase();
    box.innerHTML = '';
    box.hidden = !q;
    if (!q) return;
    const treffer = Schueler.finde(q).slice(0, 10);
    if (!treffer.length) {
      box.innerHTML = '<li class="hint">Kein Schüler gefunden.</li>';
      return;
    }
    for (const t of treffer) {
      // Wie die Trefferzeile der Klassensuche, nur fügt ein Klick hinzu
      const neu = document.createElement('li');
      neu.className = 'treffer-mit-bild';
      neu.dataset.schueler = t.s.id;
      const bild = document.createElement('span');
      bild.className = 'mini-gesicht ohne';
      bild.dataset.initialen = ((t.s.first || '')[0] || '') + ((t.s.last || '')[0] || '');
      const quelle = Schueler.fotoQuelle(t);
      if (quelle) Schueler.gesichtEinsetzen(bild, quelle.cls, quelle.s);
      const text = document.createElement('span');
      text.className = 'treffer-text';
      const n = document.createElement('span');
      n.className = 'treffer-name';
      n.textContent = t.name;
      const wo = document.createElement('span');
      wo.className = 'treffer-klasse';
      wo.textContent = t.cls.name + (t.cls.year ? ` (${t.cls.year})` : '') +
        (t.s.notfall ? ' · steht schon auf der Liste' : '');
      text.append(n, wo);
      neu.append(bild, text);
      neu.addEventListener('click', () => {
        if (!t.s.notfall) { t.s.notfall = { text: '' }; Classes.persist(); }
        feld.value = '';
        this.suchen();
        this.render(t.s.id);
      });
      box.appendChild(neu);
    }
  },
};

window.Notfall = Notfall;
