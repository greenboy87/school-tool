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
