/* Reiter Sport: Stoppuhr und die Bewertungstabellen.

   Die Tabellen stammen aus der ISB-Empfehlung zur Leistungsbewertung Sport und
   liegen wie Klassen und Noten nur im Browser dieses Geraets – im oeffentlichen
   Repository haben sie nichts verloren. Eingelesen werden sie einmalig ueber
   die Konsole:  Sport.tabellenEinlesen(objekt)

   Die Stoppuhr rechnet aus Date.now()-Differenzen statt aus gezaehlten Ticks:
   Browser drosseln Intervalle in Hintergrund-Tabs, die Uhr ginge sonst nach. */
const Sport = {
  uhr: { start: 0, gesammelt: 0, laeuft: false, takt: null },

  init() {
    const buehne = document.getElementById('stoppuhr-buehne');
    if (!buehne) return;

    document.getElementById('btn-stoppuhr-start').addEventListener('click', () => this.umschalten());
    document.getElementById('btn-stoppuhr-reset').addEventListener('click', () => this.zuruecksetzen());
    document.getElementById('btn-stoppuhr-voll').addEventListener('click', () => this.vollbild());
    // Der Knopf muss auch stimmen, wenn das Vollbild ueber Esc endet
    document.addEventListener('fullscreenchange', () => this.zeichneUhr());

    for (const id of ['sport-sportart', 'sport-geschlecht', 'sport-jgst', 'sport-disziplin']) {
      document.getElementById(id).addEventListener('change', () => {
        if (id !== 'sport-disziplin') this.fuelleWahl(id);
        this.merkeWahl();
        this.zeichneTabelle();
        this.zeichneUhr();
      });
    }
    document.getElementById('sport-messwert').addEventListener('input', () => this.zeigeMessnote());
    const suche = document.getElementById('sport-suche');
    suche.addEventListener('input', () => this.zeichneTreffer());
    suche.addEventListener('keydown', e => {
      if (e.key === 'Escape') { suche.value = ''; this.zeichneTreffer(); }
    });

    // Einlesen aus einer Datei: einmal im Jahr, wenn das ISB neue Tabellen legt
    document.getElementById('btn-sport-datei')
      .addEventListener('click', () => document.getElementById('sport-datei').click());
    document.getElementById('sport-datei').addEventListener('change', e => {
      const datei = e.target.files[0];
      e.target.value = '';
      if (datei) this.ausDatei(datei);
    });
    document.getElementById('btn-sport-zurueck').addEventListener('click', () => {
      if (!confirm('Die selbst geladenen Tabellen entfernen und wieder die mitgelieferten verwenden?')) return;
      delete Classes.data.sport;
      Classes.persist();
      document.getElementById('sport-ladestatus').textContent = 'Wieder die mitgelieferten Tabellen.';
      this.fuelleWahl();
      this.zeichneTabelle();
      this.zeichneTreffer();
    });

    this.fuelleWahl();
    this.zeichneTabelle();
    this.zeichneUhr();
    this.zeichneTreffer();
  },

  ausDatei(datei) {
    const status = document.getElementById('sport-ladestatus');
    const leser = new FileReader();
    leser.onload = () => {
      try {
        const bericht = this.tabellenEinlesen(JSON.parse(leser.result));
        status.classList.remove('warnung');
        status.textContent = `${bericht.tabellen} Tabellen, ${bericht.disziplinen} Disziplinen eingelesen.`;
      } catch (err) {
        status.classList.add('warnung');
        status.textContent = 'Datei konnte nicht gelesen werden: ' + err.message;
      }
    };
    leser.readAsText(datei);
  },

  /* ---------- Daten ----------
     Die Tabellen liegen als js/sport-tabellen.js bei. Wer im Reiter eine neuere
     Datei laedt, legt sie lokal ab – die geht dann der mitgelieferten vor. */
  daten() {
    const eigen = Classes.data.sport;
    if (eigen && Array.isArray(eigen.tabellen) && eigen.tabellen.length) return eigen;
    return (typeof SportTabellen !== 'undefined' && SportTabellen) || { tabellen: [] };
  },

  eigeneGeladen() {
    const e = Classes.data.sport;
    return !!(e && Array.isArray(e.tabellen) && e.tabellen.length);
  },

  tabellenEinlesen(objekt) {
    if (!objekt || !Array.isArray(objekt.tabellen)) throw new Error('Kein Tabellen-Objekt');
    Classes.data.sport = objekt;
    Classes.persist();
    this.fuelleWahl();
    this.zeichneTabelle();
    this.zeichneTreffer();
    return { tabellen: objekt.tabellen.length,
             disziplinen: objekt.tabellen.reduce((a, t) => a + t.disziplinen.length, 0) };
  },

  /* ---------- Auswahl ----------
     Jede Liste zeigt nur, was es zur bisherigen Wahl wirklich gibt: Schwimmen
     hat andere Disziplinen als Leichtathletik, und nicht jede Jahrgangsstufe
     kennt jede Strecke. */
  wahl() {
    return {
      sportart: document.getElementById('sport-sportart').value,
      geschlecht: document.getElementById('sport-geschlecht').value,
      jgst: document.getElementById('sport-jgst').value,
      disziplin: document.getElementById('sport-disziplin').value,
    };
  },

  merkeWahl() {
    try { localStorage.setItem('sport-wahl', JSON.stringify(this.wahl())); } catch (e) {}
  },

  gemerkteWahl() {
    try { return JSON.parse(localStorage.getItem('sport-wahl')) || {}; }
    catch (e) { return {}; }
  },

  fuelleSelect(id, werte, bevorzugt) {
    const sel = document.getElementById(id);
    const vorher = sel.value || bevorzugt;
    sel.innerHTML = '';
    for (const w of werte) {
      const o = document.createElement('option');
      o.value = String(w);
      o.textContent = String(w);
      sel.appendChild(o);
    }
    sel.value = werte.map(String).includes(String(vorher)) ? String(vorher)
              : (werte.length ? String(werte[0]) : '');
  },

  fuelleWahl(geaendert) {
    const t = this.daten().tabellen;
    const leer = document.getElementById('sport-leer');
    const wahlbox = document.getElementById('sport-wahl');
    if (!t.length) {
      leer.hidden = false;
      wahlbox.hidden = true;
      document.getElementById('sport-tabelle').innerHTML = '';
      return;
    }
    leer.hidden = true;
    wahlbox.hidden = false;
    document.getElementById('btn-sport-zurueck').hidden = !this.eigeneGeladen();

    const g = this.gemerkteWahl();
    const eindeutig = (liste) => [...new Set(liste)];

    if (!geaendert || geaendert === 'sport-sportart') {
      this.fuelleSelect('sport-sportart', eindeutig(t.map(x => x.sportart)), g.sportart);
    }
    const sa = document.getElementById('sport-sportart').value;

    const nachSa = t.filter(x => x.sportart === sa);
    this.fuelleSelect('sport-geschlecht', eindeutig(nachSa.map(x => x.geschlecht)), g.geschlecht);
    const ge = document.getElementById('sport-geschlecht').value;

    const nachGe = nachSa.filter(x => x.geschlecht === ge);
    this.fuelleSelect('sport-jgst', eindeutig(nachGe.map(x => x.jgst)).sort((a, b) => a - b), g.jgst);
    const jg = document.getElementById('sport-jgst').value;

    const tab = nachGe.find(x => String(x.jgst) === String(jg));
    this.fuelleSelect('sport-disziplin', tab ? tab.disziplinen.map(d => d.name) : [], g.disziplin);
  },

  aktuelleTabelle() {
    const w = this.wahl();
    return this.daten().tabellen.find(t => t.sportart === w.sportart &&
      t.geschlecht === w.geschlecht && String(t.jgst) === String(w.jgst)) || null;
  },

  aktuelleDisziplin() {
    const t = this.aktuelleTabelle();
    if (!t) return null;
    const w = this.wahl();
    return t.disziplinen.find(d => d.name === w.disziplin) || null;
  },

  /* ---------- Tabelle ---------- */
  zeichneTabelle() {
    const tab = document.getElementById('sport-tabelle');
    const d = this.aktuelleDisziplin();
    tab.innerHTML = '';
    const quelle = document.getElementById('sport-quelle');
    const daten = this.daten();
    quelle.textContent = daten.quelle ? `Quelle: ${daten.quelle}` : '';

    document.getElementById('sport-eingabe').hidden = !d || this.istZeit(d);
    if (!d) return;

    const kopf = document.createElement('tr');
    kopf.innerHTML = `<th>Note</th><th>ab (${d.einheit})</th>`;
    tab.appendChild(kopf);
    for (const n of ['1', '2', '3', '4', '5']) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="num">${n}</td><td>${d.noten[n] ? d.noten[n].text : '–'}</td>`;
      tab.appendChild(tr);
    }
    const feld = document.getElementById('sport-messwert');
    feld.placeholder = d.einheit === 'm' ? 'z. B. 4,20' : d.einheit;
    this.zeigeMessnote();
  },

  /* Zeit-Disziplinen kann die Stoppuhr selbst bewerten, Weiten und Hoehen nicht */
  istZeit(d) { return d && (d.einheit === 's' || d.einheit === 'min:s' || d.einheit === 'min'); },

  /* ---------- Note zu einem Wert ----------
     „weniger ist besser“ bei Zeiten, „mehr ist besser“ bei Weiten, Hoehen und
     der Dauerlauf-Minutenzahl. Note 6 heisst hier: unter Note 5. */
  noteFuer(d, wert) {
    if (!d || wert === null || isNaN(wert)) return null;
    for (const n of ['1', '2', '3', '4', '5']) {
      const s = d.noten[n];
      if (!s) continue;
      if (d.richtung === 'weniger' ? wert <= s.zahl : wert >= s.zahl) return parseInt(n, 10);
    }
    return 6;
  },

  /* Wie weit ist es bis zur naechsten Note? Bei „mehr ist besser“ die naechst-
     bessere, bei Zeiten die Schwelle, ab der die jetzige verloren geht. */
  bisZurNaechsten(d, wert) {
    const note = this.noteFuer(d, wert);
    if (note === null) return null;
    if (d.richtung === 'mehr') {
      if (note === 1) return null;                       // besser geht nicht
      const ziel = d.noten[String(note === 6 ? 5 : note - 1)];
      if (!ziel) return null;
      return { note: note === 6 ? 5 : note - 1, abstand: ziel.zahl - wert, richtung: 'besser' };
    }
    if (note === 6) return null;                          // unter Note 5, nichts zu halten
    const halten = d.noten[String(note)];
    return { note, abstand: halten.zahl - wert, richtung: 'halten' };
  },

  zahlAus(text, einheit) {
    const t = String(text || '').trim().replace(',', '.');
    if (!t) return null;
    if (einheit === 'min:s') {
      const m = t.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
      if (m) return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
    }
    const z = parseFloat(t);
    return isNaN(z) ? null : z;
  },

  zeigeMessnote() {
    const el = document.getElementById('sport-messnote');
    const d = this.aktuelleDisziplin();
    if (!el || !d) return;
    const wert = this.zahlAus(document.getElementById('sport-messwert').value, d.einheit);
    if (wert === null) { el.textContent = ''; el.className = 'sport-messnote'; return; }
    const note = this.noteFuer(d, wert);
    el.textContent = note === 6 ? 'unter Note 5' : 'Note ' + note;
    el.className = 'sport-messnote note-' + note;
  },

  /* ---------- Stoppuhr ---------- */
  zeit() {
    const u = this.uhr;
    return u.gesammelt + (u.laeuft ? Date.now() - u.start : 0);
  },

  /* „07:32,4“ – die Stunde erscheint erst, wenn es sie gibt */
  text(ms) {
    const zz = n => String(n).padStart(2, '0');
    const zehntel = Math.floor(Math.abs(ms) / 100) % 10;
    const sek = Math.floor(Math.abs(ms) / 1000) % 60;
    const min = Math.floor(Math.abs(ms) / 60000) % 60;
    const std = Math.floor(Math.abs(ms) / 3600000);
    return (ms < 0 ? '-' : '') + (std ? std + ':' + zz(min) : zz(min)) + ':' + zz(sek) + ',' + zehntel;
  },

  /* Abstaende in Sekunden lesbar machen: „42,3 s“ bzw. „2:07“ */
  abstandText(sekunden, einheit) {
    if (einheit === 'min') return this.text(sekunden * 1000).replace(/,\d$/, '');
    if (einheit === 'min:s') return this.text(sekunden * 1000);
    return sekunden.toFixed(1).replace('.', ',') + ' s';
  },

  zeichneUhr() {
    const anzeige = document.getElementById('stoppuhr-anzeige');
    if (!anzeige) return;
    const ms = this.zeit();
    anzeige.textContent = this.text(ms);

    const knopf = document.getElementById('btn-stoppuhr-start');
    if (knopf) {
      const laeuft = this.uhr.laeuft;
      knopf.innerHTML = Icons.raw(laeuft ? 'stop' : 'play') + (laeuft ? 'Pause' : 'Start');
      knopf.classList.toggle('primary', !laeuft);
    }

    const zeile = document.getElementById('stoppuhr-note');
    const d = this.aktuelleDisziplin();
    if (!zeile) return;
    if (!d || !this.istZeit(d)) { zeile.hidden = true; return; }

    // Ausdauer wird in Minuten bewertet, Laufzeiten in Sekunden
    const wert = d.einheit === 'min' ? ms / 60000 : ms / 1000;
    const note = this.noteFuer(d, wert);
    const naechste = this.bisZurNaechsten(d, wert);
    let text = note === 6 ? 'unter Note 5' : 'Note ' + note;
    if (naechste && naechste.abstand > 0) {
      const einh = d.einheit === 'min' ? 'min' : d.einheit;
      const abst = this.abstandText(
        d.einheit === 'min' ? naechste.abstand * 60 : naechste.abstand, einh);
      text += naechste.richtung === 'besser'
        ? ` · noch ${abst} bis Note ${naechste.note}`
        : ` · noch ${abst} für Note ${naechste.note}`;
    }
    zeile.textContent = `${d.name} · ${text}`;
    zeile.className = 'stoppuhr-note note-' + note;
    zeile.hidden = false;
  },

  umschalten() {
    const u = this.uhr;
    if (u.laeuft) {
      u.gesammelt = this.zeit();
      u.laeuft = false;
      clearInterval(u.takt);
      u.takt = null;
    } else {
      u.start = Date.now();
      u.laeuft = true;
      clearInterval(u.takt);
      u.takt = setInterval(() => this.zeichneUhr(), 50);
    }
    this.zeichneUhr();
  },

  zuruecksetzen() {
    const u = this.uhr;
    clearInterval(u.takt);
    u.takt = null;
    u.laeuft = false;
    u.gesammelt = 0;
    u.start = 0;
    this.zeichneUhr();
  },

  /* Nur die Buehne ins Vollbild, nicht die ganze Seite – so bleiben Start und
     Zuruecksetzen dort erreichbar, ohne das Vollbild zu verlassen. */
  vollbild() {
    const buehne = document.getElementById('stoppuhr-buehne');
    if (!buehne) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    const rein = buehne.requestFullscreen || buehne.webkitRequestFullscreen;
    if (!rein) { alert('Dieser Browser kann den Vollbildmodus hier nicht anzeigen.'); return; }
    const p = rein.call(buehne);
    if (p && p.catch) p.catch(err => alert('Vollbild nicht möglich: ' + err.message));
  },

  /* ---------- Suche ueber alle Tabellen ---------- */
  zeichneTreffer() {
    const box = document.getElementById('sport-treffer');
    const suche = document.getElementById('sport-suche').value.trim().toLowerCase();
    box.innerHTML = '';
    if (suche.length < 2) return;

    const woerter = suche.split(/\s+/);
    const treffer = [];
    for (const t of this.daten().tabellen) {
      for (const d of t.disziplinen) {
        const heu = `${t.sportart} ${t.geschlecht} jgst ${t.jgst} ${d.name}`.toLowerCase();
        if (woerter.every(w => heu.includes(w))) treffer.push({ t, d });
      }
    }
    if (!treffer.length) {
      box.innerHTML = '<p class="hint">Nichts gefunden.</p>';
      return;
    }
    const zuViel = treffer.length - 40;
    for (const { t, d } of treffer.slice(0, 40)) {
      const zeile = document.createElement('button');
      zeile.type = 'button';
      zeile.className = 'sport-treffer-zeile';
      const wo = document.createElement('span');
      wo.className = 'treffer-klasse';
      wo.textContent = `${t.sportart} · ${t.geschlecht} · Jgst. ${t.jgst}`;
      const was = document.createElement('span');
      was.className = 'treffer-name';
      was.textContent = d.name;
      const noten = document.createElement('span');
      noten.className = 'treffer-noten';
      noten.textContent = ['1', '2', '3', '4', '5']
        .map(n => d.noten[n] ? d.noten[n].text : '–').join('  ·  ');
      zeile.append(was, wo, noten);
      zeile.addEventListener('click', () => this.springeZu(t, d));
      box.appendChild(zeile);
    }
    if (zuViel > 0) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = `… und ${zuViel} weitere. Tippe genauer.`;
      box.appendChild(p);
    }
  },

  springeZu(t, d) {
    localStorage.setItem('sport-wahl', JSON.stringify({
      sportart: t.sportart, geschlecht: t.geschlecht, jgst: t.jgst, disziplin: d.name }));
    document.getElementById('sport-sportart').value = t.sportart;
    this.fuelleWahl('sport-sportart');
    document.getElementById('sport-geschlecht').value = t.geschlecht;
    document.getElementById('sport-jgst').value = String(t.jgst);
    this.fuelleWahl('sport-sportart');
    document.getElementById('sport-disziplin').value = d.name;
    this.zeichneTabelle();
    this.zeichneUhr();
    document.getElementById('sport-wahl').scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
};
