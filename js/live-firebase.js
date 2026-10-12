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
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const FB = {
  bereit: false,
  fehler: null,
  db: null,
  ref, set, update, remove, onValue, get, onDisconnect, serverTimestamp,
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
} catch (e) {
  FB.fehler = e.message || String(e);
  console.error('Firebase konnte nicht gestartet werden:', e);
}

window.FB = FB;
window.dispatchEvent(new CustomEvent('fb-bereit', { detail: FB }));
