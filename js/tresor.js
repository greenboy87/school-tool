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
      'Sync-Passwort eingeben\n\n' +
      'Hast du den Sync auf einem anderen Gerät (z. B. Safari) schon eingerichtet?\n' +
      '→ Dann gib hier GENAU DASSELBE Passwort ein. Die Daten von dort erscheinen ' +
      'dann auf diesem Gerät.\n\n' +
      'Ist dies dein erstes Gerät?\n' +
      `→ Dann wähle jetzt ein Passwort, mindestens ${this.MIN_LAENGE} Zeichen. Damit ` +
      'werden deine Daten verschlüsselt, bevor sie übertragen werden.\n\n' +
      'ACHTUNG: Ohne dieses Passwort sind die Daten nicht wiederherstellbar. ' +
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
      const lokal = Store.load();
      const lokalStand = lokal.standAt || 0;
      const fernStand = vorhanden.stand || 0;
      if (fernStand > lokalStand) {
        // Beide Seiten benennen: Sonst weiß man nicht, was man gerade ersetzt.
        const zaehle = d => {
          const k = (d.classes || []).length;
          const s = (d.classes || []).reduce((a, c) => a + (c.students || []).length, 0);
          return `${k} ${k === 1 ? 'Klasse' : 'Klassen'}, ${s} Schüler`;
        };
        if (still || confirm(
          'Passwort stimmt – auf dem Server liegen Daten.\n\n' +
          `VOM SERVER (${this.zeit(fernStand)}, ${vorhanden.geraet || 'anderes Gerät'}):\n` +
          `   ${zaehle(daten)}\n\n` +
          'AUF DIESEM GERÄT' + (lokalStand ? ` (${this.zeit(lokalStand)})` : ' (noch nie abgeglichen)') + ':\n' +
          `   ${zaehle(lokal)}\n\n` +
          'Den Stand vom Server übernehmen? Die Daten auf diesem Gerät werden dabei ersetzt.')) {
          await this.uebernehmen(daten, fernStand);
          this.status('Stand vom Server übernommen (' + this.zeit(fernStand) + ').');
          this.knopfAktualisieren();
          return;
        }
        /* Abgelehnt – und jetzt wird es heikel: Auf dem Server liegt der neuere
           Stand, weitermachen hiesse, ihn durch den aelteren dieses Geraets zu
           ersetzen. Auf einem frisch eingerichteten Browser waere das der leere.
           Dass „Abbrechen“ genau das ausloest, sieht man der ersten Frage nicht
           an, deshalb hier noch einmal nachfragen – mit beiden Zahlen. */
        if (!confirm(
          'Sicher? Dann wird der Stand auf dem Server durch den Stand dieses Geräts ersetzt:\n\n' +
          `AUF DEM SERVER (${this.zeit(fernStand)}, ${vorhanden.geraet || 'anderes Gerät'}):\n` +
          `   ${zaehle(daten)}\n\n` +
          'AUF DIESEM GERÄT' + (lokalStand ? ` (${this.zeit(lokalStand)})` : ' (noch nie abgeglichen)') + ':\n' +
          `   ${zaehle(lokal)}\n\n` +
          'OK: Server überschreiben.\n' +
          'Abbrechen: nichts verändern – der Sync bleibt auf diesem Gerät aus.')) {
          localStorage.removeItem(this.PASS_KEY);
          this.passwort = this.id = this.salz = this.schluessel = null;
          this.status('Nichts verändert – der Sync ist auf diesem Gerät aus.');
          this.knopfAktualisieren();
          if (!still) alert('Es wurde nichts verändert – weder hier noch auf dem Server.\n\n' +
            'Der Sync ist auf diesem Gerät ausgeschaltet. Über „Sync“ kannst du es ' +
            'jederzeit erneut versuchen.');
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

  async uebernehmen(daten, stand) {
    daten.standAt = stand;
    Store.save(daten);
    this.letzterStand = stand;
    // Sitzpläne liegen in eigenen Knoten – vor dem Neuladen mitholen
    this.status('hole Sitzpläne und Fotos …');
    try { await this.dateienHolen(); } catch (e) { console.error('Dateien:', e); }
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
      const { db, ref, update } = window.FB;
      // update statt set: ein set würde den Sitzplan-Ast „plaene“ mitlöschen
      await update(ref(db, `schoolTool/tresor/${this.id}`), {
        ...paket, stand, geraet: this.geraetName(),
      });
      this.letzterStand = stand;
      this.status('gesichert ' + this.zeit(stand));

      // Sitzpläne getrennt behandeln: Wenn hier etwas klemmt, sind die
      // Hauptdaten trotzdem gesichert – die Meldung darf das nicht verwischen.
      let planFehler = null;
      try { await this.dateienHochladen(); }
      catch (e) { planFehler = this.fehlertext(e); }
      /* Grosse Dateien melden beim Hochladen ihren Fortschritt („Teil 3 von 6“).
         Diese Meldung muss am Ende wieder weichen, sonst steht sie da, als haenge
         die Uebertragung noch. */
      this.status(planFehler
        ? 'gesichert ' + this.zeit(stand) + ' · Dateien nicht: ' + planFehler
        : 'gesichert ' + this.zeit(stand), !!planFehler);

      if (laut) alert(planFehler
        ? 'Daten wurden verschlüsselt hochgeladen.\n\nDie Sitzpläne konnten nicht ' +
          'mitgenommen werden:\n' + planFehler
        : 'Daten wurden verschlüsselt hochgeladen.');
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
      await this.uebernehmen(daten, paket.stand || Date.now());
    } catch (e) {
      alert('Herunterladen fehlgeschlagen.\n\n' + this.fehlertext(e));
    }
  },

  /* ---------- Sitzpläne ----------
     Die PDFs liegen nicht im normalen Speicher, sondern in IndexedDB – sie müssen
     deshalb einzeln mitgenommen werden. Jeder Plan bekommt seinen eigenen Knoten,
     damit ein großes PDF nicht die ganze Übertragung sprengt. Verschlüsselt wird
     mit demselben Schlüssel wie die übrigen Daten. */
  /* Firebase weist jeden Wert ueber 10.485.760 Bytes ab ("value argument
     contains a string greater than 10485760 utf8 bytes") – gemessen, nicht
     geschaetzt. Grosse Dateien werden deshalb in Stuecke zerlegt und einzeln
     abgelegt; dadurch faellt diese Grenze weg. Was bleibt, ist die Vernunft:
     Jedes Geraet laedt beim Abgleich alles herunter, und 15 MiB je Sitzplan
     sind bei 14 Klassen schon gut 200 MB. */
  MAX_PLAN: 15 * 1024 * 1024,
  TEIL_GROESSE: 2 * 1000 * 1000,      // Zeichen je Stueck, mit Abstand unter der Grenze
  PLAN_MERKER: 'tresor-plaene',

  merker() {
    try { return JSON.parse(localStorage.getItem(this.PLAN_MERKER) || '{}'); }
    catch (e) { return {}; }
  },

  fingerabdruck(name, groesse) { return `${name}|${groesse}`; },

  /* Sitzpläne und Fotos verhalten sich gleich – ein gemeinsamer Weg für beide */
  DATEIARTEN: [
    { knoten: 'plaene', ids: () => Store.allSeatplanIds(), holen: (id) => Store.getSeatplan(id),
      legen: (id, datei) => Store.putSeatplan(id, datei), standard: 'Sitzplan.pdf', typ: 'application/pdf' },
    { knoten: 'fotos', ids: () => Store.allFotoIds(), holen: (id) => Store.getFoto(id),
      legen: (id, datei) => Store.putFoto(id, datei), standard: 'Foto', typ: 'image/jpeg' },
  ],

  async dateienHochladen() {
    if (!this.aktiv()) return;
    const merker = this.merker();
    const { db, ref, set } = window.FB;
    for (const art of this.DATEIARTEN) {
      for (const id of await art.ids()) {
        const eintrag = await art.holen(id);
        if (!eintrag || !eintrag.blob) continue;
        const schluessel = art.knoten + ':' + id;
        const fp = this.fingerabdruck(eintrag.name, eintrag.blob.size);
        if (merker[schluessel] === fp) continue;          // unverändert
        if (eintrag.blob.size > this.MAX_PLAN) {
          const mb = (n) => (n / 1024 / 1024).toFixed(1).replace('.', ',');
          this.status(`„${eintrag.name}“ ist zu groß für den Sync ` +
            `(${mb(eintrag.blob.size)} MB, erlaubt sind ${mb(this.MAX_PLAN)} MB).`, true);
          continue;
        }
        const bytes = new Uint8Array(await eintrag.blob.arrayBuffer());
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.schluessel, bytes);
        const text = this.nachB64(new Uint8Array(chiffre));
        const ziel = `schoolTool/tresor/${this.id}/${art.knoten}/${id}`;
        const kopf = {
          iv: this.nachB64(iv),
          name: eintrag.name || art.standard,
          typ: eintrag.type || art.typ,
          stand: Date.now(),
        };

        if (text.length <= this.TEIL_GROESSE) {
          await set(ref(db, ziel), { ...kopf, chiffre: text });
        } else {
          /* In Stuecke zerlegt: Jedes einzeln geschrieben, damit weder ein
             Wert noch ein Schreibvorgang an die Grenzen der Datenbank stoesst.
             Erst der Kopf – ein „set“ raeumt dabei alte Stuecke mit weg. */
          const stuecke = Math.ceil(text.length / this.TEIL_GROESSE);
          await set(ref(db, ziel), { ...kopf, teile: stuecke });
          for (let i = 0; i < stuecke; i++) {
            this.status(`lade „${kopf.name}“ … Teil ${i + 1} von ${stuecke}`);
            await set(ref(db, `${ziel}/t${i}`),
              text.slice(i * this.TEIL_GROESSE, (i + 1) * this.TEIL_GROESSE));
          }
        }
        merker[schluessel] = fp;
      }
    }
    localStorage.setItem(this.PLAN_MERKER, JSON.stringify(merker));
  },

  async dateienHolen() {
    if (!this.aktiv()) return 0;
    const { db, ref, get } = window.FB;
    const merker = {};
    let geholt = 0;
    for (const art of this.DATEIARTEN) {
      const alle = (await get(ref(db, `schoolTool/tresor/${this.id}/${art.knoten}`))).val() || {};
      for (const [id, p] of Object.entries(alle)) {
        try {
          const iv = this.vonB64(p.iv);
          const text = this.teileZusammensetzen(p, art.knoten, id);
          if (text === null) continue;
          const klar = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv }, this.schluessel, this.vonB64(text));
          const datei = new File([klar], p.name || art.standard, { type: p.typ || art.typ });
          await art.legen(id, datei);
          merker[art.knoten + ':' + id] = this.fingerabdruck(datei.name, datei.size);
          geholt++;
        } catch (e) {
          console.error('Datei konnte nicht übernommen werden:', art.knoten, id, e);
        }
      }
    }
    localStorage.setItem(this.PLAN_MERKER, JSON.stringify(merker));
    return geholt;
  },

  /* ---------- Server-Backup ----------
     Der Rettungsanker: holt den Stand vom Server, entschlüsselt ihn und legt ihn
     als Datei ab. Anders als „Vom Server holen“ wird dabei nichts in diesem
     Browser verändert und nichts hochgeladen – das ist der Sinn der Sache. Es
     funktioniert deshalb auch dann noch, wenn der lokale Stand leer oder kaputt
     ist, und sogar ohne eingerichteten Sync: Das Passwort genügt.
     Sitzpläne und Fotos kommen mit; das Backup dieses Geräts lässt sie weg,
     weil sie nicht im normalen Speicher liegen, sondern in IndexedDB. */
  async serverBackup() {
    try {
      if (!window.FB || !window.FB.bereit) throw new Error('Datenbank nicht erreichbar');
      let pw = this.passwort || localStorage.getItem(this.PASS_KEY);
      if (!pw) {
        pw = (prompt(
          'Sync-Passwort eingeben.\n\n' +
          'Damit wird der Stand vom Server geholt und als Datei gespeichert. ' +
          'An den Daten in diesem Browser ändert sich dabei nichts.') || '').trim();
        if (!pw) return;
      }

      this.status('hole Serverstand …');
      const id = await this.tresorId(pw);
      const { db, ref, get } = window.FB;
      const paket = (await get(ref(db, `schoolTool/tresor/${id}`))).val();
      if (!paket || !paket.salz) {
        this.status('Unter diesem Passwort liegt nichts.', true);
        alert('Unter diesem Sync-Passwort liegt auf dem Server nichts.\n\n' +
          'Entweder ist es ein Tippfehler, oder der Tresor gehört zu einem anderen Passwort.');
        return;
      }

      const schluessel = await this.schluesselAus(pw, this.vonB64(paket.salz));
      let daten;
      try {
        daten = await this.entschluesseln(paket, schluessel);
      } catch (e) {
        this.status('Falsches Sync-Passwort.', true);
        alert('Mit diesem Passwort lassen sich die Daten nicht entschlüsseln.\n\n' +
          'Entweder ist es ein Tippfehler – oder unter diesem Passwort liegt ein fremder Tresor.');
        return;
      }

      // Sitzpläne und Fotos liegen in eigenen Knoten und werden einzeln geholt.
      // Eine Datei, die sich nicht entschlüsseln lässt, darf den Rest nicht aufhalten.
      const dateien = {};
      let dabei = 0, uebersprungen = 0;
      for (const art of this.DATEIARTEN) {
        this.status(`hole ${art.knoten} …`);
        const alle = (await get(ref(db, `schoolTool/tresor/${id}/${art.knoten}`))).val() || {};
        const ziel = dateien[art.knoten] = {};
        for (const [dateiId, p] of Object.entries(alle)) {
          try {
            const klar = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: this.vonB64(p.iv) }, schluessel, this.vonB64(p.chiffre));
            ziel[dateiId] = {
              name: p.name || art.standard,
              typ: p.typ || art.typ,
              b64: this.nachB64(new Uint8Array(klar)),
            };
            dabei++;
          } catch (e) {
            uebersprungen++;
            console.error('Datei nicht lesbar:', art.knoten, dateiId, e);
          }
        }
      }

      Store.alsDateiSpeichern({
        schoolTool: 'server-backup',
        version: 1,
        stand: paket.stand || 0,
        geraet: paket.geraet || '',
        geholtAm: Date.now(),
        daten,
        dateien,
      }, `school-tool-server-backup-${Store.heuteStempel()}.json`);

      const klassen = (daten.classes || []).length;
      const schueler = (daten.classes || []).reduce((a, c) => a + (c.students || []).length, 0);
      this.status('Server-Backup gespeichert (' + this.zeit(paket.stand) + ')');
      alert(
        'Server-Backup gespeichert.\n\n' +
        `Stand vom Server: ${this.zeit(paket.stand)}` +
        (paket.geraet ? ` (${paket.geraet})` : '') + '\n' +
        `${klassen} ${klassen === 1 ? 'Klasse' : 'Klassen'}, ${schueler} Schüler\n` +
        `${dabei} Sitzpläne/Fotos` +
        (uebersprungen ? `, ${uebersprungen} nicht lesbar` : '') + '\n\n' +
        'Die Datei liegt bei den Downloads. In diesem Browser wurde nichts verändert – ' +
        'zum Zurückspielen den Knopf „Wiederherstellen“ nehmen.');
    } catch (e) {
      this.status('Server-Backup fehlgeschlagen: ' + this.fehlertext(e), true);
      alert('Server-Backup fehlgeschlagen.\n\n' + this.fehlertext(e));
    }
  },

  /* Eine Datei liegt entweder ganz in „chiffre“ oder in Stuecken t0, t1, …
     Fehlt ein Stueck, wird die Datei uebersprungen statt halb geschrieben –
     ein halber Sitzplan waere schlimmer als gar keiner. */
  teileZusammensetzen(p, knoten, id) {
    if (typeof p.chiffre === 'string') return p.chiffre;
    if (!p.teile) {
      console.error('Datei ohne Inhalt:', knoten, id);
      return null;
    }
    const stuecke = [];
    for (let i = 0; i < p.teile; i++) {
      const t = p['t' + i];
      if (typeof t !== 'string') {
        console.error(`Datei unvollständig: ${knoten}/${id}, Teil ${i + 1} von ${p.teile} fehlt`);
        return null;
      }
      stuecke.push(t);
    }
    return stuecke.join('');
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

  async entschluesseln(paket, schluessel = this.schluessel) {
    const iv = this.vonB64(paket.iv);
    const chiffre = this.vonB64(paket.chiffre);
    const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, schluessel, chiffre);
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
