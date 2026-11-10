import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB1riEVI0Rw6oeK0Zvio0VqMHq8dIMrPlY",
  authDomain: "pujaporikroma-70fd8.firebaseapp.com",
  projectId: "pujaporikroma-70fd8",
  storageBucket: "pujaporikroma-70fd8.firebasestorage.app",
  messagingSenderId: "591515003233",
  appId: "1:591515003233:web:44c60a7972bc7af21d7d20"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
export const db = getFirestore(app);
export default app;
