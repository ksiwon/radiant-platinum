// 기술 연출의 뼈대 (PLAN §7.3)
//
// **어떤 종류의 사건인가**를 다섯 틀로 가른다 — 때렸는지, 날렸는지, 쐈는지,
// 제 몸에 걸었는지, 상대에게 걸었는지.
//
// ⚠️ **「원작도 틀 몇 개로 때웠다」가 아니다.** 한동안 그렇게 적혀 있었는데
// 틀렸다 — 원작은 기술마다 전용 대본을 들고 있다 (`res/moves/<이름>/anim.s`,
// 468개 12,514줄). 그 대본이 정한 색·박자·흔들림·자리는 `moveAnimTable.ts`가
// 나르고 `scene/battle/moveElements`가 무대 단위로 옮긴다. 여기 있는 틀은
// 그 위에 **무슨 도형을 어떤 궤적으로 그릴지**만 정한다.
//
// 어느 틀을 쓸지는 **롬의 기술 데이터가 정한다.** 지어낸 분류가 아니다:
//
//   target에 0x10이 서면 자기에게 거는 기술이다. 검무·아질리티·자기회복·
//   껍질깨기·성장·굳어지기·묻어버리기 일곱이 전부 0x10이고, 전기자석파·맹독·
//   울음소리·초음파·독가루 다섯은 하나도 아니다. 오탐도 누락도 없다.
//
//   contact는 롬이 직접 들고 있는 플래그다 (기술 155개).
//
//   category는 물리 192 · 특수 109 · 변화 170이다.
//
// 아래쪽 절반은 기술이 아닌 연출 — 상태 이상·능력 변화의 원작 「부분 연출」 표와 그 길이다
// (`STATUS_ANIMS`). 박자와 무대가 둘 다 여기서 읽는다.
import type { Move } from '../../data/schema'

/**
 * 연출 틀 다섯.
 *
 * 원작 연출을 한 컷씩 옮기는 것이 아니라 **어떤 종류의 사건인지**를 보여 준다 —
 * 때렸는지, 날렸는지, 쐈는지, 제 몸에 걸었는지, 상대에게 걸었는지
 */
export type Archetype =
  /** 붙어서 때린다. 쓴 쪽이 상대에게 달려갔다 돌아온다 */
  | 'contact-melee'
  /** 던진다. 덩어리가 날아가 맞는다 */
  | 'projectile'
  /** 쏜다. 줄기가 이어졌다가 끊긴다 */
  | 'beam'
  /** 제 몸에 건다. 발밑에서 고리가 올라온다 */
  | 'self-buff'
  /** 상대에게 건다. 상대 둘레에 점이 돈다 */
  | 'status-dot'

/**
 * 이 기술이 쓸 틀.
 *
 * 순서가 중요하다 — 자기에게 거는 것을 먼저 걸러야 검무가 상대에게 날아가지 않고,
 * 접촉을 변화기보다 뒤에 둬야 몸통박치기와 전기자석파가 안 섞인다
 */
export function archetypeFor(move: Move | null | undefined): Archetype {
  if (!move) return 'projectile'
  if ((move.target & TARGET_SELF) !== 0) return 'self-buff'
  if (move.category === 'status') return 'status-dot'
  if (move.contact) return 'contact-melee'
  if (move.category === 'special') return 'beam'
  return 'projectile'
}

/** `MOVE_TARGET_USER`. 자기에게 거는 기술 62개가 이 비트를 든다 */
export const TARGET_SELF = 0x10

/**
 * 연출이 도는 길이 (프레임, 60fps 기준) — **자료가 없을 때의 한 벌**.
 *
 * 박자(`playback`)가 이만큼 쉬고 무대가 이만큼 도는데, 둘이 어긋나면 연출이
 * 잘리거나 빈 화면이 남는다. 그래서 둘이 **같은 자리에 물어본다**
 * (`moveFramesOf`).
 *
 * 원작은 기술마다 다르다 — 대본이 `Delay`로 쉬고 `WaitForAllEmitters`로 입자가
 * 사그라지기를 기다린다. 그 길이는 `moveLength`가 내고, 여기 값은 그 자료가
 * 아직 안 왔을 때만 쓴다
 */
