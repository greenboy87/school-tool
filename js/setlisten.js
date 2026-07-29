/* Setlisten der Schulband, nach Anlass sortiert.

   Aufbau: Kategorien (Gottesdienste, Schulfest, …) enthalten Setlisten,
   Setlisten enthalten Songs aus dem Song-Bereich.

   Anmerkungen gibt es auf drei Ebenen, die sich nicht in die Quere kommen:
   – am Song selbst (bleibt im Song-Bereich und gilt überall),
   – am Song innerhalb dieser einen Setlist,
   – an der Setlist als Ganzes.
   Die Song-eigene Anmerkung lässt sich je Setlist ausblenden, ohne sie zu löschen. */
const Setlisten = {
  STANDARD_KATEGORIEN: ['Gottesdienste', 'Schulfest', 'Bunter Abend'],
  aktuelleKategorie: null,
  aktuelleId: null,

  d() {
    const b = Band.d();
    if (!Array.isArray(b.setlistKategorien) || !b.setlistKategorien.length) {
      b.setlistKategorien = [...this.STANDARD_KATEGORIEN];
    }
    if (!Array.isArray(b.setlists)) b.setlists = [];
    return b;
  },
  save() { Classes.persist(); },

  aktuelle() { return this.d().setlists.find(s => s.id === this.aktuelleId) || null; },

  init() {
    if (!document.getElementById('bandtab-setlisten')) return;

    document.getElementById('form-new-kat').addEventListener('submit', e => {
      e.preventDefault();
      const feld = document.getElementById('new-kat-name');
      const name = feld.value.trim();
      if (!name) return;
      const b = this.d();
      if (b.setlistKategorien.some(k => k.toLowerCase() === name.toLowerCase())) {
        alert(`Die Kategorie „${name}“ gibt es schon.`);
        return;
      }
      b.setlistKategorien.push(name);
      this.save();
      feld.value = '';
      this.aktuelleKategorie = name;
      this.render();
    });

    document.getElementById('form-new-setlist').addEventListener('submit', e => {
      e.preventDefault();
      const feld = document.getElementById('new-setlist-name');
      const name = feld.value.trim();
      if (!name) return;
      const kat = this.aktuelleKategorie || this.d().setlistKategorien[0];
      const liste = {
        id: Store.uid(), kategorie: kat, name,
        datum: document.getElementById('new-setlist-date').value || '',
        notiz: '', eintraege: [],
      };
      // Vorne einfügen: die neueste Setlist steht oben. Die Reihenfolge in diesem
      // Feld ist die Anzeigereihenfolge und lässt sich mit den Pfeilen ändern.
      this.d().setlists.unshift(liste);
      this.aktuelleId = liste.id;
      this.save();
      feld.value = '';
      document.getElementById('new-setlist-date').value = '';
      this.render();
    });

    document.getElementById('setlist-notiz').addEventListener('change', e => {
      const l = this.aktuelle();
      if (!l) return;
      l.notiz = e.target.value;
      this.save();
    });
    document.getElementById('setlist-datum').addEventListener('change', e => {
      const l = this.aktuelle();
      if (!l) return;
      l.datum = e.target.value;
      this.save();
      this.renderListe();
    });
    document.getElementById('setlist-kat').addEventListener('change', e => {
      const l = this.aktuelle();
      if (!l) return;
      l.kategorie = e.target.value;
      this.aktuelleKategorie = e.target.value;
      this.save();
      this.render();
    });
    document.getElementById('setlist-add-song').addEventListener('change', e => {
      const l = this.aktuelle();
      const id = e.target.value;
      e.target.value = '';
      if (!l || !id) return;
      if (l.eintraege.some(x => x.songId === id)) return;
      l.eintraege.push({ songId: id, notiz: '', eigeneAus: false });
      this.save();
      this.renderDetail();
    });
    document.getElementById('btn-delete-setlist').addEventListener('click', () => {
      const l = this.aktuelle();
      if (!l || !confirm(`Setlist „${l.name}“ löschen?`)) return;
      const b = this.d();
      b.setlists = b.setlists.filter(x => x.id !== l.id);
      this.aktuelleId = null;
      this.save();
      this.render();
    });
    document.getElementById('btn-print-setlist').addEventListener('click', () => this.drucken());

    this.render();
  },

  /* ---------- Kategorien ---------- */
  renderKategorien() {
    const b = this.d();
    if (!this.aktuelleKategorie || !b.setlistKategorien.includes(this.aktuelleKategorie)) {
      this.aktuelleKategorie = b.setlistKategorien[0] || null;
    }
    const leiste = document.getElementById('kat-leiste');
    leiste.innerHTML = '';
    for (const kat of b.setlistKategorien) {
      const anzahl = b.setlists.filter(s => s.kategorie === kat).length;
      const chip = document.createElement('span');
      chip.className = 'kat-chip' + (kat === this.aktuelleKategorie ? ' aktiv' : '');

      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'kat-name';
      knopf.textContent = `${kat} (${anzahl})`;
      knopf.addEventListener('click', () => {
        this.aktuelleKategorie = kat;
        this.aktuelleId = null;
        this.render();
      });

      const weg = document.createElement('button');
      weg.type = 'button';
      weg.className = 'kat-weg';
      weg.innerHTML = Icons.raw('x');
      weg.title = 'Kategorie entfernen';
      weg.addEventListener('click', ev => {
        ev.stopPropagation();
        if (anzahl && !confirm(
          `In „${kat}“ liegen noch ${anzahl} Setlisten.\n\n` +
          'Beim Entfernen der Kategorie werden auch diese Setlisten gelöscht. Fortfahren?')) return;
        if (!anzahl && !confirm(`Kategorie „${kat}“ entfernen?`)) return;
        b.setlistKategorien = b.setlistKategorien.filter(k => k !== kat);
        b.setlists = b.setlists.filter(s => s.kategorie !== kat);
        if (this.aktuelleKategorie === kat) this.aktuelleKategorie = null;
        this.aktuelleId = null;
        this.save();
        this.render();
      });

      chip.append(knopf, weg);
      leiste.appendChild(chip);
    }
    if (!b.setlistKategorien.length) {
      leiste.innerHTML = '<p class="hint">Keine Kategorie vorhanden – lege unten eine an.</p>';
    }
  },

  /* ---------- Setlisten der Kategorie ---------- */
  renderListe() {
    const b = this.d();
    document.getElementById('setlist-kat-titel').textContent =
      this.aktuelleKategorie ? `Setlisten – ${this.aktuelleKategorie}` : 'Setlisten';

    const ul = document.getElementById('setlist-list');
    ul.innerHTML = '';
    // Reihenfolge = Reihenfolge im Feld; neue stehen vorne, Pfeile verschieben
    const liste = b.setlists.filter(s => s.kategorie === this.aktuelleKategorie);
    if (!liste.length) {
      ul.innerHTML = '<li class="hint">In dieser Kategorie gibt es noch keine Setlist.</li>';
      return;
    }
    liste.forEach((l, i) => {
      const li = document.createElement('li');
      li.classList.toggle('active', l.id === this.aktuelleId);
      const name = document.createElement('span');
      name.className = 'pname';
      name.textContent = l.name;
      const datum = document.createElement('span');
      datum.className = 'pdate';
      datum.textContent = Band.fmt(l.datum);
      const zahl = document.createElement('span');
      zahl.className = 'pavg';
      zahl.textContent = l.eintraege.length === 1 ? '1 Song' : `${l.eintraege.length} Songs`;

      const werkzeuge = document.createElement('span');
      werkzeuge.className = 'sl-werkzeuge';
      const knopf = (icon, titel, aktion, aus) => {
        const b2 = document.createElement('button');
        b2.className = 'small';
        b2.innerHTML = Icons.raw(icon);
        b2.title = titel;
        b2.disabled = !!aus;
        b2.addEventListener('click', ev => { ev.stopPropagation(); aktion(); });
        return b2;
      };
      werkzeuge.append(
        knopf('chevronUp', 'Nach oben', () => this.verschieben(l, -1), i === 0),
        knopf('chevronDown', 'Nach unten', () => this.verschieben(l, 1), i === liste.length - 1),
        knopf('plus', 'Setlist duplizieren', () => this.duplizieren(l)));

      li.append(name, datum, zahl, werkzeuge);
      li.addEventListener('click', () => { this.aktuelleId = l.id; this.render(); });
      ul.appendChild(li);
    });
  },

  /* Verschiebt innerhalb der Kategorie – der Nachbar in derselben Kategorie
     kann im Gesamtfeld weiter entfernt liegen, deshalb wird er gesucht. */
  verschieben(l, richtung) {
    const alle = this.d().setlists;
    const gleiche = alle.filter(s => s.kategorie === l.kategorie);
    const pos = gleiche.indexOf(l);
    const nachbar = gleiche[pos + richtung];
    if (!nachbar) return;
    const a = alle.indexOf(l), b = alle.indexOf(nachbar);
    alle[a] = nachbar;
    alle[b] = l;
    this.save();
    this.renderListe();
  },

  duplizieren(l) {
    const kopie = JSON.parse(JSON.stringify(l));
    kopie.id = Store.uid();
    kopie.name = l.name + ' (Kopie)';
    const alle = this.d().setlists;
    alle.splice(alle.indexOf(l), 0, kopie);   // direkt über dem Original
    this.aktuelleId = kopie.id;
    this.save();
    this.render();
  },

  /* ---------- Eine Setlist ---------- */
  renderDetail() {
    const l = this.aktuelle();
    const box = document.getElementById('setlist-detail');
    box.hidden = !l;
    if (!l) return;

    document.getElementById('setlist-title').textContent = l.name;
    document.getElementById('setlist-datum').value = l.datum || '';
    document.getElementById('setlist-notiz').value = l.notiz || '';
    document.getElementById('setlist-song-count').textContent = l.eintraege.length;

    const katWahl = document.getElementById('setlist-kat');
    katWahl.innerHTML = '';
    for (const k of this.d().setlistKategorien) {
      const o = document.createElement('option');
      o.value = k; o.textContent = k;
      o.selected = k === l.kategorie;
      katWahl.appendChild(o);
    }

    const ol = document.getElementById('setlist-songs');
    ol.innerHTML = '';
    l.eintraege.forEach(eintrag => {
      const s = Band.song(eintrag.songId);
      if (!s) return;                       // Song wurde inzwischen gelöscht
      ol.appendChild(this.zeile(l, eintrag, s));
    });
    if (!l.eintraege.length) {
      ol.innerHTML = '<li class="hint">Noch keine Songs – unten auswählen.</li>';
    }
    this.fuelleSongAuswahl(l);
  },

  zeile(l, eintrag, s) {
    const li = document.createElement('li');
    li.dataset.id = eintrag.songId;

    const kopf = document.createElement('div');
    kopf.className = 'sl-kopf';

    const griff = document.createElement('span');
    griff.className = 'drag-handle';
    griff.title = 'Reihenfolge ziehen';
    griff.innerHTML = Icons.raw('grip');
    griff.addEventListener('pointerdown', ev => this.startDrag(ev, li));

    const titel = document.createElement('span');
    titel.className = 'sname';
    const extra = Band.songLine(s);
    titel.innerHTML = `<strong>${Band.esc(s.title)}</strong>` +
      (s.artist ? ` <span class="hint">– ${Band.esc(s.artist)}</span>` : '') +
      (extra ? ` <span class="hint">(${Band.esc(extra)})</span>` : '');

    const weg = document.createElement('button');
    weg.className = 'del';
    weg.innerHTML = Icons.raw('x');
    weg.title = 'Song aus dieser Setlist entfernen';
    weg.addEventListener('click', () => {
      l.eintraege = l.eintraege.filter(x => x.songId !== eintrag.songId);
      this.save();
      this.renderDetail();
    });

    kopf.append(griff, titel, weg);
    li.appendChild(kopf);

    // Anmerkung aus dem Song-Bereich – nur für diese Setlist ausblendbar
    if (s.notes && s.notes.trim() && !eintrag.eigeneAus) {
      const uebernommen = document.createElement('div');
      uebernommen.className = 'sl-songnotiz';
      const text = document.createElement('span');
      text.textContent = s.notes;
      const aus = document.createElement('button');
      aus.className = 'del klein';
      aus.innerHTML = Icons.raw('x');
      aus.title = 'Nur hier ausblenden – im Song-Bereich bleibt die Anmerkung erhalten';
      aus.addEventListener('click', () => {
        eintrag.eigeneAus = true;
        this.save();
        this.renderDetail();
      });
      uebernommen.append(text, aus);
      li.appendChild(uebernommen);
    } else if (s.notes && s.notes.trim() && eintrag.eigeneAus) {
      const zurueck = document.createElement('button');
      zurueck.className = 'small sl-wieder';
      zurueck.textContent = 'Song-Anmerkung wieder einblenden';
      zurueck.addEventListener('click', () => {
        eintrag.eigeneAus = false;
        this.save();
        this.renderDetail();
      });
      li.appendChild(zurueck);
    }

    // Eigene Anmerkung nur für diese Setlist
    const notiz = document.createElement('textarea');
    notiz.className = 'cell-input sl-notiz';
    notiz.rows = 1;
    notiz.placeholder = 'Anmerkung nur für diese Setlist …';
    notiz.value = eintrag.notiz || '';
    notiz.addEventListener('change', () => { eintrag.notiz = notiz.value; this.save(); });
    li.appendChild(notiz);

    return li;
  },

  fuelleSongAuswahl(l) {
    const sel = document.getElementById('setlist-add-song');
    sel.innerHTML = '<option value="">Song aus dem Song-Bereich hinzufügen …</option>';
    for (const s of Band.d().songs) {
      if (l.eintraege.some(x => x.songId === s.id)) continue;
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.title + (s.artist ? ' – ' + s.artist : '');
      sel.appendChild(o);
    }
    if (sel.options.length === 1) {
      sel.options[0].textContent = Band.d().songs.length
        ? 'Alle Songs sind schon in dieser Setlist'
        : 'Noch keine Songs im Song-Bereich angelegt';
    }
  },

  startDrag(e, li) {
    if (e.button > 0) return;
    e.preventDefault();
    const ol = document.getElementById('setlist-songs');
    li.classList.add('dragging');
    try { li.setPointerCapture(e.pointerId); } catch (_) { /* ältere Browser */ }
    const onMove = ev => {
      const andere = [...ol.querySelectorAll('li:not(.dragging)')];
      const danach = andere.find(x => {
        const r = x.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (danach) ol.insertBefore(li, danach); else ol.appendChild(li);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      li.classList.remove('dragging');
      const l = this.aktuelle();
      if (l) {
        const reihenfolge = [...ol.querySelectorAll('li[data-id]')].map(x => x.dataset.id);
        l.eintraege.sort((a, b) => reihenfolge.indexOf(a.songId) - reihenfolge.indexOf(b.songId));
        this.save();
      }
      this.renderDetail();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  },

  /* ---------- Drucken ---------- */
  drucken() {
    const l = this.aktuelle();
    if (!l) return;
    if (!l.eintraege.length) { alert('Diese Setlist enthält noch keine Songs.'); return; }
    const zeilen = l.eintraege.map((e, i) => {
      const s = Band.song(e.songId);
      if (!s) return null;
      const anmerkungen = [];
      if (s.notes && s.notes.trim() && !e.eigeneAus) anmerkungen.push(Band.esc(s.notes));
      if (e.notiz && e.notiz.trim()) anmerkungen.push(`<strong>${Band.esc(e.notiz)}</strong>`);
      return [
        i + 1,
        `<strong>${Band.esc(s.title)}</strong>` +
          (s.artist ? `<span class="sub">${Band.esc(s.artist)}</span>` : ''),
        Band.esc(Band.songLine(s)) || '–',
        anmerkungen.join('<span class="sub"></span>') || '',
      ];
    }).filter(Boolean);

    const tabelle = Band.printTable(
      [{ titel: 'Nr.', cls: 'num' }, { titel: 'Song' },
       { titel: 'Tonart · Capo · Tempo' }, { titel: 'Anmerkungen' }], zeilen);
    const kopfNotiz = l.notiz && l.notiz.trim()
      ? `<p class="setlist-notiz">${Band.esc(l.notiz)}</p>` : '';
    const anzahl = l.eintraege.length;
    Band.printHtml(l.name, kopfNotiz + tabelle,
      `${l.kategorie} · ${anzahl} ${anzahl === 1 ? 'Song' : 'Songs'}`,
      Band.fmt(l.datum) || undefined);
  },

  render() {
    this.renderKategorien();
    this.renderListe();
    this.renderDetail();
    Icons.hydrate(document.getElementById('bandtab-setlisten'));
  },
};

// `const` legt nichts auf window ab – band.js prüft aber darüber, ob es das Modul gibt.
window.Setlisten = Setlisten;
