// 배틀 문구. 조사가 하나만 틀려도 화면에서 바로 보이는 종류의 버그라 문장을
// 통째로 못박는다 — 조각으로 검사하면 "찌르꼬이(가)"가 그대로 지나간다.
import { describe, it, expect } from 'vitest'
import type {
  Actor, BattleEvent, BoostStat, Cause, EffectExtra, EffectRef, SafariBeat,
} from '../../engine/battle/events'
import type { Status } from '../../engine/pokemon/instance'
import { battleText, type BattleNames, type TextContext } from './messages'

const MINE: Actor = { slot: 'p1a', side: 'p1', name: 'p1-0' }
const FOE: Actor = { slot: 'p2a', side: 'p2', name: 'p2-0' }

const names: BattleNames = {
  species: [], // 이름은 label이 이미 풀어 준다
  moves: (() => { const m: string[] = []; m[33] = '몸통박치기'; m[73] = '씨뿌리기'; return m })(),
  abilities: (() => { const a: string[] = []; a[22] = '위협'; return a })(),
  items: (() => { const i: string[] = []; i[23] = '회복약'; i[26] = '좋은상처약'; return i })(),
}

/** 받침이 있는 이름(팬텀)과 없는 이름(모부기)을 일부러 섞는다 */
const ctx: TextContext = {
  names,
  label: (a) => (a.side === 'p1' ? '모부기' : '야생의 팬텀'),
}

const say = (e: BattleEvent) => battleText(e, ctx)

const damage = (actor: Actor, from: Cause | null = null): BattleEvent =>
  ({ kind: 'damage', actor, condition: { hp: 10, maxHp: 40, status: 'ok' }, from })

