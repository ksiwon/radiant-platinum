import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending, DoubleSide, Object3D,
  type Group, type InstancedMesh, type Mesh, type MeshBasicMaterial,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  abs, color, dot, exp, float, fwidth, max, min, mod, normalView, positionViewDirection,
  saturate, select, smoothstep, uniform, uv, vec2,
} from 'three/tsl'
import type { Status } from '../../engine/pokemon/instance'
import type { BattleView, ViewMon } from '../../engine/battle/view'
import type { SideId, SlotId } from '../../engine/battle/events'
import { battleClock } from '../../engine/battle/presentationClock'
import { CAMERA } from '../../engine/battle/shots'
import { ballOpen } from './stageRefs'
import { BdspEffect } from './fx/BdspEffect'
import { fxIndex, shinySeqPlan } from './fx/moveSeq'
import { BdspSequence } from './fx/BdspSequence'
import type { SeqPlan } from '../../engine/battle/fx/sequence'

type WeatherKind = 'none' | 'rain' | 'snow' | 'sand' | 'sun'

export function battleWeatherKind(weather: string | null): WeatherKind {
  const id = (weather ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (id.includes('rain')) return 'rain'
  if (id.includes('hail') || id.includes('snow')) return 'snow'
  if (id.includes('sand')) return 'sand'
  if (id.includes('sun')) return 'sun'
  return 'none'
}

export function statusAuraColor(status: Status): string | null {
  switch (status) {
    case 'brn': return '#ff6a3d'
    case 'par': return '#ffe34c'
    case 'psn': case 'tox': return '#a766e8'
    case 'frz': return '#8cecff'
    case 'slp': return '#8ba0dd'
    default: return null
  }
}

export function visibleSideConditions(conditions: ReadonlyMap<string, number>): string[] {
  const known = new Set([
    'reflect', 'lightscreen', 'safeguard', 'mist',
    'spikes', 'toxicspikes', 'stealthrock',
  ])
  return [...conditions.keys()].filter((id) => known.has(id))
}

/**
 * 이 자리에 몸에 붙는 연출(상태 고리·혼란·씨뿌리기·대타·색다른 반짝임)을 그리는가.
 *
 * ⚠️ **몸이 없는 자리에는 안 그린다.** 쓰러짐은 `presence`만 `down`으로 바꾸고 `volatiles`를
 * 그대로 두며, 잡힌 볼은 `active`를 비우지 않는다 (`engine/battle/view` — 엔진 상태는 안 고친다).
 * 그것을 그대로 따라 그리면 몸(`BattleStage`의 `Slot`)이 사라진 빈 자리에서 혼란 고리와
 * 대타 인형이 계속 돌고, 색다른 포켓몬을 잡으면 반짝이가 볼 둘레를 돌았다
 */
export function auraShown(
  mon: ViewMon | null, slot: SlotId, lastBall: BattleView['lastBall'],
): mon is ViewMon {
  if (!mon || mon.presence !== 'alive') return false
  return !(lastBall?.caught === true && lastBall.slot === slot)
}

interface SpotProps {
  spotAt: (slot: SlotId) => [number, number]
}

const WEATHER_PARTICLES = 72

/** 날씨 → BDSP `WeatherData` 차례 (1 쾌청 · 2 비 · 3 싸라기눈 · 4 모래바람) */
const BDSP_WEATHER: Readonly<Record<WeatherKind, string | null>> = { sun: '1', rain: '2', snow: '3', sand: '4', none: null }

/**
 * 날씨 — **BDSP가 무대에 까는 이펙트가 있으면 그것이 선다**(`et001_rain01` · `et002_hail01` · `et003_sandstorm01` ·
 * `et004_sunny01` — `WeatherData.MainFileName`). 묶음이 옛 판(2)이면 아래의 지은 것(상자 · 팔면체 · 해)으로 선다
 */
function Weather({ weather }: { weather: string | null }) {
  const kind = battleWeatherKind(weather)
  const [table, setTable] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    let alive = true
    // 굽다 빠진 프리팹(`missingPrefabs`)은 표에서 지운다 — 그 날씨는 지은 것으로 선다. 이름만 남기면 아무것도 안 떴다
    void fxIndex().then((idx) => {
      if (!alive) return
      const missing = new Set((idx?.missingPrefabs ?? []).map((p) => p.toLowerCase()))
      // ⚠️ 우박(`et002_hail01`)은 입자가 살아 있는데 배틀 카메라 안에 아무것도 안 보인다(2026-10-07 `/fxlab` · 배틀 실측) —
      // 원인을 찾을 때까지 지은 우박으로 선다 (`docs/orders/FOLLOWUP_20261007.md`)
      missing.add('et002_hail01')
      const table = Object.entries(idx?.weather ?? {}).filter(([, prefab]) => !missing.has(prefab.toLowerCase()))
      setTable(Object.fromEntries(table))
    })
    return () => { alive = false }
  }, [])
  const slot = BDSP_WEATHER[kind]
  const prefab = slot === null ? null : table?.[slot] ?? null
  if (prefab !== null) return <BdspEffect key={prefab} name={prefab} loop />
  return <BuiltWeather kind={kind} />
}

