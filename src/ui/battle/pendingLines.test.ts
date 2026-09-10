// 아직 글이 없는 지속 효과를 **센다** (PARITY §2.25).
//
// §2.24를 닫으면서 옆자리가 더 크다는 것이 드러났다. `-start`·`-end`·
// `-sidestart`·`-fieldstart`는 **모양이 이미 있어서** 「아직 모양 안 준 명령」
// 목록에 안 잡히는데, `battleText`에는 그 갈래가 아예 없다 — 씨뿌리기가 걸려도
// 대타가 나타나도 도발에 넘어가도 리플렉터가 깔려도 화면이 한 마디도 안 한다.
//
// 이 파일은 **고치는 파일이 아니라 재는 파일이다.** 모양이 있는데 글이 없는
// 자리는 눈으로는 안 보이므로(빨간 줄이 안 난다) 수를 못박아 둔다. 글을 하나
// 놓으면 여기가 떨어지고, 그때 PARITY의 수도 같이 고치게 된다.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { Dex } from '@pkmn/sim'
import type { BattleEvent, SideId } from '../../engine/battle/events'
import { battleText, type TextContext } from './messages'

const ctx: TextContext = {
  names: { species: [], moves: [], abilities: [], items: [] },
  label: (a) => (a.side === 'p1' ? '모부기' : '야생의 팬텀'),
}
const MINE = { slot: 'p1a', side: 'p1' as SideId, name: 'p1-0' } as const

const gen4 = Dex.forGen(4)

// ⚠️ **묶음의 하위 경로가 안 열려 있다.** 글 표는 `@pkmn/sim`이 `exports`로
// 내보내는 자리가 아니라 빌드 산출물 안에 있다. 시험이니 파일로 직접 연다
const req = createRequire(import.meta.url)

/** 그 표의 항목 하나. 세대별로 덮어쓴 값이 `gen4` 안에 따로 있다 */
type TextEntry = Record<string, unknown>

/** `moves` · `abilities` 글 표를 연다. 내보내는 이름은 `MovesText`처럼 파일마다 다르다 */
function textOf(name: 'moves' | 'abilities', key: string): Record<string, TextEntry> {
  const mod = req(resolve(`node_modules/@pkmn/sim/build/cjs/data/text/${name}.js`)) as
    Record<string, Record<string, TextEntry>>
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

describe('아직 글이 없는 지속 효과 (PARITY §2.25)', () => {
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

  it('그 예순셋이 화면에서 한 마디도 안 한다', () => {
    // ⚠️ **이 단언이 떨어지면 고친 것이다.** 글을 놓았으면 여기서 빼고
    // PARITY §2.25의 수를 줄인다 — 그러라고 있는 검사다
    const said = moves
      .map((id): [string, string | null] => [id, battleText(
        { kind: 'volatile', actor: MINE, volatile: id, start: true } as BattleEvent, ctx,
      )])
      .filter(([, line]) => line !== null)
    expect(said.map(([id]) => id)).toEqual([])
  })

  it('진영 효과와 필드 효과도 마찬가지다', () => {
    // 리플렉터·빛의장막·압정뿌리기·스텔스록·신비의부적·순풍·행운의부적,
    // 그리고 트릭룸·중력
    const side = (condition: string, start: boolean): BattleEvent =>
      ({ kind: 'sidecondition', side: 'p1', condition, start })
    const field = (condition: string, start: boolean): BattleEvent =>
      ({ kind: 'fieldcondition', condition, start })
    for (const c of ['reflect', 'lightscreen', 'spikes', 'stealthrock', 'toxicspikes',
      'safeguard', 'tailwind', 'luckychant']) {
      expect(battleText(side(c, true), ctx), c).toBeNull()
      expect(battleText(side(c, false), ctx), c).toBeNull()
    }
    for (const c of ['trickroom', 'gravity']) {
      expect(battleText(field(c, true), ctx), c).toBeNull()
      expect(battleText(field(c, false), ctx), c).toBeNull()
    }
  })
})
