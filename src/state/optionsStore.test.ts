// 설정 검증.
//
// 여기 값은 두 종류다. **원작이 정한 것**(글자 속도 프레임)과 **우리가 연
// 것**(배틀 진행). 앞엣것이 원작과 어긋나면 그건 버그고, 뒤엣것은 우리 판단이라
// 바뀔 수 있다 — 그래서 어느 쪽인지 시험이 구분해 둔다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { TEXT_SPEED } from '../engine/script/printer'
import {
  BATTLE_PACE, battlePaceScale, gameLocale, LANGUAGES, SPEED_FRAMES, textSpeedFrames,
  useOptionsStore,
} from './optionsStore'

beforeEach(() => { useOptionsStore.getState().reset() })

describe('글자 속도 — 원작 값', () => {
  it('앞 셋이 `Options_TextFrameDelay` 그대로다', () => {
    // 느림 8 · 보통 4 · 빠름 1. `include/text.h`
    expect(SPEED_FRAMES.slice(0, 3)).toEqual([TEXT_SPEED.slow, TEXT_SPEED.normal, TEXT_SPEED.fast])
  })

  it('네 번째도 지어낸 값이 아니라 `TEXT_SPEED_INSTANT`다', () => {
    expect(SPEED_FRAMES[3]).toBe(TEXT_SPEED.instant)
    expect(TEXT_SPEED.instant).toBe(0)
  })

  it('설정을 바꾸면 인쇄기가 받는 값이 바뀐다', () => {
    for (let i = 0; i < SPEED_FRAMES.length; i++) {
      useOptionsStore.getState().set('speed', i as 0 | 1 | 2 | 3)
      expect(textSpeedFrames()).toBe(SPEED_FRAMES[i])
    }
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
    // 일본 롬에 없는 뱅크가 둘이다. 147(`game_corner`)은 열쇠 표와 항목 수
    // 정렬이 **둘 다 없다**고 말하는 자리고, 414(`month_names`)는 일본어가
    // 달을 이름으로 안 부르기 때문이다 — 문장 틀이 숫자 뒤에 단위를 직접 쓴다.
    // 둘 다 우리 실수가 아니다. 이 수가 늘면 추출이 어긋난 것이다
    const dir = resolve(__dirname, '../../public/data/dialogue')
    if (!existsSync(dir)) return
    const banks = (JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')) as
      { banks: { index: number }[] }).banks
    for (const locale of LANGUAGES) {
      const missing = banks.filter((b) => !existsSync(resolve(dir, locale, `${String(b.index)}.json`)))
      expect(missing.map((b) => b.index), locale).toEqual(locale === 'ja' ? [147, 414] : [])
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
    // 원작 기본은 보통·원작대로다. 느리다고 오래 비판받은 값이라 우리는 한 칸씩
    // 당겨 두고, 원작대로 보고 싶으면 설정에서 되돌릴 수 있게 남긴다
    expect(o.speed).toBe(2)
    expect(textSpeedFrames()).toBe(TEXT_SPEED.fast)
    expect(o.battlePace).toBe(1)
    expect(battlePaceScale()).toBe(0.5)
  })

  it('원작대로 되돌릴 수 있다', () => {
    const o = useOptionsStore.getState()
    o.set('speed', 1)
    o.set('battlePace', 0)
    expect(textSpeedFrames()).toBe(TEXT_SPEED.normal)
    expect(battlePaceScale()).toBe(1)
  })
})