function BuiltWeather({ kind }: { kind: WeatherKind }) {
  const meshRef = useRef<InstancedMesh>(null)
  const sunRef = useRef<Group>(null)
  const layout = useMemo(() => Array.from({ length: WEATHER_PARTICLES }, (_, index) => ({
    x: ((index * 37) % 101) / 101 * 22 - 11,
    y: ((index * 53) % 97) / 97 * 9 + 0.5,
    z: ((index * 71) % 103) / 103 * 18 - 9,
    spin: (index % 9) * 0.31,
  })), [])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (mesh) {
      mesh.visible = kind === 'rain' || kind === 'snow' || kind === 'sand'
      if (mesh.visible) {
        const dummy = new Object3D()
        const time = clock.elapsedTime
        for (let index = 0; index < layout.length; index += 1) {
          const p = layout[index]!
          if (kind === 'rain') {
            dummy.position.set(p.x + p.y * 0.18, ((p.y - time * 10) % 10 + 10) % 10, p.z)
            dummy.rotation.set(0, 0, -0.18)
            dummy.scale.set(0.025, 0.52, 0.025)
          } else if (kind === 'snow') {
            const fall = ((p.y - time * 1.2) % 10 + 10) % 10
            dummy.position.set(p.x + Math.sin(time + p.spin) * 0.5, fall, p.z)
            dummy.rotation.set(time * 0.7 + p.spin, time * 0.5, p.spin)
            dummy.scale.setScalar(0.085 + (index % 3) * 0.025)
          } else {
            const sweep = ((p.x + time * 5) % 22 + 22) % 22 - 11
            dummy.position.set(sweep, 0.15 + (index % 7) * 0.12, p.z + Math.sin(time + p.spin))
            dummy.rotation.set(p.spin, time * 2 + p.spin, p.spin * 0.5)
            dummy.scale.set(0.09, 0.025, 0.09)
          }
          dummy.updateMatrix()
          mesh.setMatrixAt(index, dummy.matrix)
        }
        mesh.instanceMatrix.needsUpdate = true
      }
    }
    if (sunRef.current) {
      sunRef.current.visible = kind === 'sun'
      sunRef.current.rotation.z = clock.elapsedTime * 0.12
    }
  })

  const color = kind === 'rain' ? '#8ad9ff' : kind === 'snow' ? '#eafcff' : '#d7b06b'
  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, WEATHER_PARTICLES]} frustumCulled={false}>
        {kind === 'snow' ? <octahedronGeometry args={[1, 0]} /> : <boxGeometry args={[1, 1, 1]} />}
        <meshBasicMaterial color={color} transparent opacity={kind === 'sand' ? 0.48 : 0.7} />
      </instancedMesh>
      <group ref={sunRef} visible={false} position={[0, 7.5, -5]}>
        <mesh>
          <sphereGeometry args={[1.15, 20, 12]} />
          <meshBasicMaterial color="#fff5a8" toneMapped={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.65, 0.055, 8, 48]} />
          <meshBasicMaterial color="#ffd85c" transparent opacity={0.6} toneMapped={false} />
        </mesh>
        <pointLight color="#ffc95a" intensity={2.2} distance={18} decay={2} />
      </group>
    </group>
  )
}

