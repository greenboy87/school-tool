/* Exen – digitale Stegreifaufgaben auf iPads (Format tom-ex/2, siehe
   docs/ex/ex-format.md).

   Das School-Tool ist nur der Rahmen: Jede Ex ist eine eigene HTML-Datei mit
   eigener Oberfläche. Hier liegen Bibliothek, Start, Dashboard und Auswertung.

   Datenschutz wie überall: In der Datenbank stehen Nummern, nie Namen. Lösungen
   und Bewertungscode liegen in einem eigenen Ast, den nur die Lehrkraft lesen
   darf – und erreichen nie ein Schülergerät. */
const Exen = {
  WURZEL: 'schoolTool',
  /* Ein Wert in der Realtime Database darf höchstens 10 MB groß sein – die
     Schülerfassung wird deshalb in Stücke dieser Länge zerlegt */
  STUECK: 1000000,

  index: {},              // exindex live: { exId: info }
  abmeldenIndex: null,

  init() {
    if (!document.getElementById('tab-exen')) return;
    this.bibliothekVerdrahten();
    document.getElementById('btn-ex-anmelden').addEventListener('click', () => this.anmelden());
    document.getElementById('btn-ex-abmelden').addEventListener('click', () => this.abmelden());
    document.getElementById('btn-ex-uid').addEventListener('click', () => this.uidKopieren());
    if (window.FB) this.verbinden();
    else window.addEventListener('fb-bereit', () => this.verbinden(), { once: true });
  },

  verbinden() {
    if (!FB.bereit) { this.anmeldungZeigen(null, 'Keine Verbindung zur Datenbank: ' + FB.fehler); return; }
    FB.beiAnmeldung(u => this.anmeldungZeigen(u));
  },

  /* ---------- Lehrer-Anmeldung ---------- */
  anmeldungZeigen(u, fehler) {
    const status = document.getElementById('ex-anmeldung-status');
    const lehrer = !!(u && !u.isAnonymous);
    document.getElementById('btn-ex-anmelden').hidden = lehrer || !!fehler;
    document.getElementById('btn-ex-abmelden').hidden = !lehrer;
    document.getElementById('btn-ex-uid').hidden = !lehrer || FB.istLehrer();
    status.classList.toggle('warnung', !!fehler || (lehrer && !FB.istLehrer()));
    if (fehler) status.textContent = fehler;
    else if (!lehrer) status.textContent = 'Nicht angemeldet.';
    else if (FB.istLehrer()) status.textContent = `Angemeldet als ${u.email || u.displayName}.`;
    else if (!window.LEHRER_UID) {
      status.textContent = `Angemeldet als ${u.email || u.displayName}. Noch nicht eingerichtet: ` +
        `Kennung kopieren und in firebase-config.js (LEHRER_UID) und die Datenbank-Regeln eintragen.`;
    } else {
      status.textContent = `${u.email || u.displayName} ist nicht das eingetragene Lehrerkonto. ` +
        'Bitte abmelden und mit dem richtigen Google-Konto anmelden.';
    }
    document.dispatchEvent(new CustomEvent('ex-anmeldung', { detail: { lehrer: FB.istLehrer() } }));
    this.bibliothekSchalten(FB.istLehrer());
  },

  async anmelden() {
    try {
      await FB.mitGoogleAnmelden();
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      alert('Anmeldung fehlgeschlagen: ' + this.authFehler(e));
    }
  },

  async abmelden() {
    if (!confirm('Auf diesem Gerät abmelden? Laufende Exen lassen sich dann hier nicht mehr steuern.')) return;
    await FB.abmelden();
  },

  async uidKopieren() {
    const u = FB.nutzer();
    if (!u) return;
    try {
      await navigator.clipboard.writeText(u.uid);
      alert('Kennung kopiert:\n\n' + u.uid);
    } catch (e) {
      prompt('Kennung zum Kopieren:', u.uid);
    }
  },

  authFehler(e) {
    const texte = {
      'auth/operation-not-allowed': 'Google-Anmeldung ist in der Firebase-Konsole noch nicht eingeschaltet (siehe firebase-regeln.md).',
      'auth/unauthorized-domain': 'Diese Adresse ist in der Firebase-Konsole nicht als autorisierte Domain eingetragen.',
      'auth/popup-blocked': 'Der Browser hat das Anmeldefenster blockiert. Pop-ups für diese Seite erlauben.',
      'auth/network-request-failed': 'Keine Internetverbindung.',
    };
    return texte[e.code] || e.message || String(e);
  },

  /* ---------- Bibliothek ---------- */
  pfad(rest) { return `${this.WURZEL}/${rest}`; },

  bibliothekVerdrahten() {
    const eingabe = document.getElementById('ex-datei');
    document.getElementById('btn-ex-datei').addEventListener('click', () => eingabe.click());
    eingabe.addEventListener('change', () => {
      const f = eingabe.files[0];
      eingabe.value = '';
      if (f) this.importieren(f);
    });
    document.addEventListener('ex-sitzungen', () => { if (FB.istLehrer && FB.istLehrer()) this.listeZeichnen(); });
    const neu = document.getElementById('btn-ex-neu-laden');
    if (neu) neu.addEventListener('click', () => eingabe.click());
    Classes.makeDropZone(document.getElementById('ex-schnellwahl'),
      f => /\.html?$/i.test(f.name) || f.type === 'text/html',
      'eine Ex-Datei (.html, Format tom-ex/2)',
      f => this.importieren(f));
    Classes.makeDropZone(document.getElementById('ex-bibliothek'),
      f => /\.html?$/i.test(f.name) || f.type === 'text/html',
      'eine Ex-Datei (.html, Format tom-ex/2)',
      f => this.importieren(f));
    document.getElementById('ex-liste').addEventListener('click', e => {
      const b = e.target.closest('button[data-aktion]');
      if (!b) return;
      const id = b.closest('li').dataset.id;
      if (b.dataset.aktion === 'vorschau') this.vorschau(id);
      else if (b.dataset.aktion === 'loeschen') this.loeschen(id);
    });
  },

  bibliothekSchalten(an) {
    document.getElementById('ex-bibliothek').hidden = !an;
    if (this.abmeldenIndex) { this.abmeldenIndex(); this.abmeldenIndex = null; }
    if (!an) { this.index = {}; return; }
    this.abmeldenIndex = FB.onValue(FB.ref(FB.db, this.pfad('exindex')), snap => {
      this.index = snap.val() || {};
      this.listeZeichnen();
      document.dispatchEvent(new CustomEvent('ex-index'));
    }, e => {
      // Nach einer Ablehnung beendet Firebase die Live-Abfrage – merken, damit
      // der nächste gelungene Import sie neu startet
      this.abmeldenIndex = null;
      this.meldung('Die Ex-Liste lässt sich nicht lesen: ' + e.message +
        '\nSind die neuen Datenbank-Regeln schon eingetragen (firebase-regeln.md)?', true);
    });
  },

  async listeZeichnen() {
    const ul = document.getElementById('ex-liste');
    const ids = Object.keys(this.index).sort((a, b) =>
      (this.index[b].importiert || 0) - (this.index[a].importiert || 0));
    document.getElementById('ex-liste-leer').hidden = ids.length > 0;
    const lokal = new Set(await this.originalIds().catch(() => []));
    const esc = Band.esc.bind(Band);
    ul.innerHTML = ids.map(id => {
      const x = this.index[id];
      const teile = [x.art, x.fach, `${x.punkteGesamt} P`,
        `${x.aufgaben} Aufgaben`, x.hoerbeispiele ? `${x.hoerbeispiele} Hörbeispiele (live)` : '']
        .filter(Boolean).map(esc).join(' · ');
      const datum = x.importiert ? new Date(x.importiert).toLocaleDateString('de-DE') : '';
      const hatOriginal = lokal.has(id);
      // Welche Klassen haben die Ex schon geschrieben (nur lokal bekannt)
      const klassen = typeof ExAuswertung !== 'undefined'
        ? [...new Set(ExAuswertung.gruppen().filter(g => g.exId === id).map(g => g.klasse))] : [];
      return `<li data-id="${esc(id)}">
        <div><div class="ex-titel">${esc(x.titel)}</div>
          <div class="hint">${teile}${datum ? ` · importiert am ${datum}` : ''}</div>
          ${klassen.length ? `<div class="hint">Geschrieben von: ${klassen.map(esc).join(', ')}</div>` : ''}</div>
        <div class="btn-row">
          <button class="small" data-aktion="vorschau" ${hatOriginal ? '' : 'disabled'}
            title="${hatOriginal ? 'Originaldatei mit Vorschau-Leiste in neuem Tab öffnen'
              : 'Die Originaldatei liegt nicht auf diesem Gerät – zum Ansehen die Datei hier noch einmal hineinziehen'}">Vorschau</button>
          <button class="small danger" data-aktion="loeschen" data-icon="trash">Löschen</button>
        </div></li>`;
    }).join('');
    Icons.hydrate(ul);
  },

  /* Erscheint in der Bibliothek und in der schmalen Spalte bei „Schreiben“ */
  meldung(text, fehler, hinweise) {
    ['ex-import-meldung', 'ex-import-meldung-schnell'].forEach(id => this.meldungIn(document.getElementById(id), text, fehler, hinweise));
  },

  meldungIn(el, text, fehler, hinweise) {
    if (!el) return;
    el.hidden = !text;
    el.classList.toggle('fehler', !!fehler);
    el.textContent = text || '';
    if (hinweise && hinweise.length) {
      const ul = document.createElement('ul');
      hinweise.forEach(h => { const li = document.createElement('li'); li.textContent = h; ul.append(li); });
      el.append(ul);
    }
  },

  async importieren(datei) {
    if (!FB.istLehrer()) { alert('Bitte zuerst mit dem Lehrerkonto anmelden.'); return; }
    let teile;
    try {
      teile = ExImport.zerlegen(await datei.text());
    } catch (e) {
      this.meldung(`„${datei.name}“ wurde nicht importiert.\n${e.message}`, true);
      return;
    }
    const id = teile.meta.id;
    if (this.index[id] && !confirm(`Die Ex „${this.index[id].titel}“ (Kennung ${id}) gibt es schon.\n\n` +
      'Mit dieser Datei überschreiben? Laufende oder beendete Exen mit dieser Kennung bekommen dann ' +
      'die neue Fassung und die neue Lösung.')) return;

    this.meldung(`„${teile.info.titel}“ wird hochgeladen …`);
    const stuecke = {};
    const html = teile.schuelerHtml;
    let n = 0;
    for (let i = 0; i < html.length; i += this.STUECK) stuecke['t' + n++] = html.slice(i, i + this.STUECK);
    const ts = FB.serverTimestamp();
    try {
      // Ein einziges update über alle drei Äste – die Datenbank übernimmt es ganz oder gar nicht
      await FB.update(FB.ref(FB.db, this.WURZEL), {
        [`exen/${id}`]: { meta: JSON.stringify(teile.meta), schueler: { teile: n, laenge: html.length, ...stuecke } },
        [`exgeheim/${id}`]: { loesung: teile.loesungJson, bewertung: teile.bewertung, stand: ts },
        [`exindex/${id}`]: { ...teile.info, dateiname: datei.name.slice(0, 200), importiert: ts },
      });
    } catch (e) {
      this.meldung(`Hochladen fehlgeschlagen: ${e.message}` + (/permission/i.test(e.message)
        ? '\nDie Datenbank hat abgelehnt – sind die neuen Regeln aus firebase-regeln.md eingetragen?' : ''), true);
      return;
    }
    try { await this.originalSpeichern(id, datei); } catch (e) { console.error(e); }
    if (!this.abmeldenIndex) this.bibliothekSchalten(true);
    this.meldung(`„${teile.info.titel}“ ist importiert. Schülerfassung: ${Math.round(html.length / 1024)} KB, ` +
      'ohne Lösungen, ohne Bewertung, ohne Audiodaten.', false, teile.hinweise);
    this.listeZeichnen();
    document.dispatchEvent(new CustomEvent('ex-importiert', { detail: { id } }));
  },

  async loeschen(id) {
    const x = this.index[id];
    if (!x) return;
    // Hängen noch Auswertungen an der Ex, ausdrücklich darauf hinweisen
    const geschrieben = typeof ExAuswertung !== 'undefined'
      ? ExAuswertung.gruppen().filter(g => g.exId === id) : [];
    if (geschrieben.length && !confirm(`Achtung: Zu „${x.titel}“ gibt es ${geschrieben.length === 1 ? 'eine Auswertung' : geschrieben.length + ' Auswertungen'}:\n` +
      geschrieben.map(g => `• ${g.klasse} · ${g.exNummer}. Ex vom ${new Date(g.erstellt).toLocaleDateString('de-DE')}`).join('\n') +
      '\n\nOhne die Ex in der Bibliothek lassen sie sich nicht mehr öffnen oder korrigieren – erst wieder nach ' +
      'einem Neu-Import derselben Datei. Trotzdem löschen?')) return;
    if (!confirm(`Die Ex „${x.titel}“ löschen?\n\nSchülerfassung, Lösung und Bewertung werden aus der ` +
      'Datenbank entfernt. Bereits geschriebene Exen und ihre Abgaben bleiben erhalten, lassen sich ' +
      'aber erst wieder auswerten, wenn du die Ex erneut importierst.')) return;
    try {
      await FB.update(FB.ref(FB.db, this.WURZEL), {
        [`exen/${id}`]: null, [`exgeheim/${id}`]: null, [`exindex/${id}`]: null,
      });
      await this.originalLoeschen(id).catch(() => {});
      this.meldung('');
    } catch (e) {
      alert('Löschen fehlgeschlagen: ' + e.message);
    }
  },

  /* Die Originaldatei (mit Lösungen und Vorschau-Leiste) bleibt nur auf diesem
     Gerät – sie geht nie in die Datenbank */
  async vorschau(id) {
    const o = await this.originalLaden(id).catch(() => null);
    if (!o) { alert('Die Originaldatei liegt nicht auf diesem Gerät.'); return; }
    const url = URL.createObjectURL(new Blob([o.text], { type: 'text/html' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  _idb: null,
  idb() {
    if (this._idb) return this._idb;
    this._idb = new Promise((resolve, reject) => {
      const req = indexedDB.open('schooltool-exen', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('originale');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { this._idb = null; reject(req.error); };
    });
    return this._idb;
  },
  async idbAktion(modus, fn) {
    const db = await this.idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('originale', modus);
      const req = fn(tx.objectStore('originale'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  },
  async originalSpeichern(id, datei) {
    const text = await datei.text();
    return this.idbAktion('readwrite', s => s.put({ name: datei.name, text, stand: Date.now() }, id));
  },
  originalLaden(id) { return this.idbAktion('readonly', s => s.get(id)); },
  originalLoeschen(id) { return this.idbAktion('readwrite', s => s.delete(id)); },
  originalIds() { return this.idbAktion('readonly', s => s.getAllKeys()); },
};
