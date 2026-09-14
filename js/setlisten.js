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
  /* Mehrere Kategorien gleichzeitig: Wer die Gottesdienste und den Bunten
     Abend nebeneinander sehen will, musste bisher hin und her klicken.
     Leere Auswahl heisst „alle“ – das ist der Zustand, in dem man anfaengt. */
  gewaehlt: null,               // Set von Kategorienamen, leer = alle
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
      // Frisch angelegte Kategorie gleich zeigen – aber nur sie zusaetzlich,
      // eine bestehende Auswahl soll nicht verlorengehen
      if (this.auswahl().size) { this.auswahl().add(name); this.merkeAuswahl(); }
      this.render();
    });

    document.getElementById('form-new-setlist').addEventListener('submit', e => {
      e.preventDefault();
      const feld = document.getElementById('new-setlist-name');
      const name = feld.value.trim();
      if (!name) return;
      const kat = this.zielKategorie();
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
      // Sonst verschwaende die Setlist aus der Anzeige, sobald man sie
      // in eine gerade nicht gewaehlte Kategorie schiebt
      if (this.auswahl().size) { this.auswahl().add(e.target.value); this.merkeAuswahl(); }
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
      if (!l) return;
      const termine = this.verknuepfteTermine(l.id);
      if (!confirm(`Setlist „${l.name}“ löschen?` + (termine.length
        ? `\n\nSie ist mit ${termine.length} Termin(en) verknüpft: ` +
          `${termine.map(g => g.name).join(', ')}.\nDie Verknüpfung wird dort gelöst.` : ''))) return;
      this.loesche(l);
    });
    document.getElementById('btn-print-setlist').addEventListener('click', () => this.drucken());

    this.render();
  },

  /* Termine, die auf diese Setlist zeigen */
  verknuepfteTermine(setlistId) {
    return (Band.d().gigs || []).filter(g => g.setlistId === setlistId);
  },

  /* Beim Löschen die Verknüpfung in den Terminen lösen, damit dort kein
     Verweis ins Leere stehen bleibt. */
  loesche(l) {
    for (const g of this.verknuepfteTermine(l.id)) g.setlistId = null;
    const b = this.d();
    b.setlists = b.setlists.filter(x => x.id !== l.id);
    if (this.aktuelleId === l.id) this.aktuelleId = null;
    this.save();
    this.render();
    if (typeof Band.renderGigs === 'function') Band.renderGigs();
  },

  /* ---------- Kategorien ---------- */
  auswahl() {
    if (!this.gewaehlt) {
      let gemerkt = [];
      try { gemerkt = JSON.parse(localStorage.getItem('setlist-kategorien')) || []; }
      catch (e) { gemerkt = []; }
      this.gewaehlt = new Set(Array.isArray(gemerkt) ? gemerkt : []);
    }
    // Kategorien, die es nicht mehr gibt, fallen heraus
    const da = this.d().setlistKategorien;
    for (const k of [...this.gewaehlt]) if (!da.includes(k)) this.gewaehlt.delete(k);
    return this.gewaehlt;
  },

  merkeAuswahl() {
    try { localStorage.setItem('setlist-kategorien', JSON.stringify([...this.auswahl()])); }
    catch (e) {}
  },

  /* Was gerade angezeigt wird – leere Auswahl bedeutet alle */
  sichtbareKategorien() {
    const gew = this.auswahl();
    return gew.size ? this.d().setlistKategorien.filter(k => gew.has(k))
                    : [...this.d().setlistKategorien];
  },

  /* Wohin eine neue Setlist kommt: in die erste angezeigte Kategorie */
  zielKategorie() {
    const feld = document.getElementById('new-setlist-kat');
    if (feld && feld.value) return feld.value;
    return this.sichtbareKategorien()[0] || this.d().setlistKategorien[0] || null;
  },

  renderKategorien() {
    const b = this.d();
    const gew = this.auswahl();
    const leiste = document.getElementById('kat-leiste');
    leiste.innerHTML = '';

    // „Alle“ leert die Auswahl – das ist derselbe Zustand wie am Anfang
    const alle = document.createElement('span');
    alle.className = 'kat-chip kat-alle' + (gew.size ? '' : ' aktiv');
    const alleKnopf = document.createElement('button');
    alleKnopf.type = 'button';
    alleKnopf.className = 'kat-name';
    alleKnopf.textContent = `Alle (${b.setlists.length})`;
    alleKnopf.title = 'Alle Kategorien anzeigen';
    alleKnopf.addEventListener('click', () => {
      this.gewaehlt = new Set();
      this.merkeAuswahl();
      this.aktuelleId = null;
      this.render();
    });
    alle.appendChild(alleKnopf);
    if (b.setlistKategorien.length) leiste.appendChild(alle);

    for (const kat of b.setlistKategorien) {
      const anzahl = b.setlists.filter(s => s.kategorie === kat).length;
      const chip = document.createElement('span');
      chip.className = 'kat-chip' + (gew.has(kat) ? ' aktiv' : '');

      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'kat-name';
      knopf.textContent = `${kat} (${anzahl})`;
      knopf.title = gew.has(kat) ? 'Nicht mehr anzeigen' : 'Zusätzlich anzeigen';
      knopf.addEventListener('click', () => {
        if (gew.has(kat)) gew.delete(kat); else gew.add(kat);
        this.merkeAuswahl();
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
        // Verknüpfungen in den Terminen ebenfalls lösen
        for (const s of b.setlists.filter(s => s.kategorie === kat))
          for (const g of this.verknuepfteTermine(s.id)) g.setlistId = null;
        b.setlistKategorien = b.setlistKategorien.filter(k => k !== kat);
        b.setlists = b.setlists.filter(s => s.kategorie !== kat);
        this.auswahl().delete(kat);
        this.merkeAuswahl();
        this.aktuelleId = null;
        this.save();
        this.render();
        if (typeof Band.renderGigs === 'function') Band.renderGigs();
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
    const sichtbar = this.sichtbareKategorien();
    const gew = this.auswahl();
    document.getElementById('setlist-kat-titel').textContent =
      !gew.size ? 'Setlisten – alle Kategorien'
      : sichtbar.length === 1 ? `Setlisten – ${sichtbar[0]}`
      : `Setlisten – ${sichtbar.length} Kategorien`;

    // Zielkategorie fuer neue Setlisten waehlbar machen
    const ziel = document.getElementById('new-setlist-kat');
    if (ziel) {
      const vorher = ziel.value;
      ziel.innerHTML = '';
      for (const kat of b.setlistKategorien) {
        const o = document.createElement('option');
        o.value = kat; o.textContent = kat;
        ziel.appendChild(o);
      }
      ziel.value = b.setlistKategorien.includes(vorher) ? vorher : (sichtbar[0] || '');
      ziel.hidden = b.setlistKategorien.length < 2;
    }

    const ul = document.getElementById('setlist-list');
    ul.innerHTML = '';
    // Reihenfolge = Reihenfolge im Feld; neue stehen vorne, Pfeile verschieben
    const liste = b.setlists.filter(s => sichtbar.includes(s.kategorie));
    if (!liste.length) {
      ul.innerHTML = sichtbar.length
        ? '<li class="hint">Hier gibt es noch keine Setlist.</li>'
        : '<li class="hint">Keine Kategorie ausgewählt.</li>';
      return;
    }
    // Bei mehreren Kategorien steht an jeder Zeile, wohin sie gehoert
    const mitKategorie = sichtbar.length > 1;
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
      zahl.textContent = (mitKategorie ? l.kategorie + ' · ' : '') +
        (l.eintraege.length === 1 ? '1 Song' : `${l.eintraege.length} Songs`);

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
      /* Verschoben wird innerhalb der eigenen Kategorie – die Pfeile muessen
         also auch danach ausgrauen, nicht nach der gemischten Anzeige */
      const gleiche = b.setlists.filter(s => s.kategorie === l.kategorie);
      const posInKat = gleiche.indexOf(l);
      werkzeuge.append(
        knopf('chevronUp', 'Nach oben', () => this.verschieben(l, -1), posInKat === 0),
        knopf('chevronDown', 'Nach unten', () => this.verschieben(l, 1), posInKat === gleiche.length - 1),
        knopf('plus', 'Setlist duplizieren', () => this.duplizieren(l)));

      li.append(name, datum, zahl, werkzeuge);
      // Nochmal auf dieselbe Setlist: wieder zuklappen
      li.addEventListener('click', () => {
        this.aktuelleId = this.aktuelleId === l.id ? null : l.id;
        this.render();
      });
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
    this.druckeSetlist(l, l.name, Band.fmt(l.datum), `${l.kategorie} · ${this.anzahlText(l)}`);
  },

  /* Aus einem Termin heraus: Anlass und Termindaten stehen oben, die Setlist
     liefert nur den Inhalt. */
  druckeFuerTermin(l, g) {
    const termin = [Band.fmt(g.date), g.time, g.place].filter(Boolean).join(' · ');
    this.druckeSetlist(l, g.name, termin, `Setlist „${l.name}“ · ${this.anzahlText(l)}`);
  },

  anzahlText(l) {
    const n = l.eintraege.length;
    return `${n} ${n === 1 ? 'Song' : 'Songs'}`;
  },

  druckeSetlist(l, titel, terminZeile, untertitel) {
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
    Band.printHtml(titel, kopfNotiz + tabelle, untertitel, terminZeile || undefined);
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
