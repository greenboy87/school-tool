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

    const karten = this.zuordnen(cls, await this.kartenAusSeite(seite, cls));
    const bilder = await this.bildRechtecke(seite);

    // Jedem Namen das Bild zuordnen, das direkt ueber ihm steht
    for (const k of karten) {
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

    // Raster: Zeilen aus den Y-Werten, Spalten aus allen X-Mitten
    const zeilen = this.buendeln(karten.map(k => k.y), 8).sort((a, b) => b - a);
    const spalten = this.buendeln(karten.map(k => k.x), 40).sort((a, b) => a - b);
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

  /* Namen stehen zweizeilig: Vorname ueber Nachname. Beide gehoeren zusammen,
     wenn ihre Mitten uebereinander liegen und die Zeilen dicht beieinander sind. */
  async kartenAusSeite(seite, cls) {
    const inhalt = await seite.getTextContent();
    const stuecke = inhalt.items
      .filter(i => i.str && i.str.trim())
      .map(i => ({
        text: i.str.trim(),
        x: i.transform[4] + (i.width || 0) / 2,
        y: i.transform[5],
        breite: i.width || 0,
      }));

    const zeilenWerte = this.buendeln(stuecke.map(s => s.y), 4).sort((a, b) => b - a);
    const nachZeile = new Map();
    for (const s of stuecke) {
      const z = this.naechster(zeilenWerte, s.y);
      if (!nachZeile.has(z)) nachZeile.set(z, []);
      nachZeile.get(z).push(s);
    }

    const karten = [];
    const benutzt = new Set();
    for (let i = 0; i < zeilenWerte.length - 1; i++) {
      const oben = nachZeile.get(i) || [];
      const unten = nachZeile.get(i + 1) || [];
      const abstand = zeilenWerte[i] - zeilenWerte[i + 1];
      if (abstand > 20) continue;                       // zu weit: keine zwei Zeilen einer Karte
      for (const o of oben) {
        if (benutzt.has(o)) continue;
        let partner = null, beste = Infinity;
        for (const u of unten) {
          if (benutzt.has(u)) continue;
          const d = Math.abs(u.x - o.x);
          if (d < beste) { beste = d; partner = u; }
        }
        if (!partner || beste > 30) continue;
        // Ueberschriften stehen auch zweizeilig da („Klasse 5B - 2026“). Namen
        // tragen keine Ziffern und sind kurz – daran lassen sie sich trennen.
        if (!this.klingtNachName(o.text) || !this.klingtNachName(partner.text)) continue;
        benutzt.add(o); benutzt.add(partner);
        karten.push({
          name: `${partner.text}, ${o.text}`,
          vorname: o.text,
          nachname: partner.text,
          x: (o.x + partner.x) / 2,
          y: zeilenWerte[i],
          student: null,
        });
      }
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

  /* Die Bilder liegen als eigene Objekte auf der Seite. Ihre Lage steckt in der
     laufenden Matrix – deshalb wird sie hier mitgefuehrt, genau wie es der
     Zeichner des PDFs tut. Jedes Bild fuellt das Einheitsquadrat. */
  async bildRechtecke(seite) {
    const ops = await seite.getOperatorList();
    const O = pdfjsLib.OPS;
    const mal = (a, b) => [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    const punkt = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

    let m = [1, 0, 0, 1, 0, 0];
    const stapel = [];
    const rechtecke = [];
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
        const ecken = [punkt(m, 0, 0), punkt(m, 1, 0), punkt(m, 0, 1), punkt(m, 1, 1)];
        const xs = ecken.map(e => e[0]), ys = ecken.map(e => e[1]);
        const r = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
        // Winzige Grafiken (Linien, Punkte) sind keine Portraits
        if (r.x1 - r.x0 > 15 && r.y1 - r.y0 > 15) rechtecke.push(r);
      }
    }
    return rechtecke;
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
        felder += '<td>' + (stud
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
    // Die Tafel steht unten – auf dem Papier genauso wie auf dem Bildschirm,
    // sonst haelt man das Blatt verkehrt herum vor der Klasse.
    Band.printHtml(`Sitzplan ${cls.name}`,
      `<table class="sitz-druck">${zeilen}</table>` +
      '<p class="sitz-tafel-druck">Tafel</p>' + bank,
      `${Object.keys(p.belegt).length} von ${cls.students.length} Schülern gesetzt`);
  },
};
