import { FirebaseApp, initializeApp } from "firebase/app";
import { Auth, getAuth, signInWithCustomToken } from "firebase/auth";

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

async function loadFirebaseConfig() {
  const response = await fetch("/api/auth/config");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : "failed to load firebase config";
    throw new Error(message);
  }
  return body;
}

export async function getAuthInstance(): Promise<Auth> {
  if (authInstance) {
    return authInstance;
  }

  const config = await loadFirebaseConfig();
  app = initializeApp(config);
  authInstance = getAuth(app);
  return authInstance;
}

export async function signInWithBackendToken(customToken: string) {
  const auth = await getAuthInstance();
  return signInWithCustomToken(auth, customToken);
}
