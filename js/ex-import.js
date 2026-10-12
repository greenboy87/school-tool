/* Zerlegt eine Ex-Datei (tom-ex/2) in Schülerfassung und Geheimteil.

   Reine Funktion ohne Datenbank: Text der HTML-Datei hinein, Teile heraus.
   Die Schülerfassung ist die Datei ohne jedes Element mit data-ex-secret und
   ohne die Audiodaten der Hörbeispiele (die spielt die Lehrkraft live vor).
   Siehe docs/ex/ex-format.md. */
const ExImport = {
  FORMAT: 'tom-ex/2',
  ID_MUSTER: /^[a-z0-9][a-z0-9-]{1,60}$/,
  BEWERTUNGEN: ['auto', 'manuell', 'teil'],

  /* Wirft einen Error mit verständlichem Text, wenn die Datei nicht passt.
     Rückgabe: { meta, info, loesungJson, bewertung, schuelerHtml, hinweise } */
  zerlegen(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');

    const format = doc.querySelector('meta[name="ex-format"]');
    if (!format) throw new Error('Das ist keine Ex-Datei: Der Kennzeichner <meta name="ex-format"> fehlt.');
    if (format.content !== this.FORMAT) {
      throw new Error(`Falsches Ex-Format „${format.content}“ – erwartet wird „${this.FORMAT}“.`);
    }

    const meta = this.json(doc, 'ex-meta', 'den Metadaten');
    this.pruefeMeta(meta);

    const loesungEl = doc.getElementById('ex-loesung');
    const bewertungEl = doc.getElementById('ex-bewertung');
    if (!loesungEl || !loesungEl.hasAttribute('data-ex-secret')) {
      throw new Error('Der Lösungsteil (#ex-loesung mit data-ex-secret) fehlt.');
    }
    if (!bewertungEl || !bewertungEl.hasAttribute('data-ex-secret')) {
      throw new Error('Der Bewertungsteil (#ex-bewertung mit data-ex-secret) fehlt.');
    }
    const loesung = this.json(doc, 'ex-loesung', 'den Lösungen');
    const bewertung = bewertungEl.textContent;
    if (!/function\s+bewerte\s*\(/.test(bewertung)) {
      throw new Error('Im Bewertungsteil fehlt die Funktion bewerte(antworten, loesung, kontext).');
    }

    // Schülerfassung: alles Geheime weg, Hörbeispiele ohne Audiodaten
    doc.querySelectorAll('[data-ex-secret]').forEach(el => el.remove());
    // HTML-Kommentare auch – über einem Geheimblock steht gern, was darin war
    const kommentare = [];
    const gang = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
    while (gang.nextNode()) kommentare.push(gang.currentNode);
    kommentare.forEach(k => k.remove());
    const schuelerMeta = { ...meta, medien: (meta.medien || []).map(({ src, ...rest }) => rest) };
    doc.getElementById('ex-meta').textContent = '\n' + JSON.stringify(schuelerMeta, null, 2) + '\n';
    const schuelerHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

    this.pruefeSchuelerfassung(schuelerHtml, loesung);

    // Für die Datenbank: Metadaten ohne data-URIs, Bilder nur als Namen
    const cloudMeta = { ...schuelerMeta, bilder: Object.keys(meta.bilder || {}) };
    const info = {
      titel: meta.titel, art: meta.art || '', fach: meta.fach || '',
      dauerMinuten: meta.dauerMinuten, punkteGesamt: meta.punkteGesamt,
      aufgaben: meta.aufgaben.length, hoerbeispiele: (meta.medien || []).length,
    };
    return {
      meta: cloudMeta, info, schuelerHtml,
      loesungJson: JSON.stringify(loesung), bewertung,
      hinweise: this.hinweise(meta, schuelerHtml, loesung),
    };
  },

  json(doc, id, was) {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`Der Block mit ${was} (#${id}) fehlt.`);
    try { return JSON.parse(el.textContent); }
    catch (e) { throw new Error(`Der Block mit ${was} (#${id}) ist kein gültiges JSON: ${e.message}`); }
  },

  pruefeMeta(m) {
    const fehler = [];
    if (m.format !== this.FORMAT) fehler.push(`format muss „${this.FORMAT}“ sein`);
    if (typeof m.id !== 'string' || !this.ID_MUSTER.test(m.id)) {
      fehler.push('id fehlt oder enthält andere Zeichen als a–z, 0–9 und Bindestrich');
    }
    if (typeof m.titel !== 'string' || !m.titel.trim()) fehler.push('titel fehlt');
    if (!(m.dauerMinuten > 0 && m.dauerMinuten <= 240)) fehler.push('dauerMinuten fehlt oder ist unplausibel');
    if (!(m.punkteGesamt > 0)) fehler.push('punkteGesamt fehlt');
    if (!Array.isArray(m.aufgaben) || !m.aufgaben.length) fehler.push('aufgaben fehlt oder ist leer');
    else {
      const ids = new Set();
      m.aufgaben.forEach((a, i) => {
        if (!a || typeof a.id !== 'string' || !a.id) fehler.push(`Aufgabe ${i + 1}: id fehlt`);
        else if (ids.has(a.id)) fehler.push(`Aufgabe ${a.id} kommt doppelt vor`);
        else ids.add(a.id);
        if (!(typeof a.punkte === 'number' && a.punkte >= 0)) fehler.push(`Aufgabe ${a.id || i + 1}: punkte fehlt`);
        if (!this.BEWERTUNGEN.includes(a.bewertung)) {
          fehler.push(`Aufgabe ${a.id || i + 1}: bewertung muss auto, manuell oder teil sein`);
        }
      });
    }
    if (m.medien != null && !Array.isArray(m.medien)) fehler.push('medien muss eine Liste sein');
    if (fehler.length) throw new Error('Die Metadaten (#ex-meta) sind unvollständig:\n• ' + fehler.join('\n• '));
  },

  /* Harte Prüfung: Darf etwas davon in der Schülerfassung stehen, ist der Import abgebrochen */
  pruefeSchuelerfassung(html, loesung) {
    const verboten = [
      ['data-ex-secret', 'ein Element mit data-ex-secret'],
      ['id="ex-loesung"', 'der Lösungsblock'],
      ['id="ex-bewertung"', 'der Bewertungsblock'],
      ['id="ex-vorschau"', 'die Vorschau-Leiste'],
      ['data:audio/', 'Audiodaten'],
    ];
    if (loesung && typeof loesung === 'object') {
      for (const k of Object.keys(loesung)) if (k.length >= 8) verboten.push([`"${k}"`, `der Lösungsschlüssel „${k}“`]);
    }
    const treffer = verboten.filter(([s]) => html.includes(s)).map(([, was]) => was);
    if (/function\s+bewerte\s*\(/.test(html)) treffer.push('die Funktion bewerte()');
    if (treffer.length) {
      throw new Error('Die Schülerfassung enthält noch Geheimes – Import abgebrochen:\n• ' + treffer.join('\n• '));
    }
  },

  /* Weiche Prüfung: Lösungswörter, die in der Schülerfassung sichtbar sind.
     Das darf sein (etwa in späteren Stationen), soll aber auffallen. */
  hinweise(meta, html, loesung) {
    const ohneDaten = html.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '').toLowerCase();
    const woerter = new Set();
    (function sammle(x) {
      if (typeof x === 'string') { if (x.length >= 6 && x.length <= 40 && !/\s/.test(x)) woerter.add(x); }
      else if (x && typeof x === 'object') Object.values(x).forEach(sammle);
    })(loesung);
    const gesehen = new Set();
    const sichtbar = [...woerter].filter(w => {
      const k = w.toLowerCase();
      if (gesehen.has(k) || !ohneDaten.includes(k)) return false;
      gesehen.add(k);
      return true;
    });
    const hinweise = [];
    if (sichtbar.length) {
      hinweise.push(`Diese Lösungswörter stehen auch in der Schülerfassung (in Ordnung, wenn sie erst ` +
        `nach dem Abschließen einer Tipp-Station auftauchen): ${sichtbar.join(', ')}`);
    }
    const summe = meta.aufgaben.reduce((s, a) => s + (a.punkte || 0), 0);
    if (summe !== meta.punkteGesamt) {
      hinweise.push(`Die Aufgaben ergeben ${summe} Punkte, punkteGesamt sagt ${meta.punkteGesamt}.`);
    }
    return hinweise;
  },
};
