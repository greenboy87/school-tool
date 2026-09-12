/* Schülerseite zur Gruppenbildung.

   Die Klassenliste kommt NICHT vom Server, sondern steckt im QR-Code und damit im
   Adress-Anker (#...) dieser Seite. Anker werden von Browsern niemals mitgesendet –
   die Namen bleiben also zwischen Beamer und Handy. An Firebase geht ausschließlich
   „Platznummer -> Gruppenname“. */
const SchuelerGruppen = {
  raum: null,
  namen: [],
  projekt: '',
  klasse: '',
  /* Nicht eine Platznummer, sondern eine Liste: In der Klasse gibt es weniger
     iPads als Schüler, deshalb meldet ein Gerät gleich die ganze Gruppe an.
     Der erste Eintrag ist der, dem das Gerät gehört. */
  auswahl: [],            // z. B. ["s7", "s12", "s3"]
  picker: true,           // true = Namensliste zeigen; erst „Weiter“ schaltet um.
                          // Ohne das sprang die Seite nach dem ersten Namen weiter
                          // und ein zweiter liess sich gar nicht antippen.
  bezeichnung: 'Gruppenname',   // was die Lehrkraft eintragen lässt (z. B. „Thema“)
  geraet: null,           // zufällige Geräte-Kennung, nur zum Anzeigen von Änderungen
  zuordnung: {},          // sid -> { gruppe, ts, von }
  abmelden: null,

  init() {
    this.geraet = this.geraeteId();
    if (!this.ladeZugang()) return;

    // Frühere Auswahl auf diesem Handy merken (Seite neu laden verliert nichts)
    this.auswahl = this.gemerkteAuswahl();
    this.picker = !this.auswahl.length;

    /* Ein neuer QR-Code führt auf dieselbe Seite und unterscheidet sich nur hinter
       dem „#“. Der Browser lädt dann NICHT neu, sondern wechselt bloß den Anker –
       ohne das hier bliebe man in der Sammlung der Vorstunde hängen. */
    window.addEventListener('hashchange', () => location.reload());

    this.bindeEreignisse();
    if (window.FB && window.FB.bereit) this.starte();
    else window.addEventListener('fb-bereit', () => this.starte(), { once: true });
    // Wenn die SDK gar nicht lädt (kein Netz / gesperrtes WLAN)
    setTimeout(() => { if (!window.FB || !window.FB.bereit) this.zeigeFehler(
      'Keine Verbindung zur Gruppen-Datenbank. Bist du im WLAN oder im Mobilfunknetz?'); }, 8000);
  },

  /* ---------- Zugangsdaten aus dem Anker lesen ---------- */
  ladeZugang() {
    try {
      const roh = location.hash.replace(/^#/, '');
      if (!roh) throw new Error('kein Anker');
      const daten = JSON.parse(this.vonBase64(roh));
      if (!daten.r || !Array.isArray(daten.n) || !daten.n.length) throw new Error('unvollständig');
      this.raum = String(daten.r);
      this.namen = daten.n.map(String);
      this.projekt = daten.p || '';
      this.klasse = daten.k || '';
      this.bezeichnung = String(daten.b || 'Gruppenname').slice(0, 30);
      return true;
    } catch (e) {
      this.zeigeFehler();
      return false;
    }
  },

  vonBase64(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  },

  /* Früher stand hier eine einzelne Zahl, jetzt eine Liste. Beides lesen, damit
     ein Handy mit alter Merkung nicht plötzlich niemanden mehr kennt. */
  gemerkteAuswahl() {
    const roh = localStorage.getItem('gruppen-ich-' + this.raum);
    if (roh === null) return [];
    let werte;
    try {
      const wert = JSON.parse(roh);
      werte = Array.isArray(wert) ? wert : [wert];
    } catch (e) {
      werte = [roh];
    }
    return werte
      .map(i => +i)
      .filter(i => Number.isInteger(i) && i >= 0 && this.namen[i])
      .map(i => 's' + i);
  },

  merkeAuswahl() {
    const key = 'gruppen-ich-' + this.raum;
    if (!this.auswahl.length) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(this.auswahl.map(sid => +sid.slice(1))));
  },

  meineNamen() {
    return this.auswahl.map(sid => this.namen[+sid.slice(1)] || '?');
  },

  geraeteId() {
    let id = localStorage.getItem('gruppen-geraet');
    if (!id) { id = Math.random().toString(36).slice(2, 8); localStorage.setItem('gruppen-geraet', id); }
    return id;
  },

  zeigeFehler(text) {
    const box = document.getElementById('s-fehler');
    if (text) document.getElementById('s-fehler-text').textContent = text;
    box.hidden = false;
    document.getElementById('s-wer').hidden = true;
    document.getElementById('s-gruppe').hidden = true;
    Icons.hydrate(document);
  },

  /* ---------- Ereignisse ---------- */
  bindeEreignisse() {
    document.getElementById('s-suche').addEventListener('input', () => this.zeichneNamen());
    // Zurück zur Namensliste – die bisherige Auswahl bleibt stehen, dort lässt
    // sich ein Name ergänzen oder ein falsch getippter wieder abwählen
    document.getElementById('s-nicht-ich').addEventListener('click', () => {
      this.picker = true;
      this.zeichne();
    });
    document.getElementById('s-weiter').addEventListener('click', () => {
      if (!this.auswahl.length) return;
      this.picker = false;
      document.getElementById('s-suche').value = '';
      this.zeichne();
    });
    document.getElementById('s-neue-gruppe').addEventListener('submit', e => {
      e.preventDefault();
      const feld = document.getElementById('s-gruppenname');
      const name = feld.value.trim();
      if (!name) return;
      feld.value = '';
      this.trittBei(name);
    });
  },

  starte() {
    if (!window.FB.bereit) { this.zeigeFehler('Die Gruppen-Datenbank ist nicht erreichbar.'); return; }
    const { db, ref, onValue } = window.FB;

    /* Lebt der Raum überhaupt noch? Ein alter QR-Code (etwa vom Beamerfenster der
       Vorstunde) führte sonst still in die Sammlung von gestern – mitsamt der
       alten Gruppenzuordnung. Verschwindet die Kennung, ist die Sammlung beendet. */
    onValue(ref(db, `${window.FB.WURZEL}/${this.raum}/meta`), snap => {
      const meta = snap.val();
      this.raumLebt = !!meta;
      if (!meta) {
        this.zeigeFehler('Diese Sammlung ist beendet.\n\n' +
          'Der QR-Code ist nicht mehr gültig – bitte den aktuellen von der Leinwand scannen.');
        return;
      }
      document.getElementById('s-fehler').hidden = true;
      this.zeichne();
    }, () => { /* Fehler behandelt der Zuordnungs-Beobachter unten */ });

    onValue(ref(db, `${window.FB.WURZEL}/${this.raum}/zuordnung`), snap => {
      this.zuordnung = snap.val() || {};
      this.zeichne();
    }, err => {
      const code = ((err && (err.code || err.message)) || '').toString().toUpperCase();
      // Fehlende Freigabe ist nichts, was die Klasse lösen kann – also klare Ansage
      this.zeigeFehler(code.includes('PERMISSION_DENIED')
        ? 'Die Gruppenbildung ist noch nicht freigeschaltet. Bitte sag deiner Lehrkraft Bescheid.'
        : 'Die Gruppenliste kann gerade nicht geladen werden. Versuch es in einem Moment noch einmal.');
    });
    this.zeichne();
  },

  /* ---------- Gruppe wählen ----------
     Immer für alle Namen, die dieses Gerät betreut: ein Tipp trägt die ganze
     Gruppe ein, statt für jeden einzeln hin und her zu wechseln. */
  trittBei(gruppenName) {
    if (!this.auswahl.length) return;
    const { db, ref, update, serverTimestamp } = window.FB;
    const name = gruppenName.trim().slice(0, 40);
    const aenderungen = {};
    for (const sid of this.auswahl) {
      aenderungen[sid] = { gruppe: name, ts: serverTimestamp(), von: this.geraet };
    }
    update(ref(db, `${window.FB.WURZEL}/${this.raum}/zuordnung`), aenderungen)
      .catch(err => this.melde('Konnte nicht gespeichert werden: ' + err.message, true));
  },

  /* Gruppe verlassen: Die Einträge verschwinden ganz, dadurch steht man wieder
     in keiner Gruppe – und taucht auf dem Lehrerbildschirm unter „Noch offen“ auf. */
  verlassen() {
    if (!this.auswahl.length) return;
    const { db, ref, update } = window.FB;
    const aenderungen = {};
    for (const sid of this.auswahl) aenderungen[sid] = null;
    update(ref(db, `${window.FB.WURZEL}/${this.raum}/zuordnung`), aenderungen)
      .catch(err => this.melde('Konnte nicht gespeichert werden: ' + err.message, true));
  },

  /* Vertippt? Dann muss die Gruppe nicht gelöscht und neu gegründet werden –
     alle Mitglieder bekommen einfach den neuen Namen geschrieben. Der Zeitstempel
     bleibt stehen, damit die Gruppe in der Liste nicht nach hinten springt. */
  umbenennen(alterName) {
    const eingabe = prompt(`Wie soll es statt „${alterName}“ heißen?`, alterName);
    if (eingabe === null) return;
    const neu = eingabe.trim().slice(0, 40);
    if (!neu || neu === alterName) return;
    const key = alterName.trim().toLowerCase();
    const { db, ref, update, serverTimestamp } = window.FB;
    const aenderungen = {};
    for (const [sid, z] of Object.entries(this.zuordnung)) {
      if (!z || !z.gruppe || z.gruppe.trim().toLowerCase() !== key) continue;
      aenderungen[sid] = { gruppe: neu, ts: z.ts || serverTimestamp(), von: z.von || this.geraet };
    }
    if (!Object.keys(aenderungen).length) return;
    update(ref(db, `${window.FB.WURZEL}/${this.raum}/zuordnung`), aenderungen)
      .catch(err => this.melde('Umbenennen hat nicht geklappt: ' + err.message, true));
  },

  /* Antippen wählt aus, nochmal antippen wieder ab – so lässt sich auch ein
     Fehlgriff geradebiegen, ohne von vorn anzufangen. */
  waehleName(index) {
    const sid = 's' + index;
    const pos = this.auswahl.indexOf(sid);
    if (pos >= 0) this.auswahl.splice(pos, 1);
    else this.auswahl.push(sid);
    this.merkeAuswahl();
    this.zeichne();
  },

  melde(text, warnung) {
    const el = document.getElementById('s-status');
    el.textContent = text;
    el.classList.toggle('warnung', !!warnung);
  },

  /* Klasse und Raum-Code immer sichtbar – damit auf einem geteilten iPad sofort
     auffällt, wenn man in der Sammlung der falschen Klasse gelandet ist. */
  zeigeRaumzeile() {
    const el = document.getElementById('s-raumzeile');
    if (!el) return;
    const teile = [];
    if (this.klasse) teile.push(this.klasse);
    if (this.projekt) teile.push(this.projekt);
    el.innerHTML = '';
    const links = document.createElement('span');
    links.textContent = teile.join(' · ');
    const rechts = document.createElement('span');
    rechts.className = 'raum-code';
    rechts.textContent = this.raum;
    el.append(links, rechts);
    el.hidden = false;
  },

  /* ---------- Anzeige ---------- */
  zeichne() {
    if (this.raumLebt === false) return;      // beendete Sammlung: Fehlerbild steht
    this.zeigeRaumzeile();
    const fertig = this.auswahl.length > 0 && !this.picker;
    document.getElementById('s-wer').hidden = fertig;
    document.getElementById('s-gruppe').hidden = !fertig;
    if (!fertig) { this.zeichneNamen(); return; }

    document.getElementById('s-ich').textContent = this.meineNamen().join(', ');
    document.getElementById('s-projekt-titel').textContent = this.projekt || 'Deine Gruppe';

    // Die Lehrkraft legt fest, was hier einzutragen ist – „Gruppenname“ oder
    // etwa „Thema“. Sonst denkt sich die Klasse Gruppennamen aus, die keiner will.
    document.getElementById('s-neu-label').textContent = this.bezeichnung + ' eintragen';
    document.getElementById('s-gruppenname').placeholder = this.bezeichnung;

    this.zeichneGruppen();
    Icons.hydrate(document);
  },

  zeichneNamen() {
    const box = document.getElementById('s-namen');
    const suche = document.getElementById('s-suche').value.trim().toLowerCase();
    const info = document.getElementById('s-wer-info');
    const kopf = this.klasse
      ? `Klasse ${this.klasse}${this.projekt ? ' · ' + this.projekt : ''} – `
      : '';
    document.getElementById('s-wer-titel').textContent =
      this.auswahl.length ? 'Wer ist noch dabei?' : 'Wer bist du?';
    info.textContent = kopf + (this.auswahl.length
      ? 'tippe weitere Namen an oder geh mit „Weiter“ zu den Gruppen. Nochmal antippen nimmt einen wieder heraus.'
      : 'tippe deinen Namen an.');
    box.innerHTML = '';
    this.namen.forEach((name, i) => {
      if (suche && !name.toLowerCase().includes(suche)) return;
      const sid = 's' + i;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'namensknopf';
      const gewaehlt = this.auswahl.includes(sid);
      if (gewaehlt) b.classList.add('gewaehlt');
      b.setAttribute('aria-pressed', gewaehlt ? 'true' : 'false');
      const beschriftung = document.createElement('span');
      beschriftung.textContent = name;
      b.appendChild(beschriftung);
      // Wer schon in einer Gruppe ist, wird gekennzeichnet – hilft gegen Fehlgriffe
      const z = this.zuordnung[sid];
      if (z && z.gruppe) {
        const tag = document.createElement('span');
        tag.className = 'schon-drin';
        tag.textContent = z.gruppe;
        b.appendChild(tag);
      }
      b.addEventListener('click', () => this.waehleName(i));
      box.appendChild(b);
    });
    this.zeichneWeiterLeiste();
    if (!box.children.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Kein Name passt zur Suche.';
      box.appendChild(p);
    }
  },

  /* Die Leiste unten sagt, wen man gerade mitnimmt – ohne sie tippt man auf einem
     geteilten iPad schnell einen Namen zu viel oder zu wenig an. */
  zeichneWeiterLeiste() {
    const leiste = document.getElementById('s-weiter-leiste');
    const text = document.getElementById('s-weiter-text');
    const knopf = document.getElementById('s-weiter');
    const namen = this.meineNamen();
    leiste.hidden = !namen.length;
    if (!namen.length) return;
    text.textContent = namen.length === 1
      ? namen[0]
      : `${namen.length} Namen: ${namen.join(', ')}`;
    knopf.textContent = namen.length === 1 ? 'Weiter' : 'Weiter mit allen';
  },

  /* Gruppen aus den Zuordnungen ableiten. Geschlüsselt wird nach Kleinschreibung,
     damit „Air up“ und „air up“ dieselbe Gruppe sind. */
  gruppenBilden() {
    const map = new Map();
    for (const [sid, z] of Object.entries(this.zuordnung)) {
      if (!z || !z.gruppe) continue;
      const key = z.gruppe.trim().toLowerCase();
      if (!key) continue;
      if (!map.has(key)) map.set(key, { name: z.gruppe.trim(), mitglieder: [], erste: z.ts || 0 });
      const g = map.get(key);
      g.mitglieder.push({ sid, name: this.namen[+sid.slice(1)] || sid, ts: z.ts || 0 });
      if ((z.ts || 0) < g.erste) { g.erste = z.ts; g.name = z.gruppe.trim(); }
    }
    for (const g of map.values()) g.mitglieder.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return [...map.values()].sort((a, b) => a.erste - b.erste);
  },

  zeichneGruppen() {
    const box = document.getElementById('s-gruppenliste');
    const gruppen = this.gruppenBilden();
    const meine = (this.zuordnung[this.auswahl[0]] || {}).gruppe || '';
    const meinKey = meine.trim().toLowerCase();
    const wir = this.auswahl.length > 1;

    this.melde(meine
      ? (wir ? `Ihr seid bei „${meine}“.` : `Du bist bei „${meine}“.`)
      : (wir
        ? 'Ihr seid noch nirgends eingetragen. Tippt eine Karte an oder tragt unten etwas Eigenes ein.'
        : 'Du bist noch nirgends eingetragen. Tippe eine Karte an oder trag unten etwas Eigenes ein.'));

    box.innerHTML = '';
    if (!gruppen.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Noch ist nichts eingetragen – macht unten den Anfang!';
      box.appendChild(p);
      return;
    }
    for (const g of gruppen) {
      const drin = g.name.trim().toLowerCase() === meinKey;

      // Eigene Gruppe: kein Knopf, sonst tippt man beim Lesen versehentlich darauf
      const karte = document.createElement(drin ? 'div' : 'button');
      if (!drin) karte.type = 'button';
      karte.className = 'gruppenkarte' + (drin ? ' meine' : '');

      const kopf = document.createElement('span');
      kopf.className = 'gk-kopf';
      const name = document.createElement('span');
      name.className = 'gk-name';
      name.textContent = g.name;
      const zahl = document.createElement('span');
      zahl.className = 'gk-zahl';
      zahl.textContent = g.mitglieder.length;
      kopf.append(name, zahl);
      karte.appendChild(kopf);

      // Namen untereinander – bei fünf Leuten ist eine Kommazeile nicht lesbar
      const liste = document.createElement('ul');
      liste.className = 'gk-namen';
      for (const m of g.mitglieder) {
        const li = document.createElement('li');
        li.textContent = m.name;
        // „(du)“ nur beim Besitzer des Geräts – bei allen mitangemeldeten
        // Namen stünde es sonst gleich mehrfach da
        if (m.sid === this.auswahl[0]) li.className = 'ich';
        else if (this.auswahl.includes(m.sid)) li.className = 'mit';
        liste.appendChild(li);
      }
      karte.appendChild(liste);

      if (drin) {
        const reihe = document.createElement('div');
        reihe.className = 'karten-knoepfe';
        // Umbenennen statt löschen und neu gründen – ein Tippfehler im Namen
        // kostete sonst die ganze Gruppe
        const um = document.createElement('button');
        um.type = 'button';
        um.className = 'small umbenennen';
        um.textContent = 'Umbenennen';
        um.addEventListener('click', () => this.umbenennen(g.name));
        const raus = document.createElement('button');
        raus.type = 'button';
        raus.className = 'small verlassen';
        raus.textContent = this.auswahl.length > 1 ? 'Alle hier abmelden' : 'Gruppe verlassen';
        raus.addEventListener('click', () => this.verlassen());
        reihe.append(um, raus);
        karte.appendChild(reihe);
      } else {
        karte.addEventListener('click', () => this.trittBei(g.name));
      }
      box.appendChild(karte);
    }
  },
};

document.addEventListener('DOMContentLoaded', () => SchuelerGruppen.init());
