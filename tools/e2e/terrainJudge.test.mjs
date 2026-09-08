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

/**
 * ⚠️ **대조 컷은 나무에 안 담긴다.** 게임 화면 그림이라 `.audit/`에 두고
 * git이 안 본다 (COPYRIGHT.md §6). 그러니 새 클론에는 없다 — 그때 이 절은
 * **건너뛴다.** 「건너뛴 것은 미실행이지 통과가 아니다」라서 vitest가 그것을
 * skipped로 세고, 여기 있는 기계에서는 그대로 돈다.
 *
 * ⚠️ **있는데 비었으면 떨어뜨린다.** 컷만 지워 놓고 초록을 받는 길을 안 남긴다
 */
const HAVE = existsSync(DIR)

const shots = (kind) => {
  const at = resolve(DIR, kind)
  expect(existsSync(at), `대조 컷 폴더가 없다 — ${at}`).toBe(true)
  const list = readdirSync(at).filter((f) => f.endsWith('.png'))
  expect(list.length, `대조 컷이 비었다 — ${at}`).toBeGreaterThan(0)
  return list.map((f) => [f, judgeTerrain(readFileSync(resolve(at, f)))])
}

describe.skipIf(!HAVE)('지형이 그려졌는가를 재는 자 (대조 컷 `.audit/terrain-controls/`)', () => {
  it('사람이 확인한 망가진 컷을 전부 떨어뜨린다', () => {
    for (const [name, j] of shots('망가진')) {
      expect(j.drawn, `${name} — ${String(j.filled)}/${String(j.roi)}칸 (${String(j.ratio)})`).toBe(false)
    }
  })

  it('사람이 확인한 성한 컷을 전부 통과시킨다 — 실내 검은 여백도 정상 하늘도', () => {
    for (const [name, j] of shots('성한')) {
      expect(j.drawn, `${name} — ${String(j.filled)}/${String(j.roi)}칸 (${String(j.ratio)})`).toBe(true)
    }
  })

  it('두 무리 사이가 벌어져 있다 — 문턱이 한 칸 차이로 뒤집히지 않는다', () => {
    const bad = shots('망가진').map(([, j]) => j.ratio)
    const ok = shots('성한').map(([, j]) => j.ratio)
    // 실측: 망가진 쪽 0~63%, 성한 쪽 75~100%
    expect(Math.max(...bad)).toBeLessThan(Math.min(...ok))
  })

  it('카메라가 넓어 아래가 검은 정상 실내를 안 거절한다', () => {
    // ⚠️ 이 컷이 판정자를 한 번 속였다 — 눈으로 봐 멀쩡한 센터인데 아래 네 칸이
    // 검다는 이유로 떨어졌다. 그 검정은 못 그린 것이 아니라 **그릴 것이 없는 자리**다
    const [, j] = shots('성한').find(([n]) => n.includes('카메라넓을때'))
    expect(j.voids).toBeGreaterThan(0)
    expect(j.drawn).toBe(true)
  })
})
