/* Erklärtexte einklappen.

   Die Seite erklärt an vielen Stellen, wie etwas funktioniert. Das hilft beim
   ersten Mal und stört danach. Deshalb wandern diese Absätze beim Laden hinter
   ein kleines Dreieck, das sich bei Bedarf aufklappen lässt.

   Bewusst NICHT eingeklappt werden Absätze, die etwas anzeigen oder bedienen
   lassen – erkennbar daran, dass sie ein Element mit id oder ein Bedienelement
   enthalten (Lärmpegel, Raum-Code, Alarm-Einstellung, Statuszeilen). */
const Erklaerungen = {
  LABEL: 'Erklärung',

  init() {
    for (const p of this.finden()) this.einklappen(p);
  },

  finden() {
    return [...document.querySelectorAll('p.hint, footer.hint')].filter(p =>
      !p.id &&                      // Statuszeilen werden zur Laufzeit gefüllt
      !p.querySelector('[id]') &&   // enthält eine Anzeige wie den Raum-Code
      !p.querySelector('button, input, select, textarea') &&
      !p.closest('details') &&      // steckt schon hinter einem Aufklapper
      !p.closest('.print-area') &&
      p.textContent.trim().length > 40);
  },

  einklappen(p) {
    const box = document.createElement('details');
    box.className = 'erklaerung';
    const kopf = document.createElement('summary');
    // Das Dreieck kommt aus dem Stylesheet – sichtbarer Text würde nur stören,
    // der Name bleibt für Vorlesehilfen und den Mauszeiger erhalten.
    kopf.setAttribute('aria-label', this.LABEL);
    kopf.title = this.LABEL;
    p.replaceWith(box);
    box.append(kopf, p);
  },
};

window.Erklaerungen = Erklaerungen;
