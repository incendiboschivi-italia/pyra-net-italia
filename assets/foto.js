// Modulo condiviso: comprime una foto e la carica su Cloudinary (servizio
// gratuito di hosting immagini, nessuna carta di credito richiesta),
// restituendo il link pubblico per vederla. Usato sia dal modulo di
// segnalazione pubblico che dall'area riservata dei coordinatori.

import { cloudinaryConfig } from "./cloudinary-config.js";

const LATO_MASSIMO_PX = 1280;   // le foto vengono ridimensionate al massimo a questa larghezza/altezza
const QUALITA_JPEG = 0.72;      // 0-1: più basso = file più piccolo, più alto = migliore qualità

// Ridimensiona e comprime un'immagine nel browser, senza librerie esterne,
// usando un <canvas> nascosto. Restituisce un Blob JPEG pronto da caricare.
function comprimiImmagine(file){
  return new Promise((resolve, reject) => {
    const immagine = new Image();
    const url = URL.createObjectURL(file);

    immagine.onload = () => {
      let { width, height } = immagine;
      if (width > LATO_MASSIMO_PX || height > LATO_MASSIMO_PX) {
        if (width > height) {
          height = Math.round(height * (LATO_MASSIMO_PX / width));
          width = LATO_MASSIMO_PX;
        } else {
          width = Math.round(width * (LATO_MASSIMO_PX / height));
          height = LATO_MASSIMO_PX;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(immagine, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob); else reject(new Error("Compressione immagine fallita"));
        },
        "image/jpeg",
        QUALITA_JPEG
      );
    };

    immagine.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile leggere il file immagine"));
    };

    immagine.src = url;
  });
}

// Comprime e carica una foto su Cloudinary. Restituisce il link pubblico
// (secure_url) da salvare in Firestore.
export async function caricaFoto(file){
  if (!file) return null;
  if (!file.type.startsWith("image/")) {
    throw new Error("Il file scelto non è un'immagine.");
  }

  if (cloudinaryConfig.cloudName.startsWith("INSERISCI_QUI")) {
    throw new Error("Cloudinary non è ancora configurato (assets/cloudinary-config.js).");
  }

  const blobCompresso = await comprimiImmagine(file);

  const datiForm = new FormData();
  datiForm.append("file", blobCompresso);
  datiForm.append("upload_preset", cloudinaryConfig.uploadPreset);

  const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`;
  const risposta = await fetch(url, { method: "POST", body: datiForm });

  if (!risposta.ok) {
    const testoErrore = await risposta.text().catch(() => "");
    throw new Error("Caricamento foto fallito: " + risposta.status + " " + testoErrore);
  }

  const dati = await risposta.json();
  return dati.secure_url;
}
