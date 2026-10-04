import { localAssessments, localMockIdentity, assessmentAuthEmulator, localIdentity } from "./localAssessment";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence, connectAuthEmulator, onAuthStateChanged } from "firebase/auth";
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";

// Firebase web configuration is public. Access is enforced by Firestore rules.
const gameEmulators = import.meta.env.DEV && import.meta.env.VITE_GAME_EMULATORS === '1';
const app = initializeApp({
  apiKey: "AIzaSyAbFnza5Jm2yclov09oORwsR7C7OEb3Fng",
  authDomain: "history-discovery-center.firebaseapp.com",
  projectId: localAssessments ? "demo-rules-rewards-app" : gameEmulators ? "demo-game-sync" : "history-discovery-center",
  messagingSenderId: "453548212735",
  appId: "1:453548212735:web:2bc1b3e40fc1d9633e67ca",
});
export const auth = getAuth(app);
export const db = localAssessments ? initializeFirestore(app,{experimentalForceLongPolling:true,experimentalLongPollingOptions:{timeoutSeconds:5}}) : getFirestore(app);
if (localAssessments) {
  if(assessmentAuthEmulator)connectAuthEmulator(auth,'http://127.0.0.1:9191',{disableWarnings:true});
  connectFirestoreEmulator(db, "127.0.0.1", 8191, localMockIdentity ? {mockUserToken:{sub:localIdentity.uid,email:localIdentity.email,email_verified:true,firebase:{sign_in_provider:"google.com"}}} : undefined);
}
if (gameEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8088);
  void import('./games/emulatorControls').then(m => m.mountEmulatorControls(db));
}
export const SCHOOL_DOMAIN = "ctshkpcc.edu.hk";
export const OWNER_EMAIL = "kitlung1107@gmail.com";
// Share login across the embedded host and independently opened tabs; sign-out propagates to all tabs.
const persistenceReady = setPersistence(auth, browserLocalPersistence);
// Some embedded browsers delay storage events. A non-secret epoch invalidates
// stale page contexts; the reloaded page still authenticates through Firebase.
const epochKey = `hq-auth-epoch:${app.options.projectId}`;
let epoch = '';
try { epoch = localStorage.getItem(epochKey) || ''; } catch { /* Firebase handles unavailable persistence. */ }
let observedUid: string | null | undefined;
const stopEpoch = onAuthStateChanged(auth, user => {
  const uid = user?.uid || null;
  if (observedUid !== undefined && observedUid !== uid) {
    try { epoch = crypto.randomUUID(); localStorage.setItem(epochKey, epoch); } catch { /* No shared storage available. */ }
  }
  observedUid = uid;
});
function checkAuthEpoch() {
  try { if ((localStorage.getItem(epochKey) || '') !== epoch) window.location.reload(); } catch { /* Storage unavailable. */ }
}
const epochTimer = window.setInterval(checkAuthEpoch, 1500);
window.addEventListener('storage', checkAuthEpoch);
window.addEventListener('focus', checkAuthEpoch);
if (import.meta.hot) import.meta.hot.dispose(() => {
  stopEpoch(); clearInterval(epochTimer); window.removeEventListener('storage', checkAuthEpoch); window.removeEventListener('focus', checkAuthEpoch);
});
export async function googleLogin() {
  if(localMockIdentity){location.href="/?localRole=student";return;}
  await persistenceReady;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}
export const googleLogout = () => localMockIdentity ? Promise.resolve(location.assign("/?localRole=student")) : signOut(auth);
