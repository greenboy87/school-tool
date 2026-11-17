/* Gruppenbildung per QR-Code – Lehrerseite.

   Ablauf: „Sammlung starten“ legt einen Raum an und erzeugt einen QR-Code, der die
   Klassenliste im Anker (#...) trägt. Die Schüler scannen ihn, wählen ihren Namen und
   bilden Gruppen; hier läuft die Übersicht live mit.

   Datenschutz: An Firebase gehen ausschließlich Platznummern („s7“) und Gruppennamen.
   Die Namen selbst wandern per QR-Code direkt vom Beamer auf die Handys und berühren
   keinen Server. Beim Beenden wird der Raum wieder gelöscht. */
const LiveGroups = {
  raum: null,
  klasseId: null,
  reihenfolge: [],        // Index -> Schüler-ID der Klassenliste
  zuordnung: {},
  abmelden: null,
  beamerFenster: null,
  /* Tiny Band: null im Normalbetrieb, sonst { modus: 'A'|'B', baende, song }.
     Die Einzelheiten stehen in tinyband-lehrer.js; hier nur die Weichen. */
  tiny: null,
  /* Gesetzt, wenn ein fertiges Projekt erneut zur Sammlung geöffnet wurde:
     „Übernehmen“ ersetzt dann dessen Gruppen, statt neue anzuhängen. */
  projektId: null,

  init() {
    const start = document.getElementById('btn-live-start');
    if (!start) return;
    start.addEventListener('click', () => this.starte());
    document.getElementById('btn-live-ende').addEventListener('click', () => this.beende());
    document.getElementById('btn-live-uebernehmen').addEventListener('click', () => this.uebernehmen());
    document.getElementById('btn-live-beamer').addEventListener('click', () => this.beamer());
    const weiter = document.getElementById('btn-live-fortsetzen');
    if (weiter) weiter.addEventListener('click', () => this.fortsetzen());
    // Browser zu, Tab neu geladen? Läuft die Sammlung noch, gleich anbieten
    if (window.FB && window.FB.bereit) this.nachfragen();
    else window.addEventListener('fb-bereit', () => this.nachfragen(), { once: true });
  },

  /* Erst fragen, wenn die Seite entsperrt ist – sonst läge die Frage über der Passwortabfrage */
  async nachfragen() {
    let gemerkt = null;
    try { gemerkt = JSON.parse(localStorage.getItem('live-sammlung') || 'null'); } catch (e) { return; }
    if (!gemerkt || !gemerkt.raum || this.raum) return;
    const cls = Classes.data.classes.find(c => c.id === gemerkt.klasseId);
    if (!cls) { this.vergessen(); return; }
    let meta = null;
    try {
      const { db, ref } = window.FB;
      meta = (await window.FB.get(ref(db, `${window.FB.WURZEL}/${gemerkt.raum}/meta`))).val();
    } catch (e) { return; }
    if (!meta) { this.vergessen(); return; }          // Raum gibt es nicht mehr
    if (String(meta.projekt || '').startsWith('Tiny Band')) return;
    const gesperrt = () => document.documentElement.classList.contains('locked') ||
      document.body.classList.contains('locked');
    while (gesperrt()) await new Promise(r => setTimeout(r, 700));
    if (this.raum) return;
    if (!confirm(`Die Gruppen-Sammlung für ${cls.name} (Raum ${gemerkt.raum}) läuft noch.\n\n` +
      'Jetzt fortsetzen? Die Einträge der Klasse sind alle noch da.')) return;
    if (Classes.currentClassId !== cls.id) Classes.selectClass(cls.id);
    const projekt = gemerkt.projektId && cls.projects.find(p => p.id === gemerkt.projektId);
    const reiter = document.querySelector('.subtab-btn[data-subtab="projekte"]');
    if (reiter) reiter.click();
    if (projekt) {
      Classes.currentProjectId = projekt.id;
      Classes.renderProjects();
      Classes.werkstattOeffnen();
    }
    await this.fortsetzen(gemerkt.raum);
    if (!projekt) {
      document.getElementById('gruppen-werkstatt').hidden = false;
      Classes.werkstattTitel();
    }
  },

  status(text, warnung) {
    const el = document.getElementById('live-status');
    el.textContent = text || '';
    el.classList.toggle('warnung', !!warnung);
  },

  /* Der häufigste Fehler ist die noch fehlende Freigabe in der Firebase-Konsole –
     dafür eine Meldung, die auch sagt, was zu tun ist. */
  fehlertext(err, was) {
    const code = (err && (err.code || err.message) || '').toString().toUpperCase();
    if (code.includes('PERMISSION_DENIED')) {
      return 'Die Firebase-Regeln geben den Pfad „schoolTool“ noch nicht frei. ' +
        'Anleitung: firebase-regeln.md im Projektordner.';
    }
    return `${was}: ${err && err.message ? err.message : err}`;
  },

  /* ---------- Sammlung starten ---------- */
  modus() {
    const wahl = document.getElementById('live-modus');
    return wahl ? wahl.value : 'normal';
  },

  starte(ausProjekt) {
    const cls = Classes.currentClass();
    if (!cls) { alert('Bitte zuerst links eine Klasse auswählen.'); return; }
    if (!cls.students.length) { alert('Diese Klasse hat noch keine Schüler in der Liste.'); return; }
    if (!window.FB || !window.FB.bereit) {
      this.status('Keine Verbindung zur Datenbank. Bist du online?', true);
      return;
    }
    if (typeof QRCode === 'undefined') {
      this.status('Die QR-Bibliothek wurde nicht geladen.', true);
      return;
    }

    // Tiny Band fragt nicht nach einem Projektnamen – der Song steht schon fest
    const modus = ausProjekt ? 'normal' : this.modus();
    this.tiny = modus === 'A' || modus === 'B' ? TinyBandLehrer.optionenLesen(cls, modus) : null;
    if (this.tiny === false) { this.tiny = null; return; }
    // Gruppen entstehen am Projekt: das offene ist das Ziel, sein Name steht auf den Handys
    const ziel = ausProjekt || Classes.currentProject();
    const projekt = this.tiny ? `Tiny Band – ${this.tiny.song}`.slice(0, 60)
      : ziel ? String(ziel.name || 'Gruppenarbeit').slice(0, 60) : this.projektName();
    if (projekt === null) return;
    this.projektId = ziel ? ziel.id : null;
    /* Was „Übernehmen“ ersetzen darf: bei „nochmal öffnen“ alle Gruppen des Projekts
       (sie stehen ja vorbelegt in der Sammlung), sonst nur die aus dieser Sammlung –
       vorher schon vorhandene Gruppen bleiben vorne stehen. Mehrfaches Übernehmen
       hängt so nichts doppelt an. */
    this.basis = ausProjekt || !ziel ? 0 : (ziel.groups || []).length;
    this.projektVorschlag = projekt;

    // Was die Klasse eintragen soll. Leer = „Gruppenname“; wer „Thema“ einträgt,
    // erspart der Klasse das Ausdenken von Gruppennamen.
    const feld = document.getElementById('live-bezeichnung');
    this.bezeichnung = ((feld && feld.value) || '').trim().slice(0, 30) || 'Gruppenname';

    this.klasseId = cls.id;
    this.reihenfolge = cls.students.map(s => s.id);
    this.raum = this.raumCode(cls);

    const { db, ref, set, serverTimestamp } = window.FB;
    // Im Raum steht bewusst KEIN Name – nur wie viele Plätze es gibt.
    set(ref(db, `${window.FB.WURZEL}/${this.raum}/meta`), {
      projekt, anzahl: cls.students.length, erstellt: serverTimestamp(),
      bezeichnung: this.bezeichnung,
    }).then(() => ausProjekt && this.vorbelegen(ausProjekt))
      .catch(err => this.status(this.fehlertext(err, 'Der Raum konnte nicht angelegt werden'), true));

    this.merken();
    if (ausProjekt) { const m = document.getElementById('live-modus'); if (m) m.value = 'normal'; }
    this.panelZeigen(cls, projekt);
  },

  /* ---------- Fertige Gruppen noch einmal öffnen ----------
     Startet eine Sammlung, in der jeder schon in seiner bisherigen Gruppe steht.
     Die Klasse kann wechseln, umbenennen, austreten; „Übernehmen“ ersetzt dann
     die Gruppen des Projekts. Noten hängen am Schüler und bleiben stehen. */
  neuOeffnen(p) {
    if (this.raum) {
      alert(`Es läuft schon eine Sammlung (Raum ${this.raum}). Bitte die erst übernehmen und beenden.`);
      return;
    }
    if (!confirm(`Die Gruppen von „${p.name}“ noch einmal zur Sammlung öffnen?\n\n` +
      'Alle stehen zunächst in ihrer bisherigen Gruppe und können per QR-Code wechseln. ' +
      'Mit „Gruppen übernehmen“ ersetzt du danach die Gruppen dieses Projekts.')) return;
    Classes.werkstattOeffnen();
    this.starte(p);
    const panel = document.getElementById('live-panel');
    if (panel && !panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  vorbelegen(p) {
    const aenderungen = {};
    (p.groups || []).forEach((ids, i) => {
      const name = (((p.groupNames || [])[i] || '').trim() || `Gruppe ${i + 1}`).slice(0, 40);
      for (const id of ids) {
        const idx = this.reihenfolge.indexOf(id);
        // ts = Gruppennummer, damit die Reihenfolge der Karten erhalten bleibt
        if (idx >= 0) aenderungen['s' + idx] = { gruppe: name, ts: i + 1, von: 'lehrer' };
      }
    });
    if (!Object.keys(aenderungen).length) return;
    const { db, ref, update } = window.FB;
    return update(ref(db, `${window.FB.WURZEL}/${this.raum}/zuordnung`), aenderungen);
  },

  /* ---------- Lehrkraft hängt um ----------
     Antippen eines Namens: neue Gruppe eintragen, leer = aus der Gruppe nehmen. */
  umhaengen(studentId, alteGruppe) {
    const cls = Classes.data.classes.find(c => c.id === this.klasseId);
    const s = cls && cls.students.find(x => x.id === studentId);
    const idx = this.reihenfolge.indexOf(studentId);
    if (!s || idx < 0 || !this.raum) return;
    const namen = this.gruppenBilden().map(g => g.name);
    const eingabe = prompt(`In welche Gruppe soll ${Classes.studentName(s)}?\n` +
      `Bisher: ${alteGruppe || '–'}\nVorhanden: ${namen.join(', ') || '–'}\n\n` +
      'Leer lassen = aus der Gruppe nehmen.', alteGruppe || '');
    if (eingabe === null) return;
    const name = eingabe.trim().slice(0, 40);
    const { db, ref, set, serverTimestamp } = window.FB;
    // Gleichnamige Gruppe (ohne Groß/klein) treffen, damit keine Doppelgruppe entsteht
    const treffer = namen.find(n => n.toLowerCase() === name.toLowerCase()) || name;
    set(ref(db, `${window.FB.WURZEL}/${this.raum}/zuordnung/s${idx}`),
      name ? { gruppe: treffer, ts: serverTimestamp(), von: 'lehrer' } : null)
      .catch(err => this.status(this.fehlertext(err, 'Konnte nicht gespeichert werden'), true));
  },

  /* Gemeinsamer Teil von „starten“ und „fortsetzen“ */
  async panelZeigen(cls, projekt) {
    const url = await this.schuelerUrl(cls, projekt);
    this.zeigeQr(url);
    document.getElementById('live-code').textContent = this.raum;
    document.getElementById('live-gesamt').textContent = String(cls.students.length);
    document.getElementById('live-panel').hidden = false;
    document.getElementById('btn-live-start').hidden = true;
    const weiter = document.getElementById('btn-live-fortsetzen');
    if (weiter) weiter.hidden = true;
    document.getElementById('live-modus').disabled = true;
    TinyBandLehrer.gestartet();
    this.status(`Sammlung läuft – Raum ${this.raum} für ${cls.name}.`);
    // Ein offenes Beamerfenster zeigte sonst weiter den QR-Code der Vorstunde
    if (this.beamerFenster && !this.beamerFenster.closed) this.beamer();
    this.lausche();
    Icons.hydrate(document.getElementById('live-panel'));
  },

  /* Der Raum lebt nur in diesem Tab. Lädt die Seite neu (oder stürzt der Browser
     ab), stünde die Sammlung in der Datenbank noch, aber hier wäre sie weg –
     „Übernehmen“ ginge nicht mehr. Deshalb den Raum-Code merken (keine Namen). */
  merken() {
    try { localStorage.setItem('live-sammlung', JSON.stringify({ raum: this.raum, klasseId: this.klasseId, projektId: this.projektId, basis: this.basis || 0 })); }
    catch (e) { /* ohne Speicher geht nur das Merken verloren */ }
  },

  vergessen() {
    try { localStorage.removeItem('live-sammlung'); } catch (e) { /* egal */ }
  },

  /* ---------- Laufende Sammlung fortsetzen ----------
     Alles, was der Lehrer-Tab braucht, lässt sich wiederherstellen: Projekt und
     Bezeichnung stehen in meta, die Platznummern folgen der Klassenliste. Damit
     ergibt sich sogar derselbe QR-Code wie beim Start. */
  async fortsetzen(vorgabe) {
    let gemerkt = null;
    try { gemerkt = JSON.parse(localStorage.getItem('live-sammlung') || 'null'); } catch (e) { /* egal */ }
    if (gemerkt && gemerkt.klasseId && Classes.currentClassId !== gemerkt.klasseId &&
        Classes.data.classes.some(c => c.id === gemerkt.klasseId)) {
      Classes.selectClass(gemerkt.klasseId);
    }
    const cls = Classes.currentClass();
    if (!cls) { alert('Bitte zuerst links die Klasse auswählen, deren Sammlung läuft.'); return; }
    if (!window.FB || !window.FB.bereit) {
      this.status('Keine Verbindung zur Datenbank. Bist du online?', true);
      return;
    }
    const vorschlag = gemerkt && gemerkt.klasseId === cls.id ? gemerkt.raum : '';
    const eingabe = vorgabe || prompt(`Raum-Code der laufenden Sammlung für ${cls.name}\n` +
      '(steht auf der Leinwand bzw. auf den Handys, z. B. „7b-uoso“):', vorschlag || '');
    if (eingabe === null) return;
    const raum = eingabe.trim().toLowerCase();
    if (!/^[a-z0-9]+-[a-z0-9]+$/.test(raum)) { alert('Das sieht nicht nach einem Raum-Code aus.'); return; }

    let meta;
    try {
      const { db, ref } = window.FB;
      meta = (await window.FB.get(ref(db, `${window.FB.WURZEL}/${raum}/meta`))).val();
    } catch (err) {
      this.status(this.fehlertext(err, 'Der Raum konnte nicht gelesen werden'), true);
      return;
    }
    if (!meta) { alert(`Einen Raum „${raum}“ gibt es nicht (mehr). Vielleicht wurde die Sammlung schon beendet?`); return; }
    if (String(meta.projekt || '').startsWith('Tiny Band')) {
      alert('Eine Tiny-Band-Sammlung lässt sich leider nicht fortsetzen.');
      return;
    }
    if (meta.anzahl !== cls.students.length && !confirm(
      `Der Raum wurde für ${meta.anzahl} Schüler angelegt, ${cls.name} hat jetzt ${cls.students.length}.\n` +
      'Ist das wirklich die richtige Klasse? Hat sich die Liste geändert, stimmen die Namen nicht mehr.')) return;

    this.tiny = null;
    this.klasseId = cls.id;
    this.reihenfolge = cls.students.map(s => s.id);
    this.raum = raum;
    const passt = gemerkt && gemerkt.raum === raum;
    this.projektId = passt ? gemerkt.projektId || null : null;
    this.basis = passt ? gemerkt.basis || 0 : 0;
    // Ohne Merkzettel: das offene Projekt mit gleichem Namen als Ziel nehmen
    if (!this.projektId) {
      const gleich = cls.projects.find(x => x.name === meta.projekt);
      if (gleich) { this.projektId = gleich.id; this.basis = 0; }
    }
    this.bezeichnung = String(meta.bezeichnung || 'Gruppenname').slice(0, 30);
    this.projektVorschlag = meta.projekt || 'Gruppenarbeit';
    const modus = document.getElementById('live-modus');
    if (modus) modus.value = 'normal';
    this.merken();
    await this.panelZeigen(cls, this.projektVorschlag);
  },

  projektName() {
    const offen = Classes.currentProject();
    const vorschlag = offen ? offen.name : '';
    const name = prompt('Wie heißt das Projekt? (erscheint auf den Handys)', vorschlag);
    if (name === null) return null;
    return name.trim() || 'Gruppenarbeit';
  },

  /* Kurzer, gut vorlesbarer Code: Klasse + Zufall, damit zwei Klassen sich nie überschneiden */
  raumCode(cls) {
    const stamm = (cls.name || 'klasse').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'klasse';
    return stamm + '-' + Math.random().toString(36).slice(2, 6);
  },

  /* Die Klassenliste reist im Anker mit – Anker werden nie an einen Server geschickt. */
  async schuelerUrl(cls, projekt) {
    const daten = {
      r: this.raum,
      p: projekt,
      k: cls.name || '',
      b: this.bezeichnung || 'Gruppenname',
      // Kurz („Lena F.“) hält den QR-Code grob und gut scannbar; Tiny Band braucht
      // „Nachname, Vorname“, weil die Seite dort den Vornamen herausschneidet
      n: this.tiny ? cls.students.map(s => Classes.studentName(s)) : this.kurzNamen(cls.students),
    };
    // Tiny Band: Modus, Bandzahl und Song reisen mit – in der Datenbank stehen sie nicht
    if (this.tiny) Object.assign(daten, { m: this.tiny.modus, z: this.tiny.baende, t: this.tiny.song });
    const seite = this.tiny ? 'tinyband.html' : 'gruppen.html';
    const basis = location.href.replace(/[^/]*$/, '') + seite;
    // Gepackt halbiert sich der QR-Code ungefähr; Tiny Band liest nur das alte Format
    if (!this.tiny) {
      const gepackt = await this.packen(JSON.stringify(daten));
      if (gepackt) return basis + '#z.' + gepackt;
    }
    return basis + '#' + this.nachBase64(JSON.stringify(daten));
  },

  async packen(text) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const strom = new Blob([new TextEncoder().encode(text)]).stream()
        .pipeThrough(new CompressionStream('deflate-raw'));
      const bytes = new Uint8Array(await new Response(strom).arrayBuffer());
      let bin = '';
      bytes.forEach(b => { bin += String.fromCharCode(b); });
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
      return null;
    }
  },

  /* „Lena F.“ – bei Gleichstand so viele Buchstaben des Nachnamens, bis es eindeutig ist */
  kurzNamen(schueler) {
    const lang = s => (s.first ? `${s.first} ${s.last}` : s.last || '').trim();
    const kurz = (s, n) => {
      if (!s.first || !s.last) return lang(s);
      const nach = s.last.trim();
      return n >= nach.length ? lang(s) : `${s.first.trim()} ${nach.slice(0, n)}.`;
    };
    const stufe = schueler.map(() => 1);
    for (let runde = 0; runde < 30; runde++) {
      const namen = schueler.map((s, i) => kurz(s, stufe[i]));
      const zahl = new Map();
      namen.forEach(n => zahl.set(n, (zahl.get(n) || 0) + 1));
      let doppelt = false;
      namen.forEach((n, i) => { if (zahl.get(n) > 1) { stufe[i]++; doppelt = true; } });
      if (!doppelt) return namen;
    }
    return schueler.map(lang);
  },

  /* QR-Code als SVG: runde Punkte, abgerundete Ecken-Augen, lila statt schwarz.
     Die Matrix rechnet die vorhandene Bibliothek aus, gezeichnet wird selbst. */
  qrSvg(text, farbe = '#3b0764') {
    const tmp = document.createElement('div');
    const q = new QRCode(tmp, { text, width: 64, height: 64, correctLevel: QRCode.CorrectLevel.L });
    const m = q._oQRCode;
    const n = m.getModuleCount();
    const rand = 1;
    const auge = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    let punkte = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (auge(r, c) || !m.isDark(r, c)) continue;
        punkte += `M${c + rand + 0.5 - 0.43},${r + rand + 0.5}a0.43,0.43 0 1,0 0.86,0a0.43,0.43 0 1,0 -0.86,0`;
      }
    }
    const augen = [[0, 0], [0, n - 7], [n - 7, 0]].map(([r, c]) => {
      const x = c + rand, y = r + rand;
      return `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.8" fill="none" stroke="${farbe}" stroke-width="1"/>` +
        `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9" fill="${farbe}"/>`;
    }).join('');
    const g = n + 2 * rand;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g} ${g}" shape-rendering="geometricPrecision" role="img" aria-label="QR-Code">` +
      `<rect width="${g}" height="${g}" fill="#fff"/><path d="${punkte}" fill="${farbe}"/>${augen}</svg>`;
  },

  nachBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },

  zeigeQr(url, ziel, groesse) {
    const box = ziel || document.getElementById('live-qr-code');
    box.innerHTML = '';
    this.letzteUrl = url;
    try {
      // Fehlerkorrektur bewusst niedrig: die Klassenliste braucht viel Platz im Code
      box.innerHTML = this.qrSvg(url);
      const svg = box.querySelector('svg');
      svg.style.width = svg.style.height = (groesse || 190) + 'px';
      svg.style.display = 'block';
      return true;
    } catch (e) {
      // Passiert erst jenseits von ~60 Schülern mit sehr langen Namen
      box.innerHTML = '';
      this.status('Die Klassenliste passt nicht mehr in einen QR-Code (das tritt erst bei weit ' +
        'über 60 Namen auf). Für diese Klasse bitte die Gruppen auslosen oder von Hand ' +
        'zusammenstellen.', true);
      return false;
    }
  },

  /* ---------- Live mitlesen ---------- */
  lausche() {
    const { db, ref, onValue } = window.FB;
    if (this.abmelden) this.abmelden();
    const fehler = err => this.status(this.fehlertext(err, 'Die Gruppenliste kann nicht gelesen werden'), true);
    const ab = [onValue(ref(db, `${window.FB.WURZEL}/${this.raum}/zuordnung`), snap => {
      this.zuordnung = snap.val() || {};
      this.zeichne();
    }, fehler)];
    if (this.tiny) ab.push(...TinyBandLehrer.lausche(fehler));
    this.abmelden = () => ab.forEach(f => f());
  },

  gruppenBilden() {
    const map = new Map();
    for (const [sid, z] of Object.entries(this.zuordnung)) {
      if (!z || !z.gruppe) continue;
      const idx = +String(sid).slice(1);
      const studentId = this.reihenfolge[idx];
      if (!studentId) continue;               // Klassenliste hat sich zwischenzeitlich geändert
      const key = z.gruppe.trim().toLowerCase();
      if (!key) continue;
      if (!map.has(key)) map.set(key, { name: z.gruppe.trim(), ids: [], erste: z.ts || 0 });
      const g = map.get(key);
      g.ids.push(studentId);
      if ((z.ts || 0) < g.erste) { g.erste = z.ts; g.name = z.gruppe.trim(); }
    }
    return [...map.values()].sort((a, b) => a.erste - b.erste);
  },

  zeichne() {
    const cls = Classes.data.classes.find(c => c.id === this.klasseId);
    if (!cls) return;
    if (this.tiny) { TinyBandLehrer.zeichne(cls); return; }
    const gruppen = this.gruppenBilden();
    const drin = new Set(gruppen.flatMap(g => g.ids));
    this.leinwandZeichnen(cls, gruppen, drin);

    document.getElementById('live-zahl').textContent = String(drin.size);

    // Wer fehlt noch?
    const offen = cls.students.filter(s => !drin.has(s.id));
    const offenBox = document.getElementById('live-offen');
    const zeile = document.createElement('p');
    zeile.className = 'hint';
    if (offen.length) {
      zeile.append(`Noch offen (${offen.length}): `);
      offen.forEach((s, i) => {
        const knopf = document.createElement('button');
        knopf.type = 'button';
        knopf.className = 'live-name';
        knopf.textContent = Classes.listenName(s);
        knopf.title = 'Antippen: in eine Gruppe stecken';
        knopf.addEventListener('click', () => this.umhaengen(s.id, ''));
        zeile.append(knopf);
        if (i < offen.length - 1) zeile.append(', ');
      });
    } else {
      zeile.textContent = 'Alle Schüler sind eingeteilt.';
    }
    offenBox.replaceChildren(zeile);

    // Gruppenkarten
    const box = document.getElementById('live-gruppen');
    box.innerHTML = '';
    if (!gruppen.length) {
      box.innerHTML = '<p class="hint">Noch hat sich niemand eingetragen.</p>';
      return;
    }
    for (const g of gruppen) {
      const mitglieder = g.ids
        .map(id => cls.students.find(s => s.id === id))
        .filter(Boolean)
        .map(s => ({ id: s.id, name: Classes.studentName(s) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
      const karte = document.createElement('div');
      karte.className = 'group-box';
      const h = document.createElement('h4');
      h.textContent = `${g.name} (${mitglieder.length})`;
      // Untereinander statt Kommazeile: bei fünf Namen ist eine Zeile nicht lesbar
      const liste = document.createElement('ul');
      liste.className = 'gruppen-namen';
      for (const m of mitglieder) {
        const li = document.createElement('li');
        const knopf = document.createElement('button');
        knopf.type = 'button';
        knopf.className = 'live-name';
        knopf.textContent = m.name;
        knopf.title = 'Antippen: in eine andere Gruppe stecken oder herausnehmen';
        knopf.addEventListener('click', () => this.umhaengen(m.id, g.name));
        li.appendChild(knopf);
        liste.appendChild(li);
      }
      karte.append(h, liste);
      box.appendChild(karte);
    }
  },

  /* ---------- Übernehmen ---------- */
  uebernehmen() {
    const cls = Classes.data.classes.find(c => c.id === this.klasseId);
    if (!cls) return;
    if (this.tiny) { TinyBandLehrer.uebernehmen(cls); return; }
    const gruppen = this.gruppenBilden();
    if (!gruppen.length) { alert('Es hat sich noch niemand eingetragen.'); return; }

    const drin = new Set(gruppen.flatMap(g => g.ids));
    const offen = cls.students.filter(s => !drin.has(s.id));
    if (offen.length && !confirm(
      `${offen.length} Schüler sind noch in keiner Gruppe:\n${offen.map(s => Classes.listenName(s)).join(', ')}\n\n` +
      'Trotzdem übernehmen?')) return;

    // Falls gerade eine andere Klasse offen ist, zurückschalten
    if (Classes.currentClassId !== this.klasseId) Classes.selectClass(this.klasseId);

    const alt = this.projektId && (cls.projects || []).find(x => x.id === this.projektId);
    if (alt) {
      const basis = Math.min(this.basis || 0, (alt.groups || []).length);
      alt.groups = (alt.groups || []).slice(0, basis).concat(gruppen.map(g => g.ids));
      alt.groupNames = (alt.groupNames || []).slice(0, basis).concat(gruppen.map(g => g.name));
      Classes.currentProjectId = alt.id;
      Classes.persist();
      Classes.renderProjects();
      Classes.zeigeProjektErgebnis(gruppen.length);
      this.status(`${gruppen.length === 1 ? '1 Gruppe' : gruppen.length + ' Gruppen'} in „${alt.name}“ übernommen. ` +
        'Der Raum läuft weiter – erst „Sammlung beenden“ löscht ihn.');
      return;
    }
    const p = Classes.gruppenZiel(this.projektVorschlag || 'Gruppenarbeit', new Date().toISOString().slice(0, 10));
    if (!p) return;
    p.groups.push(...gruppen.map(g => g.ids));
    p.groupNames.push(...gruppen.map(g => g.name));
    Classes.persist();
    Classes.renderProjects();
    alert((gruppen.length === 1
        ? `1 Gruppe wurde in das Projekt „${p.name}“ übernommen.`
        : `${gruppen.length} Gruppen wurden in das Projekt „${p.name}“ übernommen.`) +
      '\n\nDer Raum läuft weiter – erst „Sammlung beenden“ löscht ihn.');
  },

  /* ---------- Beenden ---------- */
  beende() {
    if (!this.raum) return;
    if (!confirm('Sammlung beenden und den Raum aus der Datenbank löschen?\n\n' +
      'Noch nicht übernommene Gruppen gehen dabei verloren.')) return;
    const { db, ref, remove } = window.FB;
    remove(ref(db, `${window.FB.WURZEL}/${this.raum}`))
      .catch(err => console.error('Raum konnte nicht geloescht werden:', err));
    if (this.abmelden) { this.abmelden(); this.abmelden = null; }
    if (this.beamerFenster && !this.beamerFenster.closed) this.beamerFenster.close();
    this.raum = null;
    this.zuordnung = {};
    this.tiny = null;
    this.projektId = null;
    TinyBandLehrer.zuruecksetzen();
    document.getElementById('live-panel').hidden = true;
    document.getElementById('btn-live-start').hidden = false;
    const weiter = document.getElementById('btn-live-fortsetzen');
    if (weiter) weiter.hidden = false;
    document.getElementById('live-modus').disabled = false;
    this.vergessen();
    this.basis = 0;
    this.status('Sammlung beendet, Raum gelöscht.');
    Classes.werkstattTitel();
  },

  /* ---------- Großansicht für die Leinwand ----------
     Links groß der QR-Code, rechts die Gruppen live. Das Fenster bekommt keine
     eigene Datenbank-Verbindung: zeichne() schreibt bei jeder Änderung hinein. */
  beamer() {
    if (!this.raum) { alert('Es läuft gerade keine Sammlung.'); return; }
    if (this.tiny) { TinyBandLehrer.beamer(); return; }
    const cls = Classes.data.classes.find(c => c.id === this.klasseId);
    const w = window.open('', 'gruppen-beamer', this.fensterMasse());
    if (!w) { alert('Das Fenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.'); return; }
    this.beamerFenster = w;
    const esc = s => String(s || '').replace(/[&<>"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // Im Stil der Seite („Polarlicht-Glas“): dunkles Violett, Milchglas-Karten
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
      <title>Gruppen bilden</title><style>
      *{box-sizing:border-box;}
      html{background:#120f26;}
      body{margin:0;min-height:100vh;color:#f7f3ff;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        background:
          radial-gradient(60vw 40vh at 6% -6%, rgba(45,212,191,.16), transparent 65%),
          radial-gradient(70vw 50vh at 92% 0%, rgba(168,85,247,.42), transparent 65%),
          radial-gradient(70vw 50vh at 50% 108%, rgba(236,72,153,.24), transparent 65%),
          #120f26;
        display:grid;grid-template-columns:minmax(0,auto) 1fr;gap:3vw;padding:3vw;}
      .links{display:flex;flex-direction:column;align-items:center;gap:1.2rem;
        position:sticky;top:3vw;align-self:start;}
      .titel{margin:0;font-size:clamp(1.2rem,2vw,2rem);font-weight:700;letter-spacing:.01em;text-align:center;
        background:linear-gradient(120deg,#c4b5fd,#f0abfc);-webkit-background-clip:text;background-clip:text;color:transparent;}
      #qr{background:#fff;padding:1.3rem;border-radius:1.6rem;line-height:0;
        box-shadow:0 0 0 1px rgba(255,255,255,.18),0 20px 60px rgba(168,85,247,.35);}
      #qr svg{display:block;width:min(36vw,66vh);height:auto;}
      .unter{display:flex;flex-wrap:wrap;justify-content:center;gap:.6rem;align-items:center;}
      .pille{padding:.45rem 1rem;border-radius:999px;background:rgba(255,255,255,.08);
        border:1px solid rgba(255,255,255,.14);font-size:clamp(1rem,1.5vw,1.5rem);color:#bdb3de;}
      .pille b{color:#f5d0fe;letter-spacing:.08em;}
      .klein{font-size:clamp(.85rem,1vw,1rem);color:#bdb3de;max-width:30rem;text-align:center;margin:0;line-height:1.45;}
      .rechts{min-width:0;display:flex;flex-direction:column;gap:1.2rem;}
      .kopf{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.5rem 1.5rem;}
      .projekt{margin:0;font-size:clamp(1.6rem,3vw,3rem);font-weight:800;line-height:1.1;}
      .zahl{font-size:clamp(1.1rem,1.8vw,1.8rem);font-weight:700;color:#bdb3de;white-space:nowrap;}
      .zahl b{font-size:1.5em;background:linear-gradient(120deg,#c4b5fd,#f0abfc);
        -webkit-background-clip:text;background-clip:text;color:transparent;}
      .balken{height:.55rem;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;}
      .balken i{display:block;height:100%;width:0;border-radius:inherit;
        background:linear-gradient(90deg,#c4b5fd,#f0abfc);transition:width .5s ease;}
      .offen{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;margin:0;}
      .offen .label{color:#bdb3de;font-size:clamp(.9rem,1.2vw,1.2rem);margin-right:.2rem;}
      .chip{padding:.3rem .75rem;border-radius:999px;font-size:clamp(.85rem,1.1vw,1.1rem);
        background:rgba(252,211,77,.12);border:1px solid rgba(252,211,77,.35);color:#fde68a;}
      .fertig{color:#5eead4;font-weight:700;font-size:clamp(1rem,1.4vw,1.4rem);}
      .gruppen{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1.1rem;align-items:start;}
      .karte{position:relative;border-radius:1.3rem;padding:1.1rem 1.3rem 1.2rem;overflow:hidden;
        background:rgba(255,255,255,.065);border:1px solid rgba(255,255,255,.12);
        box-shadow:0 10px 36px rgba(8,4,24,.45);backdrop-filter:blur(20px) saturate(140%);
        animation:rein .35s ease;}
      .karte::before{content:"";position:absolute;inset:0 0 auto 0;height:4px;
        background:linear-gradient(90deg,#c4b5fd,#f0abfc);}
      .karte h2{margin:0 0 .6rem;display:flex;align-items:flex-start;justify-content:space-between;gap:.6rem;
        font-size:clamp(1.15rem,1.6vw,1.65rem);color:#f5d0fe;overflow-wrap:anywhere;line-height:1.2;}
      .karte h2 span.n{flex:none;min-width:2em;text-align:center;padding:.1rem .5rem;border-radius:999px;
        background:linear-gradient(120deg,#c4b5fd,#f0abfc);color:#221438;font-size:.8em;}
      .karte ul{list-style:none;margin:0;padding:0;font-size:clamp(1rem,1.35vw,1.35rem);line-height:1.55;}
      .karte li{color:#f7f3ff;}
      .leer{font-size:clamp(1.1rem,1.6vw,1.6rem);color:#bdb3de;margin:2rem 0;}
      @keyframes rein{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
      @media (max-aspect-ratio:1/1){body{grid-template-columns:1fr;}.links{position:static;}#qr svg{width:min(70vw,45vh);}}
      </style></head><body>
      <div class="links">
        <p class="titel">Scannt den Code mit dem Handy</p>
        <div id="qr">${this.qrSvg(this.letzteUrl)}</div>
        <div class="unter">
          <span class="pille">${esc(cls ? cls.name : '')}</span>
          <span class="pille">Raum <b>${esc(this.raum)}</b></span>
        </div>
        <p class="klein">Steht auf eurem Gerät ein anderer Raum-Code, habt ihr einen alten
          QR-Code erwischt – dann diesen hier noch einmal scannen.</p>
      </div>
      <div class="rechts">
        <div class="kopf">
          <h1 class="projekt">${esc(this.projektVorschlag || 'Gruppen')}</h1>
          <span class="zahl" id="zahl"></span>
        </div>
        <div class="balken"><i id="balken"></i></div>
        <p class="offen" id="offen"></p>
        <div class="gruppen" id="gruppen"></div>
      </div>
      </body></html>`);
    w.document.close();
    this.vollbildKnopf(w);
    this.zeichne();
  },

  leinwandZeichnen(cls, gruppen, drin) {
    const w = this.beamerFenster;
    if (!w || w.closed || this.tiny) return;
    const d = w.document;
    const zahl = d.getElementById('zahl');
    if (!zahl) return;
    const gesamt = cls.students.length;
    zahl.innerHTML = '';
    const b = d.createElement('b');
    b.textContent = String(drin.size);
    zahl.append(b, ` / ${gesamt} eingeteilt`);
    d.getElementById('balken').style.width = gesamt ? `${Math.round(100 * drin.size / gesamt)}%` : '0';

    const offen = cls.students.filter(s => !drin.has(s.id)).map(s => Classes.listenName(s));
    const offenBox = d.getElementById('offen');
    offenBox.innerHTML = '';
    if (offen.length) {
      const label = d.createElement('span');
      label.className = 'label';
      label.textContent = `Noch offen (${offen.length}):`;
      offenBox.appendChild(label);
      for (const n of offen) {
        const chip = d.createElement('span');
        chip.className = 'chip';
        chip.textContent = n;
        offenBox.appendChild(chip);
      }
    } else {
      const ok = d.createElement('span');
      ok.className = 'fertig';
      ok.textContent = '✓ Alle sind eingeteilt';
      offenBox.appendChild(ok);
    }

    // Karten nur neu bauen, was sich geändert hat – sonst flackert die Animation bei jedem Eintrag
    const box = d.getElementById('gruppen');
    const alt = new Map([...box.querySelectorAll('.karte')].map(k => [k.dataset.sig, k]));
    box.innerHTML = '';
    if (!gruppen.length) {
      const p = d.createElement('p');
      p.className = 'leer';
      p.textContent = 'Noch hat sich niemand eingetragen.';
      box.appendChild(p);
      return;
    }
    for (const g of gruppen) {
      const namen = g.ids
        .map(id => cls.students.find(s => s.id === id))
        .filter(Boolean)
        .map(s => Classes.studentName(s))
        .sort((a, c) => a.localeCompare(c, 'de'));
      const sig = g.name + '|' + namen.join(';');
      if (alt.has(sig)) { box.appendChild(alt.get(sig)); continue; }
      const karte = d.createElement('div');
      karte.className = 'karte';
      karte.dataset.sig = sig;
      const h = d.createElement('h2');
      const t = d.createElement('span');
      t.textContent = g.name;
      const anz = d.createElement('span');
      anz.className = 'n';
      anz.textContent = String(namen.length);
      h.append(t, anz);
      const ul = d.createElement('ul');
      for (const n of namen) {
        const li = d.createElement('li');
        li.textContent = n;
        ul.appendChild(li);
      }
      karte.append(h, ul);
      box.appendChild(karte);
    }
  },

  /* So groß wie der Bildschirm, auf dem die Seite gerade liegt */
  fensterMasse() {
    const sc = window.screen;
    const l = sc.availLeft || 0, t = sc.availTop || 0;
    return `left=${l},top=${t},width=${sc.availWidth},height=${sc.availHeight}`;
  },

  /* Echtes Vollbild darf nur das Fenster selbst anfordern, und nur nach einem
     Klick darin – ein Klick im Lehrer-Tab zählt nicht. Deshalb ein großer Knopf
     im Leinwandfenster, dazu Taste F und Doppelklick. Im Vollbild verschwindet er. */
  vollbildKnopf(w) {
    const d = w.document;
    const el = d.documentElement;
    const aktiv = () => d.fullscreenElement || d.webkitFullscreenElement;
    const umschalten = () => {
      if (aktiv()) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else {
        const an = el.requestFullscreen || el.webkitRequestFullscreen;
        if (an) Promise.resolve(an.call(el)).catch(() => {});
      }
    };
    const stil = d.createElement('style');
    /* Unten rechts statt oben: Oben blendet macOS im Vollbild die Fensterleiste
       samt rotem X ein – wer dort „Vollbild aus“ sucht, schließt das Fenster. */
    stil.textContent = `#vollbild{position:fixed;bottom:1.2rem;right:1.2rem;z-index:10;padding:1rem 1.8rem;
      font:700 1.35rem -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#221438;
      background:linear-gradient(120deg,#c4b5fd,#f0abfc);border:0;border-radius:999px;cursor:pointer;
      box-shadow:0 8px 28px rgba(168,85,247,.45);}
      #vollbild:hover{filter:brightness(1.07);}
      #vollbild.an{opacity:.5;}
      #vollbild.an:hover{opacity:1;}`;
    d.head.appendChild(stil);
    const knopf = d.createElement('button');
    knopf.id = 'vollbild';
    knopf.type = 'button';
    knopf.textContent = '⛶ Vollbild';
    knopf.className = '';
    knopf.title = 'Vollbild an/aus (auch Taste F oder Doppelklick)';
    knopf.addEventListener('click', umschalten);
    d.body.appendChild(knopf);
    d.addEventListener('dblclick', umschalten);
    d.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') umschalten(); });
    // Im Vollbild bleibt der Knopf da (etwas zurückgenommen) und heißt „Vollbild beenden“
    const zeigen = () => {
      const an = !!aktiv();
      knopf.textContent = an ? '↙ Vollbild beenden' : '⛶ Vollbild';
      knopf.classList.toggle('an', an);
    };
    d.addEventListener('fullscreenchange', zeigen);
    d.addEventListener('webkitfullscreenchange', zeigen);
  },

};
