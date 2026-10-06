// 기술 소리의 시각 (DATA.md §2.18 「배틀 소리는 BDSP 화면의 박자에 단다」)
//
// 소리는 원작 대본(`res/moves/<이름>/anim.s`)의 것을 내고, 시각은 BDSP 시퀀스가 소리를 내는 프레임
// (`SoundPostEvent`)에서 받는다. 화면이 BDSP라 원작 대본의 프레임 그대로 내면 몸통박치기의 돌진음이
// 몸이 나가기도 전에 났다(원작은 0프레임 · BDSP 돌진은 23프레임).

/** 원작 대본 한 줄 — 대본 프레임(60fps) · SDAT 번호 · 쓴 쪽 기준 자리 */
interface ScriptSound {
  at: number
  seq: number
  pan: number
}

/** 시퀀스 시작에서 몇 초 뒤에 낼 소리 */
export interface TimedSound {
  at: number
  seq: number
  pan: number
}

/** 원작 대본의 시계 */
const SCRIPT_FPS = 60
/** BDSP 시퀀스의 시계 */
const SEQ_FPS = 30

/**
 * 원작 소리를 BDSP 소리 칸에 짝짓는다.
 *
 * - 시퀀스가 없거나 소리 칸이 없으면 원작 프레임 그대로다
 * - 수가 같으면 차례대로
 * - 원작 소리가 하나면 BDSP 첫 칸 — 원작의 한 소리는 대개 기술 전체의 소리다(몸통박치기 `SE_DP_050`)
 * - BDSP 칸이 하나면 그 칸에서 원작 간격대로 편다
 * - 그 밖에는 원작의 첫 소리 → BDSP 첫 칸, 끝 소리 → 끝 칸이고 사이는 원작 간격의 비로 편다
 *
 * @param slots BDSP `SoundPostEvent` 프레임(30fps · 차례대로). null이면 시퀀스가 없다(DS 연출)
 */
export function moveSoundTimes(sounds: readonly ScriptSound[], slots: readonly number[] | null): TimedSound[] {
  const p = [...sounds].sort((a, b) => a.at - b.at)
  if (p.length === 0) return []
  const own = (s: ScriptSound): TimedSound => ({ at: s.at / SCRIPT_FPS, seq: s.seq, pan: s.pan })
  if (slots === null || slots.length === 0) return p.map(own)
  const f = slots
  const first = p[0]!.at
  const last = p[p.length - 1]!.at
  return p.map((s, i) => {
    let frame: number
    if (p.length === f.length) frame = f[i]!
    else if (p.length === 1) frame = f[0]!
    else if (f.length === 1 || last === first) frame = f[0]! + ((s.at - first) * SEQ_FPS) / SCRIPT_FPS
    else frame = f[0]! + ((s.at - first) / (last - first)) * (f[f.length - 1]! - f[0]!)
    return { at: frame / SEQ_FPS, seq: s.seq, pan: s.pan }
  })
}
