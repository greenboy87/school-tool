/* Zugangssperre für die ganze Seite.
   Das Passwort wird beim Öffnen abgefragt. Danach bleibt die Seite offen –
   TIMEOUT_MIN = 0 heißt: keine Sperre wegen Untätigkeit. Ein Wert grösser 0
   würde die Freigabe nach so vielen Minuten ohne Nutzung ablaufen lassen.

   Hinweis: Das läuft komplett im Browser und hält neugierige Blicke ab
   (Smartboard, Lehrerpult) – es ist kein serverseitiger Schutz.
   Die Schülerdaten liegen ohnehin nur lokal im Browser, nicht im Netz. */
const Auth = {
  KEY: 'schooltool-unlock',
  // SHA-256 des Passworts, damit es nicht im Klartext im Quelltext steht
  HASH: '398991009da1d251792eb353a0b7b185bc83e71e12e489e73228b554fc6cebc5',
  TIMEOUT_MIN: 0,      // 0 = läuft nicht von selbst ab

  async hash(str) {
    if (!(window.crypto && crypto.subtle)) return null;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async check(pw) {
    const h = await this.hash(pw.trim());
    return h ? h === this.HASH : pw.trim() === 'menu'; // Fallback ohne crypto.subtle
  },

  _read() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); }
    catch (e) { return null; }
  },

  _write() {
    localStorage.setItem(this.KEY, JSON.stringify({ h: this.HASH, t: Date.now() }));
    this._lastWrite = Date.now();
  },

  isUnlocked() {
    const e = this._read();
    if (!e || e.h !== this.HASH) return false;
    if (this.TIMEOUT_MIN > 0 && Date.now() - e.t > this.TIMEOUT_MIN * 60000) {
      localStorage.removeItem(this.KEY);
      return false;
    }
    return true;
  },

  /* Zeitstempel auffrischen (gedrosselt, damit nicht bei jedem Tastendruck geschrieben wird) */
  touch() {
    if (Date.now() - (this._lastWrite || 0) < 30000) return;
    if (this.isUnlocked()) this._write();
  },

  unlock() {
    this._write();
    document.documentElement.classList.remove('locked');
    const screen = document.getElementById('lock-screen');
    if (screen) screen.remove();
    this._watch();
  },

  lock() {
    localStorage.removeItem(this.KEY);
    document.documentElement.classList.add('locked');
    this._build();
  },

  /* Nur nötig, wenn die Freigabe ablaufen soll */
  _watch() {
    if (this._watching || this.TIMEOUT_MIN <= 0) return;
    this._watching = true;
    ['pointerdown', 'keydown', 'wheel'].forEach(ev =>
      document.addEventListener(ev, () => this.touch(), { passive: true }));
    setInterval(() => { if (!this.isUnlocked()) this.lock(); }, 30000);
  },

  _build() {
    if (document.getElementById('lock-screen')) return;
    const wrap = document.createElement('div');
    wrap.id = 'lock-screen';
    wrap.className = 'lock-screen';
    wrap.innerHTML = `
      <form class="lock-box" autocomplete="off">
        <div class="lock-icon">${Icons.raw('lock')}</div>
        <h1>School-Tool</h1>
        <p>Bitte Passwort eingeben</p>
        <input type="password" id="lock-pw" placeholder="Passwort" autocomplete="current-password" autofocus>
        <button type="submit" class="primary">Entsperren</button>
        <p class="lock-error" id="lock-error" hidden>Falsches Passwort</p>
      </form>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('#lock-pw');
    const err = wrap.querySelector('#lock-error');
    const box = wrap.querySelector('.lock-box');
    wrap.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      if (await this.check(input.value)) {
        this.unlock();
      } else {
        err.hidden = false;
        input.value = '';
        input.focus();
        box.classList.remove('shake');
        void wrap.offsetWidth; // Animation neu starten
        box.classList.add('shake');
      }
    });
    input.focus();
  },

  init() {
    localStorage.removeItem('schooltool-unlocked'); // Altlast aus früherer Version
    if (this.isUnlocked()) { this._watch(); return; }
    document.documentElement.classList.add('locked');
    if (document.body) this._build();
    else document.addEventListener('DOMContentLoaded', () => this._build());
  },
};

Auth.init();
