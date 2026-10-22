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
       i: 'Geld einsammeln' (Info zu dieser Stunde) }
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
    const druck = document.getElementById('btn-stundenbuch-druck');
    if (druck) druck.addEventListener('click', () => this.buchDrucken(Classes.currentClass()));
    document.getElementById('btn-plan-neu').addEventListener('click', () => this.holen());
    document.getElementById('btn-plan-abo').addEventListener('click', () => this.aboFragen());
    document.getElementById('plan-inhalt').addEventListener('click', e => {
      const link = e.target.closest('[data-klasse]');
      if (link) { this.klasseOeffnen(link.dataset.klasse); return; }
      const thema = e.target.closest('[data-thema]');
      if (thema) { this.themaBearbeiten(thema.dataset.thema); return; }
      const stand = e.target.closest('[data-stand]');
      if (stand) { this.standAendern(stand.dataset.stand.split('|')[0], stand.dataset.stand.split('|')[1]); return; }
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

    this.ausCacheLaden();
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
    if (!this._cache) this._cache = { kette: {}, stunden: {} };
    return this._cache;
  },

  klassenStunden(cls) {
    const c = this.cache();
    if (!c.stunden[cls.id]) {
      c.stunden[cls.id] = this.alleTermine().filter(t => !t.entfaellt && !t.aufsicht && this.klasseZu(t) === cls);
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
        if (ids.length) { carry = ids; art = 'weiter'; }
        continue;
      }
      erg[key] = { themen: carry.map(id => this.themaAus(cls, id)), art };
    }
    return (c.kette[cls.id] = erg);
  },

  /* Von Hand Geplantes einer entfallenen Stunde auf die nächste Stunde der
     Klasse legen, die noch nichts Eigenes hat */
  verschieben(klasseId, key) {
    const cls = Classes.data.classes.find(c => c.id === klasseId);
    const buch = cls && cls.stundenbuch;
    const rec = buch && buch[key];
    if (!rec) return;
    this._cache = null;
    const ziel = this.klassenStunden(cls).find(t => {
      const k = this.buchSchluessel(t);
      const r = buch[k];
      return k > key && t.ende > new Date() && !(r && (r.m || r.s || r.i));
    });
    if (!ziel) { alert('Keine freie Stunde dieser Klasse mehr im Plan.'); return; }
    const k = this.buchSchluessel(ziel);
    const neu = buch[k] || (buch[k] = {});
    for (const feld of ['th', 'm', 's', 'i']) if (rec[feld] !== undefined) { neu[feld] = rec[feld]; delete rec[feld]; }
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
      const cls = this.klasseZu(t);
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
    const cls = Classes.data.classes.find(c => c.id === klasseId);
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
    const nr = this.STUNDEN[this.uhr(t.beginn)];
    document.getElementById('plan-dialog-titel').textContent =
      `${t.fach} ${this.klassenText(t)} · ${this.tagName(t.beginn)} · ${nr && nr !== 'Pause' ? nr + ' Stunde' : this.uhr(t.beginn)}` +
      (t.vorschau ? ' (Vorschau)' : '');

    const jahr = Classes.currentSchoolYear();
    const klassen = [...Classes.data.classes].sort((a, b) => (b.year === jahr) - (a.year === jahr));
    wahlKlasse.innerHTML = '<option value="">– keine Klasse –</option>' + klassen.map(c =>
      `<option value="${this.esc(c.id)}">${this.esc(c.name)}${c.year && c.year !== jahr ? ' (' + this.esc(c.year) + ')' : ''}</option>`).join('');
    wahlKlasse.value = alteKlasse ? alteKlasse.id : '';
    immer.checked = false;
    immer.closest('label').hidden = !t.platz;

    const zeigeEigen = () => {
      eigenZeile.hidden = wahlThema.value !== 'eigen';
      katalogZeile.hidden = wahlThema.value !== 'katalog';
    };
    wahlThema.onchange = () => {
      zeigeEigen();
      if (!eigenZeile.hidden) feld.focus();
      if (!katalogZeile.hidden) katalogFeld.focus();
    };

    // Themenauswahl der gerade gewählten Klasse
    const fuellen = () => {
      const cls = Classes.data.classes.find(c => c.id === wahlKlasse.value);
      const buch = cls ? cls.stundenbuch || {} : {};
      const rec = buch[key] || {};
      // Was ohne eigenen Eintrag gälte – dafür den Eintrag kurz beiseitelegen
      let auto = '';
      if (cls) {
        const merk = buch[key];
        if (merk && merk.m) { const ohne = { ...merk }; delete ohne.th; delete ohne.m; buch[key] = ohne; }
        this._cache = null;
        auto = this.themenDerStunde(cls, t).themen.map(x => x.wort).join(' · ');
        if (merk) buch[key] = merk;
        this._cache = null;
      }
      const stufe = { progress: 'läuft', open: 'offen', done: 'fertig' };
      const themen = cls ? Lessons.assignedTopics(cls) : [];
      wahlThema.innerHTML =
        `<option value="auto">Automatisch${auto ? ': ' + this.esc(auto) : ' (nichts)'}</option>` +
        (themen.length ? `<optgroup label="Themen der Klasse">${themen.map(tp =>
          `<option value="id:${this.esc(tp.id)}">${this.esc(Lessons.schlagwort(tp))} · ${stufe[Lessons.stateOf(cls, tp.id)] || ''}</option>`).join('')}</optgroup>` : '') +
        '<option value="katalog">Aus dem Stundenkatalog …</option>' +
        '<option value="eigen">Eigener Eintrag …</option><option value="kein">Kein Thema</option>';
      // Vorschläge wie unter Klassen → Stunden: erst die eigene Jahrgangsstufe
      const passt = tp => cls && cls.grade && tp.grades && tp.grades.includes(cls.grade);
      const gesehen = new Set();
      document.getElementById('plan-dialog-katalog-liste').innerHTML = cls ? Lessons.allTopics()
        .sort((a, b) => passt(b) - passt(a))
        .filter(tp => !gesehen.has(tp.name.toLowerCase()) && gesehen.add(tp.name.toLowerCase()))
        .map(tp => `<option value="${this.esc(tp.name)}"${tp.grades && tp.grades.length ? ` label="Kl. ${this.esc(Lessons.gradeLabel(tp.grades))}"` : ''}>`).join('') : '';
      katalogFeld.value = '';
      feld.value = '';
      if (!rec.m || !rec.th) wahlThema.value = 'auto';
      else if (!rec.th.length) wahlThema.value = 'kein';
      else if (rec.th.length === 1 && rec.th[0].id && themen.some(tp => tp.id === rec.th[0].id)) wahlThema.value = 'id:' + rec.th[0].id;
      else { wahlThema.value = 'eigen'; feld.value = rec.th.map(x => x.w).join(' · '); }
      standFeld.value = rec.s || '';
      infoFeld.value = rec.i || '';
      wahlThema.disabled = feld.disabled = standFeld.disabled = infoFeld.disabled = !cls;
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
      const cls = Classes.data.classes.find(c => c.id === neueId);
      // Was die alte Klasse zu dieser Stunde schon hatte, zieht mit um (ohne Thema)
      let rec = cls ? (cls.stundenbuch || {})[key] || {} : {};
      if (alteKlasse && alteKlasse !== cls && alteKlasse.stundenbuch && alteKlasse.stundenbuch[key]) {
        const alt = alteKlasse.stundenbuch[key];
        delete alteKlasse.stundenbuch[key];
        if (cls) { rec = { ...alt, ...rec }; delete rec.th; delete rec.m; }
      }
      if (cls) {
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
          if (tp) {
            const l = Lessons.lessonsOf(cls);
            if (!l[tp.id]) {
              l[tp.id] = { s: 'open', added: Date.now() };
              if (tp.ordner) l[tp.id].t = tp.name;
            }
            rec.th = [{ id: tp.id, w: Lessons.schlagwort(tp) }];
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
          const zuId = new Map(Lessons.assignedTopics(cls).map(tp => [Lessons.schlagwort(tp).toLowerCase(), tp.id]));
          rec.th = text.split(/\s+·\s+/).filter(Boolean).map(w => {
            const id = zuId.get(w.toLowerCase());
            return id ? { id, w } : { w };
          });
          rec.m = 1;
        }
        const stand = standFeld.value.trim().slice(0, 200);
        if (stand) rec.s = stand; else delete rec.s;
        const info = infoFeld.value.trim().slice(0, 200);
        if (info) rec.i = info; else delete rec.i;
        if (Object.keys(rec).length) buch[key] = rec; else delete buch[key];
      }
      Classes.persist();
      this.buchFuehren();
      this.render();
    };
    dlg.showModal();
    (wahlThema.disabled ? wahlKlasse : wahlThema).focus();
  },

  /* Stunden aus dem Stundenbuch, die das Abo nicht mehr liefert – damit auch
     ältere Wochen im Plan stehen */
  buchTermine() {
    if (!Classes.data) return [];
    const erster = this.termine.length ? this.tagSchluessel(this.termine[0].beginn) : '9999';
    const liste = [];
    for (const cls of Classes.data.classes) {
      for (const [key, rec] of Object.entries(cls.stundenbuch || {})) {
        const [tag, zeit] = key.split(' ');
        if (tag >= erster || !rec.e) continue;   // nur Vergangenes; Geplantes ohne Zeit hat kein e
        liste.push({
          beginn: new Date(tag + 'T' + zeit), ende: new Date(tag + 'T' + rec.e),
          fach: rec.f || '', klassen: rec.k ? rec.k.split(' · ') : [], raum: rec.r || '',
          entfaellt: !!rec.x, aufsicht: false, sonder: false, platz: '', klasseId: cls.id,
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
      if (!rec || !(rec.m || rec.s || rec.i)) return '';
      const geplant = [rec.m && rec.th ? (rec.th.map(x => x.w).join(' · ') || 'kein Thema') : '', rec.s, rec.i].filter(Boolean).join(' – ');
      return `<span class="plan-thema"><span class="plan-geplant" title="War für diese Stunde geplant">geplant: ${this.esc(geplant)}</span>` +
        `<button type="button" class="small" data-verschieben="${this.esc(cls.id + '|' + key)}" title="Auf die nächste Stunde der Klasse legen, die noch nichts Eigenes hat">→ nächste Stunde</button></span>`;
    }
    if (!cls) {
      return zeigeStand ? `<span class="plan-thema"><button type="button" class="plan-thema-plus" data-thema="${this.esc(key)}" title="Klasse und Thema für diese Stunde eintragen">${Icons.raw('plus')}Klasse</button></span>` : '';
    }
    const rec = (cls.stundenbuch || {})[key] || {};
    const { themen, vorschlag } = this.themenDerStunde(cls, t);
    const worte = themen.map(x => x.wort).join(' · ');
    const ziel = this.esc(key);
    const teile = [];
    if (themen.length && (zeigeWort || zeigeStand)) {
      const art = vorschlag ? ' vorschlag' : rec.m ? ' manuell' : '';
      const titel = vorschlag ? 'Vorschlag: Fortführung der vorigen Stunde bzw. nächstes offenes Thema – klicken zum Ändern'
        : rec.m ? 'Von Hand gesetzt – klicken zum Ändern' : 'Thema dieser Stunde – klicken zum Ändern';
      teile.push(`<button type="button" class="plan-thema-wort${art}" data-thema="${ziel}" title="${titel}">${vorschlag ? 'Vorschlag: ' : ''}${this.esc(worte)}</button>`);
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
    marken.push(this.themenHtml(t, cls, mitKnoepfen));
    const info = cls && !t.entfaellt && ((cls.stundenbuch || {})[this.buchSchluessel(t)] || {}).i;
    if (info) marken.push(`<span class="plan-info" title="Info zu dieser Stunde – klicken zum Ändern">${Icons.raw('alert')}${this.esc(info)}</span>`);
    const klassenName = ['plan-termin',
      t.entfaellt && 'entfaellt', t.sonder && 'sonder', getauscht && 'getauscht', t.aufsicht && 'aufsicht',
      t.vorschau && 'vorschau', !t.entfaellt && !t.aufsicht && 'klickbar',
      jetzt && t.beginn <= jetzt && jetzt < t.ende && !t.entfaellt && 'laeuft'].filter(Boolean).join(' ');
    const attr = !t.entfaellt && !t.aufsicht ? ` data-stunde="${this.esc(this.buchSchluessel(t))}"` : '';
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
    const voll = document.fullscreenElement || document.webkitFullscreenElement;
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
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    const rein = this.karte.requestFullscreen || this.karte.webkitRequestFullscreen;
    if (!rein) { alert('Dieser Browser kann den Vollbildmodus hier nicht anzeigen.'); return; }
    const p = rein.call(this.karte);
    if (p && p.catch) p.catch(err => alert('Vollbild nicht möglich: ' + err.message));
  },

  /* ---------- Übersicht je Klasse zum Drucken (als PDF speichern) ---------- */
  buchDrucken(cls) {
    if (!cls) return;
    this.buchFuehren();
    this._cache = null;
    const jetzt = new Date();
    const eintraege = Object.entries(cls.stundenbuch || {})
      .filter(([, r]) => r.e).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (!eintraege.length) {
      alert('Für diese Klasse sind noch keine Stunden erfasst.\n\n' +
        'Das Stundenbuch füllt sich aus dem Stundenplan (Reiter Plan) – mit jeder Stunde, die vorbei ist.');
      return;
    }
    let gehalten = 0, entfallen = 0;
    const zeilen = eintraege.map(([key, r]) => {
      const [tag, zeit] = key.split(' ');
      const datum = new Date(tag + 'T' + zeit);
      const t = { beginn: datum, ende: new Date(tag + 'T' + r.e), entfaellt: !!r.x };
      const themen = r.th ? r.th.map(x => x.w) : this.themenDerStunde(cls, t, jetzt).themen.map(x => x.wort);
      if (r.x) entfallen++; else gehalten++;
      const nr = this.STUNDEN[zeit];
      return [
        r.x ? '' : gehalten,
        Band.esc(datum.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })),
        Band.esc(nr && nr !== 'Pause' ? nr : zeit),
        r.x ? '<em>entfallen</em>' : Band.esc(themen.join(' · ')),
        r.x ? '' : Band.esc(r.s || ''),
        Band.esc(r.r || ''),
      ];
    });
    Band.printHtml(`${cls.name} – gehaltene Stunden`, Band.printTable(
      [{ titel: 'Nr.', cls: 'num' }, { titel: 'Datum' }, { titel: 'Std.' }, { titel: 'Thema' }, { titel: 'Stand' }, { titel: 'Raum' }],
      zeilen, 'kompakt'),
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
