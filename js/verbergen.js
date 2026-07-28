/* Namen und Noten auf Knopfdruck ausblenden.

   Gedacht für den Unterricht: Sobald Schüler auf den Bildschirm sehen können,
   verschwinden Klassenliste bzw. Notentabelle hinter einer Platte. Der Zustand
   bleibt gespeichert – einmal verborgen, bleibt es verborgen, auch nach dem
   Klassenwechsel oder Neuladen. */
const Verbergen = {
  bereiche: {
    schueler: { ziele: ['student-list'], knopf: 'btn-hide-students' },
    // Eine gemeinsame Hülle statt drei Elemente: Gruppen, Notentabelle und Schnitt
    // verschwinden zusammen, und ein <div> trägt die Abdeckplatte zuverlässiger
    // als eine <table>.
    noten:    { ziele: ['noten-bereich'], knopf: 'btn-hide-grades' },
  },

  init() {
    for (const name of Object.keys(this.bereiche)) {
      const knopf = document.getElementById(this.bereiche[name].knopf);
      if (!knopf) continue;
      knopf.addEventListener('click', () => this.umschalten(name));
      this.anwenden(name);
    }
  },

  istVerborgen(name) { return localStorage.getItem('verbergen-' + name) === '1'; },

  umschalten(name) {
    localStorage.setItem('verbergen-' + name, this.istVerborgen(name) ? '0' : '1');
    this.anwenden(name);
  },

  /* Nach jedem Neuzeichnen aufrufen, damit frisch erzeugte Tabellen ebenfalls
     verborgen bleiben. */
  anwenden(name) {
    const bereich = this.bereiche[name];
    if (!bereich) return;
    const versteckt = this.istVerborgen(name);
    for (const id of bereich.ziele) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('ist-verborgen', versteckt);
    }
    const knopf = document.getElementById(bereich.knopf);
    if (knopf) {
      knopf.textContent = versteckt ? 'Einblenden' : 'Verbergen';
      knopf.classList.toggle('aktiv', versteckt);
      knopf.title = versteckt
        ? 'Wieder sichtbar machen'
        : 'Namen ausblenden – z. B. wenn Schüler auf den Bildschirm sehen können';
    }
  },

  alleAnwenden() { Object.keys(this.bereiche).forEach(n => this.anwenden(n)); },
};

// `const` legt nichts auf window ab – classes.js prüft aber darüber, ob es das Modul gibt.
window.Verbergen = Verbergen;
