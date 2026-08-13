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
  disableForceTopUpChargingSession,
  estimateChargingSession,
  forceTopUpChargingSession,
  getActiveChargingSession,
  listVehicles,
  stopChargingSession,
  type ChargingEstimate,
  ServerApiError,
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
  const [now, setNow] = useState(() => Date.now());
  const [clockSeed, setClockSeed] = useState(() => defaultClockValue());
  const [showClock, setShowClock] = useState(false);
  const [session, setSession] = useState<ServerChargingSession | null>(null);
  const [estimate, setEstimate] = useState<ChargingEstimate | null>(null);
  const [estimateFeasible, setEstimateFeasible] = useState<boolean | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'force' | 'disable-force' | null>(
    null,
  );
  const [message, setMessage] = useState('');
  const estimateRequestId = useRef(0);
  const locationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId),
    [vehicles, selectedVehicleId],
  );
  const currentPercent = selectedVehicle?.currentBatteryPercent ?? 20;
  const minimumTarget = Math.min(100, Math.ceil(currentPercent + 1));
  const deadlineReachable = useMemo(
    () => canReachTargetBy(selectedVehicle, targetPercent, targetAt, now),
    [now, selectedVehicle, targetAt, targetPercent],
  );
  const planUnavailable = Boolean(targetAt) && (!deadlineReachable || estimateFeasible === false);
  const startDisabled =
    !selectedVehicle ||
    !targetAt ||
    currentPercent >= 100 ||
    estimating ||
    !estimate ||
    estimateFeasible !== true ||
    !deadlineReachable;

  useEffect(() => setTargetPercent((value) => Math.max(minimumTarget, value)), [minimumTarget]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

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
    if (!sessionToken || !selectedVehicle || !targetAt || startDisabled) return;
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
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start smart charging.');
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
    setEstimateFeasible(null);
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
        setEstimateFeasible(true);
        setMessage('');
      }
    } catch (error) {
      if (requestId === estimateRequestId.current) {
        setEstimate(null);
        const infeasible = error instanceof ServerApiError && error.status === 422;
        setEstimateFeasible(infeasible ? false : null);
        setMessage(
          infeasible
            ? 'The charging target cannot be reached before the selected deadline.'
            : error instanceof Error
              ? error.message
              : 'Unable to calculate estimate.',
        );
      }
    } finally {
      if (requestId === estimateRequestId.current) setEstimating(false);
    }
  }

  async function stop() {
    if (!sessionToken || !session || stopping) return;
    setStopping(true);
    try {
      await stopChargingSession(sessionToken, session.id);
      setSession(null);
      setConfirmAction(null);
      await loadVehicles();
      setMessage('Charging stopped.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to stop charging.');
    } finally {
      setStopping(false);
    }
  }

  async function forceTopUp() {
    if (!sessionToken || !session || forcing || session.controlMode === 'force') return;
    setForcing(true);
    try {
      const updated = await forceTopUpChargingSession(sessionToken, session.id);
      setSession(updated);
      setConfirmAction(null);
      setMessage('Force top up is active.');
    } catch {
      setMessage('Unable to activate force top up.');
    } finally {
      setForcing(false);
    }
  }

  async function disableForceTopUp() {
    if (!sessionToken || !session || forcing || session.controlMode !== 'force') return;
    setForcing(true);
    try {
      const updated = await disableForceTopUpChargingSession(sessionToken, session.id);
      setSession(updated);
      setConfirmAction(null);
      setMessage('Smart charging optimization is active.');
    } catch {
      setMessage('Unable to disable force top up.');
    } finally {
      setForcing(false);
    }
  }

  const shownPercent = session?.currentBatteryPercent ?? currentPercent;
  const shownTarget = session?.targetBatteryPercent ?? targetPercent;
  const shownTargetAt = session ? new Date(session.targetAt) : targetAt;
  const estimatedSavings = session?.estimatedCarbonSavingsGco2 ?? estimate?.carbonSavingsGco2;
  const status =
    session?.controlMode === 'force'
      ? 'FORCE TOP UP'
      : session?.status === 'charging'
        ? 'CHARGING'
        : session
          ? 'OPTIMIZING'
          : 'READY';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이전 화면으로 돌아가기"
            onPress={() => router.back()}
            hitSlop={3}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
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
                value={
                  estimating
                    ? '- kg'
                    : estimatedSavings === undefined
                      ? '- kg'
                      : formatCarbon(estimatedSavings)
                }
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
                  setEstimateFeasible(null);
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
                label="Carbon saved so far"
                value={formatCarbon(session.realizedCarbonSavingsGco2)}
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
          {session ? (
            <View style={styles.activeActions}>
              <Pressable
                disabled={stopping || forcing}
                onPress={() => setConfirmAction('stop')}
                style={[
                  styles.action,
                  styles.activeAction,
                  styles.stop,
                  (stopping || forcing) && styles.disabled,
                ]}
              >
                <Text style={[styles.actionText, styles.stopText]}>
                  {stopping ? 'Stopping...' : 'Stop charging'}
                </Text>
              </Pressable>
              <Pressable
                disabled={stopping || forcing}
                onPress={() =>
                  setConfirmAction(session.controlMode === 'force' ? 'disable-force' : 'force')
                }
                style={[
                  styles.action,
                  styles.activeAction,
                  styles.forceAction,
                  session.controlMode === 'force' && styles.disableForceAction,
                  (stopping || forcing) && styles.disabled,
                ]}
              >
                <Text
                  style={[
                    styles.forceActionText,
                    session.controlMode === 'force' && styles.disableForceActionText,
                  ]}
                >
                  {forcing
                    ? 'Activating...'
                    : session.controlMode === 'force'
                      ? 'Disable top up'
                      : 'Force top up'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.startActionGroup}>
              <Pressable
                disabled={startDisabled}
                onPress={() => void start()}
                style={[
                  styles.action,
                  startDisabled && styles.disabled,
                  planUnavailable && styles.unavailableAction,
                ]}
              >
                <Text style={[styles.actionText, planUnavailable && styles.unavailableActionText]}>
                  {estimating
                    ? 'Checking deadline...'
                    : planUnavailable
                      ? 'Charging plan unavailable'
                      : 'Start charging'}
                </Text>
              </Pressable>
              {planUnavailable && (
                <Text style={styles.unavailableNotice}>
                  This charging plan cannot be started. Choose a later completion time or lower the
                  charge target.
                </Text>
              )}
            </View>
          )}
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
          setEstimateFeasible(null);
          setShowClock(false);
          void calculateEstimate(targetPercent, value);
        }}
      />
      <ActionConfirmationModal
        action={confirmAction}
        busy={stopping || forcing}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction;
          if (action === 'stop') void stop();
          if (action === 'force') void forceTopUp();
          if (action === 'disable-force') void disableForceTopUp();
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

