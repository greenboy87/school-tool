/* Exen – digitale Stegreifaufgaben auf iPads (Format tom-ex/2, siehe
   docs/ex/ex-format.md).

   Das School-Tool ist nur der Rahmen: Jede Ex ist eine eigene HTML-Datei mit
   eigener Oberfläche. Hier liegen Bibliothek, Start, Dashboard und Auswertung.

   Datenschutz wie überall: In der Datenbank stehen Nummern, nie Namen. Lösungen
   und Bewertungscode liegen in einem eigenen Ast, den nur die Lehrkraft lesen
   darf – und erreichen nie ein Schülergerät. */
const Exen = {
  init() {
    if (!document.getElementById('tab-exen')) return;
    document.getElementById('btn-ex-anmelden').addEventListener('click', () => this.anmelden());
    document.getElementById('btn-ex-abmelden').addEventListener('click', () => this.abmelden());
    document.getElementById('btn-ex-uid').addEventListener('click', () => this.uidKopieren());
    if (window.FB) this.verbinden();
    else window.addEventListener('fb-bereit', () => this.verbinden(), { once: true });
  },

  verbinden() {
    if (!FB.bereit) { this.anmeldungZeigen(null, 'Keine Verbindung zur Datenbank: ' + FB.fehler); return; }
    FB.beiAnmeldung(u => this.anmeldungZeigen(u));
  },

  /* ---------- Lehrer-Anmeldung ---------- */
  anmeldungZeigen(u, fehler) {
    const status = document.getElementById('ex-anmeldung-status');
    const lehrer = !!(u && !u.isAnonymous);
    document.getElementById('btn-ex-anmelden').hidden = lehrer || !!fehler;
    document.getElementById('btn-ex-abmelden').hidden = !lehrer;
    document.getElementById('btn-ex-uid').hidden = !lehrer || FB.istLehrer();
    status.classList.toggle('warnung', !!fehler || (lehrer && !FB.istLehrer()));
    if (fehler) status.textContent = fehler;
    else if (!lehrer) status.textContent = 'Nicht angemeldet.';
    else if (FB.istLehrer()) status.textContent = `Angemeldet als ${u.email || u.displayName}.`;
    else if (!window.LEHRER_UID) {
      status.textContent = `Angemeldet als ${u.email || u.displayName}. Noch nicht eingerichtet: ` +
        `Kennung kopieren und in firebase-config.js (LEHRER_UID) und die Datenbank-Regeln eintragen.`;
    } else {
      status.textContent = `${u.email || u.displayName} ist nicht das eingetragene Lehrerkonto. ` +
        'Bitte abmelden und mit dem richtigen Google-Konto anmelden.';
    }
    document.dispatchEvent(new CustomEvent('ex-anmeldung', { detail: { lehrer: FB.istLehrer() } }));
  },

  async anmelden() {
    try {
      await FB.mitGoogleAnmelden();
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      alert('Anmeldung fehlgeschlagen: ' + this.authFehler(e));
    }
  },

  async abmelden() {
    if (!confirm('Auf diesem Gerät abmelden? Laufende Exen lassen sich dann hier nicht mehr steuern.')) return;
    await FB.abmelden();
  },

  async uidKopieren() {
    const u = FB.nutzer();
    if (!u) return;
    try {
      await navigator.clipboard.writeText(u.uid);
      alert('Kennung kopiert:\n\n' + u.uid);
    } catch (e) {
      prompt('Kennung zum Kopieren:', u.uid);
    }
  },

  authFehler(e) {
    const texte = {
      'auth/operation-not-allowed': 'Google-Anmeldung ist in der Firebase-Konsole noch nicht eingeschaltet (siehe firebase-regeln.md).',
      'auth/unauthorized-domain': 'Diese Adresse ist in der Firebase-Konsole nicht als autorisierte Domain eingetragen.',
      'auth/popup-blocked': 'Der Browser hat das Anmeldefenster blockiert. Pop-ups für diese Seite erlauben.',
      'auth/network-request-failed': 'Keine Internetverbindung.',
    };
    return texte[e.code] || e.message || String(e);
  },
};
