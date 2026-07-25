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
  exportBackup() {
    const blob = new Blob([JSON.stringify(this.load(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `school-tool-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  importBackup(file, onDone) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.classes)) throw new Error('Ungültiges Format');
        this.save(data);
        onDone(null);
      } catch (e) {
        onDone(e);
      }
    };
    reader.readAsText(file);
  },

  /* ----- IndexedDB für Sitzpläne (zu groß für localStorage) ----- */
  _db: null,
  openDB() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      const req = indexedDB.open('schooltool', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('seatplans');
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
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
