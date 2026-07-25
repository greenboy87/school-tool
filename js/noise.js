/* Lärmampel: misst den Pegel übers Mikrofon und steuert die Ampel.
   Der angezeigte dB-Wert ist eine Näherung (Mikrofone sind nicht kalibriert),
   für den Klassenzimmer-Einsatz aber völlig ausreichend. */
class NoiseMeter {
  constructor(els) {
    this.els = els; // { dbEl, lights: {red, yellow, green}, barEl?, violationsEl? }
    this.running = false;
    this.smoothed = 0;
    this.violations = 0;
    this.redHoldUntil = 0;
    this.reloadThreshold();
  }

  reloadThreshold() {
    this.threshold = parseInt(localStorage.getItem('ampel-threshold') || '70', 10);
  }

  setThreshold(v) {
    this.threshold = v;
    localStorage.setItem('ampel-threshold', String(v));
  }

  get warnLevel() { return this.threshold - 5; }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.ctx) this.ctx.close();
    this._setLights(null);
    if (this.els.dbEl) this.els.dbEl.textContent = '–';
    if (this.els.barEl) this.els.barEl.style.width = '0%';
  }

  _loop() {
    if (!this.running) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    // dBFS (negativ) auf eine grobe dB(SPL)-Skala verschieben
    const db = rms > 0 ? Math.max(0, 20 * Math.log10(rms) + 100) : 0;
    // Schnell rauf (Lärm sofort zeigen), langsam runter (ruhige Anzeige)
    this.smoothed = db > this.smoothed
      ? this.smoothed * 0.6 + db * 0.4
      : this.smoothed * 0.9 + db * 0.1;

    this._render(this.smoothed);
    requestAnimationFrame(() => this._loop());
  }

  _render(db) {
    const now = performance.now();
    if (db >= this.threshold && now > this.redHoldUntil) {
      this.violations++;
      this.redHoldUntil = now + 2000; // Rot mind. 2 s halten
    }
    let state = 'green';
    if (now < this.redHoldUntil || db >= this.threshold) state = 'red';
    else if (db >= this.warnLevel) state = 'yellow';
    this._setLights(state);

    if (this.els.dbEl) this.els.dbEl.textContent = Math.round(db);
    if (this.els.barEl) this.els.barEl.style.width = Math.min(100, db / 110 * 100) + '%';
    if (this.els.violationsEl) this.els.violationsEl.textContent = this.violations;
  }

  _setLights(state) {
    const { red, yellow, green } = this.els.lights;
    red.classList.toggle('on', state === 'red');
    yellow.classList.toggle('on', state === 'yellow');
    green.classList.toggle('on', state === 'green');
  }
}
