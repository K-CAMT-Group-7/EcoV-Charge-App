import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/packages/auth/provider';
import { vehicleChargingStore } from '@/packages/vehicles';

void vehicleChargingStore.ready;

export default function RootLayout() {
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
