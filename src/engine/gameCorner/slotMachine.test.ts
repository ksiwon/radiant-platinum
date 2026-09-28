// 슬롯머신 — 표는 디컴프와, 규칙은 원작 상태 기계의 약속과 맞댄다 (PARITY §7.6)
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SLOT_BGM, SLOT_SOUND, SlotMachine, slotSetting, type SlotButton, type SlotMode, type SlotView,
} from './slotMachine'
import {
  BONUS_PAYOUT, BONUS_TABLE, CONTINUE_CHANCE, CONTINUE_DECAY, HIT_CHANCE, HIT_TABLE, MACHINE_SETTINGS,
  NOTICE_CHANCE, PAYOUT, PRE_BONUS_SMALL, PRE_BONUS_SMALL_CHANCE, RED_MOON_CHANCE, REELS, SlotSymbol,
  SURE_CONTINUE_CHANCE,
} from './slotTables'

/** 씨앗을 주면 늘 같은 수열 — 원작 LCRNG 모양 */
function lcrng(seed: number): () => number {
  let x = seed >>> 0
  return () => { x = (Math.imul(x, 1103515245) + 24691) >>> 0; return x >>> 16 }
}

/** 연출이 곧바로 끝나는 화면 */
function view(): SlotView & { modes: SlotMode[], sounds: number[], messages: number[] } {
  const modes: SlotMode[] = []
  const sounds: number[] = []
  const messages: number[] = []
  return {
    modes, sounds, messages,
    mode: (m) => { modes.push(m) },
    modeDone: () => true,
    flashLines: () => {},
    linesReady: () => true,
    endLines: () => {},
    sound: (s) => { sounds.push(s) },
    cry: () => {},
    music: () => {},
    message: (m) => { messages.push(m) },
    closeMessage: () => {},
    bonusFlash: () => {},
    bonusShow: () => {},
    streak: () => {},
    button: () => {},
    lines: () => {},
    attract: () => {},
    subFade: () => {},
    sevens: () => {},
  }
}

const none = { pressed: new Set<SlotButton>(), held: false }
/** 누름 차례 여섯 — Y 왼쪽 · B 가운데 · A 오른쪽 */
const ORDERS: readonly (readonly SlotButton[])[] = [
  ['y', 'b', 'a'], ['y', 'a', 'b'], ['b', 'y', 'a'], ['b', 'a', 'y'], ['a', 'y', 'b'], ['a', 'b', 'y'],
]
const press = (...b: SlotButton[]) => ({ pressed: new Set<SlotButton>(b), held: false })

/**
 * 한 판을 사람처럼 친다 — 넣고 · 당기고 · 기다렸다 차례로 멈추고 · 끝날 때까지.
 * 당긴 순간의 표식과 판정 직후의 줄을 돌려준다 — 끝나고 나면 상태 0이 둘 다 지운다
 */
function playOne(m: SlotMachine, order: readonly SlotButton[] = ['y', 'b', 'a'], gap = 3): { flags: number, lines: number } {
  for (let i = 0; i < 400 && m.state !== 1 && m.state !== 26 && m.state !== 44; i++) m.tick(none)
  const from = m.state
  m.tick(press('x'))
  m.tick(press('down'))
  const flags = m.flags
  let lines = -1
  for (let i = 0; i < 20; i++) m.tick(none)
  for (const b of order) {
    m.tick(press(b))
    for (let i = 0; i < gap; i++) m.tick(none)
  }
  for (let i = 0; i < 600 && m.state !== from && !m.finished; i++) {
    if (m.state === 62) m.tick(press('a'))
    else m.tick(none)
    // 판정 상태(7 · 32 · 50)를 지나면 줄이 적혀 있다
    const judge = from === 1 ? 7 : from === 26 ? 32 : 50
    if (lines < 0 && m.state > judge && m.state !== 62) lines = m.lines
    if ([1, 26, 44].includes(m.state)) break
  }
  return { flags, lines }
}

