// 배틀 무대 (PLAN §7.4) — 배틀이 열려 있는 동안만 씬에 선다.
//
// **오버월드와 같은 Canvas를 쓴다.** 영속 Canvas 불변식(PLAN §3.3) 때문에 배틀용
// 캔버스를 따로 띄울 수 없고, 그럴 이유도 없다 — 무대를 신오에서 멀리 떨어뜨려 놓고
// (`STAGE_ORIGIN`) 카메라만 옮긴다. 그래서 배틀에 들어갈 때 컨텍스트 재생성도,
// 셰이더 재컴파일도 없다.
//
// 포켓몬은 **BDSP의 3D 모델**로 선다(DATA.md §2.17.2). 4세대 배틀 자체는 도트
// 한 장이었고 오래 그렇게 세워 왔는데, 무대를 BDSP의 진짜 3D로 갈아 끼우고 나니
// 그 한 장만 화면에서 튀었다. 지어낸 것이 아니라 공식 리메이크가 같은 493마리를
// 3D로 다시 만들어 둔 것을 가져온다. 모델을 못 받은 종은 도트로 떨어진다.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import {
  BackSide,
  Box3,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  Vector3,
  type BufferGeometry,
  type CanvasTexture,
  type Material,
  type Texture,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { WebGPURenderer } from 'three/webgpu'
import { warmBeforeShow } from '../warmPipelines'
import { applyLightMode } from './arenaLight'
import { preloadSplPack, SPL_WAZA } from './splPack'
import { worldState } from '../../state/worldState'
import { timeBlend } from '../../engine/map/timeOfDay'
import { mapById, world } from '../../engine/map/world'
import { arenaFor, cameraFit, hasSky } from '../../engine/battle/arena'
import { BODY_FADE_SECONDS, ClockReader, battleClock } from '../../engine/battle/presentationClock'
import { EncounterBurst } from './EncounterBurst'
import { DistortionArena } from './DistortionArena'
import { loadMotionTiming, loadMoves, loadSpecies } from '../../data/gameData'
import { useBattleStore } from '../../state/battleStore'
import type { ViewMon } from '../../engine/battle/view'
import { SLOTS, type SlotId } from '../../engine/battle/events'
import {
  arenaRoom, ballOpen, battleStage, bodyGone, clearSlotBody, impactHits, moveImpact, seqStage, slotBody, slotBox, slotRig,
  STAGE_ORIGIN, type SeqBodyPose,
} from './stageRefs'
import { BattleBallEffects } from './BattleBallEffects'
import { recallsBody } from './battleBallMotion'
import { recallSeconds } from '../../engine/battle/captureTiming'
import { bodyColor } from './bodyColor'
import { loadMonSprite, loadSpriteIndex, spriteFit } from './monSprite'
import { loadMonModel, makeBody, play, type MonBody, type MotionName } from './monModel'
import { spriteKey } from '../../engine/pokemon/form'
import { MoveVfx } from './MoveVfx'
import type { SeqCamera } from '../../engine/battle/fx/sequence'
import { clampShot, type Box } from '../../engine/battle/fx/cameraClamp'
import { NO_RETURN, stepCamera, type CameraReturn } from './battleCamera'
import { buildArenaCollider } from '../../engine/battle/fx/arenaCollider'
import { BattleAtmosphere } from './BattleAtmosphere'
import { MOVE_FRAMES, moveFramesOf } from '../../engine/battle/vfx'
import { BATTLE_FOV, CAMERA, FIGHT_LOOK_Y, PAIR_DIR, pairOffset, SLOT } from '../../engine/battle/shots'
import { useOptionsStore } from '../../state/optionsStore'
import {
  BACK_DIR,
  TIME_LOOKS,
  backFill,
  blendLooks,
  makeBlobShadow,
  makeSkyTexture,
  type TimeLook,
} from '../fx/sky'
import { useAssetUrl } from '../../data/providers/useAssetUrl'

/**
 * 무대 바닥의 높이 (실측).
 *
 * 우리가 정한 값이 아니라 그 모델의 지면이다. **무대 열여덟 벌 전부** 두 포켓몬
 * 자리 밑의 면이 y=0.000이고 `g001`만 0.001이다 (`arena.test`가 glb를 열어
 * 잰다) — 그래서 무대마다 높이를 따로 들고 다닐 이유가 없다.
 * 대체 지면(`Flat`)도 같은 높이에 둔다
 */
const GROUND = 0.001

/**
 * **자세를 먹인 뒤 얼마나 높은가**를 이 간격으로 다시 잰다 (초).
 *
 * ⚠️ 바인드 포즈의 키(`posedHeight`)로는 못 잰다. 갸라도스는 모델이 2.09m인데
 * 대기 동작이 몸을 세워서 실제로는 **3.54m**까지 올라간다(`pnpm shot --tree`로
 * 잰 값이다) — 카메라가 2.09m인 줄 알고 물러나서 머리가 화면 위로 잘려 있었다.
 *
 * ⚠️ **몇 초만 보고 끝내면 안 된다.** 처음엔 등판 뒤 3초만 봤는데, 그 사이에는
 * 아직 등판 동작이라 대기 자세의 꼭대기를 못 본다. **대기 동작일 때만** 재고
 * 배틀 내내 계속 본다 — 커진 값만 올리므로 결국 한 값에 붙는다.
 *
 * 값이 싼 일은 아니다 — `precise` 상자가 정점을 다 도느라 그 프레임이 5ms
 * 늘어난다(체육관 배틀 실측). 그래서 반 초에 한 번만 재고, 대기 동작이 여러
 * 바퀴 돌 만큼 보고 나면 **그만둔다**
 */
const WATCH_EVERY = 0.5
/** 대기 동작을 이만큼 보고 나면 더 안 잰다 (초). 대기 한 바퀴가 2~3초다 */
const WATCH_UNTIL = 9

// ── 배치 ─────────────────────────────────────────────────────────────────────
// **BDSP가 적어 둔 자리 그대로다** (`BattleDefaultPlacementData`, PLAN §4.3.1).
// z축 대칭으로 서고 카메라가 옆으로 비껴 있어서, 화면에서는 원작 DS와 같은 문법이
// 된다: 내 것이 앞쪽 왼쪽에 크게, 상대가 뒤쪽 오른쪽에 작게. 카메라까지의 거리가
// 3.9 대 7.7 — 상대가 화면에서 절반 크기다.
// ⚠️ **자리는 엔진이 갖고 있다**(`battle/shots`의 `SLOT`). 카메라 샷이 같은
// 값을 봐야 하는데, 여기와 저기에 따로 적으면 샷이 빈 발판을 겨눈다
const MINE = { ...SLOT.p1, radius: 1.5 }
const FOE = { ...SLOT.p2, radius: 1.5 }

/** 그 자리의 발판. 싱글이면 `a`만 선다 */
function spotOf(slot: SlotId): typeof MINE {
  const mine = slot.startsWith('p1')
  const base = mine ? MINE : FOE
  // ⚠️ **`PAIR_DIR`는 화면 왼쪽이다.** 카메라가 (−2.7, 5.0)에서 원점을 보므로
  // 시선의 좌우가 월드 x축과 안 맞는다 — 찍어 보고 알았다. `a`가 오른쪽,
  // `b`가 왼쪽에 서고, 둘 다 `PAIR_BIAS`만큼 왼쪽으로 밀린다
  const off = pairOffset(slot)
  return {
    ...base,
    x: base.x + PAIR_DIR[0] * off,
    z: base.z + PAIR_DIR[2] * off,
  }
}

/**
 * 등판·기절이 딱 끊기지 않게 하는 시간(초).
 *
 * ⚠️ **박자도 같은 값을 본다.** 기절 박자가 이만큼 쉬어야 몸이 다 진 뒤에
 * 「쓰러졌다!」와 교체가 온다 (`engine/battle/playback`의 `HOLD_FAINT_PRESENTATION`)
 */
const FADE = BODY_FADE_SECONDS

/**
 * 때리러 나갔다 돌아오는 시간(초)의 **위끝**.
 *
 * ⚠️ **연출 길이와 같지 않다.** 연출은 입자가 사그라지기를 기다리느라 3초까지
 * 가는데(`engine/battle/moveLength`) 몸이 그동안 계속 나가 있으면 안 된다.
 * 반대로 연출이 이보다 짧으면 다음 글이 뜬 뒤에도 몸이 아직 돌아오는 중이라
 * — 그래서 **둘 중 짧은 쪽**을 쓴다 (`lungeFor`)
 */
const LUNGE = MOVE_FRAMES / 60

/** 이 기술에서 몸이 나갔다 오는 시간(초) */
const lungeFor = (move: number | null): number =>
  Math.min(LUNGE, moveFramesOf(move) / 60)

/**
 * 0→1 진행 `k`를 **정점이 `p`에 오는** 0→1→0 곡선의 위상으로 옮긴다.
 *
 * `Math.sin(위상 × π)`에 넣으면 `k = p`에서 1이 되고 양끝에서 0이 된다.
 * `p = 0.5`면 `k`를 그대로 돌려주므로 예전과 같은 대칭 곡선이다.
 *
 * ⚠️ **양끝을 막아야 한다.** 표에 0.9 같은 값이 오면 돌아오는 구간이 거의
 * 없어서 순간이동으로 보이고, 0에 붙으면 나가는 것 없이 이미 뻗어 있다
 */
