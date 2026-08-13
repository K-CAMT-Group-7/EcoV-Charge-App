import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

  if (iosClientId && webClientId && iosClientId === webClientId) {
    throw new Error(
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be an iOS OAuth client ID, not the Web client ID.',
    );
  }

  const googlePlugin: NonNullable<ExpoConfig['plugins']>[number] | undefined = iosClientId
    ? [
        '@react-native-google-signin/google-signin',
        { iosUrlScheme: toGoogleIOSURLScheme(iosClientId) },
      ]
    : undefined;

  return {
    ...config,
    name: config.name ?? 'EcoV Charge',
    slug: config.slug ?? 'ecov-charge',
    plugins: [...(config.plugins ?? []), ...(googlePlugin ? [googlePlugin] : [])],
  };
};

function toGoogleIOSURLScheme(clientId: string) {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix)) {
    throw new Error('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be a Google OAuth iOS client ID.');
  }
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}
