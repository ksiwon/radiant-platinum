// 체력판이 그리는 것의 규칙 (battlehud §6 「새 테스트」) — 공 모양 · 도감 공 · EXP · 변화 줄 · 날씨 띠 ·
// 판 테두리의 모양 · 명령 구역 높이.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HUD } from '../theme/scale'
import type { ViewMon } from '../../engine/battle/view'
import { noBoosts } from '../../engine/battle/view'
import type { BattleNames } from './messages'
import {
  ballShape, changeItems, showsCaughtMark, showsExp, stripCells,
} from './hudShapes'

const read = (name: string): string => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const code = (name: string): string => read(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const mon = (over: Partial<ViewMon> = {}): ViewMon => ({
  slot: 'p1a', side: 'p1', key: 'p1-0', species: 387, speciesName: 'Turtwig', level: 11, gender: 'male', shiny: false,
  hp: 20, maxHp: 35, status: 'ok', boosts: noBoosts(), fainted: false, presence: 'alive', volatiles: new Set(),
  ...over,
})

const names = {
  species: [], moves: Object.assign([] as string[], { 73: '씨뿌리기', 164: '대타출동', 240: '비바라기', 241: '쾌청', 201: '모래바람', 258: '싸라기눈', 433: '트릭룸', 356: '중력' }),
  abilities: [], items: [],
  stats: ['HP', '공격', '방어', '스피드', '특수공격', '특수방어', '명중률', '회피율', '최대HP'],
  conditions: ['잠듦', '독', '화상', '마비', '얼음', '혼란', '헤롱헤롱'],
} as unknown as BattleNames

describe('공 줄은 모양으로 갈린다', () => {
  it('키가 없으면 빈 칸이다', () => {
    expect(ballShape(undefined, [], null)).toBe('empty')
  })

  it('재생기가 보여 준 기절만 회색 공이다 — 상태 이상보다 앞선다', () => {
    expect(ballShape('p1-2', ['p1-2'], 'psn')).toBe('fainted')
    expect(ballShape('p1-2', [], 'psn')).toBe('status')
    expect(ballShape('p1-2', [], null)).toBe('alive')
  })

  it('넷이 서로 다른 클래스다 (색이 아니라 모양)', () => {
    const css = read('battleScreen.css.ts')
    for (const shape of ['alive', 'status', 'fainted', 'empty']) expect(css).toContain(`${shape}:`)
    // 빈 칸은 점선 원이고, 상태 칸은 귀퉁이에 상태 색 점(::after)이 붙는다
    expect(css).toContain('dashed')
    expect(css).toContain("'::after'")
  })
})

describe('원작 규칙', () => {
  it('도감 공은 야생에만 뜬다 (healthbox.c:664)', () => {
    expect(showsCaughtMark(false, true)).toBe(true)
    expect(showsCaughtMark(true, true)).toBe(false)
    expect(showsCaughtMark(false, false)).toBe(false)
  })

  it('EXP 줄은 내 단식 판에만 있다 (healthbox.c:643)', () => {
    expect(showsExp(true, false)).toBe(true)
    expect(showsExp(true, true)).toBe(false)
    expect(showsExp(false, false)).toBe(false)
  })

  it('사파리 판의 글은 시작 메뉴 뱅크 9 · 11번에서 온다', () => {
    const screen = code('BattleScreen.tsx')
    expect(screen).toContain('START_MENU.safariBalls')
    expect(screen).toContain('START_MENU.ballStock')
  })
})

describe('변화 줄', () => {
  it('없으면 빈 배열이다 — 줄을 안 그린다', () => {
    expect(changeItems(mon(), names)).toEqual([])
    expect(changeItems(mon(), null)).toEqual([])
  })

  it('능력 변화는 롬 랭크 이름과 방향 · 크기다', () => {
    const items = changeItems(mon({ boosts: { ...noBoosts(), atk: 2, accuracy: -1 } }), names)
    expect(items.map((i) => [i.text, i.dir, i.amount])).toEqual([['공격', 'up', 2], ['명중률', 'down', 1]])
  })

  it('혼란 · 씨뿌리기 · 대타는 이름만이다', () => {
    const items = changeItems(mon({ volatiles: new Set(['confusion', 'leechseed', 'substitute']) }), names)
    expect(items.map((i) => [i.text, i.dir])).toEqual([['혼란', null], ['씨뿌리기', null], ['대타출동', null]])
  })

  it('이름표가 없는 칸은 건너뛴다 — 지어낸 글로 채우지 않는다', () => {
    const bare = { ...names, stats: [], conditions: undefined, moves: [] } as unknown as BattleNames
    expect(changeItems(mon({ boosts: { ...noBoosts(), atk: 1 }, volatiles: new Set(['confusion']) }), bare)).toEqual([])
  })
})

describe('날씨 · 필드 띠', () => {
  it('날씨와 필드가 없으면 칸이 없다 — 띠를 안 그린다', () => {
    expect(stripCells(null, new Set(), names.moves)).toEqual([])
  })

  it('이름은 기술 이름이다', () => {
    expect(stripCells('RainDance', new Set(), names.moves).map((c) => c.text)).toEqual(['비바라기'])
    expect(stripCells('SunnyDay', new Set(), names.moves).map((c) => c.text)).toEqual(['쾌청'])
    expect(stripCells('Sandstorm', new Set(), names.moves).map((c) => c.text)).toEqual(['모래바람'])
    expect(stripCells('Hail', new Set(), names.moves).map((c) => c.text)).toEqual(['싸라기눈'])
    expect(stripCells(null, new Set(['trickroom', 'gravity']), names.moves).map((c) => c.text)).toEqual(['트릭룸', '중력'])
  })

  it('이름표가 안 왔으면 칸을 안 만든다', () => {
    expect(stripCells('RainDance', new Set(['gravity']), [])).toEqual([])
  })
})

describe('판 테두리는 사다리꼴을 따라 돈다 (DECISIONS 사용자 지적 ⑤)', () => {
  const css = read('battleScreen.css.ts')

  it('바깥 판은 테두리 색으로 사다리꼴 전체를, 안쪽 판(::before)은 줄인 사다리꼴로 몸통을 칠한다', () => {
    const foe = css.slice(css.indexOf('export const cardFoe'), css.indexOf('export const cardMine'))
    // 두 겹 clip-path — 바깥은 판 자체, 안쪽은 ::before
    expect(foe.match(/clipPath/g)?.length).toBe(2)
    expect(foe).toContain("'&::before'")
    const mine = css.slice(css.indexOf('export const cardMine'), css.indexOf('export const cardTall'))
    expect(mine.match(/clipPath/g)?.length).toBe(2)
  })

  it('네모 border를 잘라 쓰지 않는다 — 테두리는 바깥 판의 배경색이다', () => {
    const card = css.slice(css.indexOf('export const card = '), css.indexOf('export const cardFoe'))
    expect(card).toContain('var(--rim')
    expect(card).not.toMatch(/\bborder:/)
  })

  it('몸통은 흰 줄무늬(WINDOW)가 아니라 판 색 그러데이션이다', () => {
    const card = css.slice(css.indexOf('export const card = '), css.indexOf('export const cardFoe'))
    expect(card).toContain('PLATE_BODY')
    expect(card).not.toContain('...WINDOW')
    expect(css).not.toContain('repeating-linear-gradient')
  })

  it('묻는 판과 겨눈 판은 --rim만 금으로 바꾼다 — 테두리가 모양을 그대로 따른다', () => {
    expect(css).toMatch(/export const asking = style\(\{\s*vars: \{ '--rim': vars\.pick\.edge \}/)
    expect(css).toMatch(/export const aimed = style\(\{ vars: \{ '--rim': vars\.pick\.edge \} \}\)/)
  })

  it('cardFoe · cardMine은 판 뿌리 한 요소에만 붙는다 (변형은 asking · aimed · inward)', () => {
    const hud = code('HudPlates.tsx')
    expect(hud.match(/css\.cardFoe/g)?.length).toBe(1)
    expect(hud.match(/css\.cardMine/g)?.length).toBe(1)
  })
})

describe('명령 구역은 380×264 안에 든다 (4.16)', () => {
  const css = code('command.css.ts')
  const plate = (name: string): number => Number(new RegExp(`${name}: (\\d+)`).exec(css)?.[1])

  it('높이가 264로 고정이다', () => {
    expect(HUD.cmdHeight).toBe(264)
    expect(read('battleScreen.css.ts')).toContain("'--battle-cmd-h'")
    expect(css).toContain("height: 'var(--battle-cmd-h)'")
  })

  it('뿌리 — 싸운다 96 + 틈 8 + 한 줄 48 이 264 안이다', () => {
    expect(plate('hero') + 8 + plate('row')).toBeLessThanOrEqual(HUD.cmdHeight)
  })

  it('기술 단 — 판 56 × 4 + 틈 6 × 3 + 돌아간다 띠 22 = 264', () => {
    expect(plate('list') * 4 + 6 * 3 + 22).toBe(HUD.cmdHeight)
  })

  it('잊기 단 — 판 48 × 5 + 틈 6 × 4 = 264', () => {
    expect(plate('slim') * 5 + 6 * 4).toBe(HUD.cmdHeight)
  })

  it('두 칸 물음 — 판 56 × 2 + 틈 6이 안이다', () => {
    expect(plate('list') * 2 + 6).toBeLessThanOrEqual(HUD.cmdHeight)
  })

  it('사파리 — 세로 네 판 56 × 4 + 6 × 3 = 242가 안이다', () => {
    expect(plate('list') * 4 + 6 * 3).toBeLessThanOrEqual(HUD.cmdHeight)
  })

  it('내 판은 명령 구역 위 12px에 박힌다 — 단이 바뀌어도 안 움직인다', () => {
    const hud = read('battleScreen.css.ts')
    expect(hud).toContain('bottom: CMD_BOTTOM + HUD.cmdHeight + PLATE_GAP')
    expect(hud).toMatch(/const PLATE_GAP = 12/)
  })
})

describe('명령 칸의 하네스 계약', () => {
  it('판은 button이고 PP 꼴은 기술 칸(PpTail)과 잊기 칸만 갖는다', () => {
    const area = code('CommandArea.tsx')
    expect(area.match(/<PpTail/g)?.length).toBe(1)
    const learn = code('LearnMove.tsx')
    expect(learn.match(/<PpTail/g)?.length).toBe(1)
  })

  it('빈 칸은 div다 (button이 아니다)', () => {
    const button = code('CommandButton.tsx')
    expect(button).toMatch(/export function EmptyPlate/)
    expect(button.slice(button.indexOf('export function EmptyPlate'))).not.toContain('<button')
  })

  it('타입 그림은 DOM에서 이름 뒤에 선다 — 대체 글자가 이름보다 앞서지 않는다', () => {
    const button = code('CommandButton.tsx')
    expect(button.indexOf('css.labelCol')).toBeLessThan(button.indexOf('css.lead'))
  })

  it('보이는 차례는 싸운다 → 가방 → 포켓몬 → 도망이다', () => {
    const area = code('CommandArea.tsx')
    const at = (m: string): number => area.indexOf(m)
    expect(at('MSG.fight')).toBeLessThan(at('MSG.bag'))
    expect(at('MSG.bag')).toBeLessThan(at('MSG.pokemon'))
    expect(at('MSG.pokemon')).toBeLessThan(at('MSG.run'))
  })
})
