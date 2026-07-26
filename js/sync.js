/* Geräteübergreifende Speicherung ohne fremden Server.

   Du wählst einmal eine Datei aus – am besten in deiner iCloud Drive. Danach
   schreibt das Tool jede Änderung selbst in diese Datei, und iCloud verteilt sie
   auf deine Geräte. Auf dem zweiten Gerät verbindest du dieselbe Datei einmal,
   danach läuft es dort genauso.

   Technisch: File System Access API (Chrome/Edge). Die Dateiberechtigung wird
   in IndexedDB gemerkt, damit sie einen Neustart des Browsers übersteht. */
const Sync = {
  DB: 'schooltool-sync',
  STORE: 'handles',
  handle: null,
  zuletztGeschrieben: 0,

  verfuegbar() { return typeof window.showSaveFilePicker === 'function'; },

  async init() {
    const btn = document.getElementById('btn-sync');
    if (!btn) return;

    if (!this.verfuegbar()) {
      btn.hidden = true;
      return;
    }
    btn.addEventListener('click', () => this.menue());

    this.handle = await this.handleLaden();
    if (this.handle) {
      const ok = await this.rechtePruefen(false);
      if (ok) await this.beimStartAbgleichen();
      else this.status('Verbindung zur Datei muss bestätigt werden', true);
    }
    this.knopfAktualisieren();

    // Nach jedem Speichern in die Datei schreiben (gebündelt)
    const original = Store.save.bind(Store);
    Store.save = (data) => {
      original(data);
      this.geplantSchreiben();
    };
  },

  /* ---------- Dateiauswahl ---------- */
  async menue() {
    if (!this.handle) { await this.verbinden(); return; }
    const name = this.handle.name;
    const wahl = confirm(
      `Verbunden mit „${name}“.\n\n` +
      'OK: Jetzt von dieser Datei laden (überschreibt die Daten in diesem Browser).\n' +
      'Abbrechen: Verbindung ändern oder trennen.');
    if (wahl) { await this.ausDateiLaden(true); return; }
    if (confirm('Andere Datei verbinden?\n\nAbbrechen trennt die Verbindung.')) await this.verbinden();
    else { await this.handleSpeichern(null); this.handle = null; this.knopfAktualisieren();
           this.status('Verbindung getrennt'); }
  },

  async verbinden() {
    const bestehende = confirm(
      'Bestehende Datei öffnen oder neue anlegen?\n\n' +
      'OK: bestehende Datei öffnen (z. B. auf dem zweiten Gerät)\n' +
      'Abbrechen: neue Datei anlegen');
    try {
      if (bestehende) {
        const [h] = await window.showOpenFilePicker({
          types: [{ description: 'School-Tool Daten', accept: { 'application/json': ['.json'] } }],
        });
        this.handle = h;
        await this.handleSpeichern(h);
        await this.ausDateiLaden(true);
      } else {
        this.handle = await window.showSaveFilePicker({
          suggestedName: 'school-tool-daten.json',
          types: [{ description: 'School-Tool Daten', accept: { 'application/json': ['.json'] } }],
        });
        await this.handleSpeichern(this.handle);
        await this.schreiben();
        this.status('Datei angelegt und gespeichert');
      }
      this.knopfAktualisieren();
    } catch (e) {
      if (e.name !== 'AbortError') alert('Datei konnte nicht verbunden werden: ' + e.message);
    }
  },

  /* ---------- Lesen und Schreiben ---------- */
  async beimStartAbgleichen() {
    try {
      const datei = await this.handle.getFile();
      const inhalt = JSON.parse(await datei.text());
      const lokal = Store.load();
      const standDatei = inhalt.savedAt || 0;
      const standLokal = lokal.savedAt || 0;

      if (standDatei > standLokal) {
        Store.save(inhalt);
        this.status('Aus der Datei geladen (' + this.zeit(standDatei) + ')');
        location.reload();
      } else if (standLokal > standDatei) {
        await this.schreiben();
        this.status('Datei aktualisiert');
      } else {
        this.status('aktuell');
      }
    } catch (e) {
      this.status('Datei konnte nicht gelesen werden', true);
    }
  },

  async ausDateiLaden(fragen) {
    try {
      if (!await this.rechtePruefen(true)) return;
      const datei = await this.handle.getFile();
      const inhalt = JSON.parse(await datei.text());
      if (!inhalt || !Array.isArray(inhalt.classes)) throw new Error('Unerwartetes Dateiformat');
      if (fragen && !confirm(
        `Daten aus „${this.handle.name}“ laden?\n\n` +
        `Stand der Datei: ${this.zeit(inhalt.savedAt)}\n` +
        'Die Daten in diesem Browser werden dabei ersetzt.')) return;
      Store.save(inhalt);
      location.reload();
    } catch (e) {
      alert('Laden fehlgeschlagen: ' + e.message);
    }
  },

  geplantSchreiben() {
    if (!this.handle) return;
    clearTimeout(this._timer);
    this.status('wird gespeichert …');
    this._timer = setTimeout(() => this.schreiben(), 1200);
  },

  async schreiben() {
    if (!this.handle) return;
    try {
      if (!await this.rechtePruefen(false)) { this.status('Freigabe nötig', true); return; }
      const daten = Store.load();
      daten.savedAt = Date.now();
      localStorage.setItem(Store.KEY, JSON.stringify(daten));   // Zeitstempel auch lokal merken
      const w = await this.handle.createWritable();
      await w.write(JSON.stringify(daten, null, 1));
      await w.close();
      this.zuletztGeschrieben = daten.savedAt;
      this.status('gespeichert ' + this.zeit(daten.savedAt));
    } catch (e) {
      this.status('Schreiben fehlgeschlagen', true);
    }
  },

  async rechtePruefen(nachfragen) {
    if (!this.handle) return false;
    const opt = { mode: 'readwrite' };
    if (await this.handle.queryPermission(opt) === 'granted') return true;
    if (!nachfragen) return false;
    return await this.handle.requestPermission(opt) === 'granted';
  },

  /* ---------- Anzeige ---------- */
  knopfAktualisieren() {
    const btn = document.getElementById('btn-sync');
    if (!btn) return;
    btn.innerHTML = Icons.raw(this.handle ? 'check' : 'upload') +
      (this.handle ? 'Datei verbunden' : 'Datei verbinden');
    btn.title = this.handle
      ? `Verbunden mit „${this.handle.name}“. Klicken zum Laden, Wechseln oder Trennen.`
      : 'Daten automatisch in eine Datei schreiben (z. B. in iCloud Drive), um sie auf mehreren Geräten zu haben.';
  },

  status(text, warnung) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('warn', !!warnung);
  },

  zeit(ms) {
    return ms ? new Date(ms).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'unbekannt';
  },

  /* ---------- Dateiberechtigung merken ---------- */
  async db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async handleSpeichern(h) {
    const db = await this.db();
    return new Promise(res => {
      const tx = db.transaction(this.STORE, 'readwrite');
      if (h) tx.objectStore(this.STORE).put(h, 'datei');
      else tx.objectStore(this.STORE).delete('datei');
      tx.oncomplete = res;
    });
  },
  async handleLaden() {
    try {
      const db = await this.db();
      return await new Promise(res => {
        const req = db.transaction(this.STORE).objectStore(this.STORE).get('datei');
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
      });
    } catch (_) { return null; }
  },
};
