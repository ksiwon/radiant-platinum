// 봉투가 적는 계약 (IMPORT.md §10 · §11-5)
//
// 재는 것 둘:
//
//   ① 빌드 식별자가 **의미 있는 값**인가. `0.0.0`이면 적어 둔 자리가 비어 있는
//      것과 같다 — 어느 판이 쓴 파일인지 물을 수가 없다
//   ② 버전이 오르는 날 migration이 비어 있지 않은가. 이 시험이 없으면
//      `SAVE_VERSION`만 8로 올리고 표를 안 적어도 아무도 안 막는다
import { describe, expect, it } from 'vitest'
import { APP_BUILD, isDevBuild, MIN_COMPATIBLE_BUILD } from './contract'
import { MIGRATIONS, oldestSupported } from './migrate'
import { SAVE_VERSION } from '../saveStore'

describe('빌드 식별자', () => {
  it('⚠️ 0.0.0으로 나가지 않는다', () => {
    // 한때 `package.json`의 version이 `0.0.0`이라 모든 `.rpsave`가 같은 값을
    // 달고 나왔다. 그 자리는 있는데 아무것도 안 적힌 것과 같았다
    expect(APP_BUILD).not.toBe('0.0.0')
    expect(APP_BUILD.startsWith('0.0.0+')).toBe(false)
  })

  it('`<판>+<표식>` 모양이다 — 로컬과 릴리스가 갈린다', () => {
    expect(APP_BUILD).toMatch(/^\d+\.\d+\.\d+\+[0-9a-z]+$/)
  })

  it('개발 빌드인지 알 수 있다', () => {
    expect(isDevBuild('0.1.0+dev')).toBe(true)
    expect(isDevBuild('0.1.0+unknown')).toBe(true)
    expect(isDevBuild('0.1.0+a1b2c3d')).toBe(false)
  })

  it('MIN_COMPATIBLE_BUILD는 아무것도 안 막는다고 적혀 있다', () => {
    // 값 자체가 아니라 **거짓 보장을 안 한다**는 것이 요점이다. 형식 판정은
    // `PORTABLE_FORMAT`과 `SAVE_VERSION`이 한다 — 둘 다 정수라 비교가 된다
    expect(MIN_COMPATIBLE_BUILD).toBe('0.0.0')
  })
})

describe('⚠️ migration guard', () => {
  /** 첫 휴대용 리포트가 나간 판. 여기부터는 길이 이어져야 한다 */
  const FIRST_PORTABLE = 7

  it('7부터 지금까지 빈 칸이 없다', () => {
    // ⚠️ 이 시험이 막는 것: `SAVE_VERSION`을 8로 올리고 `MIGRATIONS[7]`을
    // 안 적는 것. 그러면 7로 저장된 리포트가 전부 "못 옮긴다"가 되고,
    // 사용자는 진행이 사라진 것으로 본다
    const holes: number[] = []
    for (let v = FIRST_PORTABLE; v < SAVE_VERSION; v++) {
      if (!MIGRATIONS[v]) holes.push(v)
    }
    expect(holes, `migration이 없는 판: ${holes.join(' · ')}`).toEqual([])
  })

  it('지금은 7이 곧 지금 판이라 표가 비어 있다', () => {
    // 없는 과거를 지어내지 않았다는 것. 이 줄은 버전이 오르면 자연히 깨진다
    expect(SAVE_VERSION).toBe(FIRST_PORTABLE)
    expect(Object.keys(MIGRATIONS)).toEqual([])
    expect(oldestSupported(SAVE_VERSION)).toBe(FIRST_PORTABLE)
  })
})
