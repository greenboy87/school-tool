/* Reiter Tools: Stimmton, Stimmgerät und Klangschale.

   Alles entsteht im Browser – keine Audiodateien. Das Stimmgerät hört über das
   Mikrofon zu, erkennt die Tonhöhe per Autokorrelation und zeigt die
   Abweichung in Cent. Nichts davon wird gespeichert oder verschickt. */
const Klang = {
  ctx: null,
  audio() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
};

/* Kammerton fest a' = 440 Hz; Notennamen deutsch (H statt B) */
const Noten = {
  NAMEN: ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'],
  kammerton() { return 440; },
  frequenz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },
  name(midi) { return this.NAMEN[((midi % 12) + 12) % 12]; },
};

const Stimmton = {
  ton: null,      // { midi, osc, gain, knopf }

  init() {
    const b = document.getElementById('stimmen-a');
    if (!b) return;
    b.addEventListener('click', () => this.umschalten(69, b));
    document.querySelectorAll('.tab-btn').forEach(t => t.addEventListener('click', () => {
      if (t.dataset.tab !== 'ampel' && b.ownerDocument === document) this.aus();
    }));
  },

  umschalten(midi, knopf) {
    const gleich = this.ton && this.ton.knopf === knopf;
    this.aus();
    if (gleich) return;
    const ctx = Klang.audio();
    const osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    // Dreieck, oben etwas gedämpft: klar, aber nicht schrill
    osc.type = 'triangle';
    osc.frequency.value = Noten.frequenz(midi);
    filter.type = 'lowpass';
    filter.frequency.value = 2500;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.08);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start();
    this.ton = { midi, osc, gain, knopf };
    knopf.classList.add('active');
  },

  aus() {
    if (!this.ton) return;
    const { osc, gain, knopf } = this.ton, t = Klang.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.stop(t + 0.15);
    knopf.classList.remove('active');
    this.ton = null;
  },
};

