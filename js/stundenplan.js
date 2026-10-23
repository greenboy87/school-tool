/* Stundenplan aus dem iCal-Abo des Schulmanagers.

   Der Browser darf die .ics-Adresse nicht direkt abrufen (CORS); das erledigt
   ein Cloudflare Worker (cloudflare/stundenplan-worker.js). Die Abo-Adresse
   liegt bei den Klassendaten und reist damit verschlüsselt im Sync mit – sie
   ist wie ein Passwort zum Kalender. Der Plan selbst kommt nicht in die
   Datenbank: Er wird auf jedem Gerät frisch geholt und hier nur zwischengelagert.

   Was das Abo liefert: je Stunde ein Termin, die Art steckt in der UID
   („regularLesson_24326369_2026-10-22@…“, ebenso cancelledLesson,
   specialLesson, supervision, cancelledSupervision). Die Zahl bezeichnet den
   festen Platz im Plan. Ein Raumtausch ist nicht eigens gekennzeichnet – er
   fällt erst auf, wenn derselbe Platz sonst in einem anderen Raum liegt. Deshalb
   merkt sich das Tool die Räume der vergangenen Wochen.

   Das Abo reicht nur gut zwei Wochen zurück. Damit gehaltene Stunden nicht mit
   ihm verschwinden, schreibt das Tool jede vergangene Stunde einer School-Tool-
   Klasse ins Stundenbuch der Klasse (cls.stundenbuch), Schlüssel „2026-10-22 09:30“:
     { e: '10:15', f: 'Mu', k: '5a', r: 'H311', x: 1 (entfallen),
       th: [{ id, w }] (Themen mit Schlagwort; ohne id ein eigener Eintrag wie
       „Schulaufgabe“), m: 1 (Thema von Hand gesetzt), s: 'bis Folie 15' (eigener Stand),
       i: 'Geld einsammeln' (Info zu dieser Stunde), p: 1 (iPads nötig) }
   Stunden ohne Klasse im School-Tool (Vertretung in einer fremden Klasse) haben
   ihr eigenes Buch, Classes.data.planStunden – die Klasse steht dort aus dem Abo.
   Die Themen werden am Tag nach der Stunde festgeschrieben; bis dahin folgen sie
   dem Fortschritt im Reiter Stunden. Der Stand gehört zu genau einer Stunde.

   Über das Abo hinaus geht der Plan als Vorschau weiter: Jeder feste Platz hat im
   Abo eine Nummer, auch wenn die Stunde gerade entfällt. Die Plätze der letzten
   Abo-Woche ergeben die Regelwoche (Classes.data.planVorlage). Ferien kennt das
   Abo nicht – freie Tage markiert man selbst (Classes.data.planFrei). */
