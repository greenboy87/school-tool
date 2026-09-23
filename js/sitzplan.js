/* Sitzordnung: ein Raster aus Plätzen, in das die Klasse einzieht.

   Der Plan hängt an der Klasse (cls.sitzplan) und ist winzig – ein Platz merkt
   sich nur die Kennung eines Schülers. Dadurch geht er mit dem normalen Sync
   mit, anders als ein hochgeladenes PDF, das einzeln verschlüsselt und in
   Stücken übertragen werden muss.

   Bedient wird mit zwei Tippern: erst den Schüler, dann das Ziel. Ziehen wäre
   am Rechner naheliegender, funktioniert aber auf dem iPad nicht – und im
   Unterricht verrutscht so nichts, was man nur streift. */
const Sitzplan = {
  MAX_VERLAUF: 25,
  MAX_REIHEN: 12,
  MAX_PRO_REIHE: 12,

  auswahl: null,            // { art: 'platz' | 'bank', wert: Schlüssel | Schüler-ID }
  verlauf: [],              // frühere Belegungen, für „Zurück“
  raumOffen: false,         // Plätze herausnehmen statt umsetzen

  init() {
    const an = (id, fn, ereignis = 'click') => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(ereignis, fn);
    };
    an('btn-sitz-fuellen', () => this.fuellen(false));
    an('btn-sitz-zufall', () => this.fuellen(true));
    an('btn-sitz-leeren', () => this.leeren());
    an('btn-sitz-zurueck', () => this.zurueck());
    an('btn-sitz-drucken', () => this.drucken());
    an('btn-sitz-raum', () => {
      this.raumOffen = !this.raumOffen;
      this.auswahl = null;
      this.render();
    });
    an('btn-sitz-raum-uebernehmen', () => this.raumUebernehmen());
    an('sitz-pdf-datei', e => {
      const datei = e.target.files[0];
      e.target.value = '';
      if (datei) this.ausPdf(datei);
    }, 'change');
    an('btn-sitz-pdf-ok', () => this.uebernehmenAusPdf());
    an('btn-sitz-pdf-abbruch', () => this.abbrechenVorschau());
    an('btn-sitz-fotos-weg', () => this.fotosEntfernen());
    an('btn-sitz-voll', () => this.vollbild('sitz-bereich'));

    // Gesichter aus dem Klassenfoto
    an('gesichter-datei', e => {
      const datei = e.target.files[0];
      e.target.value = '';
      if (datei) this.gesichterStarten(datei);
    }, 'change');
    an('btn-gesichter-abbruch', () => this.gesichterAbbrechen());
    an('btn-gesichter-zurueck', () => this.gesichterZurueck());
    an('btn-gesichter-fertig', () => this.gesichterUebernehmen());
    an('gesichter-suche', () => this.gesichterNamenZeichnen(), 'input');
    an('gesichter-suche', e => {
      if (e.key === 'Escape') { this.gesichterWahlSchliessen(); return; }
      if (e.key !== 'Enter') return;
      const erster = document.querySelector('#gesichter-namen .gesichter-name:not(.vergeben)')
        || document.querySelector('#gesichter-namen .gesichter-name');
      if (erster) erster.click();
    }, 'keydown');

    /* Tippen setzt einen Rahmen, Ziehen zeichnet einen eigenen. Zeigergesten
       statt Maus-Ereignissen, damit es auf dem iPad genauso geht. */
    const buehne = document.getElementById('gesichter-buehne');
    if (buehne) {
      let start = null;
      buehne.addEventListener('pointerdown', e => {
        if (!this.gesichter || e.target.closest('[data-schueler]')) return;
        start = this.gesichterPunkt(e);
        buehne.setPointerCapture(e.pointerId);
      });
      buehne.addEventListener('pointerup', e => {
        if (!this.gesichter) return;
        if (!start) { this.gesichterKlick(e); return; }
        const bis = this.gesichterPunkt(e);
        const weit = Math.abs(bis.x - start.x) > 12 || Math.abs(bis.y - start.y) > 12;
        if (weit) this.gesichterZiehen(start, bis); else this.gesichterKlick(e);
        start = null;
      });
    }
    an('btn-seatplan-voll', () => this.vollbild('seatplan-view'));
    an('sitz-bank', e => {
      // Auf die Bank selbst getippt: der gewählte Schüler verlässt seinen Platz
      if (e.target.closest('.sitz-bank-chip')) return;
      this.aufDieBank();
    });
    // Beim Öffnen des Unterreiters neu zeichnen – die Klasse kann gewechselt haben
    document.querySelectorAll('.subtab-btn[data-subtab="sitzplan"]')
      .forEach(b => b.addEventListener('click', () => this.render()));
  },

  /* Der Plan entsteht beim ersten Hinsehen: vier Reihen, je viermal Tisch,
     Gang, viermal Tisch – so stehen die Räume hier. Wer es anders hat, ändert
     die drei Zahlen unter „Raum ändern“. */
  plan(cls) {
    const p = (cls.sitzplan && typeof cls.sitzplan === 'object') ? cls.sitzplan : {};
    if (!(p.reihen > 0)) p.reihen = 4;
    if (!(p.proReihe > 0)) p.proReihe = 8;
    // Ältere Pläne kannten noch keinen Gang – sie bekommen ihn in der Mitte
    if (typeof p.gang !== 'number') p.gang = p.proReihe >= 6 ? Math.round(p.proReihe / 2) : 0;
    if (!Array.isArray(p.ohne)) p.ohne = [];
    if (!p.belegt || typeof p.belegt !== 'object') p.belegt = {};
    cls.sitzplan = p;
    return p;
  },

  schluessel(reihe, platz) { return reihe + '-' + platz; },

  schueler(cls, id) { return cls.students.find(s => s.id === id) || null; },

  /* Plätze, auf denen jemand sitzen kann: im Raster und nicht herausgenommen */
  freieReihenfolge(p) {
    const raus = [];
    for (let r = 0; r < p.reihen; r++) {
      for (let s = 0; s < p.proReihe; s++) {
        const k = this.schluessel(r, s);
        if (!p.ohne.includes(k)) raus.push(k);
      }
    }
    return raus;
  },

  /* Die Klassenliste ändert sich unabhängig vom Plan: Wer die Klasse verlassen
     hat, muss vom Platz verschwinden, und ein Platz außerhalb des Rasters darf
     niemanden festhalten. Beides still im Vorbeigehen. */
  aufraeumen(cls, p) {
    const gueltig = new Set(this.freieReihenfolge(p));
    const ids = new Set(cls.students.map(s => s.id));
    let geaendert = false;
    for (const k of Object.keys(p.belegt)) {
      if (!gueltig.has(k) || !ids.has(p.belegt[k])) { delete p.belegt[k]; geaendert = true; }
    }
    return geaendert;
  },

  /* Alle, die gerade auf keinem Platz sitzen – in der Reihenfolge der Klassenliste */
  wartebank(cls, p) {
    const sitzen = new Set(Object.values(p.belegt));
    return cls.students.filter(s => !sitzen.has(s.id));
  },

  merke(cls, p) {
    this.verlauf.push({ klasse: cls.id, belegt: { ...p.belegt } });
    if (this.verlauf.length > this.MAX_VERLAUF) this.verlauf.shift();
  },

  zurueck() {
    const cls = Classes.currentClass();
    if (!cls) return;
    // Schritte anderer Klassen überspringen – sonst landet die falsche Ordnung hier
    while (this.verlauf.length && this.verlauf[this.verlauf.length - 1].klasse !== cls.id) {
      this.verlauf.pop();
    }
    const letzter = this.verlauf.pop();
    if (!letzter) return;
    this.plan(cls).belegt = letzter.belegt;
    this.auswahl = null;
    Classes.persist();
    this.render();
  },

  /* ---------- Umsetzen ---------- */
  tippePlatz(k) {
    const cls = Classes.currentClass();
    if (!cls) return;
    const p = this.plan(cls);

    if (this.raumOffen) {
      // Platz herausnehmen oder zurückstellen; wer dort saß, geht auf die Bank
      if (p.ohne.includes(k)) p.ohne = p.ohne.filter(x => x !== k);
      else { p.ohne.push(k); delete p.belegt[k]; }
      Classes.persist();
      this.render();
      return;
    }

    if (!this.auswahl) {
      if (!p.belegt[k]) return;           // leerer Platz, nichts zu wählen
      this.auswahl = { art: 'platz', wert: k };
      this.render();
      return;
    }

    if (this.auswahl.art === 'platz') {
      const von = this.auswahl.wert;
      if (von === k) { this.auswahl = null; this.render(); return; }
      this.merke(cls, p);
      const hier = p.belegt[von];
      const dort = p.belegt[k];
      if (dort) p.belegt[von] = dort; else delete p.belegt[von];
      p.belegt[k] = hier;
    } else {
      // Von der Wartebank auf einen Platz; wer dort saß, rückt auf die Bank
      this.merke(cls, p);
      p.belegt[k] = this.auswahl.wert;
    }
    this.auswahl = null;
    Classes.persist();
    this.render();
  },

  tippeBankChip(id) {
    const cls = Classes.currentClass();
    if (!cls || this.raumOffen) return;
    const p = this.plan(cls);

    if (this.auswahl && this.auswahl.art === 'platz') {
      // Getauscht: Der Sitzende geht auf die Bank, der Wartende auf den Platz
      this.merke(cls, p);
      p.belegt[this.auswahl.wert] = id;
      this.auswahl = null;
      Classes.persist();
    } else if (this.auswahl && this.auswahl.art === 'bank' && this.auswahl.wert === id) {
      this.auswahl = null;
    } else {
      this.auswahl = { art: 'bank', wert: id };
    }
    this.render();
  },

  /* Auf die freie Fläche der Bank getippt: der gewählte Schüler steht auf */
  aufDieBank() {
    const cls = Classes.currentClass();
    if (!cls || this.raumOffen) return;
    if (!this.auswahl || this.auswahl.art !== 'platz') return;
    const p = this.plan(cls);
    this.merke(cls, p);
    delete p.belegt[this.auswahl.wert];
    this.auswahl = null;
    Classes.persist();
    this.render();
  },

  /* ---------- Füllen und leeren ---------- */
  fuellen(zufall) {
    const cls = Classes.currentClass();
    if (!cls || !cls.students.length) return;
    const p = this.plan(cls);
    const plaetze = this.freieReihenfolge(p);
    const liste = cls.students.slice();
    if (zufall) {
      for (let i = liste.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [liste[i], liste[j]] = [liste[j], liste[i]];
      }
    } else {
      liste.sort((a, b) => Classes.studentName(a).localeCompare(Classes.studentName(b), 'de'));
    }
    this.merke(cls, p);
    p.belegt = {};
    liste.forEach((s, i) => { if (plaetze[i]) p.belegt[plaetze[i]] = s.id; });
    this.auswahl = null;
    Classes.persist();
    this.render();
  },

  leeren() {
    const cls = Classes.currentClass();
    if (!cls) return;
    const p = this.plan(cls);
    if (!Object.keys(p.belegt).length) return;
    if (!confirm('Alle vom Platz nehmen? Die Klasse steht danach wieder auf der Wartebank.')) return;
    this.merke(cls, p);
    p.belegt = {};
    this.auswahl = null;
    Classes.persist();
    this.render();
  },

  raumUebernehmen() {
    const cls = Classes.currentClass();
    if (!cls) return;
    const p = this.plan(cls);
    const zahl = (id, hoechstens) => {
      const v = parseInt(document.getElementById(id).value, 10);
      return Math.max(1, Math.min(hoechstens, isNaN(v) ? 1 : v));
    };
    p.reihen = zahl('sitz-reihen', this.MAX_REIHEN);
    p.proReihe = zahl('sitz-proreihe', this.MAX_PRO_REIHE);
    const gang = parseInt(document.getElementById('sitz-gang').value, 10);
    p.gang = isNaN(gang) || gang <= 0 || gang >= p.proReihe ? 0 : gang;
    // Plätze außerhalb des neuen Rasters verschwinden samt Vermerk
    p.ohne = p.ohne.filter(k => {
      const [r, s] = k.split('-').map(Number);
      return r < p.reihen && s < p.proReihe;
    });
    this.aufraeumen(cls, p);
    Classes.persist();
    this.render();
  },

  /* ---------- Zeichnen ---------- */
  render() {
    const gitter = document.getElementById('sitz-gitter');
    if (!gitter) return;
    const cls = Classes.currentClass();
    const bereich = document.getElementById('sitz-bereich');
    if (!cls) { if (bereich) bereich.hidden = true; return; }
    if (bereich) bereich.hidden = false;

    const p = this.plan(cls);
    if (this.aufraeumen(cls, p)) Classes.persist();

    document.getElementById('sitz-reihen').value = p.reihen;
    document.getElementById('sitz-proreihe').value = p.proReihe;
    document.getElementById('sitz-gang').value = p.gang || 0;
    document.getElementById('sitz-raum-zeile').hidden = !this.raumOffen;
    const raumKnopf = document.getElementById('btn-sitz-raum');
    if (raumKnopf) raumKnopf.classList.toggle('primary', this.raumOffen);

    // Im Vollbild sieht man sonst nicht, welche Klasse da an der Wand haengt
    const vollTitel = document.getElementById('sitz-voll-titel');
    if (vollTitel) vollTitel.textContent = cls.name;

    gitter.classList.toggle('bearbeiten', this.raumOffen);
    gitter.classList.toggle('mit-fotos', this.hatFotos(cls));
    // Der Gang ist eine eigene, schmale Spalte – die Platznummern zaehlen
    // darueber hinweg weiter, er kostet also keinen Sitzplatz.
    const spalten = [];
    for (let s = 0; s < p.proReihe; s++) {
      if (p.gang && s === p.gang) spalten.push('var(--sitz-gang-breite)');
      spalten.push('minmax(0, 1fr)');
    }
    gitter.style.gridTemplateColumns = spalten.join(' ');
    gitter.innerHTML = '';
    for (let r = 0; r < p.reihen; r++) {
      for (let s = 0; s < p.proReihe; s++) {
        if (p.gang && s === p.gang) {
          const luecke = document.createElement('span');
          luecke.className = 'sitz-gang';
          gitter.appendChild(luecke);
        }
        gitter.appendChild(this.platzKnopf(cls, p, this.schluessel(r, s)));
      }
    }

    this.zeichneBank(cls, p);
    this.zeichneHinweis(cls, p);
    this.fotosNachziehen(cls);
    const fotoWeg = document.getElementById('btn-sitz-fotos-weg');
    if (fotoWeg) fotoWeg.hidden = !(cls.fotos && cls.fotos.bilder &&
      Object.keys(cls.fotos.bilder).length);
    document.getElementById('btn-sitz-zurueck').disabled =
      !this.verlauf.some(v => v.klasse === cls.id);
  },

  platzKnopf(cls, p, k) {
    const el = document.createElement('button');
    el.type = 'button';
    el.dataset.platz = k;
    const raus = p.ohne.includes(k);
    const stud = raus ? null : this.schueler(cls, p.belegt[k]);
    el.className = 'sitz-platz' +
      (raus ? ' raus' : '') +
      (!raus && !stud ? ' frei' : '') +
      (this.auswahl && this.auswahl.art === 'platz' && this.auswahl.wert === k ? ' gewaehlt' : '');
    if (raus) {
      el.innerHTML = '<span class="sitz-leer">kein Platz</span>';
    } else if (stud) {
      /* Hat die Klasse Fotos, bekommt auch ein Schueler ohne Bild seinen Kreis –
         sonst faellt sein Platz aus der Reihe und die Zeile wird krumm. */
      const bild = this.bildVon(cls, stud.id);
      el.innerHTML =
        (this.hatFotos(cls)
          ? `<span class="sitz-foto${bild ? '' : ' ohne'}" data-fuer="${stud.id}"></span>` : '') +
        `<span class="sitz-vorname">${Band.esc(stud.first || stud.last)}</span>` +
        (stud.first ? `<span class="sitz-nachname">${Band.esc(stud.last)}</span>` : '');
      el.classList.toggle('mit-foto', this.hatFotos(cls));
      el.title = Classes.studentName(stud);
    } else {
      el.innerHTML = '<span class="sitz-leer">frei</span>';
    }
    el.addEventListener('click', () => this.tippePlatz(k));
    return el;
  },

  hatFotos(cls) {
    return !!(cls.fotos && cls.fotos.bilder && Object.keys(cls.fotos.bilder).length);
  },

  bildVon(cls, id) {
    return (cls.fotos && cls.fotos.bilder && cls.fotos.bilder[id]) || null;
  },

  /* Das Klassenbild liegt in IndexedDB und kommt erst nach dem Zeichnen an.
     Deshalb werden die Ausschnitte nachtraeglich eingesetzt – der Plan steht
     sofort da, die Gesichter erscheinen einen Wimpernschlag spaeter. */
  async fotosNachziehen(cls) {
    const felder = document.querySelectorAll('#sitz-gitter .sitz-foto');
    if (!felder.length) return;
    const url = await this.fotoUrl(cls);
    if (!url) return;
    for (const feld of felder) {
      const r = this.bildVon(cls, feld.dataset.fuer);
      if (!r) continue;
      feld.style.backgroundImage = `url(${url})`;
      feld.style.backgroundSize = `${100 / r.b}% ${100 / r.h}%`;
      // Die Prozentangabe misst den Anteil am ueberstehenden Rest, nicht am Bild
      feld.style.backgroundPosition =
        `${r.b < 1 ? (r.x / (1 - r.b)) * 100 : 0}% ${r.h < 1 ? (r.y / (1 - r.h)) * 100 : 0}%`;
    }
  },

  async fotoUrl(cls) {
    if (this._fotoFuer === cls.id) return this._fotoUrl;
    if (this._fotoUrl) URL.revokeObjectURL(this._fotoUrl);
    this._fotoFuer = cls.id;
    this._fotoUrl = null;
    try {
      const eintrag = await Store.getFoto(this.fotoSchluessel(cls));
      if (eintrag && eintrag.blob) this._fotoUrl = URL.createObjectURL(eintrag.blob);
    } catch (e) {
      console.error('Klassenfoto:', e);
    }
    return this._fotoUrl;
  },

  zeichneBank(cls, p) {
    const bank = document.getElementById('sitz-bank');
    const wartend = this.wartebank(cls, p);
    document.getElementById('sitz-bank-zahl').textContent = wartend.length;
    bank.innerHTML = '';
    // Im Vollbild soll eine leere Bank keinen Platz kosten
    bank.classList.toggle('leer', !wartend.length);
    if (!wartend.length) {
      bank.innerHTML = cls.students.length
        ? '<span class="hint">Alle sitzen.</span>'
        : '<span class="hint">Diese Klasse hat noch keine Schüler – erst die Klassenliste füllen.</span>';
      return;
    }
    for (const s of wartend) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sitz-bank-chip' +
        (this.auswahl && this.auswahl.art === 'bank' && this.auswahl.wert === s.id ? ' gewaehlt' : '');
      chip.textContent = Classes.studentName(s);
      chip.addEventListener('click', () => this.tippeBankChip(s.id));
      bank.appendChild(chip);
    }
  },

  /* Eine Zeile, die immer sagt, was der nächste Tipper bewirkt. Ohne sie rät
     man beim ersten Mal, wofür die Umrandung steht. */
  zeichneHinweis(cls, p) {
    const el = document.getElementById('sitz-hinweis');
    if (this.raumOffen) {
      el.textContent = 'Raum ändern: Ein Tipper auf einen Platz nimmt ihn heraus oder stellt ' +
        'ihn zurück – für Lücken, wo kein Tisch steht. Oben die Reihen einstellen.';
      return;
    }
    if (this.auswahl) {
      const id = this.auswahl.art === 'platz' ? p.belegt[this.auswahl.wert] : this.auswahl.wert;
      const stud = this.schueler(cls, id);
      // Im Fliesstext liest sich „Timo Batz“ besser als „Batz, Timo“
      const name = stud ? [stud.first, stud.last].filter(Boolean).join(' ') : 'Gewählt';
      el.textContent = `„${name}“ ist gewählt. Jetzt den Zielplatz antippen – sitzt dort ` +
        'schon jemand, tauschen die beiden. Nochmal auf denselben Platz hebt die Wahl auf.';
      return;
    }
    const wartend = this.wartebank(cls, p).length;
    el.textContent = 'Zum Umsetzen erst den Schüler antippen, dann den Zielplatz.' +
      (wartend ? ' Wer noch keinen Platz hat, steht unten auf der Wartebank.' : '');
  },

  /* ---------- Gesichter aus dem Klassenfoto ----------
     Die Vorlage ist ein Foto der Klasse im Raum. Eine Maschine muss darin
     Gesichter finden UND den Namen zuordnen – das zweite geht regelmaessig
     schief, weil sie die Kinder nicht kennt. Die Lehrkraft kennt sie. Also
     macht sie das Zuordnen, und das Werkzeug nimmt ihr alles andere ab:
     Ausschneiden, Rechnen, Speichern.

     Gespeichert wird wie beim PDF-Weg: ein Bild je Klasse plus vier
     Verhaeltniszahlen je Schueler. */
  async gesichterStarten(datei) {
    const cls = Classes.currentClass();
    if (!cls) return;
    if (!cls.students.length) {
      alert('Diese Klasse hat noch keine Schülerliste – ohne sie gibt es nichts zuzuordnen.');
      return;
    }
    /* Beim Uebernehmen tritt das neue Foto an die Stelle des alten. Wer die
       Zuordnung halb fertig hat und neu anfaengt, soll das vorher wissen. */
    if (this.hatFotos(cls) && !confirm(
      `Für ${cls.name} sind schon Fotos hinterlegt.\n\n` +
      'Ein neues Klassenfoto ersetzt sie, sobald du „Übernehmen“ drückst. ' +
      'Bis dahin ändert sich nichts.')) return;
    this.status('lese das Bild …');
    try {
      const bild = /pdf$/i.test(datei.type) || /\.pdf$/i.test(datei.name)
        ? await this.bildAusPdf(datei)
        : await this.bildAusDatei(datei);
      if (!bild) { this.status(''); alert('In dieser Datei war kein Bild zu finden.'); return; }
      this.gesichter = {
        url: bild.url, breite: bild.breite, hoehe: bild.hoehe,
        zuordnung: {}, offen: null, verlauf: [],
      };
      this.status('');
      this.gesichterZeigen();
    } catch (e) {
      console.error(e);
      this.status('');
      alert('Die Datei konnte nicht gelesen werden.\n\n' + (e.message || e));
    }
  },

  bildAusDatei(datei) {
    return new Promise((fertig, schief) => {
      const url = URL.createObjectURL(datei);
      const i = new Image();
      i.onload = () => fertig({ url, breite: i.naturalWidth, hoehe: i.naturalHeight });
      i.onerror = () => schief(new Error('Bildformat wird nicht unterstützt.'));
      i.src = url;
    });
  },

  /* Steckt das Foto in einem PDF, nimmt die Seite mit der groessten Bildflaeche –
     im Sitzplan aus Word liegt das Klassenfoto oft auf der zweiten Seite. */
  async bildAusPdf(datei) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({
      data: await datei.arrayBuffer(), disableFontFace: true,
    }).promise;
    let beste = null;
    for (let n = 1; n <= pdf.numPages; n++) {
      const seite = await pdf.getPage(n);
      const { bilder } = await this.formenAusSeite(seite);
      const flaeche = bilder.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
      if (!beste || flaeche > beste.flaeche) beste = { seite, flaeche };
    }
    if (!beste) return null;
    const roh = beste.seite.getViewport({ scale: 1 });
    const massstab = Math.min(3, Math.max(1.5, 2200 / roh.width));
    const blick = beste.seite.getViewport({ scale: massstab });
    const c = document.createElement('canvas');
    c.width = Math.round(blick.width);
    c.height = Math.round(blick.height);
    await beste.seite.render({ canvasContext: c.getContext('2d'), viewport: blick }).promise;
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return { url: URL.createObjectURL(blob), breite: c.width, hoehe: c.height };
  },

  gesichterZeigen() {
    const bereich = document.getElementById('gesichter-bereich');
    const bild = document.getElementById('gesichter-bild');
    bild.src = this.gesichter.url;
    bereich.hidden = false;
    // Ein Kopf fuellt auf einem Klassenfoto grob ein Zwanzigstel der Breite
    const regler = document.getElementById('gesichter-groesse');
    regler.value = Math.round(this.gesichter.breite / 18);
    regler.max = Math.round(this.gesichter.breite / 4);
    regler.min = Math.round(this.gesichter.breite / 60);
    bereich.scrollIntoView({ block: 'start' });
    this.gesichterZeichnen();
  },

  /* Bildpunkte des Fotos aus einem Klick auf die verkleinerte Anzeige */
  gesichterPunkt(e) {
    const bild = document.getElementById('gesichter-bild');
    const r = bild.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * this.gesichter.breite,
      y: (e.clientY - r.top) / r.height * this.gesichter.hoehe,
    };
  },

  gesichterKlick(e) {
    const g = this.gesichter;
    if (!g) return;
    const treffer = e.target.closest('[data-schueler]');
    if (treffer) { this.gesichterWahlOeffnen(treffer.dataset.schueler); return; }
    const p = this.gesichterPunkt(e);
    const kante = +document.getElementById('gesichter-groesse').value;
    g.offen = {
      x: Math.max(0, p.x - kante / 2), y: Math.max(0, p.y - kante / 2),
      b: kante, h: kante,
    };
    this.gesichterZeichnen();
    this.gesichterWahlOeffnen(null);
  },

  gesichterZiehen(von, bis) {
    const g = this.gesichter;
    if (!g) return;
    const x = Math.min(von.x, bis.x), y = Math.min(von.y, bis.y);
    const b = Math.abs(bis.x - von.x), h = Math.abs(bis.y - von.y);
    if (b < 12 || h < 12) return;                 // zu klein: war wohl ein Tipper
    g.offen = { x, y, b, h };
    this.gesichterZeichnen();
    this.gesichterWahlOeffnen(null);
  },

  gesichterZeichnen() {
    const g = this.gesichter;
    const lage = document.getElementById('gesichter-rahmen');
    if (!g || !lage) return;
    const cls = Classes.currentClass();
    lage.innerHTML = '';
    const setze = (r, beschriftung, art, id) => {
      const k = document.createElement('div');
      k.className = 'gesichter-kasten ' + art;
      k.style.left = (r.x / g.breite * 100) + '%';
      k.style.top = (r.y / g.hoehe * 100) + '%';
      k.style.width = (r.b / g.breite * 100) + '%';
      k.style.height = (r.h / g.hoehe * 100) + '%';
      if (id) k.dataset.schueler = id;
      if (beschriftung) {
        const b = document.createElement('span');
        b.textContent = beschriftung;
        k.appendChild(b);
      }
      lage.appendChild(k);
    };
    for (const [id, r] of Object.entries(g.zuordnung)) {
      const st = cls.students.find(s => s.id === id);
      setze(r, st ? [st.first, st.last].filter(Boolean).join(' ') : '?', 'fertig', id);
    }
    if (g.offen) setze(g.offen, '', 'offen');

    const zahl = Object.keys(g.zuordnung).length;
    document.getElementById('gesichter-fortschritt').textContent =
      `${zahl} von ${cls.students.length} zugeordnet`;
    document.getElementById('btn-gesichter-zurueck').disabled = !g.verlauf.length;
  },

  /* Die Namensauswahl: tippen filtert, Eingabetaste nimmt den ersten Treffer.
     Wer schon einen Rahmen hat, steht hinten und grau – so sieht man sofort,
     wer noch fehlt. */
  gesichterWahlOeffnen(schonId) {
    const g = this.gesichter;
    const cls = Classes.currentClass();
    if (!g) return;
    g.bearbeitet = schonId || null;
    if (schonId) g.offen = { ...g.zuordnung[schonId] };
    const kasten = document.getElementById('gesichter-wahl');
    kasten.hidden = false;
    const suche = document.getElementById('gesichter-suche');
    suche.value = '';
    this.gesichterNamenZeichnen();
    suche.focus();
  },

  gesichterNamenZeichnen() {
    const g = this.gesichter;
    const cls = Classes.currentClass();
    const feld = document.getElementById('gesichter-suche');
    const box = document.getElementById('gesichter-namen');
    const suche = this.schluesselName(feld.value);
    const vergeben = new Set(Object.keys(g.zuordnung));
    const liste = cls.students
      .filter(s => !suche || this.schluesselName(Classes.studentName(s)).includes(suche))
      .sort((a, b) => (vergeben.has(a.id) ? 1 : 0) - (vergeben.has(b.id) ? 1 : 0) ||
        Classes.studentName(a).localeCompare(Classes.studentName(b), 'de'));
    box.innerHTML = '';
    for (const s of liste) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gesichter-name' + (vergeben.has(s.id) ? ' vergeben' : '') +
        (g.bearbeitet === s.id ? ' aktuell' : '');
      b.textContent = Classes.studentName(s);
      b.addEventListener('click', () => this.gesichterZuweisen(s.id));
      box.appendChild(b);
    }
    if (g.bearbeitet) {
      const weg = document.createElement('button');
      weg.type = 'button';
      weg.className = 'gesichter-name danger';
      weg.textContent = 'Rahmen entfernen';
      weg.addEventListener('click', () => {
        g.verlauf.push({ ...g.zuordnung });
        delete g.zuordnung[g.bearbeitet];
        this.gesichterWahlSchliessen();
      });
      box.appendChild(weg);
    }
  },

  gesichterZuweisen(id) {
    const g = this.gesichter;
    if (!g || !g.offen) return;
    g.verlauf.push({ ...g.zuordnung });
    if (g.verlauf.length > 40) g.verlauf.shift();
    if (g.bearbeitet && g.bearbeitet !== id) delete g.zuordnung[g.bearbeitet];
    g.zuordnung[id] = g.offen;
    this.gesichterWahlSchliessen();
  },

  gesichterWahlSchliessen() {
    const g = this.gesichter;
    if (!g) return;
    g.offen = null;
    g.bearbeitet = null;
    document.getElementById('gesichter-wahl').hidden = true;
    this.gesichterZeichnen();
  },

  gesichterZurueck() {
    const g = this.gesichter;
    if (!g || !g.verlauf.length) return;
    g.zuordnung = g.verlauf.pop();
    this.gesichterWahlSchliessen();
  },

  gesichterAbbrechen() {
    if (this.gesichter && this.gesichter.url) URL.revokeObjectURL(this.gesichter.url);
    this.gesichter = null;
    document.getElementById('gesichter-bereich').hidden = true;
    document.getElementById('gesichter-wahl').hidden = true;
    this.status('');
  },

  /* Uebernehmen: Das Foto wird auf eine vernuenftige Groesse gebracht und als
     ein Bild je Klasse abgelegt, die Rahmen als Verhaeltniszahlen. */
  async gesichterUebernehmen() {
    const g = this.gesichter;
    const cls = Classes.currentClass();
    if (!g || !cls) return;
    const zahl = Object.keys(g.zuordnung).length;
    if (!zahl) { alert('Es ist noch kein Gesicht zugeordnet.'); return; }
    this.status('übernehme …');

    const breite = Math.min(2200, g.breite);
    const c = document.createElement('canvas');
    c.width = breite;
    c.height = Math.round(g.hoehe * breite / g.breite);
    const bild = await new Promise((fertig, schief) => {
      const i = new Image();
      i.onload = () => fertig(i);
      i.onerror = schief;
      i.src = g.url;
    });
    c.getContext('2d').drawImage(bild, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.78));
    try {
      await Store.putFoto(this.fotoSchluessel(cls),
        new File([blob], `Klassenfoto ${cls.name}.jpg`, { type: 'image/jpeg' }));
    } catch (e) {
      this.status('');
      alert('Das Bild konnte nicht gespeichert werden.\n\n' + (e.message || e));
      return;
    }
    const bilder = {};
    for (const [id, r] of Object.entries(g.zuordnung)) {
      bilder[id] = {
        x: +(r.x / g.breite).toFixed(5), y: +(r.y / g.hoehe).toFixed(5),
        b: +(r.b / g.breite).toFixed(5), h: +(r.h / g.hoehe).toFixed(5),
      };
    }
    cls.fotos = { bilder };
    this._fotoFuer = null;
    Classes.persist();
    this.gesichterAbbrechen();
    this.render();
    alert(`${zahl} ${zahl === 1 ? 'Gesicht wurde' : 'Gesichter wurden'} übernommen.`);
  },

  /* Vollbild fuer den Beamer – fuer die Sitzordnung wie fuer die Datei.
     Umschalter, kein Einschalter: Derselbe Knopf bringt einen auch wieder
     heraus, sonst sucht man im Vollbild nach dem Ausgang. */
  vollbild(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    const rein = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!rein) { alert('Dieser Browser kann den Vollbildmodus hier nicht anzeigen.'); return; }
    // Manche Umgebungen sperren das Vollbild und werfen dabei sofort, andere
    // lehnen erst das Versprechen ab – beides soll dasselbe sagen.
    try {
      const p = rein.call(el);
      if (p && p.catch) p.catch(err => alert('Vollbild nicht möglich: ' + (err.message || err)));
    } catch (e) {
      alert('Vollbild nicht möglich: ' + (e.message || e));
    }
  },

  /* ---------- Aus dem fertigen Sitzplan-PDF uebernehmen ----------
     Die PDFs, die Tom sich bauen laesst, tragen alles schon in sich: die Namen
     mit ihrer Position auf der Seite und die Fotos als eigene Bildobjekte mit
     Platzierungsmatrix. Daraus laesst sich die ganze Sitzordnung ablesen – wer
     wo sitzt und welches Bild dazugehoert. Einmal hochladen genuegt.

     Gespeichert wird die gerenderte Seite als ein einziges Bild je Klasse plus
     vier Verhaeltniszahlen je Schueler. Der Platz schneidet sich sein Gesicht
     daraus zu. Das haelt den Abgleich klein: ein Bild statt 25. */
  async ausPdf(datei) {
    const cls = Classes.currentClass();
    if (!cls) return;
    if (!cls.students.length) {
      alert('Diese Klasse hat noch keine Schülerliste – ohne sie lassen sich die Namen aus dem PDF niemandem zuordnen.');
      return;
    }
    this.status('lese das PDF …');
    try {
      const gelesen = await this.pdfLesen(datei, cls);
      if (!gelesen.treffer.length) {
        this.status('');
        alert('In diesem PDF wurden keine Namen aus der Klassenliste gefunden.\n\n' +
          'Entweder ist es ein reines Bild ohne Text, oder die Schreibweisen weichen ab.');
        return;
      }
      this.vorschau = gelesen;
      this.zeigeVorschau();
    } catch (e) {
      console.error(e);
      this.status('');
      alert('Das PDF konnte nicht gelesen werden.\n\n' + (e.message || e));
    }
  },

  status(text) {
    const el = document.getElementById('sitz-pdf-status');
    if (el) { el.textContent = text || ''; el.hidden = !text; }
  },

  async pdfLesen(datei, cls) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
    /* disableFontFace ist hier kein Schoenheitsfehler, sondern Notwendigkeit:
       Ohne sie wartet das Zeichnen ewig auf die Schriftdaten der Standard-
       schriften (Helvetica, ZapfDingbats). Die liegen nicht bei, und der Fehler
       „standardFontDataUrl nicht gesetzt“ laesst das Versprechen offen – kein
       Abbruch, keine Meldung, es haengt einfach. Mit Systemschriften gezeichnet
       ist das Ergebnis fuer unseren Zweck gleichwertig: Wir schneiden Fotos
       heraus, keine Buchstaben. */
    const pdf = await pdfjsLib.getDocument({
      data: await datei.arrayBuffer(),
      disableFontFace: true,
      standardFontDataUrl: 'js/vendor/standard_fonts/',
    }).promise;
    const seite = await pdf.getPage(1);

    // Rund 2000 px Breite: scharf genug fuer die Gesichter, klein genug fuer den Sync
    const roh = seite.getViewport({ scale: 1 });
    const massstab = Math.min(3, Math.max(1.5, 2000 / roh.width));
    const blick = seite.getViewport({ scale: massstab });
    const leinwand = document.createElement('canvas');
    leinwand.width = Math.round(blick.width);
    leinwand.height = Math.round(blick.height);
    await seite.render({ canvasContext: leinwand.getContext('2d'), viewport: blick }).promise;

    const { bilder, kacheln } = await this.formenAusSeite(seite);
    const texte = await this.texteAusSeite(seite);
    /* Zwei Wege, und es entscheidet das Ergebnis: Steht jeder Name in einem
       eigenen Kaestchen, ist das die bessere Grundlage – dann zaehlen die
       leeren Plaetze mit und mehrzeilige Eintraege stoeren nicht. Manche
       Vorlagen zeichnen aber nur einen Rahmen ums Foto, und der Name steht
       darunter; dort faende dieser Weg niemanden. Deshalb beide versuchen und
       den nehmen, der mehr Namen findet. */
    const ausKacheln = kacheln.length >= 4 ? this.kartenAusKacheln(kacheln, texte) : [];
    const ausText = this.kartenAusText(texte);
    const nachKacheln = ausKacheln.length >= ausText.length && ausKacheln.length > 0;
    const karten = this.zuordnen(cls, nachKacheln ? ausKacheln : ausText);

    /* Jedem Platz sein Bild: Liegt ein Kaestchen vor, gilt das Bild darin.
       Sonst das, was direkt ueber dem Namen steht. */
    for (const k of karten) {
      if (k.kachel) {
        k.bild = bilder.find(b => {
          const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
          return mx >= k.kachel.x0 && mx <= k.kachel.x1 && my >= k.kachel.y0 && my <= k.kachel.y1;
        }) || null;
        continue;
      }
      let bestes = null, beste = Infinity;
      for (const b of bilder) {
        const mitte = (b.x0 + b.x1) / 2;
        const waagerecht = Math.abs(mitte - k.x);
        const senkrecht = b.y0 - k.y;                  // Bild sitzt ueber dem Namen
        if (waagerecht > (b.x1 - b.x0) || senkrecht < -2 || senkrecht > 120) continue;
        const abstand = waagerecht + senkrecht;
        if (abstand < beste) { beste = abstand; bestes = b; }
      }
      k.bild = bestes;
    }

    // Das Raster kommt aus derselben Quelle wie die Karten
    const quelle = nachKacheln ? kacheln : karten;
    const zeilen = this.buendeln(quelle.map(k => k.y), 8).sort((a, b) => b - a);
    const spalten = this.buendeln(quelle.map(k => k.x), 25).sort((a, b) => a - b);
    for (const k of karten) {
      k.reihe = this.naechster(zeilen, k.y);
      k.spalte = this.naechster(spalten, k.x);
    }

    return {
      treffer: karten.filter(k => k.student),
      ohneZuordnung: karten.filter(k => !k.student).map(k => k.name),
      ungefaehr: karten.filter(k => k.ungefaehr)
        .map(k => `${k.name} → ${Classes.studentName(k.student)}`),
      reihen: zeilen.length,
      proReihe: spalten.length,
      gang: this.gangErkennen(spalten),
      leinwand,
      blick,
    };
  },

  async texteAusSeite(seite) {
    const inhalt = await seite.getTextContent();
    return inhalt.items
      .filter(i => i.str && i.str.trim())
      .map(i => ({
        text: i.str.trim(),
        x: i.transform[4] + (i.width || 0) / 2,
        links: i.transform[4],
        y: i.transform[5],
        breite: i.width || 0,
        hoehe: i.height || Math.abs(i.transform[3]) || 0,
      }));
  },

  /* Aus den Zeilen eines Platzes einen Namen machen. Drei Faelle kommen vor:
       Timo / Batz                      – der Normalfall
       Rebecca / (Becky) / Hess         – ein Rufname in Klammern dazwischen
       Simon / Hoefelschwei / ger       – ein langer Nachname, umbrochen
     Eine Fortsetzung erkennt man daran, dass sie klein anfaengt; sie wird ohne
     Leerzeichen angehaengt. Geklammertes ist Beiwerk und faellt weg. */
  namenAusZeilen(zeilen) {
    const worte = [];
    for (const roh of zeilen.map(z => z.trim()).filter(Boolean)) {
      if (/^\(.*\)$/.test(roh)) continue;
      if (worte.length && /^\p{Ll}/u.test(roh)) worte[worte.length - 1] += roh;
      else worte.push(roh);
    }
    if (worte.length < 2) return null;
    const vorname = worte[0];
    const nachname = worte[worte.length - 1];
    if (!this.klingtNachName(vorname) || !this.klingtNachName(nachname)) return null;
    return { vorname, nachname, name: `${nachname}, ${vorname}` };
  },

  /* Ein Kaestchen ist ein Platz: Was darin steht, gehoert zusammen. Mehrzeilige
     Eintraege wie „Rebecca / (Becky) / Hess“ sind damit kein Sonderfall mehr –
     oben der Rufname, unten der Nachname, was dazwischen steht, ist Beiwerk. */
  kartenAusKacheln(kacheln, texte) {
    const karten = [];
    for (const kachel of kacheln) {
      const drin = texte.filter(t =>
        t.x >= kachel.x0 && t.x <= kachel.x1 && t.y >= kachel.y0 && t.y <= kachel.y1);
      if (drin.length < 2) continue;
      // Stuecke derselben Grundlinie zu einer Zeile zusammenziehen
      const zeilen = [];
      for (const t of drin.sort((a, b) => b.y - a.y || a.links - b.links)) {
        const letzte = zeilen[zeilen.length - 1];
        if (letzte && Math.abs(letzte.y - t.y) <= 2) letzte.stuecke.push(t);
        else zeilen.push({ y: t.y, stuecke: [t] });
      }
      const name = this.namenAusZeilen(zeilen.map(z => z.stuecke.map(s => s.text).join(' ')));
      if (!name) continue;
      karten.push({
        ...name,
        x: (kachel.x0 + kachel.x1) / 2,
        y: (kachel.y0 + kachel.y1) / 2,
        kachel,
        student: null,
      });
    }
    return karten;
  },

  /* Rueckfallebene ohne Kaestchen. Sie muss ohne jede Linie auskommen und
     stuetzt sich allein darauf, wie der Text steht: Was untereinander liegt
     und sich waagerecht ueberlappt, gehoert zu einem Platz – bis eine groessere
     Luecke kommt, dann faengt der naechste an. Das traegt auch, wenn die
     Vorlage die Zeilen links buendig setzt statt mittig, und wenn zwischen den
     Reihen viel Luft steht.

     Der Abstand, ab dem eine Luecke als Reihenwechsel gilt, richtet sich nach
     der Schriftgroesse: zwei Zeilen Platz. */
  kartenAusText(stuecke) {
    if (!stuecke.length) return [];
    const hoehen = stuecke.map(s => s.hoehe).filter(h => h > 0).sort((a, b) => a - b);
    const zeilenhoehe = hoehen.length ? hoehen[Math.floor(hoehen.length / 2)] : 12;
    const luecke = Math.max(18, zeilenhoehe * 2.2);

    const gruppen = [];
    for (const s of [...stuecke].sort((a, b) => b.y - a.y || a.links - b.links)) {
      const links = s.links, rechts = s.links + Math.max(s.breite, 1);
      const passend = gruppen.find(g =>
        g.unten - s.y >= -2 && g.unten - s.y <= luecke &&
        Math.min(g.rechts, rechts) - Math.max(g.links, links) > Math.min(rechts - links, g.rechts - g.links) * 0.25);
      if (passend) {
        // Stuecke derselben Grundlinie bilden eine Zeile
        const zeile = passend.zeilen[passend.zeilen.length - 1];
        if (Math.abs(zeile.y - s.y) <= 2) zeile.stuecke.push(s);
        else passend.zeilen.push({ y: s.y, stuecke: [s] });
        passend.unten = Math.min(passend.unten, s.y);
        passend.links = Math.min(passend.links, links);
        passend.rechts = Math.max(passend.rechts, rechts);
      } else {
        gruppen.push({ oben: s.y, unten: s.y, links, rechts, zeilen: [{ y: s.y, stuecke: [s] }] });
      }
    }

    const karten = [];
    for (const g of gruppen) {
      const name = this.namenAusZeilen(g.zeilen.map(z =>
        z.stuecke.sort((a, b) => a.links - b.links).map(s => s.text).join(' ')));
      if (!name) continue;
      karten.push({ ...name, x: (g.links + g.rechts) / 2, y: g.oben, student: null });
    }
    return karten;
  },

  klingtNachName(t) {
    const w = String(t || '').trim();
    return w.length > 1 && w.length <= 25 && !/\d/.test(w);
  },

  /* Schreibweisen gehen auseinander: „Gaßner“ und „Gassner“, „Bandalac“ und
     „Bandalaz“, „Scheuerer“ und „Scheurer“ sind jeweils dieselbe Person. Zuerst
     wird deshalb alles Eindeutige vergeben, und erst im zweiten Durchgang das
     Ähnliche – so kann ein ungefährer Treffer keinen sicheren verdrängen. */
  zuordnen(cls, karten) {
    const frei = new Set(cls.students);
    const offen = [];

    // Erster Durchgang: gleiche Schreibweise, nur Gross-/Kleinschrift und
    // Umlautformen geglaettet
    for (const k of karten) {
      const v = this.schluesselName(k.vorname), n = this.schluesselName(k.nachname);
      const passend = [...frei].filter(s =>
        (this.schluesselName(s.first) === v && this.schluesselName(s.last) === n) ||
        (this.schluesselName(s.first) === n && this.schluesselName(s.last) === v));
      if (passend.length === 1) { k.student = passend[0]; frei.delete(passend[0]); }
      else offen.push(k);
    }

    // Zweiter Durchgang: ein, zwei Buchstaben Unterschied – aber nur, wenn
    // genau ein Name uebrig bleibt, der so nah dran ist.
    for (const k of offen) {
      const v = this.schluesselName(k.vorname), n = this.schluesselName(k.nachname);
      const bewertet = [...frei].map(s => ({
        s,
        abstand: this.abstand(this.schluesselName(s.first), v) +
                 this.abstand(this.schluesselName(s.last), n),
      })).filter(e => e.abstand <= 2).sort((a, b) => a.abstand - b.abstand);
      if (!bewertet.length) continue;
      if (bewertet.length > 1 && bewertet[0].abstand === bewertet[1].abstand) continue;
      k.student = bewertet[0].s;
      k.ungefaehr = true;
      frei.delete(bewertet[0].s);
    }
    return karten;
  },

  /* „Gaßner“, „Gassner“ und „GASSNER“ ergeben denselben Schluessel; „Müller“
     und „Mueller“ ebenso. Alles andere an Zeichen faellt weg. */
  schluesselName(t) {
    return String(t || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  },

  /* Wie viele Zeichen muessten sich aendern (Levenshtein)? Bei mehr als zwei
     wird abgebrochen – weiter entfernte Namen sind ohnehin nicht gemeint. */
  abstand(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 99;
    let vorige = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const zeile = [i];
      for (let j = 1; j <= b.length; j++) {
        zeile[j] = Math.min(
          vorige[j] + 1,
          zeile[j - 1] + 1,
          vorige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      if (Math.min(...zeile) > 2) return 99;
      vorige = zeile;
    }
    return vorige[b.length];
  },

  /* Bilder und gezeichnete Kaestchen liegen beide im Anweisungsstrom der Seite.
     Ihre Lage steckt in der laufenden Matrix – deshalb wird sie hier mitgefuehrt,
     genau wie es der Zeichner des PDFs tut. Ein Bild fuellt das Einheitsquadrat,
     ein Pfad bringt seine Punkte selbst mit. */
  async formenAusSeite(seite) {
    const ops = await seite.getOperatorList();
    const O = pdfjsLib.OPS;
    const mal = (a, b) => [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];

    let m = [1, 0, 0, 1, 0, 0];
    const stapel = [];
    const bilder = [];
    const pfade = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const arg = ops.argsArray[i];
      if (fn === O.save) stapel.push(m.slice());
      else if (fn === O.restore) m = stapel.pop() || m;
      else if (fn === O.transform) m = mal(m, arg);
      else if (fn === O.paintFormXObjectBegin) { stapel.push(m.slice()); m = mal(m, arg[0]); }
      else if (fn === O.paintFormXObjectEnd) m = stapel.pop() || m;
      else if (fn === O.paintImageXObject || fn === O.paintJpegXObject ||
               fn === O.paintInlineImageXObject || fn === O.paintImageXObjectRepeat) {
        const r = this.rechteckAus([[0, 0], [1, 0], [0, 1], [1, 1]], m);
        // Winzige Grafiken (Linien, Punkte) sind keine Portraits
        if (r.x1 - r.x0 > 15 && r.y1 - r.y0 > 15) bilder.push(r);
      } else if (fn === O.constructPath) {
        const punkte = this.pfadPunkte(arg[0], arg[1], O);
        if (punkte.length) pfade.push(this.rechteckAus(punkte, m));
      }
    }
    const linien = { senkrecht: [], waagerecht: [] };
    for (const r of pfade) {
      const b = r.x1 - r.x0, h = r.y1 - r.y0;
      if (h > 15 && b <= 3) linien.senkrecht.push({ x: (r.x0 + r.x1) / 2, y0: r.y0, y1: r.y1 });
      else if (b > 15 && h <= 3) linien.waagerecht.push({ y: (r.y0 + r.y1) / 2, x0: r.x0, x1: r.x1 });
    }
    // Gefuellte Kaestchen zuerst; zeichnet die Vorlage stattdessen eine Tabelle,
    // werden die Zellen aus ihren Linien zurueckgewonnen.
    let kacheln = this.kachelnFiltern(pfade);
    if (kacheln.length < 4) kacheln = this.kachelnAusLinien(linien);
    return { bilder, kacheln, linien };
  },

  /* Eine Tabelle besteht aus Strichen, nicht aus Kaestchen. Zwischen zwei
     waagerechten Strichen liegt eine Reihe, zwischen zwei senkrechten eine
     Spalte – zusammen ergibt das die Zellen. Was kein waagerechter Strich
     ueberspannt, ist keine Zelle, sondern der Gang zwischen zwei Bloecken. */
  kachelnAusLinien(linien) {
    if (linien.waagerecht.length < 2 || linien.senkrecht.length < 2) return [];
    const reihen = this.buendeln(linien.waagerecht.map(l => l.y), 3).sort((a, b) => b - a);
    const kacheln = [];
    for (let i = 0; i < reihen.length - 1; i++) {
      const oben = reihen[i], unten = reihen[i + 1];
      if (oben - unten < 20) continue;
      const balken = linien.waagerecht.filter(l => Math.abs(l.y - oben) <= 3 || Math.abs(l.y - unten) <= 3);
      const senkrecht = linien.senkrecht
        .filter(l => l.y0 <= unten + 3 && l.y1 >= oben - 3)
        .map(l => l.x);
      const spalten = this.buendeln(senkrecht, 3).sort((a, b) => a - b);
      for (let j = 0; j < spalten.length - 1; j++) {
        const links = spalten[j], rechts = spalten[j + 1];
        if (rechts - links < 20) continue;
        // Nur wo oben oder unten wirklich ein Strich laeuft, steht eine Zelle
        const gedeckt = balken.some(l => l.x0 <= links + 3 && l.x1 >= rechts - 3);
        if (!gedeckt) continue;
        kacheln.push({ x0: links, x1: rechts, y0: unten, y1: oben, x: (links + rechts) / 2, y: (unten + oben) / 2 });
      }
    }
    return kacheln;
  },

  rechteckAus(punkte, m) {
    const xs = punkte.map(([x, y]) => m[0] * x + m[2] * y + m[4]);
    const ys = punkte.map(([x, y]) => m[1] * x + m[3] * y + m[5]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  },

  /* Ein Pfad ist eine Folge von Anweisungen mit einer gemeinsamen Zahlenliste.
     Wie viele Zahlen eine Anweisung verbraucht, haengt an ihr – „Rechteck“ etwa
     nennt Ecke, Breite und Hoehe statt zweier Punkte. */
  pfadPunkte(anweisungen, zahlen, O) {
    const punkte = [];
    let i = 0;
    for (const op of anweisungen) {
      if (op === O.moveTo || op === O.lineTo) {
        punkte.push([zahlen[i], zahlen[i + 1]]); i += 2;
      } else if (op === O.curveTo) {
        punkte.push([zahlen[i], zahlen[i + 1]], [zahlen[i + 2], zahlen[i + 3]], [zahlen[i + 4], zahlen[i + 5]]);
        i += 6;
      } else if (op === O.curveTo2 || op === O.curveTo3) {
        punkte.push([zahlen[i], zahlen[i + 1]], [zahlen[i + 2], zahlen[i + 3]]); i += 4;
      } else if (op === O.rectangle) {
        punkte.push([zahlen[i], zahlen[i + 1]], [zahlen[i] + zahlen[i + 2], zahlen[i + 1] + zahlen[i + 3]]);
        i += 4;
      }
    }
    return punkte.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  },

  /* Aus allen gezeichneten Formen die Sitzkaestchen herausfischen: Sie sind in
     der Ueberzahl und alle gleich hoch. Alles deutlich Groessere (Seitenrahmen)
     oder Kleinere (Striche, Haken) faellt damit von selbst weg. Jedes Kaestchen
     wird oft zweimal gezeichnet – Fuellung und Rand –, deshalb am Ende noch
     zusammenlegen, was aufeinanderliegt. */
  kachelnFiltern(pfade) {
    const taugliche = pfade.filter(r => {
      const b = r.x1 - r.x0, h = r.y1 - r.y0;
      return b >= 30 && b <= 300 && h >= 30 && h <= 220;
    });
    if (taugliche.length < 4) return [];
    const hoehen = taugliche.map(r => Math.round(r.y1 - r.y0));
    const zaehler = new Map();
    for (const h of hoehen) zaehler.set(h, (zaehler.get(h) || 0) + 1);
    let haeufigste = 0, wieOft = 0;
    for (const [h, n] of zaehler) if (n > wieOft) { wieOft = n; haeufigste = h; }
    if (wieOft < 4) return [];

    const passend = taugliche.filter(r =>
      Math.abs((r.y1 - r.y0) - haeufigste) <= Math.max(3, haeufigste * 0.15));
    const raus = [];
    for (const r of passend) {
      const mx = (r.x0 + r.x1) / 2, my = (r.y0 + r.y1) / 2;
      const schon = raus.find(a =>
        Math.abs((a.x0 + a.x1) / 2 - mx) < 6 && Math.abs((a.y0 + a.y1) / 2 - my) < 6);
      if (!schon) raus.push({ ...r, x: mx, y: my });
    }
    return raus;
  },

  /* Wo im PDF der Gang liegt: Zwischen zwei Bloecken klafft eine groessere
     Luecke als zwischen zwei Tischen. Ist keine auffaellig, wird in der Mitte
     geteilt – das ist die uebliche Aufteilung 4 · Gang · 4. */
  gangErkennen(spalten) {
    if (spalten.length < 4) return 0;
    const luecken = spalten.slice(1).map((x, i) => x - spalten[i]);
    const sortiert = [...luecken].sort((a, b) => a - b);
    const mitte = sortiert[Math.floor(sortiert.length / 2)];
    let groesste = 0, wo = -1;
    luecken.forEach((l, i) => { if (l > groesste) { groesste = l; wo = i; } });
    if (mitte > 0 && groesste > mitte * 1.6) return wo + 1;
    return spalten.length % 2 === 0 ? spalten.length / 2 : 0;
  },

  /* Werte, die dicht beieinander liegen, zu einem gemeinsamen Wert zusammenziehen */
  buendeln(werte, spanne) {
    const sortiert = [...werte].sort((a, b) => a - b);
    const gruppen = [];
    for (const w of sortiert) {
      const letzte = gruppen[gruppen.length - 1];
      if (letzte && w - letzte[letzte.length - 1] <= spanne) letzte.push(w);
      else gruppen.push([w]);
    }
    return gruppen.map(g => g.reduce((a, b) => a + b, 0) / g.length);
  },

  naechster(werte, w) {
    let beste = 0, abstand = Infinity;
    werte.forEach((v, i) => { const d = Math.abs(v - w); if (d < abstand) { abstand = d; beste = i; } });
    return beste;
  },

  /* ---------- Vorschau vor dem Übernehmen ---------- */
  zeigeVorschau() {
    const v = this.vorschau;
    const kasten = document.getElementById('sitz-pdf-vorschau');
    const liste = document.getElementById('sitz-pdf-bilder');
    const text = document.getElementById('sitz-pdf-text');
    this.status('');

    const mitBild = v.treffer.filter(k => k.bild).length;
    text.innerHTML =
      `<strong>${v.treffer.length}</strong> Namen zugeordnet, davon <strong>${mitBild}</strong> mit Foto · ` +
      `Raster ${v.reihen} Reihen × ${v.proReihe} Plätze` +
      (v.gang ? ` mit Gang nach Platz ${v.gang}` : '') +
      (v.ungefaehr.length
        ? `<br>Abweichende Schreibweise, trotzdem zugeordnet: ${Band.esc(v.ungefaehr.join(' · '))}`
        : '') +
      (v.ohneZuordnung.length
        ? `<br><span class="warnung">Nicht in der Klassenliste gefunden: ${Band.esc(v.ohneZuordnung.join(', '))}</span>`
        : '');

    liste.innerHTML = '';
    for (const k of v.treffer) {
      const zelle = document.createElement('figure');
      zelle.className = 'sitz-vorschau-zelle';
      if (k.bild) {
        const klein = this.ausschnitt(k.bild, v, 120);
        zelle.appendChild(klein);
      } else {
        const leer = document.createElement('div');
        leer.className = 'sitz-vorschau-ohne';
        leer.textContent = 'kein Foto';
        zelle.appendChild(leer);
      }
      const bu = document.createElement('figcaption');
      bu.textContent = [k.student.first, k.student.last].filter(Boolean).join(' ');
      zelle.appendChild(bu);
      liste.appendChild(zelle);
    }
    kasten.hidden = false;
    kasten.scrollIntoView({ block: 'nearest' });
  },

  /* Ein Ausschnitt der gerenderten Seite als eigenes Bild – fuer die Vorschau */
  ausschnitt(rechteck, v, kante) {
    const [x, y, b, h] = this.inBildpunkten(rechteck, v);
    const c = document.createElement('canvas');
    c.width = c.height = kante;
    c.getContext('2d').drawImage(v.leinwand, x, y, b, h, 0, 0, kante, kante);
    const bild = new Image();
    bild.src = c.toDataURL('image/jpeg', 0.8);
    return bild;
  },

  /* PDF-Koordinaten zaehlen von unten, Bildpunkte von oben – der Blickwinkel
     rechnet das um, samt Massstab. */
  inBildpunkten(r, v) {
    const [x0, y0] = v.blick.convertToViewportPoint(r.x0, r.y1);
    const [x1, y1] = v.blick.convertToViewportPoint(r.x1, r.y0);
    return [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)];
  },

  abbrechenVorschau() {
    this.vorschau = null;
    document.getElementById('sitz-pdf-vorschau').hidden = true;
    this.status('');
  },

  async uebernehmenAusPdf() {
    const v = this.vorschau;
    const cls = Classes.currentClass();
    if (!v || !cls) return;
    this.status('übernehme …');
    const p = this.plan(cls);
    this.merke(cls, p);

    p.reihen = Math.max(1, Math.min(this.MAX_REIHEN, v.reihen));
    p.proReihe = Math.max(1, Math.min(this.MAX_PRO_REIHE, v.proReihe));
    p.gang = v.gang > 0 && v.gang < p.proReihe ? v.gang : 0;
    p.ohne = [];
    p.belegt = {};
    const bilder = {};
    for (const k of v.treffer) {
      if (k.reihe >= p.reihen || k.spalte >= p.proReihe) continue;
      p.belegt[this.schluessel(k.reihe, k.spalte)] = k.student.id;
      if (!k.bild) continue;
      const [x, y, b, h] = this.inBildpunkten(k.bild, v);
      // Verhaeltniszahlen statt Bildpunkte: dann ueberlebt der Ausschnitt jede Groesse
      bilder[k.student.id] = {
        x: +(x / v.leinwand.width).toFixed(5),
        y: +(y / v.leinwand.height).toFixed(5),
        b: +(b / v.leinwand.width).toFixed(5),
        h: +(h / v.leinwand.height).toFixed(5),
      };
    }

    /* Bringt das PDF keine Fotos mit – die Vorlage ohne Bilder tut das nicht –,
       bleiben die vorhandenen unangetastet. Sonst waere ein Plan ohne Fotos das
       Ende der Fotos, und das will niemand. */
    if (Object.keys(bilder).length) {
      const blob = await new Promise(r => v.leinwand.toBlob(r, 'image/jpeg', 0.72));
      try {
        await Store.putFoto(this.fotoSchluessel(cls),
          new File([blob], `Sitzplan-Fotos ${cls.name}.jpg`, { type: 'image/jpeg' }));
      } catch (e) {
        this.status('');
        alert('Die Bilder konnten nicht gespeichert werden.\n\n' + (e.message || e));
        return;
      }
      cls.fotos = { bilder };
      this._fotoFuer = null;          // der Ausschnitt-Zwischenspeicher ist veraltet
    }
    Classes.persist();
    this.abbrechenVorschau();
    this.render();
  },

  fotoSchluessel(cls) { return 'klassenfoto-' + cls.id; },

  /* Je Schueler ein kleines, eigenstaendiges Bild fuer die Druckseite */
  async druckAusschnitte(cls) {
    const raus = {};
    if (!this.hatFotos(cls)) return raus;
    const url = await this.fotoUrl(cls);
    if (!url) return raus;
    const bild = await new Promise((fertig, schief) => {
      const i = new Image();
      i.onload = () => fertig(i);
      i.onerror = schief;
      i.src = url;
    }).catch(() => null);
    if (!bild) return raus;
    const kante = 150;
    const c = document.createElement('canvas');
    c.width = c.height = kante;
    const stift = c.getContext('2d');
    for (const [id, r] of Object.entries(cls.fotos.bilder)) {
      stift.clearRect(0, 0, kante, kante);
      stift.drawImage(bild,
        r.x * bild.width, r.y * bild.height, r.b * bild.width, r.h * bild.height,
        0, 0, kante, kante);
      raus[id] = c.toDataURL('image/jpeg', 0.75);
    }
    return raus;
  },

  async fotosEntfernen() {
    const cls = Classes.currentClass();
    if (!cls) return;
    if (!confirm('Die Fotos dieser Klasse entfernen?\n\n' +
      'Die Sitzordnung bleibt, nur die Bilder verschwinden. Das Sitzplan-PDF lässt ' +
      'sich jederzeit wieder einlesen.')) return;
    delete cls.fotos;
    Classes.persist();
    if (this._fotoUrl) { URL.revokeObjectURL(this._fotoUrl); this._fotoUrl = null; }
    this._fotoFuer = null;
    try { await Store.deleteFoto(this.fotoSchluessel(cls)); } catch (e) { console.error(e); }
    this.render();
  },

  /* ---------- Drucken ---------- */
  async drucken() {
    const cls = Classes.currentClass();
    if (!cls) return;
    const p = this.plan(cls);
    if (!Object.keys(p.belegt).length) {
      alert('Auf dem Plan sitzt noch niemand.\n\n„Nach Klassenliste“ setzt die Klasse in einem Zug.');
      return;
    }
    // Auf Papier gehoeren die Gesichter mit – dafuer sind sie ja da. Jeder
    // Ausschnitt wird einmal frisch geschnitten und als Bild eingebettet.
    const ausschnitte = await this.druckAusschnitte(cls);
    let zeilen = '';
    for (let r = 0; r < p.reihen; r++) {
      let felder = '';
      for (let s = 0; s < p.proReihe; s++) {
        const k = this.schluessel(r, s);
        if (p.ohne.includes(k)) { felder += '<td class="ohne"></td>'; continue; }
        if (p.gang && s === p.gang) felder += '<td class="gang"></td>';
        const stud = this.schueler(cls, p.belegt[k]);
        felder += `<td class="${stud ? 'platz' : 'leer'}">` + (stud
          ? (ausschnitte[stud.id] ? `<img src="${ausschnitte[stud.id]}" alt="">` : '') +
            `<span class="vn">${Band.esc(stud.first || stud.last)}</span>` +
            (stud.first ? `<span class="nn">${Band.esc(stud.last)}</span>` : '')
          : '') + '</td>';
      }
      zeilen += `<tr>${felder}</tr>`;
    }
    const wartend = this.wartebank(cls, p);
    const bank = wartend.length
      ? `<p class="sitz-bank-druck"><strong>Ohne Platz:</strong> ` +
        wartend.map(s => Band.esc(Classes.studentName(s))).join(' · ') + '</p>'
      : '';
    /* Quer, sonst passen acht Plaetze nebeneinander nicht aufs Blatt. Die
       Ausrichtung laesst sich nur fuer die ganze Seite setzen, deshalb gilt
       diese Regel nur, solange gedruckt wird. */
    const quer = document.createElement('style');
    quer.textContent = '@page { size: A4 landscape; margin: 10mm; }';
    document.head.appendChild(quer);

    // Die Tafel steht unten – auf dem Papier genauso wie auf dem Bildschirm,
    // sonst haelt man das Blatt verkehrt herum vor der Klasse.
    const titel = 'Klasse ' + Classes.klasseKurz(cls.name) + (cls.year ? ' – ' + cls.year : '');
    Band.printHtml(titel,
      `<table class="sitz-druck">${zeilen}</table>` +
      '<p class="sitz-tafel-druck">Tafel</p>' + bank,
      `${Object.keys(p.belegt).length} von ${cls.students.length} Schülern gesetzt`,
      this.hatFotos(cls) ? 'Sitzplan mit Foto' : 'Sitzplan');
    setTimeout(() => quer.remove(), 1000);
  },
};
