import { useRouter } from 'expo-router';
import BatteryCharging from 'lucide-react-native/icons/battery-charging';
import Car from 'lucide-react-native/icons/car';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import Clock3 from 'lucide-react-native/icons/clock-3';
import Leaf from 'lucide-react-native/icons/leaf';
import Plus from 'lucide-react-native/icons/plus';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Zap from 'lucide-react-native/icons/zap';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/packages/auth/provider';
import {
  listChargingRecords,
  listVehicles,
  type ServerChargingRecord,
  type ServerVehicle,
} from '@/packages/server/api';

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

export default function RecordScreen() {
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [vehicles, setVehicles] = useState<ServerVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [records, setRecords] = useState<ServerChargingRecord[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [error, setError] = useState('');
  const recordRequestId = useRef(0);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId),
    [selectedVehicleId, vehicles],
  );

  const loadVehicles = useCallback(async () => {
    if (!sessionToken) return;
    setLoadingVehicles(true);
    setError('');
    try {
      const items = await listVehicles(sessionToken);
      setVehicles(items);
      setSelectedVehicleId((current) =>
        items.some((vehicle) => vehicle.id === current) ? current : (items[0]?.id ?? ''),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load your vehicles.');
    } finally {
      setLoadingVehicles(false);
    }
  }, [sessionToken]);

  const loadRecords = useCallback(async () => {
    const requestId = ++recordRequestId.current;
    if (!sessionToken || !selectedVehicleId) {
      setRecords([]);
      return;
    }
    setLoadingRecords(true);
    setError('');
    try {
      const items = await listChargingRecords(sessionToken, {
        vehicleId: selectedVehicleId,
        limit: 200,
      });
      if (requestId === recordRequestId.current) setRecords(items);
    } catch (cause) {
      if (requestId === recordRequestId.current) {
        setRecords([]);
        setError(cause instanceof Error ? cause.message : 'Unable to load charging records.');
      }
    } finally {
      if (requestId === recordRequestId.current) setLoadingRecords(false);
    }
  }, [selectedVehicleId, sessionToken]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const totals = useMemo(
    () =>
      records.reduce(
        (total, record) => ({
          energyKwh: total.energyKwh + (record.gridEnergyKwh ?? record.batteryEnergyKwh),
          savingsGco2: total.savingsGco2 + Math.max(0, record.carbonSavingsGco2),
        }),
        { energyKwh: 0, savingsGco2: 0 },
      ),
    [records],
  );

  const groupedRecords = useMemo(() => groupRecords(records), [records]);
  const loading = loadingVehicles || loadingRecords;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="홈으로 돌아가기"
            onPress={() => router.back()}
            hitSlop={3}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <ChevronLeft size={22} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>Charging record</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.eyebrow}>RECORD</Text>
          <Text style={styles.title}>Every charge, in one place.</Text>
          <Text style={styles.subtitle}>
            Review energy use and carbon savings for each vehicle.
          </Text>

          {!loadingVehicles && vehicles.length > 0 && (
            <ScrollView
              horizontal
              contentContainerStyle={styles.vehicleList}
              showsHorizontalScrollIndicator={false}
            >
              {vehicles.map((vehicle) => {
                const selected = vehicle.id === selectedVehicleId;
                return (
                  <Pressable
                    key={vehicle.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      if (vehicle.id === selectedVehicleId) return;
                      recordRequestId.current += 1;
                      setRecords([]);
                      setError('');
                      setLoadingRecords(true);
                      setSelectedVehicleId(vehicle.id);
                    }}
                    style={({ pressed }) => [
                      styles.vehiclePill,
                      selected && styles.vehiclePillSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[styles.vehiclePillIcon, selected && styles.vehiclePillIconSelected]}
                    >
                      <Car
                        size={17}
                        color={selected ? colors.primary : colors.muted}
                        strokeWidth={2}
                      />
                    </View>
                    <View>
                      <Text
                        style={[styles.vehiclePillName, selected && styles.vehiclePillNameSelected]}
                      >
                        {vehicle.displayName}
                      </Text>
                      <Text style={styles.vehiclePillMeta}>{vehicle.batteryCapacityKwh} kWh</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {selectedVehicle && !loadingRecords && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeading}>
                <View>
                  <Text style={styles.summaryEyebrow}>VEHICLE OVERVIEW</Text>
                  <Text style={styles.summaryVehicle}>{selectedVehicle.displayName}</Text>
                </View>
                <View style={styles.summaryCarIcon}>
                  <Car size={20} color={colors.primary} strokeWidth={2} />
                </View>
              </View>
              <View style={styles.metrics}>
                <SummaryMetric label="SESSIONS" value={String(records.length)} />
                <View style={styles.metricDivider} />
                <SummaryMetric label="ENERGY" value={`${formatNumber(totals.energyKwh)} kWh`} />
                <View style={styles.metricDivider} />
                <SummaryMetric label="CO₂ SAVED" value={formatCarbon(totals.savingsGco2)} success />
              </View>
            </View>
          )}

          {loading ? (
            <View style={styles.stateCard}>
              <BatteryCharging size={28} color={colors.primary} strokeWidth={1.8} />
              <Text style={styles.stateTitle}>Loading charging records…</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <RefreshCw size={28} color={colors.danger} strokeWidth={1.8} />
              <Text style={styles.stateTitle}>Records unavailable</Text>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable
                onPress={() => void (selectedVehicleId ? loadRecords() : loadVehicles())}
                style={styles.stateButton}
              >
                <Text style={styles.stateButtonText}>Try again</Text>
              </Pressable>
            </View>
          ) : vehicles.length === 0 ? (
            <View style={styles.stateCard}>
              <View style={styles.emptyIcon}>
                <Plus size={28} color={colors.primary} strokeWidth={2} />
              </View>
              <Text style={styles.stateTitle}>Add your first vehicle</Text>
              <Text style={styles.stateText}>
                A vehicle is needed before charging records can be tracked.
              </Text>
              <Pressable onPress={() => router.push('/vehicles')} style={styles.stateButton}>
                <Text style={styles.stateButtonText}>Add a vehicle</Text>
              </Pressable>
            </View>
          ) : records.length === 0 ? (
            <View style={styles.stateCard}>
              <BatteryCharging size={30} color={colors.muted} strokeWidth={1.7} />
              <Text style={styles.stateTitle}>No charging records yet</Text>
              <Text style={styles.stateText}>
                Completed charges for {selectedVehicle?.displayName} will appear here.
              </Text>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/charge', params: { vehicleId: selectedVehicleId } })
                }
                style={styles.stateButton}
              >
                <Text style={styles.stateButtonText}>Start charging</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.timeline}>
              {groupedRecords.map((group) => (
                <View key={group.label}>
                  <Text style={styles.monthLabel}>{group.label}</Text>
                  <View style={styles.recordList}>
                    {group.records.map((record) => (
                      <RecordCard key={record.id} record={record} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function SummaryMetric({
  label,
  value,
  success = false,
}: {
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, success && styles.successText]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RecordCard({ record }: { record: ServerChargingRecord }) {
  const startedAt = new Date(record.startedAt);
  const energy = record.gridEnergyKwh ?? record.batteryEnergyKwh;
  return (
    <View style={styles.recordCard}>
      <View style={styles.recordTopRow}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateDay}>{startedAt.getDate()}</Text>
          <Text style={styles.dateWeekday}>
            {startedAt.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
          </Text>
        </View>
        <View style={styles.recordHeading}>
          <Text style={styles.recordTitle}>Charge completed</Text>
          <View style={styles.recordTimeRow}>
            <Clock3 size={13} color={colors.muted} strokeWidth={2} />
            <Text style={styles.recordTime}>
              {formatTime(startedAt)} – {formatTime(new Date(record.endedAt))} ·{' '}
              {formatDuration(record.startedAt, record.endedAt)}
            </Text>
          </View>
        </View>
        <View style={styles.completedDot} />
      </View>

      <View style={styles.batteryProgressHeading}>
        <Text style={styles.batteryLabel}>BATTERY</Text>
        <Text style={styles.batteryValue}>
          {Math.round(record.startBatteryPercent)}% → {Math.round(record.endBatteryPercent)}%
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.max(2, Math.min(100, record.endBatteryPercent))}%` },
          ]}
        />
      </View>

      <View style={styles.recordMetrics}>
        <View style={styles.recordMetric}>
          <Zap size={15} color={colors.primary} strokeWidth={2} />
          <Text style={styles.recordMetricValue}>{formatNumber(energy)} kWh</Text>
          <Text style={styles.recordMetricLabel}>Energy</Text>
        </View>
        <View style={styles.recordMetricDivider} />
        <View style={styles.recordMetric}>
          <Leaf size={15} color={colors.success} strokeWidth={2} />
          <Text style={[styles.recordMetricValue, styles.successText]}>
            {formatCarbon(record.carbonSavingsGco2)}
          </Text>
          <Text style={styles.recordMetricLabel}>CO₂ saved</Text>
        </View>
      </View>
    </View>
  );
}

function groupRecords(records: ServerChargingRecord[]) {
  const groups = new Map<string, ServerChargingRecord[]>();
  for (const record of records) {
    const label = new Date(record.startedAt).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    groups.set(label, [...(groups.get(label) ?? []), record]);
  }
  return Array.from(groups, ([label, items]) => ({ label, records: items }));
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatCarbon(valueGco2: number) {
  return valueGco2 >= 1000 ? `${formatNumber(valueGco2 / 1000)} kg` : `${Math.round(valueGco2)} g`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(start: string, end: string) {
  const minutes = Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
  );
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
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
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  headerSpacer: { width: 48 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 48 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 37,
    letterSpacing: -0.8,
    fontWeight: '700',
    marginTop: 9,
  },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 10 },
  vehicleList: { gap: 10, paddingTop: 25, paddingBottom: 21 },
  vehiclePill: {
    minWidth: 170,
    padding: 12,
    paddingRight: 18,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehiclePillSelected: { backgroundColor: colors.elevated, borderColor: 'rgba(114,213,255,0.38)' },
  vehiclePillIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  vehiclePillIconSelected: { backgroundColor: 'rgba(114,213,255,0.1)' },
  vehiclePillName: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  vehiclePillNameSelected: { color: colors.text },
  vehiclePillMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
  summaryCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryEyebrow: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  summaryVehicle: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 5 },
  summaryCarIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(114,213,255,0.09)',
  },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 19,
    paddingTop: 17,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  metric: { flex: 1 },
  metricValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  metricLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 5,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 35,
    backgroundColor: colors.border,
    marginHorizontal: 10,
  },
  successText: { color: colors.success },
  stateCard: {
    marginTop: 24,
    minHeight: 240,
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(114,213,255,0.09)',
  },
  stateTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  stateText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
    textAlign: 'center',
    maxWidth: 280,
  },
  stateButton: {
    marginTop: 20,
    minHeight: 44,
    paddingHorizontal: 21,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  stateButtonText: { color: colors.background, fontSize: 13, fontWeight: '800' },
  timeline: { gap: 25, marginTop: 27 },
  monthLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  recordList: { gap: 10 },
  recordCard: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recordTopRow: { flexDirection: 'row', alignItems: 'center' },
  dateBadge: {
    width: 47,
    height: 51,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
  },
  dateDay: { color: colors.text, fontSize: 18, lineHeight: 20, fontWeight: '700' },
  dateWeekday: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginTop: 3,
  },
  recordHeading: { flex: 1, marginLeft: 12 },
  recordTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  recordTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  recordTime: { flexShrink: 1, color: colors.muted, fontSize: 10 },
  completedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginLeft: 8,
  },
  batteryProgressHeading: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 17 },
  batteryLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  batteryValue: { color: colors.text, fontSize: 11, fontWeight: '700' },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.elevated,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  recordMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 17,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  recordMetric: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordMetricValue: { color: colors.text, fontSize: 12, fontWeight: '700' },
  recordMetricLabel: { color: colors.muted, fontSize: 9 },
  recordMetricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  pressed: { opacity: 0.68 },
});
