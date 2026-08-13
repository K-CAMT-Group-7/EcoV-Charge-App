import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { AuthProvider, useAuth } from '@/packages/auth/provider';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem('ecov-charge-vehicles');
    }
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor="#07111F" />
      <AuthRouter />
    </AuthProvider>
  );
}

function AuthRouter() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onLoginScreen = segments[0] === 'login';
    if (!user && !onLoginScreen) router.replace('/login');
    if (user && onLoginScreen) router.replace('/');
  }, [loading, router, segments, user]);

  if (loading) return null;
  return <Stack screenOptions={{ headerShown: false }} />;
}
