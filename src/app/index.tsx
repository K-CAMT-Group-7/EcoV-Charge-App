import { useLocalSearchParams, useRouter } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import Activity from 'lucide-react-native/icons/activity';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Car from 'lucide-react-native/icons/car';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Home from 'lucide-react-native/icons/house';
import LogOut from 'lucide-react-native/icons/log-out';
import Menu from 'lucide-react-native/icons/menu';
import Plus from 'lucide-react-native/icons/plus';
import Settings from 'lucide-react-native/icons/settings';
import X from 'lucide-react-native/icons/x';
import Zap from 'lucide-react-native/icons/zap';
import { useState } from 'react';
import { useEffect } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../packages/auth/provider';
import {
  getCarbonIntensityForecast,
  isElectricityMapsConfigured,
} from '../packages/electricitymaps/api';
import {
  getCurrentCountry,
  loadSavedUserLocation,
  saveUserLocation,
  type UserCountry,
} from '../packages/location/api';
import {
  getActiveChargingSession,
  listVehicles,
  type ServerChargingSession,
  type ServerVehicle,
} from '../packages/server/api';

const palette = {
  background: '#07111F',
  surface: '#0D1B2D',
  surfaceElevated: '#132238',
  border: 'rgba(255,255,255,0.08)',
  primary: '#72D5FF',
  success: '#76E6AC',
  text: '#F7FAFF',
  muted: '#8796AA',
} as const;