function StatusAura({ mon, slot, position }: { mon: ViewMon; slot: SlotId; position: [number, number] }) {
  const hostRef = useRef<Group>(null)
  const color = statusAuraColor(mon.status)
  const substitute = mon.volatiles.has('substitute')
  const bdspShiny = useBdspShiny()

  useFrame(() => {
    // 몸은 볼이 열릴 때까지 안 나온다 (`stageRefs.ballOpen`) — 몸에 붙는 것도 같이 기다린다.
    // 안 그러면 등판할 때 볼이 날아오기 전에 반짝이부터 보였다
    if (hostRef.current) hostRef.current.visible = battleClock.now() >= (ballOpen[slot] ?? 0)
  })

  return (
    <group ref={hostRef} position={[position[0], 0, position[1]]}>
      {/*
        ⚠️ **상태이상에 몸을 도는 고리 · 마름모를 안 띄운다** (I-p09-0). 원작은 상태를 HP 칸의 표식으로만 내내 보이고, 몸에는
        피해 틱 때 잠깐 연출이 날 뿐이다. 몸 크기와 상관없는 고정 크기 토러스가 등의 나무를 뚫고, 옆에서 보면 상대 쪽까지 뻗은
        주황 원판으로 읽혔다
      */}
      {color && mon.status === 'frz' && (
        <group>
          <mesh position={[0, 0.75, 0]} scale={[0.72, 1.05, 0.72]}>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color="#b9f4ff" transparent opacity={0.26} roughness={0.08} />
          </mesh>
        </group>
      )}
      {/*
        ⚠️ **혼란 · 씨뿌리기는 몸에 내내 붙는 것이 없다.** BDSP의 상태 지속 표(`BattleStatusEffectObserverData`)는 마비 · 잠듦 ·
        얼음 · 화상 · 독 여섯 줄뿐이고, 씨뿌리기는 턴 끝 틱에만 새싹(`ew073_turn`)이 돋았다 진다. 늘 돌던 노란 고리 · 덩굴 고리는
        지어낸 것이라 걷었다 — 걸린 순간 · 틱의 연출은 `StatusVfx`가 낸다
      */}
      {substitute && (
        <group position={[0.62, 0.25, 0.28]} scale={0.42}>
          <mesh position={[0, 0.55, 0]} castShadow>
            <sphereGeometry args={[0.58, 14, 10]} />
            <meshStandardMaterial color="#78b86f" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.05, 0]} castShadow>
            <capsuleGeometry args={[0.36, 0.42, 5, 10]} />
            <meshStandardMaterial color="#68a85f" roughness={0.85} />
          </mesh>
          <mesh position={[-0.2, 0.65, 0.48]}><sphereGeometry args={[0.06, 8, 6]} /><meshBasicMaterial color="#17231a" /></mesh>
          <mesh position={[0.2, 0.65, 0.48]}><sphereGeometry args={[0.06, 8, 6]} /><meshBasicMaterial color="#17231a" /></mesh>
        </group>
      )}
      {mon.shiny && bdspShiny === false && <ShinySparkles />}
    </group>
  )
}

/**
 * BDSP 별(`ee003`)이 실제로 돌 수 있는가. 표를 받기 전에는 `null` — 그동안은 아무것도 안 띄운다.
 * 목록에 이름만 있는지가 아니라 **계획이 서는지**를 본다 — 시퀀스를 못 읽거나 입자가 0이면 옛 반짝이로 선다
 */
function useBdspShiny(): boolean | null {
  const [has, setHas] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    shinySeqPlan(true).then((p) => { if (alive) setHas(p !== null) }, () => { if (alive) setHas(false) })
    return () => { alive = false }
  }, [])
  return has
}

/**
 * 색이 다른 포켓몬이 볼에서 나올 때 **한 번** 별이 튄다 — BDSP `ee003`(`BattleMiscEffectData` 2 「レア」). 원작 플래티나도 등판 때
 * 한 번이다. 볼이 열리는 시각(`ballOpen`)이 새로 서면 그때부터 튼다 — 거뒀다 다시 내보내도 다시 튄다
 */
