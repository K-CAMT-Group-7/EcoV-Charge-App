import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import Leaf from 'lucide-react-native/icons/leaf';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoogleSignInButton as WebGoogleSignInButton } from '@/packages/auth/google-signin-button.web';
import { useAuth } from '@/packages/auth/provider';

const colors = {
  background: '#07111F',
  surface: '#0D1B2D',
  primary: '#72D5FF',
  success: '#76E6AC',
  text: '#F7FAFF',
  muted: '#8796AA',
  border: 'rgba(255,255,255,0.08)',
  danger: '#FF9A92',
} as const;

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn(idToken?: string) {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle(idToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Google 로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Leaf size={34} color={colors.success} strokeWidth={1.8} />
          </View>
          <Text style={styles.title}>EcoV Charge</Text>
          <Text style={styles.subtitle}>
            탄소 집약도가 낮은 시간에 충전하고 차량과 충전 이력을 안전하게 관리하세요.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>계속하려면 로그인하세요</Text>
          <Text style={styles.cardDescription}>
            Google 계정은 본인 확인에만 사용하며 차량과 충전 기록은 EcoV Charge 서버에 저장됩니다.
          </Text>

          {Platform.OS === 'web' ? (
            <WebGoogleSignInButton
              disabled={submitting}
              onCredential={handleGoogleSignIn}
              onError={(cause) => setError(cause.message)}
            />
          ) : submitting ? (
            <View style={styles.loadingButton}>
              <ActivityIndicator color={colors.background} />
              <Text style={styles.loadingText}>Google에 연결 중…</Text>
            </View>
          ) : (
            <GoogleSigninButton
              size={GoogleSigninButton.Size.Wide}
              color={GoogleSigninButton.Color.Light}
              onPress={() => void handleGoogleSignIn()}
              style={styles.googleButton}
            />
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <Text style={styles.footer}>
          로그인하면 서비스 이용 및 개인정보 처리방침에 동의하게 됩니다.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: colors.background,
  },
  brand: { alignItems: 'center', marginBottom: 38 },
  logo: {
    width: 78,
    height: 78,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(118,230,172,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(118,230,172,0.24)',
  },
  title: { marginTop: 20, color: colors.text, fontSize: 30, fontWeight: '800' },
  subtitle: {
    maxWidth: 360,
    marginTop: 11,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  card: {
    padding: 22,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  cardDescription: { marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 19 },
  googleButton: { width: '100%', height: 54, marginTop: 22 },
  loadingButton: {
    height: 54,
    marginTop: 22,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  loadingText: { color: colors.background, fontSize: 14, fontWeight: '700' },
  error: { marginTop: 14, color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  footer: {
    marginTop: 24,
    paddingHorizontal: 12,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});
