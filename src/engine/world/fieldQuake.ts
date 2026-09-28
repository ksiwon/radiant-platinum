// 화면 흔들림 (`ScrCmd_29F` → `ov6_0223E384` · `ov6_0223E4EC` · `overlay006/ov6_0223E140.c`)
//
// 레지 유적 셋(깨어날 때) · 운하 도서관 3층 · 물가시티 · 천관산 · 갤럭시단의 폭발이 쓴다. 원작은 카메라를 하나 더 만들어
// **바라보는 점의 x만** 흔든다(`ov6_0223FFE4` — y 진폭은 0). 한 번이 네 프레임이다 — +A → 0 → −A → 0
// (`ov6_0223FE9C`의 상태 넷, 한 칸 1프레임). 두 갈래가 있다:
//
//   0: 진폭 2 · 16번 (`FX32_CONST(2.0f)` · 64프레임). 시작에 `SEQ_SE_DP_CLIMAX09`
//   1: 진폭 4 · 24번이고 **한 번마다 1/8씩 준다** (`ov6_0223E3D8`). 배경음을 1프레임에 줄이고 16프레임 쉰 뒤
//      `SEQ_SE_DP_FW089`를 틀고 흔든다 — 끝나면 그 소리를 끊고 16프레임 뒤 16프레임에 걸쳐 배경음을 되올린다
//
// 진폭 단위는 원작 필드 단위다 — 한 칸이 16이다. 스크립트는 흔들림이 끝날 때까지 선다(`FieldTask_InitCall`)

/** `SEQ_SE_DP_CLIMAX09` · `SEQ_SE_DP_FW089` (`generated/sdat.txt`) */
export const SE_QUAKE_START = 1749
export const SE_QUAKE_RUMBLE = 1628
const UNITS_PER_TILE = 16

/** 흔드는 동안 부르는 소리 — 스크립트의 소리 서비스와 같다 */
interface QuakeSound {
  playEffect: (seq: number) => void
  stopEffect: (seq: number) => void
  fadeVolume: (volume: number, frames: number) => void
}

/** 한 프레임의 일 — 카메라 어긋남(칸)과 그 프레임에 낼 소리 */
interface QuakeFrame { x: number, cue?: (s: QuakeSound) => void }

/** 흔들림 한 벌을 프레임 목록으로 편다. 시험이 이것을 원작 차례와 견준다 */
export function quakeFrames(kind: number): QuakeFrame[] {
  const out: QuakeFrame[] = []
  const shake = (amp0: number, times: number, decay: boolean): void => {
    let amp = amp0
    for (let n = 0; n < times; n++) {
      for (const k of [1, 0, -1, 0]) out.push({ x: (amp * k) / UNITS_PER_TILE })
      // 남은 수가 바뀔 때 진폭이 준다 — `v1 = v0 − v0 / 8` (fx32 나눗셈이라 소수로 남는다)
      if (decay) amp -= amp / 8
    }
  }
  if (kind === 0) {
    out.push({ x: 0, cue: (s) => { s.playEffect(SE_QUAKE_START) } })
    shake(2, 16, false)
    return out
  }
  out.push({ x: 0, cue: (s) => { s.playEffect(SE_QUAKE_START); s.fadeVolume(0, 1) } })
  out.push({ x: 0 })
  for (let i = 0; i < 16; i++) out.push({ x: 0 })
  out.push({ x: 0, cue: (s) => { s.playEffect(SE_QUAKE_RUMBLE) } })
  shake(4, 24, true)
  out.push({ x: 0, cue: (s) => { s.stopEffect(SE_QUAKE_RUMBLE) } })
  for (let i = 0; i < 16; i++) out.push({ x: 0 })
  out.push({ x: 0, cue: (s) => { s.fadeVolume(127, 16) } })
  for (let i = 0; i < 16; i++) out.push({ x: 0 })
  return out
}

let run: { frames: QuakeFrame[], at: number, carry: number, sound: QuakeSound | null } | null = null

export function startQuake(kind: number, sound: QuakeSound | null): void {
  run = { frames: quakeFrames(kind), at: 0, carry: 0, sound }
}

export function quakeDone(): boolean {
  return run === null
}

/** 지금 카메라를 x로 얼마나 밀까 (칸). 흔들지 않으면 0 */
export function quakeOffset(): number {
  return run?.frames[run.at]?.x ?? 0
}

/** 한 틱. 60Hz 프레임 수로 센다 — 원작의 한 칸이 한 프레임이다. 스크립트가 기다리는 동안 프레임마다 부른다 (`ScrCmd_29F`) */
export function quakeTick(dt: number): void {
  const r = run
  if (r === null) return
  r.carry += dt * 60
  while (r.carry >= 1 && run !== null) {
    r.carry -= 1
    const frame = r.frames[r.at]
    if (frame?.cue && r.sound) frame.cue(r.sound)
    r.at++
    if (r.at >= r.frames.length) run = null
  }
}
