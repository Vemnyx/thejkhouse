import { User, onAuthStateChanged, signOut } from "firebase/auth";
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AppUser,
  SignupPayload,
  confirmSignup as confirmSignupRequest,
  getSession,
  loginUser,
  signupUser,
} from "../lib/api";
import { getAuthInstance, signInWithBackendToken } from "../lib/firebaseApp";

type AuthContextValue = {
  firebaseUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, profile: SignupPayload) => Promise<void>;
  confirmSignup: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAppUser: () => Promise<AppUser | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadAppUserFromToken(token: string): Promise<AppUser> {
  return getSession(token);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAppUser = async (user: User | null = firebaseUser) => {
    if (!user) {
      setAppUser(null);
      return null;
    }

    const token = await user.getIdToken();
    const profile = await loadAppUserFromToken(token);
    setAppUser(profile);
    return profile;
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    getAuthInstance()
      .then((auth) => {
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          setFirebaseUser(user);
          if (!user) {
            setAppUser(null);
            setLoading(false);
            return;
          }

          try {
            const token = await user.getIdToken();
            const profile = await loadAppUserFromToken(token);
            setAppUser(profile);
          } catch {
            setAppUser(null);
          } finally {
            setLoading(false);
          }
        });
      })
      .catch(() => {
        setLoading(false);
      });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      appUser,
      loading,
      login: async (email, password) => {
        const session = await loginUser(email, password);
        await signInWithBackendToken(session.customToken);
        setAppUser(session.user);
      },
      signup: async (email, password, profile) => {
        await signupUser(email, password, profile);
      },
      confirmSignup: async (token) => {
        const session = await confirmSignupRequest(token);
        await signInWithBackendToken(session.customToken);
        setAppUser(session.user);
      },
      logout: async () => {
        const auth = await getAuthInstance();
        await signOut(auth);
        setAppUser(null);
      },
      refreshAppUser: async () => refreshAppUser(),
    }),
    [firebaseUser, appUser, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
