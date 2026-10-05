// BDSP 연출 시퀀스 — 30fps 명령 시간표를 읽어 「그 프레임에 무엇이 어디 있는가」를 낸다
// (BATTLE_FX §4).
//
// 구운 모양은 `import/bdsp/fx.ts`의 `FxSequence`다: 묶음(`groups`)마다 명령 목록이 있고
// 명령 하나는 `[start, end]` 프레임과 이름 · 값(문자열 배열 — 벡터면 성분마다 하나)이다.
// 같은 묶음 안의 `ParticleCreate`와 그 뒤 `Particle*` 명령은 **같은 입자 칸**을 다룬다.
// 묶음 번호(`no`)가 같은 `Model*` 명령은 **같은 모델**을 다룬다(볼 · 따라가는 로케이터) — 입자가
// `DprParticleMoveRelativeModel grpNo=12`로 그 모델의 로케이터를 부른다.
//
// ⚠️ **상태를 쌓지 않는다.** 프레임 f의 값은 언제든 처음부터 다시 접어서 낸다
// (`particleAt` · `bodyAt` · `modelAt` · `cameraAt`). 그래서 되감기·건너뛰기·가상 시계가 다 같은 그림을 낸다.
//
// 명령의 뜻 (실측과 짐작):
// - 길이가 있는 명령(`start < end`)은 **start 때의 값에서 end 때의 목표로** 옮겨 간다.
//   `move`가 쉬움 곡선 번호다(0 직선 — 나머지는 이름을 못 찾아 부드러운 곡선으로)
// - 거리는 **센티미터**다 — 트레이너 자리 `pos=50/0/580`이 BDSP 트레이너 자리
//   (±0.5, 0, ±5.8 m)와 같다. 그래서 100으로 나눈다
// - `trg`·`moveTrg`·`posTrg`·`dirPoke`는 0 쓴 쪽 · 1 맞는 쪽이다. 내보내기 시퀀스(`ee4xx`)는
//   3 · 4 · 5 · 6(내 쪽 첫째 · 상대 첫째 · 내 쪽 둘째 · 상대 둘째)을 쓴다 — `PlanOptions.targets`로 우리 역할에 잇는다
// - `node`는 몸의 로케이터 번호다 — 표는 `scene`이 쥔다(`anchor` 콜백). 이름 목록이
//   롬에 없어 쓰임새로 짝지었다(`scene/battle/fx/seqAnchors`)
// - `GroupOption`은 조건부 묶음이다. `(1, 홀수)`는 내 쪽이 쓸 때 · `(1, 짝수)`는 상대가
//   쓸 때로 읽고(같은 효과가 둘로 갈려 있다), 그 밖의 옵션은 `PlanOptions.options`가 값을 준 것만
//   맞춰 보고 나머지(트레이너 · 더블 전용)는 건너뛴다
//
// - `isRot`이면 오프셋이 그 몸이 보는 쪽 기준이다. `isRot` 없이 `isFlip`이면 **상대 쪽에 선 몸이
//   쓴 것으로 적혀 있다** — 몸통박치기가 `ofs=0/0/50`(+Z)으로 나가는데 BDSP 내 쪽은 카메라 쪽 +Z라
//   그대로면 뒷걸음질이다. 내 쪽 몸이면 반 바퀴 돌린다
//
// 좌표는 **우리 무대 좌표**(STAGE_ORIGIN을 뺀 것)로 낸다. 유니티 쪽 값(오프셋 · 절대 자리)은
// X를 뒤집어 받는다 — 무대 전체가 BDSP의 X 거울이기 때문이다. 절대 자리를 어디에 둘지는
// 시퀀스마다 다르다(`SeqContext.world`) — 기술은 무대 한가운데 기준, 포획은 맞는 쪽 발밑 기준이다.

import { add, dist3, lerp3, type V3 } from './vec3'

interface SeqCommand {
  start: number
  end: number
  name: string
  values: Readonly<Record<string, readonly string[]>>
}

interface SeqGroup {
  name: string
  no: number
  options: readonly (readonly [number, number])[]
  commands: readonly SeqCommand[]
}

export interface SeqData {
  name: string
  groups: readonly SeqGroup[]
}

export type { V3 }
type Q = [number, number, number, number]
/** 0 쓴 쪽 · 1 맞는 쪽 */
export type Role = 0 | 1

/** 시퀀스가 몸에서 읽는 것. 무대 좌표 · 라디안 */
export interface SeqAnchor {
  pos: V3
  /** 몸이 보는 쪽 (three `rotation.y`) */
  yaw: number
}

export interface SeqContext {
  /**
   * 로케이터 하나의 지금 자리. 몸이 없으면 `null`.
   *
   * @param node 시퀀스의 `node` 번호
   */
  anchor(role: Role, node: number): SeqAnchor | null
  /** 그 몸이 서는 발판 자리 (움직이기 전) */
  home(role: Role): SeqAnchor | null
  /**
   * 로케이터를 **시퀀스가 몸을 옮기기 전 자리로** — 몸을 옮기는 명령의 기준점이다.
   * ⚠️ 지금 자리(`anchor`)를 쓰면 제 몸을 기준으로 옮기는 명령(몸통박치기 `posTrg=0`)이
   * 프레임마다 옮겨 간 자리에서 다시 50cm를 더해 상대 너머까지 날아간다(실측)
   */
  rest(role: Role, node: number): SeqAnchor | null
  /** 그 몸이 내 쪽(카메라 쪽 +Z)에 섰는가 — `isFlip` 오프셋을 뒤집는다 */
  mine(role: Role): boolean
  /**
   * BDSP 절대 자리(cm, 유니티 축) → 무대 좌표. 없으면 무대 한가운데 기준(X 거울 · cm → m)이다.
   * 포획 · 내보내기는 그 시퀀스가 기준으로 삼는 몸의 자리로 옮긴다(`worldAround`)
   */
  world?(cm: V3): V3
  /**
   * 트레이너가 볼을 던지는 자리 (`DprModelAttachTrainer trg`). 배틀에 사람이 서지 않아(사용자 결정 2026-10-04)
   * 화면 밖 한 점을 준다. 없으면 볼이 손에 있는 동안 안 보인다
   */
  trainer?(id: number): V3 | null
  /**
   * 시퀀스 모델(`grpNo`)의 로케이터가 그 프레임에 선 자리. 클립이 노드를 움직이므로 무대가 그 클립을 그 시각으로
   * 맞춰 잰다(`scene/battle/fx/BdspSequence`). 없으면 모델 뿌리 자리
   *
   * @param node 로케이터 번호(`nodeIndex`) 또는 노드 이름(붙은 이펙트)
   */
  modelNode?(no: number, node: number | string, f: number): V3 | null
  /** 몸 크기 배율 — `isScale` 오프셋 · 입자를 몸 크기로 늘린다(카메라 `cameraAt`와 같은 값) */
  scale?(role: Role): number
}

/**
 * 떨림 세 값 — **전부 우리 값이다. BDSP가 어떻게 읽는지 못 찾았고, 값을 정한 실측 기록도 없다.**
 *
 * 롬에는 `srate` · `erate`(세기의 처음과 끝) · `axis` · `sdec` · `edec`(`CameraShake`는 `dec`)가 적혀 있다. 단위와 감쇠(`dec`)의
 * 뜻은 Unity 쪽 코드에 있고 우리 손에는 데이터뿐이다(`raw/decomp`는 DS 판이다). 그래서 세기를 cm로 읽고(`/ 100`) 배율을 곱한다.
 * 감쇠(`dec`)는 읽지 않는다. 쓰는 값을 바꿀 때는 화면을 찍어 재야 한다
 */
/** 몸 · 모델 떨림 세기 배율 */
const SHAKE_BODY_GAIN = 0.25
/** 화면 흔들림 세기 배율 (`CameraShake`) */
const SHAKE_CAMERA_GAIN = 0.35
/** 몸 · 모델 떨림의 잦기 (Hz) */
const SHAKE_HZ = 15

/** 시퀀스 30fps 프레임 → 초 */
export const SEQ_FPS = 30

/**
 * 볼이 트레이너 손을 떠나 첫 자리에 닿기까지(프레임) — **`ee101`에서 잰 값이다.** 볼 궤적 입자
 * (`ee101_01_ball_fol01` — 볼 모델을 따라간다)가 f9에 서고 볼이 f21에 상대 앞에 놓인다(`ModelMoveRelativePoke`).
 * 그 사이는 BDSP에서 트레이너 몸짓이 볼을 나르는데, 배틀에 사람이 서지 않으므로 화면 밖에서 이 길이만큼 날아온다
 */
export const THROW_FRAMES = 12

/** 던진 볼이 그리는 포물선 꼭대기 — 곧은 길 위로 몇 m (우리 값) */
const THROW_ARC = 1.3

/**
 * 내보낸 몸이 `PokemonIntroMotion height`에서 땅에 닿기까지(프레임). 롬에 값이 없다(그 명령이 하는 일은 코드 쪽이다) —
 * **BDSP 공개 영상에서 잰다**(`.audit/reels/ref-bdsp-reveal.mp4` 49.8초~ · 30fps · 포챠코 내보내기): 볼 빛이 터진 뒤 몸이 서서
 * 땅에 닿기까지 14프레임이다. 그 사이 몸은 나타난 자리에서 조금 솟았다가(f14~20) 떨어진다(f24~28) — 내려앉는 것이 아니라
 * 던져진 것처럼 떨어진다(`introLift`).
 *
 * ⚠️ 예전 값 40은 몸을 따라 내려가는 카메라(`ee400` f45~85 · 1m)에 맞춘 것이었다. 몸이 1.33초 동안 감속하며 둥둥 떠내려와서
 * 「나와서 떠내려온다」로 보였다. 카메라는 시퀀스 그대로 그 뒤에도 내려간다
 */
export const INTRO_FALL = 14

/**
 * 내보낸 몸이 나타나는 모양 — 같은 영상에서 잰다. 볼 빛이 커지는 동안(f8~13) 몸은 없고, 나타나는 프레임(f14)에 **이미 제
 * 크기**다(커지는 것은 그 사이 두세 프레임에 빛 속에서 끝난다). 몸 빛은 f16에 거의 빠진다 — 세 프레임.
 * 몸 빛의 세기(10 → 1)는 `ee106`(볼에서 튀어나옴)의 값이다
 */
const INTRO_GROW = 3
const INTRO_GLOW = 4

/**
 * 떨어지는 높이 배율 (0~1 → 시작 높이에 곱한다) — 쏘아 올린 것처럼 처음엔 솟고 끝에 빨라진다. 꼭대기가 시작 높이의 1.25배
 * (영상에서 몸 키의 반쯤 솟는다), 끝(1)에서 땅이다: `1 + v·k − (v + 1)·k²`, `v = (1 + √5)/2`이면 꼭대기가 `1 + v²/4(v+1) = 1.25`
 */
export function introLift(k: number): number {
  const v = (1 + Math.sqrt(5)) / 2
  const x = Math.min(1, Math.max(0, k))
  return Math.max(0, 1 + v * x - (v + 1) * x * x)
}

