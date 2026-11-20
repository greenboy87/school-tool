/* Noten aus dem music-trainer in ein Projekt übernehmen (Projekte & Noten → Knopf „music-trainer“).

   Anders als „Noten in Klassenliste übertragen“ im music-trainer-Reiter (legt eine eigene Spalte
   für alle an) landet hier die Note im offenen Projekt – für alle oder nur für einzelne Kinder.
   Gedacht für Prüfungen, die manche live machen und andere im music-trainer: Wer live vorspielt,
   bekommt seine Note von Hand, die anderen übernimmt man hier.

   Gerechnet wird genau wie in der Auswertung (Musiktrainer.notenZeilen): je Spiel und Stufe der
   Schnitt der 3 besten Runden (Prüfungsnote: die beste Prüfung), daraus der Durchschnitt. Die
   Auswahl der Spiele gehört dem Projekt (p.mtAuswahl) und ändert die des Reiters nicht. */
Object.assign(Musiktrainer, {
  /* Schnellwahl für die häufigsten Fälle */
  ND_VORLAGEN: [
    { name: 'Rhythmus-Prüfung Klasse 5', spiel: 'rhythmus-pruefung-note', stufe: 0 },
    { name: 'Rhythmus-Prüfung Klasse 6', spiel: 'rhythmus-pruefung-note', stufe: 1 },
  ],

  ndKopie(x) { return JSON.parse(JSON.stringify(x)); },

  notenDialog() {
    const cls = Classes.currentClass(), p = Classes.currentProject();
    if (!cls || !p) return;
    if (!cls.musiktrainer) {
      alert('Diese Klasse ist noch nicht im music-trainer eingerichtet (Reiter „music-trainer“).');
      return;
    }
    let dlg = document.getElementById('mt-noten-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'mt-noten-dialog';
      dlg.className = 'mt-noten-dialog';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', e => this.ndKlick(e));
      dlg.addEventListener('change', e => this.ndAenderung(e));
    }
    this.nd = {
      clsId: cls.id, pId: p.id,
      mt: { kategorien: this.ndKopie(p.mtAuswahl || this.kategorien(cls.musiktrainer)) },
      zeitraum: '0', fehltAls6: false,
      wer: 'alle', gewaehlt: new Set(), ueberschreiben: false,
    };
    dlg.showModal();
    this.ndZeichnen();
  },

  ndKlasse() {
    const cls = Classes.data.classes.find(c => c.id === this.nd?.clsId);
    const p = cls && cls.projects.find(x => x.id === this.nd.pId);
    return { cls, p };
  },

  /* Ergebnisse der Klasse holen – dieselben wie im Reiter, nur ohne ihn zu zeichnen */
  async ndLaden(cls, ziel) {
    if (this.ergebnis && this.ergebnis.klasseId === cls.musiktrainer.id) return true;
    try {
      const daten = await this.api(`/api/lehrer/klassen/${cls.musiktrainer.id}?seit=${Math.floor(Date.now() / 1000) - 366 * 86400}`);
      this.ergebnis = { klasseId: cls.musiktrainer.id, daten };
      return true;
    } catch (err) {
      if (err.status === 401) { this.anmeldeFormular(ziel, () => this.ndZeichnen()); return false; }
      ziel.innerHTML = `<p class="hint">${this.esc(err.status === 404 ? 'Diese Klasse gibt es auf dem Server nicht mehr.'
        : err.status ? err.message : 'Keine Verbindung zum music-trainer-Server.')}</p>`;
      return false;
    }
  },

  /* Zeilen wie in der Auswertung, aber mit der Auswahl, dem Zeitraum und „fehlt = 6“ des Fensters */
  ndZeilen(cls) {
    const nd = this.nd;
    const kopie = { ...cls, musiktrainer: { ...cls.musiktrainer, kategorien: nd.mt.kategorien, fehltAls6: nd.fehltAls6 } };
    const vorher = this.filter.zeitraum;
    this.filter.zeitraum = nd.zeitraum;
    try { return this.notenZeilen(kopie); } finally { this.filter.zeitraum = vorher; }
  },

  async ndZeichnen() {
    const dlg = document.getElementById('mt-noten-dialog');
    const { cls, p } = this.ndKlasse();
    if (!dlg || !cls || !p) return;
    const nd = this.nd;
    dlg.innerHTML = `
      <div class="nd-kopf">
        <h3 data-icon="music">Noten aus dem music-trainer</h3>
        <button type="button" class="small" data-nd="zu" data-icon="x">Schließen</button>
      </div>
      <p class="hint">Für „${this.esc(p.name)}“ (${this.esc(cls.name)}). Je Aufgabe zählt der Schnitt der 3 besten Runden,
        bei der Rhythmus-Prüfung die beste Prüfung – wie in der Auswertung.</p>
      <div id="nd-inhalt"><p class="hint">Lade Ergebnisse …</p></div>`;
    Icons.hydrate(dlg);
    const inhalt = dlg.querySelector('#nd-inhalt');
    if (!(await this.ndLaden(cls, inhalt))) return;

    const { auswahl, zeilen } = this.ndZeilen(cls);
    const mitNote = zeilen.filter(z => z.schnitt !== null);
    const ohneZugang = cls.students.filter(s => !s.mt);
    const vorlage = this.ND_VORLAGEN.map((v, i) =>
      `<button type="button" class="small${this.ndIstVorlage(v) ? ' primary' : ''}" data-nd="vorlage" data-nr="${i}">${this.esc(v.name)}</button>`).join('');

    const zeile = z => {
      const jetzt = p.grades[z.s.id] || '';
      const neu = z.schnitt === null ? null : this.kurz(z.schnitt);
      const gleich = neu !== null && jetzt === neu;
      const box = nd.wer === 'einzelne'
        ? `<td><input type="checkbox" data-nd-kind="${this.esc(z.s.id)}" ${nd.gewaehlt.has(z.s.id) ? 'checked' : ''} ${neu === null ? 'disabled' : ''}></td>` : '';
      return `<tr class="${neu === null ? 'nd-ohne' : ''}">${box}
        <td>${this.esc(this.nachname(z.s))}</td>
        <td class="nd-note">${neu === null ? '<span class="hint">nicht gespielt</span>' : `<span class="mt-gesamtnote n${Math.round(z.schnitt)}">${neu}</span>`}</td>
        <td class="nd-jetzt">${jetzt ? this.esc(jetzt) + (gleich ? ' <span class="hint">✓</span>' : '') : '<span class="hint">–</span>'}</td></tr>`;
    };

    const ziele = this.ndZiele(zeilen, p);
    inhalt.innerHTML = `
      <div class="nd-vorlagen"><span class="hint">Schnellwahl:</span> ${vorlage}</div>
      ${this.kategorienHtml(nd.mt)}
      <div class="inline-form nd-filter">
        <label>Zeitraum <select data-nd-feld="zeitraum">
          ${[['0', 'Gesamt'], ['7', 'Letzte 7 Tage'], ['14', 'Letzte 14 Tage'], ['30', 'Letzte 30 Tage'], ['90', 'Letzte 90 Tage']]
            .map(([v, t]) => `<option value="${v}" ${nd.zeitraum === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
        ${auswahl.length > 1 ? `<label class="mt-haken"><input type="checkbox" data-nd-feld="fehltAls6" ${nd.fehltAls6 ? 'checked' : ''}> Nicht gespielt zählt als 6</label>` : ''}
      </div>
      <div class="nd-wer">
        <label><input type="radio" name="nd-wer" value="alle" ${nd.wer === 'alle' ? 'checked' : ''}> Für alle</label>
        <label><input type="radio" name="nd-wer" value="einzelne" ${nd.wer === 'einzelne' ? 'checked' : ''}> Nur für einzelne Schüler</label>
        ${nd.wer === 'alle' ? `<label class="nd-ueber"><input type="checkbox" data-nd-feld="ueberschreiben" ${nd.ueberschreiben ? 'checked' : ''}> Vorhandene Noten überschreiben</label>`
          : `<span class="btn-row"><button type="button" class="small" data-nd="alle-an">Alle mit Note</button><button type="button" class="small" data-nd="alle-ab">Keine</button></span>`}
      </div>
      ${!auswahl.length ? '<p class="hint">Oben mindestens einen Bereich, ein Spiel und eine Stufe wählen.</p>' : `
      <div class="nd-tabelle-huelle"><table class="nd-tabelle">
        <thead><tr>${nd.wer === 'einzelne' ? '<th></th>' : ''}<th>Name</th><th>music-trainer</th><th>Jetzt im Projekt</th></tr></thead>
        <tbody>${zeilen.map(zeile).join('')}</tbody>
      </table></div>
      <p class="hint">${mitNote.length} von ${zeilen.length} haben dazu eine Note${ohneZugang.length ? `, ${ohneZugang.length} ohne music-trainer-Zugang` : ''}.</p>`}
      <div class="btn-row nd-fuss">
        <button type="button" class="primary" data-nd="uebernehmen" data-icon="check" ${ziele.length ? '' : 'disabled'}>
          ${ziele.length ? `${ziele.length} ${ziele.length === 1 ? 'Note' : 'Noten'} übernehmen` : 'Nichts zu übernehmen'}</button>
        <span class="hint">${this.ndHinweis(zeilen, p, ziele)}</span>
      </div>`;
    Icons.hydrate(inhalt);
  },

  ndIstVorlage(v) {
    const sp = this.spalten(this.nd.mt);
    return sp.length === 1 && sp[0].spiel.id === v.spiel && sp[0].stufe === v.stufe;
  },

  /* Wer bekommt eine Note? Alle: wer gespielt hat und noch keine (oder überschreiben);
     einzelne: die angehakten (überschreibt bewusst) */
  ndZiele(zeilen, p) {
    const nd = this.nd;
    return zeilen.filter(z => z.schnitt !== null && (nd.wer === 'einzelne'
      ? nd.gewaehlt.has(z.s.id)
      : nd.ueberschreiben || !p.grades[z.s.id] || p.grades[z.s.id] === this.kurz(z.schnitt)))
      .filter(z => p.grades[z.s.id] !== this.kurz(z.schnitt));
  },

  ndHinweis(zeilen, p, ziele) {
    const nd = this.nd;
    if (nd.wer === 'einzelne') return nd.gewaehlt.size ? '' : 'Haken bei den Kindern setzen, deren Note übernommen werden soll.';
    const behalten = zeilen.filter(z => z.schnitt !== null && p.grades[z.s.id] && p.grades[z.s.id] !== this.kurz(z.schnitt) && !nd.ueberschreiben).length;
    return behalten ? `${behalten} ${behalten === 1 ? 'Kind hat' : 'Kinder haben'} schon eine andere Note – bleibt stehen.` : '';
  },

  ndKlick(e) {
    const dlg = document.getElementById('mt-noten-dialog');
    if (e.target === dlg) { dlg.close(); return; }       // Klick auf den Hintergrund
    const b = e.target.closest('[data-nd], [data-mt]');
    if (!b) return;
    const nd = this.nd;
    const k = this.kategorien(nd.mt);
    const a = b.dataset.nd || b.dataset.mt;
    if (a === 'zu') return dlg.close();
    if (a === 'vorlage') {
      const v = this.ND_VORLAGEN[+b.dataset.nr];
      const sp = MT_SPIELE.find(x => x.id === v.spiel);
      nd.mt.kategorien = {
        bereiche: [sp.bereich],
        ohne: MT_SPIELE.filter(x => x.bereich === sp.bereich && x.id !== sp.id).map(x => x.id),
        stufen: [], stufenJe: { ['spiel:' + sp.id]: [v.stufe] },
        gesehen: MT_SPIELE.map(x => x.id),
      };
      return this.ndZeichnen();
    }
    if (a === 'kat-alle') {
      const felder = [...b.closest('.mt-kat-zeile').querySelectorAll('input[data-kat]')];
      const an = !felder.every(f => f.checked);
      felder.forEach(f => this.katSetzen(k, f, an));
      return this.ndZeichnen();
    }
    if (a === 'kat-alles') {
      const bereiche = [...new Set(MT_SPIELE.map(sp => sp.bereich))];
      nd.mt.kategorienVorher = this.ndKopie(k);
      nd.mt.kategorien = {
        bereiche, ohne: [], stufen: k.stufen || [], gesehen: MT_SPIELE.map(sp => sp.id),
        stufenJe: Object.fromEntries(bereiche.map(bb => [bb, [...new Set(MT_SPIELE.filter(sp => sp.bereich === bb).flatMap(sp => this.reihe(sp)))]])),
      };
      return this.ndZeichnen();
    }
    if (a === 'kat-zurueck') {
      if (nd.mt.kategorienVorher) { nd.mt.kategorien = nd.mt.kategorienVorher; delete nd.mt.kategorienVorher; }
      return this.ndZeichnen();
    }
    if (a === 'alle-an' || a === 'alle-ab') {
      const { cls } = this.ndKlasse();
      nd.gewaehlt = new Set(a === 'alle-an' ? this.ndZeilen(cls).zeilen.filter(z => z.schnitt !== null).map(z => z.s.id) : []);
      return this.ndZeichnen();
    }
    if (a === 'uebernehmen') return this.ndUebernehmen();
  },

  ndAenderung(e) {
    const nd = this.nd, t = e.target;
    if (t.dataset.kat) { this.katSetzen(this.kategorien(nd.mt), t, t.checked); return this.ndZeichnen(); }
    if (t.name === 'nd-wer') { nd.wer = t.value; return this.ndZeichnen(); }
    if (t.dataset.ndKind) {
      if (t.checked) nd.gewaehlt.add(t.dataset.ndKind); else nd.gewaehlt.delete(t.dataset.ndKind);
      return this.ndZeichnen();
    }
    const f = t.dataset.ndFeld;
    if (!f) return;
    nd[f] = t.type === 'checkbox' ? t.checked : t.value;
    this.ndZeichnen();
  },

  ndUebernehmen() {
    const { cls, p } = this.ndKlasse();
    if (!cls || !p) return;
    const { zeilen } = this.ndZeilen(cls);
    const ziele = this.ndZiele(zeilen, p);
    if (!ziele.length) return;
    const ersetzt = ziele.filter(z => p.grades[z.s.id]);
    if (ersetzt.length && !confirm(`${ersetzt.length} ${ersetzt.length === 1 ? 'vorhandene Note wird' : 'vorhandene Noten werden'} ersetzt:\n` +
      ersetzt.map(z => `${this.nachname(z.s)}: ${p.grades[z.s.id]} → ${this.kurz(z.schnitt)}`).join('\n') + '\n\nWeiter?')) return;
    if (!p.grades) p.grades = {};
    // Gemerkt wird, woher die Note kommt – die Notenliste zeigt dann ein kleines „MT“ daneben
    p.mtNoten = { ...(p.mtNoten || {}) };
    for (const z of ziele) {
      const note = this.kurz(z.schnitt);
      p.grades[z.s.id] = note;
      p.mtNoten[z.s.id] = note;
    }
    p.mtAuswahl = this.ndKopie(this.kategorien(this.nd.mt));
    delete p.mtAuswahl.kategorienVorher;
    Classes.persist();
    Classes.renderProjectDetail();
    document.getElementById('mt-noten-dialog').close();
    const meldung = document.getElementById('project-saved-hint');
    if (meldung) {
      meldung.textContent = `${ziele.length} ${ziele.length === 1 ? 'Note' : 'Noten'} aus dem music-trainer übernommen.`;
      meldung.hidden = false;
      clearTimeout(Classes._meldungTimer);
      Classes._meldungTimer = setTimeout(() => { meldung.hidden = true; }, 8000);
    }
  },
});
