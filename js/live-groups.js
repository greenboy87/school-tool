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

  init() {
    const start = document.getElementById('btn-live-start');
    if (!start) return;
    start.addEventListener('click', () => this.starte());
    document.getElementById('btn-live-ende').addEventListener('click', () => this.beende());
    document.getElementById('btn-live-uebernehmen').addEventListener('click', () => this.uebernehmen());
    document.getElementById('btn-live-beamer').addEventListener('click', () => this.beamer());
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
  starte() {
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

    const projekt = this.projektName();
    if (projekt === null) return;
    this.projektVorschlag = projekt;

    this.klasseId = cls.id;
    this.reihenfolge = cls.students.map(s => s.id);
    this.raum = this.raumCode(cls);

    const { db, ref, set, serverTimestamp } = window.FB;
    // Im Raum steht bewusst KEIN Name – nur wie viele Plätze es gibt.
    set(ref(db, `${window.FB.WURZEL}/${this.raum}/meta`), {
      projekt, anzahl: cls.students.length, erstellt: serverTimestamp(),
    }).catch(err => this.status(this.fehlertext(err, 'Der Raum konnte nicht angelegt werden'), true));

    const url = this.schuelerUrl(cls, projekt);
    this.zeigeQr(url);
    document.getElementById('live-code').textContent = this.raum;
    document.getElementById('live-gesamt').textContent = String(cls.students.length);
    document.getElementById('live-panel').hidden = false;
    document.getElementById('btn-live-start').hidden = true;
    this.status(`Sammlung läuft – Raum ${this.raum} für ${cls.name}.`);
    // Ein offenes Beamerfenster zeigte sonst weiter den QR-Code der Vorstunde
    if (this.beamerFenster && !this.beamerFenster.closed) this.beamer();
    this.lausche();
    Icons.hydrate(document.getElementById('live-panel'));
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
  schuelerUrl(cls, projekt) {
    const daten = {
      r: this.raum,
      p: projekt,
      k: cls.name || '',
      n: cls.students.map(s => Classes.studentName(s)),
    };
    const basis = location.href.replace(/[^/]*$/, '') + 'gruppen.html';
    return basis + '#' + this.nachBase64(JSON.stringify(daten));
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
      new QRCode(box, {
        text: url,
        width: groesse || 190,
        height: groesse || 190,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L,
      });
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
    this.abmelden = onValue(ref(db, `${window.FB.WURZEL}/${this.raum}/zuordnung`), snap => {
      this.zuordnung = snap.val() || {};
      this.zeichne();
    }, err => this.status(this.fehlertext(err, 'Die Gruppenliste kann nicht gelesen werden'), true));
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
    const gruppen = this.gruppenBilden();
    const drin = new Set(gruppen.flatMap(g => g.ids));

    document.getElementById('live-zahl').textContent = String(drin.size);

    // Wer fehlt noch?
    const offen = cls.students.filter(s => !drin.has(s.id));
    const offenBox = document.getElementById('live-offen');
    const zeile = document.createElement('p');
    zeile.className = 'hint';
    zeile.textContent = offen.length
      ? `Noch offen (${offen.length}): ` + offen.map(s => Classes.studentName(s)).join(', ')
      : 'Alle Schüler sind eingeteilt.';
    offenBox.replaceChildren(zeile);

    // Gruppenkarten
    const box = document.getElementById('live-gruppen');
    box.innerHTML = '';
    if (!gruppen.length) {
      box.innerHTML = '<p class="hint">Noch hat sich niemand eingetragen.</p>';
      return;
    }
    for (const g of gruppen) {
      const namen = g.ids
        .map(id => cls.students.find(s => s.id === id))
        .filter(Boolean)
        .map(s => Classes.studentName(s))
        .sort((a, b) => a.localeCompare(b, 'de'));
      const karte = document.createElement('div');
      karte.className = 'group-box';
      const h = document.createElement('h4');
      h.textContent = `${g.name} (${namen.length})`;
      const p = document.createElement('p');
      p.textContent = namen.join(', ');
      karte.append(h, p);
      box.appendChild(karte);
    }
  },

  /* ---------- Übernehmen ---------- */
  uebernehmen() {
    const cls = Classes.data.classes.find(c => c.id === this.klasseId);
    if (!cls) return;
    const gruppen = this.gruppenBilden();
    if (!gruppen.length) { alert('Es hat sich noch niemand eingetragen.'); return; }

    const drin = new Set(gruppen.flatMap(g => g.ids));
    const offen = cls.students.filter(s => !drin.has(s.id));
    if (offen.length && !confirm(
      `${offen.length} Schüler sind noch in keiner Gruppe:\n${offen.map(s => Classes.studentName(s)).join(', ')}\n\n` +
      'Trotzdem übernehmen?')) return;

    // Falls gerade eine andere Klasse offen ist, zurückschalten
    if (Classes.currentClassId !== this.klasseId) Classes.selectClass(this.klasseId);

    const p = Classes.gruppenZiel(this.projektVorschlag || 'Gruppenarbeit', new Date().toISOString().slice(0, 10));
    if (!p) return;
    p.groups.push(...gruppen.map(g => g.ids));
    p.groupNames.push(...gruppen.map(g => g.name));
    Classes.persist();
    Classes.renderProjects();
    alert(`${gruppen.length} Gruppen wurden in das Projekt „${p.name}“ übernommen.\n\n` +
      'Der Raum läuft weiter – erst „Sammlung beenden“ löscht ihn.');
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
    document.getElementById('live-panel').hidden = true;
    document.getElementById('btn-live-start').hidden = false;
    this.status('Sammlung beendet, Raum gelöscht.');
  },

  /* ---------- Großansicht für die Leinwand ---------- */
  beamer() {
    if (!this.raum) { alert('Es läuft gerade keine Sammlung.'); return; }
    const cls = Classes.data.classes.find(c => c.id === this.klasseId);
    const w = window.open('', 'gruppen-beamer', 'width=900,height=900');
    if (!w) { alert('Das Fenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.'); return; }
    this.beamerFenster = w;
    const esc = s => String(s || '').replace(/[&<>"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
      <title>Gruppen bilden</title><style>
      body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:1.2rem;background:#faf9f5;color:#1f1e1d;
        font-family:system-ui,-apple-system,"Segoe UI",sans-serif;}
      h1{font-size:2.4rem;margin:0;}
      p{font-size:1.5rem;margin:0;color:#6b6a62;text-align:center;}
      .code{font-size:2rem;font-weight:700;letter-spacing:.08em;color:#c2603f;}
      .klein{font-size:1rem;max-width:34rem;line-height:1.5;}
      #qr{background:#fff;padding:1.5rem;border-radius:1rem;box-shadow:0 2px 20px rgba(0,0,0,.12);}
      </style></head><body>
      <h1>Scannt den Code mit dem Handy</h1><div id="qr"></div>
      <p>${esc(cls ? cls.name : '')} · Raum-Code: <span class="code">${esc(this.raum)}</span></p>
      <p class="klein">Steht auf eurem Gerät ein anderer Raum-Code, habt ihr einen alten
        QR-Code erwischt – dann diesen hier noch einmal scannen.</p>
      </body></html>`);
    w.document.close();
    const skript = w.document.createElement('script');
    skript.src = new URL('js/vendor/qrcode.min.js', location.href).href;
    skript.onload = () => {
      new w.QRCode(w.document.getElementById('qr'), {
        text: this.letzteUrl, width: 460, height: 460,
        colorDark: '#000000', colorLight: '#ffffff', correctLevel: w.QRCode.CorrectLevel.L,
      });
    };
    w.document.head.appendChild(skript);
  },
};