describe('배틀 문구', () => {
  it('등판', () => {
    const enter = (actor: Actor, forced: boolean): BattleEvent => ({
      kind: 'switch', actor, species: 387, speciesName: 'Turtwig', level: 5,
      gender: 'male', shiny: false, condition: { hp: 20, maxHp: 20, status: 'ok' }, forced,
    })
    expect(say(enter(MINE, false))).toBe('가라! 모부기!')
    // 받침 있는 이름에는 "이"가 붙어야 한다
    expect(say(enter(FOE, false))).toBe('앗! 야생의 팬텀이 나타났다!')
    expect(say(enter(FOE, true))).toBe('야생의 팬텀이 끌려나왔다!')
  })

  it('기술은 한국어 이름으로 나온다', () => {
    expect(say({
      kind: 'move', actor: MINE, move: 33, moveName: 'Tackle', target: FOE, miss: false, from: null,
    })).toBe('모부기의 몸통박치기!')
  })

  it('모르는 기술 번호면 영어 원문으로 떨어진다', () => {
    // 빈칸이 뜨는 것보다 영어가 낫다
    expect(say({
      kind: 'move', actor: MINE, move: null, moveName: 'Tackle', target: FOE, miss: false, from: null,
    })).toBe('모부기의 Tackle!')
  })

  it('상성·급소·실패', () => {
    expect(say({ kind: 'effectiveness', actor: FOE, level: 'super' })).toBe('효과가 굉장했다!')
    expect(say({ kind: 'effectiveness', actor: FOE, level: 'resisted' })).toBe('효과가 별로인 것 같다…')
    expect(say({ kind: 'effectiveness', actor: FOE, level: 'immune' }))
      .toBe('야생의 팬텀에게는 효과가 없는 것 같다…')
    expect(say({ kind: 'crit', actor: FOE })).toBe('급소에 맞았다!')
    expect(say({ kind: 'fail', actor: MINE })).toBe('하지만 실패했다!')
    expect(say({ kind: 'faint', actor: FOE })).toBe('야생의 팬텀은 쓰러졌다!')
    expect(say({ kind: 'faint', actor: MINE })).toBe('모부기는 쓰러졌다!')
  })

  it('상태이상 여섯 가지가 전부 문장을 갖는다', () => {
    const all: Exclude<Status, 'ok'>[] = ['slp', 'psn', 'tox', 'brn', 'frz', 'par']
    for (const status of all) {
      const onset = say({ kind: 'status', actor: MINE, status })
      expect(onset, `${status} 걸림`).toBeTruthy()
      expect(onset!.startsWith('모부기는 '), `${status}: ${onset}`).toBe(true)
      const cured = say({ kind: 'curestatus', actor: MINE, status })
      expect(cured, `${status} 나음`).toBeTruthy()
      // 조사 병기형이 새어 나오면 안 된다
      expect(cured!.includes('('), `${status}: ${cured}`).toBe(false)
    }
    expect(say({ kind: 'status', actor: MINE, status: 'par' }))
      .toBe('모부기는 마비되어 기술이 나오기 어려워졌다!')
    expect(say({ kind: 'curestatus', actor: MINE, status: 'par' })).toBe('모부기의 마비가 나았다!')
    // 받침 없는 명사에는 "가"
    expect(say({ kind: 'curestatus', actor: MINE, status: 'slp' })).toBe('모부기의 잠이 나았다!')
  })

  it('랭크 일곱 가지가 전부 문장을 갖고 조사가 갈린다', () => {
    const all: BoostStat[] = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']
    for (const stat of all) {
      const text = say({ kind: 'boost', actor: MINE, stat, amount: 1 })
      expect(text, stat).toBeTruthy()
      expect(text!.includes('('), `${stat}: ${text}`).toBe(false)
    }
    expect(say({ kind: 'boost', actor: MINE, stat: 'atk', amount: 1 }))
      .toBe('모부기의 공격이 올라갔다!')
    // 방어는 받침이 없으므로 "가"
    expect(say({ kind: 'boost', actor: MINE, stat: 'def', amount: -1 }))
      .toBe('모부기의 방어가 떨어졌다!')
    expect(say({ kind: 'boost', actor: MINE, stat: 'spe', amount: 2 }))
      .toBe('모부기의 스피드가 쭉쭉 올라갔다!')
    expect(say({ kind: 'boost', actor: MINE, stat: 'atk', amount: -3 }))
      .toBe('모부기의 공격이 엄청나게 떨어졌다!')
  })

  it('못 움직인 이유', () => {
    expect(say({ kind: 'cant', actor: MINE, reason: 'par' }))
      .toBe('모부기는 몸이 저려서 움직일 수 없다!')
    expect(say({ kind: 'cant', actor: MINE, reason: 'flinch' }))
      .toBe('모부기는 풀이 죽어서 기술이 안 나왔다!')
    // 모르는 이유라도 문장은 나와야 한다
    expect(say({ kind: 'cant', actor: MINE, reason: 'move: Imprison' }))
      .toBe('모부기는 기술을 쓸 수 없다!')
  })

  it('기술 데미지는 말하지 않는다 — 바로 앞 줄이 이미 기술이다', () => {
    expect(say(damage(FOE))).toBeNull()
  })

  it('지속 데미지는 원인을 말한다', () => {
    expect(say(damage(MINE, { kind: 'status', id: null, name: 'psn' })))
      .toBe('모부기는 독으로 데미지를 입었다!')
    expect(say(damage(MINE, { kind: 'status', id: null, name: 'brn' })))
      .toBe('모부기는 화상으로 데미지를 입었다!')
    expect(say(damage(MINE, { kind: 'other', id: null, name: 'Sandstorm' })))
      .toBe('모부기는 모래바람에 시달리고 있다!')
    // 기술이 원인이면 한국어 이름으로
    expect(say(damage(MINE, { kind: 'move', id: 73, name: 'Leech Seed' })))
      .toBe('모부기는 씨뿌리기를 맞았다!')
  })

  it('날씨는 시작과 유지를 다르게 말한다', () => {
    expect(say({ kind: 'weather', weather: 'Sandstorm', upkeep: false }))
      .toBe('모래바람이 불기 시작했다!')
    expect(say({ kind: 'weather', weather: 'Sandstorm', upkeep: true }))
      .toBe('모래바람이 휘몰아친다!')
    // 유지 줄은 매 턴 오므로 날씨가 없으면 아무 말도 안 한다
    expect(say({ kind: 'weather', weather: null, upkeep: true })).toBeNull()
    expect(say({ kind: 'weather', weather: null, upkeep: false })).toBe('날씨가 원래대로 돌아왔다!')
  })

  it('특성 발동', () => {
    expect(say({ kind: 'ability', actor: FOE, ability: 22, abilityName: 'Intimidate' }))
      .toBe('야생의 팬텀의 위협!')
  })

  it('문장이 없는 이벤트는 null이다', () => {
    // 텍스트 박스가 그냥 건너뛴다. 빈 줄이 쌓이면 안 된다
    expect(say({ kind: 'turn', turn: 3 })).toBeNull()
    expect(say({ kind: 'start' })).toBeNull()
    expect(say({ kind: 'other', cmd: '-hitcount', args: ['p2a: X', '3'] })).toBeNull()
  })
})

