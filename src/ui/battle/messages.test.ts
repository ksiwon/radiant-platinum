// 배틀 문구. 조사가 하나만 틀려도 화면에서 바로 보이는 종류의 버그라 문장을
// 통째로 못박는다 — 조각으로 검사하면 "찌르꼬이(가)"가 그대로 지나간다.
//
// ⚠️ **아래 절반은 롬의 글이다** (PARITY §2.24). 손으로 든 문장이 아니라
// `public/data/dialogue/ko/368.json`의 줄을 칸까지 채운 것이라, 자료가 없는
// 기계에서는 그 묶음이 통째로 빠진다 (`withData`).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect } from 'vitest'
import type {
  Actor, BattleEvent, BoostStat, Cause, EffectExtra, EffectRef, SafariBeat,
} from '../../engine/battle/events'
import type { Status } from '../../engine/pokemon/instance'
import { DATA, withData } from '../../data/romData.testkit'
import {
  ACTIVATE_IDS, battleText, SINGLE_MOVE_IDS, SINGLE_TURN_IDS,
  type BattleNames, type TextContext,
} from './messages'
import { BATTLE_BANK, MOVE_BANK, STAT_BANK } from './romText'

const MINE: Actor = { slot: 'p1a', side: 'p1', name: 'p1-0' }
const FOE: Actor = { slot: 'p2a', side: 'p2', name: 'p2-0' }

const bankAt = (at: string): readonly string[] => {
  try {
    return JSON.parse(readFileSync(resolve(DATA, at), 'utf8')) as string[]
  } catch {
    return []
  }
}

const names: BattleNames = {
  species: [], // 이름은 label이 이미 풀어 준다
  moves: (() => { const m: string[] = []; m[33] = '몸통박치기'; m[73] = '씨뿌리기'; m[201] = '모래바람'; return m })(),
  abilities: (() => { const a: string[] = []; a[22] = '위협'; return a })(),
  items: (() => { const i: string[] = []; i[23] = '회복약'; i[26] = '좋은상처약'; return i })(),
  // 랭크 이름은 롬에서 온다 — 자리가 곧 이름이다
  stats: [...bankAt('dialogue/ko/' + String(STAT_BANK) + '.json')],
}

const BANK_AT = 'dialogue/ko/' + String(BATTLE_BANK) + '.json'
const MOVE_AT = 'dialogue/ko/' + String(MOVE_BANK) + '.json'
const withBank = withData(BANK_AT)

/** 롬의 배틀 글. 자료가 없으면 빈 배열이고, 그 줄들은 통째로 조용해진다 */
const lines = bankAt(BANK_AT)
/** 기술을 쓰는 줄만 든 뱅크 */
const moveLines = bankAt(MOVE_AT)

/**
 * 받침이 있는 이름(팬텀)과 없는 이름(모부기)을 일부러 섞는다.
 *
 * ⚠️ **「야생의」가 아니라 「야생 」이다.** 롬의 배틀 글 1,269줄에 「야생의」는
 * 0건이고 「야생 」이 344건이다 — 이름표가 롬의 말을 써야 맨 줄 하나로 세 자리를
 * 다 덮을 수 있다
 */
const ctx: TextContext = {
  names,
  lines,
  moveLines,
  label: (a) => (a.side === 'p1' ? '모부기' : '야생 팬텀'),
  // 야생 등판 줄은 「야생 」이 **문장에 박혀 있어서** 맨 이름을 넣는다
  bare: () => '팬텀',
}

const say = (e: BattleEvent) => battleText(e, ctx)

const damage = (actor: Actor, from: Cause | null = null): BattleEvent =>
  ({ kind: 'damage', actor, condition: { hp: 10, maxHp: 40, status: 'ok' }, from })

