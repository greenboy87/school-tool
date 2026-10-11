/* Tiny Band – die Besetzung eines Songs an EINER Stelle.

   Lehrerseite (Bands bilden, Live-Ansicht, Beamer) und Schülerseite lesen beide
   nur von hier. Für einen anderen Song genügt es, diese Liste und SONG zu
   tauschen – solange die Kürzel gleich bleiben. Neue Kürzel müssen auch in die
   Firebase-Regeln (firebase-regeln.md, Muster dr|ba|sy|ge|uk).

   min/max gelten je Band. min 1 heißt Pflicht: fehlt es, warnt die Lehrerseite
   und die Schülerseite sagt „Euch fehlt noch …“. anspruch ist 1–3 und erscheint
   überall als drei Punkte. */
const TinyBand = {
  SONG: 'End Of Beginning',
  BANDGROESSE: 5,           // Richtwert für die Bandzahl und Obergrenze beim Beitreten

  INSTRUMENTE: [
    { k: 'dr', name: 'Drums',   unter: 'Drumset',                  min: 1, max: 1, anspruch: 1, farbe: '#4F5BD5' },
    { k: 'ba', name: 'E-Bass',  unter: '',                         min: 1, max: 1, anspruch: 3, farbe: '#0F9B8E' },
    { k: 'sy', name: 'Synth',   unter: 'Keyboard',                 min: 1, max: 2, anspruch: 1, farbe: '#7B3FE4' },
    { k: 'ge', name: 'Gesang',  unter: 'deine Stimme, freiwillig', min: 0, max: 2, anspruch: 2, farbe: '#D6406E' },
    { k: 'uk', name: 'Ukulele', unter: '',                         min: 0, max: 1, anspruch: 2, farbe: '#E08A1E' },
  ],

  /* Wer nirgends unterkommt, landet hier – auch über max hinaus */
  AUFFANG: 'sy',

  inst(k) { return this.INSTRUMENTE.find(i => i.k === k) || null; },
  name(k) { const i = this.inst(k); return i ? i.name : ''; },
  kuerzel() { return this.INSTRUMENTE.map(i => i.k); },
  pflicht() { return this.INSTRUMENTE.filter(i => i.min > 0); },
  gueltig(k) { return !!this.inst(k); },

  /* Was einer Besetzung (Kürzel → Anzahl) zum Spielen noch fehlt */
  fehlt(besetzung) {
    return this.pflicht().filter(i => (besetzung[i.k] || 0) < i.min);
  },

  /* Drei Punkte, gefüllt nach Anspruch. Als HTML, weil beide Seiten sie in
     Karten setzen; der Text daneben ist für Vorlesehilfen. */
  punkte(n, klasse = 'tb-punkte') {
    let html = `<span class="${klasse}" role="img" aria-label="Anspruch ${n} von 3">`;
    for (let i = 1; i <= 3; i++) html += `<i class="${i <= n ? 'voll' : 'leer'}"></i>`;
    return html + '</span>';
  },

  /* Einfache weiße Strich-Symbole, gedacht für den farbigen Kreis */
  ICONS: {
    sy: '<rect x="5" y="15" width="38" height="20" rx="3"/><path d="M12.6 25v10M20.2 25v10M27.8 25v10M35.4 25v10"/>' +
        '<path d="M10 15v10h4V15M17.6 15v10h4V15M28.6 15v10h4V15" fill="currentColor" stroke="none"/>',
    uk: '<circle cx="17" cy="32" r="8"/><circle cx="23" cy="25" r="5.5"/><path d="M26 22 39 9"/>' +
        '<path d="m37 7 4 4"/><circle cx="17" cy="32" r="2.2" fill="currentColor" stroke="none"/>',
    ba: '<path d="M16 31c-3-4-9-4-9 1-4 2-5 8-1 11s10 2 11-3c4 0 6-5-1-9z"/>' +
        '<path d="M16 31 35 12M35 11l6-6 3 3-6 6zM36.5 9.5l-2-2M38.5 7.5l-2-2M40.5 5.5l-2-2M10 37l3 3M12.5 34.5l3 3"/>',
    dr: '<ellipse cx="24" cy="27" rx="15" ry="5"/><path d="M9 27v10c0 2.8 6.7 5 15 5s15-2.2 15-5V27"/>' +
        '<path d="M14 31v9M24 32v10M34 31v9M11 6l17 17M37 6 20 23"/>',
    ge: '<rect x="18" y="5" width="12" height="21" rx="6"/><path d="M12 22a12 12 0 0 0 24 0M24 34v8M17 42h14"/>' +
        '<path d="M18 13h4M18 18h4"/>',
  },

  /* Flache Großstadt-Silhouette (Chicago) mit ein paar warmen Fenstern.
     Fest „ausgewürfelt“, damit sie auf jedem Gerät gleich aussieht. */
  skyline() {
    let zufall = 7;
    const r = () => (zufall = (zufall * 9301 + 49297) % 233280) / 233280;
    const B = 1200, H = 260;
    let x = 0, haeuser = '', fenster = '';
    // Höhen in Anteilen von H; zwei markante Türme wie Willis und Hancock
    const besondere = { 9: { h: .92, b: 46, antennen: 2 }, 19: { h: .8, b: 40, spitz: true, antennen: 2 } };
    for (let n = 0; x < B; n++) {
      const sp = besondere[n];
      const b = sp ? sp.b : 22 + Math.round(r() * 38);
      const h = sp ? sp.h : .18 + r() * .45;
      const top = Math.round(H - h * H);
      if (sp && sp.spitz) {
        haeuser += `<path d="M${x} ${H}V${top + 8}L${x + 5} ${top}H${x + b - 5}L${x + b} ${top + 8}V${H}Z"/>`;
      } else if (sp) {
        // Abgetreppt wie der Willis Tower
        haeuser += `<path d="M${x} ${H}V${top + 40}H${x + 8}V${top + 14}H${x + 16}V${top}H${x + 30}V${top + 22}H${x + 38}V${top + 50}H${x + b}V${H}Z"/>`;
      } else {
        haeuser += `<rect x="${x}" y="${top}" width="${b}" height="${H - top}"/>`;
        if (r() < .3) haeuser += `<rect x="${x + b / 2 - 1}" y="${top - 14}" width="2" height="14"/>`;
      }
      if (sp && sp.antennen) {
        const ax = sp.spitz ? x + 10 : x + 18;
        haeuser += `<rect x="${ax}" y="${top - 34}" width="2.5" height="34"/><rect x="${ax + (sp.spitz ? b - 22 : 9)}" y="${top - 26}" width="2.5" height="26"/>`;
      }
      // Wenige Fenster brennen noch
      for (let fy = top + 10; fy < H - 8; fy += 12) {
        for (let fx = x + 5; fx < x + b - 6; fx += 9) {
          if (r() < .07) fenster += `<rect x="${fx}" y="${fy}" width="4" height="5"/>`;
        }
      }
      x += b + (r() < .25 ? 3 : 0);
    }
    return `<svg viewBox="0 0 ${B} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">` +
      `<g fill="#0B0716">${haeuser}</g><g fill="#FFC88C" opacity=".38">${fenster}</g></svg>`;
  },

  icon(k, klasse = 'tb-icon') {
    const pfad = this.ICONS[k] || '';
    return `<svg class="${klasse}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" ` +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pfad}</svg>`;
  },
};

window.TinyBand = TinyBand;
