import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  sendSignInLinkToEmail, 
  isSignInWithEmailLink, 
  signInWithEmailLink,
  signOut,
  onAuthStateChanged 
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  serverTimestamp 
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyB1riEVI0Rw6oeK0Zvio0VqMHq8dIMrPlY",
  authDomain: "pujaporikroma-70fd8.firebaseapp.com",
  projectId: "pujaporikroma-70fd8",
  storageBucket: "pujaporikroma-70fd8.firebasestorage.app",
  messagingSenderId: "591515003233",
  appId: "1:591515003233:web:44c60a7972bc7af21d7d20"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  serverTimestamp
};
