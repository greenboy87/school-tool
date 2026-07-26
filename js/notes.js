/* Freies Notizfeld. Speichert automatisch kurz nach dem Tippen. */
const Notes = {
  init() {
    const ta = document.getElementById('notes-text');
    const status = document.getElementById('notes-status');
    if (!ta) return;

    ta.value = Classes.data.notes || '';
    let timer = null;
    const speichern = () => {
      Classes.data.notes = ta.value;
      Classes.persist();
      status.textContent = 'gespeichert ' + new Date().toLocaleTimeString('de-DE',
        { hour: '2-digit', minute: '2-digit' });
    };
    ta.addEventListener('input', () => {
      status.textContent = 'wird gespeichert …';
      clearTimeout(timer);
      timer = setTimeout(speichern, 600);
    });
    // Beim Verlassen der Seite nichts verlieren
    ta.addEventListener('blur', () => { clearTimeout(timer); speichern(); });
    window.addEventListener('beforeunload', () => { if (timer) { clearTimeout(timer); speichern(); } });

    document.getElementById('btn-print-notes').addEventListener('click', () => {
      if (!ta.value.trim()) { alert('Es sind noch keine Notizen da.'); return; }
      Band.printHtml('Notizen',
        `<p>Stand ${new Date().toLocaleDateString('de-DE')}</p>` +
        `<pre class="notes-print">${Band.esc(ta.value)}</pre>`);
    });
  },
};
