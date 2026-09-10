// 글만 내는 열둘 — 줄 하나가 이벤트 하나로 정확히 접히는가 (PARITY §2.24).
//
// ⚠️ **`protocol.test.ts`와 갈라 둔다.** 그쪽은 실전 배틀을 굴려 뷰를 대조하느라
// `fixtures.testkit`을 거쳐 **롬 추출물**(`public/data`)을 읽는다. 이 파일은
// 줄 하나를 손으로 넣고 나온 모양만 보므로 추출물이 없는 기계에서도 돈다 —
// 파싱이 틀린 것과 자료가 없는 것이 같은 빨강으로 보이면 안 된다.
//
// **그리고 "그 줄을 내는 자리가 4세대에 몇인가"를 sim에게 직접 묻는다.** 문구
// 표가 빠짐없는지를 눈으로 세면 sim 판이 올라갈 때 조용히 어긋난다.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { Dex } from '@pkmn/sim'
import { parseLine } from './protocol'

const ME = '|p1a: 모부기'
const FOE = '|p2a: 팬텀'

/** 줄 하나 → 이벤트. 배틀과 무관한 줄이면 null */
const one = (line: string) => parseLine(line)

describe('글만 내는 열둘', () => {
  it('`-activate`는 효과와 `[of]`를 나눠 든다', () => {
    const e = one(`|-activate${FOE}|move: Trick|[of] p1a: 모부기`)
    expect(e).toMatchObject({
      kind: 'activate',
      actor: { slot: 'p2a', side: 'p2' },
      effect: { id: 'trick', kind: 'move', name: 'Trick' },
      of: { slot: 'p1a', side: 'p1' },
    })
  })

  it('붙어 오는 값을 자리가 아니라 이름으로 읽는다', () => {
    // ⚠️ **자리로 읽으면 조용히 틀린다.** `@pkmn/protocol`이 `-activate`의 넷째
    // 자리를 `[of]`로 못 박으면서 매그니튜드의 수를 `[number]`로 옮긴다
    expect(one(`|-activate${ME}|move: Magnitude|7`))
      .toMatchObject({ kind: 'activate', extra: { num: 7 } })
    // 스케치가 베낀 기술은 `[move]`가 되고, 번호까지 여기서 풀린다
    expect(one(`|-activate${ME}|move: Sketch|Tackle`))
      .toMatchObject({ kind: 'activate', extra: { moveName: 'Tackle', move: 33 } })
  })

  it('접두사가 있든 없든 같은 효과로 접힌다', () => {
    // 방어는 **쓸 때**와 **막을 때**의 줄이 서로 다른 꼴로 온다. 접두사로 가르면
    // 문구 표를 두 벌 적게 되고, sim 판이 바뀌면 한쪽만 살아남는다
    const used = one(`|-singleturn${ME}|Protect`)
    const blocked = one(`|-activate${ME}|move: Protect`)
    expect(used).toMatchObject({ kind: 'singleturn', effect: { id: 'protect', kind: 'other' } })
    // ⚠️ **sim이 낸 `-activate`가 `-block`으로 도착한다.** `@pkmn/protocol`이
    // 여섯을 다시 쓴다 — 그래서 갈래는 둘이어도 문구 표는 하나여야 한다
    expect(blocked).toMatchObject({ kind: 'block', effect: { id: 'protect', kind: 'move' } })
  })

  it('튀어오르기는 자리가 빈 채로 온다', () => {
    // sim은 `-nothing`을 내고 `@pkmn/protocol`이 `|-activate||move: Splash`로
    // 다시 쓴다. 자리가 없다고 버리면 원작의 「아무 일도 일어나지 않았다」가 죽는다
    expect(one('|-nothing')).toMatchObject({
      kind: 'activate', actor: null, effect: { id: 'splash' },
    })
  })

  it('`-prepare`는 기술 이름과 대상을 든다', () => {
    expect(one(`|-prepare${ME}|Fly${FOE}`)).toMatchObject({
      kind: 'prepare',
      actor: { slot: 'p1a' },
      moveName: 'Fly',
      target: { slot: 'p2a' },
    })
    // 대상 자리가 없는 줄도 있다 — 없다고 버리면 날아오르기가 조용해진다
    expect(one(`|-prepare${ME}|Solar Beam`)).toMatchObject({ kind: 'prepare', target: null })
  })

  it('수를 드는 줄과 자리가 없는 줄', () => {
    expect(one(`|-hitcount${FOE}|3`)).toMatchObject({ kind: 'hitcount', count: 3 })
    expect(one(`|-notarget${FOE}`)).toMatchObject({ kind: 'notarget' })
    // 일격필살은 자리 인자가 아예 없다
    expect(one('|-ohko|')).toEqual({ kind: 'ohko' })
    // 무대 전체의 줄이라 자리가 0번이 아니라 효과다
    expect(one('|-fieldactivate|move: Perish Song'))
      .toMatchObject({ kind: 'fieldactivate', effect: { id: 'perishsong' } })
  })

  it('`-cureteam`은 `[from]`을 든다', () => {
    expect(one(`|-cureteam${ME}|[from] move: Aromatherapy`)).toMatchObject({
      kind: 'cureteam',
      from: { kind: 'move', name: 'Aromatherapy' },
    })
  })

  it('특성이 없어진 줄과 다음 턴을 쉬는 줄', () => {
    expect(one(`|-endability${ME}`)).toMatchObject({ kind: 'endability', abilityName: '' })
    expect(one(`|-mustrecharge${ME}`)).toMatchObject({ kind: 'mustrecharge' })
  })

  it('`-hint`도 `other`로 안 흘린다', () => {
    // 원작에 없는 줄이라 글은 안 놓지만, `other`에 남기면 "아직 모양 없는 줄"
    // 목록이 이것 하나 때문에 영영 안 빈다
    expect(one('|-hint|Some effects can force a Pokemon to use Bide again.'))
      .toMatchObject({ kind: 'hint' })
  })

  it('망가진 줄은 `other`로 떨어진다', () => {
    // 효과 이름이 비면 접을 열쇠가 없다. 그때는 버리지 말고 `other`로 남긴다
    expect(one('|-activate|p1a: 모부기|')).toMatchObject({ kind: 'other', cmd: '-activate' })
    expect(one(`|-hitcount${FOE}|셋`)).toMatchObject({ kind: 'other', cmd: '-hitcount' })
  })
})

