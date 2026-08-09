// 콘텐츠 계약 — 이 세이브가 어떤 설치본을 전제하는가 (IMPORT.md §10 봉투)
//
// 휴대용 리포트는 세이브만 들고 다닌다. 에셋은 안 들어간다(COPYRIGHT.md §7).
// 그러면 다른 기계에서 열었을 때 "이 파일이 이 설치본에서 말이 되는가"를 물어야
// 하는데, 그 물음의 답이 여기 둘이다.
//
// ⚠️ **원본 파일명·경로·ROM 전체 해시는 안 들어간다.** 어느 지역판을 깔았는지는
// 호환을 판정하는 데 필요하지만, 어떤 파일에서 깔았는지는 필요 없다. 필요 없는
// 것을 담으면 그것 자체가 유출 경로가 된다.

/**
 * 이 앱을 만든 빌드. vite가 `define`으로 박아 넣는다.
 *
 * 모양은 `<package.json version>+<표식>`이다:
 *
 *   `0.1.0+dev`        개발 서버·로컬 빌드
 *   `0.1.0+a1b2c3d`    CI 빌드 (커밋 짧은 해시)
 *
 * ⚠️ **`0.0.0`이면 안 된다.** 한때 `package.json`의 version이 `0.0.0`이라
 * 모든 `.rpsave`가 같은 값을 달고 나왔다 — "어느 판이 쓴 파일인가"를 물을 수
 * 없으니 적어 둔 의미가 없었다. 지금은 로컬과 릴리스도 갈린다
 */
declare const __APP_BUILD__: string

export const APP_BUILD: string =
  typeof __APP_BUILD__ === 'string' && __APP_BUILD__.length > 0 ? __APP_BUILD__ : '0.0.0+unknown'

/** 로컬에서 만든 빌드인가. 진단 화면이 이걸 적는다 */
export function isDevBuild(build = APP_BUILD): boolean {
  return build.endsWith('+dev') || build.endsWith('+unknown')
}

/**
 * 이 파일 **형식**을 읽을 수 있는 가장 낮은 앱 빌드.
 *
 * 형식의 속성이지 쓴 사람의 속성이 아니다 — 그래서 `APP_BUILD`가 아니다.
 *
 * ⚠️ **지금 이 값은 아무것도 막지 않는다.** 봉투에 적히기만 하고 `parsePortable`이
 * 비교하지 않는다. 그래서 "이 빌드 이상에서만 열린다"는 보장을 하지 않는다 —
 * 실제 호환 판정은 `PORTABLE_FORMAT`(봉투 모양)과 `SAVE_VERSION`(내용 판)이 한다.
 * 비교하지 않는 이유는 빌드 문자열이 **정렬 가능한 순서가 아니기** 때문이다:
 * `0.1.0+a1b2c3d`와 `0.1.0+dev` 사이에 크기 관계가 없다. 언젠가 형식이 갈리면
 * 그때 `PORTABLE_FORMAT`을 올린다 — 그것은 정수라 비교가 된다
 */
export const MIN_COMPATIBLE_BUILD = '0.0.0'

/** 설치된 에셋 계약의 판. 그룹 스키마가 바뀌면 오른다 */
export const CONTENT_SCHEMA = 1

export interface ContentContract {
  /** 설치한 Platinum 지역판. 아직 Importer가 없어 개발 모드는 `dev`다 */
  platinumLocale: string
  schema: number
}

/**
 * 지금 설치본의 계약.
 *
 * 기본값이 `dev`인 것은 개발판이 raw에서 구운 산출물을 쓰고 거기에 지역판
 * 개념이 없기 때문이다. 공개판은 부팅할 때 `install.json`이 이 값을 준다
 * (`app/boot.ts`의 `useInstalled`) — 그래서 다른 기계에서 만든 `.rpsave`를
 * 열면 "다른 지역판"이라고 말할 수 있다
 */
let current: ContentContract = { platinumLocale: 'dev', schema: CONTENT_SCHEMA }

export function contentContract(): ContentContract {
  return current
}

/** 설치가 끝났을 때 Importer가 부른다 */
export function setContentContract(next: ContentContract): void {
  current = next
}

export type Compatibility = 'same' | 'other-locale' | 'other-schema'

/** 이 파일이 지금 설치본과 맞는가. **막지는 않고 알려 준다** */
export function compareContract(file: ContentContract): Compatibility {
  const now = contentContract()
  if (file.schema !== now.schema) return 'other-schema'
  if (file.platinumLocale !== now.platinumLocale) return 'other-locale'
  return 'same'
}