/** 입자 칸 하나 */
interface SeqParticle {
  /** 몇 번째 묶음인가 — 열쇠 */
  key: string
  /** `ee100/ee101_03_line.ptcl` → 프리팹 이름. 볼 전용이면 볼 번호로 갈아 끼운 것 */
  prefab: string
  start: number
  /** 이 프레임부터 뿜기를 멈춘다 (`ParticleCreate`의 끝 · `ParticleStop`) */
  stop: number
  /** 이 프레임에 걷어 낸다 (`ParticleDelete`) — 없으면 다 사그라질 때까지 */
  remove: number | null
  /** 자리 · 크기 · 회전 명령 (프레임 차례) */
  commands: readonly SeqCommand[]
  /** `isScale=1`이면 몸 크기로 늘린다 (`PlanOptions.scaleParticles`) */
  sized?: boolean
}

/** 몸 하나에 거는 것 (쓴 쪽 · 맞는 쪽) */
interface BodyTrack {
  commands: SeqCommand[]
}

/** 시퀀스 모델 하나 — 볼(`ModelCreateBall`)이나 보이지 않는 로케이터(`ModelCreate cmn_locator`) */
interface ModelTrack {
  no: number
  kind: 'ball' | 'locator'
  /** 둘째 볼(더블 내보내기 `PlanOptions.ballSecond`)의 모델이다. 없으면 `PlanOptions.ball` 그대로 */
  ball?: number
  commands: SeqCommand[]
}

export interface SeqPlan {
  name: string
  particles: SeqParticle[]
  body: [BodyTrack, BodyTrack]
  /** 시퀀스 모델 — 묶음 번호(`no`) → 명령 */
  models: ModelTrack[]
  /** 다른 몸 감추기 (`PokemonVisibleOther` · `PokemonVisibleAll`) */
  others: SeqCommand[]
  /** 역할이 없는 대상(`PlanOptions.away`)의 보이기·감추기 (`PokemonVisible`) — 더블 내보내기 카메라가 지나는 맞은편 둘 */
  away: SeqCommand[]
  /** 화면 흔들림 */
  shakes: SeqCommand[]
  /** 카메라 명령 (`CameraMoveRelativePoke` · `CameraMovePosition` · `CameraTwist` · `CameraReset*` · `DprCamera*`) */
  camera: SeqCommand[]
  /** 배경 물들임 (`EffSpBackColSet` · `EffSpBackColFlg`) */
  back: SeqCommand[]
  /** 맞는 쪽 체력이 깎이는 프레임 (`GaugeDamage`). 없으면 `null` */
  hit: number | null
  /** 글이 뜨는 프레임 (`MessageDispStd`). 없으면 `null` */
  message: number | null
  /** 마지막 명령이 끝나는 프레임 */
  frames: number
  /** 몸 빛의 「제 색」 — `PokemonShaderCol`의 색에서 이만큼 빼고 발광으로 건다 (`PlanOptions.shaderBase`) */
  shaderBase: number
  /** 볼 클립 길이(초) — 시퀀스 길이를 잴 때 (`seqLength`) */
  clipSeconds: readonly (number | null)[]
  /** `ParticleMoveRelativePoke isScale=1`인 입자를 몸 크기로 늘리는가 (`PlanOptions.scaleParticles`) */
  scaleParticles: boolean
  /** 몸 기준 카메라를 시퀀스가 몸을 옮기기 전 자리에 거는가 (`PlanOptions.cameraAtRest`) */
  cameraAtRest: boolean
  /** 이 계획이 건너뛴 명령 이름 (진단 — 한 번씩 알린다) */
  ignored: Set<string>
}

export interface PlanOptions {
  /** 볼 번호 — `isBallEffect`·`isCapture` 입자를 `eb{볼}_ballout`·`_capture`로 갈아 끼운다 */
  ball?: number
  /** 쓴 쪽이 내 쪽인가 (조건부 묶음 `(1, n)`) */
  attackerMine?: boolean
  /** 그 밖의 조건부 묶음 값 — `GroupOption`의 옵션 번호 → 이 판의 값. 적은 옵션만 맞춰 본다 */
  options?: Readonly<Record<number, number | readonly number[]>>
  /**
   * 원본 대상 번호 → 우리 역할. 주면 **여기 없는 대상을 겨눈 명령은 버린다**(내보내기의 상대 감추기 등).
   * 안 주면 0 · 1을 그대로 쓴다(기술)
   */
  targets?: Readonly<Record<number, Role>>
  /**
   * 역할을 안 주고 **보이기·감추기만** 받는 대상 번호 (`plan.away`). 더블 내보내기는 역할 둘을 내 쪽 두 마리가 쓰므로
   * 카메라가 서는 동안 맞은편 둘을 감추는 `PokemonVisible`(`ee404` f51~116 trg 4 · 6)을 여기로 받는다
   */
  away?: readonly number[]
  /**
   * 몸 기준 카메라(`CameraMoveRelativePoke`)의 **세계축 오프셋**(`isRot` 아님)에서 깊이(Z)를 뒤집는다. 내 쪽 내보내기(`ee400`)의 샷은
   * 내 몸에서 `z=−580`(상대 쪽 끝)에 서서 내 몸의 앞을 본다 — 상대 내보내기(`ee406`, `z=+580`)와 거울이라 두 샷이 같은 구도(몸 앞 클로즈업)로
   * 읽혀 어느 쪽 등판인지 안 가려진다. 뒤집으면 카메라가 내 몸 **뒤**(우리 기본 카메라 쪽)에 서서 내 몸의 등을 보고, 상대는 멀리 서 있다 (우리 값)
   */
  cameraFlipZ?: boolean
  /** 둘째 볼 번호 — `DprParticleCreateSeal index=1`의 빛과 그 볼 모델(`ModelTrack.ball`). 더블 내보내기에서 두 마리의 볼이 다를 때 */
  ballSecond?: number
  /** 이 프레임부터 튼다 — 앞은 잘라 낸다(배틀에 서지 않는 트레이너의 몸짓). 그 앞에서 정한 상태는 0프레임에 선다 */
  startAt?: number
  /** 카메라 명령을 받는가 (기본 참) */
  camera?: boolean
  /** 맞는 쪽 감추기(`PokemonVisible trg=1`)를 따르는가 (기본 거짓 — `planSequence` 안의 머리말) */
  hideTarget?: boolean
  /** 볼 모델의 붙은 이펙트 — 번호 → 프리팹 이름(= 노드 이름) (`DprModelParticlePlay`) */
  ballParticles?: readonly string[]
  /** 볼 클립 길이(초) — 번호 차례 */
  clipSeconds?: readonly (number | null)[]
  /** `PokemonShaderCol`의 「제 색」. 볼 · 기절 시퀀스는 1(색 1이 원래 몸)이다 — 기술은 0으로 둔다(지금까지의 모양) */
  shaderBase?: number
  /**
   * `isScale=1`로 몸에 붙인 입자를 몸 크기(`ctx.scale`)로 늘리는가. 볼 · 기절 시퀀스는 켠다 — 안 켜면 작은 몸(비버니 0.5m)을
   * 빨아들이는 빛이 화면을 덮는다. 기술은 지금까지의 모양을 지키려고 끈다
   */
  scaleParticles?: boolean
  /**
   * 몸 기준 카메라(`CameraMoveRelativePoke`)를 **시퀀스가 몸을 옮기기 전 자리**(`ctx.rest`)에 거는가. 내보내기는 몸을 1.6m 들어
   * 올렸다가(`PokemonMovePosition +160`) 떨어뜨리는데, 카메라가 지금 몸을 따라가면 「발밑 + 1.6m」가 3.2m로 뜨고 떨어지는 동안
   * 카메라가 같이 출렁인다(실측). 볼이 열리는 1.6m를 보려면 발판 기준이어야 한다. 기술은 지금까지의 모양을 지키려고 끈다
   */
  cameraAtRest?: boolean
}

/** 받기는 하지만 그리지 않는 것 — 소리 · 게이지 · 글 · 트레이너 · 후처리 */
const SILENT = /^(Sound|Gauge|Message|Trainer|Dpr(?!Particle|Model|Camera|Pokemon)|Orion|Beluga|EffStencil|PostEffect|DummyLabel|Camera|Special|EffRadial|EffFeedback|EffGlare|EffFog|EffDisp|EffShadow|DispEffect|Model|DprCameraGroundCheckFlg|DprPokemonDisable|DprTrainer|DprPokemonMoveReset|DprSet|DprParticleMultiply|Pokemon(Visible(Shadow)|MotionState|ScaleNode|DisableSleepEye))/

/** 시퀀스를 띄워 보는 도구가 쓰는 묶음 — 실제 배틀에서는 안 돈다(볼을 하나 더 만들고 지운다) */
const DEBUG_GROUP = 'モデルデバッグコマンド'

const num = (v: readonly string[] | undefined, i = 0, d = 0): number => {
  const x = Number(v?.[i])
  return Number.isFinite(x) ? x : d
}

const vec = (v: readonly string[] | undefined, d = 0): V3 => [num(v, 0, d), num(v, 1, d), num(v, 2, d)]

/** `file=ee100/ee101_03_line.ptcl` → `ee101_03_line` */
export function prefabOfFile(file: string): string | null {
  const m = /([^/]+)\.ptcl$/i.exec(file)
  return m ? m[1]! : null
}

/**
 * 기술 시퀀스의 판 갈래 — `GroupOption 0`이 싱글 1 · 더블 2 · 「싱글 이외」 4다(묶음 이름 `シングル分岐` · `ダブル` · `シングル以外`).
 * 싱글은 1만, 더블은 2와 4가 같이 선다. 갈래를 안 주면 이 묶음들은 통째로 빠진다 — 싱글에서도 맞는 쪽에 입자를 붙이는
 * `ParticleMoveRelativePoke`가 `[0,1]` 묶음에만 있는 기술(파도타기 `ew057` 등 30개)이 있다
 */
const BATTLE_OPTION = 0
export const battleOptions = (doubles: boolean): PlanOptions['options'] => ({ [BATTLE_OPTION]: doubles ? [2, 4] : 1 })

/** 이 입자가 맞는 쪽(역할 1)에 붙는 명령을 가졌는가 — 범위 기술에서 맞은 자리마다 한 벌 더 세운다 */
export function touchesTarget(p: { commands: readonly SeqCommand[] }): boolean {
  return p.commands.some((c) => {
    const keys: readonly string[] = c.name === 'ParticleFollowPoke' ? [...ROLE_KEYS, 'pos'] : ROLE_KEYS
    return keys.some((k) => c.values[k]?.length === 1 && num(c.values[k]) === 1)
  })
}

/** 조건부 묶음을 이 판에서 쓰는가 */
function groupApplies(options: SeqGroup['options'], attackerMine: boolean, given: PlanOptions['options']): boolean {
  for (const [opt, value] of options) {
    if (opt === 1) {
      if ((value % 2 === 1) !== attackerMine) return false
      continue
    }
    const want = given?.[opt]
    if (want === value || (Array.isArray(want) && want.includes(value))) continue
    return false
  }
  return true
}

