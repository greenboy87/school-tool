/* Lärmampel: misst den Pegel übers Mikrofon und zeigt ihn als Halbkreis-Spektrum.
   Der angezeigte dB-Wert ist eine Näherung (Mikrofone sind nicht kalibriert),
   für den Klassenzimmer-Einsatz aber völlig ausreichend. */
class NoiseMeter {
  constructor(els) {
    this.els = els; // { dbEl, gauge, barEl?, violationsEl?, alarmCountEl? }
    this.running = false;
    this.smoothed = 0;
    this.violations = 0;
    this.redHoldUntil = 0;
    this.redSince = null;   // seit wann durchgehend rot
    this.alarm = false;     // Vollbild-Rot aktiv, bis manuell zurückgesetzt
    this.alarmCount = 0;
    this.reloadThreshold();
    this._buildGauge();
    this._buildAlarmOverlay();
    // Stumm gilt für alle Ampeln gleichzeitig: Hauptseite, Popup, schwebendes Fenster
    NoiseMeter.alle.add(this);
    this.els.gauge.ownerDocument.defaultView.addEventListener('storage', e => {
      if (e.key === NoiseMeter.STUMM_KEY) this._stummZeigen();
    });
    this._stummZeigen();
  }

  /* ----- Stumm -----
     Solange die Lehrkraft spricht, misst die Ampel nicht mit: kein Pegel, keine
     Überschreitung, kein Alarm. Über localStorage erfahren es auch die anderen
     Fenster; Ampeln im selben Fenster (schwebendes Fenster) über die Liste. */
  static STUMM_KEY = 'ampel-stumm';
  static alle = new Set();
  static istStumm() { return localStorage.getItem(NoiseMeter.STUMM_KEY) === '1'; }
  static setzeStumm(an) {
    if (an) localStorage.setItem(NoiseMeter.STUMM_KEY, '1');
    else localStorage.removeItem(NoiseMeter.STUMM_KEY);
    NoiseMeter.alle.forEach(m => m._stummZeigen());
  }
  static umschalten() { NoiseMeter.setzeStumm(!NoiseMeter.istStumm()); }

  _stummZeigen() {
    this.stumm = NoiseMeter.istStumm();
    this.els.gauge.classList.toggle('stumm', this.stumm);
    if (this.stumm) {
      this.redSince = null;
      this.redHoldUntil = 0;
      this.yellowHoldUntil = 0;
      this.smoothed = 0;
    }
    this.els.gauge.ownerDocument.dispatchEvent(new CustomEvent('ampel-stumm', { detail: this.stumm }));
  }

  reloadThreshold() {
    this.threshold = parseInt(localStorage.getItem('ampel-threshold') || '70', 10);
    this.alarmDelay = parseFloat(localStorage.getItem('ampel-alarm-delay') || '3');
    if (this.segments) this._colorGauge();
  }

  setThreshold(v) {
    this.threshold = v;
    localStorage.setItem('ampel-threshold', String(v));
    this._colorGauge();
  }

  setAlarmDelay(v) {
    this.alarmDelay = v;
    localStorage.setItem('ampel-alarm-delay', String(v));
  }

  /* ----- Halbkreis-Spektrum -----
     Viele schmale Bogenstücke, lückenlos aneinander, ergeben einen fließenden
     Farbverlauf. Bis zum aktuellen Pegel leuchten sie, der Rest bleibt blass.
     Die Farben folgen dem Grenzwert: grün, ab der Gelbzone gelb, am Grenzwert rot. */
  static SKALA_MIN = 30;
  static SKALA_MAX = 110;
  static SEGMENTE = 90;

  _winkel(db) {   // 30 dB → ganz links (180°), 110 dB → ganz rechts (0°)
    const { SKALA_MIN: lo, SKALA_MAX: hi } = NoiseMeter;
    const t = Math.min(1, Math.max(0, (db - lo) / (hi - lo)));
    return Math.PI * (1 - t);
  }

