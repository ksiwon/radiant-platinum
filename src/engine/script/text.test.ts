// 대사 문자열 해석 검증 (DATA.md §2.11)
//
// 두 가지를 본다. 하나는 **코퍼스 전량 훑기** — 4900개 남짓한 제어 부호가 전부
// 토큰으로 풀리는가. 하나라도 글자로 새면 화면에 `{STRVAR_1 3, 0, 0}`이 그대로
// 찍힌다. 다른 하나는 **조사** — 이건 디컴프에 없어서 코퍼스에서 뜻을 정했으므로
// 그 근거를 여기 못 박아 둔다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  fillSlots, formatMessage, MESSAGE_SLOTS, MessageSlots, parseMessage, particleFor, tokensToText,
} from './text'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data/dialogue')
const maybe = withData('dialogue/index.json')

const slots = (...values: string[]): MessageSlots => {
  const s = new MessageSlots()
  values.forEach((v, i) => { s.set(i, v) })
  return s
}

describe('조사', () => {
  // 받침이 있으면 앞쪽, 없으면 뒤쪽. '한별'은 ㄹ 받침, '광휘'는 받침이 없다
  it.each([
    [1, '한별은', '광휘는'],
    [2, '한별을', '광휘를'],
    [3, '한별이', '광휘가'],
    [4, '한별과', '광휘와'],
    [6, '한별이', '광휘'],
    [7, '한별아', '광휘야'],
  ])('선택자 %i', (selector, withBatchim, without) => {
    expect(`한별${particleFor(selector, '한별')}`).toBe(withBatchim)
    expect(`광휘${particleFor(selector, '광휘')}`).toBe(without)
  })

  it('선택자 0은 아무것도 안 붙인다', () => {
    expect(particleFor(0, '한별')).toBe('')
  })

  it("'으로'만 ㄹ 받침을 받침 없는 것처럼 다룬다", () => {
    // 이 예외가 선택자 5를 따로 둔 이유다. ㄹ은 '으'를 안 받는다
    expect(`몬스터볼${particleFor(5, '몬스터볼')}로`).toBe('몬스터볼로')
    expect(`나침반${particleFor(5, '나침반')}로`).toBe('나침반으로')
    expect(`구슬${particleFor(5, '구슬')}로`).toBe('구슬로')
    expect(`태엽${particleFor(5, '태엽')}로`).toBe('태엽으로')
  })

  it('숫자는 읽었을 때의 받침을 본다', () => {
    // 칸에 개수가 들어가는 글이 많다. 1은 '일'이라 ㄹ, 3은 '삼'이라 ㅁ이다
    expect(`1${particleFor(2, '1')}`).toBe('1을')
    expect(`3${particleFor(2, '3')}`).toBe('3을')
    expect(`2${particleFor(2, '2')}`).toBe('2를')
    expect(`5${particleFor(2, '5')}`).toBe('5를')
    expect(`6${particleFor(3, '6')}`).toBe('6이')
    expect(`12${particleFor(3, '12')}`).toBe('12가')
  })
})

describe('제어 부호 해석', () => {
  it('줄 바꿈 셋을 갈라 낸다', () => {
    const tokens = parseMessage('가\n나\r다\f라')
    expect(tokens.filter((t) => t.kind === 'break').map((t) => t.how))
      .toEqual(['line', 'clear', 'scroll'])
    expect(tokensToText(tokens)).toBe('가\n나\r다\f라')
  })

  it('STRVAR의 두 번째 인자가 칸 번호다', () => {
    // 첫 번째는 부호의 하위 바이트다. 이걸 칸으로 읽으면 8칸을 넘어가서
    // 전부 빈칸이 되고, 이름이 통째로 사라진다
    const [token] = parseMessage('{STRVAR_1 3, 1, 6}')
    expect(token).toEqual({ kind: 'arg', slot: 1, particle: 6, afterNext: false })
  })

  it('0x10 비트가 서면 조사를 다음 부호 뒤로 민다', () => {
    // 원본에 12번 나오는데 전부 `{…, 18}{COLOR 0} 손에 넣었다!` 꼴이다.
    // 조사가 색 구간 안에 들어가면 조사까지 색이 칠해진다
    const filled = fillSlots(parseMessage('{COLOR 1}{STRVAR_1 8, 0, 18}{COLOR 0} 손에 넣었다!'), slots('구슬'))
    expect(filled.map((t) => (t.kind === 'text' ? t.text : `<${t.kind}>`)))
      .toEqual(['<color>', '구슬', '<color>', '을 손에 넣었다!'])
  })

  it('떡잎마을 대사가 이름과 조사까지 들어맞는다', () => {
    // 원본 554번 뱅크 1번 글. 0칸은 라이벌, 1칸은 주인공이다
    const raw = '{STRVAR_1 3, 0, 0}: 뭐야-!\r어라, 너 {STRVAR_1 3, 1, 6}잖아!'
    expect(formatMessage(raw, slots('광휘', '한별'))).toBe('광휘: 뭐야-!\r어라, 너 한별이잖아!')
    expect(formatMessage(raw, slots('광휘', '빛나'))).toBe('광휘: 뭐야-!\r어라, 너 빛나잖아!')
  })

  it('모르는 부호는 글자로 남긴다', () => {
    // 조용히 지우면 무엇이 빠졌는지 화면에서도 시험에서도 안 보인다
    expect(tokensToText(parseMessage('{UNK_777 1}가'))).toBe('{UNK_777 1}가')
  })
})

