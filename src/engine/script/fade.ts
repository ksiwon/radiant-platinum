// 화면 페이드 (`ScrCmd_FadeScreen`)
//
// 컷신이 장면을 끊는 자리다. 이게 없으면 "어두워졌다가 다시 밝아지면 사람이
// 사라져 있다" 같은 연출이 통째로 안 보인다 — 스크립트에서 425번 기다린다.
//
// 인자는 원작 그대로다 (`FadeScreen transition, frames, type, color`):
//
//   transition  단계 수. 매크로가 늘 `FADE_SCREEN_CMD_STEPS`(6)를 넣는다
//   frames      한 단계의 프레임 수. FAST 1 · MEDIUM 3 · SLOW 6
//   type        `generated/fade_types.txt`의 줄 번호. 0 밝기 아웃 · 1 밝기 인
//   color       RGB555. `COLOR_BLACK`(0)이 대부분이고 `COLOR_WHITE`(0x7fff)가 다섯 곳
//
// ⚠️ **짝수가 아웃, 홀수가 인이다.** 표가 OUT/IN을 번갈아 적어 두었다. 실측으로
// 필드 스크립트가 쓰는 종류는 0(205+13곳) · 1(203+13곳) · 20(2곳)뿐이라, 짝/홀만
// 갈라도 437곳 중 437곳이 맞는다.
//
// ⚠️ **시간이 아니라 프레임을 센다.** 처음엔 `performance.now()`로 쟀는데, 그러면
// 게임을 빨리 감는 자리에서 영영 안 끝난다 — 시험이 진입점 4079개를 훑을 때
// 한 진입점이 1밀리초도 안 걸리므로 100밀리초짜리 페이드가 7만 프레임을 먹었다.
// 원작 인자 자체가 **프레임 수**이기도 하다.

interface Fade {
  /** 시작할 때 덮개의 진하기 */
  from: number
  to: number
  /** 지금까지 지난 프레임 */
  elapsed: number
  /** 다 되는 데 걸리는 프레임 */
  frames: number
  /** CSS 색. 원작의 RGB555를 옮긴 것이다 */
  color: string
}

/**
 * 지금 걸린 페이드. null이면 아무것도 안 덮여 있다.
 *
 * **끝나도 안 지운다** — 아웃이 끝난 화면은 계속 덮여 있어야 한다. 다음
 * 페이드가 덮어쓰거나 `resetFade`가 지운다
 */
export const screenFade = {
  now: null as Fade | null,
}

/** RGB555 → CSS. 5비트를 8비트로 늘릴 때 위쪽 3비트를 아래에 되붙인다 */
export function fadeColor(rgb555: number): string {
  const up = (v: number): number => (v << 3) | (v >> 2)
  const r = up(rgb555 & 0x1f), g = up((rgb555 >> 5) & 0x1f), b = up((rgb555 >> 10) & 0x1f)
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`
}

/**
 * 페이드를 건다.
 *
 * 지금 덮여 있는 만큼에서 시작한다 — 아웃이 끝난 상태에서 인을 걸면 검은
 * 화면에서 밝아진다. 0에서 다시 시작하면 밝아지는 대신 한 번 번쩍인다
 */
export function startFade(steps: number, framesPerStep: number, type: number, color: number): void {
  const out = (type & 1) === 0
  screenFade.now = {
    from: fadeAlpha(),
    to: out ? 1 : 0,
    elapsed: 0,
    frames: Math.max(1, steps * framesPerStep),
    color: fadeColor(color),
  }
}

/** 한 프레임 지났다. 세계가 한 칸 구를 때 함께 부른다 (`FieldWorld.tick`) */
export function tickFade(): void {
  const f = screenFade.now
  if (f && f.elapsed < f.frames) f.elapsed++
}

/** 지금 덮인 정도 0~1 */
export function fadeAlpha(): number {
  const f = screenFade.now
  if (!f) return 0
  return f.from + (f.to - f.from) * Math.min(1, f.elapsed / f.frames)
}

/** 다 끝났는가 (`IsScreenFadeDone`) */
export function fadeDone(): boolean {
  const f = screenFade.now
  return f === null || f.elapsed >= f.frames
}

/**
 * 덮개를 걷는다.
 *
 * ⚠️ 맵을 옮길 때 꼭 불러야 한다. 아웃만 걸고 워프한 스크립트가 있으면, 안 걷을
 * 경우 도착한 맵이 **검은 화면 그대로** 남는다
 */
export function resetFade(): void {
  screenFade.now = null
}