  _buildGauge() {
    const g = this.els.gauge;
    const doc = g.ownerDocument;
    const NS = 'http://www.w3.org/2000/svg';
    const el = (name, attrs) => {
      const e = doc.createElementNS(NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    };
    const cx = 110, cy = 110, r = 88;
    const punkt = (w, rad = r) => [cx + rad * Math.cos(w), cy - rad * Math.sin(w)];
    const svg = el('svg', { viewBox: '0 0 220 124', class: 'bogen-svg', 'aria-hidden': 'true' });
    const n = NoiseMeter.SEGMENTE;
    // Zwei Lagen: die blasse Spur als Ganzes durchscheinend (sonst zeichnen sich
    // die Überlappungen als Streifen ab), darüber die leuchtenden Stücke.
    const spur = el('g', { class: 'bogen-spur' }), licht = el('g');
    this.segments = [];
    for (let i = 0; i < n; i++) {
      // Jedes Stück ragt ein wenig ins nächste, sonst zeigen sich feine Fugen
      const w0 = Math.PI * (1 - i / n), w1 = Math.PI * (1 - Math.min(n, i + 1.6) / n);
      const [x0, y0] = punkt(w0), [x1, y1] = punkt(w1);
      const d = `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
      const dbWert = NoiseMeter.SKALA_MIN + (i + 0.5) / n * (NoiseMeter.SKALA_MAX - NoiseMeter.SKALA_MIN);
      for (const lage of [spur, licht]) {
        const p = el('path', { d, class: 'bogen-seg' });
        p.dbWert = dbWert;
        lage.appendChild(p);
        this.segments.push(p);
      }
    }
    this.lichtSegmente = [...licht.children];
    svg.append(spur, licht);
    // Grenzwert-Strich außen am Bogen
    this.markerEl = el('line', { class: 'bogen-marker' });
    // Leuchtpunkt an der Spitze des Pegels
    this.knopfEl = el('circle', { r: 12, class: 'bogen-knopf' });
    svg.append(this.markerEl, this.knopfEl);
    this._punkt = punkt;
    this._r = r;
    g.prepend(svg);
    // Hell/Dunkel haben leicht andere Ampelfarben – beim Umschalten neu einfärben
    new (doc.defaultView.MutationObserver)(() => this._colorGauge())
      .observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this._colorGauge();
    this._setLevel(null);
  }

  _leseFarben() {
    const css = getComputedStyle(this.els.gauge);
    const hex = (name, fallback) => {
      const v = (css.getPropertyValue(name) || '').trim() || fallback;
      const m = v.match(/^#?([0-9a-f]{6})$/i);
      const h = m ? m[1] : fallback.slice(1);
      return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    };
    this.farben = [hex('--green', '#4caf62'), hex('--yellow', '#e3b341'), hex('--red', '#e35d4a')];
  }

  _farbe(db) {
    const [gruen, gelb, rot] = this.farben;
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))));
    const warn = this.warnLevel, grenze = this.threshold;
    let c;
    if (db < warn - 6) c = gruen;
    else if (db < warn) c = mix(gruen, gelb, (db - (warn - 6)) / 6);
    else if (db < grenze) c = mix(gelb, rot, (db - warn) / (grenze - warn));
    else c = rot;
    return `rgb(${c.join(',')})`;
  }

  _colorGauge() {
    if (!this.segments) return;
    this._leseFarben();
    for (const p of this.segments) p.setAttribute('stroke', this._farbe(p.dbWert));
    const w = this._winkel(this.threshold);
    const [x0, y0] = this._punkt(w, this._r - 19), [x1, y1] = this._punkt(w, this._r + 19);
    Object.entries({ x1: x0, y1: y0, x2: x1, y2: y1 }).forEach(([k, v]) => this.markerEl.setAttribute(k, v.toFixed(2)));
  }

  _setLevel(db) {
    const an = db === null ? -1 : db;
    for (const p of this.lichtSegmente) p.style.visibility = p.dbWert <= an ? '' : 'hidden';
    const aktiv = db !== null;
    this.knopfEl.style.display = aktiv ? '' : 'none';
    if (aktiv) {
      const [x, y] = this._punkt(this._winkel(db));
      this.knopfEl.setAttribute('cx', x.toFixed(2));
      this.knopfEl.setAttribute('cy', y.toFixed(2));
      this.knopfEl.setAttribute('fill', this._farbe(db));
    }
  }

  /* Vollbild-Overlay im jeweiligen Fenster (Hauptseite, Popup oder schwebendes Fenster) anlegen */
  _buildAlarmOverlay() {
    const doc = this.els.gauge.ownerDocument;
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
    this._setState(null);
    this._setLevel(null);
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
    if (this.stumm) {
      this.smoothed = 0;
      this._setState(null);
      this._setLevel(null);
      if (this.els.dbEl) this.els.dbEl.textContent = '–';
      if (this.els.barEl) this.els.barEl.style.width = '0%';
      return;
    }
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
    this._setState(state);
    this._setLevel(db);

    if (this.els.dbEl) this.els.dbEl.textContent = Math.round(db);
    if (this.els.barEl) this.els.barEl.style.width = Math.min(100, db / 110 * 100) + '%';
    if (this.els.violationsEl) this.els.violationsEl.textContent = this.violations;
  }

  // Zustand (grün/gelb/rot) als Attribut – daran hängen Zahlfarbe und Leuchten
  _setState(state) {
    if (state) this.els.gauge.dataset.state = state;
    else delete this.els.gauge.dataset.state;
  }
}
