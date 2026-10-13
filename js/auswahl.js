/* Aufgeklappte Auswahllisten im Design der Seite.

   Die geschlossene <select> sieht schon passend aus; nur die aufgeklappte Liste
   malt sonst das Betriebssystem (weiß auf blau). Hier fängt ein Klick, ein
   Antippen oder die Tastatur das Aufklappen ab und zeigt stattdessen eine
   eigene Liste. Das <select> bleibt das echte Feld: Auswahl setzt seinen Wert
   und löst input/change aus wie gewohnt – der übrige Code merkt keinen
   Unterschied. Funktioniert über Ereignis-Delegation, also auch für Listen,
   die erst später entstehen. Ausnahmen: multiple, size > 1, data-nativ. */
const Auswahl = {
  sel: null,         // das gerade aufgeklappte <select>
  liste: null,       // die eigene Liste
  markiert: -1,      // Index in this.eintraege
  eintraege: [],     // [{ el, option }]

  init() {
    const greifen = e => {
      const sel = e.target.closest && e.target.closest('select');
      if (!sel || !this.passt(sel)) return;
      if (e.type === 'mousedown' && e.button !== 0) return;
      e.preventDefault();
      if (this.sel === sel) { this.zu(); return; }
      sel.focus({ preventScroll: true });
      this.auf(sel);
    };
    document.addEventListener('mousedown', greifen, true);
    // iPad: ohne das öffnet Safari beim Antippen sein eigenes Rad
    document.addEventListener('touchstart', e => {
      const sel = e.target.closest && e.target.closest('select');
      if (sel && this.passt(sel)) greifen(e);
    }, { capture: true, passive: false });
    document.addEventListener('keydown', e => this.taste(e), true);
    document.addEventListener('pointerdown', e => {
      if (this.liste && !this.liste.contains(e.target) && e.target !== this.sel) this.zu();
    }, true);
    window.addEventListener('resize', () => this.zu());
    document.addEventListener('scroll', e => {
      if (this.liste && !this.liste.contains(e.target)) this.zu();
    }, true);
  },

  passt(sel) {
    return !sel.disabled && !sel.multiple && !(sel.size > 1) && !sel.hasAttribute('data-nativ');
  },

  auf(sel) {
    this.zu();
    this.sel = sel;
    const liste = document.createElement('div');
    liste.className = 'auswahl-liste';
    liste.setAttribute('role', 'listbox');
    this.eintraege = [];
    const eintrag = (o, eingerueckt) => {
      const el = document.createElement('div');
      el.className = 'auswahl-eintrag' + (eingerueckt ? ' eingerueckt' : '');
      el.setAttribute('role', 'option');
      el.textContent = o.textContent;
      if (o.disabled) el.classList.add('aus');
      if (o.selected) { el.classList.add('gewaehlt'); el.setAttribute('aria-selected', 'true'); }
      if (!o.disabled) {
        const i = this.eintraege.length;
        el.addEventListener('pointermove', () => this.markieren(i, true));
        el.addEventListener('click', () => this.waehlen(o));
        this.eintraege.push({ el, option: o });
      }
      liste.append(el);
    };
    for (const kind of sel.children) {
      if (kind.tagName === 'OPTGROUP') {
        const kopf = document.createElement('div');
        kopf.className = 'auswahl-gruppe';
        kopf.textContent = kind.label;
        liste.append(kopf);
        for (const o of kind.children) if (!o.hidden) eintrag(o, true);
      } else if (kind.tagName === 'OPTION' && !kind.hidden) {
        eintrag(kind, false);
      }
    }
    if (!this.eintraege.length && !liste.children.length) { this.sel = null; return; }
    document.body.append(liste);
    this.liste = liste;
    this.platzieren();
    this.markieren(Math.max(0, this.eintraege.findIndex(x => x.option.selected)), false, true);
  },

  /* Unter das Feld, oder darüber, wenn unten kein Platz ist */
  platzieren() {
    const r = this.sel.getBoundingClientRect(), l = this.liste;
    const rand = 8, unten = innerHeight - r.bottom - rand, oben = r.top - rand;
    l.style.minWidth = r.width + 'px';
    l.style.maxWidth = Math.max(r.width, Math.min(420, innerWidth - 2 * rand)) + 'px';
    const hoehe = Math.min(l.scrollHeight, 360);
    const nachOben = unten < Math.min(hoehe, 200) && oben > unten;
    l.style.maxHeight = Math.max(120, Math.min(360, nachOben ? oben : unten)) + 'px';
    const breite = l.offsetWidth;
    l.style.left = Math.max(rand, Math.min(r.left, innerWidth - breite - rand)) + 'px';
    if (nachOben) { l.style.top = ''; l.style.bottom = (innerHeight - r.top + 4) + 'px'; }
    else { l.style.bottom = ''; l.style.top = (r.bottom + 4) + 'px'; }
  },

  markieren(i, maus, mitte) {
    if (!this.eintraege.length) return;
    i = Math.max(0, Math.min(this.eintraege.length - 1, i));
    if (this.markiert >= 0 && this.eintraege[this.markiert]) this.eintraege[this.markiert].el.classList.remove('markiert');
    this.markiert = i;
    const el = this.eintraege[i].el;
    el.classList.add('markiert');
    if (!maus) {
      if (mitte) this.liste.scrollTop = el.offsetTop - this.liste.clientHeight / 2 + el.offsetHeight / 2;
      else el.scrollIntoView({ block: 'nearest' });
    }
  },

  waehlen(o) {
    const sel = this.sel;
    this.zu();
    if (!sel || o.selected) return;
    o.selected = true;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  },

  taste(e) {
    const sel = e.target;
    if (!this.liste) {
      // Geschlossen: nur die Tasten abfangen, die sonst die Systemliste öffnen
      if (sel.tagName !== 'SELECT' || !this.passt(sel)) return;
      if (e.key === ' ' || e.key === 'Enter' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) || e.key === 'F4') {
        e.preventDefault();
        this.auf(sel);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': this.markieren(this.markiert + 1); break;
      case 'ArrowUp': this.markieren(this.markiert - 1); break;
      case 'Home': this.markieren(0); break;
      case 'End': this.markieren(this.eintraege.length - 1); break;
      case 'PageDown': this.markieren(this.markiert + 8); break;
      case 'PageUp': this.markieren(this.markiert - 8); break;
      case 'Enter': case ' ': if (this.eintraege[this.markiert]) this.waehlen(this.eintraege[this.markiert].option); break;
      case 'Escape': this.zu(); break;
      case 'Tab': this.zu(); return;
      default: {
        // Anfangsbuchstaben springen zum passenden Eintrag
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey) return;
        const k = e.key.toLowerCase(), n = this.eintraege.length;
        for (let s = 1; s <= n; s++) {
          const i = (this.markiert + s) % n;
          if (this.eintraege[i].option.textContent.trim().toLowerCase().startsWith(k)) { this.markieren(i); break; }
        }
      }
    }
    e.preventDefault();
    e.stopPropagation();
  },

  zu() {
    if (this.liste) this.liste.remove();
    this.liste = null;
    this.sel = null;
    this.markiert = -1;
    this.eintraege = [];
  },
};
Auswahl.init();