/** 대상 번호를 담는 열쇠 — 트레이너 명령(`*Trainer*`)의 `trg`는 트레이너 번호라 안 건드린다 */
const ROLE_KEYS = ['trg', 'moveTrg', 'posTrg', 'dirPoke', 'poke'] as const

/** 대상 번호를 우리 역할로. 모르는 대상을 겨눈 명령이면 `null` */
function retarget(c: SeqCommand, targets: PlanOptions['targets']): SeqCommand | null {
  if (!targets || /Trainer/.test(c.name)) return c
  const values: Record<string, readonly string[]> = { ...c.values }
  // `ParticleFollowPoke`는 대상이 `pos`에 들었다
  const keys: readonly string[] = c.name === 'ParticleFollowPoke' ? [...ROLE_KEYS, 'pos'] : ROLE_KEYS
  for (const k of keys) {
    const v = c.values[k]
    if (!v || v.length !== 1) continue
    const role = targets[num(v)]
    if (role === undefined) return null
    values[k] = [String(role)]
  }
  return { ...c, values }
}

/**
 * 시퀀스를 계획으로 편다.
 */
export function planSequence(seq: SeqData, opts: PlanOptions = {}): SeqPlan {
  const mine = opts.attackerMine ?? true
  const ball = String(Math.max(1, Math.min(16, opts.ball ?? 4))).padStart(3, '0')
  const cut = Math.max(0, opts.startAt ?? 0)
  const plan: SeqPlan = {
    name: seq.name,
    particles: [],
    body: [{ commands: [] }, { commands: [] }],
    models: [],
    others: [],
    away: [],
    shakes: [],
    camera: [],
    back: [],
    hit: null,
    message: null,
    frames: 0,
    shaderBase: opts.shaderBase ?? 0,
    clipSeconds: opts.clipSeconds ?? [],
    scaleParticles: opts.scaleParticles ?? false,
    cameraAtRest: opts.cameraAtRest ?? false,
    ignored: new Set(),
  }
  const pad = (n: number): string => String(Math.max(1, Math.min(16, n))).padStart(3, '0')
  /** 둘째 볼이 담긴 묶음 번호 — `DprParticleCreateSeal index=1 grpNo` */
  const secondGroups = new Set<number>()
  if (opts.ballSecond !== undefined) {
    for (const g of seq.groups) {
      for (const c of g.commands) {
        if (c.name === 'DprParticleCreateSeal' && num(c.values.index) === 1) secondGroups.add(num(c.values.grpNo))
      }
    }
  }
  const modelOf = (no: number): ModelTrack => {
    let m = plan.models.find((x) => x.no === no)
    if (!m) {
      m = { no, kind: 'ball', commands: [] }
      if (opts.ballSecond !== undefined && secondGroups.has(no)) m.ball = Math.max(1, Math.min(16, opts.ballSecond))
      plan.models.push(m)
    }
    return m
  }
  const ballOut = `eb${ball}_ballout`
  const ballOutSecond = `eb${pad(opts.ballSecond ?? opts.ball ?? 4)}_ballout`
  /** 구운 카메라 애니메이션(`CameraAnimationPoke`)이 서는 프레임들 — 아래에서 대신 선다 */
  const animCams: number[] = []
  /**
   * 묶음 번호(`no`) → 그 번호로 마지막에 세운 입자 칸. ⚠️ **조건 묶음은 같은 번호의 기본 묶음 입자를 이어 받는다** — 파도타기 `ew057`은
   * `ParticleCreate`가 든 묶음 `no=15` 뒤에 `シングル分岐`(`[0,1]`) · `[0,4]` 묶음이 같은 `no=15`로 서서 맞는 쪽 자리
   * (`ParticleMoveRelativePoke`)를 준다. 자기 묶음 안에서만 찾으면 그 명령이 갈 데가 없어 버려진다. `no=0`은 번호 없음이다
   */
  const slotOfNo = new Map<number, Omit<SeqParticle, 'commands'> & { commands: SeqCommand[] }>()
  seq.groups.forEach((g, gi) => {
    if (g.name === DEBUG_GROUP) return
    if (!groupApplies(g.options, mine, opts.options)) return
    const cmds = [...g.commands].sort((a, b) => a.start - b.start)
    let current: (Omit<SeqParticle, 'commands'> & { commands: SeqCommand[] }) | null = g.no !== 0 ? slotOfNo.get(g.no) ?? null : null
    let seen = 0
    /** 이 묶음의 카메라가 트레이너에 붙어 있다 — 뒤따르는 상대 이동 · 돌기도 그 카메라 몫이라 같이 버린다 */
    let trainerCam = false
    /** 트레이너 카메라가 서 있는 마지막 프레임 — 그 컷 안의 굴림(`CameraTwist`)도 그 컷 몫이다 */
    const trainerUntil = Math.max(-1, ...cmds.filter((x) => x.name === 'DprCameraMoveRelativeTrainer').map((x) => x.end - cut))
    /** 이 입자 칸이 트레이너 몸에 붙었다 — 배틀에 사람이 없으니 통째로 버린다 */
    let trainerBound = false
    const startParticle = (c: SeqCommand, prefab: string): void => {
      current = { key: `${gi}:${seen++}`, prefab, start: c.start, stop: Math.max(c.start, c.end), remove: null, commands: [] }
      if (g.no !== 0) slotOfNo.set(g.no, current)
      trainerBound = false
      plan.particles.push(current)
    }
    for (const raw of cmds) {
      const shifted: SeqCommand = cut > 0
        ? { ...raw, start: Math.max(0, raw.start - cut), end: Math.max(0, raw.end - cut) }
        : raw
      if (shifted.name === 'PokemonVisible' && opts.away?.includes(num(shifted.values.trg))) {
        plan.away.push(shifted)
        plan.frames = Math.max(plan.frames, shifted.end)
        continue
      }
      const c = retarget(shifted, opts.targets)
      if (c === null) continue
      plan.frames = Math.max(plan.frames, c.end)
      const n = c.name
      if (n === 'ParticleCreate') {
        const file = c.values.file?.[0] ?? ''
        let prefab = prefabOfFile(file)
        if (prefab === null) continue
        if (num(c.values.isBallEffect) === 1 || /eb\d{3}_ballout/.test(prefab)) prefab = ballOut
        else if (num(c.values.isCapture) === 1 || /eb\d{3}_capture/.test(prefab)) prefab = `eb${ball}_capture`
        // 카메라에 붙는 판(`ew043_cam` 위아래 띠 · `_cam_line_zoom` 집중선)은 BDSP가 컷마다 카메라 앞에
        // 세운다. 우리 입자는 무대 좌표에만 서고 카메라에 붙이는 길이 없어서, 세우면 무대 한가운데 덩그러니 선다 — 받되 안 그린다
        if (/(^|_)cam($|_|\d)/.test(prefab.replace(/^ew\d+_/, ''))) { plan.ignored.add('카메라 판'); current = null; continue }
        startParticle(c, prefab)
        continue
      }
      // 실(seal)을 붙인 볼의 등장 이펙트 — 실을 안 붙였으면 그 볼의 기본 등장 빛이다(`ee400_seal`이 같은 자리에 `eb004_ballout`을 적어 둔다)
      if (n === 'DprParticleCreateSeal') { startParticle(c, num(c.values.index) === 1 ? ballOutSecond : ballOut); continue }
      if (n === 'DprModelParticlePlay') {
        // 볼 모델에 붙은 이펙트를 튼다 — 그 노드를 따라간다
        const index = num(c.values.particleIndex)
        const prefab = opts.ballParticles?.[index]
        if (!prefab) { plan.ignored.add('볼 붙은 이펙트'); continue }
        modelOf(g.no)
        plan.particles.push({
          key: `${gi}:m${index}@${c.start}`, prefab, start: c.start, stop: Math.max(c.start, c.end), remove: null,
          commands: [{ start: c.start, end: c.start, name: 'DprParticleFollowModel', values: { grpNo: [String(g.no)], node: [prefab], isPos: ['1'] } }],
        })
        continue
      }
      if (n === 'ParticleStop') {
        if (current) (current as SeqParticle).stop = Math.min((current as SeqParticle).stop, c.start)
        continue
      }
      if (n === 'ParticleDelete') {
        if (current) (current as SeqParticle).remove = c.start
        continue
      }
      if (n === 'ParticleMoveRelativeTrainer') {
        if (current && !trainerBound) {
          trainerBound = true
          plan.particles.splice(plan.particles.indexOf(current), 1)
          plan.ignored.add('트레이너에 붙는 입자')
        }
        continue
      }
      if (n.startsWith('Particle') || n.startsWith('DprParticle')) {
        if (current && PARTICLE_CMDS.has(n)) (current as { commands: SeqCommand[] }).commands.push(c)
        else if (!SILENT.test(n)) plan.ignored.add(n)
        continue
      }
      if (MODEL_CMDS.has(n)) {
        const m = modelOf(g.no)
        if (n === 'ModelCreate') m.kind = 'locator'
        m.commands.push(c)
        continue
      }
      if (n === 'GaugeDamage') {
        if (num(c.values.trg, 0, 1) === 1 && plan.hit === null) plan.hit = c.start
        continue
      }
      if (n === 'MessageDispStd') {
        if (plan.message === null) plan.message = c.start
        continue
      }
      if (n === 'CameraShake') { plan.shakes.push(c); continue }
      if (n === 'CameraAnimationPoke' && opts.camera !== false) animCams.push(c.start)
      if (n === 'DprCameraMoveRelativeTrainer' || n === 'CameraAnimationPoke') {
        // 트레이너 어깨 너머 카메라 · 구운 카메라 애니메이션(`gfbcama` — 안 굽는다) — 잇는 상대 명령까지 버린다
        trainerCam = true
        plan.ignored.add(n === 'CameraAnimationPoke' ? '카메라 애니메이션' : '트레이너 카메라')
        continue
      }
      if (CAMERA_CMDS.has(n)) {
        if (opts.camera === false) continue
        if (c.start <= trainerUntil) continue
        if (trainerCam && num(c.values.relative) === 1) continue
        if (trainerCam && n === 'DprCameraRotate') continue
        plan.camera.push(opts.cameraFlipZ ? flipCameraZ(c) : c)
        continue
      }
      if (n === 'EffSpBackColSet' || n === 'EffSpBackColFlg') { plan.back.push(c); continue }
      if (n === 'PokemonVisibleOther' || n === 'DprPokemonVisibleOther' || n === 'PokemonVisibleAll') {
        plan.others.push(c)
        continue
      }
      // ⚠️ **맞는 쪽 감추기는 기술에서는 안 따른다.** BDSP가 카메라를 쓴 쪽 얼굴 앞으로 당길 때 가리는 몸을
      // 지우는 것이다(째려보기 `ew043`이 0~54프레임 내내 맞는 쪽을 감춘다). 따르면 내 포켓몬이 통째로 사라진다.
      // 쓴 쪽 감추기(공중날기 · 구멍파기)는 따른다. 볼 · 기절 시퀀스(`hideTarget`)는 맞는 쪽이 정말 사라진다(볼에 들어간다)
      if (n === 'PokemonVisible' && num(c.values.trg) === 1 && !opts.hideTarget) { plan.ignored.add('맞는 쪽 감추기'); continue }
      if (BODY_CMDS.has(n)) {
        const role = num(c.values.moveTrg ?? c.values.trg ?? c.values.trgPoke, 0, 0) === 1 ? 1 : 0
        plan.body[role].commands.push(c)
        continue
      }
      if (n === 'PokemonMoveResetAll') {
        plan.body[0].commands.push(c)
        plan.body[1].commands.push(c)
        continue
      }
      if (!SILENT.test(n)) plan.ignored.add(n)
    }
  })
  plan.camera.sort((a, b) => a.start - b.start)
  // ⚠️ **구운 카메라 애니메이션(`gfbcama`)은 안 굽는다** — 튀어나옴(`ee106~109`)이 f0~4를 그것으로 볼 클로즈업에서
  // 빼 낸 뒤 `CameraMoveRelativePoke`로 3m 밖까지 물러난다. 그것 없이 클로즈업(0.85m)에 선 채 볼이 터지면 빛이 화면을 덮는다
  // (실측). 그래서 애니메이션이 서는 프레임에 **뒤따르는 카메라 자리의 0.6배 거리로 끊어** 두고 거기서 물러나게 한다 — 우리 값
  for (const at of animCams) {
    const next = plan.camera.find((c) => c.name === 'CameraMoveRelativePoke' && c.start >= at)
    if (!next) continue
    const pos = vec(next.values.pos).map((x) => String(x * 0.6))
    plan.camera.push({ start: at, end: at, name: next.name, values: { ...next.values, pos, move: ['0'] } })
  }
  for (const t of plan.body) t.commands.sort((a, b) => a.start - b.start)
  for (const m of plan.models) m.commands.sort((a, b) => a.start - b.start)
  plan.others.sort((a, b) => a.start - b.start)
  plan.away.sort((a, b) => a.start - b.start)
  plan.camera.sort((a, b) => a.start - b.start)
  plan.back.sort((a, b) => a.start - b.start)
  // 조건 묶음이 이어 준 명령이 뒤에 붙었다 — 시작 프레임 차례로 (같은 프레임은 묶음 차례를 지킨다)
  for (const p of plan.particles) p.commands = [...p.commands].sort((x, y) => x.start - y.start)
  if (plan.scaleParticles) for (const p of plan.particles) p.sized = true
  return plan
}

