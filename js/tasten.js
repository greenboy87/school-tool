/* Pfeiltasten links/rechts blättern in zwei Ebenen:

   - oben (Start):  voriger / nächster Hauptreiter (Tools … Extras)
   - unten:         voriger / nächster Unterreiter des offenen Reiters
                    (Klassen mit gewählter Klasse, Band, Exen)

   ↓ springt von oben in die Unterreiter, Esc wieder hinauf. Ist bei Klassen
   noch keine Klasse offen, öffnet ↓ dabei gleich die erste der Liste. Ist unten etwas
   gewählt (Schüler, Bandmitglied, Song), wählt Esc zuerst das ab. Unten
   behalten ↑/↓ ihre Aufgabe: Klasse bzw. Schüler wechseln (classes.js),
   Mitglieder und Songs blättern (band.js). Oben gehören ↑/↓ niemandem, damit
   nicht versehentlich die Klasse springt.

   Ein Klick auf einen Hauptreiter setzt die Ebene nach oben, ein Klick auf
   einen Unterreiter nach unten. Solange per Tastatur geblättert wird, ist der
   aktive Knopf der aktuellen Ebene umrandet.

   K schlägt auf jedem Reiter die Klangschale an.

   Nie, solange getippt wird, ein Rahmen beim Gesichterzuordnen bewegt wird
   oder etwas im Vollbild läuft – dort gehören die Pfeile jemand anderem. */
const Tasten = {
  ebene: 'oben',

  init() {
    document.addEventListener('keydown', e => {
      if (e.key !== 'k' && e.key !== 'K') return;
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const ziel = e.target;
      if (ziel && ziel.closest && ziel.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (typeof Klangschale === 'undefined') return;
      e.preventDefault();
      Klangschale.anschlagen();
    });

    // Im Capture-Schritt am Fenster, damit oben ↑/↓ nicht erst bei
    // classes.js und band.js ankommen
    window.addEventListener('keydown', e => this.taste(e), true);

    document.addEventListener('click', e => {
      if (!e.target.closest) return;
      if (e.target.closest('.main-tabs .tab-btn')) this.setzen('oben', false);
      else if (e.target.closest('.subtab-btn, .bandtab-btn, .ex-reiter-btn')) this.setzen('unten', false);
    });
    // Mit Maus oder Finger unterwegs: Umrandung weg, Ebene bleibt
    document.addEventListener('pointerdown', () => this.markieren(false), true);
  },

  taste(e) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) return;
    // Wochenansicht im Plan: ←/→ blättern Wochen (Stundenplan entscheidet selbst)
    if (typeof Stundenplan !== 'undefined' && Stundenplan.pfeilTaste(e)) return;
    if (!this.frei(e)) return;
    const unter = this.unterreiter();
    if (!unter) this.ebene = 'oben';

    if (e.key === 'Escape') {
      if (this.ebene === 'unten' && !this.etwasGewaehlt()) this.setzen('oben', true);
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (this.ebene === 'unten') return;          // classes.js / band.js übernehmen
      // Klassen ohne gewählte Klasse: ↓ öffnet gleich die erste (meist 5a)
      if (e.key === 'ArrowDown' && !unter && this.ersteKlasseOeffnen()) {
        e.stopImmediatePropagation();
        e.preventDefault();
        this.setzen('unten', true);
        return;
      }
      if (!unter) return;                          // nichts darunter: Seite scrollt normal
      e.stopImmediatePropagation();
      if (e.key === 'ArrowDown') { e.preventDefault(); this.setzen('unten', true); }
      return;
    }

    const schritt = e.key === 'ArrowRight' ? 1 : -1;
    const erledigt = this.ebene === 'unten'
      ? this.reiterWeiter(unter, schritt)
      : this.reiterWeiter('.main-tabs .tab-btn', schritt);
    if (erledigt) {
      e.preventDefault();
      this.markieren(true);
    }
  },

  /* Auswahl der Unterreiter-Knöpfe des offenen Reiters, oder null */
  unterreiter() {
    const reiter = document.querySelector('.tab-btn.active');
    if (!reiter) return null;
    const auswahl = {
      klassen: Classes.currentClassId ? '#class-detail .subtab-btn' : null,
      band: '.bandtab-btn',
      exen: '.ex-reiter-btn',
    }[reiter.dataset.tab];
    if (!auswahl) return null;
    return [...document.querySelectorAll(auswahl)].some(k => !k.hidden && !k.disabled && k.offsetParent) ? auswahl : null;
  },

  /* Erste Klasse der Liste wählen – dieselbe Reihenfolge und derselbe
     Jahrgangsfilter wie beim Blättern mit ↑/↓ in classes.js */
  ersteKlasseOeffnen() {
    const reiter = document.querySelector('.tab-btn.active');
    if (!reiter || reiter.dataset.tab !== 'klassen' || Classes.currentClassId) return false;
    const erste = Classes.data.classes.find(c =>
      Classes.yearFilter === 'all' || (c.year || '') === Classes.yearFilter);
    if (!erste) return false;
    Classes.selectClass(erste.id);
    return true;
  },

  /* Hat Esc unten noch etwas anderes abzuwählen? Dann bleibt die Ebene. */
  etwasGewaehlt() {
    const reiter = document.querySelector('.tab-btn.active').dataset.tab;
    if (reiter === 'klassen') return typeof Schueler !== 'undefined' && !!Schueler.aktuell;
    if (reiter === 'band' && typeof Band !== 'undefined') {
      const sichtbar = id => {
        const seite = document.getElementById(id);
        return seite && seite.classList.contains('active') && seite.offsetParent;
      };
      return !!((Band.aktivesMitglied && sichtbar('bandtab-mitglieder')) ||
                (Band.songAktiv.song && sichtbar('bandtab-songs')) ||
                (Band.songAktiv.idea && sichtbar('bandtab-ideen')));
    }
    return false;
  },

  setzen(ebene, zeigen) {
    this.ebene = ebene;
    this.markieren(zeigen);
  },

  markieren(an) {
    const html = document.documentElement;
    html.classList.toggle('tasten-oben', an && this.ebene === 'oben');
    html.classList.toggle('tasten-unten', an && this.ebene === 'unten');
  },

  /* Gemeinsame Bedingung für alle Pfeil-Abkürzungen ohne Eingabefeld */
  frei(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
    const ziel = e.target;
    if (ziel && ziel.closest && ziel.closest('input, textarea, select, [contenteditable="true"]')) return false;
    // Die ganze Seite im Vollbild: Tasten wie gewohnt. Ein einzelnes Element im
    // Vollbild (Sitzplan, Stoppuhr …) behält die Pfeile für sich.
    if (document.fullscreenElement && document.fullscreenElement !== document.documentElement) return false;
    if (typeof Sitzplan !== 'undefined' && Sitzplan.gesichter) return false;
    if (document.documentElement.classList.contains('locked')) return false;
    return true;
  },

  /* Klickt den Nachbarn des aktiven Knopfs – so läuft alles über den
     vorhandenen Klick-Weg. Am Rand wird nicht umgelaufen. */
  reiterWeiter(auswahl, schritt) {
    const knoepfe = [...document.querySelectorAll(auswahl)].filter(k => !k.hidden && !k.disabled && k.offsetParent);
    const pos = knoepfe.findIndex(k => k.classList.contains('active'));
    const ziel = knoepfe[pos + schritt];
    if (pos < 0 || !ziel) return false;
    ziel.click();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    return true;
  },
};