export const MOVE_FRAMES = 40

/**
 * 기술 번호 → 연출 프레임. 자료를 든 쪽이 채운다 (`scene/battle/moveLength`).
 *
 * ⚠️ **엔진이 자료 로더를 안 탄다.** 대본 표는 218KB짜리 동적 청크라
 * (`data/gameData`의 `loadMoveAnims`) 박자·무대가 직접 집으면 앱 셸 예산이
 * 깨진다. 그래서 배틀에 들어설 때 화면 쪽이 한 번 꽂아 주고, 안 꽂혔으면
 * 지금까지의 한 벌로 돈다
 *
 * ⚠️ **쓴 쪽을 같이 묻는다.** BDSP 시퀀스는 `GroupOption`(짝 · 홀) 묶음을 쪽마다 다르게 타서, 같은
 * 기술도 내 쪽과 상대 쪽의 계획(맞는 프레임 · 길이)이 다를 수 있다 (`scene/battle/fx/moveSeq`)
 */
let framesOf: ((move: number | null, mine: boolean, doubles: boolean) => number) | null = null

/** 배틀에 들어설 때 한 번. 나갈 때 `null`로 되돌린다 */
export function setMoveFrames(fn: ((move: number | null, mine: boolean, doubles: boolean) => number) | null): void {
  framesOf = fn
}

/**
 * 이 기술의 연출이 도는 프레임. `mine`은 쓴 쪽이 플레이어 편(`p1`)인가, `doubles`는 더블 판인가
 * (시퀀스가 `GroupOption 0`으로 싱글 · 더블 갈래를 타서 길이가 다를 수 있다)
 */
export function moveFramesOf(move: number | null, mine = true, doubles = false): number {
  return framesOf?.(move, mine, doubles) ?? MOVE_FRAMES
}

// ── 상태 이상·능력 변화 연출 (원작 「부분 연출」) ─────────────────────────────
//
// 기술 연출과 길이 다르다. 원작은 이것들을 기술 대본(`we.narc`)이 아니라 **부분
// 연출 대본**(`we_sub.narc` = `res/battle/scripts/common_anims/*.s`)으로 돌리고,
// 배틀 대본이 `PlayBattleAnimation 대상, BATTLE_ANIMATION_*`로 부른다
// (`BattleController_EmitPlayStatusEffect` — 쓴 쪽과 맞는 쪽이 **같은 마리**다).
//
//   능력 변화   `subscript_update_stat_stage.s` 17줄 `PlayBattleAnimationFromVar`
//              (`BtlCmd_ChangeStatStage`가 오르면 STAT_BOOST · 내리면 STAT_DROP을 싣는다)
//   걸림       `subscript_poison.s` 47 · `burn` 57 · `paralyze` 34 · `fall_asleep` 57 ·
//              `freeze` 31 · `confuse` 32 · `badly_poison` 67
//   피해       `subscript_poison_damage.s` 23 · `burn_damage` 17
//   못 움직임   `subscript_sleeping.s` · `frozen` · `fully_paralyzed` · `confused` 9줄
//
// 아래 표는 그 대본 여덟을 줄마다 옮긴 것이다. 지어낸 값은 없다.

/** 원작 부분 연출 중 이 표가 옮긴 여덟 */
export type StatusAnimKey =
  | 'asleep' | 'poisoned' | 'burned' | 'frozen' | 'paralyzed' | 'confused'
  | 'statBoost' | 'statDrop'

/** `Func_FadeBattlerSprite 대상, fadeStepFrames, endDelay, color, alpha, holdFrames` */
interface SpriteFade {
  /** BGR555 그대로 (`BATTLE_COLOR_*`) */
  color: number
  /** 0~16. 몸이 이만큼 그 색으로 물든다 (`BlendPalette`) */
  alpha: number
  /** 한 단계를 몇 프레임 더 붙드는가 */
  step: number
  /** 물들었다 돌아오기를 몇 번 하는가 */
  endDelay: number
  /** 다 물든 채로 몇 프레임 서는가 */
  hold: number
}

