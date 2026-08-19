import { describe, it, expect } from 'vitest'
import {
  CLIMB_EDGE_SECONDS, HERO_CLIP_NONE, WATERING_START_SECONDS, WATERING_TAIL_SECONDS,
  tickHeroClip, type HeroClipInput, type HeroClipState, type HeroFlyPhase,
} from './heroClips'
import { HERO_FIELD_CLIPS } from './npcModels'
import { HOOK_FRAMES, type FishingPhase, type FishingResult, type FishingState } from './fishing'
import type { Rod } from '../battle/encounter'
import type { FlyPhase } from '../../scene/flyTransition'

/** 굽는 쪽과 도는 쪽이 같은 이름을 봐야 한다 */
const BAKED = new Set<string>(HERO_FIELD_CLIPS)

const DT = 1 / 60

/** 낚시 한 판. `frames`는 「!」 창에서만 뜻이 있어서 기본은 창 전체다 */
const rod = (
  phase: FishingPhase, result: FishingResult | null = null,
  which: Rod = 'old', frames = HOOK_FRAMES[which],
): FishingState => ({ rod: which, phase, frames, delay: 0, result, hooked: true })

const idle: HeroClipInput = {
  fishing: null, fly: 'off', action: { kind: null, elapsed: 0, duration: 0 }, watering: false,
}
const step = (prev: HeroClipState, input: Partial<HeroClipInput>): HeroClipState =>
  tickHeroClip(prev, { ...idle, ...input }, DT)

/** 같은 입력을 초 단위로 먹여 나온 이름들을 차례대로 */
function run(input: Partial<HeroClipInput>, seconds: number, from = HERO_CLIP_NONE): string[] {
  const seen: string[] = []
  let at = from
  for (let t = 0; t < seconds; t += DT) {
    at = step(at, input)
    if (at.name !== null && seen[seen.length - 1] !== at.name) seen.push(at.name)
  }
  return seen
}