function VehicleSelector({
  vehicles,
  selectedVehicle,
  onChange,
  onManageVehicles,
}: {
  vehicles: ServerVehicle[];
  selectedVehicle?: ServerVehicle;
  onChange: (vehicleId: string) => void;
  onManageVehicles: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = selectedVehicle?.displayName ?? 'Add a vehicle';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`현재 차량 ${label}. 차량 변경`}
        onPress={() => (vehicles.length ? setOpen(true) : onManageVehicles())}
        style={({ pressed }) => [styles.vehicleSelector, pressed && styles.pressed]}
      >
        <View style={styles.vehicleMark}>
          <Car size={18} color={palette.primary} strokeWidth={2} />
        </View>
        <View style={styles.selectorCopy}>
          <Text style={styles.selectorLabel}>VEHICLE</Text>
          <View style={styles.selectorValueRow}>
            <Text numberOfLines={1} style={styles.selectorValue}>
              {label}
            </Text>
            {vehicles.length ? (
              <ChevronDown size={15} color={palette.muted} strokeWidth={2} />
            ) : (
              <ChevronRight size={15} color={palette.primary} strokeWidth={2} />
            )}
          </View>
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.vehicleMenu}>
            <Text style={styles.vehicleMenuTitle}>Choose a vehicle</Text>
            {vehicles.map((vehicle) => {
              const selected = vehicle.id === selectedVehicle?.id;
              return (
                <Pressable
                  key={vehicle.id}
                  onPress={() => {
                    onChange(vehicle.id);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.vehicleOption, pressed && styles.optionPressed]}
                >
                  <View style={[styles.optionIcon, selected && styles.optionIconActive]}>
                    <Car
                      size={17}
                      color={selected ? palette.primary : palette.muted}
                      strokeWidth={2}
                    />
                  </View>
                  <View style={styles.vehicleOptionCopy}>
                    <Text
                      style={[styles.vehicleOptionText, selected && styles.vehicleOptionTextActive]}
                    >
                      {vehicle.displayName}
                    </Text>
                    <Text style={styles.vehicleOptionDetail}>{vehicle.batteryCapacityKwh} kWh</Text>
                  </View>
                  {selected && <Check size={17} color={palette.primary} strokeWidth={2.3} />}
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => {
                setOpen(false);
                onManageVehicles();
              }}
              style={({ pressed }) => [styles.manageVehicles, pressed && styles.optionPressed]}
            >
              <Text style={styles.manageVehiclesText}>Manage vehicles</Text>
              <ChevronRight size={16} color={palette.primary} strokeWidth={2} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const fallbackCarbonForecast = [
  68, 70, 73, 75, 74, 76, 73, 72, 71, 70, 69, 70, 68, 67, 65, 66, 64, 62, 60, 61, 58, 56, 55, 53,
  52, 50, 49, 47, 45, 44, 42, 40,
] as const;

const actualPointCount = 8;

function getCarbonBarColor(value: number) {
  if (value >= 550) return '#71372F';
  if (value >= 450) return '#8E4935';
  if (value >= 350) return '#AC633C';
  if (value >= 250) return '#C28748';
  if (value >= 150) return '#A8A34C';
  return '#65B77B';
}

function getFallbackForecast(countryCode?: string) {
  const countryOffset = countryCode
    ? Array.from(countryCode).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 17
    : 0;
  return fallbackCarbonForecast.map((value, index) =>
    Math.round(
      (482 / 68) * Math.max(28, Math.min(82, value + countryOffset - (index > 18 ? 3 : 0))),
    ),
  );
}

function CarbonIntensityCard({ forecast, country }: { forecast: number[]; country?: string }) {
  const current = Math.round(forecast[actualPointCount - 1] ?? 482);
  const average = Math.round(forecast.reduce((sum, value) => sum + value, 0) / forecast.length);
  const minValue = Math.min(...forecast);
  const maxValue = Math.max(...forecast);
  const valueRange = Math.max(maxValue - minValue, 1);
  const averageChartHeight = 12 + Math.pow((average - minValue) / valueRange, 0.82) * 88;
  const isHigh = current >= 450;
  return (
    <View style={styles.carbonCard}>
      <View style={styles.carbonHeader}>
        <View>
          <Text style={styles.carbonLabel}>CARBON INTENSITY · NOW</Text>
          <View style={styles.carbonValueRow}>
            <Text style={styles.carbonValue}>{current}</Text>
            <Text style={styles.carbonUnit}>gCO₂/kWh</Text>
          </View>
        </View>
        <View style={[styles.highBadge, !isHigh && styles.cleanBadge]}>
          <View style={styles.highDot} />
          <Text style={[styles.highText, !isHigh && styles.cleanText]}>
            {isHigh ? 'High' : 'Clean'}
          </Text>
        </View>
      </View>

      <View style={styles.comparisonRow}>
        <Text style={styles.comparisonStrong}>{country ? `${country} grid` : 'Local grid'}</Text>
        <Text style={styles.comparisonMuted}>Avg. {average} gCO₂/kWh</Text>
      </View>

      <View style={styles.chartHeader}>
        <View style={styles.legendItem}>
          <View style={styles.actualLegend} />
          <Text style={styles.legendText}>Actual</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.forecastLegend} />
          <Text style={styles.legendText}>Forecast</Text>
        </View>
        <Text style={styles.forecastWindow}>15 min intervals</Text>
      </View>

      <View style={styles.chart} accessibilityLabel="현재와 향후 6시간 탄소 집약도 그래프">
        <View style={[styles.gridLine, styles.gridLineTop]} />
        <View style={[styles.gridLine, styles.gridLineMiddle]} />
        <View style={[styles.gridLine, styles.gridLineBottom]} />
        <View style={styles.bars}>
          {forecast.map((value, index) => {
            const forecasted = index >= actualPointCount;
            return (
              <View key={`${value}-${index}`} style={styles.barSlot}>
                <View
                  style={[
                    styles.carbonBar,
                    {
                      // Use the card's data range instead of zero as the baseline so
                      // smaller local changes remain visible in the compact chart.
                      height: `${12 + Math.pow((value - minValue) / valueRange, 0.82) * 88}%`,
                      backgroundColor: getCarbonBarColor(value),
                    },
                    forecasted && styles.forecastBar,
                  ]}
                />
              </View>
            );
          })}
        </View>
        <View
          style={[styles.averageLine, { top: `${100 - averageChartHeight}%` }]}
          accessibilityLabel={`평균 ${average} gCO₂/kWh`}
        >
          <Text style={styles.averageLineLabel}>AVG</Text>
        </View>
        <View style={styles.nowMarker}>
          <View style={styles.nowMarkerDot} />
        </View>
      </View>

      <View style={styles.chartAxis}>
        <Text style={styles.axisText}>−2h</Text>
        <Text style={styles.axisText}>Now</Text>
        <Text style={styles.axisText}>+2h</Text>
        <Text style={styles.axisText}>+4h</Text>
        <Text style={styles.axisText}>+6h</Text>
      </View>

      <View style={styles.cleanWindow}>
        <View style={styles.cleanWindowIcon}>
          <Zap size={16} color={palette.success} strokeWidth={2} />
        </View>
        <View style={styles.cleanWindowCopy}>
          <Text style={styles.cleanWindowLabel}>LOWEST-CARBON WINDOW</Text>
          <Text style={styles.cleanWindowValue}>
            7:30–8:00 PM · {Math.max(12, Math.round(((current - minValue) / current) * 100))}%
            cleaner
          </Text>
        </View>
      </View>
    </View>
  );
}

const navItems: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Home', icon: Home },
  { label: 'Vehicles', icon: Car },
  { label: 'Energy', icon: Zap },
  { label: 'Activity', icon: Activity },
  { label: 'Settings', icon: Settings },
];

function AppMenu() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const router = useRouter();
  const initials = (user?.displayName || user?.email || 'EC')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="메뉴 열기"
        onPress={() => setOpen(true)}
        hitSlop={3}
        style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
      >
        <Menu size={20} color={palette.text} strokeWidth={1.9} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.appMenu} onPress={(event) => event.stopPropagation()}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.profileCopy}>
                <Text style={styles.profileName}>{user?.displayName || 'EcoV Charge User'}</Text>
                <Text style={styles.profileEmail}>{user?.email}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="메뉴 닫기"
                onPress={() => setOpen(false)}
                hitSlop={6}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <X size={18} color={palette.muted} strokeWidth={1.9} />
              </Pressable>
            </View>
            <View style={styles.menuDivider} />
            {navItems.map((item, index) => {
              const ItemIcon = item.icon;
              return (
                <Pressable
                  key={item.label}
                  onPress={() => {
                    setOpen(false);
                    if (item.label === 'Vehicles') router.push('/vehicles');
                  }}
                  style={({ pressed }) => [styles.menuItem, pressed && styles.optionPressed]}
                >
                  <View style={[styles.menuItemIcon, index === 0 && styles.menuItemIconActive]}>
                    <ItemIcon
                      size={18}
                      color={index === 0 ? palette.primary : palette.muted}
                      strokeWidth={1.9}
                    />
                  </View>
                  <Text style={[styles.menuItemLabel, index === 0 && styles.menuItemLabelActive]}>
                    {item.label}
                  </Text>
                  <ChevronRight size={17} color={palette.muted} strokeWidth={1.8} />
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => {
                setOpen(false);
                void signOut();
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.optionPressed]}
            >
              <View style={styles.menuItemIcon}>
                <LogOut size={18} color={palette.muted} strokeWidth={1.9} />
              </View>
              <Text style={styles.menuItemLabel}>Sign out</Text>
              <ChevronRight size={17} color={palette.muted} strokeWidth={1.8} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ChargeAction({
  onPress,
  session,
}: {
  onPress: () => void;
  session: ServerChargingSession | null;
}) {
  const detail = session
    ? `${session.currentBatteryPercent.toFixed(0)}% → ${session.targetBatteryPercent.toFixed(0)}% · By ${new Date(session.targetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Charge smarter. Reduce carbon.';
  return (
    <View style={styles.chargeActionWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="충전 시작 페이지로 이동"
        onPress={onPress}
        style={({ pressed }) => [styles.chargeAction, pressed && styles.chargeActionPressed]}
      >
        <View style={styles.chargeActionIcon}>
          <Zap size={20} color={palette.primary} strokeWidth={2.1} />
        </View>
        <View style={styles.chargeActionCopy}>
          <Text style={styles.chargeActionTitle}>
            {session ? 'On Charging...' : 'Start charging'}
          </Text>
          <Text numberOfLines={1} style={styles.chargeActionDetail}>
            {detail}
          </Text>
        </View>
        <View style={styles.chargeActionArrow}>
          <ArrowRight size={19} color={palette.background} strokeWidth={2.1} />
        </View>
      </Pressable>
    </View>
  );
}

function getVehicleChargingStatus(
  vehicle?: ServerVehicle,
  activeSession?: ServerChargingSession | null,
) {
  if (!vehicle) return 'Choose a Tesla model';
  if (activeSession) return 'Charging';
  if (vehicle.chargingStatus === 'charging') return 'Charging';
  if (vehicle.chargingStatus === 'completed') return 'Charging complete';
  return 'Connected to charger';
}

export default function HomeScreen() {
  const { vehicleId: requestedVehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const [userLocation, setUserLocation] = useState<UserCountry | null>(null);
  const [carbonForecast, setCarbonForecast] = useState<number[]>(() => getFallbackForecast());
  const [locationStatus, setLocationStatus] = useState('Detecting your location…');
  const [vehicles, setVehicles] = useState<ServerVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [activeChargingSession, setActiveChargingSession] = useState<ServerChargingSession | null>(
    null,
  );
  const [showChargeVehiclePrompt, setShowChargeVehiclePrompt] = useState(false);
  const router = useRouter();
  const { sessionToken } = useAuth();
  const primaryVehicle =
    vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? vehicles[0];

  useEffect(() => {
    let active = true;
    async function hydrateVehicles() {
      if (!sessionToken) return;
      try {
        const accountVehicles = await listVehicles(sessionToken);
        if (active) {
          setVehicles(accountVehicles);
          setSelectedVehicleId((current) =>
            requestedVehicleId &&
            accountVehicles.some((vehicle) => vehicle.id === requestedVehicleId)
              ? requestedVehicleId
              : current && accountVehicles.some((vehicle) => vehicle.id === current)
                ? current
                : (accountVehicles[0]?.id ?? null),
          );
        }
      } catch {
        if (active) setVehicles([]);
      }
    }
    void hydrateVehicles();
    const timer = setInterval(() => void hydrateVehicles(), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [requestedVehicleId, sessionToken]);

  useEffect(() => {
    let active = true;
    async function hydrateChargingSession() {
      if (!sessionToken || !primaryVehicle) {
        if (active) setActiveChargingSession(null);
        return;
      }
      try {
        const result = await getActiveChargingSession(sessionToken, primaryVehicle.id);
        if (active) setActiveChargingSession(result);
      } catch {
        if (active) setActiveChargingSession(null);
      }
    }
    void hydrateChargingSession();
    const timer = setInterval(() => void hydrateChargingSession(), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [primaryVehicle, sessionToken]);

  useEffect(() => {
    let active = true;
    async function hydrateLocationAndCarbon() {
      const saved = await loadSavedUserLocation();
      if (!active) return;
      if (saved) {
        setUserLocation(saved);
        setLocationStatus(`Detected · ${saved.country}`);
        setCarbonForecast(getFallbackForecast(saved.countryCode));
      }

      try {
        const current = await getCurrentCountry();
        if (!active) return;
        await saveUserLocation(current);
        setUserLocation(current);
        setLocationStatus(`Updated just now · ${current.country}`);
        setCarbonForecast(getFallbackForecast(current.countryCode));

        if (isElectricityMapsConfigured()) {
          const result = await getCarbonIntensityForecast({
            latitude: current.latitude,
            longitude: current.longitude,
          });
          const values = result.forecast
            .map((point) => point.carbonIntensity)
            .filter((value) => Number.isFinite(value));
          if (active && values.length >= 8) setCarbonForecast(values.slice(0, 32));
        }
      } catch {
        if (active && !saved) setLocationStatus('Location unavailable · using local grid estimate');
      }
    }
    void hydrateLocationAndCarbon();
    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <View>
            <VehicleSelector
              vehicles={vehicles}
              selectedVehicle={primaryVehicle}
              onChange={setSelectedVehicleId}
              onManageVehicles={() => router.push('/vehicles')}
            />
            <Text style={styles.locationStatus}>{locationStatus}</Text>
          </View>
          <AppMenu />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>GOOD EVENING</Text>
            <Text style={styles.title}>Everything is flowing.</Text>
          </View>

          <View style={styles.homeVisual}>
            {primaryVehicle ? (
              <>
                <Image
                  accessibilityLabel="전기차가 연결된 충전 공간"
                  source={require('../../assets/images/home-garage-hero.png')}
                  resizeMode="cover"
                  style={styles.heroImage}
                />
                <View style={styles.imageShade} pointerEvents="none" />
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="차량 추가"
                onPress={() => router.push('/vehicles')}
                style={({ pressed }) => [styles.emptyVehicleVisual, pressed && styles.pressed]}
              >
                <View style={styles.emptyVehiclePlus}>
                  <Plus size={36} color={palette.primary} strokeWidth={1.8} />
                </View>
                <Text style={styles.emptyVehicleTitle}>Add your vehicle</Text>
                <Text style={styles.emptyVehicleDetail}>Tap to get started</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="내 차량 관리"
              onPress={() => router.push('/vehicles')}
              style={({ pressed }) => [styles.vehicleStatus, pressed && styles.pressed]}
            >
              <View>
                <Text style={styles.vehicleName}>
                  {primaryVehicle?.displayName ?? 'Add your first vehicle'}
                </Text>
                <Text style={styles.vehicleDetail}>
                  {getVehicleChargingStatus(primaryVehicle, activeChargingSession)}
                </Text>
              </View>
              {primaryVehicle ? (
                <View style={styles.chargeValueWrap}>
                  <Text style={styles.chargeValue}>
                    {Math.round(primaryVehicle.currentBatteryPercent)}%
                  </Text>
                  <Text style={styles.chargeTime}>battery remaining</Text>
                </View>
              ) : (
                <ChevronRight size={21} color={palette.primary} strokeWidth={2} />
              )}
            </Pressable>
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Grid carbon</Text>
          </View>
          <CarbonIntensityCard forecast={carbonForecast} country={userLocation?.country} />
        </ScrollView>
        <ChargeAction
          session={activeChargingSession}
          onPress={() => {
            if (!primaryVehicle) {
              setShowChargeVehiclePrompt(true);
              return;
            }
            router.push({ pathname: '/charge', params: { vehicleId: primaryVehicle.id } });
          }}
        />
        <Modal
          visible={showChargeVehiclePrompt}
          transparent
          animationType="fade"
          onRequestClose={() => setShowChargeVehiclePrompt(false)}
        >
          <View style={styles.centeredModalBackdrop}>
            <View style={styles.chargeVehiclePrompt}>
              <View style={styles.chargeVehiclePromptIcon}>
                <Car size={27} color={palette.primary} strokeWidth={2} />
              </View>
              <Text style={styles.chargeVehiclePromptTitle}>Select a vehicle first</Text>
              <Text style={styles.chargeVehiclePromptText}>
                Add or select a vehicle before starting smart charging.
              </Text>
              <Pressable
                onPress={() => {
                  setShowChargeVehiclePrompt(false);
                  router.push('/vehicles');
                }}
                style={styles.chargeVehiclePromptButton}
              >
                <Text style={styles.chargeVehiclePromptButtonText}>Choose a vehicle</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowChargeVehiclePrompt(false)}
                style={styles.chargeVehiclePromptCancel}
              >
                <Text style={styles.chargeVehiclePromptCancelText}>Not now</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: palette.background,
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 80px rgba(0,0,0,0.28)' } : {}),
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 118,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  locationStatus: {
    color: palette.muted,
    fontSize: 10,
    marginLeft: 53,
    marginTop: -2,
  },
  vehicleSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 6,
    paddingRight: 12,
    borderRadius: 14,
    maxWidth: 280,
  },
  vehicleMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceElevated,
    borderWidth: 1,
    borderColor: palette.border,
  },
  selectorLabel: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  selectorCopy: {
    flexShrink: 1,
  },
  selectorValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  selectorValue: {
    flexShrink: 1,
    color: palette.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
  },
  menuButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  pressed: {
    opacity: 0.68,
  },
  intro: {
    marginTop: 34,
    marginBottom: 20,
  },
  eyebrow: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.1,
    marginBottom: 8,
  },
  title: {
    color: palette.text,
    fontSize: 31,
    lineHeight: 37,
    letterSpacing: -1.1,
    fontWeight: '700',
  },
  homeVisual: {
    height: 390,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  emptyVehicleVisual: {
    ...StyleSheet.absoluteFillObject,
    bottom: 92,
    top: 18,
    left: 18,
    right: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderRadius: 22,
  },
  emptyVehiclePlus: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(114,213,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(114,213,255,0.25)',
  },
  emptyVehicleTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 11,
  },
  emptyVehicleDetail: { color: palette.muted, fontSize: 12, marginTop: 3 },
  imageShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 9, 18, 0.05)',
    borderWidth: 18,
    borderColor: 'rgba(7, 17, 31, 0.08)',
  },
  livePill: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(4, 12, 24, 0.72)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.success,
  },
  liveText: {
    color: palette.text,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  vehicleStatus: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    minHeight: 82,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 21,
    backgroundColor: 'rgba(8, 19, 34, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  vehicleName: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 5,
  },
  vehicleDetail: {
    color: palette.success,
    fontSize: 13,
    fontWeight: '600',
  },
  chargeValueWrap: {
    alignItems: 'flex-end',
  },
  chargeValue: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '700',
  },
  chargeTime: {
    marginTop: 3,
    color: palette.muted,
    fontSize: 12,
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 13,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '700',
  },
  carbonCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  carbonHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  carbonLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  carbonValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 5,
  },
  carbonValue: {
    color: palette.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  carbonUnit: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  highBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,154,99,0.11)',
  },
  highDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF9A63',
  },
  highText: {
    color: '#FFB07D',
    fontSize: 11,
    fontWeight: '800',
  },
  cleanBadge: { backgroundColor: 'rgba(118,230,172,0.11)' },
  cleanText: { color: palette.success },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  comparisonStrong: {
    color: '#FFB07D',
    fontSize: 12,
    fontWeight: '700',
  },
  comparisonMuted: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    marginBottom: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actualLegend: {
    width: 9,
    height: 9,
    borderRadius: 3,
    backgroundColor: '#71372F',
  },
  forecastLegend: {
    width: 9,
    height: 9,
    borderRadius: 3,
    backgroundColor: '#71372F',
    borderWidth: 1,
    borderColor: palette.muted,
    opacity: 0.68,
  },
  legendText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  forecastWindow: {
    flex: 1,
    textAlign: 'right',
    color: palette.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  chart: {
    height: 116,
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.16)',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  gridLineTop: { top: 0 },
  gridLineMiddle: { top: '50%' },
  gridLineBottom: { bottom: 0 },
  bars: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    paddingHorizontal: 0.5,
  },
  carbonBar: {
    width: '100%',
    minHeight: 3,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    backgroundColor: 'rgba(245,155,99,0.72)',
  },
  forecastBar: {
    opacity: 0.68,
  },
  nowMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '25%',
    width: 1,
    backgroundColor: palette.text,
  },
  nowMarkerDot: {
    position: 'absolute',
    top: 31,
    left: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.text,
  },
  averageLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: palette.primary,
    opacity: 0.9,
    zIndex: 2,
  },
  averageLineLabel: {
    position: 'absolute',
    right: 2,
    top: -13,
    color: palette.primary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  chartAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  axisText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  cleanWindow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(118,230,172,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(118,230,172,0.12)',
  },
  cleanWindowIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(118,230,172,0.11)',
  },
  cleanWindowCopy: {
    paddingLeft: 11,
  },
  cleanWindowLabel: {
    color: palette.success,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cleanWindowValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  chargeActionWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    padding: 6,
    borderRadius: 26,
    backgroundColor: 'rgba(7,17,31,0.94)',
  },
  chargeAction: {
    minHeight: 72,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 21,
    backgroundColor: palette.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  chargeActionPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  chargeActionIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
  chargeActionCopy: {
    flex: 1,
    paddingHorizontal: 13,
  },
  chargeActionTitle: {
    color: palette.background,
    fontSize: 16,
    fontWeight: '800',
  },
  chargeActionDetail: {
    color: 'rgba(7,17,31,0.66)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  chargeActionArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,17,31,0.09)',
  },
  menuBackdrop: {
    flex: 1,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(0, 5, 13, 0.72)',
  },
  appMenu: {
    width: '84%',
    maxWidth: 360,
    height: '100%',
    paddingTop: 68,
    paddingHorizontal: 20,
    backgroundColor: palette.surface,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.1)',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(114,213,255,0.14)',
  },
  avatarText: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  profileCopy: {
    flex: 1,
    paddingLeft: 12,
  },
  profileName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  profileEmail: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginVertical: 24,
  },
  menuItem: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  menuItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  menuItemIconActive: {
    backgroundColor: 'rgba(114,213,255,0.11)',
  },
  menuItemLabel: {
    flex: 1,
    color: palette.muted,
    fontSize: 15,
    fontWeight: '600',
  },
  menuItemLabelActive: {
    color: palette.text,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 74,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 5, 13, 0.72)',
  },
  centeredModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 5, 13, 0.72)',
  },
  chargeVehiclePrompt: {
    width: '88%',
    maxWidth: 360,
    alignItems: 'center',
    padding: 26,
    borderRadius: 26,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chargeVehiclePromptIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(114,213,255,0.12)',
  },
  chargeVehiclePromptTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 18,
  },
  chargeVehiclePromptText: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  chargeVehiclePromptButton: {
    width: '100%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: palette.primary,
    marginTop: 22,
  },
  chargeVehiclePromptButtonText: {
    color: palette.background,
    fontSize: 14,
    fontWeight: '800',
  },
  chargeVehiclePromptCancel: { paddingVertical: 13, paddingHorizontal: 24 },
  chargeVehiclePromptCancelText: { color: palette.muted, fontSize: 13, fontWeight: '700' },
  vehicleMenu: {
    width: 300,
    padding: 10,
    borderRadius: 23,
    backgroundColor: palette.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  vehicleMenuTitle: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 9,
  },
  vehicleOption: {
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    borderRadius: 15,
  },
  optionPressed: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  optionIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  optionIconActive: {
    backgroundColor: 'rgba(114,213,255,0.1)',
  },
  vehicleOptionCopy: {
    flex: 1,
  },
  vehicleOptionText: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '600',
  },
  vehicleOptionTextActive: {
    color: palette.text,
  },
  vehicleOptionDetail: {
    color: palette.muted,
    fontSize: 11,
    marginTop: 3,
  },
  manageVehicles: {
    minHeight: 48,
    marginTop: 6,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageVehiclesText: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
