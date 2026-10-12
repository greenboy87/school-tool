/* Zugangsdaten der Firebase-Datenbank (Projekt school-tool, Region europe-west1).
   Diese Werte sind bei Firebase ausdrücklich öffentlich – der Schutz kommt NICHT
   von hier, sondern von den Datenbank-Regeln in der Firebase-Konsole.
   Siehe firebase-regeln.md. */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCcSe6xfc8Oy4MP_swuBSGEhY0K7wstjEo',
  authDomain: 'school-tool-cbbf9.firebaseapp.com',
  databaseURL: 'https://school-tool-cbbf9-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'school-tool-cbbf9',
  storageBucket: 'school-tool-cbbf9.firebasestorage.app',
  messagingSenderId: '1065429467632',
  appId: '1:1065429467632:web:db719f5cd24e8631dd9d35',   // Web-App „school-tool-neu“
};

/* Google-Kennung (UID) der Lehrkraft. Die echte Sperre sitzt in den
   Datenbank-Regeln (dort steht dieselbe Kennung); hier dient sie nur dazu,
   dass die Oberfläche weiß, ob das angemeldete Konto das richtige ist.
   Die Kennung ist kein Geheimnis. Leer = noch nicht eingerichtet. */
window.LEHRER_UID = 'QywuB8eYlOPmTjXCI5I9itdLhsq2';
