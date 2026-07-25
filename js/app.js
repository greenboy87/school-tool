/* App-Verdrahtung: Haupttabs, Lärmampel-Steuerung, Backup */
document.addEventListener('DOMContentLoaded', () => {
  Classes.init();
  Tools.init();

  /* ----- Haupttabs ----- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  /* ----- Lärmampel ----- */
  const meter = new NoiseMeter({
    dbEl: document.getElementById('db-value'),
    barEl: document.getElementById('db-bar'),
    violationsEl: document.getElementById('violations'),
    alarmCountEl: document.getElementById('alarm-count'),
    lights: {
      red: document.getElementById('light-red'),
      yellow: document.getElementById('light-yellow'),
      green: document.getElementById('light-green'),
    },
  });

  const slider = document.getElementById('threshold');
  const marker = document.getElementById('db-marker');
  const updateThresholdUi = () => {
    const v = parseInt(slider.value, 10);
    document.getElementById('threshold-value').textContent = v;
    document.getElementById('warn-value').textContent = v - 10;
    marker.style.left = Math.min(100, v / 110 * 100) + '%';
  };
  slider.value = localStorage.getItem('ampel-threshold') || '70';
  updateThresholdUi();
  slider.addEventListener('input', () => {
    meter.setThreshold(parseInt(slider.value, 10));
    updateThresholdUi();
  });

  const alarmDelay = document.getElementById('alarm-delay');
  alarmDelay.value = localStorage.getItem('ampel-alarm-delay') || '3';
  alarmDelay.addEventListener('change', () => {
    const v = parseFloat(alarmDelay.value);
    if (v >= 1) meter.setAlarmDelay(v);
  });
  document.getElementById('btn-alarm-count-reset').addEventListener('click', () => meter.resetAlarmCount());

  const btnMic = document.getElementById('btn-mic');
  btnMic.addEventListener('click', async () => {
    if (meter.running) {
      meter.stop();
      btnMic.innerHTML = Icons.raw('mic') + 'Mikrofon starten';
    } else {
      try {
        await meter.start();
        btnMic.innerHTML = Icons.raw('stop') + 'Messung stoppen';
      } catch (e) {
        alert('Mikrofon-Zugriff nicht möglich. Bitte im Browser erlauben.\n(' + e.message + ')');
      }
    }
  });

  document.getElementById('btn-popup').addEventListener('click', () => {
    window.open('ampel.html', 'laermampel',
      'width=200,height=420,menubar=no,toolbar=no,location=no,status=no');
  });

  // „Immer im Vordergrund“: Document Picture-in-Picture (Chrome/Edge).
  document.getElementById('btn-pip').addEventListener('click', async () => {
    if (!('documentPictureInPicture' in window)) {
      alert('Dein Browser unterstützt das schwebende Fenster nicht.\nNutze Chrome oder Edge – oder den Popup-Button daneben.');
      return;
    }
    try {
      const pipWin = await documentPictureInPicture.requestWindow({ width: 190, height: 400 });
      // Styles übernehmen
      for (const sheet of document.styleSheets) {
        try {
          const style = pipWin.document.createElement('style');
          style.textContent = [...sheet.cssRules].map(r => r.cssText).join('\n');
          pipWin.document.head.appendChild(style);
        } catch (e) { /* fremde Sheets ignorieren */ }
      }
      Theme.apply(Theme.current(), pipWin.document);
      pipWin.document.body.className = 'popup-body';
      pipWin.document.body.innerHTML = `
        <div class="popup-ampel">
          <div class="traffic-light compact">
            <div class="light red"></div>
            <div class="light yellow"></div>
            <div class="light green"></div>
          </div>
          <div class="db-display small"><span id="pip-db">–</span><span class="db-unit">dB</span></div>
          <div class="popup-alarm-count hint">🔴 <strong id="pip-alarm-count">0</strong>×</div>
        </div>`;
      const pipMeter = new NoiseMeter({
        dbEl: pipWin.document.getElementById('pip-db'),
        alarmCountEl: pipWin.document.getElementById('pip-alarm-count'),
        lights: {
          red: pipWin.document.querySelector('.light.red'),
          yellow: pipWin.document.querySelector('.light.yellow'),
          green: pipWin.document.querySelector('.light.green'),
        },
      });
      await pipMeter.start();
      pipWin.addEventListener('pagehide', () => pipMeter.stop());
    } catch (e) {
      alert('Schwebendes Fenster konnte nicht geöffnet werden: ' + e.message);
    }
  });

  /* ----- Theme ----- */
  Theme.updateButton();
  document.getElementById('btn-theme').addEventListener('click', () => Theme.toggle());

  /* ----- Sperren ----- */
  document.getElementById('btn-lock').addEventListener('click', () => {
    if (confirm('Seite sperren? Zum Weiterarbeiten musst du das Passwort erneut eingeben.')) Auth.lock();
  });

  /* ----- Backup ----- */
  document.getElementById('btn-export').addEventListener('click', () => Store.exportBackup());
  document.getElementById('btn-import').addEventListener('click', () =>
    document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Achtung: Das Backup ersetzt alle aktuell gespeicherten Klassen und Noten. Fortfahren?')) { e.target.value = ''; return; }
    Store.importBackup(file, err => {
      if (err) { alert('Backup konnte nicht gelesen werden: ' + err.message); return; }
      location.reload();
    });
    e.target.value = '';
  });
});
