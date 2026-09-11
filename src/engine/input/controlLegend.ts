// 화면 구석에 붙는 조작 쪽지의 줄들.
//
// ⚠️ **키를 손으로 적지 않는다.** `BINDINGS`에서 뽑는다 — 오프닝의 설명
// (`engine/intro/controlText`)과 같은 규칙이고, 키를 바꾸면 둘 다 같이 바뀐다.
//
// 무엇을 적을지는 **원작이 아래 화면에 늘 띄워 두던 것**을 따른다. 원작은
// 터치스크린에 그때그때 쓸 수 있는 버튼이 떠 있어서(`rowan_intro` 4번) 조작을
// 외울 필요가 없었다 — 우리에게는 그 화면이 없으니 그 자리를 이 쪽지가 맡는다.
import { keyList, moveKeys, type KeyLocale } from './keyNames'
import { BINDINGS } from './keys'

interface ControlRow {
  /** 누를 것 */
  keys: string
  /** 그러면 무엇이 되는가 */
  what: string
}

/** 줄마다의 이름. 줄 차례는 아래 `controlRows`가 정한다 */
const WHAT: Readonly<Record<KeyLocale, readonly string[]>> = {
  ko: [
    '이동', '달리기', '결정·조사', '취소', '메뉴', '등록 도구', '자전거 단',
    '포켓치', '앱 넘기기', '시점',
  ],
  en: [
    'Move', 'Run', 'Confirm', 'Cancel', 'Menu', 'Registered item', 'Bike gear',
    'Pokétch', 'Next app', 'View',
  ],
  ja: [
    'うごく', 'はしる', 'きめる', 'もどる', 'メニュー', 'とうろくどうぐ', 'じてんしゃギア',
    'ポケッチ', 'アプリ', 'してん',
  ],
}

/** 설정에 없는 언어는 한국어로 떨어진다 */
export function keyLocale(locale: string): KeyLocale {
  return locale === 'en' ? 'en' : locale === 'ja' ? 'ja' : 'ko'
}

/** 조작 쪽지에 적을 줄들 */
export function controlRows(locale: string): readonly ControlRow[] {
  const at = keyLocale(locale)
  const what = WHAT[at]
  const keys = [
    moveKeys(at),
    keyList(BINDINGS.run, at),
    keyList(BINDINGS.interact, at),
    keyList(BINDINGS.cancel, at),
    keyList(BINDINGS.menu, at),
    keyList(BINDINGS.register, at),
    keyList(BINDINGS.gear, at),
    keyList(BINDINGS.poketch, at),
    keyList([...BINDINGS.poketchPrev, ...BINDINGS.poketchNext], at),
    keyList(BINDINGS.view, at),
  ]
  return keys.map((k, i) => ({ keys: k, what: what[i] ?? '' }))
}

/**
 * 쪽지를 여닫는 키.
 *
 * ⚠️ **게임 키와 겹치면 안 되고, 왼손에 있어야 한다.** `BINDINGS`에 있는 것은
 * 다 임자가 있으므로 그 옆의 빈자리 `G`를 쓴다 — 집게손가락이 제자리에서
 * 한 칸 오른쪽이다. `F1`은 자판을 모르는 손을 위한 덤이다.
 * `controlLegend.test`가 겹침과 왼손 범위를 잰다
 */
export const LEGEND_TOGGLE: readonly string[] = ['KeyG', 'F1']
