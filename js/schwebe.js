/* Metronom und Stimmgerät als Popup oder „immer im Vordergrund“.

   Die Karte selbst zieht ins kleine Fenster um – samt Knöpfen und allem, was
   daran hängt. Klang und Mikrofon bleiben beim Hauptfenster. Schließt man das
   Fenster, kommt die Karte an ihren Platz zurück. Solange sie weg ist, steht
   dort ein Platzhalter.

   Document Picture-in-Picture gibt es nur in Chrome/Edge; Safari bekommt
   stattdessen ein normales Popup. */
const Schwebe = {
  offen: {},      // karten-id → { win, platzhalter }

  init() {
    document.querySelectorAll('[data-schwebe]').forEach(b => {
      const karte = document.getElementById(b.dataset.schwebe);
      if (!karte) return;
      const pip = b.dataset.art === 'pip';
      b.addEventListener('click', () => this.oeffnen(karte, pip));
    });
  },

  /* Fenster der Karte – die Werkzeuge nehmen requestAnimationFrame von dort,
     denn das Hauptfenster liegt meist verdeckt und bekäme keine Bilder mehr. */
  fenster(el) { return el.ownerDocument.defaultView || window; },

  async oeffnen(karte, pip) {
    if (this.offen[karte.id]) { this.offen[karte.id].win.focus(); return; }
    const breite = Math.ceil(karte.offsetWidth) || 380;
    const hoehe = Math.ceil(karte.offsetHeight) + 8 || 320;
    let win;
    if (pip && 'documentPictureInPicture' in window) {
      try {
        win = await documentPictureInPicture.requestWindow({ width: breite, height: hoehe });
      } catch (e) {
        alert('Schwebendes Fenster konnte nicht geöffnet werden: ' + e.message);
        return;
      }
    } else {
      win = window.open('', 'schwebe-' + karte.id,
        `width=${breite},height=${hoehe},menubar=no,toolbar=no,location=no,status=no`);
      if (!win) { alert('Das Popup wurde vom Browser blockiert.'); return; }
      win.document.open();
      win.document.write('<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title></title></head><body></body></html>');
      win.document.close();
    }
    const doc = win.document;
    doc.title = karte.getAttribute('aria-label') || 'School-Tool';
    for (const sheet of document.styleSheets) {
      try {
        const style = doc.createElement('style');
        style.textContent = [...sheet.cssRules].map(r => r.cssText).join('\n');
        doc.head.appendChild(style);
      } catch (e) { /* fremde Sheets ignorieren */ }
    }
    Theme.apply(Theme.current(), doc);
    doc.body.className = 'schwebe-body';

    const platzhalter = document.createElement('section');
    platzhalter.className = 'card schwebe-platzhalter';
    platzhalter.innerHTML = `<p class="hint">${doc.title} ist im kleinen Fenster.</p>`;
    const zurueck = document.createElement('button');
    zurueck.className = 'small';
    zurueck.textContent = 'Zurückholen';
    zurueck.addEventListener('click', () => win.close());
    platzhalter.appendChild(zurueck);
    karte.replaceWith(platzhalter);
    doc.body.appendChild(doc.adoptNode(karte));
    this.offen[karte.id] = { win, platzhalter };
    karte.dispatchEvent(new Event('umgezogen'));

    win.addEventListener('pagehide', () => this.zurueck(karte));
  },

  zurueck(karte) {
    const o = this.offen[karte.id];
    if (!o) return;
    delete this.offen[karte.id];
    o.platzhalter.replaceWith(document.adoptNode(karte));
    karte.dispatchEvent(new Event('umgezogen'));
  },
};

document.addEventListener('DOMContentLoaded', () => Schwebe.init());
// Hauptfenster zu oder neu geladen: kleine Fenster mitschließen
window.addEventListener('pagehide', () => Object.values(Schwebe.offen).forEach(o => o.win.close()));
