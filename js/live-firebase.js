/* Anbindung an die Firebase-Realtime-Database.
   Läuft als Modul (die Firebase-SDK gibt es nur als Modul); stellt die benötigten
   Funktionen unter window.FB bereit, damit die normalen Skripte damit arbeiten können.

   WICHTIG zum Datenschutz: In dieser Datenbank landen NIEMALS Namen. Gespeichert
   wird ausschließlich „Platznummer der Klassenliste -> Gruppenname“. Die Zuordnung
   Nummer -> Name existiert nur auf den Geräten (Lehrergerät und, per QR-Code
   übertragen, auf den Schülerhandys). */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getDatabase, ref, set, update, remove, onValue, get, onDisconnect, serverTimestamp,
  runTransaction, push,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const FB = {
  bereit: false,
  fehler: null,
  db: null,
  ref, set, update, remove, onValue, get, onDisconnect, serverTimestamp, push,
  /* Für Plätze, die nur einer haben darf (Tiny Band: Drums in einer Band) –
     Firebase prüft dabei selbst, ob jemand schneller war, und wiederholt sonst */
  runTransaction,
  /* Wurzel aller Räume – bewusst ein eigener Ast neben dem Musik-Quiz */
  WURZEL: 'schoolTool/raeume',

  /* Anmeldung – bisher nur für die Exen nötig: Die Lehrkraft meldet sich mit
     Google an, Schülergeräte anonym. Die Regeln prüfen dann, wer schreibt;
     Gruppen und Tiny Band laufen weiter ohne Anmeldung. */
  auth: null,
  nutzer() { return this.auth ? this.auth.currentUser : null; },
  istLehrer() {
    const u = this.nutzer();
    return !!(u && !u.isAnonymous && window.LEHRER_UID && u.uid === window.LEHRER_UID);
  },
  beiAnmeldung(fn) { return onAuthStateChanged(this.auth, fn); },
  mitGoogleAnmelden() { return signInWithPopup(this.auth, new GoogleAuthProvider()); },
  anonymAnmelden() { return signInAnonymously(this.auth); },
  abmelden() { return signOut(this.auth); },
};

try {
  if (!window.FIREBASE_CONFIG) throw new Error('firebase-config.js fehlt');
  const app = initializeApp(window.FIREBASE_CONFIG, 'schoolTool');
  FB.db = getDatabase(app);
  FB.auth = getAuth(app);
  FB.bereit = true;
  // Verbindungsstand mitführen – hält nebenbei die Leitung offen
  onValue(ref(FB.db, '.info/connected'), s => { FB.online = !!s.val(); });
} catch (e) {
  FB.fehler = e.message || String(e);
  console.error('Firebase konnte nicht gestartet werden:', e);
}

/* get() bricht mit „Client is offline“ ab, wenn die Leitung gerade erst
   aufgebaut wird oder kurz weg war (WLAN-Wechsel, Rechner aus dem Ruhezustand,
   Schulnetz). Dann bis zu 20 s auf die Verbindung warten und noch einmal fragen. */
FB.offline = e => /offline/i.test((e && (e.message || e.code)) || '');
FB.warteAufVerbindung = (ms = 20000) => new Promise(fertig => {
  const start = Date.now();
  const schauen = () => {
    if (FB.online) fertig(true);
    else if (Date.now() - start > ms) fertig(false);
    else setTimeout(schauen, 250);
  };
  schauen();
});
FB.get = async r => {
  try { return await get(r); }
  catch (e) {
    if (!FB.offline(e)) throw e;
    await FB.warteAufVerbindung();
    return get(r);
  }
};

window.FB = FB;
window.dispatchEvent(new CustomEvent('fb-bereit', { detail: FB }));
