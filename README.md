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

## 4. Attiva l'area riservata per i coordinatori (gratis, con Firebase)

Il sistema di login vero (non solo una password nascosta nel codice, che non sarebbe sicura)
usa **Firebase**, il servizio gratuito di Google pensato apposta per siti statici come questo.

### 5.1 Crea il progetto Firebase

1. Vai su <https://console.firebase.google.com> e accedi con un account Google.
2. Clicca "Aggiungi progetto", dai un nome (es. "pyranet-italia") e completa la creazione.
3. Nel menu a sinistra vai su **Authentication** → scheda "Sign-in method" → attiva
   il provider **"Email/Password"**.
4. Nel menu a sinistra vai su **Firestore Database** → "Crea database" → scegli
   "Avvia in modalità produzione" → scegli una regione europea (es. `eur3`).
5. Dentro Firestore, scheda **"Regole"**: cancella tutto e incolla il contenuto del file
   `firestore.rules` che trovi in questo progetto, poi clicca "Pubblica".
6. Torna nella pagina principale del progetto → icona ingranaggio → **"Impostazioni progetto"**
   → in basso, sotto "Le tue app", clicca l'icona **`</>`** (Web) → registra l'app (basta un nome).
   Firebase ti mostrerà un blocco `firebaseConfig = {...}`: copia quei valori.
7. Incolla quei valori in `assets/firebase-config.js`, al posto delle scritte
   "INSERISCI_QUI".

### 5.2 Crea un coordinatore

Per ogni coordinatore servono **due cose**, in questo ordine:

1. **Crea l'account di accesso:** Console Firebase → Authentication → scheda "Users" →
   "Add user" → inserisci email e una password provvisoria. Copia l'**UID** che Firebase
   assegna a quell'utente (una stringa lunga di lettere/numeri).
2. **Assegna il ruolo:** Console Firebase → Firestore Database → "Avvia raccolta" →
   nome raccolta: `coordinatori` → come "ID documento" incolla l'UID copiato al punto
   precedente → aggiungi questi campi:
   - `nome` (stringa): es. "Mario Rossi"
   - `ruolo` (stringa): es. "Coordinatore Regionale"
   - `zona` (stringa): es. "Toscana" oppure "Nord" oppure "Firenze"
   - `email` (stringa): la stessa email dell'account

Senza il documento nella raccolta `coordinatori`, l'account può accedere ma vede il
messaggio "non ancora abilitato" — è il comportamento corretto e voluto.

### 5.3 Dove si accede

- I coordinatori vanno su `login.html` (link in fondo alla pagina principale).
- Dopo l'accesso vengono portati su `area-riservata.html`: lì vedono il direttorio
  di tutti i coordinatori e possono aggiungere incidenti verificati, che compaiono
  automaticamente anche sulla mappa pubblica (livello verde "Incidenti verificati").

### Nota sulla sicurezza

I file `assets/firebase-config.js` sono pubblici per progettazione — non contengono
segreti. La sicurezza vera sta nel file `firestore.rules`: è quello che decide chi può
leggere e scrivere cosa, ed è applicato dai server di Google, non aggirabile dal browser.

## 5. Attiva le foto nelle segnalazioni (Cloudinary, gratis, senza carta)

Le segnalazioni (cittadine e quelle dirette dei coordinatori) richiedono
obbligatoriamente una foto. Per ospitarle usiamo **Cloudinary**, un servizio
gratuito pensato apposta per le immagini: **nessuna carta di credito
richiesta**, 25 GB al mese gratis per sempre (Firebase Storage invece, da
febbraio 2026, richiede obbligatoriamente una carta collegata anche solo per
attivarlo — per questo abbiamo scelto Cloudinary).

1. Vai su <https://cloudinary.com> e clicca "Sign up free". Puoi registrarti
   anche solo con email, senza nessun dato di pagamento.
2. Dopo la registrazione arrivi sul "Dashboard": in alto trovi scritto
   **"Cloud name"** — copialo, ti serve tra poco.
3. Nel menu a sinistra vai su **Settings** (l'ingranaggio) → scheda
   **"Upload"** → scorri fino a **"Upload presets"** → **"Add upload preset"**.
4. Imposta:
   - **Signing Mode**: cambialo da "Signed" a **"Unsigned"** (permette al
     sito di caricare foto direttamente dal browser, senza bisogno di un
     server — esattamente come serve a noi).
   - Dai un nome al preset (es. `pyranet_segnalazioni`) e copialo.
5. Salva il preset.
6. Apri `assets/cloudinary-config.js` e sostituisci i due valori
   segnaposto con il tuo **Cloud name** e il nome del **preset** appena creato.

Da questo momento, sia i cittadini che i coordinatori dovranno allegare una
foto per poter inviare una segnalazione. Le foto vengono automaticamente
ridimensionate e compresse nel browser prima di essere caricate, per
restare ben dentro i limiti gratuiti.

## 6. Dati ufficiali (Vigili del Fuoco / Protezione Civile)

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
