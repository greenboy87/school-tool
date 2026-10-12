/* Tiny Band – Lehrerseite der Gruppenbildung per QR-Code.

   Baut auf LiveGroups auf (Raum, QR-Code, Klassenliste im Anker, „Noch offen“)
   und ersetzt nur, was im Tiny-Band-Modus anders ist: die Live-Ansicht, das
   Bilden der Bands, das Senden des Ergebnisses, das Übernehmen ins Projekt und
   das Beamerfenster.

   Weg A „Instrument wählen“: zuordnung/sN = { erst, zweit, ts }.
     Die Lehrkraft bildet daraus mit „Bands bilden“ die Bands.
   Weg B „Band wählen“: die Klasse gründet Bands selbst.
     baende/<id> = { name, ts, mitglieder: { sN: true }, plaetze: { dr: { sN: true } } }
     zuordnung/sN = { band: <id>, inst, ts }
   Beide: ergebnis/sN = { band: <Bandname>, inst } – das zeigen die Geräte groß an.

   Wie überall gilt: In der Datenbank stehen Platznummern, Band- und
   Instrumentnamen, nie Namen von Kindern. */
const TinyBandLehrer = {
  baende: {},             // Weg B, live
  ergebnis: {},           // was zuletzt gesendet wurde, live
  einteilung: null,       // Weg A nach „Bands bilden“: { namen: [], wer: { sN: { band, inst } } }
  geaendertSeitSenden: false,
  /* Was zuletzt übernommen wurde – damit ein zweiter Klick keine Kopie anlegt.
     { signatur, ids: [Bands-Projekt, Experten-Projekt] } */
  uebernommen: null,

  init() {
    const wahl = document.getElementById('live-modus');
    if (!wahl) return;
    wahl.addEventListener('change', () => this.optionenStellen());
    const zahl = document.getElementById('tb-bandzahl');
    zahl.addEventListener('input', () => { zahl.dataset.vonHand = '1'; this.optionenStellen(); });
    document.getElementById('btn-tb-bilden').addEventListener('click', () => this.bilden());
    document.getElementById('btn-tb-senden').addEventListener('click', () => this.senden());
    this.optionenStellen();
  },

  get lg() { return LiveGroups; },
  tiny() { return LiveGroups.tiny; },

  /* ---------- Vor dem Start ---------- */

  /* Die Tiny-Band-Felder nur im Tiny-Band-Modus; die Bandzahl folgt der
     Klassenstärke, bis jemand sie von Hand ändert */
  optionenStellen() {
    const wahl = document.getElementById('live-modus');
    if (!wahl) return;
    const tiny = wahl.value !== 'normal';
    document.getElementById('tb-optionen').hidden = !tiny;
    document.getElementById('live-bezeichnung-feld').hidden = tiny;
    const cls = Classes.currentClass();
    const n = cls ? cls.students.length : 0;
    const zahl = document.getElementById('tb-bandzahl');
    if (!zahl.dataset.vonHand || zahl.dataset.klasse !== (cls && cls.id)) {
      zahl.value = String(this.vorgabe(n));
      zahl.dataset.klasse = cls ? cls.id : '';
      delete zahl.dataset.vonHand;
    }
    const b = Math.max(1, parseInt(zahl.value, 10) || 1);
    const hinweis = document.getElementById('tb-optionen-hinweis');
    if (!n) { hinweis.textContent = ''; return; }
    const klein = Math.floor(n / b), gross = Math.ceil(n / b);
    hinweis.textContent = `${n} Schüler → ${b} ${b === 1 ? 'Band' : 'Bands'} à ` +
      (klein === gross ? klein : `${klein}–${gross}`) + '.';
  },

  vorgabe(n) { return Math.max(1, Math.floor(n / TinyBand.BANDGROESSE)); },

  /* false = Abbruch (die Meldung kam schon) */
  optionenLesen(cls, modus) {
    const zahl = parseInt(document.getElementById('tb-bandzahl').value, 10);
    const baende = Number.isInteger(zahl) && zahl > 0 ? zahl : this.vorgabe(cls.students.length);
    if (baende > cls.students.length) {
      alert(`${baende} Bands bei ${cls.students.length} Schülern geht nicht auf.`);
      return false;
    }
    const song = (document.getElementById('tb-song').value || '').trim().slice(0, 40) || TinyBand.SONG;
    return { modus, baende, song };
  },

  gestartet() {
    const t = this.tiny();
    this.einteilung = null;
    this.uebernommen = null;
    this.baende = {};
    this.ergebnis = {};
    this.geaendertSeitSenden = false;
    document.getElementById('btn-tb-bilden').hidden = !(t && t.modus === 'A');
    document.getElementById('btn-tb-senden').hidden = !t;
    document.getElementById('tb-matrix').hidden = true;
    document.getElementById('tb-matrix').innerHTML = '';
  },

  zuruecksetzen() {
    this.gestartet();
    document.getElementById('live-gruppen').className = 'group-result';
    document.getElementById('btn-tb-senden').hidden = true;
    document.getElementById('btn-tb-bilden').hidden = true;
  },

  /* ---------- Mitlesen ---------- */
  lausche(fehler) {
    const { db, ref, onValue } = window.FB;
    const pfad = `${window.FB.WURZEL}/${LiveGroups.raum}`;
    return [
      onValue(ref(db, `${pfad}/baende`), snap => { this.baende = snap.val() || {}; LiveGroups.zeichne(); }, fehler),
      onValue(ref(db, `${pfad}/ergebnis`), snap => { this.ergebnis = snap.val() || {}; this.zeichneSendestand(); }, fehler),
    ];
  },

  /* sN → Schüler der Klasse. Die Reihenfolge stammt vom Start der Sammlung. */
  schueler(cls, sid) {
    const id = LiveGroups.reihenfolge[+String(sid).slice(1)];
    return id ? cls.students.find(s => s.id === id) || null : null;
  },

  name(cls, sid) {
    const s = this.schueler(cls, sid);
    return s ? Classes.studentName(s) : '';
  },

  alleSids(cls) {
    return LiveGroups.reihenfolge.map((_, i) => 's' + i).filter(sid => this.schueler(cls, sid));
  },

  nachName(cls) { return (a, b) => this.name(cls, a).localeCompare(this.name(cls, b), 'de'); },

  /* Wer schon etwas eingetragen hat – je nach Weg etwas anderes */
  istDabei(sid) {
    const z = LiveGroups.zuordnung[sid];
    if (!z) return false;
    return this.tiny().modus === 'A' ? TinyBand.gueltig(z.erst) : !!(z.band && this.baende[z.band]);
  },

  /* ---------- Zeichnen ---------- */
  zeichne(cls) {
    const t = this.tiny();
    if (!t) return;
    const alle = this.alleSids(cls);
    const dabei = alle.filter(sid => this.istDabei(sid));
    document.getElementById('live-zahl').textContent = String(dabei.length);
    const offen = alle.filter(sid => !this.istDabei(sid));
    const zeile = document.createElement('p');
    zeile.className = 'hint';
    zeile.textContent = offen.length
      ? `Noch offen (${offen.length}): ` + offen.map(sid => this.name(cls, sid)).sort((a, b) => a.localeCompare(b, 'de')).join('; ')
      : (t.modus === 'A' ? 'Alle haben ihre Instrumente gewählt.' : 'Alle sind in einer Band.');
    document.getElementById('live-offen').replaceChildren(zeile);

    const box = document.getElementById('live-gruppen');
    box.className = t.modus === 'A' ? 'tb-spalten' : 'tb-baende';
    if (t.modus === 'A') this.zeichneSpalten(cls, box, alle);
    else this.zeichneBaende(cls, box);
    if (this.einteilung) this.zeichneMatrix(cls);
    this.zeichneSendestand();
    this.beamerZeichnen(cls);
  },

  /* Weg A: eine Spalte je Instrument – Erstwahl groß, Zweitwahl klein */
  zeichneSpalten(cls, box, alle) {
    const N = this.tiny().baende;
    box.innerHTML = '';
    for (const i of TinyBand.INSTRUMENTE) {
      const erst = alle.filter(sid => (LiveGroups.zuordnung[sid] || {}).erst === i.k).sort(this.nachName(cls));
      const zweit = alle.filter(sid => (LiveGroups.zuordnung[sid] || {}).zweit === i.k).sort(this.nachName(cls));
      const spalte = document.createElement('div');
      spalte.className = 'tb-spalte';
      spalte.style.setProperty('--tb-farbe', i.farbe);
      const plaetze = i.min === i.max ? `${N * i.min}` : i.min ? `${N * i.min}–${N * i.max}` : `bis ${N * i.max}`;
      const knapp = i.min && erst.length < N * i.min;
      spalte.innerHTML =
        `<div class="tb-spalte-kopf"><span class="tb-kreis">${TinyBand.icon(i.k)}</span>` +
        `<span><strong>${Band.esc(i.name)}</strong>${TinyBand.punkte(i.anspruch)}</span></div>` +
        `<div class="tb-zaehler${knapp ? ' knapp' : ''}"><strong>${erst.length}</strong>` +
        `<small>· Zweitwahl ${zweit.length}</small></div>` +
        `<div class="hint">${i.min ? 'Pflicht' : 'freiwillig'} · Plätze ${plaetze}</div>`;
      const liste = document.createElement('ul');
      liste.className = 'gruppen-namen';
      for (const sid of erst) {
        const li = document.createElement('li');
        li.textContent = this.name(cls, sid);
        liste.appendChild(li);
      }
      for (const sid of zweit) {
        const li = document.createElement('li');
        li.className = 'zweit';
        li.textContent = this.name(cls, sid) + ' (2.)';
        liste.appendChild(li);
      }
      spalte.appendChild(liste);
      box.appendChild(spalte);
    }
  },

  /* Weg B: die Bands, wie die Klasse sie gerade baut */
  bandListe() {
    return Object.entries(this.baende)
      .filter(([, b]) => b && b.name)
      .map(([id, b]) => ({ id, name: b.name, ts: b.ts || 0, mitglieder: Object.keys(b.mitglieder || {}) }))
      .sort((a, b) => a.ts - b.ts);
  },

  instVon(sid) {
    const z = LiveGroups.zuordnung[sid] || {};
    return TinyBand.gueltig(z.inst) ? z.inst : '';
  },

  zeichneBaende(cls, box) {
    box.innerHTML = '';
    const liste = this.bandListe();
    if (!liste.length) {
      box.innerHTML = '<p class="hint">Noch hat niemand eine Band gegründet.</p>';
      return;
    }
    for (const b of liste) box.appendChild(this.bandKarte(cls, b.name, b.mitglieder, sid => this.instVon(sid)));
  },

  bandKarte(cls, name, sids, instVon) {
    const karte = document.createElement('div');
    karte.className = 'group-box tb-bandkarte';
    const besetzung = {};
    sids.forEach(sid => { const k = instVon(sid); if (k) besetzung[k] = (besetzung[k] || 0) + 1; });
    const fehlt = TinyBand.fehlt(besetzung);
    const h = document.createElement('h4');
    h.textContent = `${name} (${sids.length})`;
    karte.appendChild(h);
    const ul = document.createElement('ul');
    ul.className = 'tb-besetzung';
    for (const i of TinyBand.INSTRUMENTE) {
      const wer = sids.filter(sid => instVon(sid) === i.k);
      if (!wer.length && !i.min) continue;
      const li = document.createElement('li');
      li.style.setProperty('--tb-farbe', i.farbe);
      li.innerHTML = `<span class="tb-punkt"></span><span class="tb-inst">${Band.esc(i.name)}</span>`;
      const namen = document.createElement('span');
      // „Nachname, Vorname“ – deshalb Semikolon zwischen den Namen
      if (wer.length) namen.textContent = wer.map(sid => this.name(cls, sid)).join('; ');
      else { namen.textContent = 'fehlt'; li.classList.add('tb-fehlt'); }
      li.appendChild(namen);
      ul.appendChild(li);
    }
    const ohne = sids.filter(sid => !instVon(sid));
    if (ohne.length) {
      const li = document.createElement('li');
      li.className = 'tb-ohne';
      li.textContent = 'ohne Instrument: ' + ohne.map(sid => this.name(cls, sid)).join('; ');
      ul.appendChild(li);
    }
    karte.appendChild(ul);
    if (fehlt.length) {
      karte.classList.add('unvollstaendig');
      const w = document.createElement('p');
      w.className = 'tb-warnung';
      w.textContent = 'Es fehlt: ' + fehlt.map(i => i.name).join(', ');
      karte.appendChild(w);
    }
    return karte;
  },

  /* ---------- Weg A: Bands bilden ----------
     1. Pflichtplätze (je Band genau 1 Drums, 1 E-Bass, mind. 1 Synth) mit
        Erstwünschen besetzen – Überhang per Los –, Lücken über Zweitwünsche.
        Beim Auffüllen einer Lücke zuerst, wer seinen Erstwunsch ohnehin nicht
        bekommt (überbucht), dann wer gar nicht gewählt hat, zuletzt die übrigen
        Zweitwünsche – so verliert niemand unnötig seinen Erstwunsch.
     2. Die freiwilligen Plätze (2. Synth, Gesang bis 2, Ukulele bis 1) genauso:
        erst Erst-, dann Zweitwünsche.
     3. Wer nirgends passt (auch wer gar nicht gewählt hat), kommt zum Synth.
     Dann auf die Bands verteilen: Pflichtplätze reihum, der Rest jeweils in die
     kleinste Band, die für dieses Instrument noch Platz hat. */
  bilden() {
    const cls = Classes.data.classes.find(c => c.id === LiveGroups.klasseId);
    if (!cls) return;
    const N = this.tiny().baende;
    const alle = this.alleSids(cls);
    if (this.einteilung) {
      // Noch nicht übernommen? Dann ginge diese Einteilung beim Neubilden verloren.
      const cls0 = Classes.data.classes.find(c => c.id === LiveGroups.klasseId);
      const sicher = this.istUebernommen(cls0, this.einteilungListe(cls0));
      if (!confirm('Die Bands neu bilden?\n\n' + (sicher
        ? 'Die bisherige Einteilung ist schon als Projekt übernommen und bleibt dort erhalten.'
        : 'Die bisherige Einteilung ist noch NICHT übernommen und geht verloren – ' +
          'vorher „Gruppen übernehmen“, wenn du sie behalten willst.'))) return;
    }
    const ohneWahl = alle.filter(sid => !this.istDabei(sid));
    if (ohneWahl.length && !confirm(`${ohneWahl.length} haben noch nicht gewählt und kommen zum ` +
      `${TinyBand.name(TinyBand.AUFFANG)}, wo Platz ist:\n${ohneWahl.map(sid => this.name(cls, sid)).join('; ')}\n\nTrotzdem bilden?`)) return;

    const inst = this.verteileInstrumente(alle, N);
    const wer = this.verteileAufBaende(inst, N);
    this.einteilung = { namen: Array.from({ length: N }, (_, b) => `Band ${b + 1}`), wer };
    this.geaendertSeitSenden = true;
    document.getElementById('tb-matrix').hidden = false;
    this.zeichneMatrix(cls);
    this.zeichneSendestand();
    this.beamerZeichnen(cls);
    document.getElementById('tb-matrix').scrollIntoView({ block: 'start', behavior: 'smooth' });
  },

  misch(liste) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  /* sid → Kürzel. Eigene Methode, damit sie sich ohne Oberfläche prüfen lässt. */
  verteileInstrumente(alle, N, zuordnung = LiveGroups.zuordnung) {
    const frei = new Set(alle);
    const inst = {};
    const wunsch = (sid, stufe) => (zuordnung[sid] || {})[stufe];
    const nimm = (k, anzahl, stufe) => {
      if (anzahl <= 0) return 0;
      const wer = this.misch([...frei].filter(sid => wunsch(sid, stufe) === k)).slice(0, anzahl);
      for (const sid of wer) { inst[sid] = k; frei.delete(sid); }
      return wer.length;
    };
    // Überbucht: mehr Erstwünsche als das Instrument insgesamt Plätze hat
    const ueberbucht = new Set(TinyBand.INSTRUMENTE
      .filter(i => alle.filter(sid => wunsch(sid, 'erst') === i.k).length > N * i.max).map(i => i.k));
    const ohneWahl = sid => !TinyBand.gueltig(wunsch(sid, 'erst'));
    const fuelle = (k, anzahl) => {
      let n = 0;
      const stufen = [
        sid => wunsch(sid, 'zweit') === k && ueberbucht.has(wunsch(sid, 'erst')),
        ohneWahl,
        sid => wunsch(sid, 'zweit') === k,
      ];
      for (const passt of stufen) {
        const wer = this.misch([...frei].filter(passt)).slice(0, anzahl - n);
        for (const sid of wer) { inst[sid] = k; frei.delete(sid); }
        n += wer.length;
      }
      return n;
    };
    const pflicht = TinyBand.pflicht().map(i => ({ k: i.k, platz: N * i.min, n: 0 }));
    for (const p of pflicht) p.n = nimm(p.k, p.platz, 'erst');
    for (const p of pflicht) p.n += fuelle(p.k, p.platz - p.n);
    const extra = TinyBand.INSTRUMENTE.map(i => ({ k: i.k, platz: N * (i.max - i.min), n: 0 })).filter(e => e.platz > 0);
    for (const e of extra) e.n = nimm(e.k, e.platz, 'erst');
    for (const e of extra) e.n += nimm(e.k, e.platz - e.n, 'zweit');
    for (const sid of frei) inst[sid] = TinyBand.AUFFANG;
    return inst;
  },

  verteileAufBaende(inst, N) {
    const baende = Array.from({ length: N }, () => ({ n: 0, je: {} }));
    const wer = {};
    const setze = (sid, b) => {
      wer[sid] = { band: b, inst: inst[sid] };
      baende[b].n++;
      baende[b].je[inst[sid]] = (baende[b].je[inst[sid]] || 0) + 1;
    };
    const rest = [];
    for (const i of TinyBand.INSTRUMENTE) {
      const liste = this.misch(Object.keys(inst).filter(sid => inst[sid] === i.k));
      // Pflicht: reihum, jede Band bekommt ihr Minimum
      for (let r = 0; r < i.min; r++) {
        for (let b = 0; b < N && liste.length; b++) setze(liste.shift(), b);
      }
      rest.push(...liste.map(sid => ({ sid, i })));
    }
    // Knappe Instrumente zuerst, damit sie nicht an vollen Bands scheitern
    rest.sort((a, b) => (a.i.max - a.i.min) - (b.i.max - b.i.min));
    for (const { sid, i } of rest) {
      const mitPlatz = baende.map((x, b) => b).filter(b => (baende[b].je[i.k] || 0) < i.max);
      const kandidaten = mitPlatz.length ? mitPlatz : baende.map((x, b) => b);
      const kleinste = Math.min(...kandidaten.map(b => baende[b].n));
      const wahl = this.misch(kandidaten.filter(b => baende[b].n === kleinste))[0];
      setze(sid, wahl);
    }
    return wer;
  },

  /* ---------- Matrix Band × Instrument (Weg A, nach dem Bilden) ----------
     Nachbearbeiten wie bei den Projekt-Gruppen: die Zahl hinter dem Namen hängt
     in eine andere Band um, „—“ nimmt heraus; dazu ein Feld fürs Instrument. */
  zeichneMatrix(cls) {
    const box = document.getElementById('tb-matrix');
    const e = this.einteilung;
    if (!e) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '';
    const kopf = document.createElement('div');
    kopf.className = 'tb-matrix-kopf';
    kopf.innerHTML = '<h3>Bands</h3><span class="hint">Zahl hinter dem Namen hängt in eine andere Band um, ' +
      '„—“ nimmt heraus, das zweite Feld wechselt das Instrument. Bandnamen sind änderbar.</span>';
    box.appendChild(kopf);

    const tabelle = document.createElement('table');
    tabelle.className = 'tb-tabelle';
    const thead = document.createElement('tr');
    thead.innerHTML = '<th>Band</th>' + TinyBand.INSTRUMENTE.map(i =>
      `<th style="--tb-farbe:${i.farbe}"><span class="tb-kreis klein">${TinyBand.icon(i.k)}</span>${Band.esc(i.name)}</th>`).join('');
    tabelle.appendChild(thead);

    const zeile = (b) => {
      const tr = document.createElement('tr');
      const sids = Object.keys(e.wer).filter(sid => e.wer[sid].band === b).sort(this.nachName(cls));
      const th = document.createElement('th');
      if (b === null) {
        th.textContent = 'Ohne Band';
      } else {
        const feld = document.createElement('input');
        feld.type = 'text';
        feld.className = 'cell-input gruppen-name';
        feld.maxLength = 40;
        feld.value = e.namen[b];
        feld.addEventListener('change', () => {
          e.namen[b] = feld.value.trim().slice(0, 40) || `Band ${b + 1}`;
          this.geaendertSeitSenden = true;
          this.zeichneMatrix(cls);
          this.zeichneSendestand();
          this.beamerZeichnen(cls);
        });
        th.appendChild(feld);
        const besetzung = {};
        sids.forEach(sid => { besetzung[e.wer[sid].inst] = (besetzung[e.wer[sid].inst] || 0) + 1; });
        const fehlt = TinyBand.fehlt(besetzung);
        const info = document.createElement('div');
        info.className = fehlt.length ? 'tb-warnung' : 'hint';
        info.textContent = fehlt.length ? 'Es fehlt: ' + fehlt.map(i => i.name).join(', ') : `${sids.length} Mitglieder`;
        th.appendChild(info);
        if (fehlt.length) tr.classList.add('unvollstaendig');
      }
      tr.appendChild(th);
      for (const i of TinyBand.INSTRUMENTE) {
        const td = document.createElement('td');
        if (b !== null) {
          const anzahl = sids.filter(sid => e.wer[sid].inst === i.k).length;
          if (anzahl < i.min) td.classList.add('tb-fehlt');
          if (anzahl > i.max) td.classList.add('tb-zuviel');
        }
        for (const sid of sids.filter(sid => e.wer[sid].inst === i.k)) td.appendChild(this.matrixEintrag(cls, sid));
        tr.appendChild(td);
      }
      return tr;
    };
    e.namen.forEach((_, b) => tabelle.appendChild(zeile(b)));
    if (Object.values(e.wer).some(w => w.band === null)) tabelle.appendChild(zeile(null));
    box.appendChild(tabelle);

    // Wer seit dem Bilden neu gewählt hat oder neu in der Klasse ist
    const fehlend = this.alleSids(cls).filter(sid => !e.wer[sid]);
    if (fehlend.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.append(`Nicht eingeteilt (${fehlend.length}): `);
      fehlend.forEach(sid => p.appendChild(this.matrixEintrag(cls, sid)));
      box.appendChild(p);
    }
  },

  matrixEintrag(cls, sid) {
    const e = this.einteilung;
    const w = e.wer[sid] || { band: null, inst: '' };
    const span = document.createElement('span');
    span.className = 'tb-eintrag';
    const name = document.createElement('span');
    name.textContent = this.name(cls, sid);
    const z = LiveGroups.zuordnung[sid] || {};
    // Woher das Instrument kommt, sieht man am Zeichen: ① Erstwunsch, ② Zweitwunsch
    if (w.inst && z.erst === w.inst) name.title = 'Erstwunsch';
    else if (w.inst && z.zweit === w.inst) name.title = 'Zweitwunsch';
    else name.title = 'kein Wunsch – eingeteilt';
    const marke = w.inst && z.erst === w.inst ? ' ①' : w.inst && z.zweit === w.inst ? ' ②' : '';
    name.textContent += marke;

    const band = document.createElement('select');
    band.className = 'small-select';
    band.title = `${name.textContent} in eine andere Band`;
    e.namen.forEach((_, b) => band.add(new Option(String(b + 1), String(b))));
    band.add(new Option('—', ''));
    band.value = w.band === null ? '' : String(w.band);

    const inst = document.createElement('select');
    inst.className = 'small-select';
    inst.title = 'Instrument';
    TinyBand.INSTRUMENTE.forEach(i => inst.add(new Option(i.name, i.k)));
    inst.value = w.inst || TinyBand.AUFFANG;

    const aendern = () => {
      e.wer[sid] = { band: band.value === '' ? null : +band.value, inst: inst.value };
      this.geaendertSeitSenden = true;
      this.zeichneMatrix(cls);
      this.zeichneSendestand();
      this.beamerZeichnen(cls);
    };
    band.addEventListener('change', aendern);
    inst.addEventListener('change', aendern);
    span.append(name, band, inst);
    return span;
  },

  /* ---------- Einteilung als Liste – für Senden und Übernehmen ---------- */
  einteilungListe(cls) {
    const t = this.tiny();
    if (t.modus === 'A') {
      if (!this.einteilung) return null;
      return Object.entries(this.einteilung.wer)
        .filter(([sid, w]) => w.band !== null && this.schueler(cls, sid))
        .map(([sid, w]) => ({ sid, band: w.band, bandName: this.einteilung.namen[w.band], inst: w.inst }));
    }
    const baende = this.bandListe();
    const liste = [];
    baende.forEach((b, idx) => {
      for (const sid of b.mitglieder) {
        if (!this.schueler(cls, sid)) continue;
        liste.push({ sid, band: idx, bandName: b.name, inst: this.instVon(sid) });
      }
    });
    return liste;
  },

  bandZahl(liste) {
    return this.tiny().modus === 'A' ? this.einteilung.namen.length : this.bandListe().length;
  },

  /* Bands, denen ein Pflichtinstrument fehlt – als lesbare Zeilen */
  luecken(liste) {
    const raus = [];
    const namen = [...new Set(liste.map(x => x.bandName))];
    if (this.tiny().modus === 'A') this.einteilung.namen.forEach(n => { if (!namen.includes(n)) namen.push(n); });
    for (const n of namen) {
      const besetzung = {};
      liste.filter(x => x.bandName === n && x.inst).forEach(x => { besetzung[x.inst] = (besetzung[x.inst] || 0) + 1; });
      const fehlt = TinyBand.fehlt(besetzung);
      if (fehlt.length) raus.push(`${n}: ${fehlt.map(i => i.name).join(', ')}`);
    }
    return raus;
  },

  /* ---------- Ergebnis an die Klasse senden ---------- */
  senden() {
    const cls = Classes.data.classes.find(c => c.id === LiveGroups.klasseId);
    if (!cls) return;
    const liste = this.einteilungListe(cls);
    if (!liste) { alert('Erst „Bands bilden“ – dann gibt es ein Ergebnis zum Senden.'); return; }
    if (!liste.length) { alert('Es ist noch niemand in einer Band.'); return; }
    const luecken = this.luecken(liste);
    const ohneInst = liste.filter(x => !x.inst);
    let frage = '';
    if (luecken.length) frage += `Einer Band fehlt ein Pflichtinstrument:\n${luecken.join('\n')}\n\n`;
    if (ohneInst.length) frage += `${ohneInst.length} haben noch kein Instrument: ` +
      ohneInst.map(x => this.name(cls, x.sid)).join('; ') + '\n\n';
    if (Object.keys(this.ergebnis).length) frage += 'Das zuletzt gesendete Ergebnis wird ersetzt.\n\n';
    if (frage && !confirm(frage + 'Trotzdem an die Klasse senden?')) return;

    const daten = {};
    for (const x of liste) {
      daten[x.sid] = x.inst ? { band: x.bandName.slice(0, 40), inst: x.inst } : { band: x.bandName.slice(0, 40) };
    }
    const { db, ref, set } = window.FB;
    set(ref(db, `${window.FB.WURZEL}/${LiveGroups.raum}/ergebnis`), daten)
      .then(() => {
        this.geaendertSeitSenden = false;
        LiveGroups.status(`Ergebnis gesendet – für ${liste.length} Schüler.`);
        this.zeichneSendestand();
      })
      .catch(err => LiveGroups.status(LiveGroups.fehlertext(err, 'Das Ergebnis konnte nicht gesendet werden'), true));
  },

  zeichneSendestand() {
    const knopf = document.getElementById('btn-tb-senden');
    if (!knopf || !this.tiny()) return;
    const gesendet = Object.keys(this.ergebnis).length > 0;
    knopf.classList.toggle('primary', !gesendet || this.geaendertSeitSenden);
    knopf.lastChild.textContent = gesendet
      ? (this.geaendertSeitSenden ? 'Geändertes Ergebnis senden' : 'Ergebnis ist gesendet ✓')
      : 'Ergebnis an die Klasse senden';
  },

  /* ---------- Übernehmen: zwei Projekte ---------- */

  /* Fingerabdruck einer Einteilung: wer in welcher Band mit welchem Instrument */
  signatur(liste) {
    return JSON.stringify((liste || []).map(x => [x.sid, x.bandName, x.inst || '']).sort());
  },

  /* Steht genau diese Einteilung schon als Projekt da (und wurde nicht gelöscht)? */
  istUebernommen(cls, liste) {
    const u = this.uebernommen;
    if (!u || !cls || !liste) return false;
    return u.signatur === this.signatur(liste) && u.ids.every(id => cls.projects.some(p => p.id === id));
  },

  uebernehmen(cls) {
    const liste = this.einteilungListe(cls);
    if (!liste) { alert('Erst „Bands bilden“ – dann gibt es etwas zu übernehmen.'); return; }
    if (!liste.length) { alert('Es ist noch niemand in einer Band.'); return; }
    const drin = new Set(liste.map(x => x.sid));
    const draussen = this.alleSids(cls).filter(sid => !drin.has(sid));
    if (draussen.length && !confirm(`${draussen.length} sind in keiner Band:\n` +
      draussen.map(sid => this.name(cls, sid)).join('; ') + '\n\nTrotzdem übernehmen?')) return;

    if (this.istUebernommen(cls, liste)) {
      alert('Genau diese Einteilung ist schon übernommen – siehe „' +
        cls.projects.find(p => p.id === this.uebernommen.ids[0]).name + '“.\n\n' +
        'Für eine zweite Variante erst „Bands bilden“ (oder in der Matrix ändern), dann übernehmen.');
      return;
    }

    if (Classes.currentClassId !== cls.id) Classes.selectClass(cls.id);
    const heute = new Date().toISOString().slice(0, 10);
    // Zweiter Durchgang am selben Projekt: Nummer dran, sonst sind die Einträge
    // in der Projektliste nicht zu unterscheiden
    const schon = cls.projects.filter(p => /^Tiny Band – Bands( \(\d+\))?$/.test(p.name)).length;
    const nr = schon ? ` (${schon + 1})` : '';
    const id = sid => this.schueler(cls, sid).id;
    const reihenfolge = k => { const n = TinyBand.kuerzel().indexOf(k); return n < 0 ? 99 : n; };

    // Projekt 1: die Bands, das Instrument steht am Namen
    const baende = new Map();
    for (const x of liste) {
      if (!baende.has(x.band)) baende.set(x.band, { name: x.bandName, ids: [] });
      baende.get(x.band).ids.push(x);
    }
    const sortiert = [...baende.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    const pBands = {
      id: Store.uid(), name: 'Tiny Band – Bands' + nr, date: heute, entered: false, grades: {},
      groups: sortiert.map(b => b.ids.sort((a, c) => reihenfolge(a.inst) - reihenfolge(c.inst)).map(x => id(x.sid))),
      groupNames: sortiert.map(b => b.name),
      rollen: Object.fromEntries(liste.filter(x => x.inst).map(x => [id(x.sid), TinyBand.name(x.inst)])),
    };
    // Projekt 2: die Expertengruppen, die Band steht am Namen
    const experten = TinyBand.INSTRUMENTE
      .map(i => ({ i, wer: liste.filter(x => x.inst === i.k) }))
      .filter(g => g.wer.length);
    const pExperten = {
      id: Store.uid(), name: 'Tiny Band – Expertengruppen' + nr, date: heute, entered: false, grades: {},
      groups: experten.map(g => g.wer.map(x => id(x.sid))),
      groupNames: experten.map(g => g.i.name),
      rollen: Object.fromEntries(liste.map(x => [id(x.sid), x.bandName])),
    };
    cls.projects.push(pBands, pExperten);
    this.uebernommen = { signatur: this.signatur(liste), ids: [pBands.id, pExperten.id] };
    Classes.currentProjectId = pBands.id;
    Classes.persist();
    Classes.renderProjects();
    alert(`Angelegt: „${pBands.name}“ (${pBands.groups.length} Bands) und „${pExperten.name}“ ` +
      `(${pExperten.groups.length} Gruppen).\n\nDer Raum läuft weiter – erst „Sammlung beenden“ löscht ihn.`);
  },

  /* ---------- Beamer ---------- */
  beamer() {
    const cls = Classes.data.classes.find(c => c.id === LiveGroups.klasseId);
    const t = this.tiny();
    const w = window.open('', 'gruppen-beamer', 'width=1280,height=800');
    if (!w) { alert('Das Fenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.'); return; }
    LiveGroups.beamerFenster = w;
    const esc = Band.esc;
    const css = new URL('tinyband.css?v=' + this.version(), location.href).href;
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
      <title>Tiny Band – ${esc(t.song)}</title><link rel="stylesheet" href="${css}"></head>
      <body class="tb-seite tb-beamer">
      <div class="tb-sterne" aria-hidden="true"></div>
      <div class="tb-stadt" aria-hidden="true">${TinyBand.skyline()}</div>
      <header class="tb-kopf"><div class="tb-label">Tiny Band · ${esc(t.song)}</div></header>
      <main class="tb-beamer-haupt">
        <section class="tb-beamer-qr">
          <div id="qr" class="tb-qr"></div>
          <p class="tb-raum">${esc(cls ? cls.name : '')} · Raum <strong>${esc(LiveGroups.raum)}</strong></p>
          <p class="tb-neben">${t.modus === 'A' ? 'Scannen, Namen antippen, zwei Instrumente wählen.'
            : 'Scannen, Namen antippen, Band gründen oder beitreten, Instrument wählen.'}</p>
        </section>
        <section id="tb-beamer-live" class="tb-beamer-live"></section>
      </main></body></html>`);
    w.document.close();
    const skript = w.document.createElement('script');
    skript.src = new URL('js/vendor/qrcode.min.js', location.href).href;
    skript.onload = () => {
      new w.QRCode(w.document.getElementById('qr'), {
        text: LiveGroups.letzteUrl, width: 400, height: 400,
        colorDark: '#000000', colorLight: '#ffffff', correctLevel: w.QRCode.CorrectLevel.L,
      });
    };
    w.document.head.appendChild(skript);
    if (cls) this.beamerZeichnen(cls);
  },

  version() {
    const s = document.querySelector('script[src*="tinyband-lehrer.js"]');
    const m = s && /v=(\d+)/.exec(s.src);
    return m ? m[1] : '0';
  },

  /* Live-Matrix im Beamerfenster. Weg A zeigt nur Zahlen (wer was gewählt hat,
     geht die Klasse nichts an), Weg B die Bands mit ihrer Besetzung – die sehen
     die Kinder auf ihren Geräten ohnehin. Nach „Bands bilden“ die Bands. */
  beamerZeichnen(cls) {
    const w = LiveGroups.beamerFenster;
    if (!w || w.closed || !this.tiny()) return;
    const box = w.document.getElementById('tb-beamer-live');
    if (!box) return;
    const esc = Band.esc;
    const t = this.tiny();
    const alle = this.alleSids(cls);
    let html = '';
    if (t.modus === 'A' && !this.einteilung) {
      const N = t.baende;
      html = '<div class="tb-label">Erstwahl</div><div class="tb-beamer-spalten">' + TinyBand.INSTRUMENTE.map(i => {
        const n = alle.filter(sid => (LiveGroups.zuordnung[sid] || {}).erst === i.k).length;
        const plaetze = i.min === i.max ? `${N * i.min}` : i.min ? `${N * i.min}–${N * i.max}` : `bis ${N * i.max}`;
        return `<div class="tb-karte tb-beamer-inst" style="--tb-farbe:${i.farbe}">
          <span class="tb-kreis">${TinyBand.icon(i.k)}</span>
          <div class="tb-inst-name">${esc(i.name)}</div>
          <div class="tb-gross">${n}</div><div class="tb-neben">Plätze ${plaetze}</div></div>`;
      }).join('') + '</div>';
      const dabei = alle.filter(sid => this.istDabei(sid)).length;
      html += `<p class="tb-neben tb-stand">${dabei} von ${alle.length} haben gewählt</p>`;
    } else {
      const liste = this.einteilungListe(cls) || [];
      const gruppen = new Map();
      if (t.modus === 'A') this.einteilung.namen.forEach((n, b) => gruppen.set(b, { name: n, x: [] }));
      else this.bandListe().forEach((b, idx) => gruppen.set(idx, { name: b.name, x: [] }));
      liste.forEach(x => gruppen.get(x.band) && gruppen.get(x.band).x.push(x));
      html = '<div class="tb-beamer-baende">' + [...gruppen.values()].map(g => {
        const besetzung = {};
        g.x.forEach(x => { if (x.inst) besetzung[x.inst] = (besetzung[x.inst] || 0) + 1; });
        const fehlt = TinyBand.fehlt(besetzung);
        const zeilen = TinyBand.INSTRUMENTE.map(i => {
          const wer = g.x.filter(x => x.inst === i.k).map(x => esc(this.vorname(cls, x.sid)));
          if (!wer.length && !i.min) return '';
          return `<li style="--tb-farbe:${i.farbe}" class="${wer.length ? '' : 'tb-fehlt'}">
            <span class="tb-kreis klein">${TinyBand.icon(i.k)}</span>${wer.length ? wer.join(', ') : 'fehlt noch'}</li>`;
        }).join('');
        const ohne = g.x.filter(x => !x.inst).map(x => esc(this.vorname(cls, x.sid)));
        const offen = ohne.length ? `<li class="tb-ohne">wählen noch: ${ohne.join(', ')}</li>` : '';
        return `<div class="tb-karte${fehlt.length ? ' unvollstaendig' : ''}"><div class="tb-bandname">${esc(g.name)}</div>
          <ul class="tb-besetzung">${zeilen}${offen}</ul></div>`;
      }).join('') + '</div>';
      if (!gruppen.size) html = '<p class="tb-neben">Noch hat niemand eine Band gegründet.</p>';
    }
    box.innerHTML = html;
  },

  /* Auf der Leinwand reicht der Vorname – „Nachname, Vorname“ ist dort zu lang */
  vorname(cls, sid) {
    const s = this.schueler(cls, sid);
    return s ? (s.first || s.last) : '';
  },
};

