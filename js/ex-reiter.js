/* Reiter im Bereich Exen: Ex schreiben · Ex korrigieren · Ex-Bibliothek ·
   Lehreranmeldung. Darüber steht die Klasse – sie gilt für „Ex schreiben“
   (wer schreibt mit) und „Ex korrigieren“ (welche Exen stehen in der Liste).
   Ohne Lehrer-Anmeldung ist nur der Reiter Lehreranmeldung erreichbar. */
const ExReiter = {
  REITER_KEY: 'schooltool-ex-reiter',
  KLASSE_KEY: 'schooltool-ex-klasse',
  WEG: '__weg',            // Auswertungen, deren Klasse es nicht mehr gibt
  lehrer: false,

  init() {
    if (!document.getElementById('ex-reiter')) return;
    document.getElementById('ex-reiter').addEventListener('click', e => {
      const b = e.target.closest('[data-exreiter]');
      if (b && !b.disabled) this.zeigen(b.dataset.exreiter);
    });
    document.getElementById('ex-klasse').addEventListener('change', e => this.klasseSetzen(e.target.value));
    document.addEventListener('ex-anmeldung', e => {
      this.lehrer = e.detail.lehrer;
      this.klassenFuellen();
      this.zeigen(this.lehrer ? (this.gemerkt() || 'schreiben') : 'anmeldung', null, true);
    });
    document.addEventListener('ex-sitzungen', () => this.klassenFuellen());
    this.zeigen('anmeldung', null, true);
  },

  gemerkt() {
    try { return localStorage.getItem(this.REITER_KEY); } catch (e) { return null; }
  },

  /* Reiter wechseln, optional gleich mit Klasse (etwa „Zur Auswertung“) */
  zeigen(name, klasseId, ohneMerken) {
    if (!this.lehrer) name = 'anmeldung';
    document.querySelectorAll('.ex-reiter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.exreiter === name);
      b.disabled = !this.lehrer && b.dataset.exreiter !== 'anmeldung';
    });
    document.querySelectorAll('.ex-reiter-seite').forEach(s => { s.hidden = s.dataset.seite !== name; });
    // Die Klasse zählt nur beim Schreiben und Korrigieren
    document.getElementById('ex-klasse-wahl').hidden = !this.lehrer || !['schreiben', 'korrigieren'].includes(name);
    if (klasseId) this.klasseSetzen(klasseId);
    if (!ohneMerken && this.lehrer) {
      try { localStorage.setItem(this.REITER_KEY, name); } catch (e) { /* egal */ }
    }
  },

  klasseId() { return document.getElementById('ex-klasse').value; },

  klassenFuellen() {
    const sel = document.getElementById('ex-klasse');
    let alt = sel.value;
    if (!alt) { try { alt = localStorage.getItem(this.KLASSE_KEY); } catch (e) { /* egal */ } }
    alt = alt || Classes.currentClassId;
    const gruppen = typeof ExAuswertung !== 'undefined' ? ExAuswertung.gruppen() : [];
    const mitEx = new Set(gruppen.map(g => g.klasseId));
    const klassen = Classes.data.classes.filter(c => c.students.length || mitEx.has(c.id))
      .sort((a, b) => (b.year || '').localeCompare(a.year || '') || a.name.localeCompare(b.name, 'de', { numeric: true }));
    const jahre = new Set(klassen.map(c => c.year));
    const esc = s => Band.esc(s);
    let html = klassen.map(c => `<option value="${esc(c.id)}">${esc(c.name + (jahre.size > 1 && c.year ? ` (${c.year})` : ''))}</option>`).join('');
    if (gruppen.some(g => !Classes.data.classes.some(c => c.id === g.klasseId))) {
      html += `<option value="${this.WEG}">Gelöschte Klassen</option>`;
    }
    sel.innerHTML = html;
    if ([...sel.options].some(o => o.value === alt)) sel.value = alt;
    this.klasseSetzen(sel.value, true);
  },

  klasseSetzen(id, stumm) {
    const sel = document.getElementById('ex-klasse');
    if (sel.value !== id && [...sel.options].some(o => o.value === id)) sel.value = id;
    try { localStorage.setItem(this.KLASSE_KEY, sel.value); } catch (e) { /* egal */ }
    // Ex schreiben: die Auswahl im Startformular folgt (außer beim Nachschreiben, da steht sie fest)
    const start = document.getElementById('ex-start-klasse');
    if (start && !start.disabled && start.value !== sel.value && [...start.options].some(o => o.value === sel.value)) {
      start.value = sel.value;
      start.dispatchEvent(new Event('change'));
    }
    if (typeof ExAuswertung !== 'undefined') ExAuswertung.klasseGewechselt();
    if (!stumm) document.getElementById('ex-klasse').blur();
  },

  /* Grüner Punkt am Reiter „Ex schreiben“, solange eine Sitzung offen ist */
  laeuft(an) { document.getElementById('ex-laeuft-punkt').hidden = !an; },
};
