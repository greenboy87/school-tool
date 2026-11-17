/* Reiter „Trainer“: Übersicht über den music-trainer für mehrere Klassen.

   Oben der Link zum music-trainer, darunter für die gewählten Klassen (und eigenen Gruppen):
   wer an einem Tag dabei war und wie lange geübt hat, ein Vergleich der Klassen und die
   Statistik aller gewählten Klassen zusammen. Gerechnet wird mit denselben Funktionen wie im
   Unterreiter music-trainer einer Klasse (Musiktrainer.statRechnen, statKlasse, sitzungen).

   Daten kommen vom Cloudflare-Worker (nicht Firebase), je Klasse einmal beim ersten Öffnen,
   danach erst wieder über „Aktualisieren“. Namen setzt nur das school-tool ein. */
const TrainerUebersicht = {
  WAHL_KEY: 'schooltool-trainer-klassen',
  OPT_KEY: 'schooltool-trainer-optionen',
  daten: {},          // Server-ID → Antwort des Workers (Verlauf eines Jahres)
  fehlt: new Set(),   // Server-IDs, die es auf dem Server nicht mehr gibt
  laedt: false,
  tag: null,          // gewählter Tag für „Wer war dabei?“ (Tagnummer wie im Worker)

  init() {
    this.el = document.getElementById('trainer-uebersicht');
    if (!this.el) return;
    let o = {};
    try { o = JSON.parse(localStorage.getItem(this.OPT_KEY) || '{}'); } catch { /* egal */ }
    this.opt = { zeitraum: o.zeitraum || '28', mass: o.mass || 'min', basis: o.basis || 'jeKind',
      spiel: MT_SPIELE.some(sp => sp.id === o.spiel) ? o.spiel : '', stufe: o.spiel && o.stufe !== undefined ? String(o.stufe) : '',
      tageszeit: ['vormittag', 'nachmittag', 'alles'].includes(o.tageszeit) ? o.tageszeit : 'nachmittag' };
    // Sortierung der Tageszeit-Tabelle: Spalte und Richtung (nur für diese Sitzung)
    this.sortierung = { spalte: 'sek', auf: false };
    document.querySelector('.tab-btn[data-tab="trainer"]')?.addEventListener('click', () => this.oeffnen());
    this.el.addEventListener('click', e => this.klick(e));
    this.el.addEventListener('change', e => this.aenderung(e));
  },

  esc(s) { return Musiktrainer.esc(s); },
  heute() { return Musiktrainer.statTag(Date.now() / 1000); },

  /* Klassen ohne music-trainer-Zugänge: nur grau angezeigt, ein Klick führt zum Einrichten */
  ohneZugang() {
    return Classes.data.classes.filter(c => !c.musiktrainer?.id)
      .map(c => ({ key: 'o' + c.id, name: c.name, jahr: c.year || '', cls: c, ohne: true }));
  },

  /* Alle Klassen und eigenen Gruppen mit music-trainer-Zugang: { key, name, jahr, cls|gruppe } */
  quellen() {
    const klassen = Classes.data.classes.filter(c => c.musiktrainer?.id)
      .map(c => ({ key: 'k' + c.id, id: c.musiktrainer.id, name: c.name, jahr: c.year || '', cls: c }))
      .sort((a, b) => (b.jahr || '').localeCompare(a.jahr || '') || a.name.localeCompare(b.name, 'de', { numeric: true }));
    const gruppen = Musiktrainer.gruppen().filter(g => g.id && g.kinder.length)
      .map(g => ({ key: 'g' + g.id, id: g.id, name: g.name, jahr: '', gruppe: g }));
    return [...klassen, ...gruppen];
  },

  /* Gemerkte Auswahl; ohne: alle Klassen des aktuellen Schuljahres */
  gewaehlt(quellen) {
    let wahl = null;
    try { wahl = JSON.parse(localStorage.getItem(this.WAHL_KEY) || 'null'); } catch { /* egal */ }
    if (!Array.isArray(wahl)) {
      const jahr = Classes.currentSchoolYear?.();
      wahl = quellen.filter(q => q.cls && (!jahr || q.jahr === jahr)).map(q => q.key);
      if (!wahl.length) wahl = quellen.filter(q => q.cls).map(q => q.key);
    }
    const da = new Set(quellen.map(q => q.key));
    return new Set(wahl.filter(k => da.has(k)));
  },
  wahlSpeichern(set) {
    try { localStorage.setItem(this.WAHL_KEY, JSON.stringify([...set])); } catch { /* egal */ }
  },
  optSpeichern() {
    try { localStorage.setItem(this.OPT_KEY, JSON.stringify(this.opt)); } catch { /* egal */ }
  },

  oeffnen() {
    this.render();
    this.laden();
  },

  /* Fehlende Klassen nacheinander holen (je Klasse wenige Kilobyte) */
  async laden(neu = false) {
    // Lädt schon etwas: nur neu zeichnen; was inzwischen dazugewählt wurde, holt die Schleife unten mit
    if (this.laedt) { if (neu) this.nochmal = true; return this.render(); }
    if (neu) { this.daten = {}; this.fehlt.clear(); }
    const quellen = this.quellen();
    const wahl = this.gewaehlt(quellen);
    const offen = quellen.filter(q => wahl.has(q.key) && !this.daten[q.id] && !this.fehlt.has(q.id));
    if (!offen.length) return this.render();
    if (!Musiktrainer.token()) return this.anmelden();
    this.laedt = true;
    this.render();
    const seit = Math.floor(Date.now() / 1000) - 366 * 86400;
    try {
      for (const q of offen) {
        try {
          // Was der Klassenreiter schon geholt hat, nicht noch einmal holen
          const schon = Musiktrainer.ergebnis?.klasseId === q.id ? Musiktrainer.ergebnis.daten : Musiktrainer.statCache[q.id];
          this.daten[q.id] = schon || await Musiktrainer.api(`/api/lehrer/klassen/${q.id}?seit=${seit}`);
        } catch (err) {
          if (err.status === 404) { this.fehlt.add(q.id); continue; }
          throw err;
        }
      }
    } catch (err) {
      this.laedt = false;
      if (err.status === 401) return this.anmelden();
      this.render();
      const z = this.el.querySelector('.tr-meldung');
      if (z) z.textContent = err.status ? err.message : 'Keine Verbindung zum music-trainer-Server.';
      return;
    }
    this.laedt = false;
    // Während des Ladens dazugewählte Klassen (etwa mit „Alle“) jetzt auch holen
    const nochmal = this.nochmal; this.nochmal = false;
    this.laden(nochmal);
  },

  anmelden() {
    this.render();
    const ziel = this.el.querySelector('#tr-login');
    if (ziel) Musiktrainer.anmeldeFormular(ziel, () => this.laden());
  },

  /* ---------- Zeichnen ---------- */
  render() {
    if (!this.el) return;
    const quellen = this.quellen();
    const wahl = this.gewaehlt(quellen);
    const gewaehlt = quellen.filter(q => wahl.has(q.key));
    const geladen = gewaehlt.filter(q => this.daten[q.id]);
    const ohne = this.ohneZugang();
    const verloren = Musiktrainer.verloren();
    const jahre = [...new Set([...quellen, ...ohne].filter(q => q.cls).map(q => q.jahr))]
      .sort((a, b) => (b || '').localeCompare(a || ''));
    const chip = q => q.ohne
      ? (verloren.has(q.cls.id)
        ? `<button type="button" class="tr-chip ohne verloren" data-tr="einrichten" data-klasse="${this.esc(q.cls.id)}"
          title="War schon eingerichtet, die Zuordnung fehlt hier – klicken und „Zugänge aus früherem Stand zurückholen“">⚠ ${this.esc(q.name)}</button>`
        : `<button type="button" class="tr-chip ohne" data-tr="einrichten" data-klasse="${this.esc(q.cls.id)}"
          title="Noch keine music-trainer-Zugänge – klicken, um sie unter Klassen → ${this.esc(q.name)} → music-trainer einzurichten">${this.esc(q.name)}</button>`)
      : `<label class="tr-chip${wahl.has(q.key) ? ' an' : ''}${this.fehlt.has(q.id) ? ' weg' : ''}"
        title="${this.fehlt.has(q.id) ? 'Gibt es auf dem Server nicht mehr' : this.esc(q.gruppe ? 'Eigene Gruppe' : q.jahr)}">
        <input type="checkbox" data-tr-klasse="${this.esc(q.key)}" ${wahl.has(q.key) ? 'checked' : ''}>${this.esc(q.name)}</label>`;
    const nachName = (a, b) => a.name.localeCompare(b.name, 'de', { numeric: true });
    const auswahl = (quellen.length || ohne.length) ? `
      ${jahre.map(j => `<div class="tr-chips">${jahre.length > 1 ? `<span class="tr-jahr">${this.esc(j || 'ohne Schuljahr')}</span>` : ''}
        ${[...quellen.filter(q => q.cls && q.jahr === j), ...ohne.filter(q => q.jahr === j)].sort(nachName).map(chip).join('')}</div>`).join('')}
      ${verloren.size ? `<p class="mt-warnung"><b>⚠ Zuordnung verloren:</b> ${[...verloren.keys()].map(id => this.esc(Classes.data.classes.find(c => c.id === id)?.name || '')).join(', ')}
        war schon eingerichtet. Die Zugänge der Kinder gibt es noch – Klick auf die Klasse, dann „Zugänge aus früherem Stand zurückholen“. Nicht neu einrichten.</p>` : ''}
      ${ohne.length > verloren.size ? '<p class="hint tr-ohne-hinweis">Grau: noch keine Zugänge – ein Klick führt zum Einrichten.</p>' : ''}
      ${quellen.some(q => q.gruppe) ? `<div class="tr-chips"><span class="tr-jahr">Eigene Gruppen</span>${quellen.filter(q => q.gruppe).map(chip).join('')}</div>` : ''}
      <div class="btn-row tr-wahl-knoepfe">
        <button class="small" data-tr="alle">Alle</button>
        ${jahre.length > 1 ? jahre.map(j => `<button class="small" data-tr="jahr" data-jahr="${this.esc(j)}">Nur ${this.esc(j || 'ohne Schuljahr')}</button>`).join('') : ''}
        <button class="small" data-tr="keine">Keine</button>
        <button class="small" data-tr="laden" data-icon="reset" title="Ergebnisse neu vom Server holen">Aktualisieren</button>
        <span class="hint tr-meldung">${this.laedt ? 'Lade Ergebnisse …' : ''}</span>
      </div>`
      : `<p class="hint">Noch keine Klasse mit dem music-trainer verbunden. Das geht unter Klassen → eine Klasse → music-trainer.</p>`;

    this.el.innerHTML = `
      <section class="card tr-start">
        <div>
          <h2 data-icon="music">music-trainer</h2>
          <p class="hint">Für die Kinder: <a href="${Musiktrainer.SPIEL_URL}" target="_blank" rel="noopener">${Musiktrainer.SPIEL_URL.replace(/^https:\/\//, '').replace(/\/$/, '')}</a>
            · Kurzlink zum Abschreiben <code>${Musiktrainer.KURZ_URL}</code></p>
        </div>
        <a class="primary tr-oeffnen" href="${Musiktrainer.SPIEL_URL}" target="_blank" rel="noopener" data-icon="music">music-trainer öffnen</a>
      </section>
      <section class="card tr-auswahl">
        <h3 data-icon="users">Klassen</h3>
        ${auswahl}
        ${quellen.length ? this.uebungHtml() : ''}
        <div id="tr-login"></div>
      </section>
      ${gewaehlt.length && geladen.length ? this.inhalt(geladen) : (gewaehlt.length || !quellen.length ? '' : '<p class="hint tr-leer">Wähle oben eine oder mehrere Klassen.</p>')}`;
    Icons.hydrate(this.el);
    geladen.forEach(q => q.cls && Musiktrainer.gesichterEinsetzen(q.cls, this.el));
  },

  /* ---------- Übung auswählen ---------- */
  spiel() { return MT_SPIELE.find(sp => sp.id === this.opt.spiel) || null; },
  reihe(sp) { return sp.reihe || sp.stufen.map((_, i) => i); },

  uebungHtml() {
    const sp = this.spiel();
    const bereiche = [...new Set(MT_SPIELE.map(x => x.bereich))];
    return `<div class="inline-form tr-uebung">
      <label>Übung <select data-tr-spiel>
        <option value="">Alle Übungen</option>
        ${bereiche.map(b => `<optgroup label="${this.esc(b)}">${MT_SPIELE.filter(x => x.bereich === b)
          .map(x => `<option value="${x.id}" ${x.id === this.opt.spiel ? 'selected' : ''}>${this.esc(x.titel)}</option>`).join('')}</optgroup>`).join('')}
      </select></label>
      ${sp ? `<label>Stufe <select data-tr-stufe>
        <option value="">Alle Stufen</option>
        ${this.reihe(sp).map(i => `<option value="${i}" ${String(i) === this.opt.stufe ? 'selected' : ''}>${this.esc(sp.stufen[i])}</option>`).join('')}
      </select></label>
      <button class="small" data-tr="uebung-weg" data-icon="x">Alle Übungen</button>` : ''}
    </div>`;
  },

  /* Daten einer Klasse, auf die gewählte Übung (und Stufe) beschränkt. Anmeldungen gehören zu
     keiner Übung – mit Übung zählt nur, wer sie gespielt hat. */
  d(q) {
    const d = this.daten[q.id];
    if (!this.opt.spiel) return d;
    const stufe = this.opt.stufe === '' ? null : +this.opt.stufe;
    return { ...d, besuche: [], verlauf: d.verlauf.filter(v => v.spiel === this.opt.spiel && (stufe === null || v.stufe === stufe)) };
  },
  uebungName() {
    const sp = this.spiel();
    if (!sp) return '';
    return `${sp.bereich}: ${sp.titel}` + (this.opt.stufe === '' ? '' : ` – ${sp.stufen[+this.opt.stufe]}`);
  },

  /* Pseudonym-ID → { name, klasse, s, cls } aus den Klassendaten (nur lokal) */
  namen(quellen) {
    const m = {};
    quellen.forEach(q => {
      if (q.cls) q.cls.students.forEach(s => { if (s.mt) m[s.mt.id] = { name: Musiktrainer.nachname(s), klasse: q.name, s, cls: q.cls }; });
      else q.gruppe.kinder.forEach(k => { m[k.id] = { name: k.name, klasse: q.name }; });
    });
    return m;
  },

  inhalt(quellen) {
    const knopf = (art, wert, text) => `<button type="button" class="small${this.opt[art] === wert ? ' primary' : ''}" data-tr-opt="${art}" data-wert="${wert}">${text}</button>`;
    const filter = `
      <div class="st-filter">
        <span>${knopf('zeitraum', '7', '7 Tage')}${knopf('zeitraum', '28', '4 Wochen')}${knopf('zeitraum', '90', '3 Monate')}${knopf('zeitraum', '0', 'Gesamt')}</span>
        <span>${knopf('mass', 'min', 'Minuten')}${knopf('mass', 'runden', 'Runden')}</span>
      </div>`;
    const mehrere = quellen.length > 1;
    // Zusammengelegt für die gemeinsame Statistik; die Schüler-IDs sind auf dem Server eindeutig
    const zusammen = {
      schueler: quellen.flatMap(q => this.d(q).schueler),
      verlauf: quellen.flatMap(q => this.d(q).verlauf).sort((a, b) => a.zeit - b.zeit),
      besuche: quellen.flatMap(q => this.d(q).besuche || []),
    };
    const titel = (mehrere ? `${quellen.length} Klassen zusammen` : quellen[0].name) + (this.opt.spiel ? ` · ${this.uebungName()}` : '');
    // Gesperrte Zugänge aller gewählten Klassen (ungefiltert, auch wenn eine Übung gewählt ist)
    const namen = this.namen(quellen);
    const klasseVon = {};
    const alleKinder = quellen.flatMap(q => (this.daten[q.id]?.schueler || []).map(k => { klasseVon[k.id] = q.name; return k; }));
    const sperren = Musiktrainer.sperrenHinweis(alleKinder, id => namen[id]?.name, k => (mehrere ? ` <span class="hint">${this.esc(klasseVon[k.id])}</span>` : ''));
    return `
      ${sperren ? `<section class="card">${sperren}</section>` : ''}
      ${this.opt.spiel ? this.leistungHtml(quellen) : ''}
      ${this.nachmittagHtml(quellen, filter)}
      ${this.tagHtml(quellen)}
      ${mehrere ? `<section class="card">
        <div class="projekt-header"><h3 data-icon="gauge">Klassen vergleichen${this.opt.spiel ? `: ${this.esc(this.uebungName())}` : ''}</h3></div>
        ${filter}
        ${this.vergleichHtml(quellen)}
      </section>` : ''}
      <section class="card">
        <div class="projekt-header"><h3 data-icon="gauge">Statistik: ${this.esc(titel)}</h3></div>
        ${mehrere ? '' : filter}
        <p class="hint">${this.opt.zeitraum === '0' ? 'Alles, was der Server hat (bis 365 Tage)' : `Letzte ${this.opt.zeitraum} Tage`}. Minuten werden seit 01.11.2026 gezählt.</p>
        ${Musiktrainer.statKlasse(zusammen, this.opt)}
      </section>`;
  },

  /* ---------- Wer war an einem Tag dabei? ---------- */
  tagHtml(quellen) {
    const heute = this.heute();
    const tag = this.tag ?? heute;
    const wt = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const tagName = t => (t === heute ? 'Heute' : t === heute - 1 ? 'Gestern'
      : `${wt[(new Date(t * 86400000).getUTCDay() + 6) % 7]} ${Musiktrainer.statDatum(t)}`);
    const namen = this.namen(quellen);
    const kinder = {};
    const kind = (id, q) => (kinder[id] ||= { id, q, runden: [], besuch: false });
    let gesamt = 0;
    quellen.forEach(q => {
      const d = this.d(q);
      gesamt += d.schueler.length;
      d.verlauf.forEach(v => { if (Musiktrainer.statTag(v.zeit) === tag) kind(v.schueler_id, q).runden.push(v); });
      (d.besuche || []).forEach(b => { if (b.tag === tag) kind(b.schueler_id, q).besuch = true; });
    });
    const zeilen = Object.values(kinder).map(k => {
      const r = k.runden.sort((a, b) => a.zeit - b.zeit);
      const sek = r.reduce((s, v) => s + (v.dauer || 0), 0);
      const spiele = {};
      r.forEach(v => { spiele[v.spiel] = (spiele[v.spiel] || 0) + 1; });
      return {
        ...k, sek, n: r.length,
        von: r.length ? r[0].zeit - (r[0].dauer || 0) : null,
        bis: r.length ? r[r.length - 1].zeit : null,
        zuhause: r.filter(v => !Musiktrainer.schulzeit(v.zeit)).reduce((s, v) => s + (v.dauer || 0), 0),
        mal: Musiktrainer.sitzungen(r).length,
        spiele: Object.entries(spiele).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
          const sp = MT_SPIELE.find(g => g.id === id);
          return `${sp ? sp.titel : id}${n > 1 ? ` (${n})` : ''}`;
        }),
        info: namen[k.id],
      };
    }).sort((a, b) => (b.bis || 0) - (a.bis || 0) || b.sek - a.sek);
    const uhr = t => new Date(t * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const sek = zeilen.reduce((s, z) => s + z.sek, 0);
    const tage = [];
    for (let t = heute; t > heute - 14; t--) tage.push(t);
    const mehrere = quellen.length > 1;
    return `
      <section class="card">
        <div class="projekt-header">
          <h3 data-icon="userCheck">Wer war dabei?${this.opt.spiel ? ` <small class="hint">${this.esc(this.uebungName())}</small>` : ''}</h3>
          <label class="tr-tag">Tag <select data-tr-tag>${tage.map(t => `<option value="${t}" ${t === tag ? 'selected' : ''}>${tagName(t)}</option>`).join('')}</select></label>
        </div>
        <div class="st-kacheln">
          <div class="st-kachel st-gross"><b>${zeilen.length} <small>von ${gesamt}</small></b><span>Kinder ${tag === heute ? 'heute ' : ''}${this.opt.spiel ? 'mit dieser Übung' : 'angemeldet'}</span></div>
          <div class="st-kachel"><b>${zeilen.filter(z => z.n).length}</b><span>haben gespielt</span></div>
          <div class="st-kachel"><b>${Musiktrainer.tausend(zeilen.reduce((s, z) => s + z.n, 0))}</b><span>Runden</span></div>
          <div class="st-kachel"><b>${Musiktrainer.minuten(sek)}</b><span>Übungszeit zusammen</span></div>
          <div class="st-kachel"><b>${zeilen.filter(z => z.n) .length ? Musiktrainer.minuten(sek / zeilen.filter(z => z.n).length) : '–'}</b><span>je spielendem Kind</span></div>
        </div>
        ${zeilen.length ? `<div class="mt-tabelle-rahmen"><table class="mt-tabelle st-tabelle tr-tag-tabelle">
          <thead><tr><th>Name</th>${mehrere ? '<th>Klasse</th>' : ''}<th title="Von der ersten bis zur letzten Runde">Uhrzeit</th><th>Runden</th>
            <th title="Summe der Rundenlängen – wie lange die Seite nur offen war, speichert der Server nicht">Übungszeit</th>
            <th title="Außerhalb von Mo–Fr 7:30–13:30 Uhr">Zuhause</th><th>Gespielt</th></tr></thead>
          <tbody>${zeilen.map(z => `<tr>
            <td>${z.info?.s ? Musiktrainer.gesichtHtml(z.info.s) : ''}<b>${this.esc(z.info?.name || 'Unbekannt')}</b></td>
            ${mehrere ? `<td>${this.esc(z.q.name)}</td>` : ''}
            <td>${z.n ? `${uhr(z.von)}–${uhr(z.bis)}${z.mal > 1 ? ` <small class="hint">(${z.mal}×)</small>` : ''}` : '<span class="hint">nur angemeldet</span>'}</td>
            <td>${z.n || '–'}</td>
            <td>${z.n ? Musiktrainer.zeit(z.sek) : '–'}</td>
            <td>${z.zuhause ? Musiktrainer.zeit(z.zuhause) : '–'}</td>
            <td class="tr-spiele">${this.esc(z.spiele.join(', '))}</td></tr>`).join('')}</tbody>
        </table></div>`
        : `<p class="hint">${tag === heute ? 'Heute' : 'An diesem Tag'} war noch niemand aus ${mehrere ? 'diesen Klassen' : 'dieser Klasse'} angemeldet.</p>`}
        ${this.opt.spiel ? '' : this.fernHtml(quellen, namen)}
        <p class="hint">Angemeldet = die Seite war mit Zugang offen. Übungszeit = Länge der gespielten Runden (seit 01.11.2026 gespeichert).</p>
      </section>`;
  },

  /* ---------- Wer hat wann geübt? Vormittag / Nachmittag / Alles ----------
     Nachmittag = jede Runde, die ab 13 Uhr begonnen hat (alle Wochentage), Vormittag = davor.
     Je Kind: an wie vielen Tagen, wie lange, wie viele Runden, wann zuletzt. */
  nachmittagHtml(quellen, filter) {
    const AB = 13;
    const tz = this.opt.tageszeit || 'nachmittag';
    const passt = start => {
      if (tz === 'alles') return true;
      const nach = new Date(start * 1000).getHours() >= AB;
      return tz === 'nachmittag' ? nach : !nach;
    };
    const TZ = {
      vormittag: { titel: `Vormittags geübt (vor ${AB} Uhr)`, tage: 'Vormittage', leer: `vor ${AB} Uhr` },
      nachmittag: { titel: `Nachmittags geübt (ab ${AB} Uhr)`, tage: 'Nachmittage', leer: `nach ${AB} Uhr` },
      alles: { titel: 'Wer hat geübt? (ganzer Tag)', tage: 'Tage', leer: '' },
    }[tz];
    const schieber = `<div class="tr-schieber" data-pos="${['vormittag', 'nachmittag', 'alles'].indexOf(tz)}" role="group" aria-label="Tageszeit">
      ${[['vormittag', 'Vormittag'], ['nachmittag', 'Nachmittag'], ['alles', 'Alles']].map(([w, t]) =>
        `<button type="button" class="${tz === w ? 'an' : ''}" data-tr-opt="tageszeit" data-wert="${w}" aria-pressed="${tz === w}">${t}</button>`).join('')}
    </div>`;
    const seit = +this.opt.zeitraum ? Date.now() / 1000 - this.opt.zeitraum * 86400 : 0;
    const namen = this.namen(quellen);
    const wt = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const uhr = t => new Date(t * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const datum = t => { const d = new Date(t * 1000); return `${wt[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`; };
    const kinder = {};
    let gesamt = 0;
    quellen.forEach(q => {
      const d = this.d(q);
      gesamt += d.schueler.length;
      d.verlauf.forEach(v => {
        const start = v.zeit - (v.dauer || 0);
        if (v.zeit < seit || !passt(start)) return;
        const k = kinder[v.schueler_id] ||= { id: v.schueler_id, q, tage: {}, sek: 0, n: 0, zuletzt: 0 };
        const t = Musiktrainer.statTag(v.zeit);
        const tg = k.tage[t] ||= { von: start, bis: v.zeit, sek: 0, n: 0 };
        tg.von = Math.min(tg.von, start); tg.bis = Math.max(tg.bis, v.zeit);
        tg.sek += v.dauer || 0; tg.n++;
        k.sek += v.dauer || 0; k.n++;
        k.zuletzt = Math.max(k.zuletzt, v.zeit);
      });
    });
    const { spalte, auf } = this.sortierung;
    const wert = z => ({ name: z.info?.name || '', klasse: z.q.name, sek: z.sek, tage: z.tage.length, n: z.n,
      schnitt: z.sek / z.tage.length, zuletzt: z.zuletzt })[spalte];
    const zeilen = Object.values(kinder).map(k => ({ ...k, info: namen[k.id], tage: Object.values(k.tage).sort((a, b) => b.bis - a.bis) }))
      .sort((a, b) => {
        const x = wert(a), y = wert(b);
        const c = typeof x === 'string' ? x.localeCompare(y, 'de', { sensitivity: 'base' }) : x - y;
        return (auf ? c : -c) || b.sek - a.sek;
      });
    const kopf = (sp, text, titel = '') => `<th class="tr-sortierbar${spalte === sp ? ' aktiv' : ''}" data-tr-sort="${sp}"${titel ? ` title="${titel}"` : ''}>${text}${spalte === sp ? (auf ? ' ▲' : ' ▼') : ''}</th>`;
    const sek = zeilen.reduce((s, z) => s + z.sek, 0);
    const nachmittage = zeilen.reduce((s, z) => s + z.tage.length, 0);
    const mehrere = quellen.length > 1;
    const zeitraum = this.opt.zeitraum === '0' ? 'insgesamt' : `in den letzten ${this.opt.zeitraum} Tagen`;
    const tagText = tg => `${datum(tg.bis)} ${uhr(tg.von)}–${uhr(tg.bis)} · ${Math.round(tg.sek / 60)} min · ${tg.n} ${tg.n === 1 ? 'Runde' : 'Runden'}`;
    return `
      <section class="card">
        <div class="projekt-header">
          <h3 data-icon="timer">${TZ.titel}${this.opt.spiel ? ` <small class="hint">${this.esc(this.uebungName())}</small>` : ''}</h3>
          ${schieber}
        </div>
        ${filter}
        <div class="st-kacheln">
          <div class="st-kachel st-gross"><b>${zeilen.length} <small>von ${gesamt}</small></b><span>Kinder ${zeitraum}</span></div>
          <div class="st-kachel"><b>${Musiktrainer.minuten(sek)}</b><span>Übungszeit zusammen</span></div>
          <div class="st-kachel"><b>${zeilen.length ? Musiktrainer.minuten(sek / zeilen.length) : '–'}</b><span>je übendem Kind</span></div>
          <div class="st-kachel"><b>${nachmittage}</b><span>${TZ.tage} zusammen</span></div>
        </div>
        ${zeilen.length ? `<div class="mt-tabelle-rahmen"><table class="mt-tabelle st-tabelle tr-nachmittag">
          <thead><tr>${kopf('name', 'Name')}${mehrere ? kopf('klasse', 'Klasse') : ''}${kopf('sek', 'Übungszeit')}${kopf('tage', TZ.tage, 'An so vielen Tagen geübt')}
            ${kopf('n', 'Runden')}${kopf('schnitt', `Ø je ${TZ.tage === 'Tage' ? 'Tag' : TZ.tage.slice(0, -1)}`)}${kopf('zuletzt', 'Zuletzt')}</tr></thead>
          <tbody>${zeilen.map(z => `<tr title="${this.esc(z.tage.map(tagText).join('\n'))}">
            <td>${z.info?.s ? Musiktrainer.gesichtHtml(z.info.s) : ''}<b>${this.esc(z.info?.name || 'Unbekannt')}</b></td>
            ${mehrere ? `<td>${this.esc(z.q.name)}</td>` : ''}
            <td><b>${Musiktrainer.zeit(z.sek)}</b></td>
            <td>${z.tage.length}</td>
            <td>${z.n}</td>
            <td>${Musiktrainer.zeit(z.sek / z.tage.length)}</td>
            <td class="hint">${datum(z.tage[0].bis)} ${uhr(z.tage[0].von)}–${uhr(z.tage[0].bis)}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="hint">Auf eine Spaltenüberschrift klicken sortiert, noch einmal dreht um. Mit der Maus über eine Zeile: jeder Tag einzeln.
          ${tz === 'alles' ? '' : `Gezählt wird jede Runde, die ${tz === 'nachmittag' ? 'ab' : 'vor'} ${AB} Uhr begonnen hat – auch am Wochenende. `}Übungszeit = Länge der Runden (seit 01.11.2026 gespeichert).</p>`
        : `<p class="hint">${zeitraum[0].toUpperCase() + zeitraum.slice(1)} hat noch niemand aus ${mehrere ? 'diesen Klassen' : 'dieser Klasse'}${TZ.leer ? ` ${TZ.leer}` : ''} geübt.</p>`}
      </section>`;
  },

  /* Wer länger nicht da war – dieselbe Angabe wie „Zuletzt“ in der Klassentabelle */
  fernHtml(quellen, namen) {
    const grenze = Date.now() / 1000 - 7 * 86400;
    const liste = quellen.flatMap(q => this.daten[q.id].schueler
      .filter(k => !k.zuletzt || k.zuletzt < grenze)
      .map(k => ({ k, q, info: namen[k.id] })))
      .sort((a, b) => (a.k.zuletzt || 0) - (b.k.zuletzt || 0));
    if (!liste.length) return '';
    const mehrere = quellen.length > 1;
    return `<details class="tr-fern">
      <summary>${liste.length} ${liste.length === 1 ? 'Kind' : 'Kinder'} seit über 7 Tagen nicht dabei (${liste.filter(x => !x.k.zuletzt).length} noch nie)</summary>
      <div class="mt-tabelle-rahmen"><table class="mt-tabelle st-tabelle">
        <thead><tr><th>Name</th>${mehrere ? '<th>Klasse</th>' : ''}<th>Zuletzt</th></tr></thead>
        <tbody>${liste.map(x => `<tr><td>${x.info?.s ? Musiktrainer.gesichtHtml(x.info.s) : ''}${this.esc(x.info?.name || x.k.benutzername || 'Unbekannt')}</td>
          ${mehrere ? `<td>${this.esc(x.q.name)}</td>` : ''}<td class="hint">${Musiktrainer.zuletzt(x.k.zuletzt)}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>`;
  },

  /* ---------- Eine Übung: Noten der Klassen nebeneinander ---------- */
  /* Wie in der Klassentabelle: je Kind und Stufe der Schnitt der 3 besten Runden im Zeitraum,
     Note = 7 − Sterne; je Klasse der Schnitt über die Kinder, die die Stufe gespielt haben. */
  leistungHtml(quellen) {
    const sp = this.spiel();
    const seit = +this.opt.zeitraum ? Date.now() / 1000 - this.opt.zeitraum * 86400 : 0;
    const schnitt3 = z => { const t = [...z].sort((a, b) => b - a).slice(0, Musiktrainer.wievieleZaehlen(sp.id)); return t.reduce((a, n) => a + n, 0) / t.length; };
    const rechnen = verlauf => {
      const je = {};
      verlauf.forEach(v => { if (v.zeit >= seit) ((je[v.stufe] ||= {})[v.schueler_id] ||= []).push(v); });
      const out = {};
      Object.entries(je).forEach(([st, kinder]) => {
        const noten = [], prozente = [];
        Object.values(kinder).forEach(r => {
          noten.push(Math.min(6, 7 - schnitt3(r.map(v => v.sterne))));
          const mit = r.filter(v => v.von);
          if (mit.length) prozente.push(schnitt3(mit.map(v => Math.min(100, 100 * v.richtig / v.von))));
        });
        out[st] = { note: noten.reduce((a, n) => a + n, 0) / noten.length, n: noten.length,
          prozent: prozente.length ? prozente.reduce((a, n) => a + n, 0) / prozente.length : null,
          runden: Object.values(kinder).reduce((a, r) => a + r.length, 0) };
      });
      return out;
    };
    const reihen = quellen.map(q => ({ name: q.name, kinder: q.cls ? q.cls.students.filter(s => s.mt).length : this.daten[q.id].schueler.length, w: rechnen(this.d(q).verlauf) }));
    if (quellen.length > 1) reihen.push({ name: 'Alle zusammen', summe: true, kinder: reihen.reduce((a, r) => a + r.kinder, 0), w: rechnen(quellen.flatMap(q => this.d(q).verlauf)) });
    const stufen = this.reihe(sp).filter(i => (this.opt.stufe === '' || String(i) === this.opt.stufe) && reihen.some(r => r.w[i]));
    const zelle = x => (x ? `<span class="mt-kreis n${Math.round(x.note)} dezimal" title="${x.n} Kinder, ${x.runden} Runden${x.prozent !== null ? `, Ø ${Math.round(x.prozent)} % richtig` : ''}">${Musiktrainer.komma(x.note)}</span>
      <small class="hint">${x.n}</small>` : '<span class="hint">·</span>');
    const zeitraum = this.opt.zeitraum === '0' ? 'gesamt' : `letzte ${this.opt.zeitraum} Tage`;
    return `<section class="card">
      <div class="projekt-header"><h3 data-icon="list">Noten: ${this.esc(this.uebungName())}</h3></div>
      ${stufen.length ? `<div class="mt-tabelle-rahmen"><table class="mt-tabelle tr-leistung">
        <thead><tr><th>Klasse</th>${stufen.map(i => `<th>${this.esc(sp.stufen[i])}</th>`).join('')}</tr></thead>
        <tbody>${reihen.map(r => `<tr${r.summe ? ' class="tr-summe"' : ''}><td><b>${this.esc(r.name)}</b> <small class="hint">${r.kinder} Kinder</small></td>
          ${stufen.map(i => `<td>${zelle(r.w[i])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">Ø Note der Kinder, die die Stufe gespielt haben (je Kind der Schnitt der 3 besten Runden, ${zeitraum}); die kleine Zahl = so viele Kinder. Mehr steht im Tooltip.</p>`
      : `<p class="hint">Diese Übung hat in den gewählten Klassen ${this.opt.zeitraum === '0' ? 'noch' : 'in diesem Zeitraum'} niemand gespielt.</p>`}
    </section>`;
  },

  /* ---------- Klassen nebeneinander ---------- */
  vergleichHtml(quellen) {
    const o = this.opt;
    const heute = this.heute();
    const reihen = quellen.map(q => {
      const d = this.d(q);
      const s = Musiktrainer.statRechnen(d, +o.zeitraum);
      const heuteKinder = new Set([
        ...d.verlauf.filter(v => Musiktrainer.statTag(v.zeit) === heute).map(v => v.schueler_id),
        ...(d.besuche || []).filter(b => b.tag === heute).map(b => b.schueler_id),
      ]).size;
      const zuhauseSek = s.sitzungen.reduce((a, x) => a + x.sek, 0);
      const nie = d.schueler.filter(k => !k.zuletzt).length;
      return { name: q.name, ...s, heuteKinder, zuhauseSek, nie };
    });
    const min = o.mass === 'min';
    const jeKind = o.basis === 'jeKind';
    // je Kind: geteilt durch alle Kinder der Klasse, damit große Klassen nicht vorne liegen
    const wert = x => (min ? x.sek / 60 : x.runden) / (jeKind ? Math.max(1, x.kinder) : 1);
    const text = x => (min ? Musiktrainer.minuten(wert(x) * 60) : `${Math.round(wert(x) * 10) / 10} Runden`);
    const sortiert = [...reihen].sort((a, b) => wert(b) - wert(a));
    const pz = (a, b) => (b ? Math.round(100 * a / b) + ' %' : '–');
    return `
      <div class="st-filter"><span>
        <button type="button" class="small${jeKind ? ' primary' : ''}" data-tr-opt="basis" data-wert="jeKind" title="Durch die Zahl der Kinder geteilt – fairer bei unterschiedlich großen Klassen">Je Kind</button>
        <button type="button" class="small${jeKind ? '' : ' primary'}" data-tr-opt="basis" data-wert="summe">Klasse gesamt</button>
      </span></div>
      <div class="mt-klasse-block"><h3>${min ? 'Minuten' : 'Runden'} ${jeKind ? 'je Kind' : 'je Klasse'}</h3>${Musiktrainer.statLiegend(sortiert, wert, text)}</div>
      <div class="mt-tabelle-rahmen"><table class="mt-tabelle st-tabelle tr-vergleich">
        <thead><tr><th>Klasse</th><th>Kinder geübt</th><th>Anteil</th><th>Runden</th><th>Übungszeit</th><th>Ø je übendem Kind</th>
          <th title="Außerhalb von Mo–Fr 7:30–13:30 Uhr">Zuhause</th><th>Anmeldetage</th><th>Letzte 7 Tage</th><th>Heute</th><th title="Kinder, die sich noch nie angemeldet haben">Noch nie</th></tr></thead>
        <tbody>${sortiert.map(r => `<tr><td><b>${this.esc(r.name)}</b></td>
          <td>${r.aktiv} von ${r.kinder}</td><td>${pz(r.aktiv, r.kinder)}</td>
          <td>${Musiktrainer.tausend(r.runden)}</td><td>${Musiktrainer.minuten(r.sek)}</td>
          <td>${r.aktiv ? Musiktrainer.minuten(r.sek / r.aktiv) : '–'}</td>
          <td>${Musiktrainer.minuten(r.zuhauseSek)} <small class="hint">(${r.zuhauseKinder} Kinder)</small></td>
          <td>${Musiktrainer.tausend(r.anmeldetage)}</td>
          <td>${Musiktrainer.minuten(r.sek7)} · ${r.runden7} R.</td>
          <td>${r.heuteKinder ? `${r.heuteKinder} Kinder` : '–'}</td>
          <td>${r.nie || '–'}</td></tr>`).join('')}</tbody>
        <tfoot>${(() => {
          const a = reihen.reduce((x, r) => ({ kinder: x.kinder + r.kinder, aktiv: x.aktiv + r.aktiv, runden: x.runden + r.runden, sek: x.sek + r.sek,
            zuhauseSek: x.zuhauseSek + r.zuhauseSek, zuhauseKinder: x.zuhauseKinder + r.zuhauseKinder, anmeldetage: x.anmeldetage + r.anmeldetage,
            sek7: x.sek7 + r.sek7, runden7: x.runden7 + r.runden7, heuteKinder: x.heuteKinder + r.heuteKinder, nie: x.nie + r.nie }),
            { kinder: 0, aktiv: 0, runden: 0, sek: 0, zuhauseSek: 0, zuhauseKinder: 0, anmeldetage: 0, sek7: 0, runden7: 0, heuteKinder: 0, nie: 0 });
          return `<tr class="tr-summe"><td><b>Alle zusammen</b></td><td>${a.aktiv} von ${a.kinder}</td><td>${pz(a.aktiv, a.kinder)}</td>
            <td>${Musiktrainer.tausend(a.runden)}</td><td>${Musiktrainer.minuten(a.sek)}</td><td>${a.aktiv ? Musiktrainer.minuten(a.sek / a.aktiv) : '–'}</td>
            <td>${Musiktrainer.minuten(a.zuhauseSek)} <small class="hint">(${a.zuhauseKinder} Kinder)</small></td><td>${Musiktrainer.tausend(a.anmeldetage)}</td>
            <td>${Musiktrainer.minuten(a.sek7)} · ${a.runden7} R.</td><td>${a.heuteKinder ? `${a.heuteKinder} Kinder` : '–'}</td><td>${a.nie || '–'}</td></tr>`;
        })()}</tfoot>
      </table></div>`;
  },

  /* ---------- Bedienung ---------- */
  klick(e) {
    const sort = e.target.closest('[data-tr-sort]');
    if (sort) {
      const sp = sort.dataset.trSort;
      // Gleiche Spalte: Richtung umdrehen; neue Spalte: Text A–Z, Zahlen größte zuerst
      this.sortierung = this.sortierung.spalte === sp ? { spalte: sp, auf: !this.sortierung.auf }
        : { spalte: sp, auf: ['name', 'klasse'].includes(sp) };
      return this.render();
    }
    const opt = e.target.closest('[data-tr-opt]');
    if (opt) {
      this.opt[opt.dataset.trOpt] = opt.dataset.wert;
      this.optSpeichern();
      return this.render();
    }
    const b = e.target.closest('[data-tr]');
    if (!b) return;
    const quellen = this.quellen();
    const a = b.dataset.tr;
    if (a === 'laden') return this.laden(true);
    if (a === 'entsperren') return Musiktrainer.entsperren(+b.dataset.id, b);
    if (a === 'uebung-weg') { this.opt.spiel = ''; this.opt.stufe = ''; this.optSpeichern(); return this.render(); }
    if (a === 'einrichten') return this.einrichten(b.dataset.klasse);
    if (a === 'alle') this.wahlSpeichern(new Set(quellen.map(q => q.key)));
    if (a === 'keine') this.wahlSpeichern(new Set());
    if (a === 'jahr') this.wahlSpeichern(new Set(quellen.filter(q => q.cls && q.jahr === b.dataset.jahr).map(q => q.key)));
    this.laden();
  },

  /* Zur Klasse springen, Unterreiter music-trainer */
  einrichten(id) {
    if (Classes.yearFilter !== 'all') {
      const cls = Classes.data.classes.find(c => String(c.id) === String(id));
      if (cls && (cls.year || '') !== Classes.yearFilter) Classes.yearFilter = 'all';
    }
    document.querySelector('.tab-btn[data-tab="klassen"]')?.click();
    const cls = Classes.data.classes.find(c => String(c.id) === String(id));
    if (!cls) return;
    Classes.selectClass(cls.id);
    document.querySelector('.subtab-btn[data-subtab="musiktrainer"]')?.click();
  },

  aenderung(e) {
    if (e.target.matches('[data-tr-tag]')) { this.tag = +e.target.value; return this.render(); }
    if (e.target.matches('[data-tr-spiel]')) { this.opt.spiel = e.target.value; this.opt.stufe = ''; this.optSpeichern(); return this.render(); }
    if (e.target.matches('[data-tr-stufe]')) { this.opt.stufe = e.target.value; this.optSpeichern(); return this.render(); }
    if (!e.target.matches('[data-tr-klasse]')) return;
    const wahl = this.gewaehlt(this.quellen());
    if (e.target.checked) wahl.add(e.target.dataset.trKlasse); else wahl.delete(e.target.dataset.trKlasse);
    this.wahlSpeichern(wahl);
    this.laden();
  },
};
