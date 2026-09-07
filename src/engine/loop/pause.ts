// 세계가 멎는 까닭은 하나가 아니다 (PLATINUM_3D_COMPLETION_PLAN §3.4 · PT-02)
//
// ⚠️ **`gameLoop.paused`는 boolean 하나인데 멎히는 쪽이 여럿이다.** 그래서 각자
// 그 칸에 직접 대입하면 **나중에 쓴 쪽이 앞의 까닭을 지운다.** 실제로 그 자리가
// 있었다 — `EngineDriver`의 탭 감시가 `gameLoop.paused = document.hidden`으로
// 대입하고 있어서, 장치를 잃어 멎어 둔 세계에서 탭을 나갔다 돌아오기만 하면
// `false`가 덮여 **복구 중인데 세계가 다시 돌기 시작한다.** 그 순간 눌려 있던
// 방향이 먹고, 사람은 보이지 않는 화면에서 걷는다.
//
// 그래서 「멎어 있는가」를 아무도 대입하지 않는다. **까닭을 걸고 푸는 것만**
// 하고, 하나라도 걸려 있으면 멎는다. 두 까닭이 겹쳐도 각자 제 것만 풀면 된다.
//
// ⚠️ **배틀의 진행 정책은 여기 없다.** 그쪽은 「지금 턴을 진행해도 되는가」라
// 상태 기계가 따로 가진다 (`state/battleStore`). 여기서 정하는 것은 **고정
// 스텝이 도는가** 하나뿐이다
import { gameLoop } from './GameLoop'

/**
 * · `hidden` — 탭이 묻혔다 (PLAN §11.2)
 * · `renderer` — 그래픽 장치를 못 쓰거나 다시 세우는 중이다 (`state/rendererStore`)
 * · `scene` — 씬이 그리다 터졌다. 사람이 고르기 전까지 안 돈다
 */
type PauseReason = 'hidden' | 'renderer' | 'scene'

const held = new Set<PauseReason>()

function apply(): void {
  gameLoop.paused = held.size > 0
}

/** 이 까닭으로 세계를 멎힌다. 이미 걸려 있으면 아무 일도 없다 */
export function holdLoop(reason: PauseReason): void {
  held.add(reason)
  apply()
}

/**
 * 이 까닭을 푼다.
 *
 * ⚠️ **푼다고 도는 것이 아니다.** 다른 까닭이 남아 있으면 그대로 멎어 있다 —
 * 그것이 이 파일이 있는 이유다
 */
export function releaseLoop(reason: PauseReason): void {
  held.delete(reason)
  apply()
}

/** 지금 무엇 때문에 멎어 있는가. 화면과 시험이 읽는다 */
export function loopHolds(): readonly string[] {
  return [...held]
}

/** 시험이 판을 새로 깔 때만 쓴다 — 제품 경로에서 부르면 남의 까닭을 지운다 */
export function clearLoopHolds(): void {
  held.clear()
  apply()
}
