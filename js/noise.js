/* Lärmampel: misst den Pegel übers Mikrofon und steuert die Ampel.
   Der angezeigte dB-Wert ist eine Näherung (Mikrofone sind nicht kalibriert),
   für den Klassenzimmer-Einsatz aber völlig ausreichend. */
class NoiseMeter {
  constructor(els) {
    this.els = els; // { dbEl, lights: {red, yellow, green}, barEl?, violationsEl?, alarmCountEl? }
    this.running = false;
    this.smoothed = 0;
    this.violations = 0;
    this.redHoldUntil = 0;
    this.redSince = null;   // seit wann durchgehend rot
    this.alarm = false;     // Vollbild-Rot aktiv, bis manuell zurückgesetzt
    this.alarmCount = 0;
    this.reloadThreshold();
    this._buildAlarmOverlay();
  }

  reloadThreshold() {
    this.threshold = parseInt(localStorage.getItem('ampel-threshold') || '70', 10);
    this.alarmDelay = parseFloat(localStorage.getItem('ampel-alarm-delay') || '3');
  }

  setThreshold(v) {
    this.threshold = v;
    localStorage.setItem('ampel-threshold', String(v));
  }

  setAlarmDelay(v) {
    this.alarmDelay = v;
    localStorage.setItem('ampel-alarm-delay', String(v));
  }

  /* Vollbild-Overlay im jeweiligen Fenster (Hauptseite, Popup oder PiP) anlegen */
  _buildAlarmOverlay() {
    const doc = this.els.lights.red.ownerDocument;
    this.overlay = doc.createElement('div');
    this.overlay.className = 'alarm-overlay';
    const msg = doc.createElement('div');
    msg.className = 'alarm-msg';
    msg.innerHTML = Icons.raw('volume') + 'ZU LAUT!';
    this.overlayCount = doc.createElement('div');
    this.overlayCount.className = 'alarm-count';
    const btn = doc.createElement('button');
    btn.className = 'alarm-reset';
    btn.textContent = 'Zurücksetzen';
    btn.addEventListener('click', () => this.resetAlarm());
    this.overlay.append(msg, this.overlayCount, btn);
    doc.body.appendChild(this.overlay);
  }

  _triggerAlarm() {
    this.alarm = true;
    this.alarmCount++;
    this.overlayCount.textContent = `${this.alarmCount}. Rotfärbung`;
    this.overlay.classList.add('on');
    if (this.els.alarmCountEl) this.els.alarmCountEl.textContent = this.alarmCount;
  }

  resetAlarm() {
    this.alarm = false;
    this.redSince = null;
    this.redHoldUntil = 0;
    this.smoothed = 0;
    this.overlay.classList.remove('on');
  }

  resetAlarmCount() {
    this.alarmCount = 0;
    if (this.els.alarmCountEl) this.els.alarmCountEl.textContent = '0';
  }

  // Großzügige Gelbzone: ab 10 dB unter dem Grenzwert, damit die Klasse
  // rechtzeitig Feedback bekommt, bevor es Rot wird
  get warnLevel() { return this.threshold - 10; }

  /* Der Browser nimmt sonst das System-Standardmikrofon – auf einem Mac ist das
     dank Continuity gern mal das iPhone in der Nähe. Deshalb merken wir uns eine
     bewusste Auswahl und fordern genau dieses Gerät an. */
  static MIC_KEY = 'ampel-mikrofon';
  static gewaehltesMikro() { return localStorage.getItem(NoiseMeter.MIC_KEY) || ''; }
  static setzeMikro(id) {
    if (id) localStorage.setItem(NoiseMeter.MIC_KEY, id);
    else localStorage.removeItem(NoiseMeter.MIC_KEY);
  }

  async start() {
    const grund = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    const id = NoiseMeter.gewaehltesMikro();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: id ? { ...grund, deviceId: { exact: id } } : grund,
      });
    } catch (e) {
      // Gemerktes Mikrofon nicht mehr da (abgesteckt, iPhone weg) → Standard nehmen
      if (!id) throw e;
      NoiseMeter.setzeMikro('');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: grund });
    }
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
    // Gelb mind. 3 s halten, damit das Feedback sichtbar bleibt
    if (db >= this.warnLevel && db < this.threshold) this.yellowHoldUntil = now + 3000;
    let state = 'green';
    if (now < this.redHoldUntil || db >= this.threshold) state = 'red';
    else if (db >= this.warnLevel || now < (this.yellowHoldUntil || 0)) state = 'yellow';

    // Dauer-Rot überwachen → nach alarmDelay Sekunden Vollbild-Alarm
    if (!this.alarm) {
      if (state === 'red') {
        if (this.redSince === null) this.redSince = now;
        else if (now - this.redSince >= this.alarmDelay * 1000) this._triggerAlarm();
      } else {
        this.redSince = null;
      }
    } else {
      state = 'red'; // während des Alarms bleibt die Ampel rot
    }
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
