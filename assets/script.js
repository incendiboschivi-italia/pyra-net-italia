// PyraNet Italia — monitoraggio incendi
// Carica i rilevamenti satellitari statici (data/incendi-attivi.json, generati
// dalla GitHub Action) e le segnalazioni (cittadine + verificate) da Firestore.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

let db = null;
try {
  const appFirebase = initializeApp(firebaseConfig);
  db = getFirestore(appFirebase);
} catch (errore) {
  console.warn("Firebase non configurato: le segnalazioni resteranno vuote finché non viene impostato assets/firebase-config.js", errore);
}

const CONFIG = {
  center: [42.5, 12.5], // centro Italia
  zoomIniziale: 6,
};

const map = L.map("map", { zoomControl: true }).setView(CONFIG.center, CONFIG.zoomIniziale);

const stratoSatellitare = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  }
);

const stratoTopografico = L.tileLayer(
  "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  {
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  }
);

// Topografica selezionata di default: più leggibile per orientarsi sul territorio
stratoTopografico.addTo(map);

L.control.layers(
  {
    "Topografica": stratoTopografico,
    "Satellitare": stratoSatellitare,
  },
  {},
  { position: "topright", collapsed: false }
).addTo(map);

const layerFuoco = L.layerGroup().addTo(map);
const layerSegnalazioni = L.layerGroup().addTo(map); // in attesa di verifica
const layerVerificati = L.layerGroup().addTo(map);   // verificate da un coordinatore

let datiFuoco = [];
let datiSegnalazioni = [];
let datiVerificati = [];
let oreSelezionate = 48;

function formatOra(iso){
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function decimaleInDMS(valore, tipo){
  const lettera = tipo === "lat"
    ? (valore >= 0 ? "N" : "S")
    : (valore >= 0 ? "E" : "O");

  const assoluto = Math.abs(valore);
  const gradi = Math.floor(assoluto);
  const minutiDecimali = (assoluto - gradi) * 60;
  const minuti = Math.floor(minutiDecimali);
  const secondi = ((minutiDecimali - minuti) * 60).toFixed(1);

  return `${gradi}°${minuti}'${secondi}"${lettera}`;
}

function coordinateComplete(lat, lon){
  const dms = `${decimaleInDMS(lat, "lat")} ${decimaleInDMS(lon, "lon")}`;
  const decimali = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  return { dms, decimali };
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

function dataMillis(valore){
  // Le date dei rilevamenti satellitari sono stringhe ISO; quelle delle
  // segnalazioni Firestore sono Timestamp con .toDate(), oppure null se il
  // server non ha ancora confermato il timestamp.
  if (!valore) return Date.now();
  if (typeof valore === "string") return new Date(valore).getTime();
  if (valore.toDate) return valore.toDate().getTime();
  return Date.now();
}

function entroIntervallo(valoreData, ore){
  const ms = dataMillis(valoreData);
  if (isNaN(ms)) return true;
  return (Date.now() - ms) <= ore * 3600 * 1000;
}

function disegnaFuoco(){
  layerFuoco.clearLayers();
  const visibili = datiFuoco.filter(p => entroIntervallo(p.data_ora, oreSelezionate));
  visibili.forEach(p => {
    const coord = coordinateComplete(p.lat, p.lon);
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: raggioIntensita(p.frp),
      color: coloreIntensita(p.frp),
      fillColor: coloreIntensita(p.frp),
      fillOpacity: 0.55,
      weight: 1.5,
    }).bindPopup(
      `<b>Rilevamento satellitare</b><br>` +
      `Data e ora: ${formatOra(p.data_ora)}<br>` +
      `Coordinate: ${coord.dms}<br>` +
      `Coordinate (decimali): ${coord.decimali}<br>` +
      `Sensore: ${p.sensore || "n/d"}<br>` +
      `Confidenza: ${p.confidenza || "n/d"}<br>` +
      `FRP (intensità): ${p.frp !== undefined && p.frp !== null ? p.frp + " MW" : "n/d"}`
    );
    layerFuoco.addLayer(marker);
  });
  document.getElementById("count-fuoco").textContent = visibili.length;
  return visibili;
}

function disegnaSegnalazioni(){
  layerSegnalazioni.clearLayers();
  const visibili = datiSegnalazioni.filter(p => entroIntervallo(p.creato_il, oreSelezionate));
  visibili.forEach(p => {
    const coord = coordinateComplete(p.lat, p.lon);
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: 7,
      color: "#3E8E8E",
      fillColor: "#3E8E8E",
      fillOpacity: 0.5,
      weight: 1.5,
      dashArray: "2,2",
    }).bindPopup(
      `<b>Segnalazione cittadina — in attesa di verifica</b><br>` +
      `Coordinate: ${coord.dms}<br>` +
      `Coordinate (decimali): ${coord.decimali}` +
      `${p.descrizione ? "<br>Descrizione: " + p.descrizione : ""}`
    );
    layerSegnalazioni.addLayer(marker);
  });
  document.getElementById("count-segnalazioni").textContent = visibili.length;
  return visibili;
}