describe('볼·도망·보상 — 프로토콜에 없는 사건들', () => {
  const ball = (shakes: number, caught: boolean): BattleEvent =>
    ({ kind: 'ball', actor: FOE, ball: 4, shakes, caught })

  it('잡히면 이름에 목적격 조사가 붙는다', () => {
    expect(say(ball(4, true))).toBe('신난다! 야생의 팬텀을 잡았다!')
  })

  it('흔들린 횟수마다 말이 다르다', () => {
    // 세 번 흔들리고 놓치는 것이 가장 아깝다. 원작도 그때만 "앗!"을 붙인다
    const texts = [0, 1, 2, 3].map((n) => say(ball(n, false)))
    expect(new Set(texts).size, '전부 같은 문장이면 흔들림을 세는 의미가 없다').toBe(4)
    expect(texts[1]).toBe('앗! 야생의 팬텀이 볼에서 나와 버렸다!')
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
      '모부기는 경험치를 160 얻었다!\n'
      + '모부기의 레벨이 올랐다! (Lv.7)\n'
      + '모부기는 새로 몸통박치기를 배웠다!',
    )
  })

  it('칸이 차서 못 배운 기술은 다르게 말한다', () => {
    // "배웠다"와 "배우고 싶어 한다"가 같은 문장이면 플레이어가 뭘 해야 하는지 모른다
    const text = say({
      kind: 'reward', key: 'p1-0', exp: 10, levels: [7], learned: [], pending: [33],
    })
    expect(text).toContain('모부기는 몸통박치기를 배우고 싶어 한다!')
    expect(text).not.toContain('배웠다')
  })

  it('레벨이 안 올랐으면 경험치 줄만 나온다', () => {
    expect(say({ kind: 'reward', key: 'p1-0', exp: 12, levels: [], learned: [], pending: [] }))
      .toBe('모부기는 경험치를 12 얻었다!')
  })

  it('상금 줄', () => {
    expect(say({ kind: 'prize', money: 4920 })).toBe('상금으로 4920엔을 받았다!')
  })

  it('말을 안 들으면 갈래마다 다른 줄이 나온다 (PARITY §2.18)', () => {
    // 넷이 같은 문장이면 "왜 내 명령이 안 먹었는가"를 화면에서 알 길이 없다
    expect(say({ kind: 'disobey', actor: MINE, reason: 'otherMove' }))
      .toBe('모부기는 명령을 무시했다!')
    expect(say({ kind: 'disobey', actor: MINE, reason: 'ignoredAsleep' }))
      .toBe('모부기는 자면서 명령을 무시했다!')
    expect(say({ kind: 'disobey', actor: MINE, reason: 'nap' }))
      .toBe('모부기는 꾸벅꾸벅 졸기 시작했다!')
    expect(say({ kind: 'disobey', actor: MINE, reason: 'hitSelf' }))
      .toBe('모부기는 말을 안 듣는다!\n혼란에 빠져 자신을 공격했다!')
  })

  it('아무것도 안 한 마디는 넷이고 서로 다르다', () => {
    const said = [0, 1, 2, 3].map((flavor) =>
      say({ kind: 'disobey', actor: MINE, reason: 'nothing', flavor }))
    expect(new Set(said).size).toBe(4)
    expect(said[0]).toBe('모부기는 빈둥거리고 있다!')
    expect(said[3]).toBe('모부기는 못 들은 척했다!')
  })
  it('사파리 일곱 마디 (PARITY §2.19)', () => {
    // ⚠️ **「먹느라 정신이 없다」가 이득 본 판이다.** 뒤집혀 있으면 화면만
    // 보고는 미끼가 좋은지 나쁜지를 영영 못 가린다
    const beat = (b: SafariBeat) =>
      say({ kind: 'safari', actor: FOE, beat: b })
    const me: TextContext = { ...ctx, playerName: '빛나' }
    expect(battleText({ kind: 'safari', actor: FOE, beat: 'bait' }, me))
      .toBe('빛나는 야생의 팬텀에게 미끼를 던졌다!')
    expect(beat('eating')).toBe('야생의 팬텀은 먹고 있다!')
    expect(beat('busyEating')).toBe('야생의 팬텀은 먹느라 정신이 없다!')
    expect(battleText({ kind: 'safari', actor: FOE, beat: 'mud' }, me))
      .toBe('빛나는 야생의 팬텀에게 진흙을 던졌다!')
    expect(beat('angry')).toBe('야생의 팬텀은 화가 났다!')
    expect(beat('veryAngry')).toBe('야생의 팬텀은 몹시 화가 났다!')
    expect(beat('watching')).toBe('야생의 팬텀은 주의깊게 보고 있다!')
  })
})

