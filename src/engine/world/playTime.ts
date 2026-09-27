// 플레이 시간 (`play_time.c` · `play_time_manager.c`)
//
// 원작은 게임을 시작하는 순간(새 게임·이어하기 — `game_start.c`의 `PlayTime_Start`) 시계를 켜고,
// 메인 고리가 매 프레임 **흐른 초만큼** 더한다(`PlayTime_IncrementTimer`). 메뉴·배틀·컷신을 가리지
// 않고, 리셋(`PlayTime_FlagNotStarted`)까지 돈다. 999:59:59에서 멈춘다.
//
// ⚠️ 없던 동안 트레이너 카드·리포트 정보·명예의 전당이 늘 「0:00」이었다 — 더하는 함수는 있었는데
// 부르는 곳이 한 군데도 없었다 (REPAIR §129)

/** `PLAYTIME_MAX_HOURS`:`PLAYTIME_MAX_MINUTES`:`PLAYTIME_MAX_SECONDS` = 999:59:59 */
export const PLAYTIME_MAX_MS = (999 * 3600 + 59 * 60 + 59) * 1000

/** 더한 값. 끝에 닿으면 거기서 선다 (`PlayTime_Increment`의 첫 줄과 `hours >= MAX` 갈래) */
export function addPlaytimeCapped(now: number, add: number): number {
  return Math.min(PLAYTIME_MAX_MS, now + Math.max(0, add))
}

/**
 * 시계를 켠다 — **초 단위로** 더한다. 원작도 흐른 시간을 초로 내려 모자라는 몫은 다음 프레임에 넘긴다
 * (`Timer_TicksToSeconds` 뒤 `currentTimestamp > sLastTimestamp`일 때만).
 *
 * @param add 더할 밀리초(늘 1000의 배수)를 받는다
 * @returns 끄는 함수 — 타이틀로 나가면 원작도 시계를 놓는다
 */
export function startPlayClock(add: (ms: number) => void, clock: () => number = () => performance.now()): () => void {
  const started = clock()
  let counted = 0
  const tick = (): void => {
    const seconds = Math.floor((clock() - started) / 1000)
    if (seconds > counted) {
      add((seconds - counted) * 1000)
      counted = seconds
    }
  }
  const id = setInterval(tick, 250)
  return () => { tick(); clearInterval(id) }
}
