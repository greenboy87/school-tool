/* Reiter im Bereich Exen: Schreiben · Korrigieren · Bibliothek. Daneben die
   Klasse – sie gilt fürs Schreiben (wer schreibt mit) und Korrigieren (welche
   Exen stehen in der Liste). Ohne Lehrer-Anmeldung steht nur die Anmeldung da;
   mit Anmeldung wandert sie ans Ende der Bibliothek (Abmelden).
   Bei „Schreiben“ zeigt eine schmale Spalte die neuesten Exen zum Antippen. */
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
    document.getElementById('btn-ex-ganze-bibliothek').addEventListener('click', () => this.zeigen('bibliothek'));
    document.getElementById('ex-schnellwahl-liste').addEventListener('click', e => {
      const b = e.target.closest('[data-ex-id]');
      if (b) this.exWaehlen(b.dataset.exId);
    });
    document.getElementById('ex-start-ex').addEventListener('change', () => this.schnellwahlZeichnen());
    document.addEventListener('ex-index', () => {
      // Gerade importiert: gleich zum Schreiben auswählen
      if (this.neuId && Exen.index[this.neuId]) { const id = this.neuId; this.neuId = null; this.exWaehlen(id); }
      this.schnellwahlZeichnen();
    });
    document.addEventListener('ex-importiert', e => {
      this.neuId = e.detail.id;
      if (Exen.index[this.neuId]) { this.neuId = null; this.exWaehlen(e.detail.id); }
    });
    document.addEventListener('ex-anmeldung', e => {
      this.lehrer = e.detail.lehrer;
      // Die Anmeldung steht allein da, solange niemand angemeldet ist
      const karte = document.querySelector('.ex-anmeldung');
      document.querySelector(`.ex-reiter-seite[data-seite="${this.lehrer ? 'bibliothek' : 'anmeldung'}"]`).append(karte);
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
    if (gruppen.some(g => g.klasseId !== ExSitzung.TESTRAUM && !Classes.data.classes.some(c => c.id === g.klasseId))) {
      html += `<option value="${this.WEG}">Gelöschte Klassen</option>`;
    }
    // Testraum ganz oben, damit man ihn bei vielen Klassen nicht suchen muss
    sel.innerHTML = `<option value="${ExSitzung.TESTRAUM}">🧪 Testraum</option>` + `<optgroup label="Klassen">${html}</optgroup>`;
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

  /* Ex in „Ex starten“ auswählen (beim Nachschreiben steht sie fest) */
  exWaehlen(id) {
    const sel = document.getElementById('ex-start-ex');
    if (sel.disabled || ![...sel.options].some(o => o.value === id)) { this.schnellwahlZeichnen(); return; }
    if (sel.value !== id) {
      sel.value = id;
      sel.dispatchEvent(new Event('change'));
    }
    this.schnellwahlZeichnen();
  },

  SCHNELL_ANZAHL: 8,

  schnellwahlZeichnen() {
    const ul = document.getElementById('ex-schnellwahl-liste');
    if (!ul || typeof Exen === 'undefined') return;
    const esc = s => Band.esc(s);
    const ids = Object.keys(Exen.index).sort((a, b) => (Exen.index[b].importiert || 0) - (Exen.index[a].importiert || 0));
    const gewaehlt = document.getElementById('ex-start-ex').value;
    const fest = document.getElementById('ex-start-ex').disabled;
    const gezeigt = ids.slice(0, this.SCHNELL_ANZAHL);
    // Die gewählte Ex immer mit anzeigen, auch wenn sie älter ist
    if (gewaehlt && ids.includes(gewaehlt) && !gezeigt.includes(gewaehlt)) gezeigt.push(gewaehlt);
    ul.innerHTML = gezeigt.map(id => {
      const x = Exen.index[id];
      const datum = x.importiert ? new Date(x.importiert).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '';
      return `<li><button class="ex-schnell-eintrag${id === gewaehlt ? ' active' : ''}" data-ex-id="${esc(id)}"${fest ? ' disabled' : ''}>
        <strong>${esc(x.titel)}</strong>
        <span class="hint">${[x.art, x.punkteGesamt ? x.punkteGesamt + ' P' : '', datum ? 'hinzugefügt ' + datum : ''].filter(Boolean).map(esc).join(' · ')}</span>
      </button></li>`;
    }).join('');
    document.getElementById('ex-schnellwahl-leer').hidden = ids.length > 0;
    const ganz = document.getElementById('btn-ex-ganze-bibliothek');
    ganz.textContent = ids.length > gezeigt.length ? `Ganze Bibliothek (${ids.length})` : 'Ganze Bibliothek';
  },

  /* Grüner Punkt am Reiter „Ex schreiben“, solange eine Sitzung offen ist */
  laeuft(an) { document.getElementById('ex-laeuft-punkt').hidden = !an; },
};