function ShinyBurst({ slot, spotAt }: { slot: SlotId } & SpotProps) {
  const [plan, setPlan] = useState<SeqPlan | null>(null)
  const [at, setAt] = useState<number | null>(null)
  const seen = useRef<number | null>(null)
  useEffect(() => {
    let alive = true
    void shinySeqPlan(slot.startsWith('p1')).then((p) => { if (alive) setPlan(p) })
    return () => { alive = false }
  }, [slot])
  useFrame(() => {
    const open = ballOpen[slot]
    if (open === undefined || open === seen.current || battleClock.now() < open) return
    seen.current = open
    setAt(open)
  })
  if (plan === null || at === null) return null
  return (
    <BdspSequence
      key={at}
      plan={plan}
      roles={[slot, null]}
      spotAt={spotAt as (s: string) => [number, number]}
      startedAt={at}
      camera={false}
      bodies={[false, false]}
    />
  )
}

function ShinySparkles() {
  const rootRef = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!rootRef.current) return
    rootRef.current.rotation.y = clock.elapsedTime * 1.9
    rootRef.current.position.y = 0.75 + Math.sin(clock.elapsedTime * 2.2) * 0.08
  })
  return (
    <group ref={rootRef}>
      {Array.from({ length: 7 }, (_, index) => {
        const angle = index / 7 * Math.PI * 2
        return (
          <mesh key={index} position={[Math.cos(angle) * 0.9, (index % 3) * 0.3, Math.sin(angle) * 0.9]} rotation={[0.7, angle, 0.4]}>
            <octahedronGeometry args={[0.11 + (index % 2) * 0.04, 0]} />
            <meshBasicMaterial color={index % 2 ? '#fff5a3' : '#9df5ff'} toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

/** 스텔스록 조각 하나. 자리는 그 쪽 발판 가운데에서 잰 오프셋(m)이다 */
interface RockShard {
  x: number
  y: number
  z: number
  /** 조각 지름의 절반(m) */
  size: number
  /** 세로로 눌린 비율 — 둥근 다면체가 피라미드나 공으로 안 읽히게 */
  squash: number
  /** 떠오름·회전의 위상(rad) */
  phase: number
  /** 정십이면체인가(아니면 정이십면체) — 두 꼴을 섞어 같은 돌이 되풀이되어 보이지 않게 */
  dodeca: boolean
  tint: string
}

/**
 * 스텔스록 조각이 서는 바깥 고리의 두 반지름(m, x · z).
 *
 * 발판 반지름이 1.5m라(`BattleStage`의 `MINE`·`FOE`) 그 안쪽 가장자리에 걸친다. 몸 둘레를 바짝
 * 두르면 우리 쪽은 카메라 코앞이라 조각이 화면 4분의 1을 덮었다(I-p05-3)
 */
const ROCK_RING = { x: 1.3, z: 0.9 } as const
/** 고리 위에 세워 보는 자리 수. 시선에 걸린 자리를 빼고 `ROCK_MAX`까지만 쓴다 */
const ROCK_CANDIDATES = 12
/** 조각 수의 위끝 */
export const ROCK_MAX = 8
/** 조각 크기(지름의 절반, m)의 아래·위끝 */
export const ROCK_SIZE = [0.07, 0.12] as const
/** 조각이 뜨는 높이(m)의 아래·위끝. 땅에 붙어 떠야 몸을 안 가린다 */
export const ROCK_HEIGHT = [0.1, 0.25] as const
/**
 * 상대 몸의 반폭(m) — 시선에서 이만큼은 비운다.
 *
 * 몸 크기는 종마다 다르지만 조각은 한 번 놓으면 그대로다. 발판(반지름 1.5m) 위에 선 몸 대부분이
 * 이 안에 든다
 */
const ROCK_TARGET_HALF = 0.9
/** 갈회색 셋. 한 빛깔이면 다시 자리표시 도형으로 읽힌다 */
const ROCK_TINTS = ['#6e6258', '#625750', '#7a6d61'] as const

/** 0~1 사이의 고르게 흩어진 수. 조각마다 같은 값이 나와야 리렌더에 안 튄다 */
function scatter(index: number, salt: number): number {
  const v = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

/**
 * 스텔스록 조각의 자리.
 *
 * 그 쪽 발판 가운데(`center`)를 두른 바깥 고리에 세우되, **카메라에서 상대 몸으로 가는 시선 안쪽**에
 * 드는 자리는 건너뛴다. 카메라 앞을 지나는 조각이 상대 꼬마돌 얼굴을 가렸다(I-p05-3).
 * 시선은 수평각으로 잰다 — 상대 몸이 보이는 각(`ROCK_TARGET_HALF`)에 조각 자신이 보이는 각을 더한
 * 것보다 가까우면, 그리고 조각이 몸보다 카메라에 가까우면 가린다고 본다. 몸 뒤에 선 조각은 둔다.
 *
 * ⚠️ 원작 DS는 걸린 동안 무대에 아무것도 안 그린다 — 깔린 것은 `battle_lib`·`battle_script`의
 * 깃발(`SIDE_CONDITION_STEALTH_ROCK`)일 뿐이고 그림 쪽(`battle_anim`)에는 한 번도 안 나온다.
 * 그래서 자리·크기·빛깔은 우리 값이다
 *
 * @param camera 카메라의 수평 자리 (x, z) — 무대 좌표
 * @param targets 상대 몸들의 수평 자리 (x, z)
 */
export function stealthRockLayout(
  center: readonly [number, number],
  camera: readonly [number, number],
  targets: readonly (readonly [number, number])[],
): RockShard[] {
  const shards: RockShard[] = []
  for (let index = 0; index < ROCK_CANDIDATES && shards.length < ROCK_MAX; index += 1) {
    const angle = (index + scatter(index, 1) * 0.4) / ROCK_CANDIDATES * Math.PI * 2
    const reach = 1 + (scatter(index, 2) - 0.5) * 0.12
    const x = Math.cos(angle) * ROCK_RING.x * reach
    const z = Math.sin(angle) * ROCK_RING.z * reach
    const size = ROCK_SIZE[0] + scatter(index, 3) * (ROCK_SIZE[1] - ROCK_SIZE[0])
    if (rockBlocksView([center[0] + x, center[1] + z], size, camera, targets)) continue
    shards.push({
      x, z, size,
      y: ROCK_HEIGHT[0] + scatter(index, 4) * (ROCK_HEIGHT[1] - ROCK_HEIGHT[0]),
      squash: 0.6 + scatter(index, 5) * 0.25,
      phase: scatter(index, 6) * Math.PI * 2,
      dodeca: index % 2 === 0,
      tint: ROCK_TINTS[index % ROCK_TINTS.length]!,
    })
  }
  return shards
}

/** 그 자리 조각이 카메라와 상대 몸 사이 시선에 드는가 (수평각) */
export function rockBlocksView(
  at: readonly [number, number],
  size: number,
  camera: readonly [number, number],
  targets: readonly (readonly [number, number])[],
): boolean {
  const ax = at[0] - camera[0]
  const az = at[1] - camera[1]
  const near = Math.hypot(ax, az)
  return targets.some(([tx, tz]) => {
    const bx = tx - camera[0]
    const bz = tz - camera[1]
    const far = Math.hypot(bx, bz)
    if (near >= far) return false
    const between = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz))
    return between < Math.atan2(ROCK_TARGET_HALF, far) + Math.atan2(size, near)
  })
}

/** 막 하나의 그 순간 밝기 (`barrierLook`) */
interface BarrierLook {
  /** 육각 격자와 바탕의 세기 (0~1) */
  grid: number
  /** 테두리 빛의 세기 (0~1) */
  rim: number
  /** 반짝이며 훑고 올라가는 띠의 높이 (판 UV의 v). 판 밖이면 띠가 없다 */
  sweep: number
  /** 발밑 육각 고리의 세기 (0~1) */
  ring: number
}

/** 막이 차오르는 시간(초) */
const WALL_RISE = 0.3
/** 반짝이는 띠가 판 아래에서 위로 훑는 시간(초) */
const WALL_SWEEP = 0.9
/** 다 선 막을 그대로 보이는 끝(초) */
const WALL_HOLD = 1.2
/** 막이 테두리만 남기고 가라앉는 시간(초) */
const WALL_SETTLE = 0.8
/** 가라앉은 뒤에도 남는 테두리 세기 */
export const WALL_REST_RIM = 0.3
/** 띠가 없을 때의 높이 — 판(0~1) 밖이다 */
const SWEEP_OFF = 2

function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

/**
 * 리플렉터·빛의장막·신비의부적·흰안개 막이 걸린 뒤 `age`초에 얼마나 보이는가.
 *
 * 걸리는 순간 반짝이며 판이 서고(`WALL_RISE` · 띠가 `WALL_SWEEP`에 걸쳐 훑는다), 잠깐 선 뒤
 * 바닥 육각 고리와 옅은 테두리만 남긴다. 판을 내내 세워 두면 상대 쪽 하늘 절반이 탈색되어
 * 보였다(I-p07-8).
 *
 * ⚠️ 원작 DS는 걸린 동안 무대에 아무것도 안 그린다 — 걸리는 순간의 기술 연출뿐이다
 * (`SIDE_CONDITION_REFLECT`·`LIGHT_SCREEN`은 `battle_lib`·`battle_script`에만 나온다). 남는 고리와
 * 시간은 우리 값이다
 */
export function barrierLook(age: number): BarrierLook {
  if (age < 0) return { grid: 0, rim: 0, sweep: SWEEP_OFF, ring: 0 }
  const rise = ease(age / WALL_RISE)
  const settle = ease((age - WALL_HOLD) / WALL_SETTLE)
  const lit = rise * (1 - settle)
  return {
    grid: lit,
    rim: lit + WALL_REST_RIM * settle,
    sweep: age < WALL_SWEEP ? -0.15 + 1.3 * (age / WALL_SWEEP) : SWEEP_OFF,
    ring: settle,
  }
}

/** 막 판의 크기(m, 가로 · 세로)와 가운데 높이. 몸 앞을 가리되 하늘까지 덮지 않는다 */
const WALL_SIZE = [1.8, 1.2] as const
const WALL_Y = 0.7
/** 육각 칸 하나의 너비(m) */
const WALL_CELL = 0.12
/** 바탕 알파 — 칸 안쪽은 거의 비친다 */
const WALL_BASE = 0.065
/** 발밑 고리의 반지름(m)과 두께 */
const WALL_RING = 1.15
const WALL_RING_WIDTH = 0.07

/**
 * 막 판의 재질.
 *
 * 육각 격자 · 가장자리로 갈수록 흐려지는 바탕 · 테두리 빛 · 비스듬히 볼수록 밝은 빛(fresnel)을
 * 한 노드 재질에 담는다. 더하기로 섞고 깊이를 안 쓴다 — 뒤의 몸과 나무를 탈색하지 않고 빛만 얹는다.
 *
 * ⚠️ **TSL 노드 재질이다** (`SplParticles`와 같은 까닭 — WebGPU 길에서는 날 GLSL이 안 선다)
 */
function wallMaterial(tint: string) {
  const grid = uniform(0)
  const rim = uniform(0)
  const sweep = uniform(SWEEP_OFF)
  const [w, h] = WALL_SIZE
  const r3 = Math.sqrt(3)

  const at = uv()
  // 육각 격자: 두 엇갈린 격자 중 가까운 칸 가운데를 고르고, 거기서 육각 거리를 잰다
  const p = at.mul(vec2(w / WALL_CELL, h / WALL_CELL))
  const lattice = vec2(1, r3)
  const half = lattice.mul(0.5)
  const a = mod(p, lattice).sub(half)
  const b = mod(p.sub(half), lattice).sub(half)
  const cell = select(dot(a, a).lessThan(dot(b, b)), a, b)
  const q = abs(cell)
  const hex = max(dot(q, vec2(0.5, r3 / 2)), q.x)
  const blur = fwidth(hex).max(1e-4)
  const line = smoothstep(float(0.5).sub(blur.mul(2)).sub(0.03), float(0.5), hex)

  // 판 가장자리까지의 거리(m). 바탕은 가장자리로 갈수록 흐리고, 테두리는 가장자리에서만 빛난다
  const edge = min(min(at.x, float(1).sub(at.x)).mul(w), min(at.y, float(1).sub(at.y)).mul(h))
  const inner = smoothstep(float(0), float(0.35), edge)
  const border = float(1).sub(smoothstep(float(0), float(0.07), edge))
  // ⚠️ 제곱은 `pow`로 안 한다 — 밑이 음수면 WGSL·GLSL 모두 값이 정해지지 않는다
  const off = at.y.sub(sweep).div(0.08)
  const band = exp(off.mul(off).negate())
  const glance = float(1).sub(abs(dot(normalView, positionViewDirection)))
  const fresnel = glance.mul(glance)

  const body = float(WALL_BASE).add(line.mul(0.5)).add(band.mul(line.mul(1.2).add(0.25))).mul(inner).mul(grid)
  const glow = body.add(border.mul(0.8).mul(rim)).mul(fresnel.mul(0.8).add(0.7))

  const material = new MeshBasicNodeMaterial()
  material.transparent = true
  material.depthWrite = false
  material.side = DoubleSide
  material.blending = AdditiveBlending
  material.toneMapped = false
  material.colorNode = color(tint)
  material.opacityNode = saturate(glow)
  return { material, grid, rim, sweep }
}

/** 걸린 막 하나. 걸린 순간에 마운트되므로 첫 프레임이 곧 걸린 때다 */
function BarrierWall({ tint, layer, side }: { tint: string; layer: number; side: SideId }) {
  const wall = useMemo(() => wallMaterial(tint), [tint])
  const ringRef = useRef<Mesh>(null)
  const since = useRef<number | null>(null)
  useEffect(() => () => wall.material.dispose(), [wall])
  useFrame(() => {
    const now = battleClock.now()
    since.current ??= now
    const look = barrierLook(now - since.current)
    wall.grid.value = look.grid
    wall.rim.value = look.rim
    wall.sweep.value = look.sweep
    const ring = ringRef.current
    if (ring) {
      ring.visible = look.ring > 0
      ;(ring.material as MeshBasicMaterial).opacity = look.ring * (0.3 + Math.sin(now * 2.2 + layer) * 0.06)
    }
  })
  const ahead = side === 'p1' ? -1 : 1
  const radius = WALL_RING + layer * (WALL_RING_WIDTH + 0.05)
  return (
    <group>
      <mesh position={[0, WALL_Y, ahead * (0.65 + layer * 0.06)]} material={wall.material} renderOrder={2}>
        <planeGeometry args={[WALL_SIZE[0], WALL_SIZE[1]]} />
      </mesh>
      <mesh ref={ringRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 6]} visible={false} renderOrder={2}>
        <ringGeometry args={[radius, radius + WALL_RING_WIDTH, 6, 1]} />
        <meshBasicMaterial color={tint} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

const WALL_TINT: Readonly<Record<string, string>> = {
  reflect: '#dfb0ff',
  lightscreen: '#ffe98b',
  safeguard: '#9df4df',
  mist: '#9df4df',
}

function StealthRocks({ shards }: { shards: readonly RockShard[] }) {
  const rootRef = useRef<Group>(null)
  useFrame(() => {
    const root = rootRef.current
    if (!root) return
    const time = battleClock.now()
    root.children.forEach((child, index) => {
      const shard = shards[index]
      if (!shard) return
      child.position.y = shard.y + Math.sin(time * 0.9 + shard.phase) * 0.025
      child.rotation.set(shard.phase, time * 0.35 + shard.phase, shard.phase * 0.5)
    })
  })
  return (
    <group ref={rootRef}>
      {shards.map((shard, index) => (
        <mesh
          key={index}
          position={[shard.x, shard.y, shard.z]}
          scale={[shard.size, shard.size * shard.squash, shard.size * 0.9]}
          castShadow
        >
          {shard.dodeca ? <dodecahedronGeometry args={[1, 0]} /> : <icosahedronGeometry args={[1, 0]} />}
          <meshStandardMaterial color={shard.tint} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function Barrier({ side, conditions, spotAt, foes }: {
  side: SideId
  conditions: ReadonlyMap<string, number>
  /** 카메라가 보는 상대 몸 자리들 — 스텔스록 조각은 그 시선을 비운다 */
  foes: readonly SlotId[]
} & SpotProps) {
  const rootRef = useRef<Group>(null)
  const slot = side === 'p1' ? 'p1a' : 'p2a'
  const [x, z] = spotAt(slot)
  const ids = visibleSideConditions(conditions)
  useFrame(({ clock }) => {
    if (rootRef.current) rootRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.7) * 0.08
  })
  const walls = ids.filter((id) => id in WALL_TINT)
  const spikes = ids.some((id) => id === 'spikes' || id === 'toxicspikes')
  const rocks = ids.includes('stealthrock')
  const targetKey = foes.map((foe) => spotAt(foe).join(',')).join(';')
  const shards = useMemo(
    () => rocks
      ? stealthRockLayout([x, z], [CAMERA.position[0], CAMERA.position[2]], foes.map((foe) => spotAt(foe)))
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `spotAt`은 렌더마다 새 함수다. 자리 값(`x`·`z`·`targetKey`)이 바뀔 때만 다시 놓는다
    [rocks, x, z, targetKey],
  )
  return (
    <group position={[x, 0, z]}>
      <group ref={rootRef}>
        {walls.map((id, layer) => (
          <BarrierWall key={id} tint={WALL_TINT[id]!} layer={layer} side={side} />
        ))}
        {spikes && Array.from({ length: 5 }, (_, index) => {
          const angle = index / 5 * Math.PI * 2
          return (
            <mesh key={index} position={[Math.cos(angle) * 1.05, 0.12, Math.sin(angle) * 0.65]}>
              <coneGeometry args={[0.12, 0.38, 5]} />
              <meshStandardMaterial color={ids.includes('toxicspikes') ? '#8747a8' : '#9ba0a7'} metalness={0.25} roughness={0.55} />
            </mesh>
          )
        })}
      </group>
      {/* 조각은 막처럼 흔들지 않는다 — 고리째 돌면 시선에서 비운 자리로 조각이 밀려든다 */}
      {rocks && <StealthRocks shards={shards} />}
    </group>
  )
}

function FieldConditions({ field }: { field: ReadonlySet<string> }) {
  const rootRef = useRef<Group>(null)
  const trick = field.has('trickroom')
  const gravity = field.has('gravity')
  const magic = field.has('magicroom') || field.has('wonderroom')
  useFrame(({ clock }) => {
    if (rootRef.current) rootRef.current.rotation.y = clock.elapsedTime * 0.07
  })
  return (
    <group ref={rootRef}>
      {trick && (
        <mesh position={[0, 3.1, 0]}>
          <boxGeometry args={[11, 6, 9]} />
          <meshBasicMaterial color="#cc75ff" wireframe transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
      {gravity && (
        <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[5.2, 0.09, 8, 64]} />
          <meshBasicMaterial color="#7548b5" transparent opacity={0.48} toneMapped={false} />
        </mesh>
      )}
      {magic && (
        <mesh position={[0, 2.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[4.2, 0.055, 8, 56]} />
          <meshBasicMaterial color="#73e5ef" transparent opacity={0.38} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

export function BattleAtmosphere({ view, spotAt }: {
  view: BattleView | null
} & SpotProps) {
  if (!view) return null
  // 싱글에서는 `p2b`가 늘 비어 있다. 쓰러진 몸도 `active`에 남으므로 조각 자리가 기절에 안 튄다
  const standing = (['p2a', 'p2b'] as const).filter((slot) => view.active[slot] != null)
  const foes: readonly SlotId[] = standing.length > 0 ? standing : ['p2a']
  return (
    <group>
      <Weather weather={view.weather} />
      {(Object.entries(view.active) as [SlotId, ViewMon | null][]).map(([slot, mon]) =>
        auraShown(mon, slot, view.lastBall) && (
          <StatusAura key={slot} mon={mon} slot={slot} position={spotAt(slot)} />
        ))}
      {(Object.entries(view.active) as [SlotId, ViewMon | null][]).map(([slot, mon]) =>
        mon?.shiny === true && <ShinyBurst key={`shiny-${slot}`} slot={slot} spotAt={spotAt} />)}
      <Barrier side="p1" conditions={view.sideConditions.p1} spotAt={spotAt} foes={foes} />
      <Barrier side="p2" conditions={view.sideConditions.p2} spotAt={spotAt} foes={foes} />
      <FieldConditions field={view.field} />
    </group>
  )
}
