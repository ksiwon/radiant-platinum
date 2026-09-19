// 배틀 연출 시계 — 글·게이지·몸·입자·볼이 **한 시간축** 위에 선다.
//
// 왜 필요한가. 재생기는 `requestAnimationFrame` 콜백마다 남은 쉼에서 1을 빼고
// 있었고(`ui/battle/useBattlePlayback`), 무대는 `delta` 초를, 볼은
// `performance.now()`를 봤다. 원작의 60프레임을 **디스플레이 60회**와 같은
// 것으로 친 구현이라, 화면 주사율이 바뀌면 연출 길이가 통째로 달라졌다
// (실측: 120프레임짜리 연출이 30Hz에서 4,033ms · 144Hz에서 840ms).
//
// 그래서 프레임 수는 **자료로 그대로 두고** 실행만 ms로 옮긴다. 모니터 Hz를
// 짐작해 상수를 보정하지 않는다 — 셈에 Hz가 아예 안 들어간다.
//
// ⚠️ **한 프레임이 길어도 여러 박자를 한꺼번에 삼키지 않는다.** 탭을 숨겼다
// 돌아오면 `rAF`가 몇 초를 한 번에 물고 오는데, 그걸 그대로 흘리면 복귀했을 때
// 마지막 장면만 떠 있다. 한 걸음을 `MAX_STEP_MS`로 자르고 숨은 동안은 아예 멈춘다.
//
// ⚠️ **미는 쪽은 하나다.** 여럿이 같은 프레임에 밀면 시간이 두 배로 간다 —
// `claim`한 주인만 `tick`이 먹고 나머지는 `now()`를 읽기만 한다.

/** 원작 프레임을 초로. 원작은 60fps다 */
export const FRAME_SECONDS = 1 / 60

/** 프레임 → ms */
export function frameMs(frames: number): number {
  return frames * FRAME_SECONDS * 1000
}

/**
 * 몸이 서고 사라지는 데 걸리는 시간(초).
 *
 * 무대가 등판·기절을 0/1로 끊지 않고 이만큼에 걸쳐 민다
 * (`scene/battle/BattleStage`의 `FADE`). 박자도 같은 값을 봐야 **기절 연출이 다
 * 끝난 뒤에** 다음 글이 뜬다 — 예전에는 `HOLD_FAINT 7`(체력창이 빠지는 시간)만
 * 쉬어서 몸이 아직 사라지는 중에 「쓰러졌다!」와 교체가 지나갔다
 */
export const BODY_FADE_SECONDS = 0.35

/**
 * 한 걸음의 위끝(ms).
 *
 * 탭 복귀·셰이더 컴파일·GC로 프레임 하나가 몇 초가 될 수 있다. 그 전부를 흘리면
 * 「글 → 연출 → 게이지 → 다음 글」이 한 프레임에 지나간다. 100ms면 30Hz(33ms)도
 * 온전히 흐르고, 그보다 긴 멈춤은 멈춤으로 친다
 */
export const MAX_STEP_MS = 100

class BattlePresentationClock {
  /** 연출 시간(초). 실제 시각이 아니라 **연출이 흐른 만큼**이다 */
  private seconds = 0
  private lastMs: number | null = null
  private held = 0
  private owner: symbol | null = null

  /** 이 시계를 미는 주인이 되겠다고 적는다. 이미 주인이 있으면 거절한다 */
  claim(token: symbol): boolean {
    if (this.owner !== null && this.owner !== token) return false
    this.owner = token
    this.lastMs = null
    return true
  }

  release(token: symbol): void {
    if (this.owner === token) {
      this.owner = null
      this.lastMs = null
    }
  }

  /** 주인이 있는가. 없으면 아무나 밀 수 있다 (무대만 떠 있는 진단 판) */
  ownedBy(token: symbol): boolean {
    return this.owner === null || this.owner === token
  }

  /**
   * 시계를 민다. 흐른 **연출 초**를 돌려준다.
   *
   * 멈춰 있거나 뒤로 간 시각이면 0이다. 한 걸음은 `MAX_STEP_MS`를 안 넘는다
   */
  tick(nowMs: number): number {
    if (this.lastMs === null) { this.lastMs = nowMs; return 0 }
    const raw = nowMs - this.lastMs
    this.lastMs = nowMs
    if (this.held > 0 || raw <= 0) return 0
    const step = Math.min(raw, MAX_STEP_MS)
    this.seconds += step / 1000
    return step / 1000
  }

  /** 지금까지 흐른 연출 초 */
  now(): number {
    return this.seconds
  }

  /**
   * 잠깐 멈춘다. 겹쳐 부를 수 있다 — 부른 만큼 풀어야 다시 흐른다.
   *
   * 숨은 동안 **결과만 진행**하면 안 되므로 재생기도 같이 선다
   */
  hold(): void {
    this.held++
  }

  resume(): void {
    this.held = Math.max(0, this.held - 1)
  }

  get paused(): boolean {
    return this.held > 0
  }

  /** 배틀 하나가 끝나면 되돌린다. 다음 배틀이 앞 배틀의 초를 물려받지 않는다 */
  reset(): void {
    this.seconds = 0
    this.lastMs = null
    this.held = 0
  }
}

/**
 * 배틀 하나가 쓰는 시계. UI와 무대가 **같은 것**을 본다.
 *
 * 모듈 하나에 둔 이유는 의존 방향이다 — UI가 씬을 import 하면 지연 로딩 경계가
 * 깨진다. 둘 다 엔진을 보게 두면 그런 일이 없다
 */
export const battleClock = new BattlePresentationClock()

/**
 * 탭이 숨으면 세운다.
 *
 * ⚠️ **숨은 동안 결과만 흐르면 안 된다.** 돌아왔을 때 마지막 장면만 떠 있고
 * 무엇이 지나갔는지 아무도 못 본다. `MAX_STEP_MS`가 한 걸음을 자르기는 하지만,
 * 숨어 있는 내내 프레임이 안 오는 브라우저와 오는 브라우저가 갈리므로 여기서
 * 명시적으로 세운다
 */
export function watchVisibility(clock: BattlePresentationClock = battleClock): () => void {
  if (typeof document === 'undefined') return () => { /* 브라우저가 아니다 */ }
  let hidden = false
  const look = (): void => {
    const now = document.visibilityState === 'hidden'
    if (now === hidden) return
    hidden = now
    if (now) clock.hold()
    else clock.resume()
  }
  document.addEventListener('visibilitychange', look)
  look()
  return () => {
    document.removeEventListener('visibilitychange', look)
    if (hidden) { clock.resume(); hidden = false }
  }
}
