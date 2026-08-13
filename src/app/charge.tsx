import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import BatteryCharging from 'lucide-react-native/icons/battery-charging';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import Clock3 from 'lucide-react-native/icons/clock-3';
import Leaf from 'lucide-react-native/icons/leaf';
import Zap from 'lucide-react-native/icons/zap';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/packages/auth/provider';
import { getCurrentLocation, loadSavedUserLocation } from '@/packages/location/api';
import {
  createChargingSession,
  estimateChargingSession,
  getActiveChargingSession,
  listVehicles,
  stopChargingSession,
  type ChargingEstimate,
  type ServerChargingSession,
  type ServerVehicle,
} from '@/packages/server/api';

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
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const { sessionToken } = useAuth();
  const [vehicles, setVehicles] = useState<ServerVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicleId ?? '');
  const [targetPercent, setTargetPercent] = useState(90);
  const [targetAt, setTargetAt] = useState<Date | null>(null);
  const [clockSeed, setClockSeed] = useState(() => defaultClockValue());
  const [showClock, setShowClock] = useState(false);
  const [session, setSession] = useState<ServerChargingSession | null>(null);
  const [estimate, setEstimate] = useState<ChargingEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [message, setMessage] = useState('');
  const estimateRequestId = useRef(0);
  const locationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId),
    [vehicles, selectedVehicleId],
  );
  const currentPercent = selectedVehicle?.currentBatteryPercent ?? 20;
  const minimumTarget = Math.min(100, Math.ceil(currentPercent + 1));

  useEffect(() => setTargetPercent((value) => Math.max(minimumTarget, value)), [minimumTarget]);

  const refresh = useCallback(async () => {
    if (!sessionToken || !selectedVehicleId) return;
    try {
      setSession(await getActiveChargingSession(sessionToken, selectedVehicleId));
    } catch {
      setMessage('Unable to refresh charging status.');
    }
  }, [selectedVehicleId, sessionToken]);

  const loadVehicles = useCallback(async () => {
    if (!sessionToken) return;
    const items = await listVehicles(sessionToken);
    setVehicles(items);
    const requestedVehicle = items.find((item) => item.id === vehicleId);
    if (requestedVehicle) {
      setSelectedVehicleId(requestedVehicle.id);
    } else {
      setSelectedVehicleId('');
    }
  }, [sessionToken, vehicleId]);

  useEffect(() => {
    void loadVehicles().catch(() => setMessage('Unable to load vehicles.'));
  }, [loadVehicles]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function start() {
    if (!sessionToken || !selectedVehicle || !targetAt) return;
    try {
      const location = await getChargingLocation();
      const created = await createChargingSession(sessionToken, {
        vehicleId: selectedVehicle.id,
        targetBatteryPercent: targetPercent,
        targetAt: targetAt.toISOString(),
        latitude: location.latitude,
        longitude: location.longitude,
      });
      setSession(created);
      setMessage('The five-minute carbon-aware plan is active.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start charging simulation.');
    }
  }

  async function getChargingLocation() {
    if (locationRef.current) return locationRef.current;
    const cached = await loadSavedUserLocation();
    const location = cached ?? (await getCurrentLocation());
    locationRef.current = { latitude: location.latitude, longitude: location.longitude };
    return locationRef.current;
  }

  async function calculateEstimate(percent: number, completionTime: Date) {
    if (!sessionToken || !selectedVehicle) return;
    const requestId = ++estimateRequestId.current;
    setEstimating(true);
    try {
      const location = await getChargingLocation();
      const result = await estimateChargingSession(sessionToken, {
        vehicleId: selectedVehicle.id,
        targetBatteryPercent: percent,
        targetAt: completionTime.toISOString(),
        latitude: location.latitude,
        longitude: location.longitude,
      });
      if (requestId === estimateRequestId.current) {
        setEstimate(result);
        setMessage('');
      }
    } catch (error) {
      if (requestId === estimateRequestId.current) {
        setEstimate(null);
        setMessage(error instanceof Error ? error.message : 'Unable to calculate estimate.');
      }
    } finally {
      if (requestId === estimateRequestId.current) setEstimating(false);
    }
  }

  async function stop() {
    if (!sessionToken || !session) return;
    try {
      await stopChargingSession(sessionToken, session.id);
      setSession(null);
      await loadVehicles();
      setMessage('Charging simulation stopped.');
    } catch {
      setMessage('Unable to stop charging simulation.');
    }
  }

  const shownPercent = session?.currentBatteryPercent ?? currentPercent;
  const shownTarget = session?.targetBatteryPercent ?? targetPercent;
  const shownTargetAt = session ? new Date(session.targetAt) : targetAt;
  const savings = session?.estimatedCarbonSavingsGco2 ?? estimate?.carbonSavingsGco2;
  const status = session?.status === 'charging' ? 'CHARGING' : session ? 'SMART PAUSE' : 'READY';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Smart charging</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.dashboard}>
            <View style={styles.dashboardTop}>
              <View style={styles.statusPill}>
                <View
                  style={[styles.statusDot, session?.status === 'charging' && styles.statusDotLive]}
                />
                <Text style={styles.statusText}>{status}</Text>
              </View>
              <Text style={styles.vehicleCaption}>
                {selectedVehicle?.displayName ?? 'No vehicle'}
              </Text>
            </View>
            <View style={styles.batteryRow}>
              <View style={styles.batteryVisual}>
                <View style={styles.batteryBody}>
                  <View style={[styles.batteryFill, { width: `${Math.max(4, shownPercent)}%` }]} />
                  <BatteryCharging
                    size={34}
                    color={colors.text}
                    strokeWidth={1.7}
                    style={styles.batteryIcon}
                  />
                </View>
                <View style={styles.batteryNub} />
              </View>
              <View>
                <Text style={styles.percent}>{shownPercent.toFixed(1)}%</Text>
                <Text style={styles.batteryLabel}>CURRENT BATTERY</Text>
              </View>
            </View>
            <View style={styles.metricGrid}>
              <DashboardMetric
                icon={<Zap size={16} color={colors.primary} />}
                value={`${shownTarget}%`}
                label="TARGET"
              />
              <DashboardMetric
                icon={<Clock3 size={16} color={colors.primary} />}
                value={shownTargetAt ? formatTargetTime(shownTargetAt) : 'Not set'}
                label={shownTargetAt && isTomorrow(shownTargetAt) ? 'TOMORROW' : 'FINISH BY'}
              />
              <DashboardMetric
                icon={<Leaf size={16} color={colors.success} />}
                value={estimating ? '…' : savings === undefined ? '—' : formatCarbon(savings)}
                label="EST. CO₂ SAVED"
                success
              />
            </View>
          </View>

          {!session && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.label}>CHARGE TARGET</Text>
                <Text style={styles.sectionValue}>{targetPercent.toFixed(0)}%</Text>
              </View>
              <Slider
                minimumValue={minimumTarget}
                maximumValue={100}
                step={1}
                value={Math.max(minimumTarget, targetPercent)}
                onValueChange={(value) => {
                  setTargetPercent(value);
                  setEstimate(null);
                }}
                onSlidingComplete={(value) => {
                  if (targetAt) void calculateEstimate(value, targetAt);
                }}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.surfaceElevated}
                thumbTintColor={colors.primary}
              />
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>Current {currentPercent.toFixed(0)}%</Text>
                <Text style={styles.sliderLabel}>100%</Text>
              </View>
              <View style={styles.sectionHeader}>
                <Text style={styles.label}>COMPLETION TIME</Text>
                <Text style={styles.sectionValue}>
                  {targetAt ? formatTargetDateTime(targetAt) : 'Not selected'}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setClockSeed(targetAt ?? defaultClockValue());
                  setShowClock(true);
                }}
                style={styles.timeButton}
              >
                <Clock3 size={19} color={colors.primary} />
                <View>
                  <Text style={styles.timeButtonValue}>
                    {targetAt ? formatTargetTime(targetAt) : 'Select a time'}
                  </Text>
                  <Text style={styles.timeButtonDetail}>
                    {targetAt
                      ? isTomorrow(targetAt)
                        ? 'Overnight · tomorrow'
                        : 'Today'
                      : 'Required before calculation'}
                  </Text>
                </View>
                <Text style={styles.changeText}>Change</Text>
              </Pressable>
            </>
          )}

          {session && (
            <View style={styles.card}>
              <Row
                label="Smart plan emissions"
                value={formatCarbon(session.estimatedOptimizedEmissionsGco2)}
              />
              <Row
                label="Immediate charging"
                value={formatCarbon(session.estimatedImmediateEmissionsGco2)}
              />
              <Row
                label="Charged"
                value={`${session.accumulatedBatteryEnergyKwh.toFixed(2)} kWh`}
              />
              <Row
                label="Last control"
                value={
                  session.lastControlledAt
                    ? new Date(session.lastControlledAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Starting…'
                }
              />
            </View>
          )}
          {!!message && <Text style={styles.message}>{message}</Text>}
        </ScrollView>
        <View style={styles.bottom}>
          <Pressable
            disabled={!selectedVehicle || !targetAt || currentPercent >= 100}
            onPress={() => void (session ? stop() : start())}
            style={[
              styles.action,
              (!selectedVehicle || !targetAt || currentPercent >= 100) && styles.disabled,
              session && styles.stop,
            ]}
          >
            <Text style={[styles.actionText, session && styles.stopText]}>
              {session ? 'Stop simulation' : 'Start smart charging'}
            </Text>
          </Pressable>
        </View>
      </View>
      <ClockRingModal
        visible={showClock}
        value={clockSeed}
        onClose={() => setShowClock(false)}
        onConfirm={(value) => {
          setTargetAt(value);
          setClockSeed(value);
          setEstimate(null);
          setShowClock(false);
          void calculateEstimate(targetPercent, value);
        }}
      />
    </SafeAreaView>
  );
}

