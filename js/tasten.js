/* Pfeiltasten links/rechts: seitwärts blättern, wo es etwas zum Blättern gibt.
   ↑/↓ wechseln im Klassen-Reiter die Klasse – oder, bei gewähltem Schüler,
   den Schüler (classes.js). Esc wählt ab (schueler.js).

   - Reiter „Klassen“: voriger / nächster Unterreiter (Schüler … Notizen)
   - Reiter „Band“:    voriger / nächster Band-Unterreiter

   Nie, solange getippt wird, ein Rahmen beim Gesichterzuordnen bewegt wird
   oder etwas im Vollbild läuft – dort gehören die Pfeile jemand anderem. */
const Tasten = {
  init() {
    document.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (!this.frei(e)) return;
      const schritt = e.key === 'ArrowRight' ? 1 : -1;
      const reiter = document.querySelector('.tab-btn.active');
      if (!reiter) return;
      let erledigt = false;
      if (reiter.dataset.tab === 'klassen' && Classes.currentClassId) {
        erledigt = this.reiterWeiter('#class-detail .subtab-btn', schritt);
      } else if (reiter.dataset.tab === 'band') {
        erledigt = this.reiterWeiter('.bandtab-btn', schritt);
      }
      if (erledigt) e.preventDefault();
    });
  },

  /* Gemeinsame Bedingung für alle Pfeil-Abkürzungen ohne Eingabefeld */
  frei(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
    const ziel = e.target;
    if (ziel && ziel.closest && ziel.closest('input, textarea, select, [contenteditable="true"]')) return false;
    if (document.fullscreenElement) return false;
    if (typeof Sitzplan !== 'undefined' && Sitzplan.gesichter) return false;
    return true;
  },

  /* Klickt den Nachbarn des aktiven Knopfs – so läuft alles über den
     vorhandenen Klick-Weg. Am Rand wird nicht umgelaufen. */
  reiterWeiter(auswahl, schritt) {
    const knoepfe = [...document.querySelectorAll(auswahl)].filter(k => !k.hidden && k.offsetParent);
    const pos = knoepfe.findIndex(k => k.classList.contains('active'));
    const ziel = knoepfe[pos + schritt];
    if (pos < 0 || !ziel) return false;
    ziel.click();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    return true;
  },
};