function disegnaVerificati(){
  layerVerificati.clearLayers();
  const visibili = datiVerificati.filter(p => entroIntervallo(p.creato_il, oreSelezionate));
  visibili.forEach(p => {
    const coord = coordinateComplete(p.lat, p.lon);
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: 8,
      color: "#4CAF50",
      fillColor: "#4CAF50",
      fillOpacity: 0.6,
      weight: 2,
    }).bindPopup(
      `<b>Incidente verificato da un coordinatore</b><br>` +
      `Coordinate: ${coord.dms}<br>` +
      `Coordinate (decimali): ${coord.decimali}` +
      `${p.descrizione ? "<br>Descrizione: " + p.descrizione : ""}` +
      `${p.verificato_da ? "<br>Verificato da: " + p.verificato_da : ""}`
    );
    layerVerificati.addLayer(marker);
  });
  return visibili;
}

function aggiornaLog(){
  const log = document.getElementById("event-log");
  const eventi = [
    ...datiFuoco.map(p => ({ tipo: "fuoco", quando: p.data_ora, frp: p.frp })),
    ...datiSegnalazioni.map(p => ({ tipo: "segnalazione", quando: p.creato_il })),
    ...datiVerificati.map(p => ({ tipo: "verificato", quando: p.creato_il })),
  ]
    .filter(e => entroIntervallo(e.quando, oreSelezionate))
    .sort((a, b) => dataMillis(b.quando) - dataMillis(a.quando))
    .slice(0, 40);

  if (eventi.length === 0){
    log.innerHTML = '<p class="log-empty">Nessun evento nell\'intervallo selezionato.</p>';
    return;
  }

  const etichetta = { fuoco: "Rilevamento satellitare", segnalazione: "Segnalazione in attesa", verificato: "Incidente verificato" };

  log.innerHTML = eventi.map(e => `
    <div class="log-entry ${e.tipo !== "fuoco" ? "segnalazione" : ""}">
      <span class="log-time">${formatOra(typeof e.quando === "string" ? e.quando : (e.quando?.toDate ? e.quando.toDate().toISOString() : ""))}</span>
      ${etichetta[e.tipo]}${e.frp ? " · " + e.frp + " MW" : ""}
    </div>
  `).join("");
}

function ridisegnaTutto(){
  disegnaFuoco();
  disegnaSegnalazioni();
  disegnaVerificati();
  aggiornaLog();
}

// --- Controlli laterali ---

document.getElementById("toggle-satellite").addEventListener("change", (e) => {
  if (e.target.checked) map.addLayer(layerFuoco); else map.removeLayer(layerFuoco);
});

document.getElementById("toggle-segnalazioni").addEventListener("change", (e) => {
  if (e.target.checked) map.addLayer(layerSegnalazioni); else map.removeLayer(layerSegnalazioni);
});

document.getElementById("toggle-verificati").addEventListener("change", (e) => {
  if (e.target.checked) map.addLayer(layerVerificati); else map.removeLayer(layerVerificati);
});

document.querySelectorAll(".range-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    oreSelezionate = parseInt(btn.dataset.hours, 10);
    ridisegnaTutto();
  });
});

// --- Modulo di segnalazione cittadina ---

