// 지속 효과 예순셋이 **말하는지** 센다 (PARITY §2.25).
//
// 이 파일은 원래 「모양은 있는데 글이 없다」를 못박던 자리다. `-start`·`-end`·
// `-sidestart`·`-fieldstart`는 모양이 이미 있어서(트레이너 AI가 리플렉터·
// 대타출동·트릭룸을 보라고 준 것이다) 「아직 모양 안 준 명령」 목록에 안 잡히는데,
// `battleText`에는 그 갈래가 아예 없었다 — 씨뿌리기가 걸려도 대타가 나타나도
// 도발에 넘어가도 압정이 깔려도 화면이 한 마디도 안 했다.
//
// 이제 롬의 배틀 글 뱅크가 실려 있으므로 **거꾸로 센다**: 예순셋 중 몇이 말하고,
// 안 말하는 것은 그 까닭이 무엇인지를 낱낱이 못박는다.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Dex } from '@pkmn/sim'
import type { Actor, BattleEvent, EffectRef, SideId } from '../../engine/battle/events'
import { DATA, withData } from '../../data/romData.testkit'
import { battleText, type TextContext } from './messages'
import { BATTLE_BANK } from './romText'

const MINE: Actor = { slot: 'p1a', side: 'p1', name: 'p1-0' }
const FOE: Actor = { slot: 'p2a', side: 'p2', name: 'p2-0' }

const BANK_AT = 'dialogue/ko/' + String(BATTLE_BANK) + '.json'
const withBank = withData(BANK_AT)

/**
 * 이름표는 **아무 이름이나** 채운다.
 *
 * 여기서 묻는 것은 「글이 있는가」지 「무슨 글인가」가 아니다. 문장이 맞는지는
 * `messages.test.ts`가 롬의 줄을 통째로 못박아 잰다
 */
const names = {
  species: [],
  moves: Array<string>(700).fill('리플렉터'),
  abilities: Array<string>(200).fill('프레셔'),
  items: [],
}

const ctx: TextContext = {
  names,
  lines: (() => {
    try {
      return JSON.parse(readFileSync(resolve(DATA, BANK_AT), 'utf8')) as string[]
    } catch {
      return []
    }
  })(),
  label: (a) => (a.side === 'p1' ? '모부기' : '야생 팬텀'),
}

const gen4 = Dex.forGen(4)

// ⚠️ **묶음의 하위 경로가 안 열려 있다.** 글 표는 `@pkmn/sim`이 `exports`로
// 내보내는 자리가 아니라 빌드 산출물 안에 있다. 시험이니 파일로 직접 연다
const req = createRequire(import.meta.url)

/** 그 표의 항목 하나. 세대별로 덮어쓴 값이 `gen4` 안에 따로 있다 */
type TextEntry = Record<string, unknown>

/** `moves` · `abilities` 글 표를 연다. 내보내는 이름은 `MovesText`처럼 파일마다 다르다 */
function textOf(name: 'moves' | 'abilities', key: string): Record<string, TextEntry> {
  const at = 'node_modules/@pkmn/sim/build/cjs/data/text/' + name + '.js'
  const mod = req(resolve(at)) as Record<string, Record<string, TextEntry>>
  return mod[key]!
}

/**
 * 쇼다운이 **걸림·풀림에 글을 붙여 둔** 4세대 효과.
 *
 * 쇼다운의 글이 원작의 글은 아니다. 다만 「원작이 여기서 뭔가 말한다」는 표시로는
 * 맞다 — 그 표를 만든 쪽이 각 세대의 실제 문장을 옮겨 적은 것이라서다
 */
function withStartEnd(
  text: Record<string, TextEntry>,
  exists: (id: string) => { exists: boolean; gen: number },
): string[] {
  const out: string[] = []
  for (const id of Object.keys(text)) {
    const d = exists(id)
    if (!d.exists || d.gen <= 0 || d.gen > 4) continue
    const e = text[id]!
    const g4 = e['gen4'] as Record<string, unknown> | undefined
    const has = (f: string) => (g4?.[f] ?? e[f]) !== undefined
    if (has('start') || has('end')) out.push(id)
  }
  return out.sort()
}

/** 진영에 깔리는 아홉. 나머지는 개체에 걸린다 */
const SIDE_IDS = new Set([
  'reflect', 'lightscreen', 'mist', 'safeguard', 'spikes',
  'toxicspikes', 'stealthrock', 'tailwind', 'luckychant',
])

const eff = (id: string, kind: EffectRef['kind']): EffectRef =>
  ({ id, kind, num: 1, name: id })

/**
 * 그 효과가 걸리거나 풀릴 때 화면이 하는 말.
 *
 * 자리·상대·수·기술을 **다 채워서** 묻는다 — 여기서 묻는 것은 「글이 있는가」다
 */
function say(id: string, kind: EffectRef['kind'], start: boolean): string | null {
  if (SIDE_IDS.has(id)) {
    return battleText({ kind: 'sidecondition', side: 'p1', effect: eff(id, 'move'), start }, ctx)
  }
  return battleText({
    kind: 'volatile',
    actor: MINE,
    effect: eff(id, kind),
    start,
    of: FOE,
    extra: { num: 3, move: 1, moveName: 'Tackle' },
  }, ctx)
}

