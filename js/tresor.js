/* Geräte-Synchronisation mit Verschlüsselung im Browser.

   Ablauf: Deine Daten werden auf DEINEM Gerät mit einem Sync-Passwort
   verschlüsselt (AES-GCM, Schlüssel per PBKDF2 aus dem Passwort). Erst danach
   gehen sie zu Firebase. Dort liegt nur unlesbarer Zeichensalat – weder Google
   noch sonst jemand ohne dein Passwort kann Namen oder Noten sehen.

   Der Speicherort ergibt sich aus dem Passwort selbst (Hash mit eigenem Zusatz),
   deshalb genügt auf einem neuen Gerät dieses eine Passwort.

   WICHTIG: Ohne das Passwort sind die Daten nicht wiederherstellbar. Das ist der
   Sinn echter Verschlüsselung – es gibt bewusst keine Hintertür. */
const Tresor = {
  PASS_KEY: 'tresor-passwort',
  MIN_LAENGE: 12,
  ITERATIONEN: 250000,

  passwort: null,
  id: null,
  salz: null,
  schluessel: null,
  timer: null,
  amLaufen: false,
  letzterStand: 0,

  aktiv() { return !!this.schluessel; },

  init() {
    const knopf = document.getElementById('btn-tresor');
    if (!knopf) return;
    knopf.addEventListener('click', () => this.menue());

    const gemerkt = localStorage.getItem(this.PASS_KEY);
    if (gemerkt) {
      this.verbinden(gemerkt, true);
    } else {
      this.knopfAktualisieren();
    }

    // Jedes Speichern löst eine verzögerte Übertragung aus
    const originalSave = Store.save.bind(Store);
    Store.save = (data) => {
      originalSave(data);
      if (this.aktiv()) this.geplantHochladen();
    };
  },

  /* ---------- Bedienung ---------- */
  menue() {
    if (!this.aktiv()) { this.einrichten(); return; }
    const wahl = prompt(
      'Geräte-Sync ist aktiv.\n\n' +
      '1 = Jetzt hochladen\n' +
      '2 = Vom Server holen (überschreibt die Daten auf diesem Gerät)\n' +
      '3 = Sync auf diesem Gerät beenden\n\n' +
      'Zahl eingeben:', '1');
    if (wahl === '1') this.hochladen(true);
    else if (wahl === '2') this.herunterladen(true);
    else if (wahl === '3') this.trennen();
  },

  einrichten() {
    if (!window.FB || !window.FB.bereit) {
      alert('Keine Verbindung zur Datenbank. Bist du online?');
      return;
    }
    const pw = prompt(
      'Geräte-Sync einrichten\n\n' +
      'Wähle ein Sync-Passwort. Damit werden deine Daten auf diesem Gerät ' +
      'verschlüsselt, bevor sie übertragen werden.\n\n' +
      `Mindestens ${this.MIN_LAENGE} Zeichen. Auf jedem weiteren Gerät gibst du ` +
      'genau dieses Passwort ein – dann sind alle Daten dort.\n\n' +
      'ACHTUNG: Ohne das Passwort sind die Daten nicht wiederherstellbar. ' +
      'Schreib es dir auf.');
    if (pw === null) return;
    if (pw.trim().length < this.MIN_LAENGE) {
      alert(`Das Passwort ist zu kurz – bitte mindestens ${this.MIN_LAENGE} Zeichen.`);
      return;
    }
    this.verbinden(pw.trim(), false);
  },

  trennen() {
    if (!confirm('Sync auf diesem Gerät beenden?\n\n' +
      'Die Daten bleiben auf diesem Gerät und auf dem Server erhalten – ' +
      'dieses Gerät gleicht nur nicht mehr ab.')) return;
    localStorage.removeItem(this.PASS_KEY);
    this.passwort = this.id = this.salz = this.schluessel = null;
    this.knopfAktualisieren();
    this.status('Sync beendet.');
  },

  /* Der häufigste Fehler ist die noch fehlende Freigabe in der Firebase-Konsole. */
  fehlertext(e) {
    const code = ((e && (e.code || e.message)) || '').toString().toUpperCase();
    if (code.includes('PERMISSION_DENIED') || code.includes('PERMISSION DENIED')) {
      return 'Die Firebase-Regeln geben den Pfad „schoolTool/tresor“ noch nicht frei. ' +
        'Der Block dafür steht in firebase-regeln.md.';
    }
    return (e && e.message) ? e.message : String(e);
  },

  /* ---------- Verbinden ---------- */
  async verbinden(pw, still) {
    try {
      await this._verbinden(pw, still);
    } catch (e) {
      this.schluessel = null;
      this.status(this.fehlertext(e), true);
      this.knopfAktualisieren();
      if (!still) alert('Sync fehlgeschlagen.\n\n' + this.fehlertext(e));
    }
  },

  async _verbinden(pw, still) {
    if (!window.FB || !window.FB.bereit) throw new Error('Datenbank nicht erreichbar');
    this.passwort = pw;
    this.id = await this.tresorId(pw);
    this.status('verbinde …');

    const { db, ref, get } = window.FB;
    const snap = await get(ref(db, `schoolTool/tresor/${this.id}`));
    const vorhanden = snap.val();

    if (vorhanden && vorhanden.salz) {
      // Bestehender Tresor: Schlüssel aus dem gespeicherten Salz ableiten
      this.salz = this.vonB64(vorhanden.salz);
      this.schluessel = await this.schluesselAus(pw, this.salz);
      let daten;
      try {
        daten = await this.entschluesseln(vorhanden);
      } catch (e) {
        this.schluessel = null;
        this.status('Falsches Sync-Passwort.', true);
        if (!still) alert('Mit diesem Passwort lassen sich die Daten nicht entschlüsseln.\n\n' +
          'Entweder ist es ein Tippfehler – oder unter diesem Passwort liegt ein fremder Tresor.');
        return;
      }
      localStorage.setItem(this.PASS_KEY, pw);
      const lokalStand = Store.load().standAt || 0;
      const fernStand = vorhanden.stand || 0;
      if (fernStand > lokalStand) {
        if (still || confirm(
          `Auf dem Server liegt ein neuerer Stand (${this.zeit(fernStand)}).\n\n` +
          'Diesen jetzt übernehmen? Die Daten auf diesem Gerät werden ersetzt.')) {
          this.uebernehmen(daten, fernStand);
          this.status('Stand vom Server übernommen (' + this.zeit(fernStand) + ').');
          this.knopfAktualisieren();
          return;
        }
      }
      this.knopfAktualisieren();
      this.status('verbunden');
      await this.hochladen(false);
    } else {
      // Unter diesem Passwort liegt nichts. Das heißt entweder „erstes Gerät“ –
      // oder es ist ein Tippfehler. Weil der Speicherort am Passwort hängt, würde
      // ein Tippfehler sonst stillschweigend einen zweiten, leeren Tresor anlegen
      // und die eigenen Daten unauffindbar machen. Deshalb hier nachfragen.
      const lokal = Store.load().classes || [];
      if (!still && !confirm(
        'Unter diesem Sync-Passwort liegen noch keine Daten.\n\n' +
        'Ist dies dein erstes Gerät? Dann OK – es wird ein neuer Tresor angelegt' +
        (lokal.length ? ` und die ${lokal.length} Klassen von diesem Gerät werden hochgeladen.` : '.') +
        '\n\nErwartest du hier deine Daten von einem anderen Gerät, hast du dich ' +
        'vermutlich vertippt: Abbrechen und noch einmal versuchen.')) {
        this.schluessel = null;
        this.status('Abgebrochen – kein Tresor angelegt.');
        this.knopfAktualisieren();
        return;
      }
      this.salz = crypto.getRandomValues(new Uint8Array(16));
      this.schluessel = await this.schluesselAus(pw, this.salz);
      localStorage.setItem(this.PASS_KEY, pw);
      this.knopfAktualisieren();
      await this.hochladen(false);
      if (!still) alert('Sync eingerichtet.\n\nAuf einem weiteren Gerät dieselbe Seite öffnen, ' +
        'auf „Sync“ klicken und dasselbe Passwort eingeben – dann sind die Daten dort.');
    }
  },

  uebernehmen(daten, stand) {
    daten.standAt = stand;
    Store.save(daten);
    this.letzterStand = stand;
    location.reload();
  },

  /* ---------- Übertragen ---------- */
  geplantHochladen() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hochladen(false), 1500);
  },

  async hochladen(laut) {
    if (!this.aktiv() || this.amLaufen) return;
    this.amLaufen = true;
    try {
      const daten = Store.load();
      const stand = Date.now();
      daten.standAt = stand;
      localStorage.setItem(Store.KEY, JSON.stringify(daten));   // ohne erneuten Sync-Anstoß

      const paket = await this.verschluesseln(daten);
      const { db, ref, set } = window.FB;
      await set(ref(db, `schoolTool/tresor/${this.id}`), {
        ...paket, stand, geraet: this.geraetName(),
      });
      this.letzterStand = stand;
      this.status('gesichert ' + this.zeit(stand));
      if (laut) alert('Daten wurden verschlüsselt hochgeladen.');
    } catch (e) {
      this.status('Hochladen fehlgeschlagen: ' + this.fehlertext(e), true);
      if (laut) alert('Hochladen fehlgeschlagen.\n\n' + this.fehlertext(e));
    } finally {
      this.amLaufen = false;
    }
  },

  async herunterladen(laut) {
    if (!this.aktiv()) return;
    try {
      const { db, ref, get } = window.FB;
      const snap = await get(ref(db, `schoolTool/tresor/${this.id}`));
      const paket = snap.val();
      if (!paket) { alert('Auf dem Server liegt noch nichts.'); return; }
      const daten = await this.entschluesseln(paket);
      if (laut && !confirm(
        `Stand vom Server: ${this.zeit(paket.stand)}\n` +
        `${(daten.classes || []).length} Klassen\n\n` +
        'Übernehmen? Die Daten auf diesem Gerät werden dabei ersetzt.')) return;
      this.uebernehmen(daten, paket.stand || Date.now());
    } catch (e) {
      alert('Herunterladen fehlgeschlagen.\n\n' + this.fehlertext(e));
    }
  },

  /* ---------- Verschlüsselung ---------- */
  async schluesselAus(pw, salz) {
    const basis = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salz, iterations: this.ITERATIONEN, hash: 'SHA-256' },
      basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },

  /* Der Speicherort hängt am Passwort, damit ein neues Gerät nur dieses eine
     Geheimnis braucht. Bewusst ein anderer Zusatz als bei der Verschlüsselung. */
  async tresorId(pw) {
    const h = await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode('school-tool-tresor-v1|' + pw));
    return [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async verschluesseln(daten) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const klar = new TextEncoder().encode(JSON.stringify(daten));
    const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.schluessel, klar);
    return { chiffre: this.nachB64(new Uint8Array(chiffre)),
             iv: this.nachB64(iv), salz: this.nachB64(this.salz) };
  },

  async entschluesseln(paket) {
    const iv = this.vonB64(paket.iv);
    const chiffre = this.vonB64(paket.chiffre);
    const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.schluessel, chiffre);
    return JSON.parse(new TextDecoder().decode(klar));
  },

  nachB64(bytes) {
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  },
  vonB64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); },

  /* ---------- Kleinkram ---------- */
  geraetName() {
    const p = navigator.platform || '';
    if (/iPad|iPhone/i.test(navigator.userAgent)) return 'iPad/iPhone';
    if (/Mac/i.test(p)) return 'Mac';
    if (/Win/i.test(p)) return 'Windows';
    return 'Gerät';
  },

  zeit(ms) {
    if (!ms) return '–';
    const d = new Date(ms);
    const heute = new Date().toDateString() === d.toDateString();
    return heute
      ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' +
        d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  },

  status(text, warnung) {
    const el = document.getElementById('tresor-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('warnung', !!warnung);
  },

  knopfAktualisieren() {
    const knopf = document.getElementById('btn-tresor');
    if (!knopf) return;
    const an = this.aktiv();
    knopf.innerHTML = Icons.raw(an ? 'check' : 'upload') + (an ? 'Sync an' : 'Sync');
    knopf.classList.toggle('aktiv', an);
    knopf.title = an
      ? 'Geräte-Sync läuft. Klicken für Hochladen, Holen oder Beenden.'
      : 'Daten verschlüsselt zwischen deinen Geräten abgleichen';
  },
};

window.Tresor = Tresor;
