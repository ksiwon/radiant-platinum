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
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import {
  BackSide,
  Box3,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type CanvasTexture,
  type Texture,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { WebGPURenderer } from 'three/webgpu'
import { warmBeforeShow } from '../warmPipelines'
import { worldState } from '../../state/worldState'
import { timeBlend } from '../../engine/map/timeOfDay'
import { mapById, world } from '../../engine/map/world'
import { arenaFor, cameraFit, hasSky } from '../../engine/battle/arena'
import { loadMotionTiming, loadMoves, loadSpecies } from '../../data/gameData'
import { useBattleStore } from '../../state/battleStore'
import type { ViewMon } from '../../engine/battle/view'
import { SLOTS, type SlotId } from '../../engine/battle/events'
import { battleStage, impactHits, moveImpact, slotBody, STAGE_ORIGIN } from './stageRefs'
import { BattleBallEffects } from './BattleBallEffects'
import { BattleTrainers } from './BattleTrainers'
import { BattleWorldLabels } from './BattleWorldLabels'
import { captureBodyScale } from './battleBallMotion'
import { bodyColor } from './bodyColor'
import { loadMonSprite, loadSpriteIndex, spriteFit } from './monSprite'
import { loadMonModel, makeBody, play, type MonBody, type MotionName } from './monModel'
import { spriteKey } from '../../engine/pokemon/form'
import { MoveVfx } from './MoveVfx'
import { BattleAtmosphere } from './BattleAtmosphere'
import { MOVE_FRAMES } from '../../engine/battle/vfx'
import {
  PAIR_DIR,
  ShotDirector,
  SLOT,
  sampleShot,
  shotFor,
  type ShotName,
  type Side,
} from '../../engine/battle/shots'
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

/**
 * 더블에서 두 마리가 벌어지는 폭 (PARITY §2.2).
 *
 * ⚠️ **BDSP가 적어 둔 값이 아니다.** 우리가 `battle_masterdatas`에서 읽어 온
 * 것은 싱글 자리(z축 대칭 ±2.0~2.5)뿐이고 더블 자리는 아직 안 뽑았다 —
 * **재서 고른 값이지 원작 값이 아니다.**
 *
 * 1.15는 찍어 보고 줄인 값이다. 1.7로 두니 상대 둘이 화면 가운데와 오른쪽
 * 끝으로 갈라졌다 — 화각 30°에서 넷이 다 들려면 이만큼이어야 한다.
 * 그림자 반지름이 1.5라 발판은 살짝 겹치지만, 몸은 그보다 훨씬 작다.
 *
 * 벌어지는 **방향**은 x축이 아니라 시선의 좌우다 (`PAIR_DIR`)
 */
/**
 * 짝이 벌어지는 폭과, 짝 둘을 통째로 화면 **왼쪽**으로 미는 양.
 *
 * ⚠️ **쪽마다 다르다.** 내 자리는 카메라에서 3.9m, 상대는 7.7m다 — 같은
 * 거리를 밀면 가까운 쪽이 화면에서 **두 배로** 움직여서 한 마리가 밖으로
 * 나간다. 그래서 내 쪽은 대략 절반이다.
 *
 * ⚠️ **왼쪽으로 미는 이유가 체력판이다.** 오른쪽 절반을 판 둘과 명령 창이
 * 쓰므로, 가운데를 기준으로 벌리면 바깥쪽 하나가 늘 판 뒤로 들어간다.
 * 네 값 다 **찍어 보고 고른 것**이지 원작 값이 아니다
 */
const PAIR = {
  p1: { spread: 0.45, bias: 0.02 },
  p2: { spread: 0.85, bias: 1.35 },
} as const

/** 그 자리의 발판. 싱글이면 `a`만 선다 */
function spotOf(slot: SlotId): typeof MINE {
  const mine = slot.startsWith('p1')
  const base = mine ? MINE : FOE
  // ⚠️ **`PAIR_DIR`는 화면 왼쪽이다.** 카메라가 (−2.7, 5.0)에서 원점을 보므로
  // 시선의 좌우가 월드 x축과 안 맞는다 — 찍어 보고 알았다. `a`가 오른쪽,
  // `b`가 왼쪽에 서고, 둘 다 `PAIR_BIAS`만큼 왼쪽으로 밀린다
  const sign = slot.endsWith('a') ? -1 : 1
  const { spread, bias } = mine ? PAIR.p1 : PAIR.p2
  const off = spread * sign + bias
  return {
    ...base,
    x: base.x + PAIR_DIR[0] * off,
    z: base.z + PAIR_DIR[2] * off,
  }
}

/** 자리 → 쪽. 카메라 샷은 쪽 단위다 */
function sideOf(slot: SlotId): Side {
  return slot.startsWith('p1') ? 'p1' : 'p2'
}

/** 등판·기절이 딱 끊기지 않게 하는 시간(초) */
const FADE = 0.35

/**
 * 때리러 나갔다 돌아오는 시간(초).
 *
 * 박자가 기술에 내주는 쉼과 같은 상수를 쓴다(`MOVE_FRAMES`) — 다르게 잡으면
 * 연출이 끝나기도 전에 다음 글이 뜨거나, 다 끝나고도 화면이 멈춰 있다
 */
const LUNGE = MOVE_FRAMES / 60

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
   * 어느 모습인가 (PARITY §3.4). 뷰가 아니라 **명단**이 들고 있다.
   *
   * ⚠️ **배틀 안에서 바뀌는 폼은 못 따라간다.** 날씨구슬 캐스퐁과 플라워기프트
   * 체리버가 그렇다 — 규칙은 sim이 제대로 돌리지만(타입이 실제로 바뀐다) 그
   * `-formechange`가 우리 뷰까지 안 올라온다. 리포트에 남는 폼은 다 맞는다
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
  /** 몸이 바뀌면 알려 준다. 카메라가 큰 종 앞에서 물러나야 한다 */
  onBody: (tall: number) => void
}) {
  const body = useRef<Group>(null)
  const shade = useRef<Mesh>(null)
  /** 지금까지 본 제일 높은 자리와, 다음에 잴 시각 */
  const grown = useRef(0)
  const watch = useRef(0)
  const fainted = mon !== null && mon.hp <= 0
  const [art, setArt] = useState<{ map: Texture; scale: number; lift: number } | null>(null)
  const [model, setModel] = useState<MonBody | null>(null)

  // 몸은 종이 바뀔 때만 받는다. 같은 종을 여럿 데리고 있어도 한 벌이면 된다.
  // **3D 모델이 먼저고 도트가 대신**이다 — 493종 중 모델이 없는 종만 그림으로 선다
  const species = mon?.species ?? null
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer
  const r3fScene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    let alive = true
    setModel(null)
    setArt(null)
    grown.current = 0
    watch.current = 0
    delete slotBody[slot]
    if (species === null) return
    void loadMonModel(species, form, { gender: mon?.gender, shiny: mon?.shiny })
      .then((loaded) => {
        if (!alive) return null
        if (loaded) {
          const body = makeBody(loaded)
          // ⚠️ **굽고 나서 세운다.** 그냥 `setModel`하면 R3F가 이번 프레임에
          // 씬에 붙이고, 그리는 그 프레임 안에서 파이프라인이 컴파일된다 —
          // ANGLE은 그 링크 확인에서 막히고(`warmPipelines`), 스킨 모델은
          // **한 마리에 정점 프로그램 하나**다. 실측으로 배틀 장면에서만
          // 제일 긴 프레임이 216~600ms였고 오버월드는 전부 16.8ms였다
          return warmBeforeShow(gl, r3fScene, camera, body.root)
            .then(() => {
              if (!alive) return null
              setModel(body)
              onBody(body.tall)
              return null
            })
        }
        onBody(0)
        // 모델이 없다 — 원작 도트로 떨어진다
        const key = spriteKey(species, form, false)
        return Promise.all([loadSpriteIndex(), loadMonSprite(key, mine)]).then(([idx, map]) => {
          if (!alive) return
          const box = idx.sprites[key]?.[mine ? 'back' : 'front']
          setArt({ map, ...spriteFit(box, idx.size, MON_TALL) })
        })
      })
      .catch(() => {
        /* 둘 다 못 받으면 아래에서 도형으로 떨어진다 */
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species, form, mine, mon?.gender, mon?.shiny])

  /**
   * 지금 트는 동작. 뷰가 바뀌는 순간에만 갈아 끼운다.
   *
   * ⚠️ **대기로 돌아오는 것은 시간이 정한다.** 때리는 동작이 한 번 돌고 나면
   * 대기로 이어야 하는데, 상태로 두면 배틀 내내 React가 다시 그린다
   */
  const motion = useRef<MotionName>('enter')
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
  const lunge = useRef(0)
  const flinch = useRef(0)
  // ⚠️ **쪽이 아니라 자리로 본다.** 더블에서 쪽으로 보면 한 마리가 때릴 때
  // 옆의 짝도 같이 앞으로 나간다
  const cast = useBattleStore((s) => s.view?.lastMove ?? null)
  const struck = useBattleStore((s) => s.view?.lastHit ?? null)
  useEffect(() => {
    if (cast?.by === slot) lunge.current = 1
  }, [cast, slot])
  useEffect(() => {
    if (struck?.slot === slot) flinch.current = 1
  }, [struck, slot])
  const lastBall = useBattleStore((s) => s.view?.lastBall ?? null)
  const capture = useRef<{
    seq: number
    started: number
    shakes: number
    caught: boolean
  } | null>(null)
  useEffect(() => {
    if (!lastBall || lastBall.slot !== slot || capture.current?.seq === lastBall.seq) return
    capture.current = {
      seq: lastBall.seq,
      started: performance.now() / 1000,
      shakes: lastBall.shakes,
      caught: lastBall.caught,
    }
  }, [lastBall, slot])

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
        hitAt.current = at ?? LUNGE / 2
      })
      .catch(() => {
        special.current = false
      })
    return () => {
      alive = false
    }
  }, [cast, slot, species])

  useFrame((_, delta) => {
    const g = body.current
    if (!g) return
    const want = mon && !fainted ? 1 : 0
    shown.current +=
      Math.sign(want - shown.current) * Math.min(delta / FADE, Math.abs(want - shown.current))
    const t = shown.current
    const captureNow = capture.current
    const caughtScale = captureNow
      ? captureBodyScale(
          performance.now() / 1000 - captureNow.started,
          captureNow.shakes,
          captureNow.caught,
        )
      : 1
    // ⚠️ **3D 모델은 크기를 여기서 안 만진다.** 배율은 BDSP가 종마다 적어 둔
    // 값이고(`monModel`), 등판할 때 작아졌다 커지는 것은 도트의 문법이다
    g.scale.setScalar((model ? 1 : 0.6 + 0.4 * t) * caughtScale)
    // 살짝 흔든다. 완전히 굳어 있으면 도형이 아니라 소품으로 보인다.
    // **위로만 뜬다** — 아래로 내려가면 발이 땅에 파묻힌다.
    // 모델은 대기 동작이 이미 숨을 쉬므로 안 흔든다
    const bob = model ? 0 : (Math.sin(performance.now() / 620 + spot.x) * 0.5 + 0.5) * 0.05

    // 때리러 나간다. **정점이 그 종의 타격 프레임이다** — 앞뒤가 반반이 아니라
    // 표가 정하는 자리에서 꺾인다(`hitAt`). 갔다가 순간이동으로 돌아오면
    // 뒷걸음질이 아니라 깜빡임으로 보이므로 돌아오는 길도 이어서 민다
    lunge.current = Math.max(0, lunge.current - delta / LUNGE)
    const k = 1 - lunge.current
    const reach =
      lunge.current > 0 ? Math.sin(peakAt(k, hitAt.current / LUNGE) * Math.PI) * 0.42 : 0

    // 맞으면 흔들리며 깜빡인다
    flinch.current = Math.max(0, flinch.current - delta / FLINCH)
    const hurt = flinch.current
    const shake = hurt > 0 ? Math.sin(hurt * Math.PI * 8) * 0.22 * hurt : 0
    const blink = hurt > 0 && Math.floor((1 - hurt) * FLINCH_BLINKS * 2) % 2 === 1

    // ── 기술 대본이 이 몸에 거는 것 (`stageRefs.moveImpact` · PARITY §7.3) ──
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

    g.visible = t > 0.01 && caughtScale > 0.01 && !blink && !hidden
    if (squashX !== 1 || squashY !== 1) {
      g.scale.set(g.scale.x * squashX, g.scale.y * squashY, g.scale.z * squashX)
    }

    g.position.x = (other.x - spot.x) * reach + shake + castShake
    // ⚠️ **발이 땅에 닿아야 한다.** 예전엔 여기에 `spot.scale * 0.72`를 더해
    // 놓아서 포켓몬이 제 발판에서 1m 가까이 떠 있었다. `spriteFit`이 이미
    // 판을 맞춰 놓는다 — 칠해진 그림의 아래끝이 이 그룹의 원점이다
    g.position.z = (other.z - spot.z) * reach
    g.position.y = GROUND + bob * t - (1 - t) * 0.5

    // 어디를 보는가.
    //
    // **3D 모델은 상대를 본다.** 우리 규약대로 +Z가 정면이라(`bdspGlb` 머리말)
    // 상대 쪽 각도를 그대로 넣으면 된다 — 내 것은 등을, 상대는 앞을 보인다.
    // ⚠️ **도트는 카메라를 본다.** 한 장이라 안 돌리면 옆에서 종잇장이 보인다.
    // Y축으로만 돈다 — 위아래로도 돌리면 발이 지면에서 뜬다
    g.rotation.y = model
      ? Math.atan2(other.x - spot.x, other.z - spot.z)
      : Math.atan2(
          battleStage.position.x - STAGE_ORIGIN.x - spot.x,
          battleStage.position.z - STAGE_ORIGIN.z - spot.z,
        )

    // 동작을 넘긴다. 때리고 맞는 것이 우선이고 그 타이머가 다 되면 대기로 돈다
    const now: MotionName =
      t < 0.99
        ? 'enter'
        : flinch.current > 0
          ? 'damage'
          : lunge.current > 0
            ? special.current
              ? 'special'
              : 'physical'
            : 'wait'
    if (model) {
      if (now !== motion.current) {
        motion.current = now
        play(model, now)
      }
      model.mixer.update(delta)
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
          const top = new Box3().setFromObject(model.root, true).max.y - STAGE_ORIGIN.y - GROUND
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
      s.visible = t > 0.01 && caughtScale > 0.01
      s.scale.setScalar(t * caughtScale)
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
          <primitive object={model.root} />
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
        ) : (
          // 그림을 못 받았을 때만 도형으로 떨어진다. 종족 색은 롬에서 온다
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
function Arena({ look, file }: { look: TimeLook; file: string }) {
  const gltf = useLoader(GLTFLoader, useAssetUrl(`models/arena/${file}`))
  const scene = useMemo(() => {
    const root = gltf.scene.clone(true)
    root.traverse((o) => {
      if (o instanceof Mesh) {
        o.receiveShadow = true
        o.castShadow = false
      }
    })
    return root
  }, [gltf])
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
      }
    })
  }, [scene, look])
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

  // 큰 종 앞에서는 카메라가 물러난다. 둘 중 큰 쪽이 화면을 정한다
  const [tall, setTall] = useState({ p1: 0, p2: 0 })
  // ⚠️ **더블에서는 한 걸음 물러난다.** 무대에 넷이 서므로 싱글 화각 그대로면
  // 바깥 둘이 화면 밖으로 나간다. 짝을 벌린 만큼만 물러난다
  const doubles = useBattleStore((s) => s.doubles)
  useBattleCamera(cameraFit(arena, Math.max(tall.p1, tall.p2)) * (doubles ? 1.35 : 1))

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
      <Suspense fallback={<Flat look={timeLook} />}>
        <Arena look={timeLook} file={arena.file} />
      </Suspense>
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
      <BattleTrainers />

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
            const side = sideOf(id)
            setTall((was) => (was[side] >= t ? was : { ...was, [side]: t }))
          }}
        />
      ))}
      {view && (
        <BattleWorldLabels
          view={view}
          spotAt={(id) => {
            const p = spotOf(id)
            return [p.x, p.z]
          }}
        />
      )}
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
    </group>
  )
}

