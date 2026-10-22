// Cloudflare Worker: holt das iCal-Abo vom Schulmanager für das school-tool.
//
// Der Browser darf die .ics-Adresse nicht direkt abrufen (CORS). Dieser Worker
// holt sie stellvertretend und gibt sie mit passenden Kopfzeilen zurück.
//
// Die Abo-Adresse kommt als Text im POST-Rumpf, nicht in der URL, damit sie in
// keinem Protokoll landet. Der Worker speichert nichts und holt nur Adressen
// vom Schulmanager, damit ihn niemand als allgemeinen Vermittler missbraucht.

const ERLAUBTE_HERKUNFT = [
  'https://greenboy87.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const ERLAUBTER_HOST = /(^|\.)schulmanager-online\.de$/;

function kopf(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}

function antwort(text, status, origin, typ = 'text/plain; charset=utf-8') {
  return new Response(text, { status, headers: { ...kopf(origin), 'Content-Type': typ } });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (!ERLAUBTE_HERKUNFT.includes(origin)) {
      return new Response('Herkunft nicht erlaubt', { status: 403 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: kopf(origin) });
    }
    if (request.method !== 'POST') {
      return antwort('Nur POST', 405, origin);
    }

    let ziel;
    try {
      ziel = new URL((await request.text()).trim().replace(/^webcal:/i, 'https:'));
    } catch {
      return antwort('Keine gültige Adresse', 400, origin);
    }
    if (ziel.protocol !== 'https:' || !ERLAUBTER_HOST.test(ziel.hostname)) {
      return antwort('Nur Schulmanager-Adressen', 400, origin);
    }

    const r = await fetch(ziel.toString(), {
      headers: { 'Accept': 'text/calendar' },
      cf: { cacheTtl: 0 },
    });
    if (!r.ok) {
      return antwort('Schulmanager antwortet mit ' + r.status, 502, origin);
    }
    return antwort(await r.text(), 200, origin, 'text/calendar; charset=utf-8');
  },
};
