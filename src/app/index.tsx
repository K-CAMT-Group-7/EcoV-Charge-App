import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const colors = {
  background: '#071A12',
  card: '#10271D',
  primary: '#7BE495',
  text: '#F2FFF6',
  muted: '#A8BDB0',
} as const;

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>LOW-CARBON CHARGING</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>EcoV Charge</Text>
          <Text style={styles.title}>Charge when the grid is cleaner.</Text>
          <Text style={styles.description}>
            Set your target and departure time. We will schedule the cleanest charging window and
            make sure your EV is ready on time.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Target charge</Text>
            <Text style={styles.value}>80%</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Ready by</Text>
            <Text style={styles.value}>07:30</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Plan a clean charge</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 28,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(123, 228, 149, 0.14)',
  },
  badgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  hero: {
    gap: 12,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '800',
    lineHeight: 48,
    letterSpacing: -1.5,
  },
  description: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 26,
  },
  card: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.card,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: colors.muted,
    fontSize: 15,
  },
  value: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#365043',
  },
  button: {
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '800',
  },
});