const Stimmgeraet = {
  stream: null,
  analyser: null,
  puffer: null,
  verlauf: [],
  raf: null,
  rafWin: null,
  el: null,

  init() {
    this.el = document.getElementById('stimmen');
    const b = document.getElementById('stimmen-mikro');
    if (!b || !this.el) return;
    b.addEventListener('click', () => (this.stream ? this.stopp() : this.start()));
    document.querySelectorAll('.tab-btn').forEach(t => t.addEventListener('click', () => {
      if (t.dataset.tab !== 'ampel' && this.el.ownerDocument === document) this.stopp();
    }));
    // Ins kleine Fenster umgezogen oder zurück: dort weiterzeichnen
    this.el.addEventListener('umgezogen', () => { if (this.stream) { this.bildStoppen(); this.schleife(); } });
  },

  /* Elemente über die Karte suchen – sie kann in einem anderen Fenster liegen */
  $(id) { return this.el.querySelector('#' + id); },

  bildStoppen() {
    if (this.rafWin) try { this.rafWin.cancelAnimationFrame(this.raf); } catch (e) { /* Fenster schon zu */ }
    this.raf = this.rafWin = null;
  },

  async start() {
    const ctx = Klang.audio();
    try {
      // Ohne Rauschunterdrückung – die verfälscht sonst die Tonhöhe
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      this.info('Kein Zugriff aufs Mikrofon');
      return;
    }
    const quelle = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    quelle.connect(this.analyser);
    this.puffer = new Float32Array(this.analyser.fftSize);
    this.verlauf = [];
    this.knopf(true);
    this.info('Spiel oder sing einen Ton');
    this.schleife();
  },

  stopp() {
    if (!this.stream) return;
    this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.bildStoppen();
    this.knopf(false);
    this.anzeigen(null);
    this.info('Mikrofon aus');
  },

  knopf(an) {
    const b = this.$('stimmen-mikro');
    b.innerHTML = Icons.raw(an ? 'stop' : 'mic') + (an ? 'Stimmgerät stoppen' : 'Stimmgerät starten');
    b.classList.toggle('primary', an);
  },

  info(t) { this.$('stimmen-info').textContent = t; },

  schleife() {
    if (!this.stream) return;
    this.analyser.getFloatTimeDomainData(this.puffer);
    const f = this.tonhoehe(this.puffer, Klang.ctx.sampleRate);
    if (f) {
      // Median der letzten Werte glättet Ausreißer (Oktavsprünge)
      this.verlauf.push(f);
      if (this.verlauf.length > 5) this.verlauf.shift();
      const m = [...this.verlauf].sort((a, b) => a - b)[Math.floor(this.verlauf.length / 2)];
      this.anzeigen(m);
    } else if (this.verlauf.length) {
      this.verlauf = [];
    }
    // Bilder vom Fenster der Karte – das Hauptfenster liegt im Popup-Betrieb meist verdeckt
    this.rafWin = Schwebe.fenster(this.el);
    this.raf = this.rafWin.requestAnimationFrame(() => this.schleife());
  },

  /* Autokorrelation mit Parabel-Feinjustierung; null bei Stille */
  tonhoehe(buf, rate) {
    const n = buf.length;
    let rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    if (Math.sqrt(rms / n) < 0.01) return null;
    // Leise Ränder abschneiden
    let a = 0, b = n - 1;
    while (a < n / 2 && Math.abs(buf[a]) < 0.2) a++;
    while (b > n / 2 && Math.abs(buf[b]) < 0.2) b--;
    const x = buf.slice(a, b), len = x.length;
    if (len < 256) return null;
    const c = new Float32Array(len);
    const minLag = Math.floor(rate / 1500), maxLag = Math.min(len - 1, Math.floor(rate / 50));
    for (let lag = 0; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i < len - lag; i++) s += x[i] * x[i + lag];
      c[lag] = s;
    }
    let d = minLag;
    while (d < maxLag && c[d] > c[d + 1]) d++;
    let best = -1, pos = -1;
    for (let i = d; i <= maxLag; i++) if (c[i] > best) { best = c[i]; pos = i; }
    if (pos <= 0 || best < c[0] * 0.3) return null;
    const y1 = c[pos - 1] || 0, y2 = c[pos], y3 = c[pos + 1] || 0;
    const nenner = 2 * (2 * y2 - y1 - y3);
    const t = pos + (nenner ? (y3 - y1) / nenner : 0);
    const f = rate / t;
    return f >= 50 && f <= 1500 ? f : null;
  },

  anzeigen(f) {
    const zeiger = this.$('stimmen-zeiger');
    const anz = this.$('stimmen-anzeige');
    if (!f) {
      this.$('stimmen-name').textContent = '–';
      zeiger.style.left = '50%';
      anz.classList.remove('passt', 'nah');
      return;
    }
    const midiGenau = 69 + 12 * Math.log2(f / Noten.kammerton());
    const midi = Math.round(midiGenau);
    const cent = Math.round((midiGenau - midi) * 100);
    this.$('stimmen-name').textContent = Noten.name(midi);
    this.info(`${f.toFixed(1).replace('.', ',')} Hz · ${cent > 0 ? '+' : ''}${cent} Cent` +
      (Math.abs(cent) <= 5 ? ' · passt' : cent < 0 ? ' · zu tief' : ' · zu hoch'));
    zeiger.style.left = (50 + cent) + '%';
    anz.classList.toggle('passt', Math.abs(cent) <= 5);
    anz.classList.toggle('nah', Math.abs(cent) > 5 && Math.abs(cent) <= 15);
  },
};

/* Klangschale: einige unharmonische Teiltöne, je zwei leicht verstimmt
   (das ergibt das typische Schweben), lang ausklingend */
const Klangschale = {
  GRUND: 196,
  TEILTOENE: [[1, 1, 9], [2.71, 0.5, 6.5], [5.15, 0.28, 4.5], [8.43, 0.14, 3], [12.1, 0.06, 2]],

  init() {
    const b = document.getElementById('klangschale-knopf');
    if (!b) return;
    b.addEventListener('click', () => this.anschlagen());
  },

  anschlagen() {
    const ctx = Klang.audio(), t = ctx.currentTime;
    const summe = ctx.createGain();
    summe.gain.value = 0.32;
    summe.connect(ctx.destination);
    let laenge = 0;
    for (const [faktor, lautstaerke, dauer] of this.TEILTOENE) {
      for (const verstimmt of [-0.6, 0.6]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = this.GRUND * faktor + verstimmt * faktor;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(lautstaerke / 2, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
        o.connect(g).connect(summe);
        o.start(t);
        o.stop(t + dauer + 0.1);
      }
      laenge = Math.max(laenge, dauer);
    }
    const knopf = document.getElementById('klangschale-knopf');
    knopf.classList.remove('klingt');
    void knopf.offsetWidth;   // Animation neu starten
    knopf.classList.add('klingt');
    clearTimeout(this.ende);
    this.ende = setTimeout(() => knopf.classList.remove('klingt'), laenge * 1000);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  Stimmton.init();
  Stimmgeraet.init();
  Klangschale.init();
});
