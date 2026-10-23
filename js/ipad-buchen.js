/* iPad-Koffer per Knopf buchen – und die eigenen Buchungen in den Plan holen.

   Das School-Tool selbst kann im Schulmanager weder buchen noch Buchungen lesen –
   dafür fehlt ihm die Anmeldung, und die soll es auch nicht bekommen. Der Plan
   öffnet deshalb die Buchungsseite des Schulmanagers und gibt den Auftrag im
   Fensternamen mit (window.name überlebt das Laden der Seite, anders als ein
   Zusatz in der Adresse, den der Schulmanager wegräumt):
     stbuchen|2026-10-29|3|66897,66898,127145|Mu 5a, H311   – buchen
     stabgleich                                             – Buchungen holen
   Ein Lesezeichen in Chrome („iPads buchen“) führt dann auf der Seite des
   Schulmanagers – mit dessen Anmeldung – den Auftrag aus. Die eigenen Buchungen
   bringt es als Anker zurück ins School-Tool:
     …/school-tool/#plan&ipads=2026-10-19_2026-12-21~2026-10-23.4.66897~…
   (Zeitraum, dann je Buchung Tag.Stunde.Koffer). Der Code des Lesezeichens ist
   die Funktion unten; er steckt komplett im Lesezeichen und lädt nichts nach. */
