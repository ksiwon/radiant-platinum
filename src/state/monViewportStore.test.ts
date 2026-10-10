// 구멍 스토어 · 떨어지기 넷 (SYSTEM §2.4 · PV 「테스트」).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  specKey, useMonViewportStore, viewportMode, type MonViewportSpec, type ViewportModeInput,
} from './monViewportStore'

const spec = (species: number, over: Partial<MonViewportSpec> = {}): MonViewportSpec => (
  { species, form: 0, gender: 'none', shiny: false, ...over }
)
// 스토어는 요소를 보관만 한다 — DOM 없이 자리표시로 시험한다
const el = (): HTMLElement => ({}) as HTMLElement

afterEach(() => {
  useMonViewportStore.setState({ hole: null, shown: null, broken: false, cryNonce: 0 })
  vi.restoreAllMocks()
})

describe('구멍은 한 번에 하나다', () => {
  it('올린 구멍이 서고, 놓으면 비고 보고도 지워진다', () => {
    const s = useMonViewportStore.getState()
    const a = el()
    const token = s.claim(a, null, spec(417))
    expect(useMonViewportStore.getState().hole?.el).toBe(a)
    useMonViewportStore.getState().report(specKey(spec(417)))
    useMonViewportStore.getState().release(token)
    expect(useMonViewportStore.getState().hole).toBeNull()
    expect(useMonViewportStore.getState().shown).toBeNull()
  })

  it('둘째는 경고하고 나중 것이 이긴다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const first = el()
    const second = el()
    useMonViewportStore.getState().claim(first, null, spec(1))
    useMonViewportStore.getState().claim(second, null, spec(2))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(useMonViewportStore.getState().hole?.el).toBe(second)
    expect(useMonViewportStore.getState().hole?.spec.species).toBe(2)
  })

  it('밀려난 쪽이 놓아도 지금 구멍은 그대로다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const old = useMonViewportStore.getState().claim(el(), null, spec(1))
    const now = useMonViewportStore.getState().claim(el(), null, spec(2))
    useMonViewportStore.getState().release(old)
    expect(useMonViewportStore.getState().hole?.token).toBe(now)
  })

  it('같은 요소를 다시 올리는 것은 경고가 아니다 (다시 그린 것이다)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const a = el()
    useMonViewportStore.getState().claim(a, null, spec(1))
    useMonViewportStore.getState().claim(a, null, spec(1))
    expect(warn).not.toHaveBeenCalled()
  })

  it('종을 바꾸면 같은 구멍이 새 종을 든다. 같은 종이면 상태를 안 건드린다', () => {
    const token = useMonViewportStore.getState().claim(el(), null, spec(1))
    const before = useMonViewportStore.getState().hole
    useMonViewportStore.getState().retarget(token, spec(1))
    expect(useMonViewportStore.getState().hole).toBe(before)
    useMonViewportStore.getState().retarget(token, spec(2, { shiny: true }))
    expect(useMonViewportStore.getState().hole?.spec).toEqual(spec(2, { shiny: true }))
  })

  it('남의 표로 바꾸려는 것은 무시한다', () => {
    useMonViewportStore.getState().claim(el(), null, spec(1))
    useMonViewportStore.getState().retarget(9999, spec(2))
    expect(useMonViewportStore.getState().hole?.spec.species).toBe(1)
  })

  it('울음은 올 때마다 오른다', () => {
    useMonViewportStore.getState().cry()
    useMonViewportStore.getState().cry()
    expect(useMonViewportStore.getState().cryNonce).toBe(2)
  })
})

describe('specKey', () => {
  it('종 · 모습 · 성별 · 이로치가 다르면 열쇠가 다르다', () => {
    const keys = new Set([
      specKey(spec(417)), specKey(spec(417, { form: 1 })), specKey(spec(417, { gender: 'female' })),
      specKey(spec(417, { shiny: true })), specKey(spec(418)),
    ])
    expect(keys.size).toBe(5)
  })
})

describe('viewportMode — 떨어지기 넷', () => {
  const base = (over: Partial<ViewportModeInput> = {}): ViewportModeInput => ({
    spec: spec(417),
    rendererLive: true,
    crashed: false,
    shown: { key: specKey(spec(417)), state: 'ready' },
    ...over,
  })

  it('몸이 서 있으면 3D다', () => {
    expect(viewportMode(base())).toBe('model')
  })

  it('① 모델이 없으면 2D다', () => {
    expect(viewportMode(base({ shown: { key: specKey(spec(417)), state: 'none' } }))).toBe('sprite')
  })

  it('② 아직 오는 중이면 2D다 — 보고가 없거나 다른 몸의 보고다', () => {
    expect(viewportMode(base({ shown: null }))).toBe('sprite')
    expect(viewportMode(base({ shown: { key: specKey(spec(418)), state: 'ready' } }))).toBe('sprite')
    expect(viewportMode(base({ shown: { key: specKey(spec(417, { form: 1 })), state: 'ready' } }))).toBe('sprite')
  })

  it('③ 렌더러가 live가 아니거나 그리다 터졌으면 몸이 서 있어도 2D다', () => {
    expect(viewportMode(base({ rendererLive: false }))).toBe('sprite')
    expect(viewportMode(base({ crashed: true }))).toBe('sprite')
  })

  it('④ 안 본 칸은 「?」다 — 렌더러가 죽었든 말든', () => {
    expect(viewportMode(base({ spec: null, shown: null }))).toBe('unseen')
    expect(viewportMode(base({ spec: null, rendererLive: false }))).toBe('unseen')
  })

  it('패스가 터져 `broken`이 서면 그 판은 2D로 선다', () => {
    useMonViewportStore.getState().markBroken()
    expect(viewportMode(base({ crashed: useMonViewportStore.getState().broken }))).toBe('sprite')
  })
})

describe('무대가 내려가면', () => {
  it('보고가 거둬져 모드가 model이 아니다', () => {
    const want = spec(417)
    const input = (): ViewportModeInput => (
      { spec: want, rendererLive: true, crashed: false, shown: useMonViewportStore.getState().shown }
    )
    useMonViewportStore.getState().report(specKey(want))
    expect(viewportMode(input())).toBe('model')
    // `MonViewportStage`의 몸 효과 cleanup · 언마운트가 부르는 것
    useMonViewportStore.getState().report(null)
    expect(viewportMode(input())).toBe('sprite')
  })
})
