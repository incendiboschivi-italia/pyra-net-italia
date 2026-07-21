// Modulo condiviso: determina regione e provincia italiana a partire da
// latitudine/longitudine, usando il servizio gratuito Nominatim (OpenStreetMap).
// Usato sia dal modulo di segnalazione pubblico (script.js) che dall'area
// riservata (area-riservata.html), per evitare di duplicare questa logica.

// Le 3 macro-aree interregionali, con l'elenco ESATTO delle regioni di ciascuna.
// Usato sia qui che (duplicato, perché le regole di sicurezza non possono
// importare file JS) in firestore.rules — se cambi questa lista, aggiorna
// anche firestore.rules.
export const REGIONI_PER_AREA = {
  "Nord": ["Piemonte", "Valle d'Aosta", "Lombardia", "Trentino-Alto Adige", "Veneto", "Friuli-Venezia Giulia", "Liguria", "Emilia-Romagna"],
  "Centro": ["Toscana", "Umbria", "Marche", "Lazio"],
  "Sud": ["Abruzzo", "Molise", "Campania", "Puglia", "Basilicata", "Calabria", "Sicilia", "Sardegna"],
};

// Nominatim a volte restituisce il nome bilingue o con grafie diverse da
// quella ufficiale usata nel sito. Normalizziamo ai 20 nomi ufficiali.
const ALIAS_REGIONE = [
  ["valle d'aosta", "Valle d'Aosta"],
  ["vallée d'aoste", "Valle d'Aosta"],
  ["trentino-alto adige", "Trentino-Alto Adige"],
  ["trentino alto adige", "Trentino-Alto Adige"],
  ["südtirol", "Trentino-Alto Adige"],
  ["friuli venezia giulia", "Friuli-Venezia Giulia"],
  ["friuli-venezia giulia", "Friuli-Venezia Giulia"],
  ["emilia-romagna", "Emilia-Romagna"],
  ["emilia romagna", "Emilia-Romagna"],
];

function normalizzaRegione(grezza){
  if (!grezza) return null;
  const bassa = grezza.toLowerCase().trim();
  for (const [chiave, nomeUfficiale] of ALIAS_REGIONE){
    if (bassa.includes(chiave)) return nomeUfficiale;
  }
  // Se il nome grezzo corrisponde già esattamente a uno dei 20 ufficiali, va bene così.
  const tutteRegioni = Object.values(REGIONI_PER_AREA).flat();
  const trovata = tutteRegioni.find(r => r.toLowerCase() === bassa);
  return trovata || grezza.trim();
}

function normalizzaProvincia(grezza){
  if (!grezza) return null;
  return grezza
    .replace(/^Provincia di /i, "")
    .replace(/^Città Metropolitana di /i, "")
    .replace(/^Libero [Cc]onsorzio [Cc]omunale di /i, "")
    .trim();
}

// Determina macro-area (Nord/Centro/Sud) a partire dal nome ufficiale di regione.
export function areaInterregionaleDellaRegione(regione){
  for (const [area, elenco] of Object.entries(REGIONI_PER_AREA)){
    if (elenco.includes(regione)) return area;
  }
  return null;
}

// Interroga Nominatim (OpenStreetMap) e restituisce { regione, provincia }.
// In caso di errore di rete restituisce { regione: null, provincia: null }
// (la segnalazione può comunque essere inviata: verrà gestita come "non
// classificata", visibile solo ai coordinatori Interregionali finché un
// coordinatore non la corregge a mano).
export async function determinaZona(lat, lon){
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=it&zoom=8`;
    const risposta = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!risposta.ok) throw new Error("Nominatim ha risposto con errore " + risposta.status);
    const dati = await risposta.json();
    const indirizzo = dati.address || {};

    const regione = normalizzaRegione(indirizzo.state);
    const provincia = normalizzaProvincia(indirizzo.county || indirizzo.state_district || indirizzo.province);

    return { regione, provincia };
  } catch (errore) {
    console.warn("Impossibile determinare regione/provincia automaticamente:", errore);
    return { regione: null, provincia: null };
  }
}
