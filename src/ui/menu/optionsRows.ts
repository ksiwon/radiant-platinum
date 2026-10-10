// 설정 줄의 차례와 묶음, 값 감기, 바꾼 줄 세기 — 순수 함수 (`options.md` §4.1 · §6).
//
// 줄은 열두 가지가 아니라 아홉이다. 묶음 셋이 차례를 쥔다: 배틀 → 화면과 소리 → 데이터. 위험한 「처음부터」는
// 맨 아래 묶음에 두고, 원작의 「닫는다」 줄(뱅크 42)이 맨 끝에 선다.
import type { Language, Options } from '../../state/optionsStore'

export type OptionKey = keyof Options
/** 줄의 열쇠. 값이 있는 줄은 설정 이름 그대로고, 행동 줄이 셋이다 */
export type RowKey = OptionKey | 'verify' | 'reset' | 'close'

export type GroupId = 'battle' | 'display' | 'data'

export const ROW_GROUPS: readonly { id: GroupId, keys: readonly RowKey[] }[] = [
  { id: 'battle', keys: ['battleScene', 'battleRule', 'battlePace'] },
  { id: 'display', keys: ['view', 'language', 'sound'] },
  { id: 'data', keys: ['verify', 'reset', 'close'] },
]

/** 위에서 아래로 늘어놓은 줄 차례 — 커서 번호가 이 차례다 */
export const ROW_ORDER: readonly RowKey[] = ROW_GROUPS.flatMap((g) => g.keys)

/** 값이 있는 줄인가 (←→로 바꾼다). 행동 줄은 값 열이 비고 Z로 누른다 */
export function isValueRow(key: RowKey): key is OptionKey {
  return key !== 'verify' && key !== 'reset' && key !== 'close'
}

/** 자리는 `LANGUAGES`의 차례와 같다 — 한국어 · 영어 · 일본어 */
export function pickLang<T>(language: Language, ko: T, en: T, ja: T): T {
  return [ko, en, ja][language] ?? ko
}

/**
 * 묶음 이름. **롬에 없는 우리 말**이라 세 언어를 손으로 든다 (`options.md` §7 ②).
 * 뱅크에서 오는 글이 아니므로 뱅크가 오기 전에도 그린다
 */
export function groupTitle(id: GroupId, language: Language): string {
  switch (id) {
    case 'battle': return pickLang(language, '배틀', 'BATTLE', 'バトル')
    case 'display': return pickLang(language, '화면과 소리', 'DISPLAY & SOUND', 'がめんと おと')
    case 'data': return pickLang(language, '데이터', 'DATA', 'データ')
  }
}

/** 값 하나를 ←→로 감은 다음 자리. **값이 하나뿐이면 `null`** — 안 움직인 키는 소리를 안 낸다 (`useMenuKeys`) */
export function stepValue(at: number, delta: number, count: number): number | null {
  if (count < 2) return null
  return (((at + delta) % count) + count) % count
}

/** 설정 여섯의 값만 뽑는다 — 열 때 찍어 두는 스냅숏 */
export function snapshotOf(o: Options): Options {
  const { battleScene, battleRule, sound, view, battlePace, language } = o
  return { battleScene, battleRule, sound, view, battlePace, language }
}

/** 열 때 스냅숏과 지금을 견줘 **바뀐 줄**을 줄 차례대로 돌려준다 */
export function changedRows(before: Options, now: Options): OptionKey[] {
  return ROW_ORDER.filter((key): key is OptionKey => isValueRow(key) && before[key] !== now[key])
}
