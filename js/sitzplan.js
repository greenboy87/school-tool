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
    an('sitz-bank', e => {
      // Auf die Bank selbst getippt: der gewählte Schüler verlässt seinen Platz
      if (e.target.closest('.sitz-bank-chip')) return;
      this.aufDieBank();
    });
    // Beim Öffnen des Unterreiters neu zeichnen – die Klasse kann gewechselt haben
    document.querySelectorAll('.subtab-btn[data-subtab="sitzplan"]')
      .forEach(b => b.addEventListener('click', () => this.render()));
  },

  /* Der Plan entsteht beim ersten Hinsehen. Fünf Viererreihen sind die
     häufigste Aufteilung – wer es anders hat, ändert zwei Zahlen. */
  plan(cls) {
    const p = (cls.sitzplan && typeof cls.sitzplan === 'object') ? cls.sitzplan : {};
    if (!(p.reihen > 0)) p.reihen = 5;
    if (!(p.proReihe > 0)) p.proReihe = 4;
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
    document.getElementById('sitz-raum-zeile').hidden = !this.raumOffen;
    const raumKnopf = document.getElementById('btn-sitz-raum');
    if (raumKnopf) raumKnopf.classList.toggle('primary', this.raumOffen);

    gitter.classList.toggle('bearbeiten', this.raumOffen);
    gitter.style.gridTemplateColumns = `repeat(${p.proReihe}, minmax(0, 1fr))`;
    gitter.innerHTML = '';
    for (let r = 0; r < p.reihen; r++) {
      for (let s = 0; s < p.proReihe; s++) {
        gitter.appendChild(this.platzKnopf(cls, p, this.schluessel(r, s)));
      }
    }

    this.zeichneBank(cls, p);
    this.zeichneHinweis(cls, p);
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
      el.innerHTML = `<span class="sitz-vorname">${Band.esc(stud.first || stud.last)}</span>` +
        (stud.first ? `<span class="sitz-nachname">${Band.esc(stud.last)}</span>` : '');
      el.title = Classes.studentName(stud);
    } else {
      el.innerHTML = '<span class="sitz-leer">frei</span>';
    }
    el.addEventListener('click', () => this.tippePlatz(k));
    return el;
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

  /* ---------- Drucken ---------- */
  drucken() {
    const cls = Classes.currentClass();
    if (!cls) return;
    const p = this.plan(cls);
    if (!Object.keys(p.belegt).length) {
      alert('Auf dem Plan sitzt noch niemand.\n\n„Nach Klassenliste“ setzt die Klasse in einem Zug.');
      return;
    }
    let zeilen = '';
    for (let r = 0; r < p.reihen; r++) {
      let felder = '';
      for (let s = 0; s < p.proReihe; s++) {
        const k = this.schluessel(r, s);
        if (p.ohne.includes(k)) { felder += '<td class="ohne"></td>'; continue; }
        const stud = this.schueler(cls, p.belegt[k]);
        felder += '<td>' + (stud
          ? `<span class="vn">${Band.esc(stud.first || stud.last)}</span>` +
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
    // Die Tafel steht oben – auf dem Papier genauso wie auf dem Bildschirm,
    // sonst steht man mit gedrehtem Blatt vor der Klasse.
    Band.printHtml(`Sitzplan ${cls.name}`,
      '<p class="sitz-tafel-druck">Tafel</p>' +
      `<table class="sitz-druck">${zeilen}</table>` + bank,
      `${Object.keys(p.belegt).length} von ${cls.students.length} Schülern gesetzt`);
  },
};