describe('지속 효과 예순셋 (PARITY §2.25)', () => {
  const moves = withStartEnd(textOf('moves', 'MovesText'), (id) => gen4.moves.get(id))
  const abilities = withStartEnd(
    textOf('abilities', 'AbilitiesText'), (id) => gen4.abilities.get(id),
  )

  it('4세대에서 걸림·풀림에 글이 붙는 효과는 예순셋이다', () => {
    // 수가 바뀌면 sim 판이 올라가면서 표가 달라진 것이다. PARITY §2.25의 수와
    // 같아야 한다 — 문서의 수를 손으로 적어 두면 잊혀서 늙는다
    expect(moves.length, moves.join(' ')).toBe(57)
    expect(abilities.length, abilities.join(' ')).toBe(6)
  })

  withBank('롬의 글로 잰다', () => {
    it('걸릴 때 말 안 하는 것은 여섯이고 여섯 다 까닭이 있다', () => {
      const silent = [
        ...moves.filter((id) => say(id, 'move', true) === null),
        ...abilities.filter((id) => say(id, 'ability', true) === null),
      ]
      // ⚠️ **이 여섯은 비운 것이지 빠뜨린 것이 아니다.**
      //   perishsong  원작은 무대 전체 줄로 말한다 (`-fieldactivate`)
      //   protect     원작은 이번 턴 줄로 말한다 (`-singleturn`)
      //   roost       쇼다운이 타입 바뀐 것을 스스로 괄호로 적는 줄이다
      //   airlock·cloudnine·moldbreaker  4세대 뱅크에 줄이 없다 —
      //     「틀을 깬다」도 「날씨의 영향이 없어졌다」도 뒤 세대에 생긴 글이다
      expect(silent).toEqual([
        'perishsong', 'protect', 'roost', 'airlock', 'cloudnine', 'moldbreaker',
      ])
    })

    it('나머지 쉰일곱이 걸릴 때 말한다', () => {
      const said = [
        ...moves.map((id) => say(id, 'move', true)),
        ...abilities.map((id) => say(id, 'ability', true)),
      ].filter((line) => line !== null)
      expect(said).toHaveLength(57)
      // 빈칸이 남으면 화면에 제어 부호가 글자로 뜬다
      expect(said.filter((l) => l.includes('{'))).toEqual([])
    })

    it('풀리는 줄도 롬에서 온다', () => {
      const off = (id: string) => say(id, 'move', false)
      expect(off('substitute')).toBe('모부기의 분신은\n사라져 버렸다...')
      expect(off('encore')).toBe('모부기의\n앵콜 상태가 풀렸다!')
      expect(off('taunt')).toBe('모부기는\n리플렉터의 효과가 풀렸다!')
      expect(off('safeguard')).toBe('우리 편을 감싸던\n신비의 베일이 없어졌다!')
      // 롬에 풀리는 줄이 따로 없는 것은 조용하다
      expect(off('ingrain')).toBeNull()
    })

    it('진영은 우리 편과 상대가 다른 줄이다', () => {
      const side = (id: string, mine: boolean, start: boolean): BattleEvent => ({
        kind: 'sidecondition',
        side: (mine ? 'p1' : 'p2') as SideId,
        effect: eff(id, 'move'),
        start,
      })
      expect(battleText(side('reflect', true, true), ctx))
        .toBe('우리 편은 리플렉터로\n물리 공격에 강해졌다!')
      expect(battleText(side('reflect', false, true), ctx))
        .toBe('상대는 리플렉터로\n물리 공격에 강해졌다!')
      expect(battleText(side('spikes', true, true), ctx))
        .toBe('우리 편의 발밑에\n압정이 뿌려졌다!')
      expect(battleText(side('spikes', false, true), ctx))
        .toBe('상대의 발밑에\n압정이 뿌려졌다!')
      // 걷히는 줄은 롬도 두루 쓰는 한 줄로 말한다
      expect(battleText(side('reflect', true, false), ctx))
        .toBe('우리 편 리플렉터의\n효과가 떨어졌다!')
    })

    it('무대 전체는 트릭룸과 중력 둘이다', () => {
      const field = (id: string, start: boolean, of: Actor | null): BattleEvent =>
        ({ kind: 'fieldcondition', effect: eff(id, 'move'), start, of })
      expect(battleText(field('trickroom', true, FOE), ctx))
        .toBe('야생 팬텀은\n시공을 뒤틀었다!')
      expect(battleText(field('trickroom', false, FOE), ctx))
        .toBe('야생 팬텀은\n뒤틀린 시공을 원래대로 되돌렸다!')
      // ⚠️ **비튼 쪽을 못 받으면 문장을 비운다** — 롬 문장이 이름으로 시작한다
      expect(battleText(field('trickroom', true, null), ctx)).toBeNull()
      expect(battleText(field('gravity', true, null), ctx)).toBe('중력이 강해졌다!')
      // 중력은 풀릴 때 원작이 아무 말도 안 한다
      expect(battleText(field('gravity', false, null), ctx)).toBeNull()
    })
  })
})
