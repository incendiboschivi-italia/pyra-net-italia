// Modulo condiviso di autenticazione, usato sia da login.html che da area-riservata.html

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function accedi(email, password){
  return signInWithEmailAndPassword(auth, email, password);
}

export function esci(){
  return signOut(auth);
}

export function osservaStatoAccesso(callback){
  return onAuthStateChanged(auth, callback);
}

// Legge il profilo del coordinatore (ruolo, zona, nome) dalla collezione
// "coordinatori", dove il documento ha come ID lo stesso UID dell'account.
// Se il documento non esiste, l'account esiste ma non è ancora abilitato
// come coordinatore da nessuno.
export async function leggiProfiloCoordinatore(uid){
  const riferimento = doc(db, "coordinatori", uid);
  const istantanea = await getDoc(riferimento);
  return istantanea.exists() ? istantanea.data() : null;
}