withBank('배틀 문구', () => {
  it('등판', () => {
    const enter = (actor: Actor, forced: boolean): BattleEvent => ({
      kind: 'switch', actor, species: 387, speciesName: 'Turtwig', level: 5,
      gender: 'male', shiny: false, condition: { hp: 20, maxHp: 20, status: 'ok' }, forced,
    })
    // ⚠️ 손으로 들 때는 「가라!」였다. 원작은 「가랏!」이다
    expect(say(enter(MINE, false))).toBe('가랏! 모부기!')
    // 받침 있는 이름에는 "이"가 붙어야 한다
    expect(say(enter(FOE, false))).toBe('앗! 야생 팬텀이 튀어나왔다!')
    expect(say(enter(FOE, true))).toBe('야생 팬텀은 배틀에\n끌려 나왔다!')
  })

  it('기술 줄은 롬이 통째로 든다', () => {
    // ⚠️ **이름과 기술을 우리가 붙이지 않는다.** 롬의 `moves_used_in_battle`이
    // 기술마다 한 줄을 들고 있고, 우리는 이름 빈칸 하나만 채운다 —
    // **이름 뒤에서 줄이 바뀌는 것**도 원작 것이다
    expect(say({
      kind: 'move', actor: MINE, move: 33, moveName: 'Tackle', target: FOE, miss: false, from: null,
    })).toBe('모부기의\n몸통박치기!')
    expect(say({
      kind: 'move', actor: FOE, move: 467, moveName: 'Shadow Force', target: MINE,
      miss: false, from: null,
    })).toBe('야생 팬텀의\n섀도다이브!')
  })

  it('모르는 기술 번호면 영어 원문으로 떨어진다', () => {
    // 빈칸이 뜨는 것보다 영어가 낫다. 여기는 조사가 뒤에 안 붙는 자리라
    // 병기형(「Tackle을(를)」)이 날 데가 없다
    expect(say({
      kind: 'move', actor: MINE, move: null, moveName: 'Tackle', target: FOE, miss: false, from: null,
    })).toBe('모부기의 Tackle!')
  })

  it('상성·급소·실패', () => {
    expect(say({ kind: 'effectiveness', actor: FOE, level: 'super' })).toBe('효과가 굉장했다!')
    expect(say({ kind: 'effectiveness', actor: FOE, level: 'resisted' })).toBe('효과가 별로인 듯하다')
    expect(say({ kind: 'effectiveness', actor: FOE, level: 'immune' }))
      .toBe('야생 팬텀에게는\n효과가 없는 것 같다...')
    expect(say({ kind: 'crit', actor: FOE })).toBe('급소에 맞았다!')
    expect(say({ kind: 'fail', actor: MINE })).toBe('그러나 실패하고 말았다!')
    expect(say({ kind: 'faint', actor: FOE })).toBe('야생 팬텀은 쓰러졌다!')
    expect(say({ kind: 'faint', actor: MINE })).toBe('모부기는 쓰러졌다!')
  })

  it('상태이상 여섯 가지가 전부 문장을 갖는다', () => {
    const all: Exclude<Status, 'ok'>[] = ['slp', 'psn', 'tox', 'brn', 'frz', 'par']
    for (const status of all) {
      const onset = say({ kind: 'status', actor: MINE, status })
      expect(onset, `${status} 걸림`).toBeTruthy()
      expect(onset!.startsWith('모부기'), `${status}: ${onset}`).toBe(true)
      const cured = say({ kind: 'curestatus', actor: MINE, status })
      expect(cured, `${status} 나음`).toBeTruthy()
      // 조사 병기형이 새어 나오면 안 된다
      expect(cured!.includes('('), `${status}: ${cured}`).toBe(false)
    }
    expect(say({ kind: 'status', actor: MINE, status: 'par' }))
      .toBe('모부기는 마비되어\n기술이 나오기 어려워졌다!')
    // ⚠️ **나은 줄은 상태마다 다르다.** 손으로 들 때는 한 틀이었는데 원작은 저마다 말한다
    expect(say({ kind: 'curestatus', actor: MINE, status: 'par' }))
      .toBe('모부기의\n마비가 풀렸다!')
    expect(say({ kind: 'curestatus', actor: MINE, status: 'slp' }))
      .toBe('모부기는\n눈을 떴다!')
  })

  it('랭크 일곱 가지가 전부 문장을 갖고 조사가 갈린다', () => {
    const all: BoostStat[] = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']
    for (const stat of all) {
      const text = say({ kind: 'boost', actor: MINE, stat, amount: 1 })
      expect(text, stat).toBeTruthy()
      expect(text!.includes('('), `${stat}: ${text}`).toBe(false)
    }
    expect(say({ kind: 'boost', actor: MINE, stat: 'atk', amount: 1 }))
      .toBe('모부기의\n공격이 올라갔다!')
    // 방어는 받침이 없으므로 "가"
    expect(say({ kind: 'boost', actor: MINE, stat: 'def', amount: -1 }))
      .toBe('모부기의\n방어가 떨어졌다!')
    expect(say({ kind: 'boost', actor: MINE, stat: 'spe', amount: 2 }))
      .toBe('모부기의\n스피드가 크게 올라갔다!')
    expect(say({ kind: 'boost', actor: MINE, stat: 'atk', amount: -3 }))
      .toBe('모부기의\n공격이 크게 떨어졌다!')
  })

  it('못 움직인 이유', () => {
    expect(say({ kind: 'cant', actor: MINE, reason: 'par', move: null, moveName: '' }))
      .toBe('모부기는\n몸이 저려서 움직일 수 없다')
    expect(say({ kind: 'cant', actor: MINE, reason: 'flinch', move: null, moveName: '' }))
      .toBe('모부기는 풀이 죽어\n움직일 수 없었다!')
    // 도발은 **못 쓴 기술 이름**이 문장에 들어간다
    expect(say({
      kind: 'cant', actor: MINE, reason: 'move: Taunt', move: 33, moveName: 'Tackle',
    })).toBe('모부기는 도발당해서\n몸통박치기를 쓸 수 없다!')
    // ⚠️ **모르는 까닭은 조용하다.** 손으로 들 때는 「기술을 쓸 수 없다!」로
    // 때웠는데 그런 문장은 롬에 없다
    expect(say({ kind: 'cant', actor: MINE, reason: 'move: Imprison', move: null, moveName: '' }))
      .toBeNull()
  })

  it('기술 데미지는 말하지 않는다 — 바로 앞 줄이 이미 기술이다', () => {
    expect(say(damage(FOE))).toBeNull()
  })

  it('지속 데미지는 원인을 말한다', () => {
    expect(say(damage(MINE, { kind: 'status', id: null, name: 'psn' })))
      .toBe('모부기는\n독에 의한 데미지를 입고 있다!')
    expect(say(damage(MINE, { kind: 'status', id: null, name: 'brn' })))
      .toBe('모부기는\n화상 데미지를 입고 있다!')
    // 날씨는 **날씨 이름이 첫 칸**이다 — 롬은 그것도 기술 이름표에서 읽는다
    expect(say(damage(MINE, { kind: 'other', id: null, name: 'Sandstorm' })))
      .toBe('모래바람이 모부기를\n덮쳤다!')
    // 저만의 줄이 있는 기술은 그 줄로 간다
    expect(say(damage(MINE, { kind: 'move', id: 73, name: 'Leech Seed' })))
      .toBe('씨뿌리기가 모부기의\n체력을 빼앗는다!')
    // 없으면 두루 쓰는 줄이다
    expect(say(damage(MINE, { kind: 'move', id: 33, name: 'Tackle' })))
      .toBe('모부기는 몸통박치기의\n데미지를 입고 있다')
  })

  it('날씨는 시작·유지·그침을 저마다 다르게 말한다', () => {
    expect(say({ kind: 'weather', weather: 'Sandstorm', upkeep: false }))
      .toBe('모래바람이 불기 시작했다!')
    expect(say({ kind: 'weather', weather: 'Sandstorm', upkeep: true }))
      .toBe('모래바람이 세차게 분다')
    // 유지 줄은 매 턴 오므로 날씨가 없으면 아무 말도 안 한다
    expect(say({ kind: 'weather', weather: null, upkeep: true })).toBeNull()
  })

  it('그치는 줄은 그친 날씨를 알아야 나온다', () => {
    // `|-weather|none`은 무엇이 그쳤는지를 안 들고 온다. `buildBeats`가 직전
    // 뷰에서 읽어 `ended`로 실어 준 뒤라야 롬의 넷 중 하나를 고를 수 있다
    expect(say({ kind: 'weather', weather: null, upkeep: false })).toBeNull()
    expect(say({ kind: 'weather', weather: null, upkeep: false, ended: 'RainDance' }))
      .toBe('비가 그쳤다!')
    expect(say({ kind: 'weather', weather: null, upkeep: false, ended: 'Sandstorm' }))
      .toBe('모래바람이 가라앉았다!')
    expect(say({ kind: 'weather', weather: null, upkeep: false, ended: 'SunnyDay' }))
      .toBe('햇살이 약해졌다!')
    expect(say({ kind: 'weather', weather: null, upkeep: false, ended: 'Hail' }))
      .toBe('싸라기눈이 그쳤다!')
    // 모르는 이름이면 비운다 — 지어낸 문장을 놓느니 조용한 편이 낫다
    expect(say({ kind: 'weather', weather: null, upkeep: false, ended: 'Nothing' })).toBeNull()
  })

  it('특성 발동', () => {
    expect(say({ kind: 'ability', actor: FOE, ability: 22, abilityName: 'Intimidate' }))
      .toBe('야생 팬텀의 위협!')
  })

  it('문장이 없는 이벤트는 null이다', () => {
    // 텍스트 박스가 그냥 건너뛴다. 빈 줄이 쌓이면 안 된다
    expect(say({ kind: 'turn', turn: 3 })).toBeNull()
    expect(say({ kind: 'start' })).toBeNull()
    expect(say({ kind: 'other', cmd: '-hitcount', args: ['p2a: X', '3'] })).toBeNull()
  })
})

