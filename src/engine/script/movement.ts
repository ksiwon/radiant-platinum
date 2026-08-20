// 이동 동작 (DATA.md §2.10) — `ApplyMovement`가 가리키는 **또 다른 언어**.
//
// 스크립트 바이트코드와 다르다. 여기 있는 것은 `{u16 동작, u16 횟수}`가 이어지다
// `END`로 끝나는 아주 단순한 목록이고, 동작 하나가 몇 프레임짜리인지는 표에 있다
// (`scripts.json`의 `movements`, 디컴프에서 기계로 뽑은 것).
//
//   ApplyMovement LOCALID_PLAYER, _0123
//   _0123:
//     WalkNormalNorth 2      ← 북쪽으로 두 칸, 한 칸에 8프레임
//     FaceSouth 1
//     MovementEnd
//
// 원작은 동작마다 함수 배열을 돌리지만(step0 → step1 → end) 우리에게 필요한 것은
// **몇 프레임 동안 어디로 얼마나 가는가**뿐이라 그 셋만 표로 갖고 실행한다.
import type { ScriptFile } from '../../data/schema'

/** `MOVEMENT_ACTION_END` — 목록의 끝 */
export const MOVEMENT_END = 254

/** 원작의 방향 번호. `constants/map_object.h` */
export const DIR = { north: 0, south: 1, west: 2, east: 3 } as const

/**
 * 방향 → 타일 증분.
 *
 * z가 커지는 쪽이 남쪽이다 — 워프·NPC 좌표가 그렇다(떡잎마을 z≈875에서
 * 북쪽 201번도로는 z≈856)
 */
export const DIR_STEP: readonly { x: number, z: number }[] = [
  { x: 0, z: -1 }, // 0 북
  { x: 0, z: 1 }, //  1 남
  { x: -1, z: 0 }, // 2 서
  { x: 1, z: 0 }, //  3 동
]

export interface MovementStep {
  action: number
  /** 몇 번 되풀이하는가 */
  count: number
}

export type MovementTable = ScriptFile['movements']

/**
 * 목록 하나를 읽는다.
 *
 * @param at 바이트 주소. `ApplyMovement`의 상대 오프셋이 가리키는 자리다
 */
export function parseMovements(bytes: Uint8Array, at: number): MovementStep[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const steps: MovementStep[] = []
  for (let p = at; p + 4 <= bytes.byteLength; p += 4) {
    const action = view.getUint16(p, true)
    if (action === MOVEMENT_END) return steps
    steps.push({ action, count: view.getUint16(p + 2, true) })
    // 원작에 이만큼 긴 목록은 없다. 끝 표시를 놓쳤을 때 영영 읽는 것을 막는다
    if (steps.length > MAX_STEPS) throw new Error('이동 목록이 안 끝난다')
  }
  throw new Error('이동 목록이 파일 밖으로 나간다')
}

const MAX_STEPS = 256

/** 이동 명령이 만지는 대상. NPC든 주인공이든 이 모양이면 된다 */
export interface Movable {
  /** 타일 좌표. 정수가 아닌 값은 걸어가는 중이라는 뜻이다 */
  x: number
  z: number
  /** 원작 방향 번호 */
  dir: number
  visible: boolean
  /**
   * 그림만 어긋나는 만큼 (타일) — `MapObject_SetSpritePosOffset`.
   *
   * **서 있는 칸은 그대로다.** 연출이 프레임마다 고쳐 쓰고 그림을 세우는 쪽이
   * 자리에 더한다. 흔들림·깜빡임(`actor/objectFx`)과 기라티나가 하늘에서
   * 내려오는 것(`scene/distortion`)이 같은 이 한 자리를 쓴다
   */
  offsetX?: number
  offsetY?: number
  offsetZ?: number
  /** `generated/movement_types.txt`의 번호. 주인공은 없다 */
  readonly movementType?: number
  /**
   * 배치표의 `ObjectEvent.data[3]`.
   *
   * 객체마다 뜻이 다른 인자 셋이다 — 간판이면 `data[0]`이 판에 붙는 그림
   * 번호고(`ScrCmd_DrawSignpostInstantMessage`), 트레이너면 눈이 닿는 칸 수다.
   * 주인공은 없다
   */
  readonly params?: readonly number[]
}

/**
 * 목록 하나를 프레임 단위로 돌린다.
 *
 * 한 동작이 `frames` 프레임에 걸쳐 `tiles`칸을 간다. 프레임마다 그 몫만큼
 * 옮기므로 화면에서는 부드럽게 걸어간다 — 원작도 프레임당 거리로 움직인다.
 */
export class MovementRunner {
  private step = 0
  private repeat = 0
  private frame = 0
  private started = false

  constructor(
    readonly target: Movable,
    private readonly steps: readonly MovementStep[],
    private readonly table: MovementTable,
  ) {}

  get done(): boolean {
    return this.step >= this.steps.length
  }

  /** 한 프레임 */
  tick(): void {
    if (this.done) return
    const step = this.steps[this.step]!
    const action = this.table[step.action]
    if (action === undefined || action === null) {
      // 표에 없는 번호. 건너뛰되 자리를 잃지는 않는다
      this.next(step)
      return
    }

    if (!this.started) {
      this.started = true
      if (action.dir !== undefined && action.kind !== 'delay') this.target.dir = action.dir
      if (action.name === 'SET_INVISIBLE') this.target.visible = false
      if (action.name === 'SET_VISIBLE') this.target.visible = true
    }

    const frames = action.frames ?? 1
    const tiles = action.tiles ?? 0
    if (tiles > 0 && action.dir !== undefined) {
      const move = DIR_STEP[action.dir]!
      this.target.x += (move.x * tiles) / frames
      this.target.z += (move.z * tiles) / frames
    }

    this.frame++
    if (this.frame < frames) return
    // 걸음이 끝나면 **정수 칸에 맞춘다**. 프레임마다 나눈 몫을 더하면 부동소수점
    // 오차가 쌓이는데, 그게 쌓이면 앞 타일 판정이 한 칸씩 어긋난다
    if (tiles > 0) {
      this.target.x = Math.round(this.target.x)
      this.target.z = Math.round(this.target.z)
    }
    this.next(step)
  }

  private next(step: MovementStep): void {
    this.frame = 0
    this.started = false
    this.repeat++
    if (this.repeat < step.count) return
    this.repeat = 0
    this.step++
  }
}
