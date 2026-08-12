// 추출된 대사 검증 (DATA.md §2.11)
//
// 글이 맞는지는 다른 곳에서 증명했다 — 미국 뱅크 685개를 디컴프 원문과 제어
// 코드까지 대조했고, 한국어 뱅크 번호는 한국어 롬의 맵 헤더 표와 593/593
// 맞췄다 (`pnpm verify:dialogue`, 롬이 있어야 돈다).
//
// 여기서는 **싣는 산출물**이 그 결과와 어긋나지 않았는지를 본다. 특히 제어 코드가
// 온전한지 — 이름표용 디코더는 `{STRVAR_1 3, 0, 0}`(주인공)과 `{STRVAR_1 3, 1, 6}`
// (라이벌+조사)을 둘 다 `{103:2}`로 뭉갰다. 그 상태로도 문장은 읽히기 때문에
// 눈으로는 안 잡힌다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { dialogueIndexSchema } from './schema'
import { GENERIC_NAMES_BANK, namesOf, pickName } from './genericNames'
import { withData } from './romData.testkit'

const DATA = resolve(__dirname, '../../public/data/dialogue')
const maybe = withData('dialogue/index.json')

/** 떡잎마을. 스크립트·뱅크·글이 한 줄로 이어지는지 보는 기준점이다 */
const TWINLEAF = 554