withBank('볼·도망·보상 — 프로토콜에 없는 사건들', () => {
  const ball = (shakes: number, caught: boolean): BattleEvent =>
    ({ kind: 'ball', actor: FOE, ball: 4, shakes, caught })

  it('잡히면 이름에 목적격 조사가 붙는다', () => {
    expect(say(ball(4, true))).toBe('신난다-!\n야생 팬텀을 붙잡았다!')
  })

  it('흔들린 횟수마다 말이 다르다', () => {
    // 롬은 863부터 넷을 차례로 들고 있다 — 자리가 곧 아까움의 크기다
    const texts = [0, 1, 2, 3].map((n) => say(ball(n, false)))
    expect(new Set(texts).size, '전부 같은 문장이면 흔들림을 세는 의미가 없다').toBe(4)
    expect(texts[0]).toBe('안돼! 포켓몬이\n볼에서 나와버렸다!')
    expect(texts[3]).toBe('아깝다!\n조금만 더하면 됐는데!')
  })

  it('도망', () => {
    expect(say({ kind: 'escape', success: true })).toBe('무사히 도망쳤다!')
    expect(say({ kind: 'escape', success: false })).toBe('도망칠 수 없다!')
  })

  it('경험치와 레벨업과 새 기술이 한 덩어리로 나온다', () => {
    const text = say({
      kind: 'reward', key: 'p1-0', exp: 160, levels: [6, 7], learned: [33], pending: [],
    })
    expect(text).toBe(
      '모부기는\n160 경험치를 얻었다!\n\n'
      + '모부기는\n레벨7로 올랐다!\n\n'
      + '모부기는\n몸통박치기를 배웠다!',
    )
  })

  it('칸이 차서 못 배운 기술은 다르게 말한다', () => {
    // "배웠다"와 "배우고 싶어 한다"가 같은 문장이면 플레이어가 뭘 해야 하는지 모른다
    const text = say({
      kind: 'reward', key: 'p1-0', exp: 10, levels: [7], learned: [], pending: [33],
    })
    expect(text).toContain('몸통박치기를 배우고 싶다')
    expect(text).not.toContain('배웠다')
  })

  it('레벨이 안 올랐으면 경험치 줄만 나온다', () => {
    expect(say({ kind: 'reward', key: 'p1-0', exp: 12, levels: [], learned: [], pending: [] }))
      .toBe('모부기는\n12 경험치를 얻었다!')
  })

  it('상금 줄', () => {
    // 롬은 주인공을 부르고 **원**으로 센다 — 「엔」은 우리가 적어 둔 것이었다
    expect(battleText({ kind: 'prize', money: 4920 }, { ...ctx, playerName: '빛나' }))
      .toBe('빛나는 상금으로\n4920원을 손에 넣었다!')
  })

  it('말을 안 들으면 갈래마다 다른 줄이 나온다 (PARITY §2.18)', () => {
    // 넷이 같은 문장이면 "왜 내 명령이 안 먹었는가"를 화면에서 알 길이 없다
    expect(say({ kind: 'disobey', actor: MINE, reason: 'otherMove' }))
      .toBe('모부기는 명령을 무시했다!')
    expect(say({ kind: 'disobey', actor: MINE, reason: 'ignoredAsleep' }))
      .toBe('모부기는 잠든 채로\n명령을 무시했다!')
    expect(say({ kind: 'disobey', actor: MINE, reason: 'nap' }))
      .toBe('모부기는 낮잠을 자기 시작했다!')
    expect(say({ kind: 'disobey', actor: MINE, reason: 'hitSelf' }))
      // 창이 둘이다 — 롬도 두 줄을 따로 띄운다. 빈 줄이 그 표시다
      .toBe('모부기는 말을 듣지 않는다!\n\n영문도 모른 채\n자신을 공격했다!')
  })

  it('아무것도 안 한 마디는 넷이고 서로 다르다', () => {
    const said = [0, 1, 2, 3].map((flavor) =>
      say({ kind: 'disobey', actor: MINE, reason: 'nothing', flavor }))
    expect(new Set(said).size).toBe(4)
    // 롬은 828부터 넷을 나란히 들고 있다 — 자리가 곧 뽑은 값이다
    expect(said[0]).toBe('모부기는 게으름을 피우고 있다!')
    expect(said[3]).toBe('모부기는 모른 체했다!')
  })
  it('사파리 일곱 마디 (PARITY §2.19)', () => {
    // ⚠️ **「먹느라 정신이 없다」가 이득 본 판이다.** 뒤집혀 있으면 화면만
    // 보고는 미끼가 좋은지 나쁜지를 영영 못 가린다
    const beat = (b: SafariBeat) =>
      say({ kind: 'safari', actor: FOE, beat: b })
    const me: TextContext = { ...ctx, playerName: '빛나' }
    expect(battleText({ kind: 'safari', actor: FOE, beat: 'bait' }, me))
      .toBe('빛나는\n팬텀에게 먹이를 던졌다!')
    expect(beat('eating')).toBe('팬텀은\n먹이를 먹고 있다!')
    expect(beat('busyEating')).toBe('팬텀은\n먹이를 먹는데 푹 빠졌다!')
    expect(battleText({ kind: 'safari', actor: FOE, beat: 'mud' }, me))
      .toBe('빛나는\n팬텀에게 진흙을 던졌다!')
    expect(beat('angry')).toBe('팬텀은\n화내고 있다!')
    expect(beat('veryAngry')).toBe('팬텀은\n분노로 이성을 잃었다!')
    expect(beat('watching')).toBe('팬텀은\n상황을 살피고 있다!')
  })
})

