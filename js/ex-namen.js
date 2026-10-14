/* Selbst gewählte Namen im Ex-Testraum – verschlüsselt.

   Im Testraum tippen die Schüler nach ihrer Nummer einen Namen ein. Der darf
   wie jeder Klarname nicht lesbar in die Datenbank. Deshalb: Die Lehrkraft
   erzeugt je Sitzung einen Schlüssel, der nur im QR-Code hinter dem # steht
   (geht nie an einen Server). Das iPad verschlüsselt damit den Namen
   (AES-GCM), in der Datenbank liegt nur Zeichensalat; entschlüsselt wird
   ausschließlich auf dem Lehrergerät, das den Schlüssel lokal kennt. */
const ExNamen = {
  b64(bytes) {
    let s = '';
    bytes.forEach(b => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  vonB64(s) {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b + '='.repeat((4 - b.length % 4) % 4)), c => c.charCodeAt(0));
  },

  neuerSchluessel() { return this.b64(crypto.getRandomValues(new Uint8Array(16))); },

  schluessel(roh, zweck) {
    return crypto.subtle.importKey('raw', this.vonB64(roh), 'AES-GCM', false, [zweck]);
  },

  async verschluesseln(roh, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const daten = await crypto.subtle.encrypt({ name: 'AES-GCM', iv },
      await this.schluessel(roh, 'encrypt'), new TextEncoder().encode(text));
    const alles = new Uint8Array(12 + daten.byteLength);
    alles.set(iv);
    alles.set(new Uint8Array(daten), 12);
    return this.b64(alles);
  },

  async entschluesseln(roh, chiffre) {
    try {
      const alles = this.vonB64(chiffre);
      const text = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: alles.slice(0, 12) },
        await this.schluessel(roh, 'decrypt'), alles.slice(12));
      return new TextDecoder().decode(text);
    } catch (e) {
      return '';
    }
  },

  /* Was ein Schüler eintippt: kurz und ohne Steuerzeichen */
  saeubern(name) { return String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30); },
};