describe('원작 표', () => {
  const SRC = 'raw/decomp/src/overlay101/ov101_021D94D8.c'
  it.runIf(existsSync(SRC))('릴 셋과 코인 표가 디컴프와 같다', () => {
    const src = readFileSync(SRC, 'utf8')
    const block = (name: string): number[] => {
      const at = src.indexOf(`${name}[`)
      const open = src.indexOf('{', at)
      let depth = 0, end = open
      for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++
        if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
      }
      return [...src.slice(open, end).matchAll(/0x[0-9A-Fa-f]+|\b\d+\b/g)].map((x) => Number(x[0]))
    }
    expect(block('Unk_ov101_021D9688')).toEqual(REELS.flat())
    expect(block('Unk_ov101_021D9550')).toEqual([...PAYOUT])
    expect(block('Unk_ov101_021D94F0')).toEqual([...BONUS_PAYOUT])
    expect(block('Unk_ov101_021D9520')).toEqual([...HIT_CHANCE])
    expect(block('Unk_ov101_021D94D8')).toEqual([...NOTICE_CHANCE])
    // 누적 표 — 원작은 {체리+보너스, 체리} {15+, 15} {10+, 10} {리플레이+, 나머지}
    expect(block('Unk_ov101_021D95C8')).toEqual(HIT_TABLE.flatMap((r) => [...r, r[6]!]).map((v, i) =>
      (i % 8 === 7 ? block('Unk_ov101_021D95C8')[i]! : v)))
    expect(block('Unk_ov101_021D9568')).toEqual([...CONTINUE_CHANCE])
    expect(block('Unk_ov101_021D9538')).toEqual([...PRE_BONUS_SMALL_CHANCE])
    expect(block('Unk_ov101_021D9628').slice(0, 4)).toEqual([...PRE_BONUS_SMALL])
    expect(block('Unk_ov101_021D9580')).toEqual([...SURE_CONTINUE_CHANCE])
    expect(block('Unk_ov101_021D9508')).toEqual([...RED_MOON_CHANCE])
    expect(block('Unk_ov101_021D9598')).toEqual(CONTINUE_DECAY.flat())
    // 보너스 표는 무게만 숫자다 — 종류와 갈래는 열거 이름이라 차례로 맞댄다
    const weights = [...src.slice(src.indexOf('Unk_ov101_021D9934['), src.indexOf('Unk_ov101_021D9568'))
      .matchAll(/\{ 0x([0-9A-F]+), UnkEnum_ov101_021D9934_0(\d), UnkEnum_ov101_021D9934_1_0(\d) \}/g)]
      .map((x) => [Number(`0x${x[1]!}`), Number(x[2]), Number(x[3])])
    expect(weights).toEqual(BONUS_TABLE.flat().map((e) => [...e]))
  })

  it.runIf(existsSync('public/data/sound/index.json'))('소리 번호가 이름표와 같다', () => {
    const songs = (JSON.parse(readFileSync('public/data/sound/index.json', 'utf8')) as { songs: ({ name: string } | null)[] }).songs
    const id = (name: string) => songs.findIndex((s) => s?.name === name)
    expect(SLOT_SOUND).toEqual({
      bet: id('SEQ_SE_DP_ZUKAN02'), spin: id('SEQ_SE_DP_OPEN2'), stop: id('SEQ_SE_DP_UG_022'),
      bonusStop: id('SEQ_SE_DP_SELECT_SLOT'), coin: id('SEQ_SE_DP_DENSI16'), flash: id('SEQ_SE_DP_025'),
    })
    expect(SLOT_BGM).toEqual({ preBonus: id('SEQ_SLOT_ATARI'), bonus: id('SEQ_SLOT_OOATARI') })
  })
})

describe('기계 열두 대의 설정 (`sub_0203E484`)', () => {
  it('섞어도 기본 열두 값의 짝은 그대로다 · 같은 날이면 같은 판이다', () => {
    for (const seed of [0, 1, 12345, 0xdeadbeef]) {
      const got = Array.from({ length: 12 }, (_, i) => slotSetting(seed, i))
      expect([...got].sort()).toEqual([...MACHINE_SETTINGS].sort())
      expect(Array.from({ length: 12 }, (_, i) => slotSetting(seed, i))).toEqual(got)
    }
    expect(slotSetting(1, 0)).not.toBeUndefined()
  })
})