/** `PlayPannedSoundEffect`(한 번) · `PlayLoopedSoundEffect seq, pan, interval, repeat` */
interface StatusSound {
  /** SDAT 번호 (`generated/sdat.txt`를 닻부터 센 값 — SDAT `SYMB`와도 같다) */
  seq: number
  /** 대본에 적힌 소리 자리. 쪽에 따라 뒤집는다 (`statusPan`) */
  pan: number
  /** 되풀이 사이 프레임. 한 번만 내면 0 */
  interval: number
  /** 몇 번 내는가 */
  repeat: number
}

interface StatusAnim {
  /** `BATTLE_ANIMATION_*` 번호 — `we_sub.narc` 멤버 번호이기도 하다 */
  id: number
  /** `res/battle/scripts/common_anims/<이 이름>.s` */
  script: string
  /**
   * `LoadParticleResource 0, member` + `CreateEmitter 0, res, …`.
   *
   * `member`는 `battle_particles.order`의 줄 번호 = `waza` 묶음 멤버 번호다
   * (27 `status_effect.spa` · 114 `thunder_shock.spa`). `lift`는 이미터를 몸통에서 얼마나
   * 올려 세우는가(DS 단위) — 혼란만 `EMITTER_CB_GENERIC`에 오프셋을 준다
   */
  particle: { member: number; res: number; lift: number } | null
  /**
   * 그 이미터가 다 사그라지는 프레임 (`splLifeFrames`) — **잰 값이다.** 박자(`playback`)가
   * 입자 묶음 없이도 길이를 알아야 해서 여기 적어 두고, `viewStatus.test`가 `waza.bin`을
   * 열어 같은지 잰다
   */
  life: number
  sound: StatusSound
  fade: SpriteFade | null
  /**
   * `Func_StatChangeUp`·`Down` — 무늬 줄(`import/platinum/particles`의 `STAT_CHANGE_BG`)과
   * 한 프레임에 흐르는 픽셀. 양수면 무늬가 화면 위로 흐른다(`Bg_SetOffset` Y가 는다)
   */
  statChange: { row: 0 | 1; step: number } | null
}

/** `BATTLE_SOUND_PAN_LEFT` */
const PAN_LEFT = -117
/** `BATTLE_COLOR_PURPLE` · `RED` · `BLACK` */
const PURPLE = 0x7c14
const RED = 0x001f
const BLACK = 0x0000
/** `STAT_CHANGE_STEP_Y` */
const STAT_STEP = 3