/** 세계축 몸 기준 카메라의 깊이를 뒤집는다 (`PlanOptions.cameraFlipZ`) */
function flipCameraZ(c: SeqCommand): SeqCommand {
  if (c.name !== 'CameraMoveRelativePoke' || num(c.values.isRot) === 1) return c
  const flip = (v: readonly string[] | undefined): string[] | undefined => v && v.length === 3 ? [v[0]!, v[1]!, String(-num(v, 2))] : undefined
  return { ...c, values: { ...c.values, pos: flip(c.values.pos) ?? c.values.pos ?? [], trg: flip(c.values.trg) ?? c.values.trg ?? [] } }
}

const CAMERA_CMDS = new Set([
  'CameraMoveRelativePoke', 'CameraMovePosition', 'CameraTwist', 'CameraReset', 'CameraResetFieldAll',
  'DprCameraMovePosition', 'DprCameraLookAtPath', 'DprCameraRotate',
])

const PARTICLE_CMDS = new Set([
  'ParticleMoveRelativePoke', 'ParticleMovePosition', 'ParticleFollowPoke', 'ParticleScale',
  'ParticleRotate', 'ParticleRotatePoke', 'ParticleSpMoveShake', 'ParticleLengthScale',
  'DprParticleMoveRelativeModel', 'DprParticleFollowModel',
])

const BODY_CMDS = new Set([
  'PokemonMoveRelativePoke', 'PokemonMovePosition', 'PokemonMoveReset', 'PokemonScale',
  'PokemonVisible', 'PokemonShaderCol', 'PokemonAttackMotion', 'PokemonMotion', 'HitBack',
  'PokemonRotatePoke', 'PokemonRotate', 'PokemonSpMoveShake', 'PokemonIntroMotion', 'PokemonSetMotionSpeed',
])

const MODEL_CMDS = new Set([
  'ModelCreateBall', 'ModelCreate', 'ModelDelete', 'ModelVisible', 'ModelMovePosition', 'ModelMoveRelativePoke',
  'ModelRotate', 'ModelSpMoveShake', 'ModelSetAnimationSpeed', 'DprModelAnimationPlayIndex', 'DprModelAttachTrainer',
])

// ─── 이어 붙이기 ─────────────────────────────────────────

/** 명령 하나를 `by`프레임 민다 */
const shiftCmd = (c: SeqCommand, by: number): SeqCommand => ({ ...c, start: c.start + by, end: c.end + by })

/**
 * 계획 여럿을 차례로 잇는다 — 포획은 `ee101`(던지기) → `ee102~104`(흔들기) → `ee105`/`ee106~109`(결과)가
 * **한 볼 · 한 카메라**로 이어져야 한다. 따로 틀면 시퀀스가 바뀔 때마다 카메라가 기본 자리에서 다시 출발하고
 * 볼 클립이 처음으로 돌아간다. 같은 묶음 번호의 모델은 한 모델이다(BDSP도 볼을 `no=12` 하나로 이어 쓴다).
 *
 * @param plans `[계획, 시작 프레임]` — 시작 프레임은 `seqLength`로 앞 계획의 끝을 잰 값이다
 */
export function chainPlans(name: string, plans: readonly (readonly [SeqPlan, number])[]): SeqPlan {
  const out: SeqPlan = {
    name, particles: [], body: [{ commands: [] }, { commands: [] }], models: [], others: [], away: [], shakes: [], camera: [],
    back: [], hit: null, message: null, frames: 0, shaderBase: plans[0]?.[0].shaderBase ?? 0,
    clipSeconds: plans[0]?.[0].clipSeconds ?? [], scaleParticles: plans[0]?.[0].scaleParticles ?? false,
    cameraAtRest: plans[0]?.[0].cameraAtRest ?? false, ignored: new Set(),
  }
  plans.forEach(([p, at], i) => {
    const s = (c: SeqCommand): SeqCommand => shiftCmd(c, at)
    for (const q of p.particles) {
      out.particles.push({
        key: `${i}/${q.key}`, prefab: q.prefab, start: q.start + at, stop: q.stop + at,
        remove: q.remove === null ? null : q.remove + at, commands: q.commands.map(s), sized: q.sized,
      })
    }
    for (const r of [0, 1] as const) out.body[r].commands.push(...p.body[r].commands.map(s))
    for (const m of p.models) {
      let to = out.models.find((x) => x.no === m.no)
      if (!to) { to = { no: m.no, kind: m.kind, ball: m.ball, commands: [] }; out.models.push(to) }
      to.commands.push(...m.commands.map(s))
    }
    out.others.push(...p.others.map(s))
    out.away.push(...p.away.map(s))
    out.shakes.push(...p.shakes.map(s))
    out.camera.push(...p.camera.map(s))
    out.back.push(...p.back.map(s))
    if (p.hit !== null && out.hit === null) out.hit = p.hit + at
    if (p.message !== null) out.message = p.message + at
    out.frames = Math.max(out.frames, p.frames + at)
    for (const n of p.ignored) out.ignored.add(n)
  })
  for (const t of out.body) t.commands.sort((a, b) => a.start - b.start)
  for (const m of out.models) m.commands.sort((a, b) => a.start - b.start)
  out.others.sort((a, b) => a.start - b.start)
  out.away.sort((a, b) => a.start - b.start)
  out.camera.sort((a, b) => a.start - b.start)
  out.back.sort((a, b) => a.start - b.start)
  return out
}

/**
 * 시퀀스 한 벌의 길이(프레임). **BDSP는 시퀀스 길이를 롬에 안 적는다** — 마지막 명령이 끝나는 프레임과,
 * 그 전에 튼 볼 클립이 끝나는 프레임 중 늦은 쪽이다(우리 규칙).
 *
 * 왜 클립까지 보나. 흔들기 둘째(`ee103`)는 명령이 f27에 끝나는데 f20에 튼 `ee103_ball_anim`(0.53초부터)의 흔들림은
 * f31~43이다 — 명령 끝에서 끊으면 둘째 흔들림이 안 보인다. 마지막 명령과 **같은 프레임에** 튼 클립은 안 센다:
 * `ee102`가 f20(끝)에 튼 `ee103_ball_anim`은 다음 시퀀스(`ee103`)가 이어 받는다
 */
export function seqLength(plan: SeqPlan): number {
  let len = plan.frames
  for (const m of plan.models) {
    for (const c of m.commands) {
      if (c.name !== 'DprModelAnimationPlayIndex' || c.start >= plan.frames) continue
      const secs = plan.clipSeconds[num(c.values.index)]
      if (secs === null || secs === undefined || num(c.values.isLoop) === 1) continue
      const end = clipEndFrame(m, c.start, num(c.values.startTime), secs)
      // 다음 클립이 그 전에 갈아 끼우면 이 클립의 끝은 안 보인다
      const next = m.commands.find((x) => x.name === 'DprModelAnimationPlayIndex' && x.start > c.start)
      if (next && next.start < end) continue
      if (Number.isFinite(end)) len = Math.max(len, end)
    }
  }
  return Math.max(1, len)
}

/**
 * 쉬움 곡선. `move` 번호의 이름은 롬에 없다 — 0만 직선으로 확인했고(대부분이 0),
 * 나머지는 부드러운 곡선 하나로 둔다
 */
export function ease(move: number, t: number): number {
  const x = Math.min(1, Math.max(0, t))
  if (move === 0) return x
  if (move === 1 || move === 4 || move === 7) return x * x // 들어갈 때 느리게
  if (move === 2 || move === 5 || move === 8) return 1 - (1 - x) * (1 - x) // 나올 때 느리게
  return x * x * (3 - 2 * x)
}

/** 명령의 진행 (0~1). 한 프레임짜리면 시작하는 순간 1 */
function progress(c: SeqCommand, f: number): number {
  if (f < c.start) return 0
  if (c.end <= c.start) return 1
  return ease(num(c.values.move), (f - c.start) / (c.end - c.start))
}

/** 유니티 오프셋(cm)을 우리 좌표로 — X 거울. `yaw`가 있으면 몸 방향으로 돌린다 */
function offsetOf(v: V3, yaw: number | null): V3 {
  const x = -v[0] / 100, y = v[1] / 100, z = v[2] / 100
  if (yaw === null) return [x, y, z]
  const c = Math.cos(yaw), s = Math.sin(yaw)
  return [x * c + z * s, y, -x * s + z * c]
}

/** 절대 자리 — 맥락이 주는 기준으로, 없으면 무대 한가운데 기준 */
function worldOf(ctx: SeqContext, cm: V3): V3 {
  return ctx.world ? ctx.world(cm) : offsetOf(cm, null)
}