maybe('코퍼스 전량', () => {
  const index = JSON.parse(readFileSync(resolve(DATA, 'index.json'), 'utf8')) as {
    banks: { index: number }[]
    locales: string[]
  }
  const all = (): { locale: string, bank: number, text: string }[] => {
    const out: { locale: string, bank: number, text: string }[] = []
    for (const locale of index.locales) {
      for (const bank of index.banks) {
        const file = resolve(DATA, locale, `${bank.index}.json`)
        if (!existsSync(file)) continue
        for (const text of JSON.parse(readFileSync(file, 'utf8')) as string[]) {
          out.push({ locale, bank: bank.index, text })
        }
      }
    }
    return out
  }

  it('제어 부호가 하나도 글자로 새지 않는다', () => {
    const leaked: string[] = []
    let markers = 0
    for (const { locale, bank, text } of all()) {
      for (const token of parseMessage(text)) {
        if (token.kind !== 'text') {
          if (token.kind !== 'break') markers++
          continue
        }
        if (token.text.includes('{')) leaked.push(`${locale}/${bank}: ${token.text.slice(0, 40)}`)
      }
    }
    // ⚠️ **일본 롬에 인자가 모자란 부호가 하나 있다.** 유니언룸 뱅크(221)의
    // 41번이 `{STRVAR_1 3}`으로 끝난다 — 칸 번호가 아예 없다. 원작 엔진은
    // `CharCode_FormatArgParam(c, 0)`으로 **두 번째** 인자를 읽으므로 그 자리엔
    // 읽을 것이 없다. 한국어·미국판은 같은 자리가 빈 글이다.
    //
    // 칸을 0으로 정해 주지 않는다 — 그건 우리가 지어내는 것이다. 모르는 부호는
    // 글자로 남긴다는 규칙 그대로 두고 여기 적어 둔다
    //
    // ⚠️ **일본 롬의 광장 줄도 하나 샌다.** 뱅크 366의 97번이 `{STRVAR_3 0, 0}`인데
    // 0x0300은 `CharCode_IsFormatArg`가 받는 셋(0x01·0x05·0x06)에 없다 —
    // **원작도 이 자리를 안 채운다.** 미국·한국판은 같은 줄이 0x0600이라 채워진다
    expect(leaked).toEqual([
      'ja/221: {STRVAR_1 3}の　せんたくを',
      'ja/366: ひろばで　{STRVAR_3 0, 0}をした！',
    ])
    expect(markers).toBe(MARKER_COUNT)
  })

  it('칸 번호가 만든 쪽의 칸 수와 맞는다', () => {
    // 두 번째 인자를 칸으로 읽은 것이 맞는지 보는 자리다. 자리를 하나 밀려
    // 읽으면 부호의 하위 바이트(0·3·8·50…)가 칸이 되어 범위가 뭉개진다.
    //
    // 스크립트가 쓰는 표는 8칸이다 — `StringTemplate_New(8, 64, HEAP_ID_FIELD2)`.
    // 배틀프런티어의 출전 금지 목록만 표가 따로고 `BATTLE_FRONTIER_BANLIST_SIZE + 1`
    // = 19칸이라, 거기서만 0~18이 나와야 한다
    const over = new Map<number, Set<number>>()
    const particles = new Map<number, number>()
    for (const { bank, text } of all()) {
      for (const token of parseMessage(text)) {
        if (token.kind !== 'arg') continue
        if (token.slot >= MESSAGE_SLOTS) {
          const set = over.get(bank) ?? new Set()
          set.add(token.slot)
          over.set(bank, set)
        }
        const key = token.particle | (token.afterNext ? 0x10 : 0)
        particles.set(key, (particles.get(key) ?? 0) + 1)
      }
    }
    expect([...over.keys()].sort((a, b) => a - b)).toEqual([...BANLIST_BANKS, SUMMARY_BANK])
    // 요약 화면은 표가 **9칸**이라(`StringTemplate_New(9, 32, …)`) 8번 칸이
    // 하나 나온다 — 알을 받은 자리다. 그 하나뿐이어야 한다
    expect([...over.get(SUMMARY_BANK) ?? []]).toEqual([SUMMARY_EGG_SLOT])
    // ⚠️ **일본판 금지 목록이 한 종 더 길다.** 미국·한국판은 칸 1~18에 18종을
    // 적는데(0번 칸은 마릿수다) 일본판 304번 41번 글은 1~19에 **19종**이다.
    // 롬이 다른 것이지 우리가 밀려 읽은 것이 아니다 — 칸이 1부터 빈틈없이
    // 이어지고, 마릿수를 안 쓰는 글(6·24번)은 0부터 19종을 적는다
    expect(Math.max(...[...over.values()].flatMap((s) => [...s]))).toBe(JA_BANLIST_SIZE)
    // 한국어판에만 조사가 붙는다. 미국판은 전부 0이라 0이 압도적으로 많다
    expect([...particles.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0x12])
  })
})

/** 코퍼스 전체의 제어 부호 개수 (줄 바꿈 제외). 세 로케일 합계다 */
const MARKER_COUNT = 11_753

/** 표가 19칸인 뱅크 — 타워·홀·캐슬·아케이드의 출전 금지 목록 */
const BANLIST_BANKS = [304, 311, 312, 313]
/** 일본판만 한 종 더 길다. 미국·한국판은 `BATTLE_FRONTIER_BANLIST_SIZE`(18)다 */
const JA_BANLIST_SIZE = 19

/** `TEXT_BANK_POKEMON_SUMMARY_SCREEN` — 표가 9칸인 유일한 메뉴 뱅크 */
const SUMMARY_BANK = 455
/** 그 아홉째 칸에 들어가는 것 — 알을 받은 자리 (`MON_DATA_EGG_LOCATION`) */
const SUMMARY_EGG_SLOT = 8
