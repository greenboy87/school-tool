/* Extras: Zufalls-Schüler und Arbeitsphasen-Timer */
const Tools = {
  pickedKeyPrefix: 'schooltool-picked-', // pro Klasse merken, wer schon dran war

  init() {
    this.refreshClassSelect();
    document.getElementById('btn-pick').addEventListener('click', () => this.pick());
    document.getElementById('btn-pick-reset').addEventListener('click', () => {
      const classId = document.getElementById('picker-class').value;
      localStorage.removeItem(this.pickedKeyPrefix + classId);
      document.getElementById('picker-result').textContent = '–';
      this.updateRemaining();
    });
    document.getElementById('picker-class').addEventListener('change', () => this.updateRemaining());

    // Timer
    document.querySelectorAll('.timer-preset').forEach(btn =>
      btn.addEventListener('click', () => this.startTimer(parseInt(btn.dataset.min, 10) * 60)));
    document.getElementById('btn-timer-start').addEventListener('click', () => {
      const min = parseInt(document.getElementById('timer-custom').value, 10);
      if (min > 0) this.startTimer(min * 60);
    });
    document.getElementById('btn-timer-stop').addEventListener('click', () => this.stopTimer());

    // Stoppuhr
    const start = document.getElementById('btn-stoppuhr-start');
    if (start) {
      start.addEventListener('click', () => this.stoppuhrUmschalten());
      document.getElementById('btn-stoppuhr-reset')
        .addEventListener('click', () => this.stoppuhrZuruecksetzen());
      document.getElementById('btn-stoppuhr-voll')
        .addEventListener('click', () => this.stoppuhrVollbild());
      // Der Knopf muss auch stimmen, wenn das Vollbild ueber Esc endet
      document.addEventListener('fullscreenchange', () => this.stoppuhrZeichne());
      this.stoppuhrZeichne();
    }
  },

  /* ---------- Stoppuhr ----------
     Gerechnet wird aus Date.now()-Differenzen, nicht aus gezaehlten Ticks:
     In einem Hintergrund-Tab drosseln Browser die Intervalle, die Uhr ginge
     sonst nach. Das Intervall zeichnet also nur, es zaehlt nicht. */
  stoppuhr: { start: 0, gesammelt: 0, laeuft: false, takt: null },

  stoppuhrZeit() {
    const u = this.stoppuhr;
    return u.gesammelt + (u.laeuft ? Date.now() - u.start : 0);
  },

  /* „07:32,4“ – die Stunde erscheint erst, wenn es sie gibt */
  stoppuhrText(ms) {
    const zz = n => String(n).padStart(2, '0');
    const zehntel = Math.floor(ms / 100) % 10;
    const sek = Math.floor(ms / 1000) % 60;
    const min = Math.floor(ms / 60000) % 60;
    const std = Math.floor(ms / 3600000);
    return (std ? std + ':' + zz(min) : zz(min)) + ':' + zz(sek) + ',' + zehntel;
  },

  stoppuhrZeichne() {
    const anzeige = document.getElementById('stoppuhr-anzeige');
    if (anzeige) anzeige.textContent = this.stoppuhrText(this.stoppuhrZeit());
    const knopf = document.getElementById('btn-stoppuhr-start');
    if (knopf) {
      const laeuft = this.stoppuhr.laeuft;
      knopf.innerHTML = Icons.raw(laeuft ? 'stop' : 'play') + (laeuft ? 'Pause' : 'Start');
      knopf.classList.toggle('primary', !laeuft);
    }
  },

  stoppuhrUmschalten() {
    const u = this.stoppuhr;
    if (u.laeuft) {
      u.gesammelt = this.stoppuhrZeit();
      u.laeuft = false;
      clearInterval(u.takt);
      u.takt = null;
    } else {
      u.start = Date.now();
      u.laeuft = true;
      clearInterval(u.takt);
      u.takt = setInterval(() => this.stoppuhrZeichne(), 50);
    }
    this.stoppuhrZeichne();
  },

  stoppuhrZuruecksetzen() {
    const u = this.stoppuhr;
    clearInterval(u.takt);
    u.takt = null;
    u.laeuft = false;
    u.gesammelt = 0;
    u.start = 0;
    this.stoppuhrZeichne();
  },

  /* Nur die Buehne ins Vollbild, nicht die ganze Seite – so bleiben Start und
     Zuruecksetzen erreichbar, ohne das Vollbild zu verlassen. */
  stoppuhrVollbild() {
    const buehne = document.getElementById('stoppuhr-buehne');
    if (!buehne) return;
    const drin = document.fullscreenElement || document.webkitFullscreenElement;
    if (drin) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    const rein = buehne.requestFullscreen || buehne.webkitRequestFullscreen;
    if (!rein) { alert('Dieser Browser kann den Vollbildmodus hier nicht anzeigen.'); return; }
    const p = rein.call(buehne);
    if (p && p.catch) p.catch(err => alert('Vollbild nicht möglich: ' + err.message));
  },

  refreshClassSelect() {
    const sel = document.getElementById('picker-class');
    const prev = sel.value;
    sel.innerHTML = '';
    for (const cls of Classes.data.classes) {
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = cls.name;
      sel.appendChild(opt);
    }
    if (prev) sel.value = prev;
    this.updateRemaining();
  },

  pick() {
    const classId = document.getElementById('picker-class').value;
    const cls = Classes.data.classes.find(c => c.id === classId);
    const out = document.getElementById('picker-result');
    if (!cls || !cls.students.length) { out.textContent = 'Keine Schüler in der Klasse'; return; }

    const key = this.pickedKeyPrefix + classId;
    let picked = JSON.parse(localStorage.getItem(key) || '[]');
    let pool = cls.students.filter(s => !picked.includes(s.id));
    if (!pool.length) { picked = []; pool = cls.students; } // alle waren dran → neue Runde

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    picked.push(chosen.id);
    localStorage.setItem(key, JSON.stringify(picked));

    // kleine Auslos-Animation
    let ticks = 0;
    const anim = setInterval(() => {
      const r = cls.students[Math.floor(Math.random() * cls.students.length)];
      out.textContent = Classes.studentName(r);
      if (++ticks > 12) {
        clearInterval(anim);
        out.innerHTML = Icons.raw('target') + Classes.studentName(chosen);
        this.updateRemaining();
      }
    }, 80);
  },

  updateRemaining() {
    const classId = document.getElementById('picker-class').value;
    const cls = Classes.data.classes.find(c => c.id === classId);
    const el = document.getElementById('picker-remaining');
    if (!cls) { el.textContent = ''; return; }
    const picked = JSON.parse(localStorage.getItem(this.pickedKeyPrefix + classId) || '[]');
    const remaining = cls.students.filter(s => !picked.includes(s.id)).length;
    el.textContent = cls.students.length ? `${remaining} von ${cls.students.length} noch nicht dran gewesen` : '';
  },

  /* ---------- Timer ---------- */
  timerId: null,
  endTime: null,

  startTimer(seconds) {
    this.stopTimer();
    this.endTime = Date.now() + seconds * 1000;
    this.timerId = setInterval(() => this.tickTimer(), 250);
    this.tickTimer();
  },

  stopTimer() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    const d = document.getElementById('timer-display');
    d.textContent = '–:–';
    d.classList.remove('warning');
  },

  tickTimer() {
    const d = document.getElementById('timer-display');
    const left = Math.max(0, Math.round((this.endTime - Date.now()) / 1000));
    const m = Math.floor(left / 60), s = left % 60;
    d.textContent = `${m}:${String(s).padStart(2, '0')}`;
    d.classList.toggle('warning', left <= 60);
    if (left <= 0) {
      this.stopTimer();
      d.innerHTML = Icons.raw('timer') + 'Zeit um!';
      this.gong();
    }
  },

  gong() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.7, 1.4].forEach(delay => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  },
};
