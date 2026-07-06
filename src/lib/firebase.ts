import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDInBeT_ytLjhkRv_J3rtagRXUdY4WfEds",
  authDomain: "ibellmobiles-123.firebaseapp.com",
  projectId: "ibellmobiles-123",
  storageBucket: "ibellmobiles-123.firebasestorage.app",
  messagingSenderId: "191077483403",
  appId: "1:191077483403:web:1c934544f5b7e3cbc0658e",
  measurementId: "G-3WSQ6FXD71",
};

/** Named Firestore database (not the "(default)" one) */
export const DATABASE_ID = "teligramboatiball";

export const isBrowser = typeof window !== "undefined";

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;

// The Firebase client SDK is browser-only in this app; during SSR the
// repositories return empty data (same behaviour as the old localStorage layer).
if (isBrowser) {
  app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  // Offline-first: writes queue locally and sync when internet returns,
  // reads keep working from the persistent cache — important for a shop counter.
  dbInstance = initializeFirestore(
    app,
    { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
    DATABASE_ID,
  );
}

export const auth = authInstance as Auth;
export const db = dbInstance as Firestore;
