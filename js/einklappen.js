/* Klassenlisten ein- und ausklappen.

   Eingeklappt verschwindet der Bereich samt Platzbedarf – das hält den Reiter
   übersichtlich, wenn es gerade um die Gruppen geht. Der Zustand bleibt
   gespeichert und überlebt Neuzeichnen, Klassenwechsel und Neuladen. */
const Einklappen = {
  bereiche: {
    schueler: { inhalt: 'klassenliste-inhalt', knopf: 'btn-toggle-students' },
    noten:    { inhalt: 'noten-bereich',       knopf: 'btn-toggle-grades' },
  },

  init() {
    for (const name of Object.keys(this.bereiche)) {
      const knopf = document.getElementById(this.bereiche[name].knopf);
      if (!knopf) continue;
      knopf.addEventListener('click', () => this.umschalten(name));
      this.anwenden(name);
    }
  },

  istZu(name) { return localStorage.getItem('eingeklappt-' + name) === '1'; },

  umschalten(name) {
    localStorage.setItem('eingeklappt-' + name, this.istZu(name) ? '0' : '1');
    this.anwenden(name);
  },

  /* Nach jedem Neuzeichnen aufrufen, damit frisch erzeugte Listen zu bleiben. */
  anwenden(name) {
    const b = this.bereiche[name];
    if (!b) return;
    const zu = this.istZu(name);
    const inhalt = document.getElementById(b.inhalt);
    if (inhalt) inhalt.classList.toggle('ist-eingeklappt', zu);
    const knopf = document.getElementById(b.knopf);
    if (knopf) {
      knopf.setAttribute('aria-expanded', zu ? 'false' : 'true');
      knopf.classList.toggle('zu', zu);
      const pfeil = knopf.querySelector('.klapp-pfeil');
      if (pfeil) pfeil.innerHTML = Icons.raw(zu ? 'chevronDown' : 'chevronUp');
    }
  },
};

// `const` legt nichts auf window ab – classes.js prüft aber darüber, ob es das Modul gibt.
window.Einklappen = Einklappen;
