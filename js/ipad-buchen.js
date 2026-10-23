/* iPad-Koffer per Knopf buchen.

   Das School-Tool selbst kann im Schulmanager nichts buchen – dafür fehlt ihm
   die Anmeldung, und die soll es auch nicht bekommen. Der Plan öffnet deshalb
   die Buchungsseite des Schulmanagers und gibt den Auftrag im Fensternamen mit
   (window.name überlebt das Laden der Seite, anders als ein Zusatz in der
   Adresse, den der Schulmanager wegräumt):
     stbuchen|2026-10-29|3|66897,66898,127145|Mu 5a, H311
   Ein Lesezeichen in Chrome („iPads buchen“) führt dann auf der Seite des
   Schulmanagers – mit dessen Anmeldung – den Auftrag aus: freie Koffer prüfen,
   nachfragen, buchen. Der Code des Lesezeichens ist die Funktion unten; er
   steckt komplett im Lesezeichen und lädt nichts nach. */
const IpadBuchen = {
  /* Läuft im Schulmanager, nicht hier – darf deshalb nichts aus dem School-Tool
     benutzen. Alle Angaben stehen in der Funktion selbst. */
  lesezeichenCode: async function () {
    const KOFFER = {
      66893: 'N101 (20)', 66895: 'N104 (16)', 66894: 'H104 (16)', 100869: 'H202 (16)',
      112899: 'H218 (16)', 66897: 'H300 (20)', 66898: 'H304 (16)', 127145: 'H313 (20)',
    };
    // Schulstunde → Kennung im Schulmanager (1. Stunde = 26570, fortlaufend)
    const stundeId = n => 26569 + Number(n);
    if (!/schulmanager-online\.de$/.test(location.hostname)) {
      alert('Dieses Lesezeichen funktioniert nur auf der Seite des Schulmanagers.');
      return;
    }
    let auftrag = /^stbuchen\|(\d{4}-\d\d-\d\d)\|(\d)\|([\d,]+)\|(.*)$/.exec(window.name || '');
    if (!auftrag) {
      // Ohne Auftrag aus dem School-Tool: Tag und Koffer aus der Buchungsseite,
      // die Stunde erfragen
      const seite = /book\/\d+\/(-?\d+)\?startDate=(\d{4}-\d\d-\d\d)/.exec(location.hash);
      if (!seite) { alert('Bitte zuerst im Schulmanager die Seite „Ressourcen buchen“ öffnen – oder im School-Tool (Plan) auf „buchen“ klicken.'); return; }
      const [j, m, t] = seite[2].split('-');
      const eingabe = prompt('iPad-Koffer buchen – Tag und Stunde, z. B. „29.10. 3“:', `${+t}.${+m}. `);
      const e = /^\s*(\d{1,2})\.(\d{1,2})\.?\s+([1-9])\s*$/.exec(eingabe || '');
      if (!e) { if (eingabe) alert('Bitte so eingeben: Tag.Monat. Stunde – z. B. 29.10. 3'); return; }
      const ids = seite[1] !== '-1' ? seite[1] : Object.keys(KOFFER).join(',');
      auftrag = [null, `${j}-${e[2].padStart(2, '0')}-${e[1].padStart(2, '0')}`, e[3], ids, ''];
    }
    const [, datum, stunde, liste, was] = auftrag;
    const wunsch = liste.split(',').map(Number);
    const tag = new Date(datum + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
    const wann = `${tag}, ${stunde}. Stunde${was ? ' (' + was + ')' : ''}`;

    // Jede Anfrage braucht die Fassung der Schulmanager-Seite. Sie steht in einer
    // der geladenen Dateien; welche Kennung stimmt, zeigt eine harmlose Probeanfrage.
    const anfrage = async (version, requests) => {
      const r = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('jwt') },
        body: JSON.stringify({ bundleVersion: version, requests }),
      });
      const neu = r.headers.get('x-new-bearer-token');
      if (neu) localStorage.setItem('jwt', neu);
      return r.ok ? (await r.json()).results[0] : null;
    };
    const pruefung = ids => [{ moduleName: 'resources', endpointName: 'check-resource-reservation-conflicts',
      parameters: { resourceIds: ids, startDate: datum, endDate: datum,
        startClassHourId: stundeId(stunde), endClassHourId: stundeId(stunde), repeatUntilDate: null } }];
    let version = sessionStorage.getItem('stbuchen-version');
    if (!version || !(await anfrage(version, pruefung(wunsch)))) {
      version = null;
      const dateien = [...new Set(performance.getEntriesByType('resource').map(e => e.name)
        .filter(n => n.startsWith(location.origin + '/static/') && n.endsWith('.js')))];
      for (const d of dateien) {
        const text = await fetch(d).then(r => r.text()).catch(() => '');
        for (const [, kandidat] of text.matchAll(/="([0-9a-f]{10})"/g)) {
          if (await anfrage(kandidat, pruefung(wunsch))) { version = kandidat; break; }
        }
        if (version) break;
      }
      if (!version) { alert('Die Fassung der Schulmanager-Seite ließ sich nicht ermitteln. Bitte die Seite neu laden und es noch einmal versuchen.'); return; }
      sessionStorage.setItem('stbuchen-version', version);
    }

    // Welche Koffer sind frei? Belegte meldet der Schulmanager mit Buchung.
    const belegt = async ids => {
      const r = await anfrage(version, pruefung(ids));
      return (r && r.data) || {};
    };
    const wer = b => { const t = b && b.reservation && b.reservation.teacher; return t ? `${t.lastname}, ${t.firstname}` : 'belegt'; };
    let besetzt = await belegt(wunsch);
    let frei = wunsch.filter(id => !besetzt[id]);
    if (!frei.length) {
      const liste1 = wunsch.map(id => `  ${KOFFER[id] || id}: ${wer(besetzt[id])}`).join('\n');
      if (!confirm(`${wann}\n\nAlle passenden Koffer sind belegt:\n${liste1}\n\nEinen Koffer aus einem anderen Stockwerk nehmen?`)) return;
      const andere = Object.keys(KOFFER).map(Number).filter(id => !wunsch.includes(id));
      besetzt = await belegt(andere);
      frei = andere.filter(id => !besetzt[id]);
      if (!frei.length) { alert(`${wann}\n\nAlle iPad-Koffer sind belegt.`); return; }
    }
    const id = frei[0];
    if (!confirm(`iPad-Koffer ${KOFFER[id] || id} buchen?\n\n${wann}`)) return;
    const r = await anfrage(version, [{ moduleName: 'resources', endpointName: 'create-resource-reservation',
      parameters: { resourceId: id, comment: '', startDate: datum, endDate: datum,
        startClassHourId: stundeId(stunde), endClassHourId: stundeId(stunde), repeatUntilDate: null } }]);
    if (r && r.status === 200 && r.data && r.data.id) {
      window.name = '';                       // derselbe Auftrag nicht zweimal
      alert(`Gebucht: iPad-Koffer ${KOFFER[id] || id}\n${wann}`);
      location.hash = `#/modules/resources/book/1682/${id}?startDate=${datum}`;
      location.reload();
    } else {
      alert('Die Buchung hat nicht geklappt' + (r && r.status ? ` (Status ${r.status})` : '') +
        '. Bitte direkt im Schulmanager buchen.');
    }
  },

  /* Das Lesezeichen selbst: der Code oben als javascript:-Adresse */
  adresse() {
    return 'javascript:' + encodeURIComponent('(' + this.lesezeichenCode.toString() + ')()');
  },
};
