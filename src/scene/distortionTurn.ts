// 깨어진 세계 — 판을 갈아타는 **도중의 자세** (PARITY §6.10)
//
// 몸 · 카메라 기울기 · (끝 프레임의) 입력 기저가 한 타임라인으로 돈다. 쥐는 쪽(건너뛰기 ·
// 폭포 끝 · 판 끝)이 시작하고 진행(`k`)을 밀며, 읽는 쪽은 `distortionBridge.poseTurn`이다.
import type { PoseTurn } from '../engine/world/distortion'

let turn: PoseTurn | null = null
/** 자체로 흐르는 턴의 길이 (프레임). 밖에서 `k`를 미는 턴이면 0 */
let ownFrames = 0
let ownTotal = 0

/** 도는 중인 자세. 안 돌면 null */
export function distortionPoseTurn(): PoseTurn | null {
  return turn
}

/** 갈아타기를 시작한다. `k`는 0에서 간다 */
export function beginPoseTurn(spec: Omit<PoseTurn, 'k'>): void {
  turn = { ...spec, k: 0 }
  ownFrames = 0
  ownTotal = 0
}

/** 진행을 0..1로 민다. 쥐는 쪽이 자기 타임라인에서 계산한다 */
export function setPoseTurnProgress(k: number): void {
  if (turn !== null) turn.k = Math.min(1, Math.max(0, k))
}

/** 끝난 것으로 한다. 판이 갈리는 프레임에 부른다 — 그 뒤 몸 · 카메라는 새 판의 자세를 그대로 읽는다 */
export function endPoseTurn(): void {
  turn = null
  ownFrames = 0
  ownTotal = 0
}

/**
 * 스스로 흐르는 턴 (판 끝 · 폭포 끝처럼 쥐는 쪽에 시간표가 없을 때). `frames` 프레임에 걸쳐 0 → 1이다
 */
export function beginTimedPoseTurn(spec: Omit<PoseTurn, 'k'>, frames: number): void {
  beginPoseTurn(spec)
  ownTotal = Math.max(1, frames)
}

/** 스스로 흐르는 턴을 한 프레임 민다. 다 돌았으면 true (턴은 아직 안 끝낸다 — 쥐는 쪽이 `endPoseTurn`) */
export function tickTimedPoseTurn(dt: number): boolean {
  if (turn === null || ownTotal === 0) return true
  ownFrames = Math.min(ownTotal, ownFrames + dt * 60)
  turn.k = ownFrames / ownTotal
  return ownFrames >= ownTotal
}
