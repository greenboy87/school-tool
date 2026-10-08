/* Schüler-Steckbrief: ein Schüler auf einen Blick – Gesicht, Klasse, Noten,
   eigene Notizen. Die Gesichter stammen aus dem Sitzplan (Klassenfoto plus
   Rahmen je Schüler); hier wird nur ausgeschnitten, nichts neu gespeichert. */
const Schueler = {
  aktuell: null,          // { klasseId, schuelerId }
  markiert: 0,            // Pfeiltasten-Auswahl in der Trefferliste
  _bilder: {},            // Fotoschlüssel → geladenes Image (je Durchgang)
  _ausschnitte: {},       // Ausschnitt-Schlüssel → dataURL

  init() {
    const feld = document.getElementById('profil-suche');
    if (feld) {
      feld.addEventListener('input', () => { this.markiert = 0; this.zeigeTreffer(); });
      feld.addEventListener('keydown', e => this.trefferTasten(e, feld, 'profil-treffer'));
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
    const zurListe = document.getElementById('btn-profil-klasse');
    if (zurListe) {
      zurListe.addEventListener('click', () => {
        if (!this.aktuell) return;
        document.querySelector('.tab-btn[data-tab="klassen"]').click();
        Classes.springeZuSchueler(this.aktuell.klasseId, this.aktuell.schuelerId);
      });
    }
    // Beim Hineinwechseln frisch zeichnen – Noten oder Gesichter könnten neu sein
    const reiter = document.querySelector('.tab-btn[data-tab="schueler"]');
    if (reiter) reiter.addEventListener('click', () => this.zeigeProfil());
    this.zeigeProfil();
  },

  /* Pfeiltasten wandern durch die Treffer, Enter öffnet den markierten.
     Wird auch von der Suche im Klassen-Reiter benutzt. */
  trefferTasten(e, feld, boxId) {
    const zeilen = [...document.querySelectorAll(`#${boxId} li[data-schueler]`)];
    if (e.key === 'Escape') {
      feld.value = '';
      feld.dispatchEvent(new Event('input'));
      return;
    }
    if (!zeilen.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = zeilen.length;
      this.markiert = (this.markiert + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const z = zeilen[Math.min(this.markiert, zeilen.length - 1)];
      // Feld leeren, damit die Trefferliste nicht über dem Steckbrief stehen bleibt
      feld.value = '';
      feld.dispatchEvent(new Event('input'));
      this.oeffne(z.dataset.klasse, z.dataset.schueler);
      return;
    } else {
      return;
    }
    zeilen.forEach((z, i) => z.classList.toggle('markiert', i === this.markiert));
    zeilen[this.markiert].scrollIntoView({ block: 'nearest' });
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

  zeigeTreffer() {
    const feld = document.getElementById('profil-suche');
    const box = document.getElementById('profil-treffer');
    const suche = feld.value.trim().toLowerCase();
    box.innerHTML = '';
    if (suche.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const treffer = this.finde(suche);
    if (!treffer.length) {
      box.innerHTML = '<li class="hint">Kein Schüler gefunden.</li>';
      return;
    }
    this.neuerDurchgang();
    treffer.slice(0, 25).forEach((t, i) => {
      box.appendChild(this.trefferZeile(t, i === this.markiert));
    });
    if (treffer.length > 25) {
      const li = document.createElement('li');
      li.className = 'hint';
      li.textContent = `… und ${treffer.length - 25} weitere. Tippe mehr Buchstaben.`;
      box.appendChild(li);
    }
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
    li.addEventListener('click', () => this.oeffne(t.cls.id, t.s.id));
    return li;
  },

  /* Wechselt in den Reiter „Schüler“ und zeigt den Steckbrief */
  oeffne(klasseId, schuelerId) {
    this.aktuell = { klasseId, schuelerId };
    document.querySelector('.tab-btn[data-tab="schueler"]').click();
    this.zeigeProfil();
    window.scrollTo({ top: 0 });
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

  zeigeProfil() {
    const leer = document.getElementById('profil-leer');
    const karte = document.getElementById('profil-karte');
    if (!leer || !karte) return;
    const t = this.gewaehlt();
    leer.hidden = !!t;
    karte.hidden = !t;
    if (!t) return;
    this.neuerDurchgang();
    const { cls, s } = t;
    const andere = this.auchIn(t);

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
    zeile('Klasse', cls.name + (cls.year ? ` (${cls.year})` : ''));
    const lehrer = Classes.lehrer();
    const lt = k => { k = (k || '').trim(); return k ? (lehrer[k.toUpperCase()] || k) : ''; };
    const l = cls.leitung || {};
    zeile('Klassenleitung', [lt(l.kl), lt(l.co)].filter(Boolean).join(' / '));
    const nr = cls.students.indexOf(s) + 1;
    zeile('Nr. in der Liste', `${nr} von ${cls.students.length}`);
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

  /* ---------- Gesichter ausschneiden ---------- */

  /* Zu Beginn jeder Anzeige: Das Klassenfoto könnte inzwischen ein anderes sein */
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
