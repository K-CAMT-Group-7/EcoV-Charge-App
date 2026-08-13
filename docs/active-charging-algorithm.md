# 탄소 집약도 기반 능동형 전기차 충전 알고리즘

## 1. 목표

충전 시작 시각부터 종료 목표 시각까지 자동차를 충전하면서,

1. 충전 목표량을 반드시 확보하고
2. 전기의 탄소 집약도가 낮은 시간대에 우선 충전한다.

제어 단위는 5분으로 한다. Electricity Maps API가 제공하는 5분 단위 탄소 집약도 데이터를 이용해 매 제어 시점마다 충전 계획을 다시 계산한다.

---

## 2. 입력값

| 입력                |        기호 |     단위 |
| ------------------- | ----------: | -------: |
| 충전 시작 시각      |   `t_start` |     시각 |
| 현재 시각           |     `t_now` |     시각 |
| 충전 종료 목표 시각 |     `t_end` |     시각 |
| 충전 목표 에너지    |  `E_target` |      kWh |
| 현재 배터리 에너지  | `E_current` |      kWh |
| 최대 충전 전력      |     `P_max` |       kW |
| 충전 효율           |         `η` |      0~1 |
| 5분별 탄소 집약도   |       `C_i` | gCO₂/kWh |

현재 배터리 에너지는 배터리 용량과 현재 SOC로 계산할 수 있다.

$$
E_{current} = B_{capacity} \times SOC_{current}
$$

충전해야 할 에너지는 다음과 같다.

$$
E_{required} = \max(0, E_{target} - E_{current})
$$

이미 목표량에 도달했다면 충전을 종료한다.

---

## 3. 시간 슬롯 생성

5분은 시간으로 환산하면 다음과 같다.

$$
\Delta t = \frac{5}{60} = \frac{1}{12}\ \text{hour}
$$

현재 시각부터 종료 목표 시각까지 5분 단위 슬롯을 만든다.

$$
S = \{s_1, s_2, \ldots, s_n\}
$$

슬롯 개수는 다음과 같다.

$$
n = \left\lfloor\frac{t_{end} - t_{now}}{5\ \text{분}}\right\rfloor
$$

각 슬롯에는 다음 데이터가 연결된다.

```text
slot[i].time
slot[i].carbon_intensity = C_i
```

---

## 4. 5분 동안 충전되는 에너지

슬롯 `i`에서 충전기를 최대 출력으로 사용하면 차량에 저장되는 에너지는 다음과 같다.

$$
E_{slot} = P_{max} \times \eta \times \Delta t
$$

예를 들어 최대 충전 전력이 7kW이고 효율이 90%라면,

$$
E_{slot} = 7 \times 0.9 \times \frac{1}{12}
= 0.525\ \text{kWh}
$$

필요한 충전 슬롯 수는 다음과 같다.

$$
n_{required} =
\left\lceil\frac{E_{required}}{E_{slot}}\right\rceil
$$

---

## 5. 종료시간 보장 조건

남은 슬롯 수가 필요한 슬롯 수보다 작으면 탄소 집약도와 관계없이 즉시 충전해야 한다.

$$
n_{remaining} < n_{required}
$$

이 경우:

```text
충전 출력 = P_max
```

남은 시간 안에 목표량을 채울 수 있는 경우에는 탄소 집약도가 낮은 슬롯을 선택한다.

$$
n_{remaining} \ge n_{required}
$$

---

## 6. 충전 슬롯 선택 알고리즘

각 슬롯의 탄소 집약도 `C_i`를 오름차순으로 정렬한다.

$$
C_{(1)} \le C_{(2)} \le \cdots \le C_{(n)}
$$

정렬된 슬롯 중 앞에서부터 `n_required`개를 충전 슬롯으로 선택한다.

$$
S_{charge} =
\{s_{(1)}, s_{(2)}, \ldots, s_{(n_{required})}\}
$$

현재 5분 슬롯이 `S_charge`에 포함되어 있으면 충전하고, 포함되어 있지 않으면 충전을 일시정지한다.

```text
if current_slot ∈ S_charge:
    충전 출력 = P_max
else:
    충전 출력 = 0
```

---

## 7. 최적화 목적함수

슬롯 `i`에서 충전하는 전력을 `P_i`라고 하면, 해당 슬롯에서 발생하는 탄소 배출량은 다음과 같다.

$$
CO2_i = C_i \times P_i \times \Delta t
$$

전체 충전으로 발생하는 탄소 배출량은 다음과 같다.

