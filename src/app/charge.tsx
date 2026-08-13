import { useRouter } from 'expo-router';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import Zap from 'lucide-react-native/icons/zap';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const colors = {
  background: '#07111F',
  surface: '#0D1B2D',
  surfaceElevated: '#132238',
  primary: '#72D5FF',
  success: '#76E6AC',
  text: '#F7FAFF',
  muted: '#8796AA',
  border: 'rgba(255,255,255,0.08)',
} as const;

export default function ChargeScreen() {
  const router = useRouter();
  const [started, setStarted] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="홈으로 돌아가기"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>Start charging</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.content}>
          <View style={styles.chargerVisual}>
            <View style={styles.glow} />
            <View style={styles.boltCircle}>
              <Zap size={39} color={colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={styles.readyTitle}>
              {started ? 'Charging started' : 'Ready to charge'}
            </Text>
            <Text style={styles.readyDetail}>
              {started
                ? 'Your vehicle is charging with clean energy.'
                : 'Tesla Model Y Long Range · My Home Garage'}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Current battery</Text>
              <Text style={styles.summaryValue}>72%</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Charge limit</Text>
              <Text style={styles.summaryValue}>90%</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Energy source</Text>
              <Text style={styles.cleanValue}>Solar + Grid</Text>
            </View>
          </View>

          <View style={styles.notice}>
            <View style={styles.noticeDot} />
            <Text style={styles.noticeText}>Cleanest charging window is available now.</Text>
          </View>
        </View>

        <View style={styles.bottomAction}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStarted((value) => !value)}
            style={({ pressed }) => [
              styles.startButton,
              started && styles.stopButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.startButtonText, started && styles.stopButtonText]}>
              {started ? 'Stop charging' : 'Start charging now'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 80px rgba(0,0,0,0.28)' } : {}),
  },
  header: {
    height: 68,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  headerSpacer: { width: 42 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  chargerVisual: {
    minHeight: 310,
    borderRadius: 30,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  glow: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(114,213,255,0.08)',
  },
  boltCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(114,213,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(114,213,255,0.32)',
  },
  readyTitle: { color: colors.text, fontSize: 24, fontWeight: '700', marginTop: 24 },
  readyDetail: { color: colors.muted, fontSize: 13, marginTop: 8 },
  summaryCard: {
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRow: {
    minHeight: 59,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: { color: colors.muted, fontSize: 13 },
  summaryValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  cleanValue: { color: colors.success, fontSize: 14, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  notice: {
    marginTop: 14,
    minHeight: 48,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(118,230,172,0.08)',
  },
  noticeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  noticeText: { color: colors.success, fontSize: 13, fontWeight: '600' },
  bottomAction: { padding: 20 },
  startButton: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  stopButton: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  startButtonText: { color: colors.background, fontSize: 16, fontWeight: '800' },
  stopButtonText: { color: colors.text },
  pressed: { opacity: 0.72 },
});