export function peakAt(k: number, p: number): number {
  const at = Math.min(0.85, Math.max(0.15, p))
  return k <= at ? (k / at) * 0.5 : 0.5 + ((k - at) / (1 - at)) * 0.5
}

/** 맞고 움찔하는 시간(초). 원작은 스프라이트가 흔들리며 깜빡인다 */
const FLINCH = 0.34
/** 깜빡이는 횟수. 이보다 잦으면 화면이 지저분해지고 뜸하면 안 보인다 */
const FLINCH_BLINKS = 5

interface SpeciesLook {
  color: string
}

/**
 * 도트로 떨어졌을 때 그림이 차지할 높이 (월드 단위).
 *
 * ⚠️ **모델을 못 받은 종만 쓴다.** 3D 모델은 BDSP가 종마다 적어 둔 배율로 서고
 * (`monModel`), 그 결과가 0.2~7.3m다. 그 한가운데쯤이라 나란히 서도 안 튄다
 */
const MON_TALL = 1.2

/**
 * 한쪽의 발판과 그 위에 선 것.
 *
 * `mine`이면 **뒷모습**이다 — 원작 문법 그대로 내 포켓몬은 등을 보이고 상대는
 * 앞을 본다. 그림이 따로 있으므로 여기서 뒤집지 않는다
 */
/**
 * 시퀀스가 시킨 동작을 아직 트는가 (초). BDSP는 동작 하나가 끝나면 대기로 돌아간다 —
 * 클립 길이를 재지 않고 동작마다 한 값으로 둔다(공격 클립이 0.8~1.3초다). 쓰러짐(`down`)은 끝 자세로 멎고
 * 시퀀스가 몸을 지울 때까지 간다. 착지(`landC`)는 피카츄 0.667초 — 그 뒤 대기로 이어진다
 */
const SEQ_MOTION_SECONDS = { attack: 1.1, damage: 0.7, cry: 1.3, wait: Infinity, down: Infinity, landB: Infinity, landC: 0.7 } as const

function seqMotionLive(pose: SeqBodyPose): boolean {
  const m = pose.motion
  return m !== null && (pose.frame - m.at) / 30 < SEQ_MOTION_SECONDS[m.name]
}

/**
 * 시퀀스의 몸 빛 (`PokemonShaderCol`)을 재질 발광으로 건다.
 *
 * 재질은 **몸이 설 때 한 번** 떼어 낸다(`ownMaterials` — 같은 종 두 마리가 재질을 나눠 쓰므로 한 마리만 빛나게) —
 * 그래서 빛날 때 새 재질이 생기지 않고 파이프라인도 등판 전에 굽힌다(`warmBeforeShow`). 끌 때는 그 재질의 원래 발광으로
 * 되돌린다. 떼어 낸 재질은 몸이 내려갈 때 놓는다(`releaseMaterials`)
 */
interface OwnedMaterial { mat: MeshStandardMaterial; emissive: [number, number, number]; intensity: number }
const owned = new WeakMap<object, OwnedMaterial[]>()
const glowing = new WeakMap<object, boolean>()

function ownMaterials(model: MonBody): void {
  if (owned.has(model.root)) return
  const list: OwnedMaterial[] = []
  model.root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const next = mats.map((m) => {
      const std = m as MeshStandardMaterial
      if (!std.emissive) return m
      const own = std.clone()
      list.push({ mat: own, emissive: [std.emissive.r, std.emissive.g, std.emissive.b], intensity: std.emissiveIntensity })
      return own
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]!
  })
  owned.set(model.root, list)
}

function releaseMaterials(model: MonBody): void {
  for (const o of owned.get(model.root) ?? []) o.mat.dispose()
  owned.delete(model.root)
  glowing.delete(model.root)
}

function glow(model: MonBody | null, g: { color: [number, number, number]; power: number } | null): void {
  if (!model) return
  const on = g !== null && g.power > 0.001 && (g.color[0] > 0 || g.color[1] > 0 || g.color[2] > 0)
  if (!on && !glowing.get(model.root)) return
  glowing.set(model.root, on)
  for (const o of owned.get(model.root) ?? []) {
    if (on) {
      o.mat.emissive.setRGB(g.color[0], g.color[1], g.color[2])
      o.mat.emissiveIntensity = g.power
    } else {
      o.mat.emissive.setRGB(o.emissive[0], o.emissive[1], o.emissive[2])
      o.mat.emissiveIntensity = o.intensity
    }
  }
}

