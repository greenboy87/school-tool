/* Eigene Kurzinfos für Elemente mit data-tip.

   Der eingebaute title-Tooltip des Browsers erscheint erst nach etwa einer
   Sekunde, und daran lässt sich nichts drehen. Beim Überfliegen einer Tabelle
   ist das zu lang – hier kommt die Info sofort.

   Die Blase hängt am <body>, nicht am Element: Die Mitgliedertabelle scrollt
   auf schmalen Fenstern in sich selbst, und eine Blase darin würde am Rand
   abgeschnitten. */
const Tipps = {
  VERZOEGERUNG: 90,     // kurz genug, um sofort zu wirken, lang genug gegen Flackern
  el: null,
  timer: null,

  init() {
    document.addEventListener('mouseover', e => {
      const ziel = e.target.closest && e.target.closest('[data-tip]');
      if (!ziel || ziel === this.aktuell) return;
      this.aktuell = ziel;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.zeige(ziel), this.VERZOEGERUNG);
    });
    document.addEventListener('mouseout', e => {
      const ziel = e.target.closest && e.target.closest('[data-tip]');
      if (!ziel) return;
      this.aktuell = null;
      clearTimeout(this.timer);
      this.verstecke();
    });
    // Beim Scrollen stünde die Blase sonst neben dem falschen Element
    window.addEventListener('scroll', () => this.verstecke(), true);
    window.addEventListener('blur', () => this.verstecke());
  },

  blase() {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'tipp-blase';
      this.el.hidden = true;
      document.body.appendChild(this.el);
    }
    return this.el;
  },

  zeige(ziel) {
    const text = ziel.dataset.tip;
    if (!text) return;
    const b = this.blase();
    b.textContent = text;
    b.hidden = false;
    const r = ziel.getBoundingClientRect();
    const bb = b.getBoundingClientRect();
    // Über dem Element, mittig; kein Platz nach oben, dann darunter
    let oben = r.top - bb.height - 8;
    if (oben < 4) oben = r.bottom + 8;
    let links = r.left + r.width / 2 - bb.width / 2;
    links = Math.max(6, Math.min(links, window.innerWidth - bb.width - 6));
    b.style.top = Math.round(oben) + 'px';
    b.style.left = Math.round(links) + 'px';
  },

  verstecke() {
    if (this.el) this.el.hidden = true;
  },
};