// ── 글만 내는 열둘 (PARITY §2.24) ─────────────────────────────────────────────
//
// 판마다 3.7줄이 여기로 흘러 화면이 조용했다. 문장을 통째로 못박는 이유는 위와
// 같다 — 조사 하나가 틀리면 조각 검사는 그대로 지나간다.

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

describe('글만 내는 열둘 (PARITY §2.24)', () => {
  it('방어는 쓰는 줄과 막는 줄이 다르다', () => {
    // 원작도 둘을 따로 찍는다. 하나로 합치면 "막았다"가 쓰자마자 뜬다
    expect(say({ kind: 'singleturn', actor: MINE, effect: eff('protect', 'other'), of: null }))
      .toBe('모부기는 방어 태세를 취했다!')
    expect(say(activate('protect'))).toBe('모부기는 공격을 막았다!')
    // sim이 낸 `-activate`가 `-block`으로 도착해도 같은 문장이어야 한다
    expect(say({
      kind: 'block', actor: MINE, effect: eff('protect'), of: null, extra: NO_EXTRA,
    })).toBe('모부기는 공격을 막았다!')
  })

  it('모으는 기술 아홉이 저마다 한 줄을 갖는다', () => {
    const prepare = (moveName: string): BattleEvent =>
      ({ kind: 'prepare', actor: FOE, move: null, moveName, target: MINE })
    expect(say(prepare('Fly'))).toBe('야생의 팬텀은 하늘 높이 날아올랐다!')
    expect(say(prepare('Solar Beam'))).toBe('야생의 팬텀은 빛을 흡수했다!')
    // 접기가 이름 그대로가 아니다 — 빈칸과 대소문자를 지우고 찾는다
    expect(say(prepare('Shadow Force'))).toBe('야생의 팬텀은 순식간에 모습을 감췄다!')
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
    expect(say({ kind: 'notarget', actor: FOE })).toBe('하지만 상대가 없다!')
    expect(say({ kind: 'ohko' })).toBe('일격필살!')
    // 매그니튜드는 굴린 수가 `[number]`로 온다. 못 받으면 조용하다
    expect(say(activate('magnitude', { extra: { ...NO_EXTRA, num: 7 } })))
      .toBe('매그니튜드 7!')
    expect(say(activate('magnitude'))).toBeNull()
  })

  it('자리가 비어 오는 줄도 문장이 된다', () => {
    // 튀어오르기는 `|-activate||move: Splash`로 온다 — 자리가 없다
    expect(say(activate('splash', { actor: null }))).toBe('하지만 아무 일도 일어나지 않았다!')
    expect(say({ kind: 'fieldactivate', effect: eff('perishsong') }))
      .toBe('모든 포켓몬이 멸망의노래를 들었다!')
    expect(say({ kind: 'fieldactivate', effect: eff('payday') })).toBe('주위에 동전이 흩어졌다!')
  })

  it('`[of]`가 가리키는 쪽이 문장에 들어간다', () => {
    // 도우미는 **자리가 뒤집혀 있다** — 자리가 도움을 받는 쪽이다
    expect(say({
      kind: 'singleturn', actor: MINE, effect: eff('helpinghand', 'other'), of: FOE,
    })).toBe('야생의 팬텀은 모부기를 도울 준비를 했다!')
    expect(say(activate('attract', { of: FOE })))
      .toBe('모부기는 야생의 팬텀에게 헤롱헤롱해졌다!')
    // 받침 없는 이름에는 "를"이 붙어야 한다
    expect(say(activate('lockon', { actor: FOE, of: MINE })))
      .toBe('야생의 팬텀은 모부기를 조준했다!')
  })

  it('베낀 기술은 한국어 이름으로 나온다', () => {
    expect(say(activate('sketch', { extra: { num: null, move: 33, moveName: 'Tackle' } })))
      .toBe('모부기는 몸통박치기를 스케치했다!')
    // ⚠️ **번호를 못 찾으면 조용하다.** 다른 자리처럼 영어로 떨어뜨리면 뒤에
    // 조사가 붙어 「Tackle을(를) 스케치했다!」가 화면에 뜬다
    expect(say(activate('sketch', { extra: { num: null, move: null, moveName: 'Tackle' } })))
      .toBeNull()
    // 기술 이름을 아예 못 받아도 조용하다
    expect(say(activate('sketch'))).toBeNull()
  })

  it('글이 없는 효과는 조용하되 특성은 배너로 떨어진다', () => {
    // 원작은 특성이 일한 자리에서 특성 이름을 먼저 띄운다 — `-ability` 줄과 같은
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
  })

  it('원작에 없는 줄에는 글을 안 놓는다', () => {
    // 다음 턴에 「움직일 수 없다!」를 찍는 것은 `cant|recharge`다
    expect(say({ kind: 'mustrecharge', actor: MINE })).toBeNull()
    expect(say({ kind: 'cant', actor: MINE, reason: 'recharge' })).toBe('모부기는 움직일 수 없다!')
    // 쇼다운이 사람에게 규칙을 설명하는 줄
    expect(say({ kind: 'hint', text: 'Some effects can force a Pokemon…' })).toBeNull()
  })

  it('파티 전체와 특성이 걷히는 줄', () => {
    expect(say({ kind: 'cureteam', actor: MINE, from: null })).toBe('기분 좋은 향기가 감돌았다!')
    expect(say({ kind: 'endability', actor: FOE, ability: null, abilityName: '' }))
      .toBe('야생의 팬텀의 특성이 사라졌다!')
  })

  it('길동무는 거는 줄과 걸린 줄이 다르다', () => {
    expect(say({ kind: 'singlemove', actor: MINE, effect: eff('destinybond', 'other') }))
      .toBe('모부기는 상대를 길동무로 만들려 하고 있다!')
    expect(say(activate('destinybond'))).toBe('모부기는 상대를 길동무로 삼았다!')
  })
})
