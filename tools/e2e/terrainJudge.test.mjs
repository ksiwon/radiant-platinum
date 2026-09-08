// **판정하는 자를 실제 컷으로 건다.**
//
// ⚠️ **문턱은 지어낸 값이 아니라 대조 컷에서 나온 값이다.** `.audit/terrain-controls/`에
// 실측 컷 열 장이 있다 — 여섯은 **사람이 눈으로 확인한 망가진 화면**이고
// (하늘 한 장 · 까만 원반 위의 주인공 · 바닥 한 줄 · 파란 여백), 넷은
// **성한 화면**이다 (실내 침실 · 실외 축복시티 · 걸어 들어온 직후 · 한 걸음 뒤).
//
// ⚠️ **성한 쪽이 더 중요하다.** 판정을 조이면 지형은 잡히지만 **정상 실내의
// 검은 여백과 정상 하늘까지** 떨어진다 — 그러면 검사가 제 화면을 못 믿게 된다.
// 그래서 두 방향을 다 건다.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeTerrain } from './terrainJudge.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const DIR = resolve(ROOT, '.audit/terrain-controls')

const shots = (kind) => {
  const at = resolve(DIR, kind)
  // ⚠️ **없으면 건너뛰지 않고 떨어뜨린다.** 대조 컷이 사라진 채로 초록이 나면
  // 그 초록은 아무것도 안 잰 것이다
  expect(existsSync(at), `대조 컷이 없다 — ${at}`).toBe(true)
  const list = readdirSync(at).filter((f) => f.endsWith('.png'))
  expect(list.length, `대조 컷이 비었다 — ${at}`).toBeGreaterThan(0)
  return list.map((f) => [f, judgeTerrain(readFileSync(resolve(at, f)))])
}

describe('지형이 그려졌는가를 재는 자', () => {
  it('사람이 확인한 망가진 컷을 전부 떨어뜨린다', () => {
    for (const [name, j] of shots('망가진')) {
      expect(j.drawn, `${name} — ${String(j.filled)}/${String(j.roi)}칸`).toBe(false)
    }
  })

  it('사람이 확인한 성한 컷을 전부 통과시킨다 — 실내 검은 여백도 정상 하늘도', () => {
    for (const [name, j] of shots('성한')) {
      expect(j.drawn, `${name} — ${String(j.filled)}/${String(j.roi)}칸`).toBe(true)
    }
  })

  it('두 무리 사이가 벌어져 있다 — 문턱이 한 장 차이로 뒤집히지 않는다', () => {
    const bad = shots('망가진').map(([, j]) => j.filled)
    const ok = shots('성한').map(([, j]) => j.filled)
    // 실측: 망가진 쪽 0~5칸, 성한 쪽 6~8칸
    expect(Math.max(...bad)).toBeLessThan(Math.min(...ok))
  })
})
