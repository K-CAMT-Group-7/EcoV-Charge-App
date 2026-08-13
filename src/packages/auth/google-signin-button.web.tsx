import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityAPI {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select: boolean;
        cancel_on_tap_outside: boolean;
        ux_mode: 'popup';
      }): void;
      renderButton(
        parent: HTMLElement,
        options: {
          type: 'standard';
          theme: 'outline';
          size: 'large';
          text: 'continue_with';
          shape: 'rectangular';
          logo_alignment: 'left';
          width: number;
        },
      ): void;
      cancel(): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityAPI;
  }
}

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
let googleIdentityPromise: Promise<GoogleIdentityAPI> | undefined;

interface GoogleSignInButtonProps {
  disabled: boolean;
  onCredential: (idToken: string) => Promise<void>;
  onError: (error: Error) => void;
}

export function GoogleSignInButton({ disabled, onCredential, onError }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLElement | null>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [ready, setReady] = useState(false);

  onCredentialRef.current = onCredential;
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;

    if (!googleWebClientId) {
      onErrorRef.current(
        new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID 환경변수가 설정되지 않았습니다.'),
      );
      return;
    }

    void loadGoogleIdentity()
      .then((google) => {
        if (!active || !buttonRef.current) return;

        google.accounts.id.initialize({
          client_id: googleWebClientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          ux_mode: 'popup',
          callback: (response) => {
            if (!response.credential) {
              onErrorRef.current(new Error('Google에서 ID 토큰을 반환하지 않았습니다.'));
              return;
            }
            void onCredentialRef.current(response.credential).catch(onErrorRef.current);
          },
        });
        const measuredWidth = Math.floor(buttonRef.current.getBoundingClientRect().width);
        google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: measuredWidth > 0 ? Math.min(400, measuredWidth) : 400,
        });
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        onErrorRef.current(
          cause instanceof Error ? cause : new Error('Google 로그인을 불러오지 못했습니다.'),
        );
      });

    return () => {
      active = false;
      window.google?.accounts.id.cancel();
    };
  }, []);

  return (
    <View
      style={[styles.container, disabled && styles.disabled]}
      pointerEvents={disabled ? 'none' : 'auto'}
    >
      {!ready && <ActivityIndicator color="#72D5FF" style={styles.loader} />}
      <View
        ref={(element) => {
          buttonRef.current = element as unknown as HTMLElement | null;
        }}
        style={styles.button}
      />
      {disabled && <Text style={styles.progress}>Google에 연결 중…</Text>}
    </View>
  );
}

function loadGoogleIdentity(): Promise<GoogleIdentityAPI> {
  if (window.google) return Promise.resolve(window.google);
  if (googleIdentityPromise) return googleIdentityPromise;

  googleIdentityPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`,
    );
    const script = existingScript ?? document.createElement('script');

    const handleLoad = () => {
      if (window.google) resolve(window.google);
      else reject(new Error('Google 로그인 SDK가 올바르게 초기화되지 않았습니다.'));
    };
    const handleError = () => reject(new Error('Google 로그인 SDK를 불러오지 못했습니다.'));

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (!existingScript) {
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return googleIdentityPromise;
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    marginTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: { width: '100%', minHeight: 44, alignItems: 'center' },
  disabled: { opacity: 0.72 },
  loader: { position: 'absolute' },
  progress: {
    position: 'absolute',
    paddingHorizontal: 12,
    color: '#07111F',
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
