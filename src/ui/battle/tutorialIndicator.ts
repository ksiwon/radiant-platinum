// 포획 강좌의 가리키는 손 — 원작 움직임 그대로 (`battle/indicator.c`의 `SysTask_AnimateIndicator`)
//
// 손을 띄우면 퇴장 타이머 60이 돈다. 그동안 손은 제자리 위로 튄다 — 각이 한 프레임에 10°씩 가고 180°에서 되감기며
// 높이가 `sin(각) × 14`픽셀이다. 타이머가 다 되고 **다음 되감기**에서 퇴장이 시작된다: 4프레임 선 뒤 8픽셀 내려와
// 「떨어졌다」(`hasDropped`)를 한 프레임 세우고 — 그 순간이 누름이다 — 3프레임 뒤 2픽셀 자리로, 다시 3프레임 뒤 사라진다.
// 그래서 누름은 띄운 뒤 **76프레임째**, 손이 사라지는 것은 82프레임째다.

/** 튀는 높이 (`14 << FX32_SHIFT`) */
const BOUNCE = 14
/** 퇴장 타이머 (`Indicator_SetExitTimer(…, 60)`) */
const EXIT_TIMER = 60

interface IndicatorFrame {
  /** 손이 제자리에서 얼마나 **아래로** 가 있는가(DS 픽셀). 튈 때는 음수다 */
  dy: number
  visible: boolean
  /** 이 프레임이 누름인가 (`Indicator_GetHasDropped`) */
  pressed: boolean
}

/**
 * 띄운 뒤 `frame`번째 프레임의 손 (1부터 — 띄운 프레임 뒤 첫 작업이 1이다).
 * 원작 상태를 처음부터 다시 밟는다 — 길어야 82걸음이다
 */
export function indicatorAt(frame: number): IndicatorFrame {
  let timer = EXIT_TIMER, pending = false, exiting = false
  let angle = 0, step = 0, count = 0, dy = 0, visible = true, pressed = false
  for (let n = 1; n <= frame; n++) {
    pressed = false
    if (timer > 0 && --timer === 0) pending = true
    if (!visible) continue
    if (!exiting) {
      angle += 1000
      if (angle >= 18000) {
        angle -= 18000
        if (pending) { exiting = true; pending = false }
      }
      if (!exiting) {
        const sin = Math.round(Math.sin((Math.floor(angle / 100) * Math.PI) / 180) * 4096)
        dy = 0 - Math.trunc((Math.floor((sin * (BOUNCE << 12) + 0x800) / 4096)) / 4096)
      }
    }
    if (exiting) {
      if (step === 0) {
        if (++count > 3) { count = 0; step = 1 }
      } else if (step === 1) {
        dy = 8; pressed = true; step = 2
      } else if (step === 2) {
        if (++count > 2) { dy = 2; count = 0; step = 3 }
      } else if (step === 3) {
        if (++count > 2) { visible = false; count = 0; step = 4 }
      }
    }
  }
  return { dy, visible, pressed }
}

/** 누르는 프레임 — 띄운 뒤 몇 번째인가 */
export const INDICATOR_PRESS_FRAME = ((): number => {
  for (let f = 1; f < 200; f++) if (indicatorAt(f).pressed) return f
  return -1
})()

/** 둘째 턴에 손이 뜨기 전의 뜸 (`GetCatchTutorialLowHPInput` — `delay > 60`) */
export const LOW_HP_DELAY = 61