// ── 글만 내는 열둘 (PARITY §2.24) ─────────────────────────────────────────────
//
// 판마다 3.7줄이 여기로 흘러 화면이 조용했다.
//
// ⚠️ **이 아래는 롬의 글을 그대로 못박는다.** 손으로 든 문장이 아니라
// `public/data/dialogue/ko/368.json`의 줄이라, 여기 적힌 한국어는 **원작의
// 한국어**다. 번호가 어느 줄인지는 `romText.test.ts`가 따로 잰다 — 여기서 재는
// 것은 「그 줄이 칸까지 채워져 화면 문장이 되는가」다.

const NO_EXTRA: EffectExtra = { num: null, move: null, moveName: null }

/** `move: Protect` → 효과 하나. `sim/protocol`의 `effectRef`와 같은 모양이다 */
const eff = (id: string, kind: EffectRef['kind'] = 'move', num: number | null = null): EffectRef =>
  ({ id, kind, num, name: id })

const activate = (
  id: string,
  o: { actor?: Actor | null; of?: Actor | null; extra?: EffectExtra; kind?: EffectRef['kind'] } = {},
): BattleEvent => ({
  kind: 'activate',
  actor: o.actor === undefined ? MINE : o.actor,
  effect: eff(id, o.kind),
  of: o.of ?? null,
  extra: o.extra ?? NO_EXTRA,
})

