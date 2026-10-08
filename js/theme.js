/* Theme-Umschaltung. Dunkel ist der Standard; die Wahl bleibt gespeichert.
   Wird im <head> geladen, damit die Seite gleich richtig gefärbt aufbaut. */
const Theme = {
  KEY: 'schooltool-theme',

  current() {
    return localStorage.getItem(this.KEY) === 'light' ? 'light' : 'dark';
  },

  apply(mode, doc = document) {
    if (mode === 'light') doc.documentElement.dataset.theme = 'light';
    else delete doc.documentElement.dataset.theme;
  },

  set(mode) {
    localStorage.setItem(this.KEY, mode);
    this.apply(mode);
    this.updateButton();
  },

  toggle() {
    this.set(this.current() === 'dark' ? 'light' : 'dark');
  },

  updateButton() {
    const btn = document.getElementById('btn-theme');
    if (!btn) return;
    const dark = this.current() === 'dark';
    btn.innerHTML = Icons.raw(dark ? 'sun' : 'moon') + (dark ? 'Hell' : 'Dunkel');
    btn.title = dark ? 'Zum hellen Design wechseln' : 'Zum dunklen Design wechseln';
  },

  init() {
    this.apply(this.current());
  },
};

Theme.init();

/* Gesichter ein/aus – für den Moment, in dem ein Schüler über die Schulter
   schaut. Steht am <html>, damit beim Laden kein Gesicht kurz aufblitzt; das
   Ausblenden selbst erledigt das Stylesheet, ganz ohne Neuzeichnen. */
const Gesichter = {
  KEY: 'schooltool-gesichter',

  sichtbar() { return localStorage.getItem(this.KEY) !== 'aus'; },

  apply() {
    if (this.sichtbar()) delete document.documentElement.dataset.gesichter;
    else document.documentElement.dataset.gesichter = 'aus';
    const schalter = document.getElementById('gesichter-schalter');
    if (schalter) schalter.checked = this.sichtbar();
  },

  set(an) {
    try { localStorage.setItem(this.KEY, an ? 'an' : 'aus'); } catch (e) { /* egal */ }
    this.apply();
  },

  init() {
    this.apply();
    document.addEventListener('DOMContentLoaded', () => {
      const schalter = document.getElementById('gesichter-schalter');
      if (!schalter) return;
      schalter.checked = this.sichtbar();
      schalter.addEventListener('change', () => this.set(schalter.checked));
    });
    // V wie „View“: Gesichter ein/aus – nur wenn gerade nichts getippt wird
    document.addEventListener('keydown', e => {
      if (e.key !== 'v' && e.key !== 'V') return;
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const ziel = e.target;
      if (ziel && ziel.closest && ziel.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      this.set(!this.sichtbar());
    });
  },
};

Gesichter.init();
