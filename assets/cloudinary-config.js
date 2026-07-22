// Configurazione di Cloudinary (servizio gratuito per ospitare le foto,
// nessuna carta di credito richiesta).
//
// Questi due valori NON sono segreti: sono pensati per stare in un file
// pubblico (esattamente come firebase-config.js). La sicurezza vera sta nel
// fatto che il "preset di caricamento" (upload preset) può essere configurato
// con limiti (dimensione massima, solo immagini) dal pannello Cloudinary.
//
// Sostituisci i valori qui sotto con quelli del TUO account Cloudinary
// (vedi README, sezione 5, per i passaggi).

export const cloudinaryConfig = {
  cloudName: "INSERISCI_QUI_IL_TUO_CLOUD_NAME",
  uploadPreset: "INSERISCI_QUI_IL_TUO_UPLOAD_PRESET",
};
