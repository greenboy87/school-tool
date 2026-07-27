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
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';

const FB = {
  bereit: false,
  fehler: null,
  db: null,
  ref, set, update, remove, onValue, get, onDisconnect, serverTimestamp,
  /* Wurzel aller Räume – bewusst ein eigener Ast neben dem Musik-Quiz */
  WURZEL: 'schoolTool/raeume',
};

try {
  if (!window.FIREBASE_CONFIG) throw new Error('firebase-config.js fehlt');
  FB.db = getDatabase(initializeApp(window.FIREBASE_CONFIG, 'schoolTool'));
  FB.bereit = true;
} catch (e) {
  FB.fehler = e.message || String(e);
  console.error('Firebase konnte nicht gestartet werden:', e);
}

window.FB = FB;
window.dispatchEvent(new CustomEvent('fb-bereit', { detail: FB }));
