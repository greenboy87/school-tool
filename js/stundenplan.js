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
   merkt sich das Tool die Räume der vergangenen Wochen. */
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

  init() {
    this.el = document.getElementById('tab-plan');
    if (!this.el) return;
    this.schalter = document.getElementById('plan-ansicht');
    this.schalter.checked = localStorage.getItem(this.ANSICHT_KEY) === 'woche';
    this.schalter.addEventListener('change', () => {
      localStorage.setItem(this.ANSICHT_KEY, this.schalter.checked ? 'woche' : 'heute');
      this.wochenVersatz = 0;
      this.render();
    });
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
    document.getElementById('btn-plan-neu').addEventListener('click', () => this.holen());
    document.getElementById('btn-plan-abo').addEventListener('click', () => this.aboFragen());
    document.getElementById('plan-inhalt').addEventListener('click', e => {
      const link = e.target.closest('[data-klasse]');
      if (link) { this.klasseOeffnen(link.dataset.klasse); return; }
      const stand = e.target.closest('[data-stand]');
      if (stand) { this.standAendern(...stand.dataset.stand.split('|')); return; }
      const datei = e.target.closest('[data-oeffnen]');
      if (datei) { Lessons.oeffnen(datei.dataset.oeffnen); return; }
      const kopie = e.target.closest('[data-kopieren]');
      if (kopie) Lessons.schlagwortKopieren(kopie, kopie.dataset.kopieren);
      const nav = e.target.closest('[data-woche]');
      if (nav) { this.wochenVersatz += parseInt(nav.dataset.woche, 10); this.render(); }
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
    if (t.entfaellt || t.aufsicht || !t.raum) return '';
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

  klasseZu(t) {
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

  /* Schlagwörter der Themen, die in der Klasse gerade auf „Läuft“ stehen –
     dasselbe, was der Kopierknopf im Reiter Stunden ins Klassenbuch legt */
  laufendeThemen(cls) {
    if (!cls || typeof Lessons === 'undefined') return [];
    return Object.entries(Lessons.lessonsOf(cls))
      .filter(([, e]) => e && e.s === 'progress')
      .map(([id, e]) => ({ topic: Lessons.topicById(id, e), eintrag: e }))
      .filter(x => x.topic)
      .map(x => ({ ...x, wort: Lessons.schlagwort(x.topic) }));
  },

  /* Eigener Vermerk, wo es weitergeht („bis Folie 15“) – je Klasse und Thema,
     liegt beim Fortschritt der Klasse und reist damit im Sync mit */
  standAendern(klasseId, topicId) {
    const cls = Classes.data.classes.find(c => c.id === klasseId);
    const e = cls && cls.lessons && cls.lessons[topicId];
    if (!e) return;
    const topic = Lessons.topicById(topicId, e);
    const neu = prompt(`Stand in ${cls.name} – ${topic ? Lessons.schlagwort(topic) : 'Thema'}\n` +
      '(z. B. „bis Folie 15, AB S. 2 offen“):', e.stand || '');
    if (neu === null) return;
    const text = neu.trim().slice(0, 200);
    if (text) e.stand = text; else delete e.stand;
    Classes.persist();
    this.render();
  },

  /* Laufende Themen einer Stunde: Schlagwort (Schalter „Themen“), dazu der
     eigene Stand und die Knöpfe zu Material und Zwischenablage (Schalter
     „Stand“). Die Knöpfe nur in der Tagesansicht – im Wochenraster wäre dafür
     kein Platz. */
  themenHtml(t, cls, mitKnoepfen) {
    const zeigeWort = this.themenSchalter.checked, zeigeStand = this.standSchalter.checked;
    const zeigeKnoepfe = mitKnoepfen && zeigeStand;
    if (t.entfaellt || !cls || (!zeigeWort && !zeigeStand)) return '';
    const themen = this.laufendeThemen(cls);
    if (!themen.length) return '';
    return themen.map(({ topic, eintrag, wort }) => {
      const teile = [];
      if (zeigeWort || themen.length > 1) {
        teile.push(`<span class="plan-thema-wort" title="Läuft gerade in dieser Klasse">${this.esc(wort)}</span>`);
      }
      if (zeigeStand) {
        const ziel = this.esc(cls.id + '|' + topic.id);
        teile.push(eintrag.stand
          ? `<button type="button" class="plan-stand-text" data-stand="${ziel}" title="Stand ändern">${Icons.raw('pen')}${this.esc(eintrag.stand)}</button>`
          : `<button type="button" class="plan-stand-text leer" data-stand="${ziel}" title="Notieren, wo es weitergeht">${Icons.raw('pen')}Stand notieren</button>`);
      }
      if (zeigeKnoepfe) {
        const knopf = (icon, text, attr, titel) =>
          `<button type="button" class="small" ${attr} title="${this.esc(titel)}">${Icons.raw(icon)}${this.esc(text)}</button>`;
        const oeffnen = (icon, text, pfad, titel) =>
          knopf(icon, text, `data-oeffnen="${this.esc(pfad)}"`, titel + ': ' + pfad);
        const alles = eintrag.stand ? `${wort} – ${eintrag.stand}` : wort;
        teile.push(`<span class="plan-material">${[
          topic.haupt ? oeffnen('play', /\.pdf$/i.test(topic.haupt) ? 'PDF' : 'Präsentation', topic.haupt, 'Starten') : '',
          topic.ab ? oeffnen('file', 'AB', topic.ab, 'Öffnen') : '',
          topic.ordner ? oeffnen('folder', 'Ordner', topic.ordner, 'Ordner öffnen') : '',
          knopf('clipboard', 'Thema', `data-kopieren="${this.esc(wort)}"`, 'Schlagwort kopieren: ' + wort),
          eintrag.stand ? knopf('clipboard', 'Alles', `data-kopieren="${this.esc(alles)}"`, 'Thema und Stand kopieren: ' + alles) : '',
        ].join('')}</span>`);
      }
      return `<span class="plan-thema">${teile.join('')}</span>`;
    }).join('');
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
  /* Stundenraster der Schule nach Anfangszeit; der Nachmittag bleibt ohne Nummer */
  STUNDEN: { '08:00': '1.', '08:45': '2.', '09:30': '3.', '10:15': 'Pause', '10:45': '4.', '11:30': '5.', '12:15': '6.' },
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
    const klassenName = ['plan-termin',
      t.entfaellt && 'entfaellt', t.sonder && 'sonder', getauscht && 'getauscht', t.aufsicht && 'aufsicht',
      jetzt && t.beginn <= jetzt && jetzt < t.ende && !t.entfaellt && 'laeuft'].filter(Boolean).join(' ');
    return { klassenName, wer, raum, marken: marken.join('') };
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
    inhalt.innerHTML = this.schalter.checked ? this.wocheHtml() : this.heuteHtml();
  },

  heuteHtml() {
    const jetzt = new Date();
    const heute = this.tagSchluessel(jetzt);
    const tage = [...new Set(this.termine.map(t => this.tagSchluessel(t.beginn)))].sort();
    // Heute – oder, wenn heute nichts mehr ist (Wochenende, nach Schulschluss), der nächste Schultag
    const offenHeute = this.termine.some(t => this.tagSchluessel(t.beginn) === heute && t.ende > jetzt);
    const tag = offenHeute ? heute : tage.find(d => d > heute);
    if (!tag) return '<p class="hint">Im Abo stehen keine kommenden Stunden.</p>';
    const liste = this.termine.filter(t => this.tagSchluessel(t.beginn) === tag);

    const naechste = this.termine.find(t => t.ende > jetzt && !t.entfaellt && !t.aufsicht);
    let kopf = '';
    if (naechste) {
      const b = this.baustein(naechste, jetzt, true);
      const laeuft = naechste.beginn <= jetzt;
      const min = Math.round((naechste.beginn - jetzt) / 60000);
      const wann = laeuft ? `läuft bis ${this.uhr(naechste.ende)}`
        : this.tagSchluessel(naechste.beginn) !== heute ? `${this.tagName(naechste.beginn)}, ${this.uhr(naechste.beginn)}`
        : min <= 90 ? `in ${min} min · ${this.uhr(naechste.beginn)}` : `um ${this.uhr(naechste.beginn)}`;
      kopf = `<div class="plan-naechste ${b.klassenName}">
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
      return `<li class="${b.klassenName}${vorbei}">
        ${this.stunde(t.beginn)}<span class="plan-zeit">${this.uhr(t.beginn)}–${this.uhr(t.ende)}</span>
        <span class="plan-wer">${b.wer}</span>${b.raum}${b.marken}
      </li>`;
    }).join('');

    // Änderungen der kommenden Tage, damit nichts überrascht
    const spaeter = this.termine.filter(t => this.tagSchluessel(t.beginn) > tag &&
      (t.entfaellt || t.sonder || this.raumGetauscht(t)));
    const aenderungen = spaeter.length ? `<h3 class="plan-zwischen">Änderungen der nächsten Tage</h3>
      <ul class="plan-liste">${spaeter.map(t => {
        const b = this.baustein(t);
        return `<li class="${b.klassenName}">
          <span class="plan-zeit">${this.tagName(t.beginn)} ${this.uhr(t.beginn)}</span>
          <span class="plan-wer">${b.wer}</span>${b.raum}${b.marken}
        </li>`;
      }).join('')}</ul>` : '';

    return `${kopf}
      <h3 class="plan-zwischen">${tag === heute ? 'Heute' : 'Nächster Schultag'}, ${this.tagName(datum)}</h3>
      <ul class="plan-liste">${zeilen}</ul>${aenderungen}`;
  },

  wocheHtml() {
    const jetzt = new Date();
    // Am Wochenende gleich die kommende Woche zeigen
    const basis = this.montag(new Date(jetzt.getTime() + ([0, 6].includes(jetzt.getDay()) ? 2 * 864e5 : 0)));
    const mo = new Date(basis);
    mo.setDate(mo.getDate() + 7 * this.wochenVersatz);
    const sa = new Date(mo);
    sa.setDate(sa.getDate() + 5);
    const woche = this.termine.filter(t => t.beginn >= mo && t.beginn < sa);

    const erster = this.montag(this.termine[0].beginn);
    const letzter = this.montag(this.termine[this.termine.length - 1].beginn);
    const zurueck = mo > erster, vor = mo < letzter;
    const fr = new Date(mo);
    fr.setDate(fr.getDate() + 4);
    const titel = this.wochenVersatz === 0 ? 'Diese Woche'
      : this.wochenVersatz === 1 ? 'Nächste Woche'
      : this.wochenVersatz === -1 ? 'Letzte Woche' : 'Woche';
    const nav = `<div class="plan-wochen-nav">
      <button type="button" class="small" data-woche="-1" ${zurueck ? '' : 'disabled'} aria-label="Woche zurück">‹</button>
      <strong>${titel}</strong> <span class="hint">${mo.getDate()}.${mo.getMonth() + 1}. – ${fr.getDate()}.${fr.getMonth() + 1}.</span>
      <button type="button" class="small" data-woche="1" ${vor ? '' : 'disabled'} aria-label="Woche vor">›</button>
    </div>`;
    if (!woche.length) return nav + '<p class="hint">Für diese Woche stehen keine Stunden im Abo.</p>';

    const zeiten = [...new Set(woche.map(t => this.uhr(t.beginn)))].sort();
    const heute = this.tagSchluessel(jetzt);
    const tage = [0, 1, 2, 3, 4].map(i => { const d = new Date(mo); d.setDate(d.getDate() + i); return d; });
    const kopf = '<div class="plan-ecke"></div>' + tage.map(d =>
      `<div class="plan-tagkopf${this.tagSchluessel(d) === heute ? ' heute' : ''}">${this.tagName(d)}</div>`).join('');
    const zellen = zeiten.map(z => {
      const zeile = tage.map(d => {
        const tag = this.tagSchluessel(d);
        const hier = woche.filter(t => this.tagSchluessel(t.beginn) === tag && this.uhr(t.beginn) === z);
        return `<div class="plan-zelle${tag === heute ? ' heute' : ''}">${hier.map(t => {
          const b = this.baustein(t, jetzt);
          return `<div class="${b.klassenName}"><span class="plan-wer">${b.wer}</span>${b.raum}${b.marken}</div>`;
        }).join('')}</div>`;
      }).join('');
      const nr = this.STUNDEN[z];
      return `<div class="plan-uhr">${nr ? `<strong class="plan-nr${nr === 'Pause' ? ' pause' : ''}">${nr}</strong>` : ''}${z}</div>${zeile}`;
    }).join('');
    return `${nav}<div class="plan-raster-huelle"><div class="plan-raster">${kopf}${zellen}</div></div>`;
  },
};