/** 원작 부분 연출 대본 여덟 (`common_anims/*.s`) */
export const STATUS_ANIMS: Readonly<Record<StatusAnimKey, StatusAnim>> = {
  // sleep.s — 소리 하나(되풀이 20 · 한 번)와 이미터 하나
  asleep: {
    id: 1, script: 'sleep',
    particle: { member: 27, res: 9, lift: 0 }, life: 60,
    sound: { seq: 2013, pan: PAN_LEFT, interval: 20, repeat: 1 },
    fade: null, statChange: null,
  },
  // poison.s — 거품과 함께 몸이 보라로 물들었다 돌아온다
  poisoned: {
    id: 2, script: 'poison',
    particle: { member: 27, res: 7, lift: 0 }, life: 44,
    sound: { seq: 1979, pan: PAN_LEFT, interval: 3, repeat: 3 },
    fade: { color: PURPLE, alpha: 10, step: 0, endDelay: 1, hold: 0 }, statChange: null,
  },
  // burn.s
  burned: {
    id: 3, script: 'burn',
    particle: { member: 27, res: 2, lift: 0 }, life: 24,
    sound: { seq: 2010, pan: PAN_LEFT, interval: 0, repeat: 1 },
    fade: { color: RED, alpha: 10, step: 0, endDelay: 1, hold: 0 }, statChange: null,
  },
  // freeze.s
  frozen: {
    id: 4, script: 'freeze',
    particle: { member: 27, res: 6, lift: 0 }, life: 72,
    sound: { seq: 2052, pan: PAN_LEFT, interval: 8, repeat: 2 },
    fade: null, statChange: null,
  },
  // paralysis.s — 입자는 `thunder_shock.spa`에서 빌린다. 몸이 검게 15까지 물든다
  paralyzed: {
    id: 5, script: 'paralysis',
    particle: { member: 114, res: 1, lift: 0 }, life: 27,
    sound: { seq: 1970, pan: PAN_LEFT, interval: 0, repeat: 1 },
    fade: { color: BLACK, alpha: 15, step: 0, endDelay: 1, hold: 0 }, statChange: null,
  },
  // confusion.s — `EMITTER_CB_GENERIC`에 `SetExtraParams 0, 1, 5, …`(맞는 쪽 자리 +
  // 오프셋)과 `SetExtraParams 1, 0, 8256, 0`(`BATTLE_PTCL_FLIP_DISABLE` · Y로 8256/4096단위)을
  // 준다. 그래서 머리 위에서 돈다
  confused: {
    id: 6, script: 'confusion',
    particle: { member: 27, res: 5, lift: 8256 / 4096 }, life: 50,
    sound: { seq: 2001, pan: PAN_LEFT, interval: 4, repeat: 4 },
    fade: null, statChange: null,
  },
  // stat_boost.s — `Func_StatChangeUp`(무늬 0번 줄)과 소리 하나
  statBoost: {
    id: 12, script: 'stat_boost',
    particle: null, life: 0,
    sound: { seq: 2059, pan: PAN_LEFT, interval: 0, repeat: 1 },
    fade: null, statChange: { row: 0, step: STAT_STEP },
  },
  // stat_drop.s — `Func_StatChangeDown`(1번 줄)
  statDrop: {
    id: 13, script: 'stat_drop',
    particle: null, life: 0,
    sound: { seq: 2058, pan: PAN_LEFT, interval: 0, repeat: 1 },
    fade: null, statChange: { row: 1, step: -STAT_STEP },
  },
}

/**
 * 소리 자리를 쪽에 맞춘다 (`BattleAnimSound_CorrectPanDirection`).
 *
 * 부분 연출은 쓴 쪽과 맞는 쪽이 같은 마리라 「내 쪽이 내 쪽에게」·「상대가 상대에게」
 * 갈래만 탄다 — 내 쪽이면 오른쪽 값만 왼쪽으로, 상대면 왼쪽 값만 오른쪽으로 뒤집는다
 */
export function statusPan(pan: number, mine: boolean): number {
  if (mine) return pan > 0 ? -pan : pan
  return pan < 0 ? -pan : pan
}

/**
 * 소리가 나는 프레임들 (`BattleAnimSoundFunc_Repeat`).
 *
 * 세는 값이 `interval`에서 시작하므로 첫 소리는 곧바로 나고, 그 뒤로는
 * `interval + 1`프레임마다 난다
 */
export function statusSoundFrames(sound: StatusSound): number[] {
  return Array.from({ length: Math.max(1, sound.repeat) }, (_, k) => k * (sound.interval + 1))
}

/**
 * 몸 물들임의 프레임별 진하기(0~16)와 태스크가 서 있는 프레임 수.
 *
 * `BattleAnimTask_FadeBattlerSprite`(상태 기계)와 `PokemonSpriteManager`의 물들임
 * (`pokemon_sprite.c` 1467줄 — `fadeDelayCounter`가 0일 때 지금 값으로 칠하고 한 칸 간다)을
 * 프레임마다 그대로 돌린다. 한 프레임 안에서는 태스크가 먼저, 칠하기가 나중이다
 */
