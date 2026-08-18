// 설정 검증.
//
// 여기 값은 두 종류다. **원작이 정한 것**(글자 속도 프레임)과 **우리가 연
// 것**(배틀 진행). 앞엣것이 원작과 어긋나면 그건 버그고, 뒤엣것은 우리 판단이라
// 바뀔 수 있다 — 그래서 어느 쪽인지 시험이 구분해 둔다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BATTLE_PACE, battlePaceScale, gameLocale, LANGUAGES,
  useOptionsStore,
} from './optionsStore'

beforeEach(() => { useOptionsStore.getState().reset() })

describe('글자 속도 — 없앤 자리', () => {
  it('⚠️ 설정에 글자 속도가 없다', () => {
    // 값이 있다는 것은 **글자를 한 자씩 찍는 길이 살아 있다**는 뜻이었다.
    // 그 길에 「한 번 누른 것이 여러 쪽을 민다」가 붙어 대사가 속사포로
    // 지나갔다 (`engine/script/printer`)
    expect(Object.keys(useOptionsStore.getState())).not.toContain('speed')
  })

  it('저장하는 항목에도 속도가 없다', () => {
    // ⚠️ 남겨 두면 옛 값이 되살아나 인쇄기에 다시 흘러든다. `save()`가 적는
    // 목록에서도 빠져 있어야 한다
    const { set, reset, ...saved } = useOptionsStore.getState()
    void set; void reset
    expect(Object.keys(saved)).not.toContain('speed')
  })
})

describe('배틀 진행 — 우리가 연 자리', () => {
  it('원작대로가 1이다 — 곱해도 원작 길이가 그대로여야 한다', () => {
    expect(BATTLE_PACE[0]).toBe(1)
  })

  it('갈수록 빨라지고 0이 되지는 않는다', () => {
    for (let i = 1; i < BATTLE_PACE.length; i++) {
      expect(BATTLE_PACE[i]).toBeLessThan(BATTLE_PACE[i - 1] as number)
      expect(BATTLE_PACE[i]).toBeGreaterThan(0)
    }
  })

  it('설정을 바꾸면 곱이 바뀐다', () => {
    for (let i = 0; i < BATTLE_PACE.length; i++) {
      useOptionsStore.getState().set('battlePace', i as 0 | 1 | 2)
      expect(battlePaceScale()).toBe(BATTLE_PACE[i])
    }
  })
})

describe('언어 — 우리가 연 자리', () => {
  it('설정을 바꾸면 자료를 부르는 로케일이 바뀐다', () => {
    for (let i = 0; i < LANGUAGES.length; i++) {
      useOptionsStore.getState().set('language', i as 0 | 1 | 2)
      expect(gameLocale()).toBe(LANGUAGES[i])
    }
  })

  it('모르는 값이 남아 있어도 한국어로 떨어진다', () => {
    // 옛 설정이 localStorage에 남아 있거나 목록이 줄어든 경우다. 여기서
    // undefined가 새면 `dialogue/undefined/220.json`을 부른다
    useOptionsStore.setState({ language: 99 as 0 })
    expect(gameLocale()).toBe('ko')
  })

  it('고를 수 있는 언어는 대사 뱅크가 다 있는 언어뿐이다', () => {
    // ⚠️ **이 시험이 목록을 지킨다.** 이름표만 있고 대사 뱅크가 없는 언어를
    // 목록에 적으면 고른 순간 스크립트 글이 통째로 빈다 — 화면은 뜨므로
    // 눈으로는 한참 뒤에야 안다
    const dir = resolve(__dirname, '../../public/data/dialogue')
    if (!existsSync(dir)) return
    const shipped = (JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')) as
      { locales: string[] }).locales
    for (const locale of LANGUAGES) expect(shipped, locale).toContain(locale)
  })

  it('세 언어가 뱅크를 거의 다 갖고 있다', () => {
    // 일본 롬에 없는 뱅크는 414(`month_names`) 하나다 — 일본어가 달을 이름으로
    // 안 부르기 때문이고, 문장 틀이 숫자 뒤에 단위를 직접 쓴다.
    //
    // ⚠️ 147(`game_corner`)은 한때 여기 있었다. 열쇠 표가 "일본 롬에 없다"고
    // 했지만 실제로는 일본판이 26줄로 다시 쓴 것이었고(미국판 28줄), 그래서
    // (키, 엔트리 수)로 짝을 짓는 표가 못 알아본 것뿐이다
    //
    // 393·394·413·620은 **미국 롬에만 있다** — 조사가 붙은 판과 복수형이라
    // 한국어에도 일본어에도 그런 표가 없다.
    //
    // 전부 우리 실수가 아니다. 이 수가 늘면 추출이 어긋난 것이다
    const dir = resolve(__dirname, '../../public/data/dialogue')
    if (!existsSync(dir)) return
    const banks = (JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')) as
      { banks: { index: number }[] }).banks
    for (const locale of LANGUAGES) {
      const missing = banks.filter((b) => !existsSync(resolve(dir, locale, `${String(b.index)}.json`)))
      const articles = [393, 394, 413, 620]
      expect(missing.map((b) => b.index), locale).toEqual(
        locale === 'ja' ? [393, 394, 413, 414, 620] : locale === 'ko' ? articles : [],
      )
    }
  })

  it('설정 화면의 글자리가 언어마다 같다', () => {
    // 뱅크 **번호**는 언어마다 다르고 그건 추출 때 이미 옮겨 뒀다. 뱅크 **안의
    // 자리**까지 어긋나면 "본다" 자리에 엉뚱한 낱말이 뜬다
    const dir = resolve(__dirname, '../../public/data/dialogue')
    if (!existsSync(resolve(dir, 'ko/220.json'))) return
    const banks = LANGUAGES.map((l) =>
      JSON.parse(readFileSync(resolve(dir, l, '220.json'), 'utf8')) as string[])
    // 3~8 항목 이름 · 10~18 고를 값 · 43~46 설명
    for (const at of [3, 4, 5, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18, 43, 44, 45, 46]) {
      for (const bank of banks) expect(bank[at], `${String(at)}`).toBeTruthy()
    }
    // 그리고 실제로 서로 다른 언어여야 한다 — 같은 파일을 세 번 읽은 것이 아니다
    expect(banks[0]?.[13]).toBe('본다')
    expect(banks[1]?.[13]).toBe('ON')
    expect(banks[2]?.[13]).toBe('みる')
  })
})

describe('기본값', () => {
  it('글자는 "빠름", 배틀은 "빠르게", 언어는 한국어로 시작한다', () => {
    const o = useOptionsStore.getState()
    expect(o.language).toBe(0)
    expect(gameLocale()).toBe('ko')
    expect(o.battlePace).toBe(1)
    expect(battlePaceScale()).toBe(0.5)
  })

  it('원작대로 되돌릴 수 있다', () => {
    const o = useOptionsStore.getState()
    o.set('battlePace', 0)
    expect(battlePaceScale()).toBe(1)
  })
})