describe('판', () => {
  it('코인 셋을 넣고 당기면 돌고, 셋 다 멈추면 판정한다', () => {
    const v = view()
    const m = new SlotMachine(100, 0, lcrng(7), v)
    m.tick(none)
    expect(m.state).toBe(1)
    m.tick(press('x'))
    expect(m.coins).toBe(97)
    expect(v.sounds).toContain(SLOT_SOUND.bet)
    m.tick(press('down'))
    expect(m.state).toBe(4)
    expect(v.sounds).toContain(SLOT_SOUND.spin)
  })

  it('당기기 전에 START면 코인을 돌려주고 나간다', () => {
    const m = new SlotMachine(10, 0, lcrng(1), view())
    m.tick(none); m.tick(press('x')); m.tick(press('start'))
    m.tick(none)
    expect(m.finished).toBe(true)
    expect(m.outcome().coins).toBe(10)
  })

  it('코인이 모자라면 원작 글을 띄우고 나간다 (셋 미만 0번 · 없음 2번)', () => {
    const two = view()
    const a = new SlotMachine(2, 0, lcrng(1), two)
    a.tick(none)
    expect(two.messages).toEqual([0])
    a.tick(press('a')); a.tick(none)
    expect(a.finished).toBe(true)
    const zero = view()
    new SlotMachine(0, 0, lcrng(1), zero).tick(none)
    expect(zero.messages).toEqual([2])
  })

  it('⚠️ 맞을 것이 없는 판은 어떻게 멈춰도 한 줄도 안 맞는다 (안 맞게 밀기)', () => {
    let played = 0
    for (let seed = 1; seed < 400 && played < 120; seed++) {
      const m = new SlotMachine(10000, 0, lcrng(seed), view())
      const got = playOne(m, ORDERS[seed % ORDERS.length]!, seed % 7)
      if (got.flags !== 0) continue
      played++
      expect(got.lines, `씨앗 ${String(seed)}`).toBe(0)
    }
    expect(played).toBeGreaterThan(50)
  })

  it('⚠️ 리플레이 · 10개는 차례대로 누르면 반드시 맞는다 (스물한 칸 확정)', () => {
    let seen = 0
    for (let seed = 1; seed < 3000 && seen < 40; seed++) {
      const m = new SlotMachine(10000, 5, lcrng(seed), view())
      // 판정 직전까지만 친다 — 결과를 보기 위해 7번 상태에서 멈춘다
      m.tick(none); m.tick(press('x')); m.tick(press('down'))
      if ((m.flags & 0b110011) === 0) continue
      for (let i = 0; i < 20; i++) m.tick(none)
      for (const b of ['y', 'b', 'a'] as SlotButton[]) { m.tick(press(b)); for (let i = 0; i < 2; i++) m.tick(none) }
      for (let i = 0; i < 100 && m.state < 7; i++) m.tick(none)
      seen++
      const want = m.flags & 0b11 ? SlotSymbol.REPLAY : SlotSymbol.TEN
      expect(m.lines, `씨앗 ${String(seed)}`).not.toBe(0)
      const rows = [[1, 1, 1], [2, 2, 2], [3, 3, 3], [1, 2, 3], [3, 2, 1]]
      const hit = rows.some((r) => [0, 1, 2].every((reel) => m.symbolAt(reel, r[reel]!) === want))
      expect(hit).toBe(true)
    }
    expect(seen).toBeGreaterThan(20)
  })

  it('이긴 코인은 네 프레임에 하나씩 오르고 X면 한꺼번에 들어온다', () => {
    for (let seed = 1; seed < 5000; seed++) {
      const m = new SlotMachine(1000, 5, lcrng(seed), view())
      playOne(m)
      if (m.state === 13 && m.payout > 1) {
        const before = m.coins
        m.tick(none); m.tick(none); m.tick(none); m.tick(none)
        expect(m.coins - before).toBeLessThanOrEqual(1)
        const rest = m.payout
        m.tick(press('x'))
        expect(m.coins).toBe(before + (m.coins - before))
        expect(m.payout).toBe(0)
        expect(rest).toBeGreaterThan(0)
        return
      }
    }
  })
})

describe('보너스', () => {
  it('보너스 비트가 서면 「세븐을 맞춰라」로 가고, 세븐이 맞으면 삐삐 보너스 열다섯 번이 돈다', () => {
    for (let seed = 1; seed < 20000; seed++) {
      const m = new SlotMachine(5000, 5, lcrng(seed), view())
      for (let spin = 0; spin < 30 && m.state < 25; spin++) playOne(m)
      if (m.state < 25) continue
      expect([25, 26, 28, 29, 30]).toContain(m.state)
      // 세븐이 맞을 때까지 사람처럼 — 끌기가 네 칸이라 여러 번 걸린다
      for (let spin = 0; spin < 400 && m.state < 41 && !m.finished; spin++) playOne(m, ['y', 'b', 'a'], spin % 5)
      if (m.state < 41) continue
      for (let i = 0; i < 50 && m.state !== 44; i++) m.tick(none)
      expect(m.inBonus).toBe(true)
      expect(m.streak).toBe(1)
      expect(m.spinsLeft).toBe(15)
      return
    }
    expect.unreachable('보너스까지 가는 판이 없었다')
  })
})
