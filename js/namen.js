/* Kleines Fenster mit den Namen der Schulband, zum schnellen Kopieren.
   Liest dieselben Daten wie das Hauptfenster (derselbe Browser-Speicher)
   und sortiert ueber Band.byClass - damit steht hier dieselbe Reihenfolge
   wie in der Mitgliederliste: 5a, 5b, 6a ... 10d, ohne Klasse ans Ende. */
const Namen = {
  aus: new Set(),          // abgewaehlte Mitglieder, gemerkt an ihrer id

  alleMitglieder() {
    let daten = {};
    try { daten = JSON.parse(localStorage.getItem(Store.KEY)) || {}; } catch (e) { /* noch leer */ }
    const b = daten.band;
    return (b && Array.isArray(b.members)) ? b.members : [];
  },

  /* Die sichtbare Gruppe. „beide“ gehoert zu Band und zu Technik - wie in der Liste. */
  sichtbar() {
    const f = document.getElementById('n-filter').value;
    return this.alleMitglieder()
      .filter(m => f === 'alle' || m.area === f || m.area === 'beide')
      .sort((a, b) => Band.byClass(a, b));
  },

  gewaehlt() { return this.sichtbar().filter(m => !this.aus.has(m.id)); },

  zeichnen() {
    const liste = document.getElementById('n-liste');
    liste.innerHTML = '';
    const leute = this.sichtbar();
    if (!leute.length) {
      const li = document.createElement('li');
      li.className = 'leer';
      li.textContent = 'Keine Mitglieder in dieser Gruppe.';
      liste.appendChild(li);
      this.status();
      return;
    }
    for (const m of leute) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !this.aus.has(m.id);
      box.addEventListener('change', () => {
        if (box.checked) this.aus.delete(m.id); else this.aus.add(m.id);
        this.status();
      });
      const klasse = document.createElement('span');
      klasse.className = 'n-klasse';
      klasse.textContent = m.klasse || '–';
      const name = document.createElement('span');
      name.textContent = m.name;
      label.append(box, klasse, name);
      if (this.mitRolle()) {
        const rolle = document.createElement('span');
        rolle.className = 'n-rolle';
        rolle.textContent = this.rolle(m);
        label.appendChild(rolle);
      }
      li.appendChild(label);
      liste.appendChild(li);
    }
    this.status();
  },

  mitRolle() { return document.getElementById('n-rolle').checked; },

  /* Instrument bzw. Aufgabe; ohne Angabe wenigstens der Bereich */
  rolle(m) {
    return m.instrument || (m.area === 'technik' ? 'Technik' : m.area === 'beide' ? 'Band + Technik' : '');
  },

  /* Dasselbe Druckbild wie im Hauptfenster: Klasse, Name, auf Wunsch die Rolle */
  drucken() {
    const leute = this.gewaehlt();
    if (!leute.length) { this.kurz('Nichts ausgewählt.'); return; }
    const f = document.getElementById('n-filter').value;
    const titel = f === 'band' ? 'Schulband' : f === 'technik' ? 'Technikteam' : 'Schulband und Technikteam';
    const spalten = [{ titel: 'Klasse', cls: 'klasse' }, { titel: 'Name' }];
    if (this.mitRolle()) spalten.push({ titel: 'Rolle' });
    const zeilen = leute.map(m => {
      const z = [Band.esc(m.klasse) || '–', `<strong>${Band.esc(m.name)}</strong>`];
      if (this.mitRolle()) z.push(Band.esc(this.rolle(m)));
      return z;
    });
    Band.printHtml(titel, Band.printTable(spalten, zeilen), `${leute.length} Schüler`);
  },

  status(text) {
    document.getElementById('n-status').textContent =
      text || `${this.gewaehlt().length} von ${this.sichtbar().length} ausgewählt`;
  },

  /* Klasse und Name durch einen Tabulator getrennt: So landen sie beim
     Einfuegen in eine Tabelle gleich in zwei Spalten, im Text sauber untereinander. */
  zeilen(mitKlasse) {
    return this.gewaehlt()
      .map(m => (mitKlasse ? `${m.klasse || '–'}\t${m.name}` : m.name))
      .join('\n');
  },

  async kopieren(mitKlasse) {
    const text = this.zeilen(mitKlasse);
    if (!text) { this.kurz('Nichts ausgewählt.'); return; }
    const anzahl = this.gewaehlt().length;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      if (!this.kopierenAlt(text)) { this.kurz('Kopieren hat nicht geklappt.'); return; }
    }
    this.kurz(`${anzahl} ${anzahl === 1 ? 'Name' : 'Namen'} kopiert.`);
  },

  /* Rueckfalltuer fuer Browser, die die Zwischenablage nicht direkt freigeben */
  kopierenAlt(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  },

  kurz(text) {
    this.status(text);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.status(), 2500);
  },

  init() {
    document.getElementById('n-filter').addEventListener('change', () => this.zeichnen());
    document.getElementById('n-alle').addEventListener('click', () => {
      this.aus.clear();
      this.zeichnen();
    });
    document.getElementById('n-keine').addEventListener('click', () => {
      this.sichtbar().forEach(m => this.aus.add(m.id));
      this.zeichnen();
    });
    document.getElementById('n-copy').addEventListener('click', () => this.kopieren(true));
    document.getElementById('n-copy-namen').addEventListener('click', () => this.kopieren(false));
    document.getElementById('n-drucken').addEventListener('click', () => this.drucken());
    // Der Rollen-Schalter bleibt auf diesem Geraet gemerkt
    const rolle = document.getElementById('n-rolle');
    try { rolle.checked = localStorage.getItem('schooltool-namen-rolle') === '1'; } catch (e) { /* privates Fenster */ }
    rolle.addEventListener('change', () => {
      try { localStorage.setItem('schooltool-namen-rolle', rolle.checked ? '1' : '0'); } catch (e) { /* egal */ }
      this.zeichnen();
    });

    // Aendert das Hauptfenster die Mitglieder, zieht dieses Fenster von selbst nach
    window.addEventListener('storage', e => { if (e.key === Store.KEY) this.zeichnen(); });

    this.zeichnen();
  },
};

Namen.init();
