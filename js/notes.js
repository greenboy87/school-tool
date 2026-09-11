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
  },

  binden({ feld, status, druck, titel, lesen, schreiben }) {
    const ta = document.getElementById(feld);
    const hinweis = document.getElementById(status);
    if (!ta) return;

    ta.value = lesen();
    let timer = null;
    const speichern = () => {
      timer = null;
      schreiben(ta.value);
      Classes.persist();
      hinweis.textContent = 'gespeichert ' + new Date().toLocaleTimeString('de-DE',
        { hour: '2-digit', minute: '2-digit' });
    };
    ta.addEventListener('input', () => {
      hinweis.textContent = 'wird gespeichert …';
      clearTimeout(timer);
      timer = setTimeout(speichern, 600);
    });
    // Beim Verlassen nichts verlieren - aber nur, wenn wirklich etwas offen ist
    ta.addEventListener('blur', () => { if (timer) { clearTimeout(timer); speichern(); } });
    window.addEventListener('beforeunload', () => { if (timer) { clearTimeout(timer); speichern(); } });

    document.getElementById(druck).addEventListener('click', () => {
      if (!ta.value.trim()) { alert('Es sind noch keine Notizen da.'); return; }
      Band.printHtml(titel,
        `<p>Stand ${new Date().toLocaleDateString('de-DE')}</p>` +
        `<pre class="notes-print">${Band.esc(ta.value)}</pre>`);
    });
  },
};
