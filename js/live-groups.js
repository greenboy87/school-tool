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
    const projekt = ausProjekt ? String(ausProjekt.name || 'Gruppenarbeit').slice(0, 60)
      : this.tiny ? `Tiny Band – ${this.tiny.song}`.slice(0, 60) : this.projektName();
    if (projekt === null) return;
    this.projektId = ausProjekt ? ausProjekt.id : null;
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
    const knopf = document.querySelector('.subtab-btn[data-subtab="gruppen"]');
    if (knopf) knopf.click();
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
  panelZeigen(cls, projekt) {
    const url = this.schuelerUrl(cls, projekt);
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
    try { localStorage.setItem('live-sammlung', JSON.stringify({ raum: this.raum, klasseId: this.klasseId, projektId: this.projektId })); }
    catch (e) { /* ohne Speicher geht nur das Merken verloren */ }
  },

  vergessen() {
    try { localStorage.removeItem('live-sammlung'); } catch (e) { /* egal */ }
  },

  /* ---------- Laufende Sammlung fortsetzen ----------
     Alles, was der Lehrer-Tab braucht, lässt sich wiederherstellen: Projekt und
     Bezeichnung stehen in meta, die Platznummern folgen der Klassenliste. Damit
     ergibt sich sogar derselbe QR-Code wie beim Start. */
  async fortsetzen() {
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
    const eingabe = prompt(`Raum-Code der laufenden Sammlung für ${cls.name}\n` +
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
    this.projektId = gemerkt && gemerkt.raum === raum ? gemerkt.projektId || null : null;
    this.bezeichnung = String(meta.bezeichnung || 'Gruppenname').slice(0, 30);
    this.projektVorschlag = meta.projekt || 'Gruppenarbeit';
    const modus = document.getElementById('live-modus');
    if (modus) modus.value = 'normal';
    this.merken();
    this.panelZeigen(cls, this.projektVorschlag);
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
      b: this.bezeichnung || 'Gruppenname',
      n: cls.students.map(s => Classes.studentName(s)),
    };
    // Tiny Band: Modus, Bandzahl und Song reisen mit – in der Datenbank stehen sie nicht
    if (this.tiny) Object.assign(daten, { m: this.tiny.modus, z: this.tiny.baende, t: this.tiny.song });
    const seite = this.tiny ? 'tinyband.html' : 'gruppen.html';
    const basis = location.href.replace(/[^/]*$/, '') + seite;
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
    if (alt && confirm(`Die Gruppen von „${alt.name}“ durch diese ${gruppen.length} Gruppen ersetzen?\n\n` +
      'Noten bleiben beim Schüler stehen. Abbrechen: anderes oder neues Projekt wählen.')) {
      alt.groups = gruppen.map(g => g.ids);
      alt.groupNames = gruppen.map(g => g.name);
      Classes.persist();
      Classes.renderProjects();
      alert(`Die Gruppen von „${alt.name}“ wurden ersetzt.\n\nDer Raum läuft weiter – erst „Sammlung beenden“ löscht ihn.`);
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
    this.status('Sammlung beendet, Raum gelöscht.');
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
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
      <title>Gruppen bilden</title><style>
      *{box-sizing:border-box;}
      body{margin:0;min-height:100vh;background:#f5f2ff;color:#1e1633;
        font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
        display:grid;grid-template-columns:auto 1fr;gap:2.5vw;padding:2.5vw;}
      .links{display:flex;flex-direction:column;align-items:center;gap:1rem;position:sticky;top:2.5vw;align-self:start;}
      h1{font-size:clamp(1.4rem,2.4vw,2.4rem);margin:0;text-align:center;}
      #qr{background:#fff;padding:1.2rem;border-radius:1rem;box-shadow:0 2px 20px rgba(0,0,0,.12);line-height:0;}
      #qr img,#qr canvas{display:block;width:min(38vw,72vh);height:auto;}
      .code{font-size:clamp(1.2rem,2vw,2rem);margin:0;color:#615a7d;}
      .code b{color:#7c3aed;letter-spacing:.08em;}
      .klein{font-size:.95rem;color:#615a7d;max-width:28rem;text-align:center;margin:0;line-height:1.4;}
      .rechts{min-width:0;}
      .zahl{font-size:clamp(1.3rem,2.2vw,2.2rem);font-weight:700;margin:0 0 .3rem;}
      .zahl span{color:#7c3aed;}
      .offen{font-size:clamp(.9rem,1.2vw,1.2rem);color:#615a7d;margin:0 0 1.2rem;line-height:1.5;}
      .gruppen{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem;align-items:start;}
      .karte{background:#fff;border-radius:1rem;padding:1rem 1.2rem;box-shadow:0 2px 12px rgba(0,0,0,.08);
        border-top:6px solid #a855f7;}
      .karte h2{margin:0 0 .5rem;font-size:clamp(1.2rem,1.7vw,1.7rem);color:#6d28d9;overflow-wrap:anywhere;}
      .karte h2 small{color:#615a7d;font-weight:400;}
      .karte ul{list-style:none;margin:0;padding:0;font-size:clamp(1rem,1.4vw,1.4rem);line-height:1.5;}
      .leer{font-size:1.4rem;color:#615a7d;}
      </style></head><body>
      <div class="links">
        <h1>Scannt den Code mit dem Handy</h1>
        <div id="qr"></div>
        <p class="code">${esc(cls ? cls.name : '')} · Raum-Code: <b>${esc(this.raum)}</b></p>
        <p class="klein">Steht auf eurem Gerät ein anderer Raum-Code, habt ihr einen alten
          QR-Code erwischt – dann diesen hier noch einmal scannen.</p>
      </div>
      <div class="rechts">
        <p class="zahl" id="zahl"></p>
        <p class="offen" id="offen"></p>
        <div class="gruppen" id="gruppen"></div>
      </div>
      </body></html>`);
    w.document.close();
    const skript = w.document.createElement('script');
    skript.src = new URL('js/vendor/qrcode.min.js', location.href).href;
    skript.onload = () => {
      new w.QRCode(w.document.getElementById('qr'), {
        text: this.letzteUrl, width: 900, height: 900,
        colorDark: '#000000', colorLight: '#ffffff', correctLevel: w.QRCode.CorrectLevel.L,
      });
    };
    w.document.head.appendChild(skript);
    this.vollbildKnopf(w);
    this.zeichne();
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
    stil.textContent = `#vollbild{position:fixed;top:1rem;right:1rem;z-index:10;padding:.8rem 1.4rem;
      font:600 1.2rem system-ui,-apple-system,sans-serif;color:#fff;background:#7c3aed;border:0;
      border-radius:.8rem;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.25);}
      #vollbild:hover{background:#6d28d9;}`;
    d.head.appendChild(stil);
    const knopf = d.createElement('button');
    knopf.id = 'vollbild';
    knopf.type = 'button';
    knopf.textContent = '⛶ Vollbild';
    knopf.title = 'Vollbild an/aus (auch Taste F oder Doppelklick)';
    knopf.addEventListener('click', umschalten);
    d.body.appendChild(knopf);
    d.addEventListener('dblclick', umschalten);
    d.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') umschalten(); });
    const zeigen = () => { knopf.hidden = !!aktiv(); };
    d.addEventListener('fullscreenchange', zeigen);
    d.addEventListener('webkitfullscreenchange', zeigen);
  },

  leinwandZeichnen(cls, gruppen, drin) {
    const w = this.beamerFenster;
    if (!w || w.closed || this.tiny) return;
    const d = w.document;
    const zahl = d.getElementById('zahl');
    if (!zahl) return;
    zahl.innerHTML = '';
    const z = d.createElement('span');
    z.textContent = String(drin.size);
    zahl.append(z, ` von ${cls.students.length} sind in einer Gruppe`);

    const offen = cls.students.filter(s => !drin.has(s.id)).map(s => Classes.listenName(s));
    d.getElementById('offen').textContent = offen.length
      ? `Noch offen (${offen.length}): ${offen.join(', ')}`
      : 'Alle sind eingeteilt.';

    const box = d.getElementById('gruppen');
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
        .sort((a, b) => a.localeCompare(b, 'de'));
      const karte = d.createElement('div');
      karte.className = 'karte';
      const h = d.createElement('h2');
      h.textContent = g.name + ' ';
      const anz = d.createElement('small');
      anz.textContent = `(${namen.length})`;
      h.appendChild(anz);
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
};
