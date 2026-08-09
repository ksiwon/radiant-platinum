// 콘텐츠 계약 — 이 세이브가 어떤 설치본을 전제하는가 (IMPORT.md §10 봉투)
//
// 휴대용 리포트는 세이브만 들고 다닌다. 에셋은 안 들어간다(COPYRIGHT.md §7).
// 그러면 다른 기계에서 열었을 때 "이 파일이 이 설치본에서 말이 되는가"를 물어야
// 하는데, 그 물음의 답이 여기 둘이다.
//
// ⚠️ **원본 파일명·경로·ROM 전체 해시는 안 들어간다.** 어느 지역판을 깔았는지는
// 호환을 판정하는 데 필요하지만, 어떤 파일에서 깔았는지는 필요 없다. 필요 없는
// 것을 담으면 그것 자체가 유출 경로가 된다.

/** 앱 빌드 (`package.json`의 version). vite가 `define`으로 박아 넣는다 */
declare const __APP_BUILD__: string

export const APP_BUILD: string =
  typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '0.0.0'

/**
 * 이 파일 형식을 읽을 수 있는 가장 낮은 앱 빌드.
 *
 * 형식의 속성이지 쓴 사람의 속성이 아니다 — 그래서 `APP_BUILD`가 아니다
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
 * ⚠️ **아직 설치 매니페스트가 없다** (IMPORT.md §8은 구현 전). 개발판은 raw에서
 * 구운 산출물을 쓰고 거기에는 지역판 개념이 없어서 `dev`로 적는다. Importer가
 * 붙으면 `install.json`이 이 값을 준다 — 그때 여기 한 군데만 바뀐다
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