export function spriteFadeTrack(fade: SpriteFade): { alpha: number[]; frames: number } {
  const alpha: number[] = []
  let state = 0
  let endDelay = fade.endDelay
  let hold = fade.hold
  let active = false
  let init = 0
  let target = 0
  let counter = 0
  let shown = 0
  const start = (from: number, to: number): void => {
    active = true
    init = from
    target = to
    counter = 0
  }
  // 상한은 마개다 — 가장 긴 것(마비 · 진하기 15)이 35프레임이다
  for (let f = 0; f < 600; f++) {
    // 태스크. `HOLD`에서 기다릴 것이 없으면 같은 프레임에 `INIT_FADE_OUT`으로 떨어진다
    if (state === 0) {
      start(0, fade.alpha)
      state = 1
    } else if (state === 1) {
      if (!active) state = 2
    } else if (state === 2) {
      if (hold === 0) state = 3
      else hold -= 1
    }
    if (state === 3) {
      start(fade.alpha, 0)
      state = 4
    } else if (state === 4) {
      if (!active) {
        endDelay -= 1
        state = endDelay <= 0 ? 5 : 0
      }
    } else if (state === 5) {
      alpha.push(shown)
      return { alpha, frames: f + 1 }
    }
    // 칠하기
    if (active) {
      if (counter === 0) {
        counter = fade.step
        shown = init
        if (init === target) active = false
        else init += init > target ? -1 : 1
      } else {
        counter -= 1
      }
    }
    alpha.push(shown)
  }
  return { alpha, frames: alpha.length }
}

/**
 * 능력 변화 무늬가 서는 프레임 (`BattleAnimTask_StatChange`).
 *
 * 무늬를 싣고(1) · 섞기를 걸고(1) · `timer`가 20을 넘을 때까지 흘리고(22) ·
 * 덮는 쪽 12 → 0 · 밑 4 → 16을 한 칸씩 옮겨(12) · 그다음 프레임에 태스크를 내린다(1)
 */
export const STAT_CHANGE_FRAMES = 37

/**
 * 능력 변화 무늬의 그 프레임 값.
 *
 * `alpha`는 무늬가 덮는 몫(0~16, `G2_SetBlendAlpha`의 첫째 값)이고 밑(몸)이 나머지를 갖는다 —
 * 원작 두 값이 늘 합쳐 16이다(12·4에서 0·16까지 같이 한 칸씩). `offset`은 무늬가 그때까지
 * 흐른 픽셀이고 매 프레임 끝에 `step`씩 는다(태스크를 내리는 마지막 프레임은 안 는다)
 */
export function statChangeAt(f: number, step: number): { alpha: number; offset: number } {
  /** `STAT_CHANGE_OVERLAY_START_ALPHA` */
  const START = 12
  // 싣기 0 · 섞기 1 · 흘리기 2~23 · 걷기 24~35 · 내림 36
  const alpha = f < 0 || f >= STAT_CHANGE_FRAMES - 1 ? 0
    : f < 24 ? START : Math.max(0, START - (f - 23))
  const moved = Math.min(Math.max(0, f + 1), STAT_CHANGE_FRAMES - 1)
  return { alpha, offset: moved * step }
}

/**
 * 부분 연출 하나가 도는 프레임 — 박자(`playback`)가 쉬는 값과 무대가 도는 값이 이 한 자리에서
 * 나온다.
 *
 * 원작 대본의 `End`는 **이미터 · 태스크 · 소리 태스크가 다 끝날 때까지** 서고, 그 앞에
 * 한 프레임을 더 쉰다(`BattleAnimScriptCmd_End`의 `endDelayFrames`). 그래서 넷 중 가장 긴 것에
 * 1을 더한다.
 *
 * ⚠️ **소리 꼬리는 안 센다.** 원작은 `Sound_IsAnyEffectPlaying`이 참이면 3초까지 더 기다리는데
 * (`BATTLE_ANIM_SCRIPT_MAX_SFX_WAIT_FRAMES`), 소리 길이는 엔진이 모른다
 */
export function statusAnimFrames(key: StatusAnimKey): number {
  const anim = STATUS_ANIMS[key]
  const sounds = statusSoundFrames(anim.sound)
  const sound = (sounds[sounds.length - 1] ?? 0) + 1
  const fade = anim.fade === null ? 0 : spriteFadeTrack(anim.fade).frames
  const stat = anim.statChange === null ? 0 : STAT_CHANGE_FRAMES
  return 1 + Math.max(anim.life, sound, fade, stat)
}
