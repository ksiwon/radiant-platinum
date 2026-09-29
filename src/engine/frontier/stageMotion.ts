// 시설 장면의 사람 — 걸음 목록 (`overlay063` · `ov104_02231F74.c`의 `FrontierScrCmd_ApplyMovement`)
//
// 장면 VM의 사람은 필드 사람이 아니라 **2D 판 위의 스프라이트**다. 자리는 픽셀이고(스크립트가 적은 (x, y)가 발밑),
// 걸음 목록은 필드와 같은 이름을 쓰지만 제 엔진이 돈다(`ov63_0222BE18.c`):
//
//     걷기          16픽셀을 8틱에 (한 틱 2픽셀) — 그동안 걷는 그림이 넘어간다
//     제자리 걷기   그 방향을 보고 8틱 걷는 그림
//     보기          곧바로 돈다
//     쉬기 N        N틱 (`Delay8` · `Delay4`) — ⚠️ 뒤에 붙은 수는 안 쓴다(`Delay8 2`도 8틱)
//     나타나기 · 숨기  그리기만 켜고 끈다 (`WarpIn` · `WarpOut`)
//
// 방향은 필드와 같은 번호다 — 0 북 · 1 남 · 2 서 · 3 동.
//
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)

export type Step =
  | { kind: 'walk', dir: number, count?: number }
  | { kind: 'onSpot', dir: number }
  | { kind: 'face', dir: number }
  | { kind: 'delay', ticks: number }
  | { kind: 'warpIn' }
  | { kind: 'warpOut' }

export interface StageActor {
  id: number
  /** 그림 (`OBJ_EVENT_GFX_*`) */
  gfx: number
  /** 발밑 (픽셀) */
  x: number
  y: number
  dir: number
  visible: boolean
  /** 걷는 그림을 넘긴 틱 — 서 있으면 멈춘다 */
  walkTicks: number
  walking: boolean
}

interface Running {
  steps: Step[]
  /** 지금 걸음의 남은 틱 */
  left: number
  /** 걷기에서 남은 칸 */
  repeat: number
}

const WALK_TICKS = 8
const PX_PER_TICK = 2
const DX = [0, 0, -1, 1] as const
const DY = [-1, 1, 0, 0] as const

export class StageMotion {
  readonly actors = new Map<number, StageActor>()
  private running = new Map<number, Running>()

  add(a: Omit<StageActor, 'walkTicks' | 'walking'>): void {
    this.actors.set(a.id, { ...a, walkTicks: 0, walking: false })
    this.running.delete(a.id)
  }

  remove(id: number): void {
    this.actors.delete(id)
    this.running.delete(id)
  }

  clear(): void {
    this.actors.clear()
    this.running.clear()
  }

  /** 걸음 목록을 건다 (`ApplyMovement`) */
  apply(id: number, steps: readonly Step[]): void {
    if (!this.actors.has(id)) return
    this.running.set(id, { steps: [...steps], left: 0, repeat: 0 })
  }

  /** 누가 아직 걷는가 (`WaitMovement`) */
  busy(): boolean {
    return this.running.size > 0
  }

  /** 한 틱 */
  tick(): void {
    for (const [id, run] of this.running) {
      const a = this.actors.get(id)
      if (!a) { this.running.delete(id); continue }
      if (run.left === 0 && !this.begin(a, run)) {
        this.running.delete(id)
        a.walking = false
        continue
      }
      const step = run.steps[0]!
      if (step.kind === 'walk') {
        a.x += DX[step.dir]! * PX_PER_TICK
        a.y += DY[step.dir]! * PX_PER_TICK
      }
      if (step.kind === 'walk' || step.kind === 'onSpot') a.walkTicks++
      run.left--
      if (run.left === 0) {
        this.finish(a, run)
        // 곧바로 끝나는 걸음만 남았으면 이 틱에 다 먹는다 — 걷기가 끝난 그 틱에 목록이 끝난다
        if (!this.pending(a, run)) { this.running.delete(id); a.walking = false }
      }
    }
  }

  /** 다음 걸음을 시작한다 — 곧바로 끝나는 것(보기 · 나타나기)은 여기서 다 먹는다. 없으면 거짓 */
  private begin(a: StageActor, run: Running): boolean {
    for (;;) {
      const step = run.steps[0]
      if (!step) return false
      switch (step.kind) {
        case 'face': a.dir = step.dir; run.steps.shift(); continue
        case 'warpIn': a.visible = true; run.steps.shift(); continue
        case 'warpOut': a.visible = false; run.steps.shift(); continue
        case 'walk':
          a.dir = step.dir
          a.walking = true
          if (run.repeat === 0) run.repeat = step.count ?? 1
          run.left = WALK_TICKS
          return true
        case 'onSpot':
          a.dir = step.dir
          a.walking = true
          run.left = WALK_TICKS
          return true
        case 'delay':
          a.walking = false
          run.left = Math.max(1, step.ticks)
          return true
      }
    }
  }

  /** 틱을 먹는 걸음이 남았는가 — 보기 · 나타나기는 여기서 치운다 */
  private pending(a: StageActor, run: Running): boolean {
    for (;;) {
      const step = run.steps[0]
      if (!step) return false
      if (step.kind === 'face') { a.dir = step.dir; run.steps.shift(); continue }
      if (step.kind === 'warpIn') { a.visible = true; run.steps.shift(); continue }
      if (step.kind === 'warpOut') { a.visible = false; run.steps.shift(); continue }
      return true
    }
  }