const Stundenplan = {
  WORKER: 'https://stundenplan.tomgruenig87.workers.dev/',
  CACHE_KEY: 'stundenplan-cache',
  RAEUME_KEY: 'stundenplan-raeume',
  ANSICHT_KEY: 'stundenplan-ansicht',
  THEMEN_KEY: 'stundenplan-themen',
  STAND_KEY: 'stundenplan-stand',
  NEU_HOLEN_MS: 15 * 60 * 1000,

  /* iPad-Koffer im Schulmanager (Ressourcen → Koffer = Kategorie 1682). Die
     Buchungsseite lässt sich über die Adresse auf Koffer und Woche stellen;
     gebucht wird dort mit einem Klick auf die Stunde. Passend sind die Koffer
     im selben Haus und Stockwerk wie der Raum (H311 → H3xx, Mu1-N110 → N1xx). */
  IPAD_SEITE: 'https://login.schulmanager-online.de/#/modules/resources/book/1682/',
  KOFFER: [
    { id: 66893, raum: 'N101', ipads: 20 }, { id: 66895, raum: 'N104', ipads: 16 },
    { id: 66894, raum: 'H104', ipads: 16 }, { id: 100869, raum: 'H202', ipads: 16 },
    { id: 112899, raum: 'H218', ipads: 16 }, { id: 66897, raum: 'H300', ipads: 20 },
    { id: 66898, raum: 'H304', ipads: 16 }, { id: 127145, raum: 'H313', ipads: 20 },
  ],
  RAEUME_TAGE: 120,

  termine: [],
  geholt: 0,
  fehler: '',
  laedt: false,
  wochenVersatz: 0,
  tagWahl: null,          // in der Tagesansicht gezeigter Tag; null = heute

  init() {
    this.el = document.getElementById('tab-plan');
    if (!this.el) return;
    this.schalter = document.getElementById('plan-ansicht');
    this.schalter.checked = localStorage.getItem(this.ANSICHT_KEY) === 'woche';
    this.schalter.addEventListener('change', () => this.ansicht(this.schalter.checked ? 'woche' : 'heute'));
    const schalter = (id, key) => {
      const el = document.getElementById(id);
      el.checked = localStorage.getItem(key) !== 'aus';
      el.addEventListener('change', () => {
        localStorage.setItem(key, el.checked ? 'an' : 'aus');
        this.render();
      });
      return el;
    };
    this.themenSchalter = schalter('plan-themen', this.THEMEN_KEY);
    this.standSchalter = schalter('plan-stand-zeigen', this.STAND_KEY);
    this.karte = this.el.querySelector('.plan-card');
    // Klick neben das Bearbeiten-Fenster schließt es – ohne zu speichern, wie „Abbrechen“
    const dlg = document.getElementById('plan-dialog');
    dlg.addEventListener('click', e => {
      if (e.target !== dlg) return;            // Klick auf Inhalt, nicht auf den Rand
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
    });
    const lesezeichen = document.getElementById('ipad-lesezeichen');
    if (lesezeichen && typeof IpadBuchen !== 'undefined') lesezeichen.href = IpadBuchen.adresse();
    // H = Heute, W = Woche – solange der Plan offen ist und nicht getippt wird
    document.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if ((k !== 'h' && k !== 'w') || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!this.el.classList.contains('active')) return;
      const ziel = e.target;
      if (ziel && ziel.closest && ziel.closest('input, textarea, select, dialog, [contenteditable="true"]')) return;
      e.preventDefault();
      this.ansicht(k === 'w' ? 'woche' : 'heute');
    });
    document.getElementById('btn-plan-voll').addEventListener('click', () => this.vollbild());
    // Klassenbuch unter Klassen: drucken, Zeile anklicken zum Bearbeiten
    document.getElementById('btn-klassenbuch-druck').addEventListener('click', () => this.buchDrucken(Classes.currentClass()));
    document.getElementById('klassenbuch-tabelle').addEventListener('click', e => {
      const zeile = e.target.closest('[data-buch]');
      if (zeile && !zeile.classList.contains('entfallen')) this.themaBearbeiten(zeile.dataset.buch);
    });
    document.querySelector('.subtab-btn[data-subtab="klassenbuch"]').addEventListener('click', () => this.klassenbuchZeigen());
    document.getElementById('btn-plan-neu').addEventListener('click', () => this.holen());
    document.getElementById('btn-plan-abo').addEventListener('click', () => this.aboFragen());
    document.getElementById('plan-inhalt').addEventListener('click', e => {
      if (e.target.closest('a')) return;     // Links (iPads buchen) öffnen nur sich selbst
      const link = e.target.closest('[data-klasse]');
      if (link) { this.klasseOeffnen(link.dataset.klasse); return; }
      const thema = e.target.closest('[data-thema]');
      if (thema) { this.themaBearbeiten(thema.dataset.thema); return; }
      const nehmen = e.target.closest('[data-uebernehmen]');
      if (nehmen) { this.uebernehmen(...nehmen.dataset.uebernehmen.split('|')); return; }
      const stand = e.target.closest('[data-stand]');
      if (stand) { this.standAendern(stand.dataset.stand.split('|')[0], stand.dataset.stand.split('|')[1]); return; }
      const kb = e.target.closest('[data-klassenbuch]');
      if (kb) { this.klassenbuchOeffnen(kb); return; }
      const datei = e.target.closest('[data-oeffnen]');
      if (datei) { Lessons.oeffnen(datei.dataset.oeffnen); return; }
      const kopie = e.target.closest('[data-kopieren]');
      if (kopie) Lessons.schlagwortKopieren(kopie, kopie.dataset.kopieren);
      const nav = e.target.closest('[data-woche]');
      if (nav) { this.woche(parseInt(nav.dataset.woche, 10)); return; }
      const tagNav = e.target.closest('[data-tagnav]');
      if (tagNav) { this.tag(parseInt(tagNav.dataset.tagnav, 10)); return; }
      const tagKopf = e.target.closest('[data-tag]');
      if (tagKopf) { this.ansicht('heute', tagKopf.dataset.tag); return; }
      const schieben = e.target.closest('[data-verschieben]');
      if (schieben) { this.verschieben(...schieben.dataset.verschieben.split('|')); return; }
      const frei = e.target.closest('[data-frei]');
      if (frei) { this.freiUmschalten(frei.dataset.frei.split(',')); return; }
      // Klick irgendwo in die Stunde: bearbeiten
      const stunde = e.target.closest('[data-stunde]');
      if (stunde) this.themaBearbeiten(stunde.dataset.stunde);
    });

    // Maus über einer Stunde: alle Stunden derselben Klasse leuchten auf
    const inhalt = document.getElementById('plan-inhalt');
    const hervorheben = gruppe => {
      inhalt.classList.toggle('hervor', !!gruppe);
      inhalt.querySelectorAll('[data-gruppe]').forEach(el =>
        el.classList.toggle('gleich', !!gruppe && el.dataset.gruppe === gruppe));
    };
    inhalt.addEventListener('pointerover', e => {
      const el = e.target.closest('[data-gruppe]');
      hervorheben(el ? el.dataset.gruppe : '');
    });
    inhalt.addEventListener('pointerleave', () => hervorheben(''));

    this.ausCacheLaden();
    // iPad-Buchungen, die das Lesezeichen aus dem Schulmanager mitbringt
    const buchungenLesen = () => {
      if (!/(?:^|[#&])ipads=/.test(location.hash) || typeof IpadBuchen === 'undefined') return;
      const n = IpadBuchen.ankerLesen();
      this.ipadMeldung = n ? `${n} iPad-Buchung${n === 1 ? '' : 'en'} übernommen` : 'Keine eigenen iPad-Buchungen gefunden';
      this.render();
    };
    buchungenLesen();
    window.addEventListener('hashchange', buchungenLesen);
    this.render();

    // Geholt wird, wenn der Reiter offen ist – und dann alle 15 Minuten
    document.querySelector('.tab-btn[data-tab="plan"]').addEventListener('click', () => {
      if (Date.now() - this.geholt > this.NEU_HOLEN_MS) this.holen();
      else this.render();
    });
    setInterval(() => {
      if (!this.sichtbar()) return;
      if (Date.now() - this.geholt > this.NEU_HOLEN_MS) this.holen();
      else this.render();               // „läuft gerade“ weiterrücken
    }, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (this.sichtbar() && Date.now() - this.geholt > this.NEU_HOLEN_MS) this.holen();
    });
  },

  sichtbar() {
    return !document.hidden && this.el.classList.contains('active');
  },

  /* ---------- Abo-Adresse ---------- */
  abo() {
    return (Classes.data && Classes.data.stundenplanAbo) || '';
  },

  aboFragen() {
    const neu = prompt('Adresse des iCal-Abos aus dem Schulmanager\n' +
      '(Schulmanager → Stundenplan → Kalender abonnieren).\n\n' +
      'Sie wird mit deinen Klassendaten verschlüsselt abgeglichen.', this.abo());
    if (neu === null) return;
    const url = neu.trim().replace(/^webcal:/i, 'https:');
    if (url && !/^https:\/\/([\w-]+\.)*schulmanager-online\.de\//.test(url)) {
      alert('Das sieht nicht nach einer Schulmanager-Adresse aus.');
      return;
    }
    Classes.data.stundenplanAbo = url;
    Classes.persist();
    if (!url) {
      localStorage.removeItem(this.CACHE_KEY);
      this.termine = [];
      this.geholt = 0;
      this.render();
      return;
    }
    this.holen();
  },

  /* ---------- Holen und zwischenlagern ---------- */
  ausCacheLaden() {
    try {
      const c = JSON.parse(localStorage.getItem(this.CACHE_KEY));
      if (c && c.text) {
        this.termine = this.parse(c.text);
        this.geholt = c.geholt || 0;
      }
    } catch (e) { /* kaputter Zwischenstand: wird beim nächsten Holen ersetzt */ }
  },

  async holen() {
    const url = this.abo();
    if (!url || this.laedt) { this.render(); return; }
    this.laedt = true;
    this.fehler = '';
    this.render();
    try {
      const r = await fetch(this.WORKER, { method: 'POST', body: url });
      const text = await r.text();
      if (!r.ok) throw new Error(text || 'Fehler ' + r.status);
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Keine Kalenderdaten erhalten');
      this.termine = this.parse(text);
      this.geholt = Date.now();
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({ text, geholt: this.geholt }));
      this.raeumeMerken();
      this.vorlageMerken();
      this.buchFuehren();
    } catch (e) {
      this.fehler = e.message || String(e);
    } finally {
      this.laedt = false;
      this.render();
    }
  },

  /* ---------- iCal lesen ---------- */
  parse(text) {
    const zeilen = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const roh = [];
    let cur = null;
    for (const z of zeilen) {
      if (z === 'BEGIN:VEVENT') { cur = {}; continue; }
      if (z === 'END:VEVENT') { if (cur) roh.push(cur); cur = null; continue; }
      if (!cur) continue;
      const i = z.indexOf(':');
      if (i < 0) continue;
      const name = z.slice(0, i).split(';')[0];
      cur[name] = z.slice(i + 1)
        .replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/​/g, '');
    }
    return roh.map(r => this.termin(r)).filter(Boolean).sort((a, b) => a.beginn - b.beginn);
  },

  datum(s) {
    const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?/);
    if (!m) return null;
    const t = [+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
    return m[7] ? new Date(Date.UTC(...t)) : new Date(...t);
  },

  termin(r) {
    const beginn = this.datum(r.DTSTART), ende = this.datum(r.DTEND);
    if (!beginn) return null;
    const u = String(r.UID || '').match(/^([a-zA-Z]+)_(\d+)_/);
    const art = u ? u[1] : '';
    const entfaellt = r.STATUS === 'CANCELLED' || /^cancelled/.test(art);
    // „✖︎ Mu (5 A) (entfällt)“ → Fach „Mu“, Klassen „5 A“
    let titel = String(r.SUMMARY || '').replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/\s*\(entfällt\)\s*$/, '').trim();
    let fach = titel, klassen = [];
    const k = titel.match(/^(.*?)\s*\(([^()]*)\)$/);
    if (k) {
      fach = k[1];
      klassen = k[2].split(',').map(s => s.trim()).filter(Boolean);
    }
    const aufsicht = /supervision/i.test(art) || /^Aufsicht/.test(titel);
    if (aufsicht) fach = 'Aufsicht';
    const raum = String(r.LOCATION || '').replace(/^Raum\s+/, '').trim();
    return {
      uid: r.UID || '', art, platz: u ? u[2] : '', beginn, ende: ende || beginn,
      titel, fach, klassen, raum, entfaellt, aufsicht,
      sonder: art === 'specialLesson',
      ort: aufsicht ? titel.replace(/^Aufsicht:\s*/, '') : '',
    };
  },

  /* ---------- Räume merken, Raumtausch erkennen ---------- */
  raeume() {
    try { return JSON.parse(localStorage.getItem(this.RAEUME_KEY)) || {}; } catch (e) { return {}; }
  },

  raeumeMerken() {
    const liste = this.raeume();
    for (const t of this.termine) {
      if (t.entfaellt || t.aufsicht || !t.raum || !t.platz || t.sonder) continue;
      (liste[t.platz] = liste[t.platz] || {})[this.tagSchluessel(t.beginn)] = t.raum;
    }
    const grenze = this.tagSchluessel(new Date(Date.now() - this.RAEUME_TAGE * 864e5));
    for (const platz of Object.keys(liste)) {
      for (const tag of Object.keys(liste[platz])) if (tag < grenze) delete liste[platz][tag];
      if (!Object.keys(liste[platz]).length) delete liste[platz];
    }
    try { localStorage.setItem(this.RAEUME_KEY, JSON.stringify(liste)); } catch (e) { /* voll: ohne Verlauf weiter */ }
    this.ueblicheRaeume = null;
  },

  /* Der Raum, in dem ein Platz meistens liegt – erst ab zwei Belegen, sonst
     wäre jede einmalige Abweichung schon „der übliche Raum“. */
  ueblicherRaum(platz) {
    if (!this.ueblicheRaeume) {
      this.ueblicheRaeume = {};
      for (const [p, tage] of Object.entries(this.raeume())) {
        const zahl = {};
        for (const r of Object.values(tage)) zahl[r] = (zahl[r] || 0) + 1;
        const [raum, n] = Object.entries(zahl).sort((a, b) => b[1] - a[1])[0] || [];
        if (n >= 2) this.ueblicheRaeume[p] = raum;
      }
    }
    return this.ueblicheRaeume[platz] || '';
  },

  raumGetauscht(t) {
    if (t.entfaellt || t.aufsicht || !t.raum || t.vorschau) return '';
    const ueblich = this.ueblicherRaum(t.platz);
    return ueblich && ueblich !== t.raum ? ueblich : '';
  },

  /* ---------- Klassen im School-Tool finden ----------
     „5 A“ → „5a“, „5 F_FO“ → „5f“. Gesucht wird in den Klassennamen
     („5a Musik“, „5b/5d Sport“). Passt das Fach nicht zum Namen, gilt die
     Klasse nicht – sonst landete Sport bei der Musikklasse. */
  klassenSchluessel(s) {
    const m = String(s).toLowerCase().match(/(10|[5-9])\s*([a-z])/);
    return m ? m[1] + m[2] : '';
  },

  FAECHER: [
    { re: /^mu/i, name: /mus/i },
    { re: /^s[mwp]?$|^sport/i, name: /sport|\bs[mw]\b/i },
  ],

  /* Von Hand gewählte Klasse (Classes.data.planKlassen): je Stunde unter
     „2026-10-22 09:30“ – gilt nicht für Entfall zur selben Zeit – oder für
     alle Wochen unter „p:<Platz>“. Leere Kennung heißt: keine Klasse. */
  klasseVonHand(t) {
    const zuordnung = (Classes.data && Classes.data.planKlassen) || {};
    let id = t.entfaellt ? undefined : zuordnung[this.buchSchluessel(t)];
    if (id === undefined && t.platz) id = zuordnung['p:' + t.platz];
    return id;
  },

  klasseZu(t) {
    if (t.klasseId) return Classes.data.classes.find(c => c.id === t.klasseId) || null;
    if (t.ausBuchOhne) return null;
    const vonHand = this.klasseVonHand(t);
    if (vonHand !== undefined) return vonHand ? Classes.data.classes.find(c => c.id === vonHand) || null : null;
    if (!t.klassen.length || !Classes.data) return null;
    const gesucht = new Set(t.klassen.map(k => this.klassenSchluessel(k)).filter(Boolean));
    if (!gesucht.size) return null;
    const jahr = Classes.currentSchoolYear();
    const fach = this.FAECHER.find(f => f.re.test(t.fach));
    let beste = null, besteWertung = 0;
    for (const c of Classes.data.classes) {
      const name = String(c.name || '');
      const eigene = new Set([...name.toLowerCase().matchAll(/(10|[5-9])\s*([a-z])(?![a-zäöüß])/g)]
        .map(m => m[1] + m[2]));
      const treffer = [...gesucht].filter(k => eigene.has(k)).length;
      if (!treffer) continue;
      const fachImNamen = this.FAECHER.find(f => f.name.test(name));
      if (fach && fachImNamen && fachImNamen !== fach) continue;
      const wertung = treffer * 10 + (fach && fachImNamen === fach ? 5 : 0) +
        (c.year === jahr ? 2 : 0) - Math.abs(eigene.size - gesucht.size);
      if (wertung > besteWertung) { beste = c; besteWertung = wertung; }
    }
    return beste;
  },

  /* Vertretung in einer Klasse, die man sonst nicht hat: keine eigene Klasse
     nötig. Solche Stunden landen in einem Buch ohne Klasse; angezeigt wird die
     Klasse aus dem Abo. Ein festes Objekt, damit Vergleiche mit === greifen. */
  ohneKlasse() {
    if (!Classes.data.planStunden) Classes.data.planStunden = {};
    if (!this._ohne || this._ohne.stundenbuch !== Classes.data.planStunden) {
      this._ohne = { id: '-', name: 'ohne Klasse', ohne: true, stundenbuch: Classes.data.planStunden, lessons: {} };
    }
    return this._ohne;
  },

  /* Wohin Thema, Stand und Info einer Stunde gehören: zur Klasse – oder, ohne
     Klasse, ins Buch ohne Klasse. Aufsichten haben keins. */
  buchKlasse(t) {
    if (t.aufsicht || !Classes.data) return null;
    return this.klasseZu(t) || this.ohneKlasse();
  },

  kofferFuer(raum) {
    const m = String(raum || '').match(/([A-Z])(\d)\d\d/);
    return m ? this.KOFFER.filter(k => k.raum[0] === m[1] && k.raum[1] === m[2]) : [];
  },

  ipadAdresse(datum, kofferId = -1) {
    return this.IPAD_SEITE + kofferId + '?startDate=' + this.tagSchluessel(datum);
  },

  /* Links zum Buchen. Jeder Link öffnet die Buchungsseite des Schulmanagers mit
     dem Auftrag im Fensternamen (siehe ipad-buchen.js) – dort erledigt das
     Lesezeichen den Rest: „buchen“ nimmt den ersten freien Koffer auf dem
     Stockwerk des Raums, „H300“ diesen Koffer (belegt: den nächsten freien auf
     dem Stockwerk), „alle“ den ersten freien überhaupt. Vor dem Buchen nennt
     das Lesezeichen den Koffer und fragt nach. Ohne Stundennummer (Nachmittag ohne Raster) gibt es keinen
     Auftrag, dann öffnen die Links nur die Seite. */
  ipadLinks(t, kurz) {
    const koffer = this.kofferFuer(t.raum);
    const nr = parseInt(this.STUNDEN[this.uhr(t.beginn)], 10);
    const was = `${t.fach} ${this.klassenText(t)}, ${t.raum || ''}`.replace(/\|/g, '/');
    const auftrag = liste => nr ? ['stbuchen', this.tagSchluessel(t.beginn), nr, liste.map(k => k.id).join(','), was].join('|') : 'schulmanager';
    const link = (href, text, liste, titel, extra = '') =>
      `<a href="${this.esc(href)}" target="${this.esc(auftrag(liste))}" rel="noopener"${extra} title="${this.esc(titel)}">${this.esc(text)}</a>`;
    const hinweis = ' – im Schulmanager-Tab das Lesezeichen „iPads buchen“ anklicken';
    const rest = this.KOFFER.filter(k => !koffer.includes(k));
    return (koffer.length ? link(this.ipadAdresse(t.beginn), 'buchen', koffer,
      'Ersten freien Koffer auf dem Stockwerk buchen' + hinweis, ' class="plan-ipad-buchen"') + ' · ' : '') +
      // Ist der gewählte Koffer belegt, kommen erst die übrigen auf dem Stockwerk dran
      koffer.map(k => link(this.ipadAdresse(t.beginn, k.id), k.raum, [k, ...koffer.filter(x => x !== k)],
        `Koffer ${k.raum} (${k.ipads} iPads) am ${this.tagName(t.beginn)} buchen${hinweis}`)).join(' ') + ' ' +
      link(this.ipadAdresse(t.beginn), koffer.length ? (kurz ? 'alle' : 'alle Koffer') : 'iPads buchen', [...koffer, ...rest],
        'Ersten freien Koffer im ganzen Haus buchen' + hinweis) +
      // Nur die Seite, ohne Auftrag – zum Buchen von Hand
      ` · <a href="${this.esc(this.ipadAdresse(t.beginn))}" target="schulmanager" rel="noopener" class="plan-ipad-hand"
        title="Nur die Buchungsseite für ${this.esc(this.tagName(t.beginn))} öffnen – selbst buchen, ohne Lesezeichen">von Hand</a>`;
  },

  /* Klassenbuch im Schulmanager: Jede Stunde hat dort eine eigene Seite; die
     lessonId ist die Platznummer aus dem Abo. Der Knopf legt das Thema in die
     Zwischenablage und öffnet die Seite – dort nur noch ins Feld
     „Unterrichtsinhalte“ klicken und einfügen. Die Anwesenheit bleibt Handarbeit. */
  KLASSENBUCH: 'https://login.schulmanager-online.de/#/modules/classbook/enter/my/lesson/',

  klassenbuchKnopf(t, cls, kurz) {
    if (!t.platz || t.entfaellt || t.aufsicht || this.tagSchluessel(t.beginn) > this.tagSchluessel(new Date())) return '';
    const key = this.buchSchluessel(t);
    const themen = cls ? this.nummeriert(cls, key, this.themenDerStunde(cls, t).themen) : [];
    const text = themen.map(x => x.wort).join(' · ');
    const url = this.KLASSENBUCH + this.tagSchluessel(t.beginn) + '?lessonId=' + t.platz;
    return `<button type="button" class="small plan-kb" data-klassenbuch="${this.esc(url)}" data-kopie="${this.esc(text)}"
      title="${this.esc(text ? `„${text}“ kopieren und die Stunde im Klassenbuch öffnen – dort ins Feld Unterrichtsinhalte klicken und Cmd+V` : 'Die Stunde im Klassenbuch öffnen')}">${Icons.raw('book')}${kurz ? '' : 'Klassenbuch'}</button>`;
  },

  /* Erst kopieren (solange dieses Fenster den Fokus hat), dann öffnen – ein
     Tab „klassenbuch“, der beim nächsten Mal wiederverwendet wird */
  klassenbuchOeffnen(knopf) {
    const text = knopf.dataset.kopie;
    const oeffnen = () => window.open(knopf.dataset.klassenbuch, 'klassenbuch');
    if (!text) { oeffnen(); return; }
    const fertig = ok => {
      const alt = knopf.innerHTML;
      knopf.innerHTML = Icons.raw('check') + (ok ? 'kopiert' : 'Kopieren ging nicht');
      setTimeout(() => { knopf.innerHTML = alt; }, 2000);
      oeffnen();
    };
    navigator.clipboard.writeText(text).then(() => fertig(true), () => fertig(Band.kopierenAlt(text)));
  },

  klasseFinden(id) {
    return id === '-' ? this.ohneKlasse() : Classes.data.classes.find(c => c.id === id) || null;
  },

  klasseOeffnen(id) {
    const cls = Classes.data.classes.find(c => c.id === id);
    if (!cls) return;
    document.querySelector('.tab-btn[data-tab="klassen"]').click();
    if (Classes.yearFilter !== 'all' && cls.year && cls.year !== Classes.yearFilter) {
      Classes.yearFilter = cls.year;
    }
    Classes.selectClass(id);
  },

  /* ---------- Stundenbuch: Themen und Stand je Stunde ---------- */
  buchSchluessel(t) {
    return this.tagSchluessel(t.beginn) + ' ' + this.uhr(t.beginn);
  },

  themaAus(cls, id, w) {
    if (!id) return { topic: { id: null, name: w, eigen: true }, wort: w };
    const e = (cls.lessons || {})[id];
    const topic = Lessons.topicById(id, e || { t: w }) || { id, name: w || id };
    return { topic, wort: w || Lessons.schlagwort(topic) };
  },

  /* Welche Themen gehören zu dieser Stunde?
     - festgeschrieben im Stundenbuch: genau die
     - noch nicht vorbei: was gerade läuft; läuft nichts, als Vorschlag das
       nächste offene Thema der Klasse (oder nichts)
     - vorbei, aber noch nicht festgeschrieben: was an dem Tag lief (d1/d2) */
  themenDerStunde(cls, t, jetzt = new Date()) {
    if (!cls || t.entfaellt || typeof Lessons === 'undefined') return { themen: [], vorschlag: false };
    const key = this.buchSchluessel(t);
    const rec = (cls.stundenbuch || {})[key];
    if (rec && rec.th) return { themen: rec.th.map(x => this.themaAus(cls, x.id, x.w)), vorschlag: false, manuell: !!rec.m };
    if (t.ende > jetzt) {
      const k = this.kette(cls)[key];
      return k ? { themen: k.themen, vorschlag: k.art !== 'laeuft' } : { themen: [], vorschlag: false };
    }
    const tag = this.tagSchluessel(t.beginn);
    const ids = Object.entries(Lessons.lessonsOf(cls)).filter(([, e]) => e && e.d1 && e.d1 <= tag &&
      (e.s === 'progress' || (e.s === 'done' && e.d2 && e.d2 >= tag))).map(([id]) => id);
    return { themen: ids.map(id => this.themaAus(cls, id)), vorschlag: false };
  },

  /* Zwischenspeicher für einen Zeichendurchgang – Termine, Stunden je Klasse
     und die Themenkette werden sonst für jede Zelle neu berechnet */
  cache() {
    if (!this._cache) this._cache = { kette: {}, stunden: {}, nummern: {} };
    return this._cache;
  },

  /* Die wievielte Stunde zu einem Thema ist das in dieser Klasse? „Rhythmus
     Praxis I“ beim ersten Mal, „II“ beim zweiten … – so sieht man gleich, ob
     ein Thema neu anfängt oder weiterläuft. Gezählt werden alle Stunden der
     Klasse im Stundenbuch, im Abo und in der Vorschau; Entfall zählt nicht. */
  nummern(cls) {
    const c = this.cache();
    if (cls.ohne) return {};
    if (c.nummern[cls.id]) return c.nummern[cls.id];
    const zaehler = {}, erg = {};
    for (const t of this.klassenStunden(cls)) {
      const key = this.buchSchluessel(t);
      erg[key] = {};
      for (const { topic } of this.themenDerStunde(cls, t).themen) {
        if (!topic.id) continue;
        zaehler[topic.id] = (zaehler[topic.id] || 0) + 1;
        erg[key][topic.id] = zaehler[topic.id];
      }
    }
    return (c.nummern[cls.id] = erg);
  },

  roemisch(n) {
    const teile = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let text = '';
    for (const [wert, zeichen] of teile) while (n >= wert) { text += zeichen; n -= wert; }
    return text;
  },

  /* Themen einer Stunde mit Folgenummer im Schlagwort */
  nummeriert(cls, key, themen) {
    const nr = this.nummern(cls)[key] || {};
    return themen.map(x => x.topic.id && nr[x.topic.id] ? { ...x, wort: x.wort + ' ' + this.roemisch(nr[x.topic.id]) } : x);
  },

  klassenStunden(cls) {
    const c = this.cache();
    if (!c.stunden[cls.id]) {
      c.stunden[cls.id] = this.alleTermine().filter(t => !t.entfaellt && !t.aufsicht && this.buchKlasse(t) === cls);
    }
    return c.stunden[cls.id];
  },

  /* Themen der kommenden Stunden einer Klasse, der Reihe nach:
     - von Hand gesetzt: genau das; ein gewähltes Thema wird danach fortgeführt
     - sonst Fortführung der vorigen Stunde (ihr Thema, solange es nicht fertig ist),
       sonst das laufende Thema, sonst das nächste offene als Vorschlag.
     Entfallene Stunden zählen nicht – das Thema rückt in die nächste. */
  kette(cls) {
    const c = this.cache();
    if (cls.ohne) return {};
    if (c.kette[cls.id]) return c.kette[cls.id];
    const jetzt = new Date();
    const stunden = this.klassenStunden(cls);
    const fertig = id => Lessons.stateOf(cls, id) === 'done';
    let carry = [], art = 'weiter';
    // Fortführung: die letzte vergangene Stunde mit einem Thema der Klasse
    for (const t of stunden.filter(x => x.ende <= jetzt).reverse()) {
      const ids = this.themenDerStunde(cls, t, jetzt).themen.map(x => x.topic.id).filter(Boolean);
      if (!ids.length) continue;
      carry = ids.filter(id => !fertig(id));
      break;
    }
    if (!carry.length) {
      carry = Object.entries(Lessons.lessonsOf(cls)).filter(([, e]) => e && e.s === 'progress').map(([id]) => id);
      art = 'laeuft';
    }
    if (!carry.length) {
      const offen = Lessons.assignedTopics(cls).find(tp => Lessons.stateOf(cls, tp.id) === 'open');
      carry = offen ? [offen.id] : [];
      art = 'vorschlag';
    }
    if (art === 'weiter' && carry.every(id => Lessons.stateOf(cls, id) === 'progress')) art = 'laeuft';
    const erg = {};
    for (const t of stunden) {
      if (t.ende <= jetzt) continue;
      const key = this.buchSchluessel(t);
      const rec = (cls.stundenbuch || {})[key];
      if (rec && rec.m && rec.th) {
        const ids = rec.th.map(x => x.id).filter(Boolean);
        if (ids.length) {
          carry = ids;
          art = ids.every(id => Lessons.stateOf(cls, id) === 'progress') ? 'laeuft' : 'weiter';
        }
        continue;
      }
      // Ein Thema, das erst ab einem späteren Tag läuft (übernommen für eine
      // kommende Stunde), gilt noch nicht für die Stunden davor
      const tag = this.tagSchluessel(t.beginn);
      const gilt = carry.filter(id => { const e = Lessons.lessonsOf(cls)[id]; return !e || !e.d1 || e.d1 <= tag || e.s !== 'progress'; });
      erg[key] = { themen: gilt.map(id => this.themaAus(cls, id)), art };
    }
    return (c.kette[cls.id] = erg);
  },

  /* Vorschlag annehmen: die Themen auf „Läuft“, wie im Reiter Stunden. Liegt
     die Stunde in der Zukunft, beginnt das Thema erst an ihrem Tag – sonst
     bekämen heute schon vorbeigegangene Stunden es nachträglich. */
  uebernehmen(klasseId, key, ids) {
    const cls = this.klasseFinden(klasseId);
    if (!cls || cls.ohne) return;
    const tag = key.split(' ')[0];
    for (const id of ids.split(',')) {
      if (Lessons.stateOf(cls, id) === 'progress') continue;
      Lessons.setState(cls, id, 'progress');
      const e = Lessons.lessonsOf(cls)[id];
      if (e && tag > e.d1) e.d1 = tag;
    }
    Classes.persist();
    this.render();
  },

  /* Von Hand Geplantes einer entfallenen Stunde auf die nächste Stunde der
     Klasse legen, die noch nichts Eigenes hat */
  verschieben(klasseId, key) {
    const cls = this.klasseFinden(klasseId);
    const buch = cls && cls.stundenbuch;
    const rec = buch && buch[key];
    if (!rec) return;
    this._cache = null;
    const ziel = this.klassenStunden(cls).find(t => {
      const k = this.buchSchluessel(t);
      const r = buch[k];
      if (cls.ohne && rec.k && this.klassenText(t) !== rec.k) return false;
      return k > key && t.ende > new Date() && !(r && (r.m || r.s || r.i || r.p));
    });
    if (!ziel) { alert('Keine freie Stunde dieser Klasse mehr im Plan.'); return; }
    const k = this.buchSchluessel(ziel);
    const neu = buch[k] || (buch[k] = {});
    for (const feld of ['th', 'm', 's', 'i', 'p']) if (rec[feld] !== undefined) { neu[feld] = rec[feld]; delete rec[feld]; }
    if (!Object.keys(rec).length) delete buch[key];
    Classes.persist();
    this.render();
  },

  /* ---------- Regelwoche und Vorschau ---------- */
  vorlageMerken() {
    if (!this.termine.length || !Classes.data) return;
    const letzter = this.termine[this.termine.length - 1].beginn;
    const grenze = this.tagSchluessel(new Date(letzter.getTime() - 7 * 864e5));
    const plaetze = {};
    for (const t of this.termine) {
      if (!t.platz || t.sonder) continue;
      const p = plaetze[t.platz] || (plaetze[t.platz] = {});
      Object.assign(p, { wt: t.beginn.getDay(), z: this.uhr(t.beginn), e: this.uhr(t.ende), f: t.fach,
        k: t.klassen.join(','), a: t.aufsicht ? 1 : 0, o: t.ort || '', zuletzt: this.tagSchluessel(t.beginn) });
      if (!t.entfaellt && t.raum) p.r = t.raum;
    }
    // Plätze, die in der letzten Abo-Woche nicht mehr vorkommen, sind aus dem Plan
    for (const [id, p] of Object.entries(plaetze)) {
      if (p.zuletzt < grenze) { delete plaetze[id]; continue; }
      delete p.zuletzt;
      if (!p.a) delete p.a;
      if (!p.o) delete p.o;
    }
    if (JSON.stringify(Classes.data.planVorlage || {}) !== JSON.stringify(plaetze)) {
      Classes.data.planVorlage = plaetze;
      Classes.persist();
    }
  },

  /* Die Regelwoche ab dem Tag nach dem Abo bis Schuljahresende */
  vorschauTermine() {
    const plaetze = (Classes.data && Classes.data.planVorlage) || {};
    if (!this.termine.length || !Object.keys(plaetze).length) return [];
    const frei = Classes.data.planFrei || {};
    const d = new Date(this.termine[this.termine.length - 1].beginn);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    const ende = new Date(parseInt(Classes.currentSchoolYear(), 10) + 1, 6, 31);
    const liste = [];
    for (; d <= ende; d.setDate(d.getDate() + 1)) {
      const wt = d.getDay();
      const tag = this.tagSchluessel(d);
      if (wt === 0 || wt === 6 || frei[tag]) continue;
      for (const [platz, p] of Object.entries(plaetze)) {
        if (p.wt !== wt) continue;
        liste.push({
          uid: '', art: p.a ? 'supervision' : 'regularLesson', platz,
          beginn: new Date(tag + 'T' + p.z), ende: new Date(tag + 'T' + p.e),
          titel: p.a ? 'Aufsicht: ' + (p.o || '') : '', fach: p.f, klassen: p.k ? p.k.split(',') : [],
          raum: p.r || '', entfaellt: false, aufsicht: !!p.a, sonder: false, ort: p.o || '', vorschau: true,
        });
      }
    }
    return liste.sort((a, b) => a.beginn - b.beginn);
  },

  /* Tage ohne Unterricht (Ferien, Feiertag) – nur für die Vorschau nötig */
  freiUmschalten(tage) {
    const frei = Classes.data.planFrei || (Classes.data.planFrei = {});
    const alleFrei = tage.every(t => frei[t]);
    for (const t of tage) { if (alleFrei) delete frei[t]; else frei[t] = 1; }
    Classes.persist();
    this.render();
  },

  letzterAboTag() {
    return this.termine.length ? this.tagSchluessel(this.termine[this.termine.length - 1].beginn) : '';
  },

  /* Vergangene Stunden ins Stundenbuch schreiben. Läuft nach jedem Holen und
     Zeichnen; was sich nicht geändert hat, wird nicht gespeichert. Gibt es zur
     selben Zeit Entfall und Ersatzstunde derselben Klasse, zählt die Ersatzstunde. */
  buchFuehren() {
    if (!Classes.data || typeof Lessons === 'undefined') return;
    const jetzt = new Date(), heute = this.tagSchluessel(jetzt);
    let geaendert = false;
    const jeStunde = new Map();
    for (const t of this.termine) {
      if (t.aufsicht || t.ende > jetzt) continue;
      const cls = this.buchKlasse(t);
      if (!cls) continue;
      const id = cls.id + '|' + this.buchSchluessel(t);
      const vorher = jeStunde.get(id);
      if (!vorher || (vorher.t.entfaellt && !t.entfaellt)) jeStunde.set(id, { t, cls });
    }
    for (const { t, cls } of jeStunde.values()) {
      const buch = cls.stundenbuch || (cls.stundenbuch = {});
      const key = this.buchSchluessel(t);
      const rec = buch[key] || (buch[key] = {});
      const soll = { e: this.uhr(t.ende), f: t.fach, k: this.klassenText(t), r: t.raum, x: t.entfaellt ? 1 : 0 };
      for (const [feld, wert] of Object.entries(soll)) {
        if (wert && rec[feld] !== wert) { rec[feld] = wert; geaendert = true; }
        if (!wert && rec[feld] !== undefined) { delete rec[feld]; geaendert = true; }
      }
      if (!t.entfaellt && !rec.th && this.tagSchluessel(t.beginn) < heute) {
        rec.th = this.themenDerStunde(cls, t, jetzt).themen.map(x => ({ id: x.topic.id, w: x.wort }));
        geaendert = true;
      }
    }
    // Stand aus der früheren Fassung (je Thema statt je Stunde): zur letzten
    // begonnenen Stunde der Klasse legen, dort wurde er eingetragen
    for (const cls of Classes.data.classes) {
      for (const e of Object.values(cls.lessons || {})) {
        if (!e || !e.stand) continue;
        const letzte = this.termine.filter(t => !t.entfaellt && !t.aufsicht && t.beginn <= jetzt &&
          this.klasseZu(t) === cls).pop();
        if (!letzte) continue;
        const buch = cls.stundenbuch || (cls.stundenbuch = {});
        const rec = buch[this.buchSchluessel(letzte)] || (buch[this.buchSchluessel(letzte)] = {});
        if (!rec.s) rec.s = e.stand;
        delete e.stand;
        geaendert = true;
      }
    }
    if (geaendert) Classes.persist();
  },

  /* Der zuletzt notierte Stand vor dieser Stunde – als Hinweis, wo es
     weitergeht. Nur wenn jene Stunde dasselbe Thema hatte; nach einem
     Themenwechsel führte der alte Stand in die Irre. */
  letzterStand(cls, key, themen) {
    const ids = new Set(themen.map(x => x.topic.id).filter(Boolean));
    if (!ids.size) return '';
    const frueher = Object.entries(cls.stundenbuch || {})
      .filter(([k, r]) => k < key && r.s && r.e).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    if (!frueher.length) return '';
    const [k, r] = frueher[0];
    const [tag, zeit] = k.split(' ');
    const t = { beginn: new Date(tag + 'T' + zeit), ende: new Date(tag + 'T' + r.e), entfaellt: !!r.x };
    const damals = this.themenDerStunde(cls, t).themen;
    return damals.some(x => ids.has(x.topic.id)) ? r.s : '';
  },

  standAendern(klasseId, key) {
    const cls = this.klasseFinden(klasseId);
    if (!cls) return;
    const buch = cls.stundenbuch || (cls.stundenbuch = {});
    const rec = buch[key] || {};
    const [tag, zeit] = key.split(' ');
    const datum = new Date(tag + 'T' + zeit);
    const [tag0, zeit0] = key.split(' ');
    const zuletzt = this.letzterStand(cls, key, this.themenDerStunde(cls,
      { beginn: new Date(tag0 + 'T' + zeit0), ende: new Date(tag0 + 'T' + (rec.e || zeit0)) }).themen);
    const neu = prompt(`Stand in ${cls.name}, ${this.tagName(datum)} ${zeit}\n` +
      '(z. B. „bis Folie 15, AB S. 2 offen“)' + (zuletzt ? `\n\nZuletzt: ${zuletzt}` : ''), rec.s || '');
    if (neu === null) return;
    const text = neu.trim().slice(0, 200);
    if (text) rec.s = text; else delete rec.s;
    if (Object.keys(rec).length) buch[key] = rec; else delete buch[key];
    Classes.persist();
    this.render();
  },

  /* Stunde von Hand bearbeiten: Klasse (diese Stunde oder alle Wochen dieses
     Platzes), Thema – automatisch, ein Thema der Klasse, eigener Eintrag
     („Schulaufgabe – nur Aufsicht“) oder kein Thema – und Stand. Ein gewähltes
     Thema führen die folgenden Stunden fort. */
  themaBearbeiten(key) {
    this._cache = null;
    const t = this.alleTermine().find(x => !x.entfaellt && !x.aufsicht && this.buchSchluessel(x) === key);
    if (!t) return;
    const alteKlasse = this.klasseZu(t);
    const dlg = document.getElementById('plan-dialog');
    const wahlKlasse = document.getElementById('plan-dialog-klasse');
    const immer = document.getElementById('plan-dialog-immer');
    const wahlThema = document.getElementById('plan-dialog-wahl');
    const eigenZeile = document.getElementById('plan-dialog-eigen');
    const katalogZeile = document.getElementById('plan-dialog-katalog-zeile');
    const katalogFeld = document.getElementById('plan-dialog-katalog');
    const feld = document.getElementById('plan-dialog-thema');
    const standFeld = document.getElementById('plan-dialog-stand');
    const infoFeld = document.getElementById('plan-dialog-info');
    const ipadFeld = document.getElementById('plan-dialog-ipads');
    // Schon gebucht (laut letztem Abgleich mit dem Schulmanager)? Dann keine
    // Buchungslinks – sonst ließe sich für dieselbe Stunde ein zweiter Koffer buchen
    const gebucht = ((Classes.data.planIpads || {})[key] || []).map(id => (this.KOFFER.find(k => k.id === id) || { raum: id }).raum);
    document.getElementById('plan-dialog-ipad-links').innerHTML = gebucht.length
      ? `<span class="plan-dialog-gebucht">✓ Gebucht im Schulmanager: ${this.esc(gebucht.join(', '))}</span>`
      : 'Jetzt buchen: ' + this.ipadLinks(t) +
        '<br><span class="plan-dialog-ipad-hinweis">Das Häkchen ist nur ein Merker: Die Stunde zeigt dann die Buchungslinks als Erinnerung.</span>';
    const nr = this.STUNDEN[this.uhr(t.beginn)];
    document.getElementById('plan-dialog-titel').textContent =
      `${t.fach} ${this.klassenText(t)} · ${this.tagName(t.beginn)} · ${nr && nr !== 'Pause' ? nr + ' Stunde' : this.uhr(t.beginn)}` +
      (t.vorschau ? ' (Vorschau)' : '');

    const jahr = Classes.currentSchoolYear();
    const klassen = [...Classes.data.classes].sort((a, b) => (b.year === jahr) - (a.year === jahr));
    const abo = this.klassenText(t);
    wahlKlasse.innerHTML = `<option value="">${abo ? '– keine, ' + this.esc(abo) + ' aus dem Abo –' : '– keine Klasse –'}</option>` + klassen.map(c =>
      `<option value="${this.esc(c.id)}">${this.esc(c.name)}${c.year && c.year !== jahr ? ' (' + this.esc(c.year) + ')' : ''}</option>`).join('');
    wahlKlasse.value = alteKlasse ? alteKlasse.id : '';
    immer.checked = false;
    immer.closest('label').hidden = !t.platz;

    /* Präsentation, AB und Ordner zum Thema, das gerade gewählt ist */
    const material = document.getElementById('plan-dialog-material');
    const statusZeile = document.getElementById('plan-dialog-status');
    let autoThemen = [], statusVorher = '';
    const materialZeigen = () => {
      const cls = this.klasseFinden(wahlKlasse.value || '-');
      const wahl = wahlThema.value;
      const themen = wahl === 'auto' ? autoThemen
        : wahl.startsWith('id:') ? [this.themaAus(cls, wahl.slice(3))] : [];
      // Stand des Themas in der Klasse: offen / läuft / fertig – wie im Reiter Stunden.
      // Wer ein offenes Thema für eine Stunde wählt, fängt es an: dann „läuft“ vorausgewählt.
      const ids = themen.map(x => x.topic.id).filter(id => id && !cls.ohne && Lessons.lessonsOf(cls)[id]);
      statusZeile.hidden = !ids.length && wahl !== 'katalog';
      statusVorher = ids.length ? Lessons.stateOf(cls, ids[0]) : 'open';
      const vor = wahl === 'katalog' || (wahl.startsWith('id:') && statusVorher === 'open') ? 'progress' : statusVorher;
      statusZeile.querySelectorAll('input').forEach(i => { i.checked = i.value === vor; });
      const knopf = (icon, text, pfad, titel) =>
        `<button type="button" class="small" data-oeffnen="${this.esc(pfad)}" title="${this.esc(titel + ': ' + pfad)}">${Icons.raw(icon)}${this.esc(text)}</button>`;
      const mehrere = themen.length > 1;
      material.innerHTML = themen.flatMap(({ topic, wort }) => [
        topic.haupt ? knopf('play', (/\.pdf$/i.test(topic.haupt) ? 'PDF' : 'Präsentation') + (mehrere ? ' ' + wort : ''), topic.haupt, 'Starten') : '',
        topic.ab ? knopf('file', 'Arbeitsblatt', topic.ab, 'Öffnen') : '',
        topic.ordner ? knopf('folder', 'Ordner', topic.ordner, 'Ordner öffnen') : '',
      ]).join('') + this.klassenbuchKnopf(t, cls.ohne ? null : cls);
      material.hidden = !material.innerHTML;
    };
    material.onclick = e => {
      const kb = e.target.closest('[data-klassenbuch]');
      if (kb) { this.klassenbuchOeffnen(kb); return; }
      const b = e.target.closest('[data-oeffnen]');
      if (b) Lessons.oeffnen(b.dataset.oeffnen);
    };
    const zeigeEigen = () => {
      eigenZeile.hidden = wahlThema.value !== 'eigen';
      katalogZeile.hidden = wahlThema.value !== 'katalog';
      materialZeigen();
    };
    wahlThema.onchange = () => {
      zeigeEigen();
      if (!eigenZeile.hidden) feld.focus();
      if (!katalogZeile.hidden) katalogFeld.focus();
    };

    // Themenauswahl der gerade gewählten Klasse
    const fuellen = () => {
      const cls = this.klasseFinden(wahlKlasse.value || '-');
      const buch = cls.stundenbuch || {};
      const rec = buch[key] || {};
      // Was ohne eigenen Eintrag gälte – dafür den Eintrag kurz beiseitelegen
      let auto = '';
      autoThemen = [];
      if (!cls.ohne) {
        const merk = buch[key];
        if (merk && merk.m) { const ohne = { ...merk }; delete ohne.th; delete ohne.m; buch[key] = ohne; }
        this._cache = null;
        autoThemen = this.themenDerStunde(cls, t).themen;
        auto = autoThemen.map(x => x.wort).join(' · ');
        if (merk) buch[key] = merk;
        this._cache = null;
      }
      const stufe = { progress: 'läuft', open: 'offen', done: 'fertig' };
      const themen = cls.ohne ? [] : Lessons.assignedTopics(cls);
      wahlThema.innerHTML =
        `<option value="auto">Automatisch${auto ? ': ' + this.esc(auto) : ' (nichts)'}</option>` +
        (themen.length ? `<optgroup label="Themen der Klasse">${themen.map(tp =>
          `<option value="id:${this.esc(tp.id)}">${this.esc(Lessons.schlagwort(tp))} · ${stufe[Lessons.stateOf(cls, tp.id)] || ''}</option>`).join('')}</optgroup>` : '') +
        '<option value="katalog">Aus dem Stundenkatalog …</option>' +
        '<option value="eigen">Eigener Eintrag …</option><option value="kein">Kein Thema</option>';
      // Vorschläge wie unter Klassen → Stunden: erst die eigene Jahrgangsstufe
      const passt = tp => cls && cls.grade && tp.grades && tp.grades.includes(cls.grade);
      const gesehen = new Set();
      document.getElementById('plan-dialog-katalog-liste').innerHTML = Lessons.allTopics()
        .sort((a, b) => passt(b) - passt(a))
        .filter(tp => !gesehen.has(tp.name.toLowerCase()) && gesehen.add(tp.name.toLowerCase()))
        .map(tp => `<option value="${this.esc(tp.name)}"${tp.grades && tp.grades.length ? ` label="Kl. ${this.esc(Lessons.gradeLabel(tp.grades))}"` : ''}>`).join('');
      katalogFeld.value = '';
      feld.value = '';
      if (!rec.m || !rec.th) wahlThema.value = 'auto';
      else if (!rec.th.length) wahlThema.value = 'kein';
      else if (rec.th.length === 1 && rec.th[0].id && themen.some(tp => tp.id === rec.th[0].id)) wahlThema.value = 'id:' + rec.th[0].id;
      else { wahlThema.value = 'eigen'; feld.value = rec.th.map(x => x.w).join(' · '); }
      standFeld.value = rec.s || '';
      infoFeld.value = rec.i || '';
      // Gebucht: kein Merker nötig – das Häkchen verschwindet
      ipadFeld.checked = !!rec.p;
      ipadFeld.closest('label').hidden = gebucht.length > 0;
      zeigeEigen();
    };
    wahlKlasse.onchange = fuellen;
    fuellen();

    // Gespeichert wird beim Absenden (Knopf oder Enter) – das kommt sofort,
    // das close-Ereignis des Fensters nicht in jedem Browser verlässlich
    dlg.querySelector('form').onsubmit = ev => {
      if (!ev.submitter || ev.submitter.value === 'speichern') speichern();
    };
    const speichern = () => {
      const neueId = wahlKlasse.value;
      const zuordnung = Classes.data.planKlassen || (Classes.data.planKlassen = {});
      // Klasse: nur merken, wenn sie von der erkannten abweicht
      if (neueId !== (alteKlasse ? alteKlasse.id : '') || immer.checked) {
        if (immer.checked && t.platz) { zuordnung['p:' + t.platz] = neueId; delete zuordnung[key]; }
        else zuordnung[key] = neueId;
      }
      const cls = this.klasseFinden(neueId || '-');
      const vorher = alteKlasse || this.ohneKlasse();
      // Was bisher zu dieser Stunde notiert war, zieht mit um (ohne Thema)
      let rec = (cls.stundenbuch || {})[key] || {};
      if (vorher !== cls && vorher.stundenbuch && vorher.stundenbuch[key]) {
        const alt = vorher.stundenbuch[key];
        delete vorher.stundenbuch[key];
        rec = { ...alt, ...rec };
        delete rec.th;
        delete rec.m;
      }
      {
        const buch = cls.stundenbuch || (cls.stundenbuch = {});
        const thema = wahlThema.value;
        const text = feld.value.trim().slice(0, 120);
        if (thema === 'auto' || (thema === 'eigen' && !text)) { delete rec.th; delete rec.m; }
        else if (thema === 'kein') { rec.th = []; rec.m = 1; }
        else if (thema === 'katalog') {
          // Wie „Zur Klasse hinzufügen“: gleicher Titel in mehreren Ordnern –
          // den für die Jahrgangsstufe; ohne Treffer bleibt es ein eigener Eintrag
          const name = katalogFeld.value.trim();
          const passend = Lessons.allTopics().filter(tp => tp.name.toLowerCase() === name.toLowerCase());
          const tp = passend.find(x => cls.grade && x.grades && x.grades.includes(cls.grade)) || passend[0];
          if (tp && !cls.ohne) {
            const l = Lessons.lessonsOf(cls);
            if (!l[tp.id]) {
              l[tp.id] = { s: 'open', added: Date.now() };
              if (tp.ordner) l[tp.id].t = tp.name;
            }
            rec.th = [{ id: tp.id, w: Lessons.schlagwort(tp) }];
          } else if (tp) {
            rec.th = [{ id: tp.id, w: Lessons.schlagwort(tp) }];   // ohne Klasse: nur für diese Stunde
          } else if (name) {
            rec.th = [{ w: name.slice(0, 120) }];
          }
          if (tp || name) rec.m = 1;
        }
        else if (thema.startsWith('id:')) {
          const tp = Lessons.topicById(thema.slice(3), (cls.lessons || {})[thema.slice(3)]);
          rec.th = [{ id: thema.slice(3), w: tp ? Lessons.schlagwort(tp) : thema.slice(3) }];
          rec.m = 1;
        } else {
          // Getippte Schlagwörter, die zu einem Thema der Klasse passen, behalten
          // dessen Material-Knöpfe; alles andere ist ein eigener Eintrag
          const zuId = new Map((cls.ohne ? [] : Lessons.assignedTopics(cls)).map(tp => [Lessons.schlagwort(tp).toLowerCase(), tp.id]));
          rec.th = text.split(/\s+·\s+/).filter(Boolean).map(w => {
            const id = zuId.get(w.toLowerCase());
            return id ? { id, w } : { w };
          });
          rec.m = 1;
        }
        // Stand der gewählten Themen in der Klasse (offen / läuft / fertig). Liegt die
        // Stunde in der Zukunft, beginnt bzw. endet das Thema erst an ihrem Tag.
        const neuStatus = (statusZeile.querySelector('input:checked') || {}).value;
        const statusIds = statusZeile.hidden || cls.ohne ? [] : (rec.th && rec.m ? rec.th : autoThemen.map(x => ({ id: x.topic.id })))
          .map(x => x.id).filter(id => id && Lessons.lessonsOf(cls)[id]);
        const tagDerStunde = key.split(' ')[0];
        for (const id of neuStatus ? statusIds : []) {
          if (Lessons.stateOf(cls, id) === neuStatus) continue;
          Lessons.setState(cls, id, neuStatus);
          const e = Lessons.lessonsOf(cls)[id];
          if (neuStatus === 'progress' && e && tagDerStunde > e.d1) e.d1 = tagDerStunde;
          if (neuStatus === 'done' && e && tagDerStunde > e.d2) e.d2 = tagDerStunde;
        }
        const stand = standFeld.value.trim().slice(0, 200);
        if (stand) rec.s = stand; else delete rec.s;
        const info = infoFeld.value.trim().slice(0, 200);
        if (info) rec.i = info; else delete rec.i;
        if (ipadFeld.checked) rec.p = 1; else delete rec.p;
        if (Object.keys(rec).length) buch[key] = rec; else delete buch[key];
      }
      Classes.persist();
      this.buchFuehren();
      this.render();
      this.klassenbuchZeigen();
    };
    dlg.showModal();
    wahlThema.focus();
  },

  /* Stunden aus dem Stundenbuch, die das Abo nicht mehr liefert – damit auch
     ältere Wochen im Plan stehen */
  buchTermine() {
    if (!Classes.data) return [];
    const erster = this.termine.length ? this.tagSchluessel(this.termine[0].beginn) : '9999';
    const liste = [];
    for (const cls of [...Classes.data.classes, this.ohneKlasse()]) {
      for (const [key, rec] of Object.entries(cls.stundenbuch || {})) {
        const [tag, zeit] = key.split(' ');
        if (tag >= erster || !rec.e) continue;   // nur Vergangenes; Geplantes ohne Zeit hat kein e
        liste.push({
          beginn: new Date(tag + 'T' + zeit), ende: new Date(tag + 'T' + rec.e),
          fach: rec.f || '', klassen: rec.k ? rec.k.split(' · ') : [], raum: rec.r || '',
          entfaellt: !!rec.x, aufsicht: false, sonder: false, platz: '', klasseId: cls.ohne ? undefined : cls.id,
          ausBuchOhne: !!cls.ohne,
        });
      }
    }
    return liste.sort((a, b) => a.beginn - b.beginn);
  },

  alleTermine() {
    const c = this.cache();
    if (!c.alle) c.alle = this.buchTermine().concat(this.termine, this.vorschauTermine());
    return c.alle;
  },

  /* Themen einer Stunde: Schlagwort (Schalter „Themen“), dazu der eigene
     Stand dieser Stunde und die Knöpfe zu Material und Zwischenablage (Schalter
     „Stand“). Alle Knöpfe nur in der Tagesansicht; im Wochenraster ist nur
     Platz für den Start der Präsentation (mitKnoepfen = 'start'). */
  themenHtml(t, cls, mitKnoepfen) {
    const zeigeWort = this.themenSchalter.checked, zeigeStand = this.standSchalter.checked;
    if (t.aufsicht || (!zeigeWort && !zeigeStand)) return '';
    const key = this.buchSchluessel(t);
    if (t.entfaellt) {
      // Entfallen, aber schon von Hand geplant: zeigen und verschieben lassen
      const rec = cls && (cls.stundenbuch || {})[key];
      if (!rec || !(rec.m || rec.s || rec.i || rec.p)) return '';
      const geplant = [rec.m && rec.th ? (rec.th.map(x => x.w).join(' · ') || 'kein Thema') : '', rec.s, rec.i,
        rec.p ? 'iPads (Buchung im Schulmanager prüfen!)' : ''].filter(Boolean).join(' – ');
      return `<span class="plan-thema"><span class="plan-geplant" title="War für diese Stunde geplant">geplant: ${this.esc(geplant)}</span>` +
        `<button type="button" class="small" data-verschieben="${this.esc(cls.id + '|' + key)}" title="Auf die nächste Stunde der Klasse legen, die noch nichts Eigenes hat">→ nächste Stunde</button></span>`;
    }
    if (!cls) {
      return '';
    }
    const rec = (cls.stundenbuch || {})[key] || {};
    const roh = this.themenDerStunde(cls, t);
    const themen = this.nummeriert(cls, key, roh.themen), vorschlag = roh.vorschlag;
    const worte = themen.map(x => x.wort).join(' · ');
    const ziel = this.esc(key);
    const teile = [];
    if (themen.length && (zeigeWort || zeigeStand)) {
      // festgelegt (pink) · läuft automatisch weiter (normal) · nur Vorschlag (grau)
      const art = vorschlag ? ' vorschlag' : rec.m ? ' manuell' : ' laeuft';
      const titel = vorschlag ? 'Vorschlag: Fortführung der vorigen Stunde bzw. nächstes offenes Thema – klicken zum Ändern'
        : rec.m ? 'Von Hand gesetzt – klicken zum Ändern' : 'Thema dieser Stunde – klicken zum Ändern';
      teile.push(`<button type="button" class="plan-thema-wort${art}" data-thema="${ziel}" title="${titel}">${vorschlag ? 'Vorschlag: ' : ''}${this.esc(worte)}</button>`);
      // Vorschlag mit einem Klick annehmen: Thema läuft ab dieser Stunde
      const ids = themen.map(x => x.topic.id).filter(Boolean);
      if (vorschlag && ids.length && !cls.ohne) {
        teile.push(`<button type="button" class="plan-uebernehmen" data-uebernehmen="${this.esc(cls.id + '|' + key + '|' + ids.join(','))}" title="Vorschlag übernehmen – das Thema steht danach in der Klasse auf „Läuft“">${Icons.raw('check')}übernehmen</button>`);
      }
    } else if (zeigeStand && rec.m) {
      teile.push(`<button type="button" class="plan-thema-wort manuell" data-thema="${ziel}" title="Von Hand: kein Thema – klicken zum Ändern">kein Thema</button>`);
    } else if (zeigeStand) {
      teile.push(`<button type="button" class="plan-thema-plus" data-thema="${ziel}" title="Thema für diese Stunde eintragen">${Icons.raw('plus')}Thema</button>`);
    }
    if (!teile.length && !rec.s) return '';
    if (zeigeStand && (themen.length || rec.s)) {
      const stelle = this.esc(cls.id + '|' + key);
      const zuletzt = rec.s ? '' : this.letzterStand(cls, key, themen);
      teile.push(rec.s
        ? `<button type="button" class="plan-stand-text" data-stand="${stelle}" title="Stand dieser Stunde ändern">${Icons.raw('pen')}${this.esc(rec.s)}</button>`
        : `<button type="button" class="plan-stand-text leer" data-stand="${stelle}" title="Notieren, wie weit du in dieser Stunde gekommen bist">${Icons.raw('pen')}Stand notieren${zuletzt ? ` <span class="plan-zuletzt">· zuletzt ${this.esc(zuletzt)}</span>` : ''}</button>`);
    }
    if (mitKnoepfen && zeigeStand && themen.length) {
      const knopf = (icon, text, attr, titel) =>
        `<button type="button" class="small" ${attr} title="${this.esc(titel)}">${Icons.raw(icon)}${this.esc(text)}</button>`;
      const oeffnen = (icon, text, pfad, titel) =>
        knopf(icon, text, `data-oeffnen="${this.esc(pfad)}"`, titel + ': ' + pfad);
      const mehrere = themen.length > 1;
      let knoepfe;
      if (mitKnoepfen === 'start') {
        knoepfe = themen.filter(x => x.topic.haupt)
          .map(x => oeffnen('play', mehrere ? x.wort : 'Start', x.topic.haupt, 'Präsentation starten'));
      } else {
        const alles = rec.s ? `${worte} – ${rec.s}` : worte;
        knoepfe = themen.flatMap(({ topic, wort }) => [
          topic.haupt ? oeffnen('play', (/\.pdf$/i.test(topic.haupt) ? 'PDF' : 'Präsentation') + (mehrere ? ' ' + wort : ''), topic.haupt, 'Starten') : '',
          topic.ab ? oeffnen('file', 'AB', topic.ab, 'Öffnen') : '',
          topic.ordner ? oeffnen('folder', 'Ordner', topic.ordner, 'Ordner öffnen') : '',
        ]).concat([
          knopf('clipboard', 'Thema', `data-kopieren="${this.esc(worte)}"`, 'Schlagwort kopieren: ' + worte),
          rec.s ? knopf('clipboard', 'Alles', `data-kopieren="${this.esc(alles)}"`, 'Thema und Stand kopieren: ' + alles) : '',
        ]);
      }
      if (knoepfe.join('')) teile.push(`<span class="plan-material">${knoepfe.join('')}</span>`);
    }
    return teile.length ? `<span class="plan-thema">${teile.join('')}</span>` : '';
  },

  /* ---------- Darstellung ---------- */
  esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  uhr(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  },
  tagSchluessel(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  },
  TAGE: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  /* Stundenraster der Schule nach Anfangszeit */
  STUNDEN: { '08:00': '1.', '08:45': '2.', '09:30': '3.', '10:15': 'Pause', '10:45': '4.', '11:30': '5.', '12:15': '6.', '13:45': '7.', '14:30': '8.' },
  stunde(d) {
    const s = this.STUNDEN[this.uhr(d)];
    return s ? `<span class="plan-nr${s === 'Pause' ? ' pause' : ''}">${s}</span>` : '<span class="plan-nr"></span>';
  },
  tagName(d) {
    return this.TAGE[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
  },
  montag(d) {
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return m;
  },

  klassenText(t) {
    return t.klassen.map(k => {
      const s = this.klassenSchluessel(k);
      return s || k;
    }).join(' · ');
  },

  /* Ein Termin als Baustein – in der Tagesliste wie im Wochenraster */
  baustein(t, jetzt, mitKnoepfen) {
    const cls = this.klasseZu(t);
    const getauscht = this.raumGetauscht(t);
    const klassen = this.klassenText(t);
    const wer = t.aufsicht ? `Aufsicht${t.ort ? ` <span class="plan-ort">${this.esc(t.ort)}</span>` : ''}`
      : `${this.esc(t.fach)}${klassen ? ' ' + (cls
        ? `<button type="button" class="plan-klasse" data-klasse="${this.esc(cls.id)}" title="Zur Klasse „${this.esc(cls.name)}“">${this.esc(klassen)}</button>`
        : `<span title="Keine passende Klasse im School-Tool gefunden">${this.esc(klassen)}</span>`) : ''}`;
    const raum = t.aufsicht ? '' : getauscht
      ? `<span class="plan-raum getauscht" title="Sonst ${this.esc(getauscht)}">${this.esc(t.raum)}</span>`
      : (t.raum ? `<span class="plan-raum">${this.esc(t.raum)}</span>` : '');
    const marken = [];
    if (t.entfaellt) marken.push('<span class="plan-marke entfall">entfällt</span>');
    if (t.sonder) marken.push('<span class="plan-marke sonder">Sonderstunde</span>');
    if (getauscht) marken.push('<span class="plan-marke raum">Raum geändert</span>');
    const buchCls = this.buchKlasse(t);
    marken.push(this.themenHtml(t, buchCls, mitKnoepfen));
    const kb = this.klassenbuchKnopf(t, buchCls, mitKnoepfen === 'start');
    if (kb) marken.push(`<span class="plan-kb-zeile">${kb}</span>`);
    const info = buchCls && !t.entfaellt && ((buchCls.stundenbuch || {})[this.buchSchluessel(t)] || {}).i;
    if (info) marken.push(`<span class="plan-info" title="Info zu dieser Stunde – klicken zum Ändern">${Icons.raw('alert')}${this.esc(info)}</span>`);
    // iPads: gebucht (aus dem Schulmanager abgeglichen) – oder nötig, aber noch nicht gebucht
    const gebucht = !t.aufsicht && ((Classes.data && Classes.data.planIpads) || {})[this.buchSchluessel(t)];
    const koffer = id => (this.KOFFER.find(k => k.id === id) || { raum: id }).raum;
    if (gebucht && gebucht.length) {
      marken.push(t.entfaellt
        ? `<span class="plan-ipads warnung" title="Die Stunde entfällt – Buchung im Schulmanager stornieren?">${Icons.raw('alert')}iPads gebucht (${gebucht.map(koffer).join(', ')}) – Stunde entfällt!</span>`
        : `<span class="plan-ipads gebucht" title="Im Schulmanager gebucht">${Icons.raw('check')}iPads gebucht: ${gebucht.map(koffer).join(', ')}</span>`);
    } else {
      const ipads = buchCls && !t.entfaellt && ((buchCls.stundenbuch || {})[this.buchSchluessel(t)] || {}).p;
      if (ipads) marken.push(`<span class="plan-ipads">${Icons.raw('grid')}iPads: ${this.ipadLinks(t, mitKnoepfen === 'start')}</span>`);
    }
    const klassenName = ['plan-termin',
      t.entfaellt && 'entfaellt', t.sonder && 'sonder', getauscht && 'getauscht', t.aufsicht && 'aufsicht',
      t.vorschau && 'vorschau', !t.entfaellt && !t.aufsicht && 'klickbar',
      jetzt && t.beginn <= jetzt && jetzt < t.ende && !t.entfaellt && 'laeuft'].filter(Boolean).join(' ');
    // Gruppe für das Hervorheben: dieselbe Klasse – ohne Klasse im School-Tool die aus dem Abo
    const gruppe = t.aufsicht ? '' : cls ? cls.id : klassen ? 'abo:' + klassen : '';
    const attr = (!t.entfaellt && !t.aufsicht ? ` data-stunde="${this.esc(this.buchSchluessel(t))}"` : '') +
      (gruppe ? ` data-gruppe="${this.esc(gruppe)}"` : '');
    return { klassenName, attr, wer, raum, marken: marken.join('') };
  },

  render() {
    if (!this.el) return;
    const inhalt = document.getElementById('plan-inhalt');
    const stand = document.getElementById('plan-stand');
    const abo = this.abo();
    document.getElementById('btn-plan-neu').disabled = !abo || this.laedt;
    this.el.classList.toggle('plan-woche', this.schalter.checked);

    stand.textContent = this.laedt ? 'Wird geholt …'
      : this.geholt ? 'Aktualisiert ' + this.uhr(new Date(this.geholt)) +
        (this.tagSchluessel(new Date(this.geholt)) !== this.tagSchluessel(new Date())
          ? ', ' + this.tagName(new Date(this.geholt)) : '') : '';
    const ipadStand = Classes.data && Classes.data.planIpadsStand;
    if (this.ipadMeldung || ipadStand) {
      stand.textContent += (stand.textContent ? ' · ' : '') + (this.ipadMeldung ||
        'iPads abgeglichen ' + new Date(ipadStand).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }));
    }
    stand.classList.toggle('fehler', !!this.fehler);
    if (this.fehler) stand.textContent = 'Nicht aktualisiert: ' + this.fehler +
      (this.geholt ? ' – gezeigt wird der Stand von ' + this.uhr(new Date(this.geholt)) : '');

    if (!abo) {
      inhalt.innerHTML = `<div class="empty-state">
        <p>Noch kein Stundenplan verbunden.</p>
        <p class="hint">Im Schulmanager unter Stundenplan die Adresse zum Abonnieren kopieren
          und hier über „Abo-Adresse“ eintragen. Vertretungen, Entfall und Raumtausch kommen dann von selbst.</p>
      </div>`;
      return;
    }
    if (!this.termine.length) {
      inhalt.innerHTML = `<p class="hint">${this.laedt ? 'Stundenplan wird geholt …' : 'Keine Termine im Abo.'}</p>`;
      return;
    }
    this.buchFuehren();
    this._cache = null;
    inhalt.innerHTML = this.schalter.checked ? this.wocheHtml() : this.heuteHtml();
  },

  /* Heute/Woche umschalten. Heute ohne Tag = der aktuelle Tag (Taste H);
     mit Tag = genau dieser Tag (Klick auf den Tag im Wochenkopf). Die Woche
     öffnet dort, wo der gezeigte Tag liegt. */
  ansicht(art, tag) {
    if (art === 'heute') {
      this.tagWahl = tag && tag !== this.tagSchluessel(new Date()) ? tag : null;
    } else {
      const basis = this.wochenBasis();
      this.wochenVersatz = this.tagWahl
        ? Math.round((this.montag(new Date(this.tagWahl + 'T12:00')) - basis) / (7 * 864e5)) : 0;
    }
    this.schalter.checked = art === 'woche';
    localStorage.setItem(this.ANSICHT_KEY, art);
    this.render();
  },

  wochenBasis() {
    const jetzt = new Date();
    // Am Wochenende gleich die kommende Woche zeigen
    return this.montag(new Date(jetzt.getTime() + ([0, 6].includes(jetzt.getDay()) ? 2 * 864e5 : 0)));
  },

  /* Tagesansicht: zum vorigen/nächsten Tag mit Stunden */
  tag(schritt) {
    const tage = [...new Set(this.alleTermine().map(t => this.tagSchluessel(t.beginn)))].sort();
    const jetzt = this.gezeigterTag || this.tagSchluessel(new Date());
    const ziel = schritt > 0 ? tage.find(d => d > jetzt) : tage.filter(d => d < jetzt).pop();
    if (!ziel) return;
    this.tagWahl = ziel === this.tagSchluessel(new Date()) ? null : ziel;
    this.render();
  },

  woche(schritt) {
    const g = this.wochenGrenzen || {};
    if (schritt < 0 && !g.zurueck) return;
    if (schritt > 0 && !g.vor) return;
    this.wochenVersatz += schritt;
    this.render();
  },

  /* ←/→ blättern Wochen bzw. Tage – auch im Vollbild. Ist man gerade oben
     mit den Pfeilen über die Reiter unterwegs (Markierung sichtbar), geht es
     dort weiter; ↓ holt die Pfeile in den Plan, Esc gibt sie zurück. */
  pfeilTaste(e) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.key)) return false;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
    if (!this.el || !this.el.classList.contains('active')) return false;
    const ziel = e.target;
    if (ziel && ziel.closest && ziel.closest('input, textarea, select, [contenteditable="true"]')) return false;
    const html = document.documentElement;
    if (html.classList.contains('locked')) return false;
    let voll = document.fullscreenElement || document.webkitFullscreenElement;
    if (voll === document.documentElement) voll = null;     // ganze Seite: wie ohne Vollbild
    if (voll && voll !== this.karte) return false;
    const obenUnterwegs = !voll && typeof Tasten !== 'undefined' && Tasten.ebene === 'oben' &&
      html.classList.contains('tasten-oben');
    if (e.key === 'ArrowDown') {
      if (!obenUnterwegs) return false;
      Tasten.setzen('unten', false);
    } else {
      if (obenUnterwegs) return false;
      const schritt = e.key === 'ArrowRight' ? 1 : -1;
      if (this.schalter.checked) this.woche(schritt); else this.tag(schritt);
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  },

  vollbild() {
    if ((document.fullscreenElement || document.webkitFullscreenElement) === this.karte) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    const rein = this.karte.requestFullscreen || this.karte.webkitRequestFullscreen;
    if (!rein) { alert('Dieser Browser kann den Vollbildmodus hier nicht anzeigen.'); return; }
    const p = rein.call(this.karte);
    if (p && p.catch) p.catch(err => alert('Vollbild nicht möglich: ' + err.message));
  },

  /* ---------- Klassenbuch: jede erfasste Stunde einer Klasse ----------
     Unter Klassen → Klassenbuch als Tabelle, dort auch zum Drucken bzw. als PDF. */
  buchZeilen(cls) {
    this.buchFuehren();
    this._cache = null;
    const jetzt = new Date();
    let gehalten = 0, entfallen = 0;
    const zeilen = Object.entries(cls.stundenbuch || {})
      .filter(([, r]) => r.e).sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, r]) => {
        const [tag, zeit] = key.split(' ');
        const datum = new Date(tag + 'T' + zeit);
        const t = { beginn: datum, ende: new Date(tag + 'T' + r.e), entfaellt: !!r.x };
        const roh = r.th ? r.th.map(x => this.themaAus(cls, x.id, x.w)) : this.themenDerStunde(cls, t, jetzt).themen;
        const themen = this.nummeriert(cls, key, roh).map(x => x.wort);
        if (r.x) entfallen++; else gehalten++;
        const nr = this.STUNDEN[zeit];
        return {
          key, entfallen: !!r.x, nr: r.x ? '' : gehalten,
          datum: datum.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }),
          stunde: nr && nr !== 'Pause' ? nr : zeit,
          thema: themen.join(' · '), stand: r.s || '', info: r.i || '', raum: r.r || '',
        };
      });
    return { zeilen, gehalten, entfallen };
  },

  klassenbuchZeigen() {
    const ziel = document.getElementById('klassenbuch-tabelle');
    const cls = Classes.currentClass();
    if (!ziel || !cls) return;
    const { zeilen, gehalten, entfallen } = this.buchZeilen(cls);
    document.getElementById('klassenbuch-summe').textContent = zeilen.length
      ? `${gehalten} Stunden gehalten` + (entfallen ? ` · ${entfallen} entfallen` : '') : '';
    document.getElementById('btn-klassenbuch-druck').disabled = !zeilen.length;
    if (!zeilen.length) {
      ziel.innerHTML = `<p class="hint">Noch keine Stunden erfasst. Das Klassenbuch füllt sich aus dem
        Stundenplan (Reiter Plan): Jede vergangene Stunde dieser Klasse kommt von selbst hinein.</p>`;
      return;
    }
    const mitInfo = zeilen.some(z => z.info);
    ziel.innerHTML = `<table class="klassenbuch">
      <thead><tr><th class="num">Nr.</th><th>Datum</th><th>Std.</th><th>Thema</th><th>Stand</th>${mitInfo ? '<th>Info</th>' : ''}<th>Raum</th></tr></thead>
      <tbody>${zeilen.map(z => `<tr class="${z.entfallen ? 'entfallen' : ''}" data-buch="${this.esc(z.key)}" title="Klicken zum Bearbeiten">
        <td class="num">${z.nr}</td><td>${this.esc(z.datum)}</td><td>${this.esc(z.stunde)}</td>
        <td>${z.entfallen ? '<em>entfallen</em>' : this.esc(z.thema) || '<span class="hint">–</span>'}</td>
        <td>${z.entfallen ? '' : this.esc(z.stand)}</td>${mitInfo ? `<td>${this.esc(z.info)}</td>` : ''}<td>${this.esc(z.raum)}</td>
      </tr>`).join('')}</tbody></table>`;
  },

  buchDrucken(cls) {
    if (!cls) return;
    const { zeilen, gehalten, entfallen } = this.buchZeilen(cls);
    if (!zeilen.length) { alert('Für diese Klasse sind noch keine Stunden erfasst.'); return; }
    const mitInfo = zeilen.some(z => z.info);
    const spalten = [{ titel: 'Nr.', cls: 'num' }, { titel: 'Datum' }, { titel: 'Std.' }, { titel: 'Thema' }, { titel: 'Stand' }];
    if (mitInfo) spalten.push({ titel: 'Info' });
    spalten.push({ titel: 'Raum' });
    Band.printHtml(`Klassenbuch ${cls.name}`, Band.printTable(spalten, zeilen.map(z => [
      z.nr, Band.esc(z.datum), Band.esc(z.stunde),
      z.entfallen ? '<em>entfallen</em>' : Band.esc(z.thema),
      z.entfallen ? '' : Band.esc(z.stand),
      ...(mitInfo ? [Band.esc(z.info)] : []),
      Band.esc(z.raum),
    ]), 'kompakt'),
      `${gehalten} Stunden gehalten` + (entfallen ? ` · ${entfallen} entfallen` : '') +
      (cls.year ? ` · Schuljahr ${cls.year}` : ''));
  },

  heuteHtml() {
    const jetzt = new Date();
    const heute = this.tagSchluessel(jetzt);
    const alle = this.alleTermine();
    const tage = [...new Set(alle.map(t => this.tagSchluessel(t.beginn)))].sort();
    // Heute – oder, wenn heute nichts mehr ist (Wochenende, nach Schulschluss),
    // der nächste Schultag. Aus der Wochenansicht gewählt: genau dieser Tag.
    const offenHeute = this.termine.some(t => this.tagSchluessel(t.beginn) === heute && t.ende > jetzt);
    const tag = this.tagWahl || (offenHeute ? heute : tage.find(d => d > heute));
    this.gezeigterTag = tag;
    if (!tag) return '<p class="hint">Im Abo stehen keine kommenden Stunden.</p>';
    const liste = alle.filter(t => this.tagSchluessel(t.beginn) === tag);
    const davor = tage.some(d => d < tag), danach = tage.some(d => d > tag);

    const naechste = this.tagWahl ? null : this.termine.find(t => t.ende > jetzt && !t.entfaellt && !t.aufsicht);
    let kopf = '';
    if (naechste) {
      const b = this.baustein(naechste, jetzt, true);
      const laeuft = naechste.beginn <= jetzt;
      const min = Math.round((naechste.beginn - jetzt) / 60000);
      const wann = laeuft ? `läuft bis ${this.uhr(naechste.ende)}`
        : this.tagSchluessel(naechste.beginn) !== heute ? `${this.tagName(naechste.beginn)}, ${this.uhr(naechste.beginn)}`
        : min <= 90 ? `in ${min} min · ${this.uhr(naechste.beginn)}` : `um ${this.uhr(naechste.beginn)}`;
      kopf = `<div class="plan-naechste ${b.klassenName}"${b.attr}>
        <span class="plan-naechste-label">${laeuft ? 'Jetzt' : 'Als Nächstes'}</span>
        <span class="plan-naechste-wer">${b.wer}</span>
        ${b.raum}${b.marken}
        <span class="plan-naechste-wann">${wann}</span>
      </div>`;
    }

    const datum = this.datum(tag.replace(/-/g, ''));
    const zeilen = liste.map(t => {
      const b = this.baustein(t, jetzt, true);
      const vorbei = t.ende <= jetzt ? ' vorbei' : '';
      return `<li class="${b.klassenName}${vorbei}"${b.attr}>
        ${this.stunde(t.beginn)}<span class="plan-zeit">${this.uhr(t.beginn)}–${this.uhr(t.ende)}</span>
        <span class="plan-wer">${b.wer}</span>${b.raum}${b.marken}
      </li>`;
    }).join('');

    // Änderungen der kommenden Tage, damit nichts überrascht
    const spaeter = this.tagWahl ? [] : this.termine.filter(t => this.tagSchluessel(t.beginn) > tag &&
      (t.entfaellt || t.sonder || this.raumGetauscht(t)));
    const aenderungen = spaeter.length ? `<h3 class="plan-zwischen">Änderungen der nächsten Tage</h3>
      <ul class="plan-liste">${spaeter.map(t => {
        const b = this.baustein(t);
        return `<li class="${b.klassenName}">
          <span class="plan-zeit">${this.tagName(t.beginn)} ${this.uhr(t.beginn)}</span>
          <span class="plan-wer">${b.wer}</span>${b.raum}${b.marken}
        </li>`;
      }).join('')}</ul>` : '';

    const name = tag === heute ? 'Heute' : this.tagWahl ? '' : 'Nächster Schultag';
    const aboEnde = this.letzterAboTag();
    const vorschau = aboEnde && tag > aboEnde;
    const istFrei = !!(Classes.data.planFrei || {})[tag];
    const tagKopf = `<div class="plan-wochen-nav plan-tag-nav">
      <button type="button" class="small" data-tagnav="-1" ${davor ? '' : 'disabled'} aria-label="Tag zurück">‹</button>
      <h3 class="plan-zwischen">${name ? name + ', ' : ''}${this.tagName(datum)}</h3>
      <button type="button" class="small" data-tagnav="1" ${danach ? '' : 'disabled'} aria-label="Tag vor">›</button>
      ${this.tagWahl ? '<button type="button" class="small" data-tag="" title="Zurück zum heutigen Tag (Taste H)">Heute</button>' : ''}
      ${vorschau ? `<span class="plan-vorschau-hinweis" title="Noch nicht im Schulmanager-Abo – aus der Regelwoche">Vorschau</span>
      <button type="button" class="small" data-frei="${tag}" title="Ferien oder Feiertag: an diesem Tag keine Stunden vorsehen">${istFrei ? 'Doch Unterricht' : 'Tag frei'}</button>` : ''}
    </div>`;
    return `${kopf}${tagKopf}
      <ul class="plan-liste">${zeilen.length ? zeilen : `<li class="hint">${istFrei ? 'Als unterrichtsfrei markiert.' : 'Keine Stunden an diesem Tag.'}</li>`}</ul>${aenderungen}`;
  },

  wocheHtml() {
    const jetzt = new Date();
    const mo = new Date(this.wochenBasis());
    mo.setDate(mo.getDate() + 7 * this.wochenVersatz);
    const sa = new Date(mo);
    sa.setDate(sa.getDate() + 5);
    const alle = this.alleTermine();
    const woche = alle.filter(t => t.beginn >= mo && t.beginn < sa);

    const erster = this.montag(alle[0].beginn);
    const letzter = this.montag(alle[alle.length - 1].beginn);
    const zurueck = mo > erster, vor = mo < letzter;
    this.wochenGrenzen = { zurueck, vor };
    const fr = new Date(mo);
    fr.setDate(fr.getDate() + 4);
    const titel = this.wochenVersatz === 0 ? 'Diese Woche'
      : this.wochenVersatz === 1 ? 'Nächste Woche'
      : this.wochenVersatz === -1 ? 'Letzte Woche' : 'Woche';
    // Tage nach dem Abo kommen aus der Regelwoche; Ferien markiert man hier
    const aboEnde = this.letzterAboTag();
    const frei = Classes.data.planFrei || {};
    const vorschauTage = [0, 1, 2, 3, 4].map(i => { const d = new Date(mo); d.setDate(d.getDate() + i); return this.tagSchluessel(d); })
      .filter(tag => aboEnde && tag > aboEnde);
    const alleFrei = vorschauTage.length && vorschauTage.every(tag => frei[tag]);
    const nav = `<div class="plan-wochen-nav">
      <button type="button" class="small" data-woche="-1" ${zurueck ? '' : 'disabled'} aria-label="Woche zurück">‹</button>
      <strong>${titel}</strong> <span class="hint">${mo.getDate()}.${mo.getMonth() + 1}. – ${fr.getDate()}.${fr.getMonth() + 1}.</span>
      <button type="button" class="small" data-woche="1" ${vor ? '' : 'disabled'} aria-label="Woche vor">›</button>
      ${vorschauTage.length ? `<span class="plan-vorschau-hinweis" title="Noch nicht im Schulmanager-Abo – aus der Regelwoche. Entfall und Vertretung kommen, sobald das Abo die Woche enthält.">Vorschau</span>
      <button type="button" class="small" data-frei="${vorschauTage.join(',')}" title="Ferien oder Feiertage: an diesen Tagen keine Stunden vorsehen">${alleFrei ? 'Doch Unterricht' : 'Woche frei'}</button>` : ''}
    </div>`;
    if (!woche.length) return nav + `<p class="hint">${alleFrei ? 'Als unterrichtsfrei markiert.' : 'Für diese Woche stehen keine Stunden im Plan.'}</p>`;

    const zeiten = [...new Set(woche.map(t => this.uhr(t.beginn)))].sort();
    const heute = this.tagSchluessel(jetzt);
    const tage = [0, 1, 2, 3, 4].map(i => { const d = new Date(mo); d.setDate(d.getDate() + i); return d; });
    const kopf = '<div class="plan-ecke"></div>' + tage.map(d =>
      `<button type="button" class="plan-tagkopf${this.tagSchluessel(d) === heute ? ' heute' : ''}" data-tag="${this.tagSchluessel(d)}" title="Diesen Tag als Tagesansicht">${this.tagName(d)}${frei[this.tagSchluessel(d)] ? ' <span class="plan-frei">frei</span>' : ''}</button>`).join('');
    const zellen = zeiten.map(z => {
      const zeile = tage.map(d => {
        const tag = this.tagSchluessel(d);
        const hier = woche.filter(t => this.tagSchluessel(t.beginn) === tag && this.uhr(t.beginn) === z);
        return `<div class="plan-zelle${tag === heute ? ' heute' : ''}">${hier.map(t => {
          const b = this.baustein(t, jetzt, 'start');
          return `<div class="${b.klassenName}"${b.attr}><span class="plan-wer">${b.wer}</span>${b.raum}${b.marken}</div>`;
        }).join('')}</div>`;
      }).join('');
      const nr = this.STUNDEN[z];
      return `<div class="plan-uhr">${nr ? `<strong class="plan-nr${nr === 'Pause' ? ' pause' : ''}">${nr}</strong>` : ''}${z}</div>${zeile}`;
    }).join('');
    return `${nav}<div class="plan-raster-huelle"><div class="plan-raster">${kopf}${zellen}</div></div>`;
  },
};