withBank('롬의 배틀 글 (PARITY §2.24)', () => {
  it('방어는 쓰는 줄과 막는 줄이 다르다', () => {
    // 원작도 둘을 따로 찍는다. 하나로 합치면 "몸을 지켰다"가 쓰자마자 뜬다
    expect(say({ kind: 'singleturn', actor: MINE, effect: eff('protect', 'other'), of: null }))
      .toBe('모부기는\n방어 태세에 들어갔다!')
    expect(say(activate('protect'))).toBe('모부기는 공격으로부터\n몸을 지켰다!')
    // sim이 낸 `-activate`가 `-block`으로 도착해도 같은 문장이어야 한다
    expect(say({
      kind: 'block', actor: MINE, effect: eff('protect'), of: null, extra: NO_EXTRA,
    })).toBe('모부기는 공격으로부터\n몸을 지켰다!')
  })

  it('모으는 기술 아홉이 저마다 한 줄을 갖는다', () => {
    const prepare = (moveName: string): BattleEvent =>
      ({ kind: 'prepare', actor: FOE, move: null, moveName, target: MINE })
    expect(say(prepare('Fly'))).toBe('야생 팬텀은\n하늘 높이 날아올랐다!')
    expect(say(prepare('Solar Beam'))).toBe('야생 팬텀은\n빛을 흡수했다!')
    // 접기가 이름 그대로가 아니다 — 빈칸과 대소문자를 지우고 찾는다
    expect(say(prepare('Shadow Force'))).toBe('야생 팬텀의 모습이\n일순간에 사라졌다!')
    // ⚠️ 손으로 들 때는 「땅속으로 파고들었다!」였다. 롬은 앞에 한 마디가 더 있다
    expect(say(prepare('Dig'))).toBe('야생 팬텀은\n구멍을 파서 땅속에 파고들었다!')
    // 그리고 로케트박치기는 「머리」가 아니라 「목」이다
    expect(say(prepare('Skull Bash'))).toBe('야생 팬텀은\n목을 움츠렸다!')
    const nine = ['Fly', 'Dig', 'Dive', 'Bounce', 'Razor Wind', 'Skull Bash',
      'Sky Attack', 'Solar Beam', 'Shadow Force']
    const lines = nine.map((m) => say(prepare(m)))
    expect(lines.every((l) => l !== null)).toBe(true)
    // 아홉이 서로 다른 문장이어야 한다 — 같으면 무엇을 모으는지 화면에서 안 보인다
    expect(new Set(lines).size).toBe(9)
    // 모으는 기술이 아닌 것은 조용하다
    expect(say(prepare('Tackle'))).toBeNull()
  })

  it('수를 그대로 옮기는 줄', () => {
    expect(say({ kind: 'hitcount', actor: FOE, count: 3 })).toBe('3번 맞았다!')
    expect(say({ kind: 'hitcount', actor: FOE, count: 1 })).toBe('1번 맞았다!')
    expect(say({ kind: 'notarget', actor: FOE })).toBe('그러나 상대가 없으므로\n실패하고 말았다!')
    expect(say({ kind: 'ohko' })).toBe('일격필살!')
    // 매그니튜드는 굴린 수가 `[number]`로 온다. 못 받으면 조용하다.
    // ⚠️ 느낌표가 **둘**이다 — 손으로 들 때는 하나였다
    expect(say(activate('magnitude', { extra: { ...NO_EXTRA, num: 7 } })))
      .toBe('매그니튜드 7!!')
    expect(say(activate('magnitude'))).toBeNull()
  })

  it('자리가 비어 오는 줄도 문장이 된다', () => {
    // 튀어오르기는 `|-activate||move: Splash`로 온다 — 자리가 없다
    expect(say(activate('splash', { actor: null }))).toBe('그러나 아무 일도 일어나지 않았다')
    expect(say({ kind: 'fieldactivate', effect: eff('perishsong') }))
      .toBe('멸망의노래를 들은 포켓몬은\n3턴 후에 쓰러져 버린다!')
    expect(say({ kind: 'fieldactivate', effect: eff('payday') })).toBe('돈이 주위에 흩어졌다!')
  })

  it('[of]가 가리키는 쪽이 문장에 들어간다', () => {
    // 도우미는 **자리가 뒤집혀 있다** — 자리가 도움을 받는 쪽이고, 롬의 첫 칸은
    // 돕는 쪽이라 둘을 바꿔 넣는다
    expect(say({
      kind: 'singleturn', actor: MINE, effect: eff('helpinghand', 'other'), of: FOE,
    })).toBe('야생 팬텀은 모부기에게\n도우미가 되어주려 한다!')
    expect(say(activate('attract', { of: FOE })))
      .toBe('모부기는\n야생 팬텀에게 헤롱헤롱해 있다!')
    // 롬이 「…로/으로」를 부호로 고른다 — 모부기는 받침이 없으므로 「로」다
    expect(say(activate('lockon', { actor: FOE, of: MINE })))
      .toBe('야생 팬텀은 목표를\n모부기로 결정했다!')
  })

  it('베낀 기술은 한국어 이름으로 나온다', () => {
    expect(say(activate('sketch', { extra: { num: null, move: 33, moveName: 'Tackle' } })))
      .toBe('모부기는\n몸통박치기를 스케치했다!')
    // ⚠️ **번호를 못 찾으면 조용하다.** 다른 자리처럼 영어로 떨어뜨리면 뒤에
    // 조사가 붙어 「Tackle을(를) 스케치했다!」가 화면에 뜬다
    expect(say(activate('sketch', { extra: { num: null, move: null, moveName: 'Tackle' } })))
      .toBeNull()
    // 기술 이름을 아예 못 받아도 조용하다
    expect(say(activate('sketch'))).toBeNull()
  })

  it('파티 전체와 특성이 걷히는 줄', () => {
    expect(say({ kind: 'cureteam', actor: MINE, from: null })).toBe('기분 좋은 향기가 퍼졌다!')
    expect(say({ kind: 'endability', actor: FOE, ability: null, abilityName: '' }))
      .toBe('야생 팬텀은\n특성이 없어졌다!')
  })

  it('길동무는 거는 줄만 글이 있다', () => {
    expect(say({ kind: 'singlemove', actor: MINE, effect: eff('destinybond', 'other') }))
      .toBe('모부기는 상대를\n길동무로 삼으려 하고 있다')
    // ⚠️ **걸린 줄은 비어 있다.** 롬의 그 줄은 이름을 둘 부르는데
    // (「건 쪽는 끌려간 쪽를 길동무로 삼았다!」) sim은 -activate에 자리를 하나만
    // 준다 — 반쪽만 채운 문장을 놓느니 비운다
    expect(say(activate('destinybond'))).toBeNull()
  })

  it('표에 놓은 줄은 빈칸이 하나도 안 남는다', () => {
    // ⚠️ **빈칸이 남으면 화면에 제어 부호가 글자로 뜬다** — 실제로 그렇게 떴다.
    // 이름을 둘 다 주고 표를 통째로 돌려 여는 중괄호가 남는 줄이 없는지 본다
    const both = { of: FOE, extra: { num: 7, move: 33, moveName: 'Tackle' } }
    const lines: (readonly [string, string | null])[] = [
      ...ACTIVATE_IDS.map((id) => [id, say(activate(id, both))] as const),
      ...SINGLE_TURN_IDS.map((id) => [id, say({
        kind: 'singleturn', actor: MINE, effect: eff(id, 'other'), of: FOE,
      })] as const),
      ...SINGLE_MOVE_IDS.map((id) => [id, say({
        kind: 'singlemove', actor: MINE, effect: eff(id, 'other'),
      })] as const),
    ]
    // 표에 있는 것은 다 문장이 된다 — 자리가 모자라 못 놓는 길동무는 애초에
    // 표에 없다 (바로 위 시험이 그 자리가 비는 것을 따로 못박는다)
    expect(lines.filter(([, l]) => l === null).map(([id]) => id)).toEqual([])
    expect(lines.filter(([, l]) => l !== null && l.includes('{')).map(([id]) => id)).toEqual([])
  })

  it('글이 없는 효과는 조용하되 특성은 배너로 떨어진다', () => {
    // 원작은 특성이 일한 자리에서 특성 이름을 먼저 띄운다 — -ability 줄과 같은
    // 문장이라 지어낸 것이 아니다
    expect(say(activate('intimidate', { kind: 'ability' })))
      .toBe('모부기의 intimidate!')
    expect(say({
      kind: 'activate',
      actor: MINE,
      effect: { id: 'intimidate', kind: 'ability', num: 22, name: 'Intimidate' },
      of: null,
      extra: NO_EXTRA,
    })).toBe('모부기의 위협!')
    // 기술은 이렇게 못 한다 — "모부기의 추격!"은 기술을 **쓴** 줄의 문장이다
    expect(say(activate('pursuit'))).toBeNull()
    // ⚠️ 선제공격손톱은 **4세대 뱅크에 줄이 없다.** 「손톱」이 1,269줄에서 0건이다 —
    // 5세대 이후의 글이라 손으로 들 때 지어냈던 자리다. 이제 비운다
    expect(say(activate('quickclaw', { kind: 'item' }))).toBeNull()
  })

  it('원작에 없는 줄에는 글을 안 놓는다', () => {
    // 다음 턴에 「움직일 수 없다!」를 찍는 것은 cant의 recharge다
    expect(say({ kind: 'mustrecharge', actor: MINE })).toBeNull()
    expect(say({ kind: 'cant', actor: MINE, reason: 'recharge', move: null, moveName: '' })).toBe('공격의 반동으로\n모부기는 움직일 수 없다!')
    // 쇼다운이 사람에게 규칙을 설명하는 줄
    expect(say({ kind: 'hint', text: 'Some effects can force a Pokemon…' })).toBeNull()
  })
})