/**
 * 절대 자리를 한 몸의 발밑 기준으로 옮기는 `world` — 포획 시퀀스(`ee101~109`)가 그렇다: 떨어진 볼의 자리
 * (`ModelMovePosition 0/5/0`)와 그 볼을 보는 카메라(`CameraMovePosition trg=0/0/0` · `DprCameraLookAtPath`)가
 * 원점을 쓰는데, 성공 시퀀스(`ee105`)는 같은 볼을 `ModelMoveRelativePoke trg=1 node=0`(맞는 쪽 발밑)에 세운다.
 * 둘이 같은 자리여야 하므로 원점은 맞는 쪽 발밑이다. 튀어나옴(`ee106`)의 `PokemonMovePosition 0/0/0`(제자리로)도 같은 뜻이다
 *
 * @param bdspHome 그 몸이 BDSP 무대에서 선 자리(cm) — 이만큼 빼고 우리 발판에 더한다. 내보내기(`ee400`)는
 *   BDSP 무대 좌표 그대로라(내 쪽 첫째 0/0/250) 그 자리를 준다
 */
export function worldAround(home: V3, bdspHome: V3 = [0, 0, 0]): (cm: V3) => V3 {
  return (cm) => {
    const d = offsetOf([cm[0] - bdspHome[0], cm[1] - bdspHome[1], cm[2] - bdspHome[2]], null)
    return [home[0] + d[0], home[1] + d[1], home[2] + d[2]]
  }
}

/**
 * 더블 내보내기(`ee401` · `ee402` · `ee404` · `ee405`)의 `world` — BDSP 절대 자리(cm)를 **우리 두 발판**에 맞춰 옮긴다.
 *
 * 그 시퀀스는 두 마리가 BDSP 자리(옆으로 ±2.5m)에 서는 것으로 적혀 있다: 볼이 `ModelMovePosition ±250/160/250`으로 거기 날아가
 * 열리고 카메라가 두 마리 가운데를 본다. 우리 두 발판은 그만큼 벌어지지 않으므로(`shots.pairOffset` — 내 쪽 0.9m · 상대 1.7m)
 * 옆(`x`)은 **두 발판 사이를 그 비율로** 옮기고(볼이 몸 위에서 열린다), 깊이 · 높이는 BDSP 그대로(카메라 거리)다.
 *
 * @param a · b 첫째 · 둘째 발판 (무대 좌표 x · z)
 * @param aX 시퀀스에서 첫째가 서는 BDSP x (cm) — 내 쪽 −250 · 상대 +250. 둘째는 그 반대다
 * @param z BDSP에서 두 마리가 선 깊이 (cm) — 내 쪽 250 · 상대 −250. 우리 두 발판의 가운데 깊이가 이 깊이다
 */
export function worldPair(a: readonly [number, number], b: readonly [number, number], aX: number, z: number): (cm: V3) => V3 {
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  return (cm) => {
    // t: 0 둘째 · 1 첫째 · 0.5 가운데
    const t = aX === 0 ? 0.5 : 0.5 + cm[0] / (2 * aX)
    return [b[0] + (a[0] - b[0]) * t, cm[1] / 100, mid[1] + (cm[2] - z) / 100 + (b[1] + (a[1] - b[1]) * t - mid[1])]
  }
}

/** 오프셋을 돌릴 각 — `isRot`이면 몸 방향, `isFlip`이면 내 쪽일 때 반 바퀴, 아니면 그대로 */
function offsetYaw(values: SeqCommand['values'], rotKey: string, role: Role, yaw: number, ctx: SeqContext): number | null {
  if (num(values[rotKey], 0, num(values.isRot)) === 1) return yaw
  if (num(values.isFlip) === 1) return ctx.mine(role) ? Math.PI : null
  return null
}

/** `enableElem` 축 고르기 — 꺼진 축은 앞 값 그대로 */
const mask3 = (mask: readonly string[] | undefined, cur: V3, want: V3): V3 => [
  num(mask, 0, 1) === 1 ? want[0] : cur[0],
  num(mask, 1, 1) === 1 ? want[1] : cur[1],
  num(mask, 2, 1) === 1 ? want[2] : cur[2],
]

/**
 * 한 칸의 명령 목록을 `limit` 앞까지 `g` 프레임으로 접는다 — 자리 · 모델 자리 · 몸 자리 · 카메라가 다 같은 꼴이다:
 * 이미 시작한 명령(`g >= start`)을 차례로 읽어 값을 갈아 끼우고, 아직 진행 중인 명령(`g < end`)은 **그 명령이 시작하는
 * 프레임의 접힌 값**(`before`)에서 목표로 `progress`만큼 간다.
 *
 * `step`은 명령 하나가 만드는 다음 값이다. `undefined`면 그 명령은 값에 손대지 않는다(`null`은 값이다 — 카메라의 「기본」).
 * 진행 중 명령의 출발값은 `before()`로 받는다 — 값싸게 안 쓰면 안 불린다.
 *
 * ⚠️ `before(i)`는 `g`와 상관없이 **명령 `i`의 시작 프레임에서 `i` 앞까지 접은 값**이라 한 번의 호출 안에서는
 * 항상 같다. 겹친 이음이 많은 칸에서 같은 앞부분을 되풀이해 접지 않도록 호출 하나 안에서 한 번만 잰다(`memo`)
 */
export type FoldStep<T> = (c: SeqCommand, value: T, g: number, before: () => T) => T | undefined

export function foldTrack<T>(
  cmds: readonly SeqCommand[], limit: number, g: number, init: T, step: FoldStep<T>, memo?: Map<number, T>,
): T {
  let value = init
  let shared = memo
  for (let i = 0; i < limit; i++) {
    const c = cmds[i]!
    if (g < c.start) continue
    const before = (): T => {
      shared ??= new Map<number, T>()
      if (!shared.has(i)) shared.set(i, foldTrack(cmds, i, c.start, init, step, shared))
      return shared.get(i) as T
    }
    const next = step(c, value, g, before)
    if (next !== undefined) value = next
  }
  return value
}

/** 이음이 아직 도는 중인가 (`g`가 `start` 이후 `end` 전) */
const ramping = (c: SeqCommand, g: number): boolean => c.end > c.start && g < c.end

// ─── 입자 칸 ─────────────────────────────────────────────

interface ParticlePose {
  pos: V3
  /** 우리 좌표의 사원수 (xyzw) */
  quat: [number, number, number, number]
  scale: V3
}

/** 입자 칸의 그 프레임 자세 */
export function particleAt(p: SeqParticle, f: number, ctx: SeqContext): ParticlePose {
  let yaw = 0, pitch = 0
  let extra: V3 = [0, 0, 0]
  let scale: V3 = [1, 1, 1]
  /** 길이 맞추기(`ParticleLengthScale`)의 배율과 그 축 */
  let length = 1
  let lengthAxes: V3 = [0, 0, 0]
  const at = Math.max(f, p.start)
  // 자리: 앞 명령들의 접힌 값에서 이번 목표로
  // 자리 명령이 하나도 없는 칸은 BDSP가 이펙트 모델(`ModelCreate` — 껍질 · 동전)에 붙인 것이다
  // (`DprParticleFollowModel`). 그 모델이 없으면 쓴 쪽 발밑에 세운다 — 무대 한가운데
  // (원점)에 서면 두 몸 사이 허공에 뜬다
  const placed = p.commands.some((c) => PLACE.has(c.name))
  const pos = placed ? foldPlace(p, at, ctx) : (ctx.home(0)?.pos ?? [0, 0, 0])
  for (const c of p.commands) {
    if (at < c.start) continue
    const t = progress(c, at)
    switch (c.name) {
      case 'ParticleMoveRelativePoke': {
        if (num(c.values.isRot) === 1) {
          const a = ctx.anchor(num(c.values.trg) === 1 ? 1 : 0, num(c.values.node))
          if (a) yaw = a.yaw
        }
        break
      }
      case 'ParticleRotatePoke': {
        const to = ctx.anchor(num(c.values.dirPoke) === 1 ? 1 : 0, num(c.values.node))
        if (to) {
          const dx = to.pos[0] - pos[0], dy = to.pos[1] - pos[1], dz = to.pos[2] - pos[2]
          const ny = Math.atan2(dx, dz)
          const np = num(c.values.vertical) === 1 ? Math.atan2(dy, Math.hypot(dx, dz)) : 0
          yaw += (ny + num(c.values.ofs) * Math.PI / 180 - yaw) * t
          pitch += (np - pitch) * t
        }
        break
      }
      case 'ParticleRotate': {
        const v = vec(c.values.scale)
        const target: V3 = num(c.values.relative) === 1 ? add(extra, v) : v
        extra = lerp3(extra, target, t)
        break
      }
      case 'ParticleScale': {
        const v = vec(c.values.scale, 1)
        const target: V3 = num(c.values.relative) === 1 ? [scale[0] * v[0], scale[1] * v[1], scale[2] * v[2]] : v
        scale = lerp3(scale, target, t)
        break
      }
      case 'ParticleLengthScale': {
        // 빔이 제 자리에서 그 몸 로케이터까지 닿도록 늘린다 — 배율 = 거리 / `baseLen`. `scale`이 늘릴 축이다
        // (`ee101_03_line`: f29에 몸까지 닿고 f32~47에 1/20로 줄며 볼로 빨려 든다)
        const to = ctx.anchor(num(c.values.trg) === 1 ? 1 : 0, num(c.values.node))
        if (!to) break
        const want = dist3(pos, to.pos) / Math.max(0.01, num(c.values.baseLen, 0, 1))
        length += (want - length) * t
        lengthAxes = vec(c.values.scale)
        break
      }
      default:
        break
    }
  }
  // 몸 크기로 늘린다 (`isScale`) — 그 입자가 붙은 몸
  const sized = p.commands.find((c) => c.name === 'ParticleMoveRelativePoke' && num(c.values.isScale) === 1 && at >= c.start)
  if (sized && ctx.scale && p.sized === true) {
    const k = ctx.scale(num(sized.values.trg) === 1 ? 1 : 0)
    scale = [scale[0] * k, scale[1] * k, scale[2] * k]
  }
  if (length !== 1) {
    scale = [
      scale[0] * (lengthAxes[0] ? length : 1),
      scale[1] * (lengthAxes[1] ? length : 1),
      scale[2] * (lengthAxes[2] ? length : 1),
    ]
  }
  return { pos, quat: poseQuat(yaw, pitch, extra), scale }
}

const PLACE = new Set([
  'ParticleMoveRelativePoke', 'ParticleMovePosition', 'ParticleFollowPoke',
  'DprParticleMoveRelativeModel', 'DprParticleFollowModel',
])

/** 입자 자리 명령을 접은 `g` 프레임의 값 */
function foldPlace(p: SeqParticle, g: number, ctx: SeqContext): V3 {
  return foldTrack<V3>(p.commands, p.commands.length, g, [0, 0, 0], (c, value, g, before) => {
    if (!PLACE.has(c.name)) return undefined
    const target = placeTarget(c, ctx, value, g)
    if (target === null) return undefined
    return ramping(c, g) ? lerp3(before(), target, progress(c, g)) : target
  })
}

