// **판정하는 자를 건다** — 어디서나 도는 합성 대조군과, 있으면 거는 실측 컷.
//
// ⚠️ **두 무리를 안 섞는다.** 아래 「합성」은 코드가 그리므로 **새 클론에서도
// 돈다** — 판정자가 구조를 보는지(빈 화면 · 하늘 · 주인공만 · 윗줄 바닥 ·
// 검은 여백)를 항상 묻는다. 「실측」은 사람이 눈으로 가른 게임 화면이라 나무에
// 못 담고(COPYRIGHT.md §6) 없으면 **미실행**이다 — 통과가 아니다.
//
// ⚠️ **문턱을 이 열두 장에 맞춰 놓고 「독립 검증」이라 부르지 않는다.** 문턱은
// 실측 컷에서 나왔고, 합성 대조는 그 문턱이 **구조 규칙을 안 망가뜨리는지**만 건다.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import cuts from './terrainCuts.json' with { type: 'json' }
import { SYNTH_CUTS, synth } from './synthCuts.mjs'
import { judgeTerrain } from './terrainJudge.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const DIR = resolve(ROOT, '.audit/terrain-controls')

/**
 * ⚠️ **있는데 비었으면 떨어뜨린다.** 컷만 지워 놓고 초록을 받는 길을 안 남긴다.
 * 폴더가 통째로 없을 때만 미실행이다
 */
const HAVE = existsSync(DIR)

describe('지형 판정자 — 합성 대조군 (어디서나 돈다)', () => {
  for (const c of SYNTH_CUTS) {
    it(`${c.name} → ${c.want ? '통과' : '거절'}`, () => {
      const j = judgeTerrain(synth(c.paint))
      expect(j.drawn, `${String(j.filled)}/${String(j.roi)}칸 · 검정 ${String(j.voids)}`).toBe(c.want)
    })
  }

  it('검은 칸을 빼 주는 규칙에 「두 칸만 살아도 통과」 구멍이 없다', () => {
    // ⚠️ 이것이 실제로 뚫려 있었다 — 칸 단위로 빼 주던 판에서 이 그림이
    // 「2칸 중 2칸 = 100%」로 통과했다. 이제 검은 줄은 **아래에서 통째로만** 빠진다
    const c = SYNTH_CUTS.find((x) => x.name === '검정-바탕에-두칸만')
    const j = judgeTerrain(synth(c.paint))
    expect(j.roi).toBe(8)
    expect(j.drawn).toBe(false)
  })

  it('정상 실내의 검은 여백은 통째로 한 줄이라 빠진다', () => {
    const c = SYNTH_CUTS.find((x) => x.name === '정상-실내-검은여백')
    const j = judgeTerrain(synth(c.paint))
    expect(j.voids).toBe(4)
    expect(j.drawn).toBe(true)
  })
})

/** 목록에 적힌 신원 그대로인 컷만 판정에 쓴다 */
const load = () => cuts.cuts.map((c) => {
  const at = resolve(ROOT, c.path)
  expect(existsSync(at), `목록에 있는 대조 컷이 없다 — ${c.path}`).toBe(true)
  const buf = readFileSync(at)
  const sha = createHash('sha256').update(buf).digest('hex')
  expect(sha, `대조 컷이 목록과 다른 그림이다 — ${c.path}`).toBe(c.sha256)
  return { ...c, j: judgeTerrain(buf) }
})

describe.skipIf(!HAVE)('지형 판정자 — 실측 컷 (`.audit/terrain-controls/`)', () => {
  it('목록의 컷이 전부 제 신원대로 있고 기대한 대로 갈린다', () => {
    for (const c of load()) {
      expect(c.j.drawn, `${c.path} — ${String(c.j.filled)}/${String(c.j.roi)}칸 (${String(c.j.ratio)})`).toBe(c.want)
    }
  })

  it('두 무리 사이가 벌어져 있다 — 문턱이 한 칸 차이로 뒤집히지 않는다', () => {
    const all = load()
    // 실측: 망가진 쪽 0~63%, 성한 쪽 75~100%
    const bad = all.filter((c) => !c.want).map((c) => c.j.ratio)
    const ok = all.filter((c) => c.want).map((c) => c.j.ratio)
    expect(Math.max(...bad)).toBeLessThan(Math.min(...ok))
  })

  it('매끄럽고 밝은 장판을 「지형 없음」으로 안 읽는다 (계약 1이 틀렸던 자리)', () => {
    // ⚠️ **이 한 장이 계약 1을 무너뜨렸다.** 눈으로 봐 완전히 정상인 축복시티
    // 센터인데 색 개수·흩어짐으로는 **2/8**로 떨어졌다. 흩어짐 문턱을 낮추면
    // 「검정 바탕에 두 칸만」이 도로 통과하므로 문턱으로는 못 고쳤다 —
    // 계약 2가 보는 것은 무늬의 세기가 아니라 **가장자리까지 무언가 있는가**다
    const c = load().find((x) => x.path.includes('매끄러운장판'))
    expect(c, '반례 컷이 목록에 없다').toBeDefined()
    expect(c.j.contract).toBe(2)
    expect(c.j.drawn, `${String(c.j.filled)}/${String(c.j.roi)}칸`).toBe(true)
  })

  it('가장 빠듯한 성한 컷의 칸값이 문턱 위에 있다 — 얼마나 위인지 잠근다', () => {
    // ⚠️ **여기가 창의 아래쪽 끝이다.** 매끄러운 장판의 아랫줄 네 칸이 성한
    // 무리에서 가장 낮다(실측 0.47~0.48). 문턱은 0.40이므로 여유가 얇다 —
    // 이 값이 내려가면 문턱을 낮출 것이 아니라 **재는 값을 다시 골라야** 한다.
    // 창의 위쪽 끝은 합성 「하늘-그라데이션」의 0.33이고 그 장은 위 무리가 건다
    const c = load().find((x) => x.path.includes('매끄러운장판'))
    const roi = c.j.cells.filter((x) => x.r >= 1)
    const low = Math.min(...roi.map((x) => x.edge))
    expect(low, `가장 낮은 칸 ${String(low)}`).toBeGreaterThan(0.4)
    expect(low).toBeLessThan(0.6)
  })

  it('카메라가 넓어 아래가 검은 정상 실내를 안 거절한다', () => {
    // ⚠️ 이 컷이 판정자를 한 번 속였다 — 눈으로 봐 멀쩡한 센터인데 아래 네 칸이
    // 검다는 이유로 떨어졌다. 그 검정은 못 그린 것이 아니라 **그릴 것이 없는 자리**다
    const c = load().find((x) => x.path.includes('카메라넓을때'))
    expect(c.j.voids).toBe(4)
    expect(c.j.drawn).toBe(true)
  })
})