// ── 트레이너를 **두 칸으로** 받는 줄 (PARITY §2.24) ─────────────────────────
//
// 롬은 분류(「체육관 관장」)와 이름(「동관」)을 따로 받는다. 우리가 한동안
// 「체육관 관장 동관」으로 합쳐 들고 있어서 이 줄들만 손 글이었다.
withBank('트레이너 줄', () => {
  /** 분류와 이름을 가진 상대. 실제 트레이너전의 자리다 */
  const vs: TextContext = {
    ...ctx,
    label: (a) => (a.side === 'p1' ? '모부기' : '상대 팬텀'),
    foeName: '체육관 관장 동관',
    foeClass: '체육관 관장',
    foeTrainer: '동관',
  }
  /** 분류가 없는 상대 — 통신과 배틀팩토리가 이렇다 */
  const link: TextContext = { ...vs, foeClass: null, foeTrainer: null }

  const enter: BattleEvent = {
    kind: 'switch', actor: FOE, species: 94, speciesName: 'Gengar', level: 5,
    gender: 'male', shiny: false, condition: { hp: 20, maxHp: 20, status: 'ok' }, forced: false,
  }

  it('트레이너가 내보내면 「야생」이 아니다', () => {
    // ⚠️ **한동안 상대 쪽 교체가 전부 야생 줄로 떨어졌다** — 체육관 관장이
    // 내보내도 「앗! 야생 팬텀이 튀어나왔다!」가 떴다
    expect(battleText(enter, vs)).toBe('체육관 관장 동관은\n팬텀을 내보냈다!')
    // 분류가 없으면 이름 한 칸짜리 짝으로 떨어진다
    expect(battleText(enter, link)).toBe('체육관 관장 동관은\n팬텀을 내보냈다!')
    // 이름조차 없으면 야생 줄이다 (야생전이 그렇다)
    expect(battleText(enter, ctx)).toBe('앗! 야생 팬텀이 튀어나왔다!')
  })

  it('도구를 쓰면 분류와 이름이 갈려 들어간다', () => {
    const used: BattleEvent = { kind: 'trainerItem', key: 'p2-0', item: 26 }
    expect(battleText(used, vs)).toBe('체육관 관장 동관은\n좋은상처약을 썼다!')
    // ⚠️ **이 줄만은 이름 한 칸짜리 짝이 롬에 없다.** 그래서 우리 말로 떨어진다
    expect(battleText(used, link)).toBe('체육관 관장 동관은 좋은상처약을 썼다!')
  })

  it('시합규칙 교체는 물음까지 한 줄이다', () => {
    // 끝의 `{SCREEN 0}`이 예/아니오 창을 여는 부호다. 화면에는 안 남는다
    expect(battleText({ kind: 'shift', key: 'p2-0' }, vs))
      .toBe('체육관 관장 동관은\n팬텀을 내보내려 하고 있다\n포켓몬을 교체하시겠습니까?')
    expect(battleText({ kind: 'shift', key: 'p2-0' }, vs)).not.toContain('{')
  })

  it('비긴 판은 상대를 알 때만 롬 줄로 간다', () => {
    // ⚠️ **롬이 비긴 판을 말하는 자리는 통신뿐이다** — `LoadResultMessage`가
    // `BATTLE_RESULT_DRAW`를 통신에서만 읽어서 이름 칸이 하나다. 분류·이름
    // 두 칸짜리 짝(961)은 어느 스크립트도 안 가리키므로 안 쓴다
    expect(battleText({ kind: 'tie' }, vs)).toBe('체육관 관장 동관과의\n승부에서 비겼다!')
    expect(battleText({ kind: 'tie' }, link)).toBe('체육관 관장 동관과의\n승부에서 비겼다!')
    // 부를 이름이 없으면 우리 한 줄이다 — 야생전이 그렇다
    expect(battleText({ kind: 'tie' }, ctx)).toBe('무승부다!')
  })
})
