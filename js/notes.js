/* Freie Notizfelder. Speichern automatisch kurz nach dem Tippen.
   Zwei Stück: die allgemeinen Notizen im eigenen Reiter und die
   Band-Notizen im Unterreiter der Schulband. */
const Notes = {
  init() {
    this.binden({
      feld: 'notes-text', status: 'notes-status', druck: 'btn-print-notes',
      titel: 'Notizen',
      lesen: () => Classes.data.notes || '',
      schreiben: t => { Classes.data.notes = t; },
    });
    // Hängt an Classes.data.band und ist dadurch in Sync und Backup mit drin
    this.binden({
      feld: 'band-notes-text', status: 'band-notes-status', druck: 'btn-print-band-notes',
      titel: 'Band-Notizen',
      lesen: () => Band.d().notizen,
      schreiben: t => { Band.d().notizen = t; },
    });
    /* Notizen je Klasse. Anders als die beiden anderen Felder wechselt hier das
       Ziel mit der gewaehlten Klasse – Classes.renderDetail() setzt den Inhalt
       beim Umschalten neu. */
    this.binden({
      feld: 'klassen-notes-text', status: 'klassen-notes-status',
      druck: 'btn-print-klassen-notes',
      titel: () => {
        const cls = Classes.currentClass();
        return cls ? `Notizen – ${cls.name}` : 'Klassennotizen';
      },
      lesen: () => (Classes.currentClass() || {}).notizen || '',
      schreiben: t => {
        const cls = Classes.currentClass();
        if (cls) cls.notizen = t;
      },
    });
  },

  /* Vor dem Klassenwechsel aufrufen: Getipptes wird 600 ms verzoegert
     gespeichert – ohne dieses Abschliessen landete es in der naechsten Klasse. */
  klassenNotizSichern() {
    const ta = document.getElementById('klassen-notes-text');
    if (ta && ta._offen) ta._offen();
  },

  /* Nach dem Klassenwechsel den Inhalt nachziehen, sonst staenden die Notizen
     der vorigen Klasse da. */
  klassenNotizLaden() {
    const ta = document.getElementById('klassen-notes-text');
    if (!ta) return;
    const cls = Classes.currentClass();
    ta.value = (cls && cls.notizen) || '';
    const hinweis = document.getElementById('klassen-notes-status');
    if (hinweis) hinweis.textContent = '';
    /* Die Ueberschrift nennt die Klasse. Ohne sie sieht jede Klasse gleich aus –
       und wer mit den Pfeiltasten durchblaettert, weiss nicht mehr, wo er tippt. */
    const kopf = document.getElementById('klassen-notizen-titel');
    if (kopf) kopf.textContent = cls ? `Notizen – ${cls.name}` : 'Notizen';
  },

  binden({ feld, status, druck, titel, lesen, schreiben }) {
    const ta = document.getElementById(feld);
    const hinweis = document.getElementById(status);
    if (!ta) return;

    ta.value = lesen();
    let timer = null;
    const speichern = () => {
      timer = null;
      ta._offen = null;
      schreiben(ta.value);
      Classes.persist();
      hinweis.textContent = 'gespeichert ' + new Date().toLocaleTimeString('de-DE',
        { hour: '2-digit', minute: '2-digit' });
    };
    ta.addEventListener('input', () => {
      hinweis.textContent = 'wird gespeichert …';
      clearTimeout(timer);
      timer = setTimeout(speichern, 600);
      // Der Klassenwechsel muss ein offenes Speichern noch abschliessen koennen
      ta._offen = () => { clearTimeout(timer); speichern(); };
    });
    // Beim Verlassen nichts verlieren - aber nur, wenn wirklich etwas offen ist
    ta.addEventListener('blur', () => { if (timer) { clearTimeout(timer); speichern(); } });
    window.addEventListener('beforeunload', () => { if (timer) { clearTimeout(timer); speichern(); } });

    document.getElementById(druck).addEventListener('click', () => {
      if (!ta.value.trim()) { alert('Es sind noch keine Notizen da.'); return; }
      Band.printHtml(typeof titel === 'function' ? titel() : titel,
        `<p>Stand ${new Date().toLocaleDateString('de-DE')}</p>` +
        `<pre class="notes-print">${Band.esc(ta.value)}</pre>`);
    });
  },
};
