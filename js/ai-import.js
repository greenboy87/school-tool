/* KI-Import: schickt ein Gruppen-Dokument (PDF, auch gescannt/handschriftlich)
   direkt aus dem Browser an die Claude-API und bekommt die Gruppen als JSON.

   Der API-Schlüssel gehört dem Nutzer und bleibt in localStorage –
   er wird ausschließlich an api.anthropic.com gesendet. */
const AiImport = {
  KEY: 'schooltool-anthropic-key',
  MODEL: 'claude-opus-4-8',

  getKey() { return (localStorage.getItem(this.KEY) || '').trim(); },
  setKey(k) {
    if (k && k.trim()) localStorage.setItem(this.KEY, k.trim());
    else localStorage.removeItem(this.KEY);
  },

  /* Strukturierte Ausgabe: erzwingt gültiges JSON in genau dieser Form */
  SCHEMA: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Titel/Projektname des Dokuments, falls vorhanden, sonst leer' },
      groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Gruppen-/Band-/Produktname; falls keiner dasteht, z. B. "Gruppe 1"' },
            grade: { type: 'string', description: 'Note der ganzen Gruppe (1–6, auch 2+ / 2-), leer wenn keine erkennbar' },
            members: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Voller Name, so geschrieben wie im Dokument' },
                  grade: { type: 'string', description: 'Einzelnote direkt bei diesem Namen, leer wenn keine' },
                },
                required: ['name', 'grade'],
                additionalProperties: false,
              },
            },
          },
          required: ['name', 'grade', 'members'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'groups'],
    additionalProperties: false,
  },

  PROMPT: `Du siehst das eingescannte oder digitale Dokument einer Musiklehrkraft mit der Gruppeneinteilung einer Schulklasse (Tabelle, Liste oder handschriftliche Zettel; das Layout variiert – Gruppenname kann links oder rechts stehen).

Extrahiere alle Gruppen:
- name: der Gruppen-, Band-, Produkt- oder Themenname der Gruppe. Steht keiner da, nummeriere ("Gruppe 1", "Gruppe 2", …).
- members: alle Mitglieder mit vollem Namen, exakt so geschrieben wie im Dokument (auch Klein-/Fehlschreibungen beibehalten). Einzelne Vornamen, die direkt darunter noch einmal mit Nachnamen stehen, nur einmal aufnehmen.
- Noten: deutsche Schulnoten 1–6, auch mit + oder - (häufig handschriftlich, auch farbig). Steht die Note bei der ganzen Gruppe (z. B. in der Produktspalte oder am Rand der Zeile), trage sie als grade der Gruppe ein. Steht eine Note direkt neben einem einzelnen Namen, trage sie als grade dieses Mitglieds ein. Nicht raten: Wenn eine Ziffer unleserlich ist oder keine Note erkennbar ist, leer lassen.
- Durchgestrichene oder leere Tabellenzeilen ignorieren. Randnotizen, Häkchen und Kommentare sind keine Noten.

Antworte nur mit dem JSON.`,

  async extract(file, onStatus = () => {}) {
    const key = this.getKey();
    if (!key) throw new Error('Kein API-Schlüssel hinterlegt.');
    if (file.size > 25 * 1024 * 1024) throw new Error('PDF ist zu groß (max. ca. 25 MB).');

    onStatus('PDF wird vorbereitet …');
    const b64 = await this._toBase64(file);

    onStatus('Claude liest das Dokument … (kann bei Scans eine Weile dauern)');
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { format: { type: 'json_schema', schema: this.SCHEMA } },
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text: this.PROMPT },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => null);
      const msg = err && err.error && err.error.message ? err.error.message : 'HTTP ' + resp.status;
      if (resp.status === 401) throw new Error('API-Schlüssel ungültig. Bitte prüfen.');
      throw new Error(msg);
    }

    const data = await resp.json();
    if (data.stop_reason === 'refusal') throw new Error('Claude hat die Auswertung abgelehnt.');
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) throw new Error('Keine Antwort erhalten.');
    const result = JSON.parse(textBlock.text);
    result.usage = data.usage;
    return result;
  },

  /* Grobe Kostenschätzung fürs Protokoll (Opus 4.8: $5 / $25 pro Mio. Token) */
  costText(usage) {
    if (!usage) return '';
    const usd = (usage.input_tokens || 0) * 5e-6 + (usage.output_tokens || 0) * 25e-6;
    return `(~${usd < 0.01 ? '<0,01' : usd.toFixed(2).replace('.', ',')} $)`;
  },

  _toBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
      r.readAsDataURL(file);
    });
  },
};