/**
 * 카메라 연출 (PLAN §7.4).
 *
 * 배틀에서 일어나는 일을 보고 샷을 컷한다 — 기술을 쓰면 어깨 너머, 맞으면
 * 클로즈업, 쓰러지면 로우앵글. 샷이 끝나면 기본 샷으로 돌아온다.
 *
 * ⚠️ **설정의 "배틀 애니메이션"을 여기서 본다.** 원작의 그 항목은 연출을 통째로
 * 건너뛰어 배틀을 빠르게 만드는 것이라, 끄면 카메라도 기본 샷에 붙박이가 된다.
 * 그동안 값만 저장되고 아무 데도 안 걸려 있던 항목이다
 */
function useBattleCamera(fit: number): void {
  const director = useRef(new ShotDirector())
  const scene = useOptionsStore((s) => s.battleScene)
  const cast = useBattleStore((s) => s.view?.lastMove ?? null)
  const struck = useBattleStore((s) => s.view?.lastHit ?? null)
  const active = useBattleStore((s) => s.view?.active ?? null)

  /** 두 번 같은 일로 컷하지 않게, 방금 본 것을 기억한다 */
  const seen = useRef({ move: -1, hit: -1, out: '', down: '0000' })

  const cut = (name: ShotName, side: Side): void => {
    if (scene === SHOW_SCENE) director.current.cut(name, side)
  }

  useEffect(() => {
    if (!cast || cast.seq === seen.current.move) return
    seen.current.move = cast.seq
    cut('oncoming', sideOf(cast.by))
  })

  useEffect(() => {
    if (!struck || struck.seq === seen.current.hit) return
    seen.current.hit = struck.seq
    cut('impact', sideOf(struck.slot))
  })

  // 등판과 기절. 어느 쪽이 바뀌었는지는 종족 번호와 체력으로 안다
  useEffect(() => {
    if (!active) return
    // ⚠️ **자리마다 본다.** 쪽으로 세면 더블에서 짝이 바뀔 때 컷이 안 걸린다
    const out = SLOTS.map((slot) => String(active[slot]?.species ?? '')).join('/')
    const was = seen.current.out.split('/')
    if (out !== seen.current.out) {
      const changed = SLOTS.filter((slot, i) => String(active[slot]?.species ?? '') !== was[i])
      const first = seen.current.out === ''
      seen.current.out = out
      // ⚠️ 첫 등판에는 컷하지 않는다. 배틀이 열리는 순간이라 두 자리가 한꺼번에
      // 차는데, 그때 등판 샷을 걸면 무대가 서기도 전에 카메라가 한쪽으로 붙는다
      if (!first && changed[0]) cut('switchIn', sideOf(changed[0]))
    }
    const down = SLOTS.map((slot) => ((active[slot]?.hp ?? 1) <= 0 ? '1' : '0')).join('')
    if (down !== seen.current.down) {
      const fell = SLOTS.filter((_, i) => down[i] === '1' && seen.current.down[i] !== '1')
      seen.current.down = down
      if (fell[0]) cut('faint', sideOf(fell[0]))
    }
  })

  useFrame((_, delta) => {
    const frame =
      scene === SHOW_SCENE
        ? director.current.advance(delta)
        : sampleShot(shotFor('establish', 'p1'), 0)
    // 흔들림은 방향을 여기서 정한다 — 엔진이 난수를 들고 있을 이유가 없다
    const jitter = frame.shake === 0 ? 0 : Math.sin(performance.now() / 17) * frame.shake
    // ⚠️ 대본이 배경을 흔들라고 적은 기술만 여기서 더 흔든다 (`Func_ShakeBg`,
    // 30개). 지진·땅가르기가 그것이고, 번개는 안 흔든다 — 위력이 아니라 대본이
    // 정한다. 연출이 끝나면 `t`가 1이라 0이 곱해진다
    const quake = moveImpact.t < 1 && moveImpact.camera > 0
      ? Math.sin(performance.now() / 11) * moveImpact.camera * (1 - moveImpact.t)
      : 0
    // ⚠️ **좁은 무대에서는 카메라를 당긴다.** 샷은 풀밭(반지름 12m) 기준으로
    // 적혀 있는데 실내 무대는 12×18m짜리 방이라, 그대로 두면 카메라가 벽 밖
    // 천장 위에 선다. 바라보는 자리는 그대로 두고 거리만 줄인다
    const [lx, ly, lz] = frame.look
    battleStage.position
      .set(
        lx + (frame.position[0] - lx) * fit + jitter + quake,
        ly + (frame.position[1] - ly) * fit + jitter * 0.6 + quake * 0.7,
        lz + (frame.position[2] - lz) * fit,
      )
      .add(STAGE_ORIGIN)
    battleStage.target.set(lx, ly, lz).add(STAGE_ORIGIN)
  })
}

/** 설정의 "배틀 애니메이션"에서 **보는** 쪽 값 (`options_menu` 뱅크 13번) */
const SHOW_SCENE = 0
