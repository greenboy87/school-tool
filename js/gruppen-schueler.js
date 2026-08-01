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
  sid: null,              // eigene Platznummer, z. B. „s7“
  geraet: null,           // zufällige Geräte-Kennung, nur zum Anzeigen von Änderungen
  zuordnung: {},          // sid -> { gruppe, ts, von }
  abmelden: null,

  init() {
    this.geraet = this.geraeteId();
    if (!this.ladeZugang()) return;

    // Frühere Auswahl auf diesem Handy merken (Seite neu laden verliert nichts)
    const gemerkt = localStorage.getItem('gruppen-ich-' + this.raum);
    if (gemerkt !== null && this.namen[+gemerkt]) this.sid = 's' + gemerkt;

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
    document.getElementById('s-nicht-ich').addEventListener('click', () => {
      this.sid = null;
      localStorage.removeItem('gruppen-ich-' + this.raum);
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

  /* ---------- Gruppe wählen ---------- */
  trittBei(gruppenName) {
    if (this.sid === null) return;
    const { db, ref, set, serverTimestamp } = window.FB;
    set(ref(db, `${window.FB.WURZEL}/${this.raum}/zuordnung/${this.sid}`), {
      gruppe: gruppenName.trim().slice(0, 40),
      ts: serverTimestamp(),
      von: this.geraet,
    }).catch(err => this.melde('Konnte nicht gespeichert werden: ' + err.message, true));
  },

  /* Gruppe verlassen: Der Eintrag verschwindet ganz, dadurch steht man wieder
     in keiner Gruppe – und taucht auf dem Lehrerbildschirm unter „Noch offen“ auf. */
  verlassen() {
    if (this.sid === null) return;
    const { db, ref, remove } = window.FB;
    remove(ref(db, `${window.FB.WURZEL}/${this.raum}/zuordnung/${this.sid}`))
      .catch(err => this.melde('Konnte nicht gespeichert werden: ' + err.message, true));
  },

  waehleName(index) {
    this.sid = 's' + index;
    localStorage.setItem('gruppen-ich-' + this.raum, String(index));
    this.zeichne();
  },

  melde(text, warnung) {
    const el = document.getElementById('s-status');
    el.textContent = text;
    el.classList.toggle('warnung', !!warnung);
  },

  /* ---------- Anzeige ---------- */
  zeichne() {
    const werAus = this.sid !== null;
    document.getElementById('s-wer').hidden = werAus;
    document.getElementById('s-gruppe').hidden = !werAus;
    if (!werAus) { this.zeichneNamen(); return; }

    document.getElementById('s-ich').textContent = this.namen[+this.sid.slice(1)] || '?';
    document.getElementById('s-projekt-titel').textContent = this.projekt || 'Deine Gruppe';
    this.zeichneGruppen();
    Icons.hydrate(document);
  },

  zeichneNamen() {
    const box = document.getElementById('s-namen');
    const suche = document.getElementById('s-suche').value.trim().toLowerCase();
    const info = document.getElementById('s-wer-info');
    info.textContent = this.klasse
      ? `Klasse ${this.klasse}${this.projekt ? ' · ' + this.projekt : ''} – tippe deinen Namen an.`
      : 'Tippe deinen Namen an.';
    box.innerHTML = '';
    this.namen.forEach((name, i) => {
      if (suche && !name.toLowerCase().includes(suche)) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'namensknopf';
      b.textContent = name;
      // Wer schon in einer Gruppe ist, wird gekennzeichnet – hilft gegen Fehlgriffe
      const z = this.zuordnung['s' + i];
      if (z && z.gruppe) {
        const tag = document.createElement('span');
        tag.className = 'schon-drin';
        tag.textContent = z.gruppe;
        b.appendChild(tag);
      }
      b.addEventListener('click', () => this.waehleName(i));
      box.appendChild(b);
    });
    if (!box.children.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Kein Name passt zur Suche.';
      box.appendChild(p);
    }
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
    const meine = (this.zuordnung[this.sid] || {}).gruppe || '';
    const meinKey = meine.trim().toLowerCase();

    this.melde(meine ? `Du bist in der Gruppe „${meine}“.`
                     : 'Du bist noch in keiner Gruppe. Tritt einer bei oder gründe eine neue.');

    box.innerHTML = '';
    if (!gruppen.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Es gibt noch keine Gruppe. Gründe unten die erste!';
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
        if (m.sid === this.sid) li.className = 'ich';
        liste.appendChild(li);
      }
      karte.appendChild(liste);

      if (drin) {
        const raus = document.createElement('button');
        raus.type = 'button';
        raus.className = 'small verlassen';
        raus.textContent = 'Gruppe verlassen';
        raus.addEventListener('click', () => this.verlassen());
        karte.appendChild(raus);
      } else {
        karte.addEventListener('click', () => this.trittBei(g.name));
      }
      box.appendChild(karte);
    }
  },
};

document.addEventListener('DOMContentLoaded', () => SchuelerGruppen.init());