// ── 문구 표가 sim의 4세대 자리와 어긋나지 않는가 ────────────────────────────────
//
// `-prepare`를 내는 기술이 아홉이라는 것은 **세어서** 안 값이다. sim을 올렸을 때
// 열이 되면 `messages.ts`의 표에 구멍이 생기는데, 눈으로는 안 보인다.
describe('4세대에서 그 줄을 내는 자리', () => {
  const gen4 = Dex.forGen(4)

  /** sim 자료 파일에서 `add('<cmd>', …)`를 내는 항목 이름을 긁는다 */
  function emitters(cmd: string): string[] {
    const files = [
      'data/moves.js', 'data/abilities.js', 'data/items.js', 'data/conditions.js',
      'data/mods/gen4/moves.js', 'data/mods/gen4/abilities.js',
      'data/mods/gen4/items.js', 'data/mods/gen4/conditions.js',
    ]
    const found = new Set<string>()
    for (const rel of files) {
      const path = `node_modules/@pkmn/sim/build/cjs/${rel}`
      if (!existsSync(path)) continue
      let key = '?'
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const m = /^ {4}([a-z0-9]+): \{/.exec(line)
        if (m) key = m[1]!
        if (line.includes(`add('${cmd}'`)) found.add(key)
      }
    }
    return [...found]
  }

  /** 4세대에 실제로 있는 것만 남긴다 — `forGen(4)`는 뒤 세대를 안 걸러 낸다 */
  const inGen4 = (keys: string[]) => keys.filter((k) => {
    const d = gen4.moves.get(k)
    return d.exists && d.gen > 0 && d.gen <= 4
  }).sort()

  it('`-prepare`를 내는 4세대 기술은 아홉이고 전부 문구가 있다', () => {
    const moves = inGen4(emitters('-prepare'))
    expect(moves).toEqual([
      'bounce', 'dig', 'dive', 'fly', 'razorwind',
      'shadowforce', 'skullbash', 'skyattack', 'solarbeam',
    ])
  })

  it('`-fieldactivate`·`-cureteam`을 내는 4세대 기술', () => {
    // 치유방울은 같은 일을 하면서 `-activate`로 나간다 (`mods/gen4/moves.js`)
    expect(inGen4(emitters('-cureteam'))).toEqual(['aromatherapy'])
    expect(inGen4(emitters('-fieldactivate'))).toEqual(['payday', 'perishsong'])
  })
})