/** 자리 명령 하나의 목표 (`g` 프레임에 잰다 — 모델을 따라가는 것은 그 프레임의 모델 자리다) */
function placeTarget(c: SeqCommand, ctx: SeqContext, before: V3, g: number): V3 | null {
  switch (c.name) {
    case 'ParticleMoveRelativePoke': {
      const role: Role = num(c.values.trg) === 1 ? 1 : 0
      const a = ctx.anchor(role, num(c.values.node))
      if (!a) return null
      const rot = offsetYaw(c.values, 'isRotPos', role, a.yaw, ctx)
      const rate = num(c.values.rate, 0, 100) / 100
      return lerp3(before, add(a.pos, offsetOf(vec(c.values.pos), rot)), rate)
    }
    case 'ParticleFollowPoke': {
      if (num(c.values.isEnable, 0, 1) !== 1) return before
      const role: Role = num(c.values.pos) === 1 ? 1 : 0
      const a = ctx.anchor(role, num(c.values.node))
      if (!a) return null
      return add(a.pos, offsetOf(vec(c.values.posOfs), num(c.values.isRot) === 1 ? a.yaw : null))
    }
    case 'ParticleMovePosition': {
      const v = vec(c.values.pos)
      return num(c.values.relative) === 1 ? add(before, offsetOf(v, null)) : worldOf(ctx, v)
    }
    case 'DprParticleMoveRelativeModel':
    case 'DprParticleFollowModel': {
      if (c.name === 'DprParticleFollowModel' && num(c.values.isPos, 0, 1) !== 1) return before
      const no = num(c.values.grpNo)
      const nodeName = c.values.node?.[0]
      const node: number | string = nodeName !== undefined && !/^\d+$/.test(nodeName) ? nodeName : num(c.values.nodeIndex)
      // 한 번 옮기는 것(`MoveRelativeModel`)은 그 명령이 끝나는 프레임의 모델 자리에 선다 — 그 뒤 볼이 옮겨 가도 따라가지 않는다
      const at = ctx.modelNode?.(no, node, c.name === 'DprParticleMoveRelativeModel' ? Math.min(g, c.end) : g) ?? null
      if (!at) return null
      return c.name === 'DprParticleFollowModel' ? add(at, offsetOf(vec(c.values.pos), null)) : at
    }
    default:
      return null
  }
}

/**
 * 몸 방향(yaw · pitch)과 유니티 오일러(도) 덧회전을 우리 좌표 사원수 하나로.
 *
 * 유니티 오일러는 Z → X → Y 차례이고, 우리 좌표로는 (x, −y, −z, w)로 건너온다
 */
function poseQuat(yaw: number, pitch: number, extra: V3): Q {
  // 몸 쪽: Y로 yaw, 그다음 X로 −pitch (앞이 +Z라 위를 보려면 X를 음으로)
  const base = mulQ(axisQ(0, 1, 0, yaw), axisQ(1, 0, 0, -pitch))
  return mulQ(base, unityEuler(extra))
}

/** 유니티 오일러(도, ZXY) → 우리 좌표 사원수 (X 거울) */
function unityEuler(deg: V3): Q {
  const d = Math.PI / 180
  // 유니티 R = Ry · Rx · Rz
  const u = mulQ(mulQ(axisQ(0, 1, 0, deg[1] * d), axisQ(1, 0, 0, deg[0] * d)), axisQ(0, 0, 1, deg[2] * d))
  return [u[0], -u[1], -u[2], u[3]]
}

function axisQ(x: number, y: number, z: number, a: number): Q {
  const s = Math.sin(a / 2)
  return [x * s, y * s, z * s, Math.cos(a / 2)]
}

