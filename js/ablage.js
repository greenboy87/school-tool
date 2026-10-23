/* Ablage je Klasse (Reiter Klassen → Ablage): Dokumente und Listen.

   Dokumente – PDFs und Fotos wie eine abfotografierte Klassenliste. Die Datei
   liegt in IndexedDB beim Speicher „fotos“ (Schlüssel „akte-<id>“) und reist
   damit verschlüsselt im Sync mit, wie die Fotos an Terminen; Name, Größe und
   Datum stehen in cls.akten.

   Listen – ein Vermerk je Schüler, etwa „Schwimmfähigkeit“: ✓, „unsicher“,
   „keine Überprüfung“. Sie liegen in cls.listen = [{ id, titel, werte:
   { schuelerId: text }, datum }] bei den Klassendaten.

   Beides sind Schülerdaten – sie bleiben im Browser bzw. im verschlüsselten
   Tresor und haben im öffentlichen Repository nichts verloren. */
const Ablage = {
  init() {
    this.el = document.getElementById('subtab-ablage');
    if (!this.el) return;
    const datei = document.getElementById('ablage-datei');
    document.getElementById('btn-ablage-datei').addEventListener('click', () => datei.click());
    datei.addEventListener('change', async () => {
      for (const f of datei.files) await this.dokumentAblegen(f);
      datei.value = '';
    });
    // Dateien auch per Ziehen auf die Karte
    const zone = document.getElementById('ablage-dokumente');
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('ziel'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('ziel'));
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('ziel');
      for (const f of e.dataTransfer.files) await this.dokumentAblegen(f);
    });
    document.getElementById('btn-ablage-liste').addEventListener('click', () => this.listeAnlegen());
    this.el.addEventListener('click', e => this.klick(e));
    this.el.addEventListener('input', e => this.eingabe(e));
    document.querySelector('.subtab-btn[data-subtab="ablage"]').addEventListener('click', () => this.render());
  },

  klasse() { return Classes.currentClass(); },
  esc(s) { return Band.esc(s).replace(/"/g, '&quot;'); },

  /* ---------- Dokumente ---------- */
  MAX: 15 * 1024 * 1024,      // wie beim Sync der Sitzpläne

  async dokumentAblegen(f) {
    const cls = this.klasse();
    if (!cls || !f) return;
    if (!/^(application\/pdf|image\/)/.test(f.type)) { alert(`„${f.name}“: Bitte eine PDF oder ein Bild ablegen.`); return; }
    if (f.size > this.MAX) { alert(`„${f.name}“ ist zu groß (höchstens 15 MB).`); return; }
    const id = Store.uid();
    await Store.putFoto('akte-' + id, f);
    (cls.akten = cls.akten || []).push({ id, name: f.name.slice(0, 200), typ: f.type, groesse: f.size, datum: Date.now() });
    Classes.persist();
    this.render();
  },

  async dokumentOeffnen(id) {
    const eintrag = await Store.getFoto('akte-' + id);
    if (!eintrag || !eintrag.blob) {
      alert('Die Datei liegt auf diesem Gerät noch nicht vor. Einmal „Sync“ → Holen, dann ist sie da.');
      return;
    }
    const url = URL.createObjectURL(eintrag.blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  async dokumentLoeschen(id) {
    const cls = this.klasse();
    const d = (cls.akten || []).find(x => x.id === id);
    if (!d || !confirm(`„${d.name}“ aus der Ablage löschen?`)) return;
    cls.akten = cls.akten.filter(x => x.id !== id);
    Classes.persist();
    await Store.deleteFoto('akte-' + id).catch(() => {});
    // Auch die verschlüsselte Kopie auf dem Server, sonst käme sie beim Holen zurück
    if (window.FB && Tresor.aktiv && Tresor.aktiv() && Tresor.id) {
      window.FB.remove(window.FB.ref(window.FB.db, `schoolTool/tresor/${Tresor.id}/fotos/akte-${id}`)).catch(() => {});
    }
    this.render();
  },

  dokumentUmbenennen(id) {
    const d = (this.klasse().akten || []).find(x => x.id === id);
    if (!d) return;
    const neu = prompt('Neuer Name:', d.name);
    if (!neu || !neu.trim()) return;
    d.name = neu.trim().slice(0, 200);
    Classes.persist();
    this.render();
  },

  /* ---------- Listen ---------- */
  listeAnlegen() {
    const cls = this.klasse();
    if (!cls) return;
    const titel = prompt('Name der Liste (z. B. Schwimmfähigkeit, Einverständnis Ausflug):');
    if (!titel || !titel.trim()) return;
    (cls.listen = cls.listen || []).push({ id: Store.uid(), titel: titel.trim().slice(0, 100), werte: {}, datum: Date.now() });
    Classes.persist();
    this.render();
  },

  liste(id) { return (this.klasse().listen || []).find(l => l.id === id); },

  /* Vermerke aus Text übernehmen – eine Zeile je Schüler:
       „Gottner, Martin: keine Überprüfung“  oder  „7: keine Überprüfung“ (Nummer der Liste)
     Gefunden wird über Nachname und Vorname, Groß-/Kleinschreibung egal. */
  ausText(id) {
    const cls = this.klasse(), l = this.liste(id);
    const text = prompt('Eine Zeile je Schüler, z. B.\n„Gottner, Martin: keine Überprüfung“ oder „7: ✓“\n\nMehrere Zeilen am Stück einfügen:');
    if (!text) return;
    const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const nachName = new Map(cls.students.map(s => [norm(Classes.studentName(s)), s]));
    const unklar = [];
    let n = 0;
    for (const zeile of text.split(/\r?\n/)) {
      const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(zeile);
      if (!m) { if (zeile.trim()) unklar.push(zeile.trim()); continue; }
      const s = /^\d+$/.test(m[1]) ? cls.students[Number(m[1]) - 1] : nachName.get(norm(m[1]));
      if (!s) { unklar.push(zeile.trim()); continue; }
      if (m[2].trim()) l.werte[s.id] = m[2].trim().slice(0, 200); else delete l.werte[s.id];
      n++;
    }
    Classes.persist();
    this.render();
    alert(`${n} Vermerk${n === 1 ? '' : 'e'} übernommen.` +
      (unklar.length ? `\n\nNicht zugeordnet (Name nicht in der Klasse?):\n${unklar.slice(0, 15).join('\n')}` : ''));
  },

  listeDrucken(id) {
    const cls = this.klasse(), l = this.liste(id);
    Band.printHtml(`${l.titel} – ${cls.name}`, Band.printTable(
      [{ titel: 'Nr.', cls: 'num' }, { titel: 'Name' }, { titel: l.titel }],
      cls.students.map((s, i) => [i + 1, Band.esc(Classes.studentName(s)), Band.esc(l.werte[s.id] || '')]), 'kompakt'),
      `${cls.students.length} Schülerinnen und Schüler`);
  },

  listeLoeschen(id) {
    const cls = this.klasse(), l = this.liste(id);
    if (!l || !confirm(`Liste „${l.titel}“ mit allen Vermerken löschen?`)) return;
    cls.listen = cls.listen.filter(x => x.id !== id);
    Classes.persist();
    this.render();
  },

  /* ---------- Bedienung ---------- */
  klick(e) {
    const b = e.target.closest('[data-aktion]');
    if (!b) return;
    const { aktion, id } = b.dataset;
    if (aktion === 'oeffnen') this.dokumentOeffnen(id);
    if (aktion === 'umbenennen') this.dokumentUmbenennen(id);
    if (aktion === 'loeschen') this.dokumentLoeschen(id);
    if (aktion === 'ausText') this.ausText(id);
    if (aktion === 'drucken') this.listeDrucken(id);
    if (aktion === 'listeLoeschen') this.listeLoeschen(id);
    if (aktion === 'alleOk') {
      const l = this.liste(id);
      for (const s of this.klasse().students) if (!l.werte[s.id]) l.werte[s.id] = '✓';
      Classes.persist();
      this.render();
    }
  },

  eingabe(e) {
    const feld = e.target.closest('[data-wert]');
    if (!feld) return;
    const [listeId, schuelerId] = feld.dataset.wert.split('|');
    const l = this.liste(listeId);
    if (!l) return;
    const v = feld.value.trim();
    if (v) l.werte[schuelerId] = v.slice(0, 200); else delete l.werte[schuelerId];
    Classes.persist();
  },

  render() {
    const cls = this.klasse();
    if (!this.el || !cls) return;
    const datum = t => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const groesse = n => n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

    const akten = cls.akten || [];
    document.getElementById('ablage-dokumentliste').innerHTML = akten.length
      ? akten.map(d => `<li>
          <button type="button" class="ablage-name" data-aktion="oeffnen" data-id="${this.esc(d.id)}" title="Öffnen">
            ${Icons.raw(/pdf/.test(d.typ) ? 'file' : 'grid')}${this.esc(d.name)}</button>
          <span class="hint">${datum(d.datum)} · ${groesse(d.groesse || 0)}</span>
          <span class="ablage-knoepfe">
            <button type="button" class="small" data-aktion="umbenennen" data-id="${this.esc(d.id)}" title="Umbenennen">${Icons.raw('pen')}</button>
            <button type="button" class="small danger" data-aktion="loeschen" data-id="${this.esc(d.id)}" title="Löschen">${Icons.raw('trash')}</button>
          </span></li>`).join('')
      : '<li class="hint">Noch keine Dokumente. PDF oder Foto hierher ziehen oder „Dokument ablegen“.</li>';

    const listen = cls.listen || [];
    document.getElementById('ablage-listen').innerHTML = listen.map(l => {
      // Bisher benutzte Vermerke als Vorschläge beim Tippen
      const vorschlaege = [...new Set(['✓', ...Object.values(l.werte)])];
      const gefuellt = cls.students.filter(s => l.werte[s.id]).length;
      return `<div class="ablage-liste">
        <div class="projekt-header">
          <h4>${this.esc(l.titel)} <span class="hint">${gefuellt} von ${cls.students.length} eingetragen</span></h4>
          <div class="btn-row">
            <button type="button" class="small" data-aktion="alleOk" data-id="${l.id}" title="Alle noch leeren Zeilen auf ✓ setzen">Leere auf ✓</button>
            <button type="button" class="small" data-aktion="ausText" data-id="${l.id}" title="Vermerke als Text einfügen – eine Zeile je Schüler">Aus Text …</button>
            <button type="button" class="small" data-aktion="drucken" data-id="${l.id}">${Icons.raw('printer')}Drucken</button>
            <button type="button" class="small danger" data-aktion="listeLoeschen" data-id="${l.id}" title="Liste löschen">${Icons.raw('trash')}</button>
          </div>
        </div>
        <datalist id="ablage-vorschlag-${l.id}">${vorschlaege.map(v => `<option value="${this.esc(v)}">`).join('')}</datalist>
        <table class="ablage-tabelle"><tbody>${cls.students.map((s, i) => `<tr>
          <td class="num">${i + 1}</td><td>${this.esc(Classes.studentName(s))}</td>
          <td><input type="text" data-wert="${l.id}|${this.esc(s.id)}" value="${this.esc(l.werte[s.id] || '')}"
                     list="ablage-vorschlag-${l.id}" maxlength="200" autocomplete="off"></td></tr>`).join('')}</tbody></table>
      </div>`;
    }).join('') || '<p class="hint">Noch keine Listen.</p>';
  },
};