const modale = document.getElementById("modale-segnalazione");
document.getElementById("chiudi-modale-segnalazione").addEventListener("click", () => { modale.hidden = true; });
modale.addEventListener("click", (e) => { if (e.target === modale) modale.hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") modale.hidden = true; });

// --- Selezione del punto direttamente sulla mappa ---

const btnSegnalaSidebar = document.getElementById("btn-apri-segnalazione");
const testoOriginaleBtnSidebar = btnSegnalaSidebar.textContent;
let markerSelezioneTemp = null;
let inModalitaSelezione = false;

function avviaSelezionePunto(){
  modale.hidden = true;
  inModalitaSelezione = true;
  document.getElementById("map").style.cursor = "crosshair";
  btnSegnalaSidebar.textContent = "📍 Clicca sulla mappa nel punto dell'incendio (Annulla)";
  btnSegnalaSidebar.classList.add("btn-selezione-attiva");
}

function terminaSelezionePunto(){
  inModalitaSelezione = false;
  document.getElementById("map").style.cursor = "";
  btnSegnalaSidebar.textContent = testoOriginaleBtnSidebar;
  btnSegnalaSidebar.classList.remove("btn-selezione-attiva");
}

document.getElementById("btn-scegli-su-mappa").addEventListener("click", avviaSelezionePunto);

// Mentre la selezione è attiva, ricliccare questo stesso pulsante annulla
// invece di riaprire il modulo (il modulo è già chiuso in quel momento).
btnSegnalaSidebar.addEventListener("click", () => {
  if (inModalitaSelezione) {
    terminaSelezionePunto();
    modale.hidden = false;
  } else {
    modale.hidden = false;
  }
});

map.on("click", (e) => {
  if (!inModalitaSelezione) return;

  document.getElementById("segnalazione-lat").value = e.latlng.lat.toFixed(5);
  document.getElementById("segnalazione-lon").value = e.latlng.lng.toFixed(5);

  if (markerSelezioneTemp) map.removeLayer(markerSelezioneTemp);
  markerSelezioneTemp = L.marker(e.latlng, { draggable: true }).addTo(map);
  markerSelezioneTemp.on("dragend", () => {
    const pos = markerSelezioneTemp.getLatLng();
    document.getElementById("segnalazione-lat").value = pos.lat.toFixed(5);
    document.getElementById("segnalazione-lon").value = pos.lng.toFixed(5);
  });

  terminaSelezionePunto();
  modale.hidden = false;
});

document.getElementById("btn-usa-posizione").addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Il tuo browser non supporta la geolocalizzazione. Inserisci le coordinate a mano.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      document.getElementById("segnalazione-lat").value = pos.coords.latitude.toFixed(5);
      document.getElementById("segnalazione-lon").value = pos.coords.longitude.toFixed(5);
    },
    () => alert("Non è stato possibile ottenere la tua posizione. Inserisci le coordinate a mano.")
  );
});

document.getElementById("form-segnalazione-cittadino").addEventListener("submit", async (e) => {
  e.preventDefault();
  const messaggio = document.getElementById("messaggio-segnalazione-cittadino");
  messaggio.hidden = true;

  const lat = parseFloat(document.getElementById("segnalazione-lat").value);
  const lon = parseFloat(document.getElementById("segnalazione-lon").value);
  const descrizione = document.getElementById("segnalazione-descrizione").value.trim();

  if (!db) {
    messaggio.textContent = "Il sistema di segnalazione non è al momento disponibile.";
    messaggio.hidden = false;
    return;
  }

  try {
    await addDoc(collection(db, "segnalazioni"), {
      lat, lon, descrizione,
      stato: "in_attesa",
      creato_il: serverTimestamp(),
    });
    e.target.reset();
    modale.hidden = true;
    if (markerSelezioneTemp) { map.removeLayer(markerSelezioneTemp); markerSelezioneTemp = null; }
    caricaSegnalazioni();
  } catch (errore) {
    console.error(errore);
    messaggio.textContent = "Errore nell'invio. Riprova.";
    messaggio.hidden = false;
  }
});

// --- Caricamento dati ---

async function caricaSegnalazioni(){
  if (!db) return;
  try {
    const istantanea = await getDocs(collection(db, "segnalazioni"));
    datiSegnalazioni = [];
    datiVerificati = [];
    istantanea.forEach(documento => {
      const dati = documento.data();
      if (dati.stato === "verificata") datiVerificati.push(dati);
      else if (dati.stato === "in_attesa") datiSegnalazioni.push(dati);
      // le "rifiutate" non vengono mostrate sulla mappa pubblica
    });
    disegnaSegnalazioni();
    disegnaVerificati();
    aggiornaLog();
  } catch (errore) {
    console.warn("Impossibile caricare le segnalazioni:", errore);
  }
}

async function caricaDati(){
  document.getElementById("system-status").textContent = "caricamento dati…";
  try {
    const risFuoco = await fetch("data/incendi-attivi.json", { cache: "no-store" }).then(r => r.json());

    datiFuoco = risFuoco.rilevamenti || risFuoco;

    const timestamp = risFuoco.aggiornato_il || new Date().toISOString();
    document.getElementById("last-update").textContent = formatOra(timestamp);
    document.getElementById("system-status").textContent = "attivo";

    ridisegnaTutto();
  } catch (err){
    console.error("Errore nel caricamento dei dati:", err);
    document.getElementById("system-status").textContent = "dati non disponibili";
  }
}

caricaDati();
caricaSegnalazioni();
// Ricontrolla i dati ogni 15 minuti (i dati satellitari si aggiornano ogni poche ore via GitHub Action)
setInterval(caricaDati, 15 * 60 * 1000);
setInterval(caricaSegnalazioni, 5 * 60 * 1000);