function mulQ(a: readonly number[], b: readonly number[]): Q {
  const [ax, ay, az, aw] = a as Q
  const [bx, by, bz, bw] = b as Q
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

// ─── 시퀀스 모델 (볼) ────────────────────────────────────

/** 시퀀스 모델의 그 프레임 값 */
interface ModelPose {
  no: number
  kind: 'ball' | 'locator'
  visible: boolean
  /** 뿌리 자리 (무대 좌표) */
  pos: V3
  /** 뿌리 회전 (우리 좌표 사원수) */
  quat: Q
  /** 지금 트는 클립과 그 시각(초). 아무것도 안 틀었으면 `null` */
  clip: { index: number; time: number; loop: boolean } | null
  /** 트레이너 손을 떠나 날아가는 중이면 0~1, 아니면 `null` */
  flight: number | null
}

/** 그 묶음 번호의 모델 */
function modelTrack(plan: SeqPlan, no: number): ModelTrack | null {
  return plan.models.find((m) => m.no === no) ?? null
}

/**
 * 시퀀스 모델의 그 프레임 값. 아직 안 만들어졌거나 지웠으면 `null`.
 *
 * - `ModelCreateBall` · `ModelCreate`에서 서고 `ModelDelete`에서 사라진다. 만드는 명령이 없는 묶음(`ee400`의
 *   `Playerボール` — 이미 트레이너 손에 들린 볼)은 0프레임부터 있다
 * - `DprModelAttachTrainer isEnable=1`인 동안은 트레이너 손에 있다. 손을 떠나는 프레임(`isEnable=0`)의
 *   **`THROW_FRAMES` 앞부터** 화면 밖 던지는 자리(`ctx.trainer`)에서 그 프레임에 놓일 자리로 포물선을 그린다
 * - 자리: `ModelMovePosition`(상대 · 절대) · `ModelMoveRelativePoke`(몸 로케이터 기준) — 접어 가며
 * - 회전: `ModelRotate`(유니티 오일러, 도) · 흔들림: `ModelSpMoveShake`
 * - 클립: `DprModelAnimationPlayIndex`가 튼 클립의 시각 = 시작 시각 + 그 뒤 `ModelSetAnimationSpeed` 배속을 적분한 것
 */
export function modelAt(plan: SeqPlan, no: number, f: number, ctx: SeqContext): ModelPose | null {
  const m = modelTrack(plan, no)
  if (!m) return null
  const cmds = m.commands
  const create = cmds.find((c) => c.name === 'ModelCreateBall' || c.name === 'ModelCreate')
  if (create && f < create.start) return null
  const del = cmds.find((c) => c.name === 'ModelDelete' && (!create || c.start >= create.start))
  if (del && f >= del.start) return null

  let visible = true
  let attached: { trainer: number; at: number } | null = null
  for (const c of cmds) {
    if (f < c.start) break
    if (c.name === 'ModelVisible') visible = num(c.values.visible, 0, 1) === 1
    if (c.name === 'DprModelAttachTrainer') {
      attached = num(c.values.isEnable, 0, 1) === 1 ? { trainer: num(c.values.trg), at: c.start } : null
    }
  }

  let pos = foldModelPlace(m, f, ctx)
  let rot: V3 = [0, 0, 0]
  for (const c of cmds) {
    if (f < c.start || c.name !== 'ModelRotate') continue
    const v = vec(c.values.scale)
    const target = num(c.values.relative) === 1 ? add(rot, v) : v
    rot = lerp3(rot, target, progress(c, f))
  }
  let quat = unityEuler(rot)
  let flight: number | null = null
  if (attached) {
    // 손을 떠나는 프레임 — 그 프레임에 놓일 자리까지 날아간다
    const off = cmds.find((c) => c.name === 'DprModelAttachTrainer' && c.start > attached!.at && num(c.values.isEnable, 0, 1) !== 1)
    const from = ctx.trainer?.(attached.trainer) ?? null
    if (!off || !from || f < off.start - THROW_FRAMES) {
      visible = false
    } else {
      const k = Math.min(1, Math.max(0, (f - (off.start - THROW_FRAMES)) / THROW_FRAMES))
      const to = foldModelPlace(m, off.start, ctx)
      pos = [
        from[0] + (to[0] - from[0]) * k,
        from[1] + (to[1] - from[1]) * k + Math.sin(k * Math.PI) * THROW_ARC,
        from[2] + (to[2] - from[2]) * k,
      ]
      // 손을 떠난 볼은 앞으로 굴러 간다 — 한 바퀴 반을 돌아 놓일 자세에서 멎는다 (우리 값)
      const toRot = rotBefore(m, off.start)
      quat = mulQ(unityEuler(toRot), axisQ(1, 0, 0, (1 - k) * Math.PI * 3))
      flight = k
    }
  }

  // 흔들림 — 세기(srate → erate)를 cm로 읽고 `SHAKE_BODY_GAIN`을 곱한다. 잦기는 `SHAKE_HZ` (`PokemonSpMoveShake`와 같은 짐작)
  for (const c of cmds) {
    if (c.name !== 'ModelSpMoveShake' || f < c.start || f > c.end) continue
    const k = c.end > c.start ? (f - c.start) / (c.end - c.start) : 1
    const amp = (num(c.values.srate) + (num(c.values.erate) - num(c.values.srate)) * k) / 100 * SHAKE_BODY_GAIN
    const w = Math.sin((f / SEQ_FPS) * Math.PI * 2 * SHAKE_HZ) * amp
    const axis = num(c.values.axis)
    pos = [pos[0] + (axis === 0 ? w : 0), pos[1] + (axis === 1 ? w : 0), pos[2] + (axis === 2 ? w : 0)]
  }

  return { no, kind: m.kind, visible, pos, quat, clip: clipAt(m, f), flight }
}

/** 그 프레임까지 접은 회전(도) */
function rotBefore(m: ModelTrack, f: number): V3 {
  let rot: V3 = [0, 0, 0]
  for (const c of m.commands) {
    if (f < c.start || c.name !== 'ModelRotate') continue
    const v = vec(c.values.scale)
    rot = lerp3(rot, num(c.values.relative) === 1 ? add(rot, v) : v, progress(c, f))
  }
  return rot
}

/** 모델 자리 명령을 접은 `g` 프레임의 값 */
function foldModelPlace(m: ModelTrack, g: number, ctx: SeqContext): V3 {
  return foldTrack<V3>(m.commands, m.commands.length, g, ctx.home(1)?.pos ?? [0, 0, 0], (c, value, g, before) => {
    let target: V3
    if (c.name === 'ModelMovePosition') {
      const v = vec(c.values.pos)
      target = num(c.values.relative) === 1 ? add(value, offsetOf(v, null)) : worldOf(ctx, v)
    } else if (c.name === 'ModelMoveRelativePoke') {
      const role: Role = num(c.values.trg) === 1 ? 1 : 0
      const a = ctx.rest(role, num(c.values.node))
      if (!a) return undefined
      const rot = offsetYaw(c.values, 'isRotPos', role, a.yaw, ctx)
      const rate = num(c.values.rate, 0, 100) / 100
      target = lerp3(value, add(a.pos, offsetOf(vec(c.values.pos), rot)), rate)
    } else return undefined
    target = mask3(c.values.enableElem, value, target)
    return ramping(c, g) ? lerp3(before(), target, progress(c, g)) : target
  })
}

/** 그 프레임의 배속 */
function speedAt(m: ModelTrack, g: number): number {
  let speed = 1
  for (const c of m.commands) {
    if (c.name !== 'ModelSetAnimationSpeed' || g < c.start) continue
    speed = num(c.values.speed, 0, 1)
  }
  return speed
}

/** `from`에서 `to`프레임까지 배속을 적분한 초 */
function playedSeconds(m: ModelTrack, from: number, to: number): number {
  const marks = m.commands
    .filter((c) => c.name === 'ModelSetAnimationSpeed' && c.start > from && c.start < to)
    .map((c) => c.start)
  let secs = 0
  let at = from
  for (const mark of [...marks, to]) {
    secs += (mark - at) / SEQ_FPS * speedAt(m, at)
    at = mark
  }
  return secs
}

/** 지금 클립과 그 시각 */
function clipAt(m: ModelTrack, f: number): ModelPose['clip'] {
  let play: SeqCommand | null = null
  for (const c of m.commands) if (c.name === 'DprModelAnimationPlayIndex' && f >= c.start) play = c
  if (!play) return null
  return {
    index: num(play.values.index),
    time: num(play.values.startTime) + playedSeconds(m, play.start, f),
    loop: num(play.values.isLoop) === 1,
  }
}

/** `start`프레임에 `startTime`초부터 튼 `secs`초짜리 클립이 끝나는 프레임 (배속 0에 갇히면 무한) */
function clipEndFrame(m: ModelTrack, start: number, startTime: number, secs: number): number {
  const left = secs - startTime
  if (left <= 0) return start
  const marks = m.commands.filter((c) => c.name === 'ModelSetAnimationSpeed' && c.start > start).map((c) => c.start)
  let at = start
  let done = 0
  for (const mark of [...marks, Infinity]) {
    const speed = speedAt(m, at)
    const span = (mark - at) / SEQ_FPS * speed
    if (done + span >= left) return speed > 0 ? at + (left - done) / speed * SEQ_FPS : Infinity
    done += span
    at = mark
  }
  return Infinity
}

// ─── 몸 ──────────────────────────────────────────────────

interface BodyPose {
  /** 발판에서 옮겨 간 만큼 (무대 좌표, m) */
  offset: V3
  scale: V3
  visible: boolean
  /** 몸 빛 (`PokemonShaderCol`) — 색과 세기. 없으면 `null` */
  glow: { color: V3; power: number } | null
  /** 덧 회전 (라디안, Y) — `PokemonRotate` */
  turn: number
  /** 떨림 (m) */
  shake: V3
  /**
   * 지금 틀 동작과 그것이 시작한 프레임
   */
  motion: { name: SeqMotion; at: number } | null
  /** 동작 배속 (`PokemonSetMotionSpeed`) — 0이면 그 자세로 멎는다 */
  motionSpeed: number
  /** 이 시퀀스가 몸이 나타나는 것을 쥐고 있다 (`PokemonIntroMotion`) — 무대는 제 등판 연출을 안 건다 */
  intro: boolean
}

/** 동작 번호 → 우리 동작 (BDSP 모션 표: 16 피격 · 17 쓰러짐 · 30~42 공격 · 0 대기) */
type SeqMotion = 'attack' | 'damage' | 'wait' | 'cry' | 'down' | 'landB' | 'landC'

function motionOf(id: number): SeqMotion | null {
  if (id === 16) return 'damage'
  // 17 — 기절 시퀀스(`ee620` · `ee621`)만 쓴다. 모델의 `ba41_down01`이다
  if (id === 17) return 'down'
  if (id >= 30 && id <= 42) return 'attack'
  if (id === 0) return 'wait'
  if (id === 12 || id === 13) return 'cry'
  if (id === 14) return 'attack'
  return null
}

/** 몸 하나의 그 프레임 값 */
export function bodyAt(plan: SeqPlan, role: Role, f: number, ctx: SeqContext): BodyPose {
  const out: BodyPose = {
    offset: [0, 0, 0], scale: [1, 1, 1], visible: true, glow: null, turn: 0, shake: [0, 0, 0], motion: null,
    motionSpeed: 1, intro: false,
  }
  const home = ctx.home(role)
  const cmds = plan.body[role].commands
  // 자리: 접어 가며
  out.offset = foldTrack<V3>(cmds, cmds.length, f, [0, 0, 0], (c, value, g, before) => {
      let target: V3 | null = null
      switch (c.name) {
        case 'PokemonMoveRelativePoke': {
          const posRole: Role = num(c.values.posTrg) === 1 ? 1 : 0
          const to = ctx.rest(posRole, num(c.values.node))
          if (!to || !home) break
          const rot = offsetYaw(c.values, 'isRot', posRole, to.yaw, ctx)
          const want = add(to.pos, offsetOf(vec(c.values.ofs), rot))
          const rate = num(c.values.rate, 0, 100) / 100
          target = [(want[0] - home.pos[0]) * rate, (want[1] - home.pos[1]) * rate, (want[2] - home.pos[2]) * rate]
          break
        }
        case 'PokemonMovePosition': {
          const raw = vec(c.values.pos)
          const v = offsetOf(raw, home ? offsetYaw(c.values, 'isRotPos', role, home.yaw, ctx) : null)
          if (num(c.values.relative) === 1) target = add(value, v)
          else if (home) {
            const w = ctx.world ? ctx.world(raw) : v
            target = [w[0] - home.pos[0], w[1] - home.pos[1], w[2] - home.pos[2]]
          }
          // 절대 자리 0,0,0은 「제자리로」로 쓰인다 (`ew???` 열 군데 · 튀어나옴 `ee106`) — 발판으로 둔다
          if (num(c.values.relative) !== 1 && raw[0] === 0 && raw[1] === 0 && raw[2] === 0) target = [0, 0, 0]
          if (target) target = mask3(c.values.enableElem, value, target)
          break
        }
        case 'PokemonMoveReset':
        case 'PokemonMoveResetAll':
          target = [0, 0, 0]
          break
        default:
          return undefined
      }
    if (target === null) return undefined
    return ramping(c, g) ? lerp3(before(), target, progress(c, g)) : target
  })

  for (const c of cmds) {
    if (f < c.start) continue
    const t = progress(c, f)
    switch (c.name) {
      case 'PokemonScale': {
        const v = vec(c.values.scale, 1)
        const target: V3 = num(c.values.relative) === 1 ? [out.scale[0] * v[0], out.scale[1] * v[1], out.scale[2] * v[2]] : v
        out.scale = lerp3(out.scale, target, t)
        break
      }
      case 'PokemonVisible':
        out.visible = num(c.values.visible, 0, 1) === 1
        break
      case 'PokemonShaderCol': {
        const a = vec(c.values.start_col, 1), b = vec(c.values.end_col, 1)
        const pa = num(c.values.start_pow), pb = num(c.values.end_pow)
        const k = plan.shaderBase
        const col = lerp3(a, b, t)
        out.glow = { color: [Math.max(0, col[0] - k), Math.max(0, col[1] - k), Math.max(0, col[2] - k)], power: pa + (pb - pa) * t }
        break
      }
      case 'PokemonRotate': {
        const v = vec(c.values.scale)
        const deg = -v[1] * Math.PI / 180
        const target = num(c.values.relative) === 1 ? out.turn + deg : deg
        out.turn += (target - out.turn) * t
        break
      }
      case 'PokemonAttackMotion':
      case 'PokemonMotion': {
        const name = motionOf(num(c.values.motion))
        if (name) out.motion = { name, at: c.start }
        out.motionSpeed = 1
        break
      }
      case 'PokemonSetMotionSpeed':
        out.motionSpeed = num(c.values.speed, 0, 1)
        break
      case 'HitBack':
        out.motion = { name: 'damage', at: c.start }
        break
      case 'PokemonSpMoveShake': {
        if (f > c.end) break
        // 세기(srate → erate)를 cm로 읽고 `SHAKE_BODY_GAIN`을 곱한다 — 정확한 뜻은 못 찾았다
        const k = c.end > c.start ? (f - c.start) / (c.end - c.start) : 1
        const amp = (num(c.values.srate) + (num(c.values.erate) - num(c.values.srate)) * k) / 100 * SHAKE_BODY_GAIN
        const w = Math.sin((f / SEQ_FPS) * Math.PI * 2 * SHAKE_HZ) * amp
        const axis = num(c.values.axis)
        if (axis === 1) out.shake[1] += w
        else if (axis === 2) out.shake[2] += w
        else out.shake[0] += w
        break
      }
      default:
        break
    }
  }

  // 내보내기 — `PokemonIntroMotion`이 서는 프레임까지 몸은 없다. 서면 `height`(cm) 위에서 볼 빛 속에 자라나며
  // 떨어지고(`INTRO_FALL`), 공중 동작(`ba01_landB`)을 틀다 땅에 닿으면 착지(`ba01_landC`)를 튼다
  const intro = cmds.find((c) => c.name === 'PokemonIntroMotion')
  if (intro) {
    out.intro = true
    if (f < intro.start) {
      // 나타나기 전에는 몸이 없다 — 시퀀스가 들어 올린 자리(`PokemonMovePosition +160`)는 볼 자리를 잡는 데만 쓴다
      out.visible = false
      out.offset = [0, 0, 0]
    } else {
      out.visible = true
      const age = f - intro.start
      const grow = 0.001 + (1 - 0.001) * ease(8, age / INTRO_GROW)
      out.scale = [out.scale[0] * grow, out.scale[1] * grow, out.scale[2] * grow]
      if (age < INTRO_GLOW) {
        // 색 10 · 세기 10에서 1 · 1로 (`ee106`) — 「제 색」을 빼고 건다
        const k = age / INTRO_GLOW
        const col = 10 + (1 - 10) * k - Math.max(plan.shaderBase, 1)
        out.glow = { color: [col, col, col], power: 10 + (1 - 10) * k }
      }
      const h = num(intro.values.height) / 100
      if (h > 0 && age < INTRO_FALL) {
        out.offset = [0, h * introLift(age / INTRO_FALL), 0]
        out.motion = { name: 'landB', at: intro.start }
      } else if (h > 0) {
        out.offset = [0, 0, 0]
        if (!out.motion || out.motion.at < intro.start + INTRO_FALL) out.motion = { name: 'landC', at: intro.start + INTRO_FALL }
      } else {
        out.offset = [0, 0, 0]
      }
    }
  }
  return out
}

/** 그 프레임에 다른 몸(맞는 쪽이 아닌 몸)을 감추는가 — `PokemonVisibleOther visible=0` 뒤 `PokemonVisibleAll` 전까지 */
export function othersHidden(plan: SeqPlan, f: number): boolean {
  let hidden = false
  for (const c of plan.others) {
    if (f < c.start) break
    hidden = c.name === 'PokemonVisibleAll' ? false : num(c.values.visible, 0, 1) !== 1
  }
  return hidden
}

/** 그 프레임에 역할 없는 대상(`plan.away`)이 감춰져 있는가 — 마지막 `PokemonVisible`이 0이면 감춘 것 */
export function awayHidden(plan: SeqPlan, f: number): boolean {
  let hidden = false
  for (const c of plan.away) {
    if (f < c.start) break
    hidden = num(c.values.visible, 0, 1) !== 1
  }
  return hidden
}

/** 화면 흔들림 진폭 (m) */
export function shakeAt(plan: SeqPlan, f: number): number {
  let amp = 0
  for (const c of plan.shakes) {
    if (f < c.start || f > c.end) continue
    const k = c.end > c.start ? (f - c.start) / (c.end - c.start) : 0
    // `srate`·`erate`(세기의 처음과 끝)를 cm로 읽는다 — 크게 흔드는 것(지진)이 12다
    const a = (num(c.values.srate) + (num(c.values.erate) - num(c.values.srate)) * k) / 100
    amp = Math.max(amp, a * SHAKE_CAMERA_GAIN)
  }
  return amp
}

/** 배경 물들임 — 색(0~1)과 진하기. 꺼져 있으면 `null` */
export function backAt(plan: SeqPlan, f: number): { color: V3; alpha: number } | null {
  let on = false
  let color: V3 = [0, 0, 0]
  let alpha = 0
  for (const c of plan.back) {
    if (f < c.start) continue
    const col = vec(c.values.col)
    const a = num(c.values.alpha)
    if (c.name === 'EffSpBackColFlg') {
      on = num(c.values.visible) === 1
      color = col
      alpha = a
      continue
    }
    on = true
    const t = progress(c, f)
    color = lerp3(color, col, t)
    alpha += (a - alpha) * t
  }
  return on && alpha > 0.001 ? { color, alpha } : null
}

/** 연출이 다 서는 프레임 (30fps) — 맨 끝 명령의 끝 */
export function planFrames(plan: SeqPlan): number {
  return Math.max(1, plan.frames)
}

/** 마지막 카메라 명령이 끝나는 프레임. 카메라 명령이 없으면 `null` */
export function cameraEnd(plan: SeqPlan): number | null {
  return plan.camera.length === 0 ? null : Math.max(...plan.camera.map((c) => c.end))
}

/** 첫 카메라 명령이 서는 프레임. 없으면 `null` */
export function cameraStart(plan: SeqPlan): number | null {
  return plan.camera.length === 0 ? null : Math.min(...plan.camera.map((c) => c.start))
}

// ─── 카메라 ──────────────────────────────────────────────

/** 카메라 한 벌 — 무대 좌표 · 세로 화각(도) · 굴림(라디안) */
export interface SeqCamera {
  pos: V3
  target: V3
  fov: number
  roll: number
}

type CamPart = 'pos' | 'target' | 'fov' | 'roll'
const ALL_PARTS: readonly CamPart[] = ['pos', 'target', 'fov', 'roll']

/**
 * 시퀀스 카메라의 그 프레임 값. 카메라 명령이 하나도 안 선 동안은 `null`이다(우리 기본 카메라가 선다).
 *
 * - `CameraMoveRelativePoke` — 자리 = `poke` 몸의 `node` 로케이터 + `pos`(cm), 보는 곳 = 같은 점 + `trg`.
 *   `isRot`이면 그 몸이 보는 쪽 기준이고 `isFlip`이면 상대 쪽 몸일 때 가로를 뒤집는다(같은 화면 쪽에 서게).
 *   `isScale`이면 오프셋을 몸 크기로 늘린다(`scale(role)`). `rate`%만큼만 간다. `enableElemPos/Trg`로 축을 고른다.
 *   `fov`가 0이면 화각을 그대로 둔다
 * - `CameraMovePosition` — `relative` 1이면 지금 자리 · 보는 곳에 더하고, 0이면 BDSP 절대 자리(cm — `ctx.world`)다
 * - `DprCameraMovePosition` — 자리만 옮긴다(보는 곳은 그대로). 절대 · 상대는 위와 같다
 * - `DprCameraLookAtPath` — 보는 곳이 `p0`에서 `p1`로 간다(절대 자리). `p2` · `p3`이 다 0이라 두 점 길로 읽는다(`pathType=0`)
 * - `DprCameraRotate` — 보는 쪽을 카메라 자리 둘레로 돌린다(`rot.y` 수평 · `rot.x` 수직, 도)
 * - `CameraTwist` — 굴림(도). `relative`면 더한다
 * - `CameraReset` · `CameraResetFieldAll` — 기본 카메라로 돌아간다
 *
 * @param base 우리 기본 카메라 (돌아갈 자리 · 처음 자리)
 */
export function cameraAt(
  plan: SeqPlan, f: number, ctx: SeqContext & { scale(role: Role): number }, base: SeqCamera,
): SeqCamera | null {
  const c = plan.cameraAtRest ? { ...ctx, anchor: (role: Role, node: number) => ctx.rest(role, node) } : ctx
  return foldCamera(plan.camera, f, c, base)
}

function foldCamera(
  cmds: readonly SeqCommand[], g: number, ctx: SeqContext & { scale(role: Role): number }, base: SeqCamera,
): SeqCamera | null {
  return foldTrack<SeqCamera | null>(cmds, cmds.length, g, null, (c, cam, g, before) => {
    const from: SeqCamera = cam ?? base
    const step = cameraTarget(c, from, ctx, base)
    if (step === null) return undefined
    const reset = c.name === 'CameraReset' || c.name === 'CameraResetFieldAll'
    if (ramping(c, g)) {
      const was = { ...(before() ?? base), ...step.start }
      const t = progress(c, g)
      const next: SeqCamera = { ...from }
      for (const part of step.parts) {
        if (part === 'pos' || part === 'target') next[part] = lerp3(was[part], step.cam[part], t)
        else next[part] = was[part] + (step.cam[part] - was[part]) * t
      }
      return next
    }
    return reset ? null : { ...from, ...pick(step.cam, step.parts) }
  })
}

function pick(cam: SeqCamera, parts: readonly CamPart[]): Partial<SeqCamera> {
  const out: Partial<SeqCamera> = {}
  for (const p of parts) (out as Record<CamPart, unknown>)[p] = cam[p]
  return out
}

/** 명령 하나가 옮겨 갈 카메라와 그 명령이 건드리는 부분. `start`는 옮겨 가기 시작하는 값을 갈아 끼운다(길 따라 보기) */
function cameraTarget(
  c: SeqCommand, from: SeqCamera, ctx: SeqContext & { scale(role: Role): number }, base: SeqCamera,
): { cam: SeqCamera; parts: readonly CamPart[]; start?: Partial<SeqCamera> } | null {
  const v = c.values
  const fovOf = (): number => (num(v.fov) > 0 ? num(v.fov) : from.fov)
  switch (c.name) {
    case 'CameraReset':
    case 'CameraResetFieldAll':
      return { cam: base, parts: ALL_PARTS }
    case 'CameraTwist': {
      const tw = num(v.twist) * Math.PI / 180 * (num(v.isFlip) === 1 && !ctx.mine(0) ? -1 : 1)
      return { cam: { ...from, roll: num(v.relative) === 1 ? from.roll + tw : tw }, parts: ['roll'] }
    }
    case 'CameraMovePosition': {
      const p = vec(v.pos), t = vec(v.trg)
      const fov = fovOf()
      if (num(v.relative) === 1) {
        return {
          cam: { pos: mask3(v.enableElemPos, from.pos, add(from.pos, offsetOf(p, null))), target: mask3(v.enableElemTrg, from.target, add(from.target, offsetOf(t, null))), fov, roll: from.roll },
          parts: ['pos', 'target', 'fov'],
        }
      }
      return {
        cam: { pos: mask3(v.enableElemPos, from.pos, worldOf(ctx, p)), target: mask3(v.enableElemTrg, from.target, worldOf(ctx, t)), fov, roll: from.roll },
        parts: ['pos', 'target', 'fov'],
      }
    }
    case 'DprCameraMovePosition': {
      const p = vec(v.pos)
      const to = num(v.relative) === 1 ? add(from.pos, offsetOf(p, null)) : worldOf(ctx, p)
      return { cam: { ...from, pos: mask3(v.enableElemPos, from.pos, to) }, parts: ['pos'] }
    }
    case 'DprCameraLookAtPath': {
      const p0 = worldOf(ctx, vec(v.p0)), p1 = worldOf(ctx, vec(v.p1))
      return { cam: { ...from, target: mask3(v.enableElem, from.target, p1) }, parts: ['target'], start: { target: mask3(v.enableElem, from.target, p0) } }
    }
    case 'DprCameraRotate': {
      const r = vec(v.rot)
      const dx = from.target[0] - from.pos[0], dy = from.target[1] - from.pos[1], dz = from.target[2] - from.pos[2]
      const len = Math.hypot(dx, dy, dz) || 1
      // X 거울이라 수평 회전의 부호가 뒤집힌다
      const yaw = Math.atan2(dx, dz) - r[1] * Math.PI / 180
      const pitch = Math.asin(Math.max(-1, Math.min(1, dy / len))) - r[0] * Math.PI / 180
      const flat = Math.cos(pitch) * len
      const target: V3 = [from.pos[0] + Math.sin(yaw) * flat, from.pos[1] + Math.sin(pitch) * len, from.pos[2] + Math.cos(yaw) * flat]
      return { cam: { ...from, target }, parts: ['target'] }
    }
    case 'CameraMoveRelativePoke': {
      const role: Role = num(v.poke) === 1 ? 1 : 0
      const a = ctx.anchor(role, num(v.node))
      if (!a) return null
      const k = num(v.isScale) === 1 ? ctx.scale(role) : 1
      // `isFlip`은 **상대 쪽 몸일 때** 가로를 뒤집는다. 내 쪽 몸은 −Z를 보고 서므로 몸 기준 오른쪽(+x)이
      // 곧 기본 카메라 쪽이다 — 시퀀스가 그쪽을 기준으로 적혀 있고, 상대 몸(+Z를 본다)에서는 뒤집어야 같은
      // 화면 쪽에 선다(실측: 안 뒤집으니 리프스톰 카메라가 토대부기 반대편 몸 속에 섰다)
      const flip = num(v.isFlip) === 1 && !ctx.mine(role) ? -1 : 1
      const yaw = num(v.isRot) === 1 ? a.yaw : null
      const local = (x: V3): V3 => offsetOf([x[0] * k * flip, x[1] * k, x[2] * k], yaw)
      const rate = num(v.rate, 0, 100) / 100
      const pickAxes = (mask: readonly string[] | undefined, cur: V3, want: V3): V3 => [
        num(mask, 0, 1) === 1 ? cur[0] + (want[0] - cur[0]) * rate : cur[0],
        num(mask, 1, 1) === 1 ? cur[1] + (want[1] - cur[1]) * rate : cur[1],
        num(mask, 2, 1) === 1 ? cur[2] + (want[2] - cur[2]) * rate : cur[2],
      ]
      return {
        cam: {
          pos: pickAxes(v.enableElemPos, from.pos, add(a.pos, local(vec(v.pos)))),
          target: pickAxes(v.enableElemTrg, from.target, add(a.pos, local(vec(v.trg)))),
          fov: fovOf(),
          roll: from.roll,
        },
        parts: ['pos', 'target', 'fov'],
      }
    }
    default:
      return null
  }
}
