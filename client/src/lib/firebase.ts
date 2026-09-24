import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase web configuration is public. Access is enforced by Firestore rules.
const app = initializeApp({
  apiKey: "AIzaSyAbFnza5Jm2yclov09oORwsR7C7OEb3Fng",
  authDomain: "history-discovery-center.firebaseapp.com",
  projectId: "history-discovery-center",
  messagingSenderId: "453548212735",
  appId: "1:453548212735:web:2bc1b3e40fc1d9633e67ca",
});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const SCHOOL_DOMAIN = "ctshkpcc.edu.hk";
export const OWNER_EMAIL = "kitlung1107@gmail.com";
const persistenceReady = setPersistence(auth, browserSessionPersistence);
export async function finishGoogleRedirect() {
  await persistenceReady;
  return getRedirectResult(auth);
}
export async function googleLoginInThisTab() {
  await persistenceReady;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithRedirect(auth, provider);
}
export async function googleLogin() {
  await persistenceReady;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}
export const googleLogout = () => signOut(auth);
