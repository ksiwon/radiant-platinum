// 동굴탈출로프 · 구멍파기 · 순간이동의 빙글 워프 (`overlay006/field_warp.c`)
//
// 세 길이 **같은 연출**을 쓴다. 주인공이 빙글빙글 돌며 카메라가 다가오고, 화면이 하얗게(순간이동은
// 까맣게) 덮인 뒤 맵이 갈린다. 도착해서는 반대로 돌며 카메라가 물러난다.
//
//   나갈 때 (`sEscapeRopeStates` · `sDigTeleportStates`의 뒤 넷)
//     StartWarpOutSpinning  카메라 −150을 15프레임에 · 감속 회전(`sFadeOutWarpAnimation`) · 소리
//     StartFadeOut          감속 회전이 끝나면 빠른 회전(`sWarpFastSpinningAnimation`)을 되풀이하고,
//                           여덟 번째를 걸 때 페이드 아웃(6단 · 단마다 1프레임)
//     FinishFadeOut         페이드가 끝날 때까지 빠른 회전을 잇는다
//     ChangeMap             순간이동은 부활 자리의 공중날기 칸(`Location_InitFly`), 나머지는 굴 입구
//   들어올 때 (`sFieldWarpFadeInStates`)
//     StartFadeIn           페이드 인 · 카메라 −150을 한 프레임에 · 빠른 회전
//     FinishFadeIn          페이드가 끝나면 카메라가 60프레임에 걸쳐 제자리로
//     SlowDownWarpInSpinning 빠른 회전 넷을 채우고 감속 회전(`sFadeInWarpAnimation`) — 남쪽을 보고 선다
//     FinishWarpInAnimation 회전과 카메라가 둘 다 끝나야 끝난다
//
// 구멍파기와 순간이동은 그 앞에 비전기술 컷인이 하나 더 있다 (`StartFieldMoveCutIn`). 컷인은 씬이 돌린다.
//
// ⚠️ **카메라는 거리 하나만 만진다** (`ov5_021F0EB0.c`의 `Camera_SetDistance`). 원작 기본 거리가
// `0x29AEC1` = 666.92라 −150은 팔 길이의 77.5%다. 우리 렌즈는 원작과 길이가 달라서 **비율로** 옮긴다

/** 원작 방향 번호 (`constants/map_object.h`) */
const N = 0, S = 1, W = 2, E = 3

export type FieldWarpKind = 'escapeRope' | 'dig' | 'teleport'

/** 한 칸 — 방향을 바꾸는 한 프레임(`FACE_*`, 1프레임) 또는 쉬는 n프레임(`DELAY_1 × n`) */
type Cmd = readonly [dir: number | null, frames: number]

/** `sFadeOutWarpAnimation` — 쉬는 틈이 2 → 1 → 0으로 줄며 빨라진다 */
const OUT_ANIM: readonly Cmd[] = [
  [S, 1], [null, 2], [W, 1], [null, 2], [N, 1], [null, 2], [E, 1], [null, 2],
  [S, 1], [null, 1], [W, 1], [null, 1], [N, 1], [null, 1], [E, 1], [null, 1],
  [S, 1], [W, 1], [N, 1], [E, 1], [S, 1], [W, 1], [N, 1], [E, 1],
]
/** `sWarpFastSpinningAnimation` — 북 · 동 · 남 · 서 */
const FAST_SPIN: readonly Cmd[] = [[N, 1], [E, 1], [S, 1], [W, 1]]
/** `sFadeInWarpAnimation` — 틈이 0 → 1 → 2 · 3 · 4 · 5로 늘며 느려지고 남쪽에서 선다 */
const IN_ANIM: readonly Cmd[] = [
  [S, 1], [W, 1], [N, 1], [E, 1], [S, 1], [W, 1], [N, 1], [E, 1],
  [S, 1], [null, 1], [W, 1], [null, 1], [N, 1], [null, 1], [E, 1], [null, 1],
  [S, 1], [null, 2], [W, 1], [null, 3], [N, 1], [null, 4], [E, 1], [null, 5], [S, 1],
]

/** 원작 필드 카메라의 기본 거리 (`CAMERA_TYPE_DEFAULT`의 `0x29AEC1`) */
const BASE_DISTANCE = 0x29aec1 / 4096
/** `ov5_021F0F10(…, FX32_CONST(-150), …)` */
const DOLLY = -150
/** 나갈 때 다가오는 프레임 · 들어올 때 물러나는 프레임 */
const DOLLY_OUT_FRAMES = 15
const DOLLY_BACK_FRAMES = 60
/** 나갈 때 빠른 회전을 몇 번 건 뒤 페이드를 거는가 (`animationDelay < 8`) */
const SPINS_BEFORE_FADE = 8
/** 들어올 때 빠른 회전을 몇 번 채우는가 (`animationDelay < 4`) */
const SPINS_BEFORE_SLOW = 4
/** `StartScreenFade(…, 6, 1, …)` */
export const FIELD_WARP_FADE = { steps: 6, framesPerStep: 1 } as const

/** 소리 (`StartWarpOutSpinning`) — 로프·구멍파기는 `SEQ_SE_DP_KAIDAN2`, 순간이동은 `SEQ_SE_DP_TELE` */
export const FIELD_WARP_SE: Readonly<Record<FieldWarpKind, number>> = {
  escapeRope: 1539,
  dig: 1539,
  teleport: 1614,
}

/** 순간이동만 검정이다 (`FIELD_WARP_TYPE_TELEPORT` 갈래). RGB555 */
export function fieldWarpColor(kind: FieldWarpKind): number {
  return kind === 'teleport' ? 0 : 0x7fff
}

