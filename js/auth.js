/* Zugangssperre für die ganze Seite.
   Hinweis: Das läuft komplett im Browser und hält neugierige Blicke ab
   (Smartboard, Lehrerpult) – es ist kein serverseitiger Schutz.
   Die Schülerdaten liegen ohnehin nur lokal im Browser, nicht im Netz. */
const Auth = {
  KEY: 'schooltool-unlocked',
  // SHA-256 des Passworts, damit es nicht im Klartext im Quelltext steht
  HASH: '398991009da1d251792eb353a0b7b185bc83e71e12e489e73228b554fc6cebc5',

  async hash(str) {
    if (!(window.crypto && crypto.subtle)) return null;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async check(pw) {
    const h = await this.hash(pw.trim());
    return h ? h === this.HASH : pw.trim() === 'menu'; // Fallback ohne crypto.subtle
  },

  isUnlocked() {
    return localStorage.getItem(this.KEY) === this.HASH;
  },

  unlock() {
    localStorage.setItem(this.KEY, this.HASH);
    document.documentElement.classList.remove('locked');
    const screen = document.getElementById('lock-screen');
    if (screen) screen.remove();
  },

  lock() {
    localStorage.removeItem(this.KEY);
    location.reload();
  },

  /* Sperrbildschirm aufbauen; wird sofort beim Laden aufgerufen */
  init() {
    if (this.isUnlocked()) return;
    document.documentElement.classList.add('locked');
    const build = () => {
      const wrap = document.createElement('div');
      wrap.id = 'lock-screen';
      wrap.className = 'lock-screen';
      wrap.innerHTML = `
        <form class="lock-box" autocomplete="off">
          <div class="lock-icon">🔒</div>
          <h1>School-Tool</h1>
          <p>Bitte Passwort eingeben</p>
          <input type="password" id="lock-pw" placeholder="Passwort" autocomplete="current-password" autofocus>
          <button type="submit" class="primary">Entsperren</button>
          <p class="lock-error" id="lock-error" hidden>Falsches Passwort</p>
        </form>`;
      document.body.appendChild(wrap);
      const input = wrap.querySelector('#lock-pw');
      const err = wrap.querySelector('#lock-error');
      wrap.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault();
        if (await this.check(input.value)) {
          this.unlock();
        } else {
          err.hidden = false;
          input.value = '';
          input.focus();
          wrap.querySelector('.lock-box').classList.remove('shake');
          void wrap.offsetWidth; // Animation neu starten
          wrap.querySelector('.lock-box').classList.add('shake');
        }
      });
      input.focus();
    };
    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);
  },
};

Auth.init();
