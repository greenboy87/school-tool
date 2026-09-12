/* Datenhaltung: Klassen/Noten in localStorage, Sitzplan-Dateien in IndexedDB */
const Store = {
  KEY: 'schooltool-data',

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || { classes: [] };
    } catch (e) {
      return { classes: [] };
    }
  },

  save(data) {
    localStorage.setItem(this.KEY, JSON.stringify(data));
  },

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  /* ----- Backup ----- */
  /* Heutiges Datum als 2026-09-12 – ohne toISOString(), das in der Sommerzeit
     bei spaeter Uhrzeit schon den naechsten Tag anzeigt */
  heuteStempel() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  },

  alsDateiSpeichern(objekt, name) {
    const blob = new Blob([JSON.stringify(objekt, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  exportBackup() {
    this.alsDateiSpeichern(this.load(), `school-tool-backup-${this.heuteStempel()}.json`);
  },

  importBackup(file, onDone) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const roh = JSON.parse(reader.result);
        // Zwei Formate: das schlichte Backup dieses Geraets – und das
        // Server-Backup, bei dem die Daten eine Ebene tiefer liegen und
        // Sitzplaene und Fotos beiliegen.
        const istServer = roh && roh.schoolTool === 'server-backup';
        const data = istServer ? roh.daten : roh;
        if (!data || !Array.isArray(data.classes)) throw new Error('Ungültiges Format');
        this.save(data);
        if (istServer && roh.dateien) await this.dateienZurueckschreiben(roh.dateien);
        onDone(null);
      } catch (e) {
        onDone(e);
      }
    };
    reader.readAsText(file);
  },

  /* Sitzplaene und Fotos aus einem Server-Backup zurueck in IndexedDB legen.
     Eine kaputte Datei darf die uebrigen nicht aufhalten. */
  async dateienZurueckschreiben(dateien) {
    const ziele = {
      plaene: (id, datei) => this.putSeatplan(id, datei),
      fotos: (id, datei) => this.putFoto(id, datei),
    };
    for (const [knoten, eintraege] of Object.entries(dateien)) {
      const legen = ziele[knoten];
      if (!legen) continue;
      for (const [id, p] of Object.entries(eintraege || {})) {
        try {
          const bytes = Uint8Array.from(atob(p.b64), c => c.charCodeAt(0));
          await legen(id, new File([bytes], p.name || 'Datei',
            { type: p.typ || 'application/octet-stream' }));
        } catch (e) {
          console.error('Datei aus dem Backup uebersprungen:', knoten, id, e);
        }
      }
    }
  },

  /* ----- IndexedDB für Dateien (zu groß für localStorage) -----
     „seatplans“ enthält je Klasse einen Sitzplan, „fotos“ die Bilder, die an
     Terminen hängen. Beide werden vom Sync einzeln verschlüsselt übertragen. */
  _db: null,
  openDB() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      const req = indexedDB.open('schooltool', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('seatplans')) db.createObjectStore('seatplans');
        if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos');
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  /* ----- Fotos ----- */
  async putFoto(id, file) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('fotos', 'readwrite');
      tx.objectStore('fotos').put({ name: file.name || 'Foto', type: file.type, blob: file }, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  async getFoto(id) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('fotos').objectStore('fotos').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteFoto(id) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('fotos', 'readwrite');
      tx.objectStore('fotos').delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  async allFotoIds() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('fotos').objectStore('fotos').getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async putSeatplan(classId, file) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('seatplans', 'readwrite');
      tx.objectStore('seatplans').put({ name: file.name, type: file.type, blob: file }, classId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  /* Alle Klassen-IDs, zu denen ein Sitzplan hinterlegt ist (für den Sync) */
  async allSeatplanIds() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('seatplans').objectStore('seatplans').getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async getSeatplan(classId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('seatplans').objectStore('seatplans').get(classId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteSeatplan(classId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('seatplans', 'readwrite');
      tx.objectStore('seatplans').delete(classId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },
};
