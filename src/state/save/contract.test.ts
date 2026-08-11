// 봉투가 적는 계약 (IMPORT.md §10 · §11-5)
//
// 재는 것 둘:
//
//   ① 빌드 식별자가 **의미 있는 값**인가. `0.0.0`이면 적어 둔 자리가 비어 있는
//      것과 같다 — 어느 판이 쓴 파일인지 물을 수가 없다
//   ② 버전이 오르는 날 migration이 비어 있지 않은가. 이 시험이 없으면
//      `SAVE_VERSION`만 8로 올리고 표를 안 적어도 아무도 안 막는다
import { describe, expect, it } from 'vitest'
import { APP_BUILD, APP_VERSION, BUILD_ID, isDevBuild, isDirtyBuild, MIN_COMPATIBLE_BUILD } from './contract'
import { MIGRATIONS, oldestSupported } from './migrate'
import { SAVE_VERSION } from '../saveStore'

describe('빌드 식별자', () => {
  it('⚠️ 0.0.0으로 나가지 않는다', () => {
    // 한때 `package.json`의 version이 `0.0.0`이라 모든 `.rpsave`가 같은 값을
    // 달고 나왔다. 그 자리는 있는데 아무것도 안 적힌 것과 같았다
    expect(APP_VERSION).not.toBe('0.0.0')
    expect(APP_BUILD.startsWith('0.0.0+')).toBe(false)
  })

  it('⚠️ 판과 신원이 **다른 값**이다', () => {
    // SemVer에서 `+` 뒤는 빌드 메타데이터라 우선순위를 안 바꾼다 —
    // `0.1.0+dev`와 `0.1.0+a1b2c3d`는 SemVer상 같은 판이다. 한 문자열로 두면
    // "다르게 생겼으니 다른 판"으로 읽을 자리가 생긴다
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(BUILD_ID).toMatch(/^(dev|unknown|[0-9a-f]{7}(-dirty)?)$/)
    expect(APP_BUILD).toBe(`${APP_VERSION}+${BUILD_ID}`)
  })

  it('개발 빌드인지 알 수 있다', () => {
    expect(isDevBuild('dev')).toBe(true)
    expect(isDevBuild('unknown')).toBe(true)
    expect(isDevBuild('a1b2c3d')).toBe(false)
  })

  it('⚠️ 커밋 안 한 나무에서 나온 빌드를 가려낸다', () => {
    // 그런 빌드는 재현이 안 된다 — 해시가 가리키는 소스가 실제로 돌아간
    // 소스가 아니다. 릴리스 게이트가 이걸 보고 막는다
    expect(isDirtyBuild('a1b2c3d-dirty')).toBe(true)
    expect(isDirtyBuild('a1b2c3d')).toBe(false)
    expect(isDirtyBuild('dev')).toBe(false)
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

  it('표에 없는 과거가 없다 — 7부터가 전부다', () => {
    // 없는 과거를 지어내지 않았다는 것. 판이 7에서 8로 처음 올랐으므로 표에는
    // `7` 하나만 있어야 하고, 거슬러 갈 수 있는 가장 낮은 판이 7이어야 한다
    expect(Object.keys(MIGRATIONS).map(Number).sort((a, b) => a - b))
      .toEqual([...Array(SAVE_VERSION - FIRST_PORTABLE).keys()].map((i) => i + FIRST_PORTABLE))
    expect(oldestSupported(SAVE_VERSION)).toBe(FIRST_PORTABLE)
  })
})