function Slot({
  mon,
  form,
  look,
  slot,
  spot,
  other,
  mine,
  shadow,
  onBody,
}: {
  mon: ViewMon | null
  /**
   * 어느 모습인가 (PARITY §3.4).
   *
   * **배틀 도중에 바뀌는 폼도 따라간다.** `-formechange`가 `form` 사건으로
   * 올라와 뷰의 `active[slot].form`을 갈아 끼우고
   * (`engine/battle/view`의 `case 'form'`), `battleFormVisual.test`가 날씨구슬
   * 캐스퐁으로 그 자리를 잰다. 뷰에 폼이 없을 때만 명단 값으로 떨어진다
   * (`formOf`)
   */
  form: number
  look: SpeciesLook | null
  /** 이 발판의 자리 표기. 누가 때렸는지·맞았는지를 이걸로 가른다 */
  slot: SlotId
  spot: typeof MINE
  /** 상대가 선 자리. 때리러 나가는 방향을 여기서 뽑는다 */
  other: typeof MINE
  mine: boolean
  shadow: CanvasTexture | null
  /**
   * 이 자리에 **지금 선 몸의 키**를 알려 준다. 카메라가 큰 종 앞에서 물러나야 한다.
   *
   * 절대값이다 — 몸이 바뀌거나 자리가 비면 0을 보내 그 자리 몫을 비운다. 한 마리 안에서만
   * 커진 값을 올린다(아래 `grown`)
   */
  onBody: (tall: number) => void
}) {
  const body = useRef<Group>(null)
  const shade = useRef<Mesh>(null)
  /** 지금까지 본 제일 높은 자리와, 다음에 잴 시각 */
  const grown = useRef(0)
  const watch = useRef(0)
  // ⚠️ **HP가 0인 것과 화면에서 지는 것은 다른 일이다.** 예전에는 여기서
  // `mon.hp <= 0`을 봤고, 그 값이 `damage` 사건에서 이미 참이 되므로 **게이지가
  // 닳는 도중에** 몸이 먼저 사라졌다. 지는 것을 시작하는 것은 `faint` 사건뿐이다
  // (`engine/battle/view`의 `presence`)
  const fainted = mon !== null && mon.presence === 'down'
  const [art, setArt] = useState<{ map: Texture; scale: number; lift: number } | null>(null)
  const [model, setModel] = useState<MonBody | null>(null)
  /**
   * 몸을 받는 일이 **끝났는가** — 모델이든 도트든, 둘 다 못 받았든.
   *
   * ⚠️ **받는 동안은 아무것도 안 그린다.** 도형(캡슐)은 그림을 끝내 못 받은 종의 몫인데,
   * 받는 중에도 그것이 섰다 — 볼이 0.48초 만에 열리고 glb 받기와 파이프라인 굽기가
   * 216~600ms라, 판 도중 처음 나오는 마리는 종족색 캡슐이 섰다가 진짜 몸으로 바뀌었다.
   * 등판(`shown`)도 이 깃발이 설 때까지 안 차오른다. `useFrame`이 읽으므로 ref를 같이 든다
   */
  const settled = useRef(false)
  const [settledShown, setSettledShown] = useState(false)
  const settle = (): void => { settled.current = true; setSettledShown(true) }
  /**
   * **앞 몸을 거두기 시작한 시각** (`RecallPokemon`). 거두는 중이 아니면 null.
   *
   * ⚠️ 종이 바뀌는 순간 앞 몸을 지우면 거두는 빔(`BattleBallEffects`)이 빈 자리에 쏜다.
   * 그래서 서 있던 마리를 바꿔 낼 때는 앞 몸(모델이든 도트든)을 **새 몸이 올 때까지 그대로
   * 두고**, 거두기 시퀀스(`ee610` — 볼 빛에 줄어 f24에 사라진다 · `captureTiming`의 `recallSeconds`)가 그 몸을 쥔다.
   * 새 몸은 거두기가 끝날 때까지 미뤄 세운다(`pending`). 쓰러진 뒤의 교체는
   * 몸이 이미 졌으므로 거두지 않는다 — 원작도 쓰러진 마리는 거두지 않는다.
   *
   * ⚠️ **앞 몸을 다른 부모로 옮겨 그리지 않는다.** 같은 `object`를 새 `<primitive>`로
   * 다시 달면 옛 것을 떼는 커밋이 새 인스턴스의 `__r3f`까지 지운다 (R3F `removeChild`)
   */
  const recallFrom = useRef<number | null>(null)
  /** 진 몸의 기록을 지웠는가 (`clearSlotBody` — 한 번만) */
  const cleared = useRef(false)
  /** 거두기가 끝나면 세울 새 몸 (`show`) */
  const pending = useRef<(() => void) | null>(null)
  /** 지금 몸(모델이나 도트)이 서 있는가 — 종이 바뀌는 효과가 거둘 몸이 있는지 본다 */
  const hasBody = useRef(false)
  /** 앞서 그린 마리의 열쇠와, 그 마리가 서 있었는가. 아래 효과들이 **앞 커밋의 값**으로 읽는다 */
  const before = useRef<{ key: string | null; alive: boolean }>({ key: null, alive: false })

  // 몸은 종이 바뀔 때만 받는다. 같은 종을 여럿 데리고 있어도 한 벌이면 된다.
  // **3D 모델이 먼저고 도트가 대신**이다 — 493종 중 모델이 없는 종만 그림으로 선다
  const species = mon?.species ?? null
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer
  const r3fScene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    let alive = true
    // 서 있던 **다른 마리**로 바뀌면 앞 몸을 거둔다. 같은 마리의 폼 변화(`form`)와 변신(`transform`)은
    // 열쇠가 같고 종만 바뀌므로 거두지 않는다 — 빔(`BattleBallEffects`)과 같은 함수를 본다
    const recall = hasBody.current && recallsBody(before.current, mon?.key ?? null)
    recallFrom.current = recall ? battleClock.now() : null
    if (!recall) {
      setModel(null)
      setArt(null)
      hasBody.current = false
    }
    settled.current = false
    setSettledShown(false)
    grown.current = 0
    watch.current = 0
    // 자리가 비거나 몸이 바뀌면 이 자리의 키를 비운다 — 카메라가 앞 몸 기준에 머물지 않는다
    onBody(0)
    // 몸이 바뀌면 시간도 다시 센다 — 안 그러면 새 모델이 앞 모델을 기다린
    // 시간을 첫 프레임에 통째로 소비한다
    stageTime.current.reset()
    pending.current = null
    // 거두는 몸은 그 몸이 다 사라질 때까지 로케이터를 내준다(`ee610`의 빔이 그 몸을 겨눈다) — 기록은 거두기가 끝나면 지운다
    if (!recall) clearSlotBody(slot)
    if (species === null) return
    /** 새 몸을 세운다 — 앞 몸을 거두는 중이면 거두기가 끝날 때까지 미룬다(`pending`) */
    const show = (put: () => void): void => {
      const run = (): void => {
        put()
        recallFrom.current = null
        hasBody.current = true
        settle()
      }
      if (recallFrom.current !== null) pending.current = run
      else run()
    }
    void loadMonModel(species, form, { gender: mon?.gender, shiny: mon?.shiny })
      .then((loaded) => {
        if (!alive) return null
        if (loaded) {
          const body = makeBody(loaded)
          // 몸 빛(`glow`)에 쓸 재질을 지금 떼어 낸다 — 굽기 전에 떼어야 그 재질의 파이프라인이 같이 굽힌다
          ownMaterials(body)
          // ⚠️ **굽고 나서 세운다.** 그냥 `setModel`하면 R3F가 이번 프레임에
          // 씬에 붙이고, 그리는 그 프레임 안에서 파이프라인이 컴파일된다 —
          // ANGLE은 그 링크 확인에서 막히고(`warmPipelines`), 스킨 모델은
          // **한 마리에 정점 프로그램 하나**다. 실측으로 배틀 장면에서만
          // 제일 긴 프레임이 216~600ms였고 오버월드는 전부 16.8ms였다
          return warmBeforeShow(gl, r3fScene, camera, body.root)
            .then(() => {
              if (!alive) { releaseMaterials(body); return null }
              show(() => {
                setModel(body)
                setArt(null)
                onBody(body.tall)
              })
              return null
            })
        }
        // 모델이 없다 — 원작 도트로 떨어진다
        const key = spriteKey(species, form, false)
        return Promise.all([loadSpriteIndex(), loadMonSprite(key, mine)]).then(([idx, map]) => {
          if (!alive) return
          const box = idx.sprites[key]?.[mine ? 'back' : 'front']
          show(() => {
            setArt({ map, ...spriteFit(box, idx.size, MON_TALL) })
            setModel(null)
          })
        })
      })
      .catch(() => {
        // 둘 다 못 받았다 — 이제야 아래에서 도형으로 떨어진다
        if (!alive) return
        show(() => {
          setModel(null)
          setArt(null)
        })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species, form, mine, mon?.gender, mon?.shiny])

  // 몸이 바뀌거나 자리가 내려가면 그 몸이 떼어 낸 재질을 놓는다 (`ownMaterials`)
  useEffect(() => () => { if (model) releaseMaterials(model) }, [model])
  // 자리가 내려가면 몸 기록도 지운다
  useEffect(() => () => { clearSlotBody(slot) }, [slot])

  // 이번 커밋에 그린 마리를 적어 둔다. ⚠️ **위 효과보다 뒤에 둔다** — 효과는 적힌 차례로
  // 돌므로, 위에서는 앞 커밋의 마리를 읽고 여기서 이번 마리로 갈아 적는다
  useEffect(() => {
    before.current = { key: mon?.key ?? null, alive: mon?.presence === 'alive' }
  })

  /**
   * 지금 트는 동작. 뷰가 바뀌는 순간에만 갈아 끼운다.
   *
   * ⚠️ **대기로 돌아오는 것은 시간이 정한다.** 때리는 동작이 한 번 돌고 나면
   * 대기로 이어야 하는데, 상태로 두면 배틀 내내 React가 다시 그린다
   */
  const motion = useRef<MotionName>('enter')
  /** 시퀀스가 마지막으로 시킨 동작 (`이름@프레임`) — 같은 동작을 다시 시킬 때 갈라 본다 */
  const motionCue = useRef<string | null>(null)
  /**
   * 지금 **지는 중**인가. 등판과 퇴장이 같은 `shown` 값을 쓰므로 방향을 따로 든다.
   *
   * ⚠️ **퇴장에 등판 클립을 쓰면 안 된다.** `t < 0.99`만 보면 사라지는 동안에도
   * `enter`가 골라져서, 쓰러지는 포켓몬이 **착지 동작**을 한다. BDSP에 기절
   * 클립이 따로 없으므로(`monModel`의 `MOTION` — ba01·02·10·20·21·30뿐) 퇴장은
   * 지금 자세 그대로 가라앉히고 지운다
   */
  const leaving = useRef(false)
  // 등판·기절을 0/1로 끊으면 포켓몬이 순간이동한다. 눈에 보이는 값만 쓰는
  // 표현이므로 시뮬레이션 스텝이 아니라 렌더 델타로 민다
  const shown = useRef(0)

  /**
   * 때리는 쪽과 맞는 쪽의 움직임.
   *
   * **도형만 날아다니고 포켓몬은 가만히 있으면 누가 때렸는지가 안 보인다.**
   * 원작도 스프라이트가 앞으로 나갔다 오고, 맞은 쪽은 흔들리며 깜빡인다.
   *
   * 값은 프레임마다 줄어드는 타이머 둘이다. `useState`로 두면 배틀 내내 React가
   * 다시 그린다 — 뷰가 바뀌는 순간에만 1로 채우고 나머지는 `useFrame`이 민다
   */
  /**
   * 이 몸이 **공통 시계에서** 떼어 쓰는 시간 (`presentationClock.ClockReader`).
   *
   * ⚠️ **`useFrame`의 delta를 안 쓴다.** 그것은 벽시계라 `MAX_STEP_MS`도 탭
   * 숨김도 모른다 — 프레임 하나가 1초가 되면 시계는 0.1초만 가는데 몸은 1초를
   * 소비해서, 0.35초짜리 퇴장이 시계 쪽 28.6%인 자리에서 이미 100% 끝나 있었다.
   * 글·게이지·볼·기술이 한 시간축 위에 선다는 계약이 여기서만 깨져 있었다
   */
  const stageTime = useRef(new ClockReader())
  const lunge = useRef(0)
  /** 이번 나감이 도는 시간(초). 기술마다 다르다 */
  const lungeSecs = useRef(LUNGE)
  const flinch = useRef(0)
  // ⚠️ **쪽이 아니라 자리로 본다.** 더블에서 쪽으로 보면 한 마리가 때릴 때
  // 옆의 짝도 같이 앞으로 나간다
  const cast = useBattleStore((s) => s.view?.lastMove ?? null)
  const struck = useBattleStore((s) => s.view?.lastHit ?? null)
  useEffect(() => {
    if (cast?.by !== slot) return
    lunge.current = 1
    lungeSecs.current = lungeFor(cast.move)
  }, [cast, slot])
  useEffect(() => {
    if (struck?.slot === slot) flinch.current = 1
  }, [struck, slot])
  // 물리냐 특수냐. **BDSP 모델이 그 둘을 따로 갖고 있다**(`ba20` · `ba21`) —
  // 롬의 기술 데이터가 정하는 값이라 여기서 짐작하지 않는다
  const special = useRef(false)
  /**
   * 이 종이 **몇 초 뒤에 때리는가** (`BattleDataTable.MotionTimingData`).
   *
   * 여태 모든 종이 같은 박자로 나갔다 왔는데, 공식 리메이크는 종마다 타격
   * 프레임을 적어 두었다 — 모부기 25 · 리아코 14 · 블레이범 30프레임이다.
   * 그만큼 돌진의 정점이 갈리고, 그 정점이 곧 클립에서 팔이 뻗는 순간이다.
   *
   * 표가 없거나 그 종이 없으면 `LUNGE`의 절반, 곧 지금까지의 박자다
   */
  const hitAt = useRef(LUNGE / 2)
  // 표가 없거나 그 종이 없으면 나감의 한가운데다
  const halfway = (): number => lungeSecs.current / 2
  useEffect(() => {
    if (!cast || cast.by !== slot || cast.move === null) return undefined
    const id = cast.move
    let alive = true
    // ⚠️ **둘을 한 자리에서 푼다.** 분류를 아는 쪽과 타이밍을 보는 쪽을 나누면
    // 표가 먼저 오는 프레임에 **지난번 분류로** 시간을 잡는다 — 물리 기술 뒤에
    // 특수를 쓰면 첫 번은 물리 박자로 나간다
    void Promise.all([loadMoves(), loadMotionTiming()])
      .then(([moves, timing]) => {
        if (!alive) return
        const isSpecial = moves.byId.get(id)?.category === 'special'
        special.current = isSpecial
        // 폼은 아직 첫 판만 세우므로 0이다 (§16.6)
        const at =
          species === null ? null : timing.at(species, 0, isSpecial ? 'special' : 'physical')
        hitAt.current = at ?? halfway()
      })
      .catch(() => {
        special.current = false
      })
    return () => {
      alive = false
    }
  }, [cast, slot, species])

  useFrame(() => {
    const g = body.current
    if (!g) return
    // 공통 시계에서 내 몫을 뗀다. 같은 프레임에 두 번 읽어도 두 번 안 나아간다
    const delta = stageTime.current.read(battleClock.now())
    // 앞 몸을 거두는 중 — 빔과 같은 시간에 걸쳐 줄어들고, 다 줄면 새 몸이 올 때까지 감춘다.
    // 그동안은 아래의 등판·동작·키 재기를 안 한다(거두는 몸은 이미 이 자리의 마리가 아니다)
    const recalling = recallFrom.current
    if (recalling !== null) {
      // 앞 몸을 거두는 중 (`ee610`) — 볼 빛에 줄어들어 f24에 사라진다. 시퀀스가 없으면 같은 시간에 걸쳐 줄인다
      const pose = seqStage.body[slot] ?? null
      const done = battleClock.now() - recalling >= recallSeconds()
      const k = pose ? pose.scale[0] : Math.max(0, 1 - (battleClock.now() - recalling) / recallSeconds())
      const vis = !done && (pose ? pose.visible : k > 0.01)
      g.visible = vis
      g.scale.setScalar(Math.max(1e-4, k))
      glow(model, pose?.glow ?? null)
      model?.mixer.update(delta)
      const sh = shade.current
      if (sh) {
        sh.visible = vis
        sh.scale.setScalar(Math.max(1e-4, k))
      }
      // 거두는 동안도 로케이터를 내준다 — 빔이 이 몸 한가운데를 겨눈다
      slotRig[slot] = { root: model?.root ?? null, body: g, yaw: slotRig[slot]?.yaw ?? 0, shown: vis }
      if (done) {
        clearSlotBody(slot)
        const run = pending.current
        pending.current = null
        run?.()
      }
      // 새 몸은 **처음부터** 나온다 — 앞 몸의 등판 값을 물려받으면 볼이 열리기 전에 새 몸이
      // 다 선 채로 가라앉는 것부터 보인다
      shown.current = 0
      leaving.current = false
      return
    }
    // ⚠️ **볼이 열리기 전에는 안 나온다** (`stageRefs.ballOpen`). 등판 연출과
    // 몸이 같은 값(`view.active`)을 보고 같은 프레임에 시작하던 탓에, 포켓몬이
    // 먼저 서 있고 그 뒤에 볼이 날아와 터졌다
    const opensAt = ballOpen[slot] ?? 0
    const waiting = battleClock.now() < opensAt
    // 몸이 지는 시각 — 기절(`ee620` · `ee621`)과 포획(`ee101`)이 적는다. 그 전까지는 시퀀스가 몸을 쓰러뜨리고 줄인다.
    // 적힌 것 없이 쓰러졌으면(시퀀스 없는 판) 곧바로 진다
    const gone = bodyGone[slot]
    const mine2 = gone !== undefined && mon !== null && gone.key === mon.key
    const goneNow = mine2 && battleClock.now() >= gone.at
    if (goneNow && !cleared.current) {
      cleared.current = true
      clearSlotBody(slot)
    }
    if (!goneNow) cleared.current = false
    const want = mon && !(fainted && !mine2) && !goneNow && !waiting && settled.current ? 1 : 0
    if (want === 0 && shown.current > 0.01) leaving.current = true
    if (want === 1) leaving.current = false
    shown.current +=
      Math.sign(want - shown.current) * Math.min(delta / FADE, Math.abs(want - shown.current))
    // 시퀀스가 등판을 쥐었다(`PokemonIntroMotion`) — 볼 빛 속에 자라나며 떨어지는 것이 시퀀스 몫이라 제 페이드를 안 건다
    const seqNow = seqStage.body[slot] ?? null
    if (seqNow?.intro && seqNow.visible && want === 1) shown.current = 1
    const t = shown.current
    const caughtScale = 1
    // ⚠️ **3D 모델은 크기를 여기서 안 만진다.** 배율은 BDSP가 종마다 적어 둔
    // 값이고(`monModel`), 등판할 때 작아졌다 커지는 것은 도트의 문법이다
    g.scale.setScalar((model ? 1 : 0.6 + 0.4 * t) * caughtScale)
    // 살짝 흔든다. 완전히 굳어 있으면 도형이 아니라 소품으로 보인다.
    // **위로만 뜬다** — 아래로 내려가면 발이 땅에 파묻힌다.
    // 모델은 대기 동작이 이미 숨을 쉬므로 안 흔든다
    const bob = model ? 0 : (Math.sin(battleClock.now() * 1000 / 620 + spot.x) * 0.5 + 0.5) * 0.05

    // 때리러 나간다. **정점이 그 종의 타격 프레임이다** — 앞뒤가 반반이 아니라
    // 표가 정하는 자리에서 꺾인다(`hitAt`). 갔다가 순간이동으로 돌아오면
    // 뒷걸음질이 아니라 깜빡임으로 보이므로 돌아오는 길도 이어서 민다
    lunge.current = Math.max(0, lunge.current - delta / lungeSecs.current)
    const k = 1 - lunge.current
    const reach =
      lunge.current > 0
        ? Math.sin(peakAt(k, hitAt.current / lungeSecs.current) * Math.PI) * 0.42
        : 0

    // 맞으면 흔들리며 깜빡인다
    flinch.current = Math.max(0, flinch.current - delta / FLINCH)
    const hurt = flinch.current
    const shake = hurt > 0 ? Math.sin(hurt * Math.PI * 8) * 0.22 * hurt : 0
    const blink = hurt > 0 && Math.floor((1 - hurt) * FLINCH_BLINKS * 2) % 2 === 1

    // ── 기술 대본이 이 몸에 거는 것 (`stageRefs.moveImpact` · PARITY §2.13) ──
    //
    // 떨림 279개 · 눌림 24개 · 사라짐 12개가 원작 대본에서 온다. 위력이나
    // 타입으로 짐작한 것이 아니라 `res/moves/<이름>/anim.s`가 적어 둔 값이다
    const running = moveImpact.t < 1
    const fade = running ? 1 - moveImpact.t : 0
    let castShake = 0
    let squashX = 1
    let squashY = 1
    let hidden = false
    if (running) {
      const sh = moveImpact.shake
      if (sh !== null && impactHits(sh.who, slot)) {
        castShake = Math.sin(moveImpact.t * Math.PI * 2 * sh.hz) * sh.amount * fade
      }
      const sq = moveImpact.squash
      if (sq !== null && impactHits(sq.who, slot)) {
        // 대본은 끝 배율만 적는다. 갔다가 돌아오므로 산을 하나 그린다
        const bell = Math.sin(moveImpact.t * Math.PI)
        squashX = 1 + (sq.x - 1) * bell
        squashY = 1 + (sq.y - 1) * bell
      }
      // 구멍파기·공중날기는 쓴 쪽이 정말 사라진다
      hidden = moveImpact.vanish && slot === moveImpact.attacker
    }

    // ── BDSP 시퀀스가 이 몸에 거는 것 (`stageRefs.seqStage` · BATTLE_FX §4) ──
    //
    // ⚠️ **시퀀스가 돌면 DS 몫(돌진 · 움찔 · 대본 떨림)을 끈다.** 둘이 같이 돌면 몸이 두 번
    // 나간다 — 나가고 돌아오는 것도, 맞고 흔들리는 것도 시퀀스가 프레임마다 정한다
    const seq = seqNow
    if (seq) {
      lunge.current = 0
      flinch.current = 0
    }
    // 다른 시퀀스(포획 · 기절)의 카메라가 이 몸 곁을 지나는 동안 감춘다 (`PokemonVisibleOther`)
    const seqHide = (seq !== null && !seq.visible) || seqStage.hide[slot] !== undefined

    g.visible = t > 0.01 && caughtScale > 0.01 && !blink && !hidden && !seqHide
    if (squashX !== 1 || squashY !== 1) {
      g.scale.set(g.scale.x * squashX, g.scale.y * squashY, g.scale.z * squashX)
    }
    if (seq) g.scale.set(g.scale.x * seq.scale[0], g.scale.y * seq.scale[1], g.scale.z * seq.scale[2])

    g.position.x = (other.x - spot.x) * reach + shake + castShake + (seq ? seq.offset[0] + seq.shake[0] : 0)
    // ⚠️ **발이 땅에 닿아야 한다.** 예전엔 여기에 `spot.scale * 0.72`를 더해
    // 놓아서 포켓몬이 제 발판에서 1m 가까이 떠 있었다. `spriteFit`이 이미
    // 판을 맞춰 놓는다 — 칠해진 그림의 아래끝이 이 그룹의 원점이다
    g.position.z = (other.z - spot.z) * reach + (seq ? seq.offset[2] + seq.shake[2] : 0)
    // 등판 · 퇴장의 가라앉음은 시퀀스가 몸을 쥐지 않을 때만 — 쥐었으면(내보내기 · 기절) 시퀀스가 자리를 정하고, 숨은 몸이 땅 밑에
    // 있으면 그 몸의 로케이터를 겨눈 카메라가 0.5m 아래를 본다(실측)
    const sink = seq?.intro || seq?.motion?.name === 'down' ? 0 : (1 - t) * 0.5
    g.position.y = GROUND + bob * t - sink + (seq ? seq.offset[1] + seq.shake[1] : 0)
    glow(model, seq?.glow ?? null)

    // 어디를 보는가.
    //
    // **3D 모델은 상대를 본다.** 우리 규약대로 +Z가 정면이라(`bdspGlb` 머리말)
    // 상대 쪽 각도를 그대로 넣으면 된다 — 내 것은 등을, 상대는 앞을 보인다.
    // ⚠️ **도트는 카메라를 본다.** 한 장이라 안 돌리면 옆에서 종잇장이 보인다.
    // Y축으로만 돈다 — 위아래로도 돌리면 발이 지면에서 뜬다
    g.rotation.y = model
      ? Math.atan2(other.x - spot.x, other.z - spot.z) + (seq?.turn ?? 0)
      : Math.atan2(
          battleStage.position.x - STAGE_ORIGIN.x - spot.x,
          battleStage.position.z - STAGE_ORIGIN.z - spot.z,
        )
    // 시퀀스가 로케이터(`EffMouth01` …)를 읽는다 — 몸이 보는 쪽은 모델 기준이다
    slotRig[slot] = {
      root: model?.root ?? null,
      body: g,
      yaw: Math.atan2(other.x - spot.x, other.z - spot.z) + (seq?.turn ?? 0),
      shown: g.visible,
    }

    // 동작을 넘긴다. 때리고 맞는 것이 우선이고 그 타이머가 다 되면 대기로 돈다
    // 시퀀스가 시킨 동작이 먼저다 — 쓰러짐(`ee620`의 `ba41`) · 착지(`ee400`의 `ba01_landB/C`)도 그렇다
    const now: MotionName =
      seq?.motion && seqMotionLive(seq)
        ? seq.motion.name === 'attack'
          ? special.current ? 'special' : 'physical'
          : seq.motion.name
        // 지는 중에는 동작을 안 갈아 끼운다 — 맞은 자세 그대로 가라앉는다
        : leaving.current
        ? motion.current
        : t < 0.99
        ? 'enter'
        : flinch.current > 0
          ? 'damage'
          : lunge.current > 0
            ? special.current
              ? 'special'
              : 'physical'
            : 'wait'
    if (model) {
      // 시퀀스가 같은 동작을 다시 시키면(연속 공격) 처음부터 다시 튼다
      const cue = seq?.motion ? `${seq.motion.name}@${seq.motion.at}` : null
      if (now !== motion.current || (cue !== null && cue !== motionCue.current && now !== 'wait')) {
        motion.current = now
        motionCue.current = cue
        play(model, now)
      }
      // 시퀀스가 동작을 세울 수 있다(`PokemonSetMotionSpeed 0` — 쓰러진 자세로 멎는다 · 볼이 날아오는 동안 상대가 굳는다)
      model.mixer.update(delta * (seq?.motionSpeed ?? 1))
      // 자세를 먹인 키를 지켜본다. **대기 동작일 때만** 재고 **커진 만큼만**
      // 알린다 — 때리는 동작은 몸을 크게 뻗으므로 그것까지 담으면 카메라가
      // 기술 한 번마다 물러나고, 매 프레임 보내면 숨결에 맞춰 출렁인다
      if (now === 'wait' && watch.current < WATCH_UNTIL) {
        const was = Math.floor(watch.current / WATCH_EVERY)
        watch.current += delta
        if (Math.floor(watch.current / WATCH_EVERY) !== was) {
          // ⚠️ **상자는 월드 좌표다.** 무대가 `STAGE_ORIGIN`(0, −500, 0)에
          // 서 있어서 그대로 쓰면 −496이 나오고, 그러면 "더 커졌나"가 영영
          // 거짓이라 카메라가 한 번도 안 물러난다 — 실제로 그랬다
          const box = new Box3().setFromObject(model.root, true)
          const top = box.max.y - STAGE_ORIGIN.y - GROUND
          // 시퀀스 카메라가 이 상자 속에 서지 않게 (`clampShot`) — 무대 좌표로 적는다
          slotBox[slot] = {
            min: [box.min.x - STAGE_ORIGIN.x, box.min.y - STAGE_ORIGIN.y, box.min.z - STAGE_ORIGIN.z],
            max: [box.max.x - STAGE_ORIGIN.x, box.max.y - STAGE_ORIGIN.y, box.max.z - STAGE_ORIGIN.z],
          }
          if (top > grown.current + 0.02) {
            grown.current = top
            onBody(top)
            // 기술 연출이 이 키로 자리를 잡는다 — 상수로 두면 디그다 머리
            // 위와 갸라도스 배를 지나간다 (`stageRefs`의 `slotBody`)
            slotBody[slot] = top
          }
        }
      }
    }

    // ⚠️ **그림자는 몸을 따라간다.** 안 그러면 아무도 안 선 자리에 회색 얼룩이
    // 깔린다 — 배틀이 열리고 "가라! 모부기!"가 뜨는 동안 상대 자리에 그림자만
    // 먼저 놓여 있었고, 쓰러진 뒤에도 그대로 남았다.
    //
    // 깜빡임(`blink`)은 안 따라간다. 맞아서 몸이 깜빡이는 것은 연출이고
    // 그림자까지 같이 깜빡이면 땅이 번쩍인다
    const s = shade.current
    if (s) {
      s.visible = t > 0.01 && caughtScale > 0.01 && !seqHide
      // 볼 빛 속에 자라나는 몸 · 볼로 줄어드는 몸은 그림자도 같이 (`PokemonScale` · `PokemonIntroMotion`)
      s.scale.setScalar(Math.max(1e-4, t * caughtScale * (seq ? seq.scale[0] : 1)))
    }
  })

  const height = mine ? 1.05 : 0.95
  return (
    <group position={[spot.x, 0, spot.z]}>
      {/*
        발밑 그림자. **발판이 아니다** — 원작(BDSP)은 둘이 같은 땅에 서고
        그림자만 진다. 원판을 깔면 무대가 아니라 좌대 위의 인형이 된다
      */}
      {shadow && (
        <mesh
          ref={shade}
          visible={false}
          position={[0, GROUND + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[spot.radius * 1.05, spot.radius * 1.05]} />
          <meshBasicMaterial map={shadow} transparent depthWrite={false} />
        </mesh>
      )}

      <group ref={body} position={[0, GROUND, 0]}>
        {model ? (
          // BDSP 모델. 크기·자세·동작이 전부 롬에서 온다
          // 몸이 바뀌면 열쇠도 바뀐다 — 앞 몸을 거두는 동안 붙어 있던 `<primitive>`를 새로 단다
          <primitive key={model.root.uuid} object={model.root} />
        ) : art ? (
          /*
            모델이 없는 종만 여기로 온다 — 도트 한 장이다. 위 `useFrame`이
            Y축으로 카메라를 향해 돌린다(빌보드).
            `alphaTest`로 오려 내므로 반투명 정렬 문제가 없다
          */
          <mesh position={[0, art.lift, 0]} castShadow>
            <planeGeometry args={[art.scale, art.scale]} />
            <meshBasicMaterial map={art.map} transparent alphaTest={0.5} toneMapped={false} />
          </mesh>
        ) : settledShown && (
          // 그림을 **끝내** 못 받았을 때만 도형으로 떨어진다. 받는 중에는 아무것도 안 그린다
          // (`settled`). 종족 색은 롬에서 온다
          <mesh castShadow>
            <capsuleGeometry args={[0.42, height, 6, 16]} />
            <meshStandardMaterial
              color={look?.color ?? '#8b9099'}
              roughness={0.62}
              metalness={0.02}
            />
          </mesh>
        )}
      </group>
    </group>
  )
}

/**
 * 배틀 무대 (`public/models/arena/g0xx.glb`).
 *
 * **원작 BDSP의 배틀 배경을 그대로 쓴다.** 우리가 지어낸 것이 아니라 롬에서
 * 꺼낸 것이다: `Environments/bg/arenas/ground/g0xx`를 정적 메시 수백 개 →
 * 재질 대여섯 벌로 구워 냈다 (`tools/extract/bdspArena.py`).
 *
 * ⚠️ **어느 무대인지는 맵이 정한다.** 맵 헤더의 `battleBG`가 고르고
 * (`battle/arena`), 파도타기 중이면 원작대로 바다가 선다. 어디서 싸우든 풀밭이
 * 서던 시절의 흔적이 남아 있으면 동굴에서 나무가 보인다.
 *
 * ⚠️ **원판 두 개를 띄우던 자리다.** 발판 위에 각자 서 있으면 무대가 아니라
 * 좌대 위의 인형으로 보인다 — 원작은 둘이 **같은 땅에** 선다.
 *
 * 한 벌이 2~8MB라 배틀이 열리는 순간에 받는다. 받는 동안은 아래 `Flat`이 대신
 * 선다 — 첫 프레임에 빈 화면을 보이지 않으려고
 */
function Arena({ look, file, radius, onUp }: {
  look: TimeLook; file: string; radius: number; onUp: (up: boolean) => void
}) {
  const gltf = useLoader(GLTFLoader, useAssetUrl(`models/arena/${file}`))
  // 이 부품이 서는 것 자체가 「무대가 왔다」다 — `useLoader`가 풀려야 마운트된다.
  // ⚠️ **나갈 때 도로 내린다.** 깃발을 밖에서 초기화하면, 무대 파일이 이미
  // 캐시에 있는 **두 번째 배틀**에서 이 효과가 먼저 돌고 초기화가 나중에 돌아
  // 영영 안 서는 창이 생긴다 — 자기가 켜고 자기가 끄면 그 창이 없다
  useEffect(() => {
    onUp(true)
    return () => { onUp(false) }
  }, [onUp])
  const scene = useMemo(() => {
    const root = gltf.scene.clone(true)
    root.traverse((o) => {
      if (o instanceof Mesh) {
        o.receiveShadow = true
        o.castShadow = false
        // 창빛은 더하기로, 그림 없는 창빛은 숨긴다 — 아니면 흰 널빤지가 선다 (`arenaLight`)
        if (o.material instanceof MeshStandardMaterial && !applyLightMode(o.material)) o.visible = false
      }
    })
    return root
  }, [gltf])
  // 시퀀스 카메라가 벽 · 천장 구조물에 안 박히게 무대 삼각형으로 충돌을 짓는다 — **무대가 설 때 한 번**.
  // 그려지는 불투명 면만 넣는다: 더하기 창빛(빛기둥 판)은 카메라를 막지 않는다. 무대 뿌리는 `STAGE_ORIGIN`
  // 그룹 바로 밑에 변환 없이 서므로 뿌리 기준 월드 행렬이 곧 무대 좌표다
  const room = useMemo(() => {
    scene.updateMatrixWorld(true)
    const tris: number[] = []
    const v = new Vector3()
    scene.traverse((o) => {
      if (!(o instanceof Mesh) || !o.visible) return
      const m = o.material as Material
      if (m.transparent || m.blending !== NormalBlending) return
      const geo = o.geometry as BufferGeometry
      const pos = geo.getAttribute('position')
      const index = geo.getIndex()
      const n = index ? index.count : pos.count
      for (let k = 0; k < n; k++) {
        v.fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(o.matrixWorld)
        tris.push(v.x, v.y, v.z)
      }
    })
    return buildArenaCollider(tris, radius)
  }, [scene, radius])
  useEffect(() => {
    arenaRoom.current = room
    return () => { if (arenaRoom.current === room) arenaRoom.current = null }
  }, [room])
  // 무대는 낮 기준으로 구워져 있다. 밤에 그대로 두면 배경만 대낮이라, 시간대의
  // 지면색을 곱해 톤을 맞춘다 — 오버월드에서 걸어 들어온 그 시각이어야 한다
  useEffect(() => {
    const tint = new Color(look.groundColor).lerp(new Color('#ffffff'), 0.45)
    scene.traverse((o) => {
      if (o instanceof Mesh && o.material instanceof MeshStandardMaterial) {
        // ⚠️ **덮어쓰면 안 된다. 곱해야 한다.** 무늬 있는 재질은 제 색이
        // 흰색이라 덮으나 곱하나 같지만, **무늬 없는 재질**은 색이 전부다 —
        // g010의 바닷물(0, 0.295, 0.502), g006의 굴 불빛(1, 0.548, 0.13).
        // 덮어쓰면 바다가 흙색으로 물든다
        const base = (o.userData.tone ??= o.material.color.clone()) as Color
        o.material.color.copy(base).multiply(tint)
        o.userData.lit = o.material.color.clone()
      }
    })
  }, [scene, look])
  // BDSP 시퀀스의 배경 물들임 (`EffSpBackColSet`). **무대만** 물든다 — 몸과 이펙트는 그대로라
  // 어두워진 땅 위에 기술이 선다. 끄면 위에서 맞춘 색으로 돌아간다
  const backWas = useRef<string>('')
  useFrame(() => {
    const b = seqStage.running ? seqStage.back : null
    const key = b ? `${b.color.join(',')}:${b.alpha.toFixed(3)}` : ''
    if (key === backWas.current) return
    backWas.current = key
    scene.traverse((o) => {
      if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial)) return
      const lit = o.userData.lit as Color | undefined
      if (!lit) return
      if (!b) { o.material.color.copy(lit); return }
      o.material.color.setRGB(
        lit.r * (1 - b.alpha) + b.color[0] * b.alpha,
        lit.g * (1 - b.alpha) + b.color[1] * b.alpha,
        lit.b * (1 - b.alpha) + b.color[2] * b.alpha,
      )
    })
  })
  return <primitive object={scene} />
}