$$
CO2_{total} =
\sum_{i=1}^{n} C_i \times P_i \times \Delta t
$$

알고리즘의 목표는 다음 최적화 문제로 표현할 수 있다.

$$
\min_{P_1, \ldots, P_n}
\sum_{i=1}^{n} C_i P_i \Delta t
$$

단, 다음 조건을 만족해야 한다.

$$
0 \le P_i \le P_{max}
$$

$$
\sum_{i=1}^{n} P_i \eta \Delta t
\ge E_{required}
$$

즉, **탄소 배출량은 최소화하되 필요한 충전 에너지는 반드시 확보**한다.

---

## 8. 실시간 제어 절차

매 5분마다 다음 절차를 반복한다.

```text
1. 차량의 현재 SOC를 읽는다.
2. E_required를 다시 계산한다.
3. 종료 시각까지 남은 5분 슬롯을 만든다.
4. Electricity Maps에서 각 슬롯의 C_i를 가져온다.
5. E_slot과 n_required를 계산한다.
6. 탄소 집약도가 낮은 순서로 충전 슬롯을 선택한다.
7. 현재 슬롯이 선택되었으면 충전한다.
8. 선택되지 않았으면 충전을 일시정지한다.
9. 5분 후 1번부터 다시 수행한다.
```

새로운 SOC와 탄소 집약도 데이터를 반영해 매번 계획을 수정하므로, 이를 이동 지평선 제어 방식이라고 한다.

---

## 9. 의사코드

```python
DELTA_T = 5 / 60  # hour

while now < deadline:
    soc = vehicle.get_soc()
    current_energy = battery_capacity * soc
    required_energy = max(0, target_energy - current_energy)

    if required_energy <= 0:
        charger.stop()
        break

    slots = make_5_minute_slots(now, deadline)
    carbon = electricity_maps.get_forecast(slots)

    energy_per_slot = max_power * efficiency * DELTA_T
    required_slots = ceil(required_energy / energy_per_slot)

    if len(slots) < required_slots:
        charger.set_power(max_power)
    else:
        selected_slots = sorted(
            slots,
            key=lambda slot: carbon[slot]
        )[:required_slots]

        if current_slot() in selected_slots:
            charger.set_power(max_power)
        else:
            charger.stop()

    wait_until_next_5_minute_slot()
```

---

## 10. 동작 예시

필요한 에너지가 2kWh이고, 5분당 충전 가능 에너지가 0.5kWh라고 하자.

$$
n_{required} = \left\lceil\frac{2}{0.5}\right\rceil = 4
$$

향후 탄소 집약도가 다음과 같다면,

| 슬롯  | 탄소 집약도 |
| ----- | ----------: |
| 10:00 |         400 |
| 10:05 |         250 |
| 10:10 |         180 |
| 10:15 |         320 |
| 10:20 |         150 |
| 10:25 |         220 |

탄소 집약도가 낮은 4개 슬롯을 선택한다.

```text
10:20 → 150
10:10 → 180
10:25 → 220
10:05 → 250
```

따라서 현재 시각이 10:00이면 충전을 중지하고, 선택된 시간대에 충전한다.

---

## 11. 알고리즘 요약

$$
\boxed{
\text{필요 에너지 계산}
\rightarrow
\text{남은 슬롯 생성}
\rightarrow
\text{탄소 집약도 정렬}
\rightarrow
\text{낮은 슬롯 선택}
\rightarrow
\text{현재 충전기 제어}
}
$$

핵심은 다음 한 문장으로 정리할 수 있다.

> 종료 목표 시각까지 필요한 충전량을 확보할 수 있는 범위에서, 탄소 집약도가 가장 낮은 5분 슬롯에 충전을 배정하고 매 5분마다 계획을 다시 계산한다.

---

## 12. 백테스트 실행

프로젝트의 `.env`와 Electricity Maps API 클라이언트를 이용해 100개 시나리오를 실행한다.

```bash
bun run backtest
```

기본값은 서울 좌표, 100회, 고정 난수 시드 `20260812`이다. 다른 위치나 실행 횟수도 지정할 수 있다.

```bash
bun run backtest --lat 13.7563 --lon 100.5018 --runs 100 --seed 20260812
```

결과는 `reports/charging-backtest-latest.json`에 저장된다. 각 시나리오에서 다음 두 방식을 같은 충전량과 종료시간 조건으로 비교한다.

- 기준 방식: 시작 시점부터 목표량에 도달할 때까지 연속 충전
- 최적화 방식: 충전 가능 구간에서 탄소 집약도가 낮은 슬롯부터 충전