maybe('대사', () => {
  const index = dialogueIndexSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'index.json'), 'utf8')),
  )
  const bank = (locale: string, at: number): string[] =>
    JSON.parse(readFileSync(resolve(DATA, locale, `${at}.json`), 'utf8'))

  it('맵이 쓰는 뱅크 404개 + 공용을 담는다', () => {
    // 맵이 안 가리키는 것을 따로 싣는다 — 이름 짓기 표, 트레이너 대사,
    // 메뉴 화면들의 글(시작 메뉴·가방·주머니 이름·포켓몬·도감), 그리고
    // 파트너를 고르는 화면(360), 요약 화면(455)·특별한 만난 자리(435)·달 이름(414)·
    // 타운맵(615)
    expect(index.banks.length).toBe(454)
    expect(index.locales).toEqual(['en', 'ko', 'ja'])
    // 번호가 오름차순이고 겹치지 않는다
    const nums = index.banks.map((b) => b.index)
    expect([...nums].sort((a, b) => a - b)).toEqual(nums)
    expect(new Set(nums).size).toBe(nums.length)
  })

  /**
   * 일본 롬에 아예 없는 뱅크. 열쇠 표와 항목 수 정렬이 **둘 다 없다**고 하므로
   * 우리 실수가 아니다 — 그 맵만 글이 빈다.
   *
   * 414(`month_names`)는 일본어가 달을 이름으로 안 부르기 때문이다 — 문장 틀이
   * 숫자 뒤에 `がつ`를 직접 쓴다. 미국판만 `Jan.`을 쓴다
   */
  const MISSING = { ja: [147, 414] } as Record<string, number[] | undefined>

  /**
   * 일본 롬만 항목이 **뒤에서** 몇 개 짧은 뱅크. 앞은 한 줄씩 그대로 맞으므로
   * 우리가 쓰는 번호가 밀리지 않는다 — 예를 들어 `berry_trees`는 0~34가
   * 한국어판 0~34와 같은 글이고 35~37만 없다.
   *
   * `save_info_window`는 짧은 이유가 다르다: 일본판이 이름표와 값을 **한 줄에**
   * 담아서(`しゅじんこう {STRVAR_1 3, 1}`) 값만 따로 있는 5~8이 없다
   */
  const SHORTER: Record<string, Record<number, number> | undefined> = {
    ja: { 397: 35, 534: 5, 697: 125 },
  }

  it('모든 뱅크가 로케일마다 있고 항목 수가 같다', () => {
    for (const b of index.banks) {
      for (const locale of index.locales) {
        if (MISSING[locale]?.includes(b.index)) {
          expect(existsSync(resolve(DATA, locale, `${String(b.index)}.json`))).toBe(false)
          continue
        }
        const messages = bank(locale, b.index)
        expect(messages, `${locale}/${String(b.index)}`)
          .toHaveLength(SHORTER[locale]?.[b.index] ?? b.entries)
      }
    }
  })

  it('짧은 일본어 뱅크는 앞이 그대로 맞는다 — 번호가 밀리지 않는다', () => {
    // 밀렸다면 그 뱅크를 쓰는 화면이 통째로 엉뚱한 글을 띄운다. 글 자체는
    // 언어가 달라 못 견주므로 **제어 부호의 얼개**로 본다 — 이름표 자리는
    // 부호가 없고 값 자리는 `{STRVAR_1 …}`이 있다
    const shape = (t: string) => [...t.matchAll(/\{([A-Z_0-9]+) (\d+)/g)].map((m) => `${m[1]!}:${m[2]!}`).join(' ')
    for (const [at, short] of Object.entries(SHORTER.ja!)) {
      const ja = bank('ja', Number(at))
      const ko = bank('ko', Number(at))
      expect(ja).toHaveLength(short)
      // `save_info_window`는 일본판이 이름표와 값을 합쳐 놔서 얼개가 다르다
      if (Number(at) === 534) continue
      for (let i = 0; i < short; i++) expect(shape(ja[i]!), `${at}/${String(i)}`).toBe(shape(ko[i]!))
    }
  })

  it('제어 코드가 온전하다', () => {
    // 짝이 안 맞는 중괄호나 모르는 코드(`{?xxxx}`)가 있으면 디코더가 샌 것이다.
    // 개수는 실측으로 못 박는다 — 4세대 데이터는 이제 변하지 않으므로 이 숫자가
    // 흔들리면 개선이 아니라 회귀다
    const counted: Record<string, number> = {}
    for (const locale of index.locales) {
      let controls = 0
      for (const b of index.banks) {
        if (MISSING[locale]?.includes(b.index)) continue
        for (const text of bank(locale, b.index)) {
          expect(text).not.toMatch(/\{\?/)
          expect(text.split('{').length).toBe(text.split('}').length)
          controls += text.split('{').length - 1
        }
      }
      counted[locale] = controls
    }
    expect(counted).toEqual({ en: 2965, ko: 2955, ja: 3168 })
  })

  it('떡잎마을 기타리스트 대사에 주인공·라이벌이 따로 들어간다', () => {
    const ko = bank('ko', TWINLEAF)
    const en = bank('en', TWINLEAF)
    expect(ko).toHaveLength(15)
    expect(en).toHaveLength(15)
    // 두 이름이 **다른 인자**로 구분돼야 한다. 뭉개면 누구 이름인지 알 수 없다
    expect(en[1]).toContain('{STRVAR_1 3, 0, 0}')
    expect(en[1]).toContain('{STRVAR_1 3, 1, 0}')
    // 한국어는 셋째 인자가 조사 선택자다 — 미국판과 값이 다르다
    expect(ko[1]).toContain('{STRVAR_1 3, 0, 0}')
    expect(ko[1]).toMatch(/\{STRVAR_1 3, 1, [1-9]\d*\}/)
    expect(en[1]).toContain('Prof. Rowan')
    expect(ko[1]).toContain('마박사')
  })

  it('이름 짓기 표에서 라이벌 기본 이름이 나온다', () => {
    // 원작이 제안하는 이름 표다. 우리가 이름을 지어내지 않으려고 싣는다 —
    // 구간 경계는 디컴프의 `res/text/generic_names.json`이 붙인 이름표에서 왔다
    const ko = bank('ko', GENERIC_NAMES_BANK)
    expect(ko).toHaveLength(90)
    expect(namesOf(ko, 'rival')).toEqual(['펄', '다이아몬드'])
    expect(namesOf(bank('en', GENERIC_NAMES_BANK), 'rival')).toEqual(['Pearl', 'Diamond'])
    expect(namesOf(ko, 'playerMale')).toHaveLength(18)
    expect(namesOf(ko, 'playerFemale')).toHaveLength(18)
    expect(pickName(ko, 'playerFemale', 0)).toBe('플래티넘')
  })

  it('줄바꿈·스크롤·새 쪽이 서로 다른 문자로 남는다', () => {
    // 4세대는 셋이 다 다르다. 하나로 뭉치면 대화창 연출을 복원할 수 없다
    const all = index.banks.flatMap((b) => bank('ko', b.index))
    expect(all.some((t) => t.includes('\n'))).toBe(true)
    expect(all.some((t) => t.includes('\r'))).toBe(true)
    expect(all.some((t) => t.includes('\f'))).toBe(true)
  })
})
