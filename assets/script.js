// Sentinella — monitoraggio incendi Italia
// Carica dati statici generati dalla GitHub Action (data/incendi-attivi.json)
// e le segnalazioni cittadine (data/segnalazioni.json), li mostra su mappa.

const CONFIG = {
  // URL del Google Form pubblico per le segnalazioni cittadine.
  // Sostituisci con il link del tuo form quando lo crei (vedi README).
  urlSegnalazione: "#",
  center: [42.5, 12.5], // centro Italia
  zoomIniziale: 6,
};

document.getElementById("link-segnalazione").href = CONFIG.urlSegnalazione;

const map = L.map("map", { zoomControl: true }).setView(CONFIG.center, CONFIG.zoomIniziale);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 18,
}).addTo(map);

const layerFuoco = L.layerGroup().addTo(map);
const layerSegnalazioni = L.layerGroup().addTo(map);

let datiFuoco = [];
let datiSegnalazioni = [];
let oreSelezionate = 48;

function formatOra(iso){
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function coloreIntensita(frp){
  if (frp === undefined || frp === null) return "#E85A2B";
  if (frp >= 50) return "#C81E1E";
  if (frp >= 15) return "#E85A2B";
  return "#E8A23E";
}

function raggioIntensita(frp){
  if (!frp) return 6;
  return Math.min(18, 6 + frp / 8);
}

function entroIntervallo(iso, ore){
  const d = new Date(iso).getTime();
  if (isNaN(d)) return true;
  return (Date.now() - d) <= ore * 3600 * 1000;
}

function disegnaFuoco(){
  layerFuoco.clearLayers();
  const visibili = datiFuoco.filter(p => entroIntervallo(p.data_ora, oreSelezionate));
  visibili.forEach(p => {
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: raggioIntensita(p.frp),
      color: coloreIntensita(p.frp),
      fillColor: coloreIntensita(p.frp),
      fillOpacity: 0.55,
      weight: 1.5,
    }).bindPopup(
      `<b>Rilevamento satellitare</b><br>` +
      `Data: ${formatOra(p.data_ora)}<br>` +
      `Sensore: ${p.sensore || "n/d"}<br>` +
      `Confidenza: ${p.confidenza || "n/d"}<br>` +
      `FRP (intensità): ${p.frp !== undefined ? p.frp + " MW" : "n/d"}`
    );
    layerFuoco.addLayer(marker);
  });
  document.getElementById("count-fuoco").textContent = visibili.length;
  return visibili;
}

function disegnaSegnalazioni(){
  layerSegnalazioni.clearLayers();
  const visibili = datiSegnalazioni.filter(p => entroIntervallo(p.data_ora, oreSelezionate));
  visibili.forEach(p => {
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: 7,
      color: "#3E8E8E",
      fillColor: "#3E8E8E",
      fillOpacity: 0.5,
      weight: 1.5,
      dashArray: "2,2",
    }).bindPopup(
      `<b>Segnalazione cittadina (non verificata)</b><br>` +
      `Data: ${formatOra(p.data_ora)}<br>` +
      `${p.descrizione ? p.descrizione : ""}`
    );
    layerSegnalazioni.addLayer(marker);
  });
  document.getElementById("count-segnalazioni").textContent = visibili.length;
  return visibili;
}

function aggiornaLog(){
  const log = document.getElementById("event-log");
  const eventi = [
    ...datiFuoco.map(p => ({ ...p, tipo: "fuoco" })),
    ...datiSegnalazioni.map(p => ({ ...p, tipo: "segnalazione" })),
  ]
    .filter(e => entroIntervallo(e.data_ora, oreSelezionate))
    .sort((a, b) => new Date(b.data_ora) - new Date(a.data_ora))
    .slice(0, 40);

  if (eventi.length === 0){
    log.innerHTML = '<p class="log-empty">Nessun evento nell\'intervallo selezionato.</p>';
    return;
  }

  log.innerHTML = eventi.map(e => `
    <div class="log-entry ${e.tipo === "segnalazione" ? "segnalazione" : ""}">
      <span class="log-time">${formatOra(e.data_ora)}</span>
      ${e.tipo === "segnalazione" ? "Segnalazione cittadina" : `Rilevamento satellitare${e.frp ? " · " + e.frp + " MW" : ""}`}
    </div>
  `).join("");
}

function ridisegnaTutto(){
  disegnaFuoco();
  disegnaSegnalazioni();
  aggiornaLog();
}

// --- Controlli laterali ---

document.getElementById("toggle-satellite").addEventListener("change", (e) => {
  if (e.target.checked) map.addLayer(layerFuoco); else map.removeLayer(layerFuoco);
});

document.getElementById("toggle-segnalazioni").addEventListener("change", (e) => {
  if (e.target.checked) map.addLayer(layerSegnalazioni); else map.removeLayer(layerSegnalazioni);
});

document.querySelectorAll(".range-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    oreSelezionate = parseInt(btn.dataset.hours, 10);
    ridisegnaTutto();
  });
});

// --- Caricamento dati ---

async function caricaDati(){
  document.getElementById("system-status").textContent = "caricamento dati…";
  try {
    const [risFuoco, risSegnalazioni] = await Promise.allSettled([
      fetch("data/incendi-attivi.json", { cache: "no-store" }).then(r => r.json()),
      fetch("data/segnalazioni.json", { cache: "no-store" }).then(r => r.json()),
    ]);

    datiFuoco = risFuoco.status === "fulfilled" ? risFuoco.value.rilevamenti || risFuoco.value : [];
    datiSegnalazioni = risSegnalazioni.status === "fulfilled" ? risSegnalazioni.value.segnalazioni || risSegnalazioni.value : [];

    const timestamp = (risFuoco.status === "fulfilled" && risFuoco.value.aggiornato_il) || new Date().toISOString();
    document.getElementById("last-update").textContent = formatOra(timestamp);
    document.getElementById("system-status").textContent = "attivo";

    ridisegnaTutto();
  } catch (err){
    console.error("Errore nel caricamento dei dati:", err);
    document.getElementById("system-status").textContent = "dati non disponibili";
  }
}

caricaDati();
// Ricontrolla i dati ogni 15 minuti (i dati stessi si aggiornano ogni poche ore via GitHub Action)
setInterval(caricaDati, 15 * 60 * 1000);
