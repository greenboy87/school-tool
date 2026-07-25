/* Einheitlicher Icon-Satz: schlanke Strich-Symbole (24×24), die die Textfarbe
   übernehmen. Statt Emojis – dadurch ruhigeres, einheitliches Erscheinungsbild.

   Verwendung im HTML:  <button data-icon="mic">Start</button>
   Verwendung im JS:    el.innerHTML = Icons.raw('target') + name;          */
const Icons = {
  set: {
    school:    '<path d="M3 21h18M5 21V9l7-5 7 5v12M10 21v-5h4v5"/>',
    traffic:   '<rect x="7" y="2" width="10" height="20" rx="5"/><circle cx="12" cy="7" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="17" r="1.3"/>',
    book:      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    sparkles:  '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    download:  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 8 5-5 5 5"/><path d="M12 3v12"/>',
    sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:      '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    lock:      '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    mic:       '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
    stop:      '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    play:      '<path d="M6 3.5 20 12 6 20.5z"/>',
    window:    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    pip:       '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="12" y="12" width="7" height="6" rx="1"/>',
    users:     '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
    shuffle:   '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/>',
    grid:      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    file:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    printer:   '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    check:     '<path d="M20 6 9 17l-5-5"/>',
    userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
    timer:     '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/>',
    target:    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    volume:    '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5.5a10 10 0 0 1 0 13"/>',
    reset:     '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    alert:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
    plus:      '<path d="M12 5v14M5 12h14"/>',
    list:      '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    chevronUp:   '<path d="m6 15 6-6 6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    x:         '<path d="M18 6 6 18M6 6l12 12"/>',
  },

  /* Fertiges SVG-Markup – funktioniert auch in Popup- und schwebenden Fenstern */
  raw(name, extraClass = '') {
    const paths = this.set[name];
    if (!paths) return '';
    return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  },

  /* Alle Elemente mit data-icon im Dokument bestücken */
  hydrate(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
      if (el.querySelector(':scope > svg.icon')) return;
      el.insertAdjacentHTML('afterbegin', this.raw(el.dataset.icon));
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Icons.hydrate());
