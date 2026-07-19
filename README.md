# Sentinella — Monitoraggio incendi Italia

Sito statico, gratuito al 100%, per monitorare gli incendi in Italia usando dati satellitari
(NASA FIRMS) e segnalazioni dei cittadini. Pensato per associazioni di volontariato e cittadini.

## Come funziona (in breve)

- Il sito (`index.html`) è una pagina statica: nessun server, nessun costo.
- I dati satellitari vengono scaricati automaticamente ogni 3 ore da una **GitHub Action**
  (gratuita sui repository pubblici) e salvati in `data/incendi-attivi.json`.
- Le segnalazioni dei cittadini arrivano tramite un **Google Form** collegato a un foglio Google,
  pubblicato come JSON in `data/segnalazioni.json` (vedi sotto come collegarlo).
- Non ci sono chiavi API esposte nel sito: la chiave NASA FIRMS resta segreta dentro GitHub.

## 1. Pubblica il sito con GitHub Pages

1. Crea un nuovo repository su GitHub (es. `sentinella-incendi`) e carica tutti questi file.
2. Vai su **Settings → Pages** del repository.
3. In "Source" scegli il branch `main` e la cartella `/ (root)`.
4. Dopo qualche minuto il sito sarà online su `https://<tuo-utente>.github.io/sentinella-incendi/`.

## 2. Attiva i dati satellitari NASA FIRMS (gratis)

1. Vai su <https://firms.modaps.eosdis.nasa.gov/api/map_key/> e registra una **MAP_KEY** gratuita
   con la tua email (arriva subito via email, nessun costo).
2. Nel repository GitHub vai su **Settings → Secrets and variables → Actions**.
3. Crea un nuovo secret chiamato `FIRMS_MAP_KEY` e incolla la chiave ricevuta.
4. Vai su **Actions**, apri il workflow "Aggiorna dati incendi" e lancialo manualmente una volta
   ("Run workflow") per verificare che funzioni. Da quel momento si aggiornerà da solo ogni 3 ore.

La chiave gratuita ha un limite di 5000 richieste ogni 10 minuti: più che sufficiente per un
aggiornamento ogni 3 ore.

## 3. Attiva le segnalazioni dei cittadini (gratis, senza scrivere codice)

Il modo più semplice e affidabile senza spendere nulla:

1. Crea un **Google Form** con i campi: descrizione, e un campo "Link Google Maps" (il cittadino
   condivide la posizione da Google Maps e incolla il link — più affidabile di chiedere
   latitudine/longitudine a mano).
2. Collega il Form a un **Google Sheet** (si fa da "Risposte → Crea foglio di calcolo").
3. Pubblica il foglio come JSON usando un servizio gratuito come
   [opensheet.elk.sh](https://opensheet.elk.sh) (incolli l'ID del foglio e il nome scheda).
4. Aggiorna `CONFIG.urlSegnalazione` in `assets/script.js` con il link del tuo Google Form.

Se vuoi, nel prossimo passaggio posso scriverti anche la piccola GitHub Action che legge il
foglio Google e lo trasforma in `data/segnalazioni.json`, così tutto resta automatico come per
i dati satellitari — dimmi solo quando hai creato il Form e il foglio.

## 4. Dati ufficiali (Vigili del Fuoco / Protezione Civile)

Al momento non esiste un'API pubblica in tempo reale con la posizione esatta degli interventi
dei Vigili del Fuoco. Il sito rimanda quindi ai canali ufficiali nel footer. Il Corpo Nazionale
dei Vigili del Fuoco ha però un portale open data (opendata.vigilfuoco.it) con dataset storici:
se in futuro vuoi integrare statistiche o mappe di rischio da lì, possiamo aggiungerle come
livello informativo aggiuntivo (non in tempo reale).

## Struttura del progetto

```
index.html                          → pagina principale
assets/style.css                    → stile del sito
assets/script.js                    → logica mappa e caricamento dati
data/incendi-attivi.json            → dati satellitari (aggiornati in automatico)
data/segnalazioni.json              → segnalazioni cittadine
scripts/aggiorna_incendi.py         → script che interroga NASA FIRMS
.github/workflows/aggiorna-incendi.yml → automazione gratuita (GitHub Actions)
```

## Prossimi passi possibili

- Collegare davvero le segnalazioni cittadine (punto 3).
- Aggiungere un banner di allerta quando ci sono molti focolai vicini tra loro.
- Tradurre in inglese per un pubblico più ampio.
- Aggiungere un livello con le aree già percorse dal fuoco (dati storici regionali).
