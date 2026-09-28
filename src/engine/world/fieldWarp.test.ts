// 빙글 워프 (`overlay006/field_warp.c`) — 원작 단계와 프레임을 그대로 따라가는가
import { describe, expect, it } from 'vitest'
import { FIELD_WARP_FADE, FieldWarpRun, fieldWarpColor, type FieldWarpFrame } from './fieldWarp'

const FADE_FRAMES = FIELD_WARP_FADE.steps * FIELD_WARP_FADE.framesPerStep

/** 페이드를 바깥에서 굴린다 — 걸린 뒤 6프레임에 끝난다 */
function run(kind: 'escapeRope' | 'dig' | 'teleport') {
  let fadeLeft = 0
  const w = new FieldWarpRun(kind, () => fadeLeft <= 0)
  const frames: FieldWarpFrame[] = []
  let arrivedAt = -1
  for (let f = 0; f < 2000 && !w.finished; f++) {
    if (fadeLeft > 0) fadeLeft--
    const fr = w.step()
    if (fr.fade !== null) fadeLeft = FADE_FRAMES
    if (fr.changeMap) { arrivedAt = f; w.arrive() }
    frames.push(fr)
  }
  return { frames, arrivedAt, finished: w.finished }
}

describe('빙글 워프', () => {
  it('감속 회전은 남 → 서 → 북 → 동으로 돌고, 도착하면 남쪽을 보고 선다', () => {
    const { frames, finished } = run('escapeRope')
    expect(finished).toBe(true)
    const dirs = frames.map((f) => f.dir).filter((d) => d !== null)
    expect(dirs.slice(0, 4)).toEqual([1, 2, 0, 3])
    expect(dirs.at(-1)).toBe(1)
  })

  it('페이드는 나갈 때 한 번 · 들어올 때 한 번이고, 맵은 아웃이 끝난 뒤에 갈린다', () => {
    const { frames, arrivedAt } = run('dig')
    const fades = frames.map((f, i) => [f.fade, i] as const).filter(([f]) => f !== null)
    expect(fades.map(([f]) => f)).toEqual(['out', 'in'])
    const outAt = fades[0]![1]
    // 0프레임에 건 감속 회전이 28프레임째에 끝나고, 빠른 회전 일곱 바퀴(28프레임) 뒤 여덟째를 거는 프레임
    expect(outAt).toBe(28 + 7 * 4)
    expect(arrivedAt).toBeGreaterThanOrEqual(outAt + FADE_FRAMES)
    expect(fades[1]![1]).toBe(arrivedAt + 1)
  })

  it('카메라는 −150(77.5%)까지 다가왔다가 도착 뒤 60프레임에 걸쳐 제자리로 간다', () => {
    const { frames, arrivedAt } = run('teleport')
    const out = frames.slice(0, arrivedAt + 1).map((f) => f.dolly)
    expect(Math.min(...out)).toBeCloseTo(1 - 150 / (0x29aec1 / 4096), 6)
    // 15프레임에 다 다가온다
    expect(out[15]).toBeCloseTo(Math.min(...out), 6)
    expect(frames.at(-1)!.dolly).toBeCloseTo(1, 9)
    const back = frames.slice(arrivedAt + 1)
    expect(back[1]!.dolly).toBeCloseTo(Math.min(...out), 6)
  })

  it('순간이동만 검정이다', () => {
    expect(fieldWarpColor('teleport')).toBe(0)
    expect(fieldWarpColor('escapeRope')).toBe(0x7fff)
    expect(fieldWarpColor('dig')).toBe(0x7fff)
  })
})