/** 무대를 아직 못 받았을 때 서는 땅. 하늘 구보다 훨씬 작아 그 경계가 지평선이 된다 */
function Flat({ look }: { look: TimeLook }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND, 0]} receiveShadow>
      <circleGeometry args={[34, 64]} />
      <meshStandardMaterial color={look.groundColor} roughness={1} />
    </mesh>
  )
}

export function BattleStage() {
  const view = useBattleStore((s) => s.view)
  const roster = useBattleStore((s) => s.roster)
  useSceneReady()
  usePrefetchBodies()
  /**
   * 기술 표와 타격 박자표를 **무대가 서면서** 받아 둔다.
   *
   * ⚠️ **첫 기술 하나가 엉뚱한 박자로 나가던 자리다.** 돌진은 `lastMove`가
   * 바뀌는 프레임에 시작하는데, 그 기술이 물리인지 특수인지와 이 종이 몇 초 뒤에
   * 때리는지는 그때 **비동기로** 풀린다 — 아직 안 온 첫 판은 `LUNGE / 2`라는
   * 기본 박자로 나갔다. 둘 다 약속을 캐시하므로(`data/gameData`의 `fetchJson`)
   * 여기서 한 번 걸어 두면 명령을 고르는 몇 초 사이에 다 와 있다
   */
  useEffect(() => {
    void loadMoves().catch(() => { /* 없으면 지금까지의 기본 박자로 나간다 */ })
    void loadMotionTiming().catch(() => { /* 위와 같다 */ })
  }, [])
  // 오버월드와 **같은 하늘·같은 조명**을 쓴다. 두 화면의 톤이 어긋나면
  // 배틀에 들어갈 때마다 다른 게임처럼 보인다 — 해질녘에 걸어 들어왔는데
  // 배틀만 대낮이면 그 순간 다른 게임이 된다
  const timeLook = useMemo(() => {
    const { from, to, k } = timeBlend(worldState.time.gameHour)
    const at = (i: number) => TIME_LOOKS[i] ?? TIME_LOOKS[1]!
    return blendLooks(at(from), at(to), k)
  }, [])
  const sky = useMemo(() => makeSkyTexture(timeLook), [timeLook])
  const shadow = useMemo(() => makeBlobShadow(), [])
  // 무대는 **배틀이 열릴 때 한 번** 정한다. 싸우는 동안 걸어 나가지 않으므로
  // 맵을 다시 볼 이유가 없고, 매 프레임 보면 `useLoader`가 계속 다시 매달린다
  const arena = useMemo(() => {
    // ⚠️ **밟고 선 칸도 본다.** 원작이 그렇게 한다 (`CalcTerrain`) — 대습원은
    // 배경이 숲인데 진흙을 밟고 싸우므로 늪이 서야 맞다
    const p = worldState.player.position
    const here = world.grid?.behaviorAtWorld(p.x, p.z) ?? null
    return arenaFor(mapById(world.mapId), worldState.player.surfing, here)
  }, [])
  const arenaUp = useCallback((up: boolean) => { arenaHere = up }, [])
  const [colors, setColors] = useState<((id: number) => string) | null>(null)
  const scene = useOptionsStore((s) => s.battleScene)

  // 몸 색은 롬의 종족 데이터에 있다. 배틀 스토어가 이미 받아 둔 표라 캐시에 걸린다
  useEffect(() => {
    let alive = true
    void loadSpecies()
      .then((table) => {
        if (alive) setColors(() => (id: number) => bodyColor(table.byId.get(id)?.color ?? -1))
      })
      .catch(() => {
        /* 못 받으면 아래에서 회색으로 떨어진다 */
      })
    return () => {
      alive = false
    }
  }, [])

  // 카메라를 가져간다. EngineDriver가 이 깃발을 보고 오버월드 카메라를 양보한다
  useEffect(() => {
    battleStage.active = true
    return () => {
      battleStage.active = false
    }
  }, [])

  // 큰 종 앞에서는 카메라가 물러난다. 선 몸 중 제일 큰 것이 화면을 정한다.
  //
  // ⚠️ **자리마다 지금 선 몸의 키를 든다 — 커지기만 하는 값이 아니다.** 쪽마다 「본 것 중
  // 제일 큰 값」을 들던 때는 갸라도스 한 번 뒤에 모부기로 바꿔도 카메라가 갸라도스 거리에
  // 남아서, 그 판 내내 모부기가 화면 속 점이었다. 한 마리 안에서 커지기만 하는 것은
  // `Slot`의 `grown`이 맡는다(대기 동작에 출렁이지 않게)
  const [tall, setTall] = useState<Record<SlotId, number>>({ p1a: 0, p1b: 0, p2a: 0, p2b: 0 })
  // ⚠️ **더블에서는 한 걸음 물러난다.** 무대에 넷이 서므로 싱글 화각 그대로면
  // 바깥 둘이 화면 밖으로 나간다. 짝을 벌린 만큼만 물러난다
  const doubles = useBattleStore((s) => s.doubles)
  useBattleCamera(cameraFit(arena, Math.max(...Object.values(tall))) * (doubles ? 1.35 : 1), arena.radius)

  /** 그 개체의 폼. 명단이 임자다 — 뷰는 폼을 안 들고 있다 */
  const formOf = (mon: ViewMon | null): number =>
    mon ? (mon.form ?? roster[mon.key]?.form ?? 0) : 0

  const look = (mon: ViewMon | null, key: string): SpeciesLook | null => {
    if (!mon) return null
    const id = mon.species ?? roster[key]?.species ?? -1
    return { color: colors?.(id) ?? '#8b9099' }
  }

  return (
    <group position={STAGE_ORIGIN}>
      {/*
        하늘. **안쪽 면을 그린다** — `scale={[-1,1,1]}`로 뒤집으면 감기 방향만
        바뀌고 컬링은 그대로라 통째로 안 보인다(실제로 그렇게 만들었다가 배경이
        검게 나왔다). 안개도 끈다 — 오버월드 기준(45~115)이라 이 구가 다 먹힌다
      */}
      {sky && hasSky(arena) && (
        <mesh renderOrder={-1}>
          <sphereGeometry args={[120, 32, 20]} />
          <meshBasicMaterial map={sky} side={BackSide} fog={false} depthWrite={false} />
        </mesh>
      )}

      <hemisphereLight args={[timeLook.skyColor, timeLook.groundColor, timeLook.ambient]} />
      <directionalLight position={[8, 14, 9]} intensity={timeLook.sun} color={timeLook.sunColor} />
      {/* 카메라 쪽 필. 이게 없으면 몸통의 그늘진 쪽이 배경에 묻는다 */}
      <directionalLight
        position={[-7, 6, 12]}
        intensity={timeLook.fill}
        color={timeLook.skyColor}
      />
      {/*
        해 반대편 되비침. 오버월드와 같은 이유다 — 광원 둘이 다 카메라 쪽에
        있으면 무대의 안쪽 면과 포켓몬의 뒤통수가 검게 뭉친다 (`fx/sky`)
      */}
      <directionalLight
        position={[...BACK_DIR]}
        intensity={backFill(timeLook)}
        color={timeLook.skyColor}
      />

      {/*
        무대. 받는 동안은 평평한 땅이 대신 선다 — 배틀은 곧바로 열려야 한다
      */}
      {arena.distortion ? (
        <DistortionArena onUp={arenaUp} />
      ) : (
        <Suspense fallback={<Flat look={timeLook} />}>
          <Arena look={timeLook} file={arena.file} radius={arena.radius} onUp={arenaUp} />
        </Suspense>
      )}
      <BattleAtmosphere
        view={view}
        spotAt={(id) => {
          const p = spotOf(id)
          return [p.x, p.z]
        }}
      />
      <BattleBallEffects
        view={view}
        spotAt={(id) => {
          const p = spotOf(id)
          return [p.x, p.z]
        }}
      />

      {/*
        네 자리를 늘 세운다 (PARITY §2.2). 싱글에서는 `b` 둘이 빈 발판이라
        아무것도 안 그린다 — `Slot`이 `mon === null`이면 통째로 숨긴다.
        조건부로 그리면 더블에 들어설 때 컴포넌트가 새로 마운트되어 모델을
        다시 받는다
      */}
      {SLOTS.map((id) => (
        <Slot
          key={id}
          slot={id}
          mon={view?.active[id] ?? null}
          form={formOf(view?.active[id] ?? null)}
          look={look(view?.active[id] ?? null, `${id}-0`)}
          spot={spotOf(id)}
          other={spotOf(id.startsWith('p1') ? 'p2a' : 'p1a')}
          mine={id.startsWith('p1')}
          shadow={shadow}
          onBody={(t) => {
            setTall((was) => (was[id] === t ? was : { ...was, [id]: t }))
          }}
        />
      ))}
      {/*
        기술 연출. 박자가 `MOVE_FRAMES`만큼 쉬는 그 자리에 한 번 돈다 —
        틀은 롬의 기술 데이터가, 색은 타입이 정한다 (`engine/battle/vfx`)
      */}
      {/*
        기술 연출. ⚠️ 설정에서 "배틀 애니메이션"을 끄면 통째로 안 그린다 —
        원작의 그 항목이 하는 일이 바로 이것이고, 그래서 배틀이 빨라진다
      */}
      {scene === SHOW_SCENE && (
        <MoveVfx
          spotAt={(id) => {
            const p = spotOf(id)
            return [p.x, p.z]
          }}
        />
      )}
      {/*
        배틀이 열리는 순간 발밑에서 터지는 것. 원작이 `PlayEncounterAnimation`
        한 줄로 트는 그 자리다 — 땅마다 `.spa` 두 벌이고, 그 사이에 화면이
        흰색으로 물든다 (`ui/battle/BattleScreen`이 그 막을 덮는다)
      */}
      <EncounterBurst withParticles={scene === SHOW_SCENE} />
    </group>
  )
}

