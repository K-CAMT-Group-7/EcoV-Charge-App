import { useRouter } from 'expo-router';
import BatteryCharging from 'lucide-react-native/icons/battery-charging';
import Check from 'lucide-react-native/icons/check';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import Plus from 'lucide-react-native/icons/plus';
import Truck from 'lucide-react-native/icons/truck';
import { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/packages/auth/provider';
import {
  createVehicle,
  listVehicles,
  ServerApiError,
  type ServerVehicle,
} from '@/packages/server/api';
import { teslaVehicleCatalog, toCreateVehicle, type VehicleCatalogItem } from '@/packages/vehicles';

const catalogImages = {
  'tesla-model-3': require('@/assets/images/vehicles/model-3.avif'),
  'tesla-model-y': require('@/assets/images/vehicles/model-y.avif'),
  'tesla-cybertruck': require('@/assets/images/vehicles/cybertruck.avif'),
} as const;

const colors = {
  background: '#07111F',
  surface: '#0D1B2D',
  elevated: '#132238',
  primary: '#72D5FF',
  success: '#76E6AC',
  danger: '#FF9A86',
  text: '#F7FAFF',
  muted: '#8796AA',
  border: 'rgba(255,255,255,0.08)',
} as const;

export default function VehiclesScreen() {
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [vehicles, setVehicles] = useState<ServerVehicle[]>([]);
  const [selected, setSelected] = useState<VehicleCatalogItem>(teslaVehicleCatalog[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshVehicles = useCallback(async () => {
    if (!sessionToken) return;
    const result = await listVehicles(sessionToken);
    setVehicles(result);
  }, [sessionToken]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!sessionToken) return;
        const result = await listVehicles(sessionToken);
        if (active) setVehicles(result);
      } catch (cause) {
        if (active) setError(getErrorMessage(cause));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [sessionToken]);

  async function addSelectedVehicle() {
    if (!sessionToken || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await createVehicle(sessionToken, toCreateVehicle(selected));
      await refreshVehicles();
      setMessage(`${selected.displayName} has been added to your account.`);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="홈으로 돌아가기"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>My vehicles</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.eyebrow}>MY VEHICLES</Text>
          <Text style={styles.title}>Choose your Tesla.</Text>
          <Text style={styles.subtitle}>
            Select a representative model specification and add it to your account.
          </Text>

          <Text style={styles.sectionTitle}>Tesla catalog</Text>
          <View style={styles.catalogGrid}>
            {teslaVehicleCatalog.map((item) => {
              const isSelected = item.catalogId === selected.catalogId;
              return (
                <Pressable
                  key={item.catalogId}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => {
                    setSelected(item);
                    setMessage(null);
                  }}
                  style={({ pressed }) => [
                    styles.catalogCard,
                    isSelected && styles.catalogCardSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.catalogCopy}>
                    <View style={styles.catalogHeader}>
                      <View style={[styles.modelMark, isSelected && styles.modelMarkSelected]}>
                        {item.catalogId === 'tesla-cybertruck' ? (
                          <Truck
                            size={18}
                            color={isSelected ? colors.primary : colors.muted}
                            strokeWidth={2.2}
                          />
                        ) : (
                          <Text
                            style={[
                              styles.modelMarkText,
                              isSelected && styles.modelMarkTextSelected,
                            ]}
                          >
                            {item.model.replace('Model ', '')}
                          </Text>
                        )}
                      </View>
                      {isSelected && <Check size={18} color={colors.primary} strokeWidth={2.4} />}
                    </View>
                    <Text style={styles.catalogName}>{item.displayName}</Text>
                    <Text style={styles.catalogDescription}>{item.description}</Text>
                    <View style={styles.specRow}>
                      <Text style={styles.specValue}>{item.batteryCapacityKwh} kWh</Text>
                      <Text style={styles.specDivider}>·</Text>
                      <Text style={styles.specValue}>{item.dcFastChargingPowerKw} kW DC</Text>
                    </View>
                  </View>
                  <View style={styles.catalogImageFrame}>
                    <Image
                      accessibilityLabel={`${item.displayName} 차량 이미지`}
                      source={catalogImages[item.catalogId]}
                      resizeMode="contain"
                      style={[
                        styles.catalogImage,
                        item.catalogId === 'tesla-cybertruck' && styles.catalogImageCybertruck,
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={saving || !sessionToken}
            onPress={() => void addSelectedVehicle()}
            style={({ pressed }) => [
              styles.addButton,
              (saving || !sessionToken) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Plus size={20} color={colors.background} strokeWidth={2.4} />
            <Text style={styles.addButtonText}>
              {saving ? 'Adding vehicle…' : `Add ${selected.model}`}
            </Text>
          </Pressable>
          {message && <Text style={styles.successMessage}>{message}</Text>}
          {error && <Text style={styles.errorMessage}>{error}</Text>}

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Vehicles in your account</Text>
            <Text style={styles.count}>{vehicles.length}</Text>
          </View>
          {loading ? (
            <Text style={styles.emptyText}>Loading your vehicles…</Text>
          ) : vehicles.length ? (
            vehicles.map((vehicle) => (
              <View key={vehicle.id} style={styles.accountVehicle}>
                <View style={styles.vehicleIcon}>
                  <BatteryCharging size={20} color={colors.success} strokeWidth={2} />
                </View>
                <View style={styles.vehicleCopy}>
                  <Text style={styles.vehicleName}>{vehicle.displayName}</Text>
                  <Text style={styles.vehicleMeta}>
                    {vehicle.modelYear} · {vehicle.batteryCapacityKwh} kWh ·{' '}
                    {vehicle.connectorTypes.join(', ')}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No vehicles have been added yet.</Text>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function getErrorMessage(cause: unknown) {
  if (cause instanceof ServerApiError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return 'Unable to update your vehicles. Please try again.';
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
  iconButton: {
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
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 48 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 30, fontWeight: '700', marginTop: 9 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 30 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  catalogGrid: { gap: 10, marginTop: 13 },
  catalogCard: {
    minHeight: 150,
    padding: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catalogCardSelected: { borderColor: colors.primary, backgroundColor: colors.elevated },
  catalogCopy: { flex: 1, minWidth: 0 },
  catalogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modelMark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modelMarkSelected: { backgroundColor: 'rgba(114,213,255,0.15)' },
  modelMarkText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  modelMarkTextSelected: { color: colors.primary },
  catalogName: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 13 },
  catalogDescription: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  specRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  specValue: { color: colors.success, fontSize: 12, fontWeight: '700' },
  specDivider: { color: colors.muted },
  catalogImageFrame: {
    width: 132,
    marginVertical: 8,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  catalogImage: { flex: 1 },
  catalogImageCybertruck: { transform: [{ scale: 0.7 }] },
  addButton: {
    minHeight: 56,
    marginTop: 16,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: colors.primary,
  },
  addButtonText: { color: colors.background, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
  successMessage: { color: colors.success, fontSize: 12, lineHeight: 18, marginTop: 11 },
  errorMessage: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 11 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 34,
    marginBottom: 13,
  },
  count: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(114,213,255,0.12)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  accountVehicle: {
    minHeight: 76,
    padding: 14,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 9,
  },
  vehicleIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(118,230,172,0.1)',
  },
  vehicleCopy: { flex: 1, paddingLeft: 12 },
  vehicleName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  vehicleMeta: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
});