function ActionConfirmationModal({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: 'stop' | 'force' | 'disable-force' | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const force = action === 'force';
  const disableForce = action === 'disable-force';
  return (
    <Modal visible={action !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.confirmModal}>
          <View style={[styles.confirmIcon, force && styles.confirmIconForce]}>
            <Zap size={27} color={force ? colors.background : colors.text} strokeWidth={2.1} />
          </View>
          <Text style={styles.confirmTitle}>
            {force
              ? 'Activate force top up?'
              : disableForce
                ? 'Disable force top up?'
                : 'Stop charging?'}
          </Text>
          <Text style={styles.confirmDescription}>
            {force
              ? 'Charging will start immediately at maximum power and bypass carbon optimization.'
              : disableForce
                ? 'Charging will return to carbon-aware optimization for the remaining target.'
                : 'Your active charging plan will end and the progress so far will be saved.'}
          </Text>
          <View style={styles.confirmActions}>
            <Pressable disabled={busy} onPress={onCancel} style={styles.confirmCancelButton}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                force
                  ? 'Confirm force top up'
                  : disableForce
                    ? 'Confirm disable force top up'
                    : 'Confirm stop charging'
              }
              disabled={busy}
              onPress={onConfirm}
              hitSlop={8}
              style={[
                styles.confirmProceedButton,
                action === 'stop' && styles.confirmProceedStop,
                force && styles.confirmProceedForce,
              ]}
            >
              <Text
                style={[
                  styles.confirmProceedText,
                  (force || action === 'stop') && styles.confirmProceedForceText,
                ]}
              >
                {busy
                  ? force
                    ? 'Activating...'
                    : disableForce
                      ? 'Disabling...'
                      : 'Stopping...'
                  : force
                    ? 'Force top up'
                    : disableForce
                      ? 'Disable top up'
                      : 'Stop charging'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const CLOCK_SIZE = 264;
const CLOCK_CENTER = CLOCK_SIZE / 2;
const CLOCK_RADIUS = 101;
const FULL_CIRCLE = Math.PI * 2;

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
  const [clockUnit, setClockUnit] = useState<'hour' | 'minute'>('hour');
  const previousAngle = useRef<number | null>(null);
  const periodRef = useRef<'AM' | 'PM'>('AM');

  useEffect(() => {
    if (!visible) return;
    const hours = value.getHours();
    setHour(hours % 12 || 12);
    setMinute((Math.round(value.getMinutes() / 5) * 5) % 60);
    const initialPeriod = hours >= 12 ? 'PM' : 'AM';
    setPeriod(initialPeriod);
    periodRef.current = initialPeriod;
    setDayOffset(isTomorrow(value) ? 1 : 0);
    setClockUnit('hour');
    previousAngle.current = null;
  }, [value, visible]);

  const updateFromPoint = useCallback(
    (x: number, y: number, trackDayBoundary: boolean) => {
      const angle = Math.atan2(x - CLOCK_CENTER, CLOCK_CENTER - y);
      const normalized = (angle + FULL_CIRCLE) % FULL_CIRCLE;

      if (clockUnit === 'minute') {
        setMinute((Math.round((normalized / FULL_CIRCLE) * 12) % 12) * 5);
        previousAngle.current = normalized;
        return;
      }

      if (trackDayBoundary && previousAngle.current !== null) {
        const rawDelta = normalized - previousAngle.current;
        const delta =
          rawDelta > Math.PI
            ? rawDelta - FULL_CIRCLE
            : rawDelta < -Math.PI
              ? rawDelta + FULL_CIRCLE
              : rawDelta;
        const crossedClockwise =
          previousAngle.current > Math.PI * 1.5 && normalized < Math.PI * 0.5;
        const crossedCounterClockwise =
          previousAngle.current < Math.PI * 0.5 && normalized > Math.PI * 1.5;

        if (crossedClockwise && delta > 0) {
          if (periodRef.current === 'AM') {
            periodRef.current = 'PM';
            setPeriod('PM');
          } else {
            setDayOffset(1);
            periodRef.current = 'AM';
            setPeriod('AM');
          }
        } else if (crossedCounterClockwise && delta < 0) {
          if (periodRef.current === 'PM') {
            periodRef.current = 'AM';
            setPeriod('AM');
          } else {
            setDayOffset(0);
            periodRef.current = 'PM';
            setPeriod('PM');
          }
        }
      }

      const selected = Math.round((normalized / FULL_CIRCLE) * 12) % 12;
      setHour(selected || 12);
      previousAngle.current = normalized;
    },
    [clockUnit],
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          previousAngle.current = null;
          updateFromPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, false);
        },
        onPanResponderMove: (event) =>
          updateFromPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, true),
        onPanResponderRelease: () => {
          previousAngle.current = null;
          if (clockUnit === 'hour') setClockUnit('minute');
        },
        onPanResponderTerminate: () => {
          previousAngle.current = null;
        },
      }),
    [clockUnit, updateFromPoint],
  );
  const selectedValue = clockUnit === 'hour' ? hour % 12 : minute / 5;
  const selectedAngle = (selectedValue / 12) * FULL_CIRCLE;
  const knobX = CLOCK_CENTER + Math.sin(selectedAngle) * CLOCK_RADIUS;
  const knobY = CLOCK_CENTER - Math.cos(selectedAngle) * CLOCK_RADIUS;
  const lineAngle = selectedValue * 30 - 90;
  const lineMidX = CLOCK_CENTER + Math.sin(selectedAngle) * (CLOCK_RADIUS / 2);
  const lineMidY = CLOCK_CENTER - Math.cos(selectedAngle) * (CLOCK_RADIUS / 2);
  const preview = buildClockDate(hour, minute, period, dayOffset);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.clockModal}>
          <Text style={styles.clockEyebrow}>COMPLETE CHARGING BY</Text>
          <View style={styles.clockTimeRow}>
            <Pressable onPress={() => setClockUnit('hour')}>
              <Text style={[styles.clockTime, clockUnit === 'hour' && styles.clockTimeActive]}>
                {String(hour).padStart(2, '0')}
              </Text>
            </Pressable>
            <Text style={styles.clockTime}>:</Text>
            <Pressable onPress={() => setClockUnit('minute')}>
              <Text style={[styles.clockTime, clockUnit === 'minute' && styles.clockTimeActive]}>
                {String(minute).padStart(2, '0')}
              </Text>
            </Pressable>
            <Text style={styles.clockPeriod}>{period}</Text>
          </View>
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
          <View
            accessibilityLabel={`${clockUnit} picker`}
            accessibilityHint="Tap a position or drag around the dial"
            style={styles.clockRing}
            {...panResponder.panHandlers}
          >
            <View
              pointerEvents="none"
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
              const number = clockUnit === 'hour' ? (index === 0 ? 12 : index) : index * 5;
              const angle = (index / 12) * Math.PI * 2;
              const isActive = clockUnit === 'hour' ? number === hour : number === minute;
              return (
                <View
                  key={number}
                  pointerEvents="none"
                  style={[
                    styles.hourMark,
                    {
                      left: CLOCK_CENTER + Math.sin(angle) * CLOCK_RADIUS - 18,
                      top: CLOCK_CENTER - Math.cos(angle) * CLOCK_RADIUS - 18,
                    },
                    isActive && styles.hourMarkActive,
                  ]}
                >
                  <Text style={[styles.hourText, isActive && styles.hourTextActive]}>
                    {clockUnit === 'minute' ? String(number).padStart(2, '0') : number}
                  </Text>
                </View>
              );
            })}
            <View pointerEvents="none" style={styles.clockCenterDot} />
            <View
              pointerEvents="none"
              style={[styles.clockKnob, { left: knobX - 12, top: knobY - 12 }]}
            />
          </View>
          <View style={styles.periodRow}>
            <Pressable
              onPress={() => {
                periodRef.current = 'AM';
                setPeriod('AM');
              }}
              style={[styles.periodButton, period === 'AM' && styles.periodButtonActive]}
            >
              <Text style={[styles.periodText, period === 'AM' && styles.periodTextActive]}>
                AM
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                periodRef.current = 'PM';
                setPeriod('PM');
              }}
              style={[styles.periodButton, period === 'PM' && styles.periodButtonActive]}
            >
              <Text style={[styles.periodText, period === 'PM' && styles.periodTextActive]}>
                PM
              </Text>
            </Pressable>
          </View>
          <Text style={styles.clockHint}>
            {clockUnit === 'hour' ? 'Tap or drag to set the hour' : 'Tap or drag in 5-minute steps'}
          </Text>
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
function canReachTargetBy(
  vehicle: ServerVehicle | undefined,
  targetPercent: number,
  targetAt: Date | null,
  now: number,
) {
  if (!vehicle || !targetAt) return false;
  const batteryEnergyNeededKwh =
    (vehicle.batteryCapacityKwh * Math.max(0, targetPercent - vehicle.currentBatteryPercent)) / 100;
  const batteryChargingPowerKw = vehicle.acChargingPowerKw * vehicle.chargingEfficiency;
  if (batteryChargingPowerKw <= 0) return false;
  const chargingTimeMs = (batteryEnergyNeededKwh / batteryChargingPowerKw) * 60 * 60 * 1000;
  return targetAt.getTime() - now >= chargingTimeMs;
}
function formatCarbon(value: number) {
  return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(2)} kg` : `${Math.round(value)} g`;
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
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  headerSpacer: { width: 48 },
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
  startActionGroup: { gap: 9 },
  activeActions: { flexDirection: 'row', gap: 10 },
  activeAction: { flex: 1 },
  action: {
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  actionText: { color: colors.background, fontSize: 16, fontWeight: '800' },
  unavailableAction: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unavailableActionText: { color: colors.muted },
  unavailableNotice: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  stop: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  stopText: { color: colors.text },
  forceAction: { backgroundColor: colors.success },
  forceActionText: { color: colors.background, fontSize: 14, fontWeight: '800' },
  disableForceAction: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.success,
  },
  disableForceActionText: { color: colors.success },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.68 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,7,14,.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  confirmModal: {
    width: '100%',
    maxWidth: 370,
    alignItems: 'center',
    padding: 25,
    borderRadius: 27,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.12)',
  },
  confirmIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  confirmIconForce: { backgroundColor: colors.success },
  confirmTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 17 },
  confirmDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  confirmActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 22 },
  confirmCancelButton: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated,
  },
  confirmCancelText: { color: colors.text, fontWeight: '700' },
  confirmProceedButton: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmProceedStop: { backgroundColor: '#E86F61', borderColor: '#E86F61' },
  confirmProceedForce: { backgroundColor: colors.success, borderColor: colors.success },
  confirmProceedText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  confirmProceedForceText: { color: colors.background },
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
  clockTimeRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 7 },
  clockTime: { color: colors.muted, fontSize: 33, fontWeight: '800' },
  clockTimeActive: { color: colors.text },
  clockPeriod: { color: colors.primary, fontSize: 15, fontWeight: '800', marginLeft: 7 },
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
    width: 24,
    height: 24,
    borderRadius: 12,
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
  clockHint: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 12 },
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
