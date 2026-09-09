// **기다리는 자를 건다** — 관문이 실제로 막는지를 호출 경계에서 묻는다.
//
// ⚠️ **이 자리가 한 번 아무것도 안 막았다.** `page.waitForFunction`에 async
// 판정식을 줘서 첫 폴링에 통과했고, 그동안 검사는 「준비됐다」고 적고 있었다.
// 그래서 준비 거짓·참·관측 오류·안 끝나는 물음·상한 초과를 여기서 직접 준다.
import { describe, expect, it } from 'vitest'
import { waitTerrain } from './stageProbe.mjs'

/** `terrainReady()`가 돌려줄 것을 차례로 흉내 내는 가짜 페이지 */
const fakePage = (answers) => {
  let n = 0
  return {
    asked: 0,
    async evaluate() {
      this.asked += 1
      const a = answers[Math.min(n++, answers.length - 1)]
      if (typeof a === 'function') return a()
      return a
    },
    async waitForTimeout() {},
  }
}

const FALSE = { ok: false, why: '씬에 선 청크가 다른 맵의 것이다' }

describe('waitTerrain — 지형이 설 때까지 기다리는 자', () => {
  it('준비가 거짓이면 상한까지 안 통과한다', async () => {
    const page = fakePage([FALSE])
    const r = await waitTerrain(page, 600)
    expect(r.ok).toBe(false)
    expect(r.why).toBe(FALSE.why)
    expect(page.asked).toBeGreaterThan(1)
  })

  it('준비가 참이면 곧바로 통과하고 까닭을 안 남긴다', async () => {
    const r = await waitTerrain(fakePage([{ ok: true, why: null }]), 5_000)
    expect(r.ok).toBe(true)
    expect(r.why).toBe(null)
  })

  it('몇 번 거짓이다가 참이 되면 그때 통과한다', async () => {
    const page = fakePage([FALSE, FALSE, { ok: true, why: null }])
    const r = await waitTerrain(page, 5_000)
    expect(r.ok).toBe(true)
    expect(page.asked).toBe(3)
  })

  it('물음이 터지면 통과로 접지 않고 그 까닭을 남긴다', async () => {
    const r = await waitTerrain(fakePage([() => { throw new Error('모듈을 못 열었다') }]), 600)
    expect(r.ok).toBe(false)
    expect(r.why).toContain('못 물었다')
    expect(r.why).toContain('모듈을 못 열었다')
  })

  it('한 번의 물음이 안 끝나도 바깥 상한이 듣는다', async () => {
    // ⚠️ 실측: 안 끝나는 프로미스를 `page.evaluate`에 주면 **26초**를 매달렸다.
    // 그 26초는 계약이 아니라 가비지 컬렉션의 우연이다 — 그러니 여기서 끊는다
    const t0 = Date.now()
    const page = fakePage([() => new Promise(() => {})])
    const r = await waitTerrain(page, 900, 200)
    expect(r.ok).toBe(false)
    expect(r.why).toContain('넘겼다')
    expect(Date.now() - t0).toBeLessThan(4_000)
    // ⚠️ **못 잰 것과 아직 안 된 것을 가른다** (후속 §7)
    expect(r.probeFailed).toBe(true)
    // ⚠️ **떠 있는 물음을 겹겹이 쌓지 않는다** — 상한을 넘기면 거기서 끝난다
    expect(page.asked).toBe(1)
  })

  it('거짓이 이어지는 동안에도 물음은 한 번에 하나뿐이다', async () => {
    const page = fakePage([FALSE])
    const r = await waitTerrain(page, 800, 300)
    expect(r.probeFailed).toBe(false)
    // 물은 횟수와 답한 횟수가 같다 — 버려 두고 또 연 것이 없다
    expect(r.asked).toBe(page.asked)
  })

  it('상한을 넘기면 기다린 시간을 적어 「판정 불가」를 가릴 수 있게 한다', async () => {
    const r = await waitTerrain(fakePage([FALSE]), 700)
    expect(r.waitedMs).toBeGreaterThanOrEqual(700)
  })
})