function DashboardMetric({
  icon,
  value,
  label,
  success,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  success?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={[styles.metricValue, success && styles.metricValueSuccess]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const CLOCK_SIZE = 264;
const CLOCK_CENTER = CLOCK_SIZE / 2;
const CLOCK_RADIUS = 101;

function ClockRingModal({
  visible,
  value,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onConfirm: (value: Date) => void;
}) {
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [dayOffset, setDayOffset] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const hours = value.getHours();
    setHour(hours % 12 || 12);
    setMinute((Math.round(value.getMinutes() / 5) * 5) % 60);
    setPeriod(hours >= 12 ? 'PM' : 'AM');
    setDayOffset(isTomorrow(value) ? 1 : 0);
  }, [value, visible]);

  const updateFromPoint = useCallback((x: number, y: number) => {
    const angle = Math.atan2(x - CLOCK_CENTER, CLOCK_CENTER - y);
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    const selected = Math.round((normalized / (Math.PI * 2)) * 12) % 12;
    setHour(selected || 12);
  }, []);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) =>
          updateFromPoint(event.nativeEvent.locationX, event.nativeEvent.locationY),
        onPanResponderMove: (event) =>
          updateFromPoint(event.nativeEvent.locationX, event.nativeEvent.locationY),
      }),
    [updateFromPoint],
  );
  const selectedAngle = ((hour % 12) / 12) * Math.PI * 2;
  const knobX = CLOCK_CENTER + Math.sin(selectedAngle) * CLOCK_RADIUS;
  const knobY = CLOCK_CENTER - Math.cos(selectedAngle) * CLOCK_RADIUS;
  const lineAngle = (hour % 12) * 30 - 90;
  const lineMidX = CLOCK_CENTER + Math.sin(selectedAngle) * (CLOCK_RADIUS / 2);
  const lineMidY = CLOCK_CENTER - Math.cos(selectedAngle) * (CLOCK_RADIUS / 2);
  const preview = buildClockDate(hour, minute, period, dayOffset);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.clockModal}>
          <Text style={styles.clockEyebrow}>COMPLETE CHARGING BY</Text>
          <Text style={styles.clockTime}>
            {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}{' '}
            <Text style={styles.clockPeriod}>{period}</Text>
          </Text>
          <View style={styles.dayTabs}>
            <Pressable
              onPress={() => setDayOffset(0)}
              style={[styles.dayTab, dayOffset === 0 && styles.dayTabActive]}
            >
              <Text style={[styles.dayTabText, dayOffset === 0 && styles.dayTabTextActive]}>
                Today
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setDayOffset(1)}
              style={[styles.dayTab, dayOffset === 1 && styles.dayTabActive]}
            >
              <Text style={[styles.dayTabText, dayOffset === 1 && styles.dayTabTextActive]}>
                Tomorrow
              </Text>
            </Pressable>
          </View>
          <View style={styles.clockRing} {...panResponder.panHandlers}>
            <View
              style={[
                styles.clockHand,
                {
                  left: lineMidX - CLOCK_RADIUS / 2,
                  top: lineMidY - 1,
                  transform: [{ rotate: `${lineAngle}deg` }],
                },
              ]}
            />
            {Array.from({ length: 12 }, (_, index) => {
              const number = index === 0 ? 12 : index;
              const angle = (index / 12) * Math.PI * 2;
              return (
                <View
                  key={number}
                  style={[
                    styles.hourMark,
                    {
                      left: CLOCK_CENTER + Math.sin(angle) * CLOCK_RADIUS - 18,
                      top: CLOCK_CENTER - Math.cos(angle) * CLOCK_RADIUS - 18,
                    },
                    number === hour && styles.hourMarkActive,
                  ]}
                >
                  <Text style={[styles.hourText, number === hour && styles.hourTextActive]}>
                    {number}
                  </Text>
                </View>
              );
            })}
            <View style={styles.clockCenterDot} />
            <View style={[styles.clockKnob, { left: knobX - 10, top: knobY - 10 }]} />
          </View>
          <View style={styles.periodRow}>
            <Pressable
              onPress={() => setPeriod('AM')}
              style={[styles.periodButton, period === 'AM' && styles.periodButtonActive]}
            >
              <Text style={[styles.periodText, period === 'AM' && styles.periodTextActive]}>
                AM
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPeriod('PM')}
              style={[styles.periodButton, period === 'PM' && styles.periodButtonActive]}
            >
              <Text style={[styles.periodText, period === 'PM' && styles.periodTextActive]}>
                PM
              </Text>
            </Pressable>
          </View>
          <View style={styles.minuteRow}>
            {[0, 15, 30, 45].map((minuteOption) => (
              <Pressable
                key={minuteOption}
                onPress={() => setMinute(minuteOption)}
                style={[styles.minuteChip, minute === minuteOption && styles.minuteChipActive]}
              >
                <Text
                  style={[styles.minuteText, minute === minuteOption && styles.minuteTextActive]}
                >
                  :{String(minuteOption).padStart(2, '0')}
                </Text>
              </Pressable>
            ))}
          </View>
          {(isTomorrow(preview) || preview <= new Date()) && (
            <View style={styles.overnightPill}>
              <Text style={styles.overnightText}>Overnight · completion is set for tomorrow</Text>
            </View>
          )}
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(normalizeFuture(preview))}
              style={styles.confirmButton}
            >
              <Text style={styles.confirmText}>Set time</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function buildClockDate(hour: number, minute: number, period: 'AM' | 'PM', dayOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours((hour % 12) + (period === 'PM' ? 12 : 0), minute, 0, 0);
  return date;
}
function normalizeFuture(date: Date) {
  if (date > new Date()) return date;
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}
function isTomorrow(date: Date) {
  const today = new Date();
  return date.toDateString() !== today.toDateString() && date > today;
}
function formatTargetTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatTargetDateTime(date: Date) {
  return `${isTomorrow(date) ? 'Tomorrow' : 'Today'}, ${formatTargetTime(date)}`;
}
function defaultClockValue() {
  const date = new Date(Date.now() + 6 * 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return date;
}
function formatCarbon(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} kg` : `${Math.round(value)} g`;
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  shell: {
    flex: 1,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 80px rgba(0,0,0,.28)' } : {}),
  },
  header: {
    height: 68,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  headerSpacer: { width: 42 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  content: { padding: 20, gap: 10, paddingBottom: 30 },
  dashboard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  dashboardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  statusDotLive: { backgroundColor: colors.success },
  statusText: { color: colors.text, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  vehicleCaption: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 25,
  },
  batteryVisual: { flexDirection: 'row', alignItems: 'center' },
  batteryBody: {
    width: 116,
    height: 58,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,.35)',
    padding: 5,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  batteryFill: {
    position: 'absolute',
    left: 5,
    top: 5,
    bottom: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(114,213,255,.28)',
  },
  batteryIcon: { alignSelf: 'center' },
  batteryNub: {
    width: 7,
    height: 23,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
    backgroundColor: 'rgba(255,255,255,.32)',
  },
  percent: { color: colors.text, fontSize: 36, fontWeight: '800' },
  batteryLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: 2,
  },
  metricGrid: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1,
    minHeight: 92,
    padding: 12,
    borderRadius: 17,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricIcon: { height: 21 },
  metricValue: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 7 },
  metricValueSuccess: { color: colors.success },
  metricLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  sectionValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  sliderLabel: { color: colors.muted, fontSize: 11 },
  timeButton: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeButtonValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  timeButtonDetail: { color: colors.muted, fontSize: 11, marginTop: 2 },
  changeText: { color: colors.primary, fontSize: 12, fontWeight: '700', marginLeft: 'auto' },
  card: {
    marginTop: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowLabel: { color: colors.muted, fontSize: 13 },
  rowValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '62%',
    textAlign: 'right',
  },
  message: { color: colors.success, fontSize: 13, marginTop: 10 },
  bottom: { padding: 20 },
  action: {
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  actionText: { color: colors.background, fontSize: 16, fontWeight: '800' },
  stop: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  stopText: { color: colors.text },
  disabled: { opacity: 0.45 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,7,14,.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  clockModal: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 30,
    padding: 22,
    alignItems: 'center',
    backgroundColor: '#0D1B2D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.12)',
  },
  clockEyebrow: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  clockTime: { color: colors.text, fontSize: 33, fontWeight: '800', marginTop: 7 },
  clockPeriod: { color: colors.primary, fontSize: 15 },
  dayTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.background,
    marginTop: 13,
  },
  dayTab: { paddingHorizontal: 22, paddingVertical: 8, borderRadius: 11 },
  dayTabActive: { backgroundColor: colors.surfaceElevated },
  dayTabText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  dayTabTextActive: { color: colors.primary },
  clockRing: {
    width: CLOCK_SIZE,
    height: CLOCK_SIZE,
    borderRadius: CLOCK_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(114,213,255,.18)',
    backgroundColor: 'rgba(7,17,31,.65)',
    marginTop: 15,
  },
  hourMark: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  hourMarkActive: { backgroundColor: colors.primary },
  hourText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  hourTextActive: { color: colors.background },
  clockHand: {
    position: 'absolute',
    width: CLOCK_RADIUS,
    height: 2,
    backgroundColor: 'rgba(114,213,255,.7)',
    zIndex: 1,
  },
  clockCenterDot: {
    position: 'absolute',
    left: CLOCK_CENTER - 5,
    top: CLOCK_CENTER - 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    zIndex: 2,
  },
  clockKnob: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    zIndex: 2,
  },
  periodRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  periodButton: {
    paddingHorizontal: 25,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
  },
  periodButtonActive: {
    backgroundColor: 'rgba(114,213,255,.15)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  periodText: { color: colors.muted, fontWeight: '700' },
  periodTextActive: { color: colors.primary },
  minuteRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  minuteChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: colors.surfaceElevated,
  },
  minuteChipActive: { backgroundColor: colors.primary },
  minuteText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  minuteTextActive: { color: colors.background },
  overnightPill: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(118,230,172,.09)',
  },
  overnightText: { color: colors.success, fontSize: 11, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 18 },
  cancelButton: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated,
  },
  cancelText: { color: colors.text, fontWeight: '700' },
  confirmButton: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.primary,
  },
  confirmText: { color: colors.background, fontWeight: '800' },
});
