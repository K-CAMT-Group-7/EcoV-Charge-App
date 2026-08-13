import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';

import {
  getMe,
  loginWithGoogle,
  logout as serverLogout,
  type ServerUser,
} from '@/packages/server/api';

const SESSION_STORAGE_KEY = 'ecov-charge-session-token';
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
const googleIOSClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();

if (Platform.OS !== 'web' && googleWebClientId) {
  GoogleSignin.configure({
    webClientId: googleWebClientId,
    iosClientId: googleIOSClientId,
    offlineAccess: false,
  });
}

interface AuthContextValue {
  user: ServerUser | null;
  sessionToken: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<ServerUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const token = await readStoredToken();
        if (!token) return;
        const restoredUser = await getMe(token);
        if (!active) return;
        setSessionToken(token);
        setUser(restoredUser);
      } catch {
        await deleteStoredToken();
      } finally {
        if (active) setLoading(false);
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === 'web') {
      throw new Error('Google 로그인은 현재 iOS 개발 빌드에서 지원됩니다.');
    }
    if (!googleWebClientId || !googleIOSClientId) {
      throw new Error('Google OAuth Client ID 환경변수가 설정되지 않았습니다.');
    }
    if (googleWebClientId === googleIOSClientId) {
      throw new Error(
        'iOS Client ID에 Web Client ID가 입력되어 있습니다. Google Cloud의 iOS 유형 Client ID로 변경하세요.',
      );
    }

    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') return;
    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error('Google에서 ID 토큰을 반환하지 않았습니다. Web Client ID를 확인하세요.');
    }

    const session = await loginWithGoogle(idToken, `${Platform.OS} app`);
    await writeStoredToken(session.token);
    setSessionToken(session.token);
    setUser(session.user);
  }, []);

  const signOut = useCallback(async () => {
    const token = sessionToken;
    setSessionToken(null);
    setUser(null);
    await deleteStoredToken();
    await Promise.allSettled([
      token ? serverLogout(token) : Promise.resolve(),
      Platform.OS === 'web' ? Promise.resolve() : GoogleSignin.signOut(),
    ]);
  }, [sessionToken]);

  const value = useMemo(
    () => ({ user, sessionToken, loading, signInWithGoogle, signOut }),
    [user, sessionToken, loading, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

function readStoredToken() {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.localStorage?.getItem(SESSION_STORAGE_KEY) ?? null);
  }
  return SecureStore.getItemAsync(SESSION_STORAGE_KEY);
}

function writeStoredToken(token: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(SESSION_STORAGE_KEY, token);
    return Promise.resolve();
  }
  return SecureStore.setItemAsync(SESSION_STORAGE_KEY, token);
}

function deleteStoredToken() {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(SESSION_STORAGE_KEY);
    return Promise.resolve();
  }
  return SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
}