const IpadBuchen = {
  /* Läuft im Schulmanager, nicht hier – darf deshalb nichts aus dem School-Tool
     benutzen. Alle Angaben stehen in der Funktion selbst. */
  lesezeichenCode: async function () {
    const SCHOOLTOOL = 'https://greenboy87.github.io/school-tool/';
    const KOFFER = {
      66893: 'N101 (20)', 66895: 'N104 (16)', 66894: 'H104 (16)', 100869: 'H202 (16)',
      112899: 'H218 (16)', 66897: 'H300 (20)', 66898: 'H304 (16)', 127145: 'H313 (20)',
    };
    const ALLE = Object.keys(KOFFER).map(Number);
    // Schulstunde → Kennung im Schulmanager (1. Stunde = 26570, fortlaufend)
    const stundeId = n => 26569 + Number(n);
    const tagText = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (!/schulmanager-online\.de$/.test(location.hostname)) {
      alert('Dieses Lesezeichen funktioniert nur auf der Seite des Schulmanagers.');
      return;
    }

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
    const heute = tagText(new Date());
    const belegung = (von, bis) => [{ moduleName: 'resources', endpointName: 'load-resource-reservations',
      parameters: { resourceIds: ALLE, startDate: von, endDate: bis } }];
    let version = sessionStorage.getItem('stbuchen-version');
    if (!version || !(await anfrage(version, belegung(heute, heute)))) {
      version = null;
      const dateien = [...new Set(performance.getEntriesByType('resource').map(e => e.name)
        .filter(n => n.startsWith(location.origin + '/static/') && n.endsWith('.js')))];
      for (const d of dateien) {
        const text = await fetch(d).then(r => r.text()).catch(() => '');
        for (const [, kandidat] of text.matchAll(/="([0-9a-f]{10})"/g)) {
          if (await anfrage(kandidat, belegung(heute, heute))) { version = kandidat; break; }
        }
        if (version) break;
      }
      if (!version) { alert('Die Fassung der Schulmanager-Seite ließ sich nicht ermitteln. Bitte die Seite neu laden und es noch einmal versuchen.'); return; }
      sessionStorage.setItem('stbuchen-version', version);
    }

    /* Eigene Buchungen der letzten zwei und der nächsten zwölf Wochen holen und
       ins School-Tool bringen. „Eigene“: selbst angelegt – oder für dieselbe
       Lehrkraft, falls jemand anders für einen gebucht hat. */
    const abgleichen = async () => {
      const von = tagText(new Date(Date.now() - 14 * 864e5));
      const bis = tagText(new Date(Date.now() + 84 * 864e5));
      const r = await anfrage(version, belegung(von, bis));
      if (!r || !r.data) { alert('Die Buchungen ließen sich nicht laden.'); return; }
      const ich = Number(localStorage.getItem('user'));
      const alle = [];
      for (const [tag, stunden] of Object.entries(r.data)) {
        for (const [std, res] of Object.entries(stunden)) {
          for (const [koffer, b] of Object.entries(res)) alle.push({ tag, std: Number(std) - 26569, koffer, v: b.reservation || {} });
        }
      }
      const lehrer = new Set(alle.filter(x => x.v.lastUpdatedById === ich).map(x => x.v.teacherId));
      const eigene = alle.filter(x => x.v.lastUpdatedById === ich || lehrer.has(x.v.teacherId));
      location.href = SCHOOLTOOL + '#plan&ipads=' + von + '_' + bis +
        eigene.map(x => `~${x.tag}.${x.std}.${x.koffer}`).join('');
    };

    let auftrag = /^stbuchen\|(\d{4}-\d\d-\d\d)\|(\d)\|([\d,]+)\|(.*)$/.exec(window.name || '');
    if (window.name === 'stabgleich') { window.name = ''; await abgleichen(); return; }
    if (!auftrag) {
      if (confirm('Deine iPad-Buchungen ins School-Tool übernehmen?\n\n(Abbrechen: stattdessen einen Koffer buchen)')) { await abgleichen(); return; }
      // Ohne Auftrag aus dem School-Tool: Tag und Koffer aus der Buchungsseite,
      // die Stunde erfragen
      const seite = /book\/\d+\/(-?\d+)\?startDate=(\d{4}-\d\d-\d\d)/.exec(location.hash);
      if (!seite) { alert('Bitte zuerst im Schulmanager die Seite „Ressourcen buchen“ öffnen – oder im School-Tool (Plan) auf „buchen“ klicken.'); return; }
      const [j, m, t] = seite[2].split('-');
      const eingabe = prompt('iPad-Koffer buchen – Tag und Stunde, z. B. „29.10. 3“:', `${+t}.${+m}. `);
      const e = /^\s*(\d{1,2})\.(\d{1,2})\.?\s+([1-9])\s*$/.exec(eingabe || '');
      if (!e) { if (eingabe) alert('Bitte so eingeben: Tag.Monat. Stunde – z. B. 29.10. 3'); return; }
      const ids = seite[1] !== '-1' ? seite[1] : ALLE.join(',');
      auftrag = [null, `${j}-${e[2].padStart(2, '0')}-${e[1].padStart(2, '0')}`, e[3], ids, ''];
    }
    const [, datum, stunde, liste, was] = auftrag;
    const wunsch = liste.split(',').map(Number);
    const tag = new Date(datum + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
    const wann = `${tag}, ${stunde}. Stunde${was ? ' (' + was + ')' : ''}`;

    // Welche Koffer sind frei? Belegte meldet der Schulmanager mit Buchung.
    const belegt = async ids => {
      const r = await anfrage(version, [{ moduleName: 'resources', endpointName: 'check-resource-reservation-conflicts',
        parameters: { resourceIds: ids, startDate: datum, endDate: datum,
          startClassHourId: stundeId(stunde), endClassHourId: stundeId(stunde), repeatUntilDate: null } }]);
      return (r && r.data) || {};
    };
    const wer = b => { const t = b && b.reservation && b.reservation.teacher; return t ? `${t.lastname}, ${t.firstname}` : 'belegt'; };
    let besetzt = await belegt(wunsch);
    let frei = wunsch.filter(id => !besetzt[id]);
    if (!frei.length) {
      const liste1 = wunsch.map(id => `  ${KOFFER[id] || id}: ${wer(besetzt[id])}`).join('\n');
      if (!confirm(`${wann}\n\nAlle passenden Koffer sind belegt:\n${liste1}\n\nEinen Koffer aus einem anderen Stockwerk nehmen?`)) return;
      const andere = ALLE.filter(id => !wunsch.includes(id));
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
      alert(`Gebucht: iPad-Koffer ${KOFFER[id] || id}\n${wann}\n\nZurück zum School-Tool – die Buchung steht dann im Plan.`);
      await abgleichen();
    } else {
      alert('Die Buchung hat nicht geklappt' + (r && r.status ? ` (Status ${r.status})` : '') +
        '. Bitte direkt im Schulmanager buchen.');
    }
  },

  /* Das Lesezeichen selbst: der Code oben als javascript:-Adresse */
  adresse() {
    return 'javascript:' + encodeURIComponent('(' + this.lesezeichenCode.toString() + ')()');
  },

  /* ---------- Im School-Tool: Buchungen aus dem Anker übernehmen ----------
     Die Buchungen liegen in Classes.data.planIpads unter der Stunde
     („2026-10-23 10:45“ → [Koffer-Nummern]) und reisen im Sync mit. Im
     abgeglichenen Zeitraum ersetzt der neue Stand den alten, damit stornierte
     Buchungen verschwinden. */
  ankerLesen() {
    const m = /(?:^|[#&])ipads=([^&]*)/.exec(location.hash);
    if (!m || !Classes.data) return 0;
    const teile = decodeURIComponent(m[1]).split('~');
    const zeitraum = /^(\d{4}-\d\d-\d\d)_(\d{4}-\d\d-\d\d)$/.exec(teile.shift() || '');
    // Anker gleich wieder entfernen, der Reiter bleibt
    const rest = location.hash.replace(/^#/, '').split('&').filter(t => t && !/^ipads=/.test(t)).join('&');
    history.replaceState(null, '', location.pathname + location.search + (rest ? '#' + rest : ''));
    if (!zeitraum) return 0;
    const [, von, bis] = zeitraum;
    const zeit = Object.fromEntries(Object.entries(Stundenplan.STUNDEN).map(([z, n]) => [parseInt(n, 10), z]));
    const ipads = Classes.data.planIpads || (Classes.data.planIpads = {});
    for (const key of Object.keys(ipads)) {
      const tag = key.split(' ')[0];
      if (tag >= von && tag <= bis) delete ipads[key];
    }
    let n = 0;
    for (const t of teile) {
      const b = /^(\d{4}-\d\d-\d\d)\.(\d)\.(\d+)$/.exec(t);
      if (!b || !zeit[b[2]] || !Stundenplan.KOFFER.some(k => k.id === Number(b[3]))) continue;
      const key = b[1] + ' ' + zeit[b[2]];
      (ipads[key] = ipads[key] || []).includes(Number(b[3])) || ipads[key].push(Number(b[3]));
      n++;
    }
    Classes.data.planIpadsStand = Date.now();
    Classes.persist();
    return n;
  },
};