/**
 * 배틀 카메라 (PLAN §7.4).
 *
 * **한 자리에 선다.** 무대 전체가 늘 보이고 움직이는 것은 포켓몬과 기술
 * 연출뿐이다 (`engine/battle/shots`의 `CAMERA`).
 *
 * ⚠️ **샷을 컷하던 연출을 걷어냈다.** 기술을 쓰면 어깨 너머, 맞으면 클로즈업,
 * 쓰러지면 로우앵글로 컷했는데 — 거리와 화각을 한 값으로 못 박은 뒤에도
 * **한 턴에 컷이 서넛**이라 플레이해 보면 무대가 아니라 카메라가 먼저 보였다.
 * 원작 DS는 카메라가 아예 안 움직인다.
 *
 * 흔들림은 남는다. 다만 **샷이 정하는 흔들림이 아니라 기술 대본이 시키는
 * 것**이다 (`moveImpact.camera` — `Func_ShakeBg`가 적힌 기술 서른 개)
 */
function useBattleCamera(fit: number, arenaRadius: number): void {
  /** 지금 카메라가 선 거리 배율. 첫 프레임에는 목표 그대로 선다 */
  const shownFit = useRef<number | null>(null)
  /** 시퀀스 카메라의 마지막 자리 · 놓은 시각 — 돌아오는 길을 잇는다 */
  const back = useRef<CameraReturn>(NO_RETURN)
  const time = useRef(new ClockReader())
  useFrame((state) => {
    const dt = time.current.read(battleClock.now())
    // 등장 장면부터 대사창 위의 내 몸을 담는다 (`FIGHT_LOOK_Y`). 배틀에 사람이 서지 않아 머리가 잘릴 일이 없다
    const aim = FIGHT_LOOK_Y
    // ⚠️ **물러나는 것은 곧바로, 다가가는 것은 천천히.** 큰 몸이 서는데 늦게 물러나면 머리가
    // 화면 위로 잘린다. 다가가는 쪽은 교체 순간 카메라가 튀지 않게 감쇠로 민다
    const was = shownFit.current
    const at = was === null || fit >= was ? fit : fit + (was - fit) * Math.exp(-dt / CAMERA_EASE)
    shownFit.current = at
    // ⚠️ 대본이 배경을 흔들라고 적은 기술만 흔든다 (`Func_ShakeBg`, 30개).
    // 지진·땅가르기가 그것이고, 번개는 안 흔든다 — 위력이 아니라 대본이
    // 정한다. 연출이 끝나면 `t`가 1이라 0이 곱해진다
    const quake = (moveImpact.t < 1 && moveImpact.camera > 0
      ? Math.sin(battleClock.now() * 1000 / 11) * moveImpact.camera * (1 - moveImpact.t)
      : 0)
      // BDSP 시퀀스의 `CameraShake` — 세기는 시퀀스가 낸다 (`engine/battle/fx/sequence`의 `shakeAt`)
      + (seqStage.running ? Math.sin(battleClock.now() * 1000 / 23) * seqStage.shake : 0)
    // ⚠️ **좁은 무대에서는 카메라를 당긴다.** 자리는 풀밭(반지름 12m) 기준으로
    // 적혀 있는데 실내 무대는 12×18m짜리 방이라, 그대로 두면 카메라가 벽 밖
    // 천장 위에 선다. 바라보는 자리는 그대로 두고 거리만 줄인다
    const [lx, , lz] = CAMERA.look
    const ly = aim
    const base: SeqCamera = {
      pos: [lx + (CAMERA.position[0] - lx) * at, ly + (CAMERA.position[1] - ly) * at, lz + (CAMERA.position[2] - lz) * at],
      target: [lx, ly, lz],
      fov: BATTLE_FOV,
      roll: 0,
    }
    // ── BDSP 시퀀스 카메라 (BATTLE_FX §4) ──
    //
    // 기술 시퀀스가 카메라를 몸 가까이로 당기고 돌린다 — 그래야 이펙트가 점이 아니라 화면을 채운다.
    // 명령이 없는 동안(`null`)과 시퀀스 밖은 위의 기본 카메라 그대로다. 시퀀스가 `CameraReset` 없이
    // 끝나도 튀지 않게 마지막 자리에서 기본 자리로 `SEQ_CAMERA_RETURN`초에 걸쳐 돌아온다
    const want = seqStage.camera?.(base) ?? null
    // 지금 화면에 선 몸의 상자만 — 쓰러지거나 거둔 몸 · 감춘 몸의 상자가 카메라를 밀면 안 된다
    const boxes = (): Box[] => Object.entries(slotBox).filter(([slot]) => slotRig[slot]?.root && slotRig[slot]?.shown).map(([, b]) => b)
    const aspect = state.size.width / Math.max(1, state.size.height)
    // 돌아오는 길과 끊을지는 `battleCamera.stepCamera`가 정한다
    const step = stepCamera(back.current, want, base, battleClock.now(), (c) => clampShot(c, arenaRadius, boxes(), aspect, arenaRoom.current))
    back.current = step.state
    const shot = step.shot
    battleStage.position.set(shot.pos[0] + quake, shot.pos[1] + quake * 0.7, shot.pos[2]).add(STAGE_ORIGIN)
    battleStage.target.set(shot.target[0], shot.target[1], shot.target[2]).add(STAGE_ORIGIN)
    battleStage.fov = shot.fov
    battleStage.roll = shot.roll
  })
}

