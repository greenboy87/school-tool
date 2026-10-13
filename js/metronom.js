/* Metronom unter der Lärmampel (Reiter Tools).

   Die Schläge plant ein kleiner Vorausplaner auf der Uhr des AudioContext –
   so bleibt der Takt genau, auch wenn die Seite gerade beschäftigt ist.
   Die Punkte leuchten zur selben Audiozeit auf. Tempo und Taktart merkt sich
   das Gerät. */
const Metronom = {
  KEY: 'schooltool-metronom',
  MIN: 30, MAX: 240,
  VORLAUF: 0.12,          // so weit (s) im Voraus werden Schläge geplant
  TAKT: 25,               // so oft (ms) schaut der Planer nach

  bpm: 100,
  takt: 4,
  laeuft: false,
  ctx: null,
  naechster: 0,           // Audiozeit des nächsten Schlags
  schlag: 0,              // Zählzeit des nächsten Schlags im Takt
  geplant: [],            // [{ zeit, schlag }] für die Anzeige
  timer: null,
  tipps: [],

  NAMEN: [[40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'],
    [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [999, 'Prestissimo']],

  init() {
    const el = document.getElementById('metronom');
    if (!el) return;
    try { Object.assign(this, JSON.parse(localStorage.getItem(this.KEY)) || {}); } catch (e) { /* egal */ }
    this.bpm = this.grenzen(this.bpm);
    if (![1, 2, 3, 4, 6].includes(this.takt)) this.takt = 4;
    this.laeuft = false;

    document.getElementById('metronom-regler').addEventListener('input', e => this.tempo(Number(e.target.value)));
    el.querySelectorAll('[data-schritt]').forEach(b => {
      // Gedrückt halten zählt weiter
      let wdh = null;
      const stopp = () => { clearTimeout(wdh); clearInterval(wdh); wdh = null; };
      b.addEventListener('pointerdown', () => {
        const d = Number(b.dataset.schritt);
        this.tempo(this.bpm + d);
        wdh = setTimeout(() => { wdh = setInterval(() => this.tempo(this.bpm + d), 70); }, 400);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, stopp));
    });
    el.querySelectorAll('[data-takt]').forEach(b => b.addEventListener('click', () => {
      this.takt = Number(b.dataset.takt);
      this.schlag = 0;
      this.zeichnen();
      this.merken();
    }));
    document.getElementById('metronom-tap').addEventListener('click', () => this.tap());
    document.getElementById('metronom-start').addEventListener('click', () => (this.laeuft ? this.stopp() : this.start()));
    // Leertaste startet/stoppt, solange der Reiter offen ist und kein Feld den Fokus hat
    document.addEventListener('keydown', e => {
      if (e.key !== ' ' || e.repeat || !el.offsetParent) return;
      if (e.target.closest('input, textarea, select, button, [contenteditable]')) return;
      e.preventDefault();
      this.laeuft ? this.stopp() : this.start();
    });
    // Anderer Reiter: Metronom aus
    document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.tab !== 'ampel' && this.laeuft) this.stopp();
    }));
    this.zeichnen();
  },

  grenzen(x) { return Math.max(this.MIN, Math.min(this.MAX, Math.round(Number(x) || 100))); },

  tempo(x) {
    this.bpm = this.grenzen(x);
    this.zeichnen();
    this.merken();
  },

  merken() {
    try { localStorage.setItem(this.KEY, JSON.stringify({ bpm: this.bpm, takt: this.takt })); } catch (e) { /* egal */ }
  },

  /* Tempo aus den Abständen der letzten Tipper (nach 2 s Pause neu) */
  tap() {
    const jetzt = performance.now();
    if (this.tipps.length && jetzt - this.tipps[this.tipps.length - 1] > 2000) this.tipps = [];
    this.tipps.push(jetzt);
    this.tipps = this.tipps.slice(-6);
    if (this.tipps.length < 2) return;
    const abst = (this.tipps[this.tipps.length - 1] - this.tipps[0]) / (this.tipps.length - 1);
    this.tempo(60000 / abst);
  },

  start() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.laeuft = true;
    this.schlag = 0;
    this.geplant = [];
    this.naechster = this.ctx.currentTime + 0.06;
    this.planen();
    this.timer = setInterval(() => this.planen(), this.TAKT);
    requestAnimationFrame(() => this.anzeigen());
    this.knopf();
  },

  stopp() {
    this.laeuft = false;
    clearInterval(this.timer);
    this.timer = null;
    this.geplant = [];
    document.querySelectorAll('.metronom-punkt').forEach(p => p.classList.remove('an'));
    this.knopf();
  },

  planen() {
    while (this.naechster < this.ctx.currentTime + this.VORLAUF) {
      this.klick(this.naechster, this.schlag === 0 && this.takt > 1);
      this.geplant.push({ zeit: this.naechster, schlag: this.schlag });
      // Bei 6/8 zählt die Achtel – das Tempo gilt dann für die Achtel
      this.naechster += 60 / this.bpm;
      this.schlag = (this.schlag + 1) % this.takt;
    }
  },

  /* Kurzer Holzklang: Sinus mit schnellem Abklingen, die Eins höher */
  klick(zeit, betont) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = betont ? 1600 : 1000;
    g.gain.setValueAtTime(0.0001, zeit);
    g.gain.exponentialRampToValueAtTime(betont ? 0.9 : 0.6, zeit + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.05);
    o.connect(g).connect(this.ctx.destination);
    o.start(zeit);
    o.stop(zeit + 0.06);
  },

  anzeigen() {
    if (!this.laeuft) return;
    const jetzt = this.ctx.currentTime;
    let zuletzt = null;
    while (this.geplant.length && this.geplant[0].zeit <= jetzt) zuletzt = this.geplant.shift();
    if (zuletzt) {
      document.querySelectorAll('.metronom-punkt').forEach((p, i) => p.classList.toggle('an', i === zuletzt.schlag));
    }
    requestAnimationFrame(() => this.anzeigen());
  },

  knopf() {
    const b = document.getElementById('metronom-start');
    b.innerHTML = Icons.raw(this.laeuft ? 'stop' : 'play') + (this.laeuft ? 'Stopp' : 'Start');
    b.classList.toggle('laeuft', this.laeuft);
  },

  zeichnen() {
    document.getElementById('metronom-bpm').textContent = this.bpm;
    document.getElementById('metronom-regler').value = this.bpm;
    document.getElementById('metronom-name').textContent = this.NAMEN.find(([g]) => this.bpm < g)[1];
    document.querySelectorAll('#metronom [data-takt]').forEach(b => b.classList.toggle('active', Number(b.dataset.takt) === this.takt));
    const punkte = document.getElementById('metronom-punkte');
    if (punkte.children.length !== this.takt) {
      punkte.innerHTML = Array.from({ length: this.takt }, (_, i) =>
        `<span class="metronom-punkt${i === 0 && this.takt > 1 ? ' eins' : ''}"></span>`).join('');
    }
  },
};
document.addEventListener('DOMContentLoaded', () => Metronom.init());