/** 이동 동작 한 벌을 돌린다. 한 프레임에 한 칸씩 — 시작한 다음 프레임부터 먹는다 */
class Anim {
  private frames: (number | null)[] = []
  private at = 0
  constructor(cmds: readonly Cmd[]) {
    for (const [dir, n] of cmds) for (let i = 0; i < n; i++) this.frames.push(i === 0 ? dir : null)
  }
  /** 한 프레임 — 이 프레임에 바뀐 방향. 안 바뀌었으면 null */
  tick(): number | null {
    if (this.at >= this.frames.length) return null
    return this.frames[this.at++] ?? null
  }
  get ended(): boolean { return this.at >= this.frames.length }
}

/** `ov5_021F0EB0` — 카메라 거리를 옮기는 과제. `offset`이 기본 거리에서 뺀 몫이다 */
class Dolly {
  offset = 0
  private step = 0
  private left = 0
  done = true
  /** 갈래 1 — `delta`를 `frames`에 나눠 더한다 */
  toward(delta: number, frames: number): void {
    this.step = delta / frames
    this.left = frames
    this.done = false
  }
  /** 갈래 2 — 지금 자리에서 기본 거리로 `frames`에 걸쳐 돌아간다 */
  back(frames: number): void {
    this.step = -this.offset / frames
    this.left = frames
    this.done = false
  }
  tick(): void {
    if (this.done) return
    this.offset += this.step
    if (--this.left <= 0) this.done = true
  }
}

/** 한 프레임에 씬이 할 일 */
export interface FieldWarpFrame {
  /** 이 프레임에 주인공이 바라볼 원작 방향. 안 바뀌면 null */
  dir: number | null
  /** 카메라 팔 길이의 비율 (1이 제자리) */
  dolly: number
  /** 이 프레임에 걸 페이드 */
  fade: 'out' | 'in' | null
  /** 이 프레임에 맵을 갈아라 (`ChangeMap`) */
  changeMap: boolean
  /** 다 끝났다 */
  done: boolean
}

/**
 * 워프 한 번. `out`으로 시작해 맵이 갈리면 씬이 `arrive()`를 부르고 `in`이 이어진다.
 *
 * `fadeDone`은 바깥 페이드가 끝났는가다 (`IsScreenFadeDone`). 페이드는 씬이 걸고 굴린다
 */
export class FieldWarpRun {
  private phase: 'out' | 'wait' | 'in' | 'done' = 'out'
  private state = 0
  private anim: Anim | null = null
  private spins = 0
  private readonly dolly = new Dolly()
  constructor(readonly kind: FieldWarpKind, private readonly fadeDone: () => boolean) {}

  /** 맵이 갈렸다. 들어오는 연출을 건다 */
  arrive(): void {
    this.phase = 'in'
    this.state = 0
    this.spins = 0
    this.anim = null
    this.dolly.offset = 0
    this.dolly.done = true
  }

  get finished(): boolean { return this.phase === 'done' }

  step(): FieldWarpFrame {
    const out: FieldWarpFrame = { dir: null, dolly: 1, fade: null, changeMap: false, done: false }
    // 동작과 카메라는 제 과제로 돈다 — 필드 과제보다 먼저 한 칸 간다
    const turned = this.anim?.tick() ?? null
    if (turned !== null) out.dir = turned
    this.dolly.tick()
    if (this.phase === 'out') this.stepOut(out)
    else if (this.phase === 'in') this.stepIn(out)
    out.dolly = (BASE_DISTANCE + this.dolly.offset) / BASE_DISTANCE
    out.done = this.phase === 'done'
    return out
  }

  private stepOut(out: FieldWarpFrame): void {
    switch (this.state) {
      case 0:
        // `StartWarpOutSpinning`
        this.dolly.toward(DOLLY, DOLLY_OUT_FRAMES)
        this.anim = new Anim(OUT_ANIM)
        this.state = 1
        return
      case 1:
        // `StartFadeOut` — 동작이 끝날 때마다 빠른 회전을 새로 걸고 센다
        if (this.anim?.ended !== true) return
        this.anim = new Anim(FAST_SPIN)
        this.spins++
        if (this.spins < SPINS_BEFORE_FADE) return
        out.fade = 'out'
        this.state = 2
        return
      case 2:
        // `FinishFadeOut`
        if (this.anim?.ended === true) this.anim = new Anim(FAST_SPIN)
        if (!this.fadeDone()) return
        this.anim = null
        // `ChangeMap`은 같은 프레임에 이어진다 (`STATE_RESULT_REPEAT_STATE`)
        out.changeMap = true
        this.phase = 'wait'
    }
  }

  private stepIn(out: FieldWarpFrame): void {
    switch (this.state) {
      case 0:
        // `StartFadeIn`
        out.fade = 'in'
        this.dolly.toward(DOLLY, 1)
        this.anim = new Anim(FAST_SPIN)
        this.state = 1
        return
      case 1:
        // `FinishFadeIn`
        if (this.anim?.ended === true) this.anim = new Anim(FAST_SPIN)
        if (!this.fadeDone()) return
        this.dolly.back(DOLLY_BACK_FRAMES)
        this.state = 2
        // `STATE_RESULT_REPEAT_STATE` — 같은 프레임에 다음 단을 본다
        this.stepIn(out)
        return
      case 2:
        // `SlowDownWarpInSpinning`
        if (this.anim?.ended !== true) return
        this.spins++
        if (this.spins < SPINS_BEFORE_SLOW) { this.anim = new Anim(FAST_SPIN); return }
        this.anim = new Anim(IN_ANIM)
        this.state = 3
        return
      case 3:
        // `FinishWarpInAnimation`
        if (this.anim?.ended !== true || !this.dolly.done) return
        this.anim = null
        this.phase = 'done'
    }
  }
}