/**
 * 카메라가 작은 몸 쪽으로 다가가는 감쇠의 시간 상수(초).
 *
 * 원작 값이 아니다 — DS는 카메라가 안 움직이고 BDSP는 종마다 샷을 새로 잡는다. 우리는 한
 * 자리 카메라가 몸 크기로 거리만 바꾸므로(`cameraFit`) 그 사이를 잇는 값을 따로 둔다.
 * 0.6초면 남은 거리의 95%를 1.8초에 줄인다 — 교체 글 한 쪽이 넘어가는 동안이다
 */
const CAMERA_EASE = 0.6

/** 설정의 "배틀 애니메이션"에서 **보는** 쪽 값 (`options_menu` 뱅크 13번) */
const SHOW_SCENE = 0

/**
 * 무대가 **다 서는** 순간을 스토어에 알린다 (`state/battleStore`의 `sceneReady`).
 *
 * ⚠️ **`phase: 'running'`은 「보여 줘도 된다」가 아니다.** 그 자리에서 온 것은
 * 규칙기와 자료뿐이고, 화면에 서는 무대(2~8MB glb)와 앞에 나올 두 마리의 몸은
 * 그 뒤에 받는다 — 실측으로 3.5초다. 그동안 배틀 곡이 흐르고 빈 무대에 조우
 * 연출이 터지고 나서야 포켓몬이 툭 나타났다. 그래서 여기서 셋을 다 기다린다:
 *
 *   ① 무대 모델 — `Arena`가 서면 온 것이다 (`useLoader`가 풀려야 마운트된다)
 *   ② 앞에 나올 두 마리의 몸 — **정본**(`truth`)에서 고른다. 화면 뷰(`view`)는
 *     재생기가 아직 안 푼 빈 무대라 거기서는 누가 나올지 알 수 없다
 *   ③ 조우 연출 입자 묶음 (`EncounterBurst`가 `loading`에서 미리 받는다)
 *
 * 몸을 여기서 **미리 받아 두는 것**이 요점이다 — 나중에 `Slot`이 같은
 * `loadMonModel`을 부르면 캐시에 걸려 그 프레임에 선다
 */
