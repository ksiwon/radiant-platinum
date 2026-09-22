// 관측 어댑터의 계약 (`observe.mjs`) — 후속 §3의 회귀 검사
//
// ⚠️ **여기서 재는 것은 「못 읽는 것을 못 읽었다고 하는가」다.** 예전에는
// 배포물에서 못 읽는 값이 `null`·`false`로 접혀 「그 사람이 없다」·
// 「파티가 비었다」가 됐다
import { describe, expect, it, vi } from 'vitest'
import { got, makeObserver, observerKind, unknown } from './observe.mjs'

/** 페이지 흉내. `evaluate`가 몇 번 불렸는지를 센다 */
const fakePage = (kind, answers = {}) => {
  const calls = []
  return {
    calls,
    evaluate: vi.fn(async (fn, arg) => {
      calls.push({ src: String(fn).slice(0, 200), arg })
      // 갈래 판정은 실제 함수를 브라우저 없이 흉내 낸다
      if (String(fn).includes('@vite/client')) return kind
      if (String(fn).includes('documentElement.dataset')) return answers.dataset ?? {}
      if (String(fn).includes('/src/')) {
        if (kind === 'dist') throw new Error('Failed to fetch dynamically imported module')
        return answers.src ?? null
      }
      return null
    }),
  }
}

describe('답의 모양', () => {
  it('읽은 것과 못 읽은 것이 다른 모양이다', () => {
    expect(got(3)).toEqual({ known: true, value: 3 })
    expect(unknown('왜').known).toBe(false)
    // 「관측 불가」는 거짓이 아니다 — 값을 들고 있지 않다
    expect('value' in unknown('왜')).toBe(false)
  })
})

describe('갈래 판정', () => {
  it('개발 서버의 표시를 본다', async () => {
    await expect(observerKind(fakePage('dev'))).resolves.toBe('dev')
  })
  it('배포물에는 그 표시가 없다', async () => {
    await expect(observerKind(fakePage('dist'))).resolves.toBe('dist')
  })
  it('갈래를 물을 때 /src를 안 찌른다', async () => {
    const page = fakePage('dist')
    await observerKind(page)
    expect(page.calls.some((c) => c.src.includes('/src/'))).toBe(false)
  })
})

describe('배포용 어댑터', () => {
  it('/src를 여는 자리는 전부 관측 불가다', async () => {
    const page = fakePage('dist', { dataset: { map: '311', tile: '80,844' } })
    const obs = await makeObserver(page, 'dist')
    expect(obs.kind).toBe('dist')
    for (const [name, r] of [
      ['lakeVars', await obs.lakeVars()], ['script', await obs.script()],
      ['npcSpot', await obs.npcSpot(3, 15)], ['partyState', await obs.partyState()],
      ['bestMove', await obs.bestMove()],
    ]) {
      expect(r.known, name).toBe(false)
      expect(typeof r.why, name).toBe('string')
    }
  })

  it('/src 요청을 한 건도 안 보낸다', async () => {
    const page = fakePage('dist', { dataset: { map: '311', tile: '80,844' } })
    const obs = await makeObserver(page, 'dist')
    await Promise.all([obs.lakeVars(), obs.script(), obs.npcSpot(3, 15),
      obs.partyState(), obs.bestMove(), obs.where()])
    expect(page.calls.filter((c) => c.src.includes('/src/'))).toEqual([])
  })

  it('표식으로 읽을 수 있는 것은 읽는다 — 다만 칸 단위다', async () => {
    const page = fakePage('dist', { dataset: { map: '311', tile: '80,844' } })
    const obs = await makeObserver(page, 'dist')
    expect(await obs.where()).toEqual({
      known: true, value: { map: 311, x: 80, z: 844, facing: null, tileOnly: true },
    })
  })

  it('표식이 아직 없으면 0,0이 아니라 관측 불가다', async () => {
    const obs = await makeObserver(fakePage('dist', { dataset: {} }), 'dist')
    expect((await obs.where()).known).toBe(false)
  })
})

describe('개발용 어댑터', () => {
  it('모듈이 안 열리면 값이 아니라 관측 불가다', async () => {
    const page = {
      evaluate: vi.fn(async (fn) => {
        if (String(fn).includes('@vite/client')) return 'dev'
        throw new Error('SyntaxError: unexpected token')
      }),
    }
    const obs = await makeObserver(page, 'dev')
    const r = await obs.lakeVars()
    expect(r.known).toBe(false)
    expect(r.why).toContain('SyntaxError')
  })

  it('읽은 값은 그대로 돌려준다', async () => {
    const page = {
      evaluate: vi.fn(async (fn) => (String(fn).includes('@vite/client') ? 'dev'
        : { rival: 4, front: 1, visited: 1 })),
    }
    const obs = await makeObserver(page, 'dev')
    expect(await obs.lakeVars()).toEqual({ known: true, value: { rival: 4, front: 1, visited: 1 } })
  })
})

/**
 * **굽는 쪽이 둘이다** — 개발 서버 판과 배포물 판이 따로 있다.
 *
 * ⚠️ **열쇠가 어긋나면 배포물 판에서 「관측 불가」가 아니라 터진다.** 새 읽기를
 * 개발 쪽에만 더하기가 너무 쉽고(실제로 이 파일에 그렇게 더해진 것이 여럿이다),
 * 그러면 `obs.새것()`이 함수가 아니라서 그 자리가 **결함처럼 보이는 크래시**가
 * 된다 — 못 읽는 것은 못 읽었다고 말해야 한다(이 파일 머리말)
 */
describe('두 어댑터가 같은 것을 내놓는다', () => {
  it('열쇠가 한 글자도 안 어긋난다', async () => {
    const dev = await makeObserver(fakePage('dev'), 'dev')
    const dist = await makeObserver(fakePage('dist'), 'dist')
    const keys = (o) => Object.keys(o).filter((k) => k !== 'kind').sort()
    expect(keys(dist), '배포물 쪽에 스텁이 빠졌다').toEqual(keys(dev))
  })

  it('개발 쪽 읽기는 전부 함수다 — 배포 쪽도 마찬가지다', async () => {
    const dev = await makeObserver(fakePage('dev'), 'dev')
    const dist = await makeObserver(fakePage('dist'), 'dist')
    for (const k of Object.keys(dev)) {
      if (k === 'kind') continue
      expect(typeof dev[k], `dev.${k}`).toBe('function')
      expect(typeof dist[k], `dist.${k}`).toBe('function')
    }
  })
})