describe('주인공 필드 동작 클립', () => {
  it('아무 일도 없으면 절차형에 맡긴다', () => {
    expect(tickHeroClip(HERO_CLIP_NONE, idle, DT)).toEqual(HERO_CLIP_NONE)
  })

  // ⚠️ **이름 하나가 틀리면 그 동작만 조용히 절차형으로 떨어진다.** 화면에서는
  // "좀 밋밋한데" 정도로만 보여서 눈으로는 안 걸린다
  it('부르는 이름이 전부 실제로 구워진 것이다', () => {
    const asked = new Set<string>()
    const cases: Partial<HeroClipInput>[] = [
      { fishing: rod('cast') },
      { fishing: rod('wait') },
      { fishing: rod('bite') },
      { fishing: rod('reel') },
      { fishing: rod('message', 'caught') },
      { fishing: rod('message', 'away') }, { fishing: rod('bite', null, 'old', 5) },
      { fly: 'takeoff' }, { fly: 'transit' }, { fly: 'landing' },
      { action: { kind: 'waterfall', elapsed: 0, duration: 1.1 } },
      { action: { kind: 'waterfall', elapsed: 0.5, duration: 1.1 } },
      { action: { kind: 'waterfall', elapsed: 1.0, duration: 1.1 } },
      { action: { kind: 'rockClimb', elapsed: 0.2, duration: 1.1 } },
    ]
    for (const c of cases) {
      const name = step(HERO_CLIP_NONE, c).name
      expect(name, JSON.stringify(c)).not.toBeNull()
      asked.add(name!)
    }
    for (const name of run({ watering: true }, 2)) asked.add(name)
    for (const name of run({ watering: false }, 1,
      { name: 'watering_loop_f', loop: true, tail: 0 })) asked.add(name)
    for (const name of asked) expect(BAKED.has(name), name).toBe(true)
    // ⚠️ **반대쪽도 본다.** 부를 자리가 없는 클립을 구우면 설치본마다 쓰지도
    // 않는 바이트가 실린다 — 열일곱이 다 어딘가에 걸려 있어야 한다
    const never = [...BAKED].filter((name) => !asked.has(name))
    expect(never).toEqual([])
  })

  it('낚시 일곱을 단계마다 다 쓴다', () => {
    const used = new Set<string>()
    for (const s of [
      rod('cast'), rod('wait'), rod('bite'), rod('reel'),
      rod('message', 'caught'), rod('message', 'away'),
      // 낡은 낚싯대는 창이 45프레임(0.75초)이라 채는 동작 0.33초가 끝나고도
      // 남는다 — 그 자리가 `fishing_hit_loop_f`다
      rod('bite', null, 'old', 5),
    ]) used.add(step(HERO_CLIP_NONE, { fishing: s }).name!)
    expect(used.size).toBe(7)
    expect(used.has('fishing_start_f')).toBe(true)
    // ⚠️ **대단한 낚싯대는 여기까지 안 온다.** 창이 15프레임(0.25초)이라 채는
    // 동작이 끝나기 전에 창이 닫힌다 — 그래서 늘 `fishing_hit_f`다
    expect(step(HERO_CLIP_NONE, { fishing: rod('bite', null, 'super', 1) }).name)
      .toBe('fishing_hit_f')
    expect(step(HERO_CLIP_NONE, { fishing: rod('wait') }).loop).toBe(true)
    // 문 판과 놓친 판이 서로 다른 동작이어야 한다
    expect(step(HERO_CLIP_NONE, { fishing: rod('message', 'caught') }).name)
      .not.toBe(step(HERO_CLIP_NONE, { fishing: rod('message', 'away') }).name)
    // 끝난 판은 절차형으로 돌아간다
    expect(step(HERO_CLIP_NONE, { fishing: rod('done', 'caught') }))
      .toEqual(HERO_CLIP_NONE)
  })

  it('폭포는 들어감 · 오름 · 나옴 셋이 다 보인다', () => {
    const duration = 1.1
    const at = (elapsed: number) =>
      step(HERO_CLIP_NONE, { action: { kind: 'waterfall', elapsed, duration } }).name
    expect(at(0)).toBe('waterfall_in_f')
    expect(at(CLIMB_EDGE_SECONDS + 0.01)).toBe('waterfall_loop_f')
    expect(at(duration - CLIMB_EDGE_SECONDS + 0.01)).toBe('waterfall_end_f')
    // 앞뒤를 떼고도 가운데가 남아야 셋이 다 보인다
    expect(duration - CLIMB_EDGE_SECONDS * 2).toBeGreaterThan(0)
  })

  it('물주기는 들고 · 주고 · 놓는 데까지 이어진다', () => {
    const seen = run({ watering: true }, 1.5)
    expect(seen).toEqual(['watering_f', 'watering_loop_f'])
    // 드는 동작이 끝나기 전에는 안 넘어간다
    let at = step(HERO_CLIP_NONE, { watering: true })
    expect(at.name).toBe('watering_f')
    expect(at.tail).toBeCloseTo(WATERING_START_SECONDS, 6)

    // 밭에서 손을 떼면 규칙은 그 자리에서 끝나지만 놓는 동작은 이어진다
    at = { name: 'watering_loop_f', loop: true, tail: 0 }
    at = step(at, { watering: false })
    expect(at.name).toBe('watering_end_f')
    expect(at.tail).toBeCloseTo(WATERING_TAIL_SECONDS, 6)
    let ticks = 0
    while (at.name !== null && ticks < 600) { at = step(at, { watering: false }); ticks++ }
    expect(at).toEqual(HERO_CLIP_NONE)
    // 뒤끝은 클립 길이만큼이다 — 영영 안 끝나면 발이 묶인 것처럼 보인다
    expect(ticks * DT).toBeCloseTo(WATERING_TAIL_SECONDS, 1)
  })

  it('겹치면 낚시가 이긴다', () => {
    const got = step(HERO_CLIP_NONE, {
      fishing: rod('wait'),
      watering: true,
      action: { kind: 'waterfall', elapsed: 0, duration: 1.1 },
    })
    expect(got.name).toBe('fishing_loop_f')
  })

  it('공중날기는 타는 동작과 내리는 동작이 다르다', () => {
    // `transit`은 탄 채로 있는 구간이라 탄 자세를 그대로 물고 있는다
    expect(step(HERO_CLIP_NONE, { fly: 'takeoff' }).name).toBe('fly_on_f')
    expect(step(HERO_CLIP_NONE, { fly: 'transit' }).name).toBe('fly_on_f')
    expect(step(HERO_CLIP_NONE, { fly: 'landing' }).name).toBe('fly_off_f')
    expect(step(HERO_CLIP_NONE, { fly: 'off' })).toEqual(HERO_CLIP_NONE)
  })

  it('필드 기술 중 클립이 없는 것은 절차형 그대로다', () => {
    for (const kind of ['cut', 'rockSmash', 'strength', 'surf'] as const) {
      expect(step(HERO_CLIP_NONE, { action: { kind, elapsed: 0.1, duration: 0.7 } }).name, kind)
        .toBeNull()
    }
  })
})

// 화면이 넘기는 `FlyPhase`가 여기 union과 어긋나면 여기서 안 맞물린다
const _phaseMatches: HeroFlyPhase = 'takeoff' satisfies FlyPhase
void _phaseMatches