function useSceneReady(): void {
  const ready = useBattleStore((s) => s.sceneReady)
  /**
   * 앞에 나올 마리들. **문자열 하나로 접어서** 고른다 — 배열을 돌려주면
   * 선택자가 매 프레임 새 값을 내서 무대가 통째로 다시 그려진다
   */
  const leads = useBattleStore((s) => {
    const active = s.truth?.active
    if (!active) return ''
    return SLOTS.map((slot) => {
      const mon = active[slot]
      if (!mon || mon.species === null) return ''
      const form = mon.form ?? s.roster[mon.key]?.form ?? 0
      return [mon.species, form, mon.gender, mon.shiny ? 1 : 0, slot.startsWith('p1') ? 1 : 0].join(':')
    }).filter((k) => k !== '').join('/')
  })

  useEffect(() => {
    if (ready || leads === '') return
    let alive = true
    // 조우 연출 입자 묶음. `EncounterBurst`가 `loading`에서 이미 걸어 두므로
    // 여기서는 **같은 약속을 한 번 더 기다릴 뿐**이다 (`splPack`이 캐시한다)
    const burst = preloadSplPack(SPL_WAZA).catch(() => undefined)
    const bodies = leads.split('/').map((key) => {
      const [species, form, gender, shiny] = key.split(':')
      return loadMonModel(Number(species), Number(form), {
        gender: gender as 'male' | 'female' | 'genderless',
        shiny: shiny === '1',
      }).catch(() => null)
    })
    /** 무대가 아직 안 왔으면 다음 프레임에 다시 본다 */
    let raf = 0
    void Promise.all([...bodies, burst]).then(() => {
      const waitArena = (): void => {
        if (!alive) return
        if (arenaHere) { useBattleStore.setState({ sceneReady: true }); return }
        raf = requestAnimationFrame(waitArena)
      }
      waitArena()
    })
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [leads, ready])
}

/**
 * 판이 열린 뒤 **뒤에 나올 마리의 몸**을 미리 받는다 (명부 전원, 양쪽).
 *
 * ⚠️ **판 도중 처음 나오는 마리가 늦게 섰다.** `useSceneReady`는 첫 등판 두 마리만 기다리므로
 * 벤치와 상대 후속 마리는 볼이 열릴 때 처음 glb를 받았다. 여기서 받아 두면 `Slot`이 같은
 * `loadMonModel`을 부를 때 캐시에 걸린다 — 굽기(`warmBeforeShow`)만 그때 돈다.
 *
 * ⚠️ **`sceneReady`를 기다리게 하지 않는다.** 그 깃발이 막을 걷으므로 여기를 거기에 넣으면
 * 판이 열리는 기다림이 파티 수만큼 길어진다. 판이 열린 **뒤에**, 한 마리씩 차례로 받는다 —
 * 한꺼번에 걸면 등판 연출 도중에 파싱이 몰려 프레임이 끊긴다
 */
function usePrefetchBodies(): void {
  const ready = useBattleStore((s) => s.sceneReady)
  useEffect(() => {
    if (!ready) return
    let alive = true
    const entries = Object.values(useBattleStore.getState().roster)
    void entries.reduce<Promise<unknown>>(
      (chain, entry) => chain.then(() => (alive
        ? loadMonModel(entry.species, entry.form, { gender: entry.gender, shiny: entry.shiny }).catch(() => null)
        : null)),
      Promise.resolve(),
    )
    return () => {
      alive = false
    }
  }, [ready])
}

/** 무대 모델이 서 있는가. React 상태로 두면 `Arena`가 그때마다 다시 그려진다 */
let arenaHere = false