  private finish(a: StageActor, run: Running): void {
    const step = run.steps[0]!
    if (step.kind === 'walk' && --run.repeat > 0) return
    run.repeat = 0
    run.steps.shift()
    // 다음이 걷기가 아니면 걷는 그림을 멈춘다
    const next = run.steps[0]
    if (!next || (next.kind !== 'walk' && next.kind !== 'onSpot')) a.walking = false
  }
}

// ── 팩토리의 걸음 목록 (`frontier_scripts_battle_factory.s`) ─────────────────────

const N = 0, S = 1, W = 2, E = 3
const d8: Step = { kind: 'delay', ticks: 8 }
const d4: Step = { kind: 'delay', ticks: 4 }

export const FACTORY_MOVES = {
  /** `_0188` — 복도에 들어서며 여섯 칸 */
  enter: [{ kind: 'walk', dir: N, count: 6 }],
  /** `_0198` — 안내원이 비켜서서 인사한다 */
  attendant: [d8, d8, d8, d8, d8, { kind: 'walk', dir: E, count: 2 }, { kind: 'walk', dir: S }, { kind: 'onSpot', dir: S }],
  /** `_01E0` — 과학자가 비켜선다 */
  scientistAside: [{ kind: 'walk', dir: W }, { kind: 'face', dir: S }],
  /** `_01BC` — 배틀룸 문으로 */
  goIn: [d8, { kind: 'walk', dir: N, count: 3 }, { kind: 'warpOut' }],
  /** `_01F4` — 배틀룸에 들어와 제자리로 */
  roomEnter: [{ kind: 'walk', dir: N }, { kind: 'walk', dir: W, count: 5 }, { kind: 'walk', dir: N, count: 3 }, { kind: 'walk', dir: E }],
  /** `_021C` — 상대가 들어와 제자리로 */
  opponentEnter: [{ kind: 'walk', dir: S }, { kind: 'walk', dir: E, count: 5 }, { kind: 'walk', dir: S, count: 3 }, { kind: 'walk', dir: W }],
  /** `_01EC` — 상대가 이쪽을 본다 */
  opponentFace: [{ kind: 'onSpot', dir: W }],
  /** `_0258` — 수철은 숨은 채로 자리까지 */
  thortonHidden: [{ kind: 'warpOut' }, { kind: 'walk', dir: S }, { kind: 'walk', dir: E, count: 5 }, { kind: 'walk', dir: S, count: 3 }, { kind: 'walk', dir: W }],
  /** `_02A8` — 주인공이 두리번거린다 */
  lookAround: [
    { kind: 'onSpot', dir: N }, d8, d8, { kind: 'onSpot', dir: E }, d4, { kind: 'onSpot', dir: W }, d4,
    { kind: 'onSpot', dir: S }, d8, d8, { kind: 'onSpot', dir: E },
  ],
  /** `_0270` — 연기 속에서 수철이 나타난다 */
  warpIn: [{ kind: 'warpIn' }],
  /** `_0278` — 싸운 뒤 상대가 나간다 */
  opponentLeave: [{ kind: 'walk', dir: N, count: 3 }, { kind: 'walk', dir: W, count: 4 }, { kind: 'walk', dir: N }],
} as const satisfies Record<string, readonly Step[]>

/** 장면의 사람 번호 (`FrontierScrCmd_24`의 표) */
export const FACTORY_ACTOR = { scientist: 3, player: 4, attendant: 5, opponent: 98 } as const

/** 그림 — 과학자 30 · 안내원 231 · 수철 215 (`OBJ_EVENT_GFX_*`) */
export const FACTORY_GFX = { scientist: 30, attendant: 231, thorton: 215, schoolKid: 3 } as const

/**
 * 트레이너 분류 → 그림 (`sTrainerClassToObjectID` · `frontier_opponents.c`). 없는 분류는 소년(`SCHOOL_KID_M`)이다.
 * 번호는 `generated/trainer_classes.txt` · `object_events_gfx.txt`의 차례로 셌다
 */
const CLASS_GFX = new Map<number, number>([
  [90, 141], [91, 142], [92, 143], [93, 144], [94, 145], [2, 4], [3, 6], [60, 3], [61, 8], [32, 62], [33, 63],
  [4, 52], [5, 53], [44, 1], [45, 2], [20, 15], [21, 16], [81, 59], [26, 60], [16, 9], [17, 12], [83, 23], [84, 22],
  [71, 41], [18, 42], [12, 38], [13, 39], [14, 51], [10, 7], [27, 17], [35, 37], [49, 70], [50, 70], [39, 11], [40, 14],
  [24, 11], [25, 14], [53, 68], [54, 69], [29, 11], [6, 5], [28, 1], [19, 45], [11, 54], [46, 56], [9, 20], [48, 50],
  [52, 10], [37, 19], [57, 31], [41, 29], [34, 36], [59, 40], [58, 43], [38, 34], [51, 62], [30, 14], [80, 55], [36, 13],
  [7, 12], [85, 35], [15, 44], [22, 71],
])

export function opponentGfx(trainerClass: number): number {
  return CLASS_GFX.get(trainerClass) ?? FACTORY_GFX.schoolKid
}
