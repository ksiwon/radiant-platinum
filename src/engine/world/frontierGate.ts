// 배틀프런티어의 시설 넷을 **차후 업데이트까지** 막는다 (사용자 결정 2026-09-28 · PARITY §9.3)
//
// 다섯 시설 중 배틀팩토리만 연다. 배틀타워 · 배틀스테이지 · 배틀캐슬 · 배틀룰렛은 문 앞에서 멈추고 안내 한 덩이를
// 띄운다 — 들어가게 두면 접수원 스크립트가 우리가 안 옮긴 프런티어 명령(`CallBattleTowerFunction` 등)에서 선다.
//
// 문은 전부 배틀프런티어 맵(559) 바깥벽에 있다 — 타워 둘 · 나머지 셋씩 (`events` 워프 0~1 · 4~9 · 13~15).
// 막는 자리는 걸어서 문을 여는 **그 한 곳**이다(`warpSystem`) — 스크립트 `Warp`로 들어가는 길은 없다.
//
// ⚠️ **안내는 롬 글이 아니라 우리 글이다.** 원작인 척하지 않게 시설 이름만 롬에서 가져온다(세 판의 대사 표기 그대로)
import type { DataLocale } from '../../data/gameData'

/** `MAP_HEADER_BATTLE_TOWER` · `_HALL` · `_CASTLE` · `_ARCADE` */
const DEFERRED: Readonly<Record<number, 'tower' | 'hall' | 'castle' | 'arcade'>> = {
  326: 'tower',
  563: 'hall',
  564: 'castle',
  565: 'arcade',
}

/** 시설 이름 — 롬 대사의 표기다 (일본판은 장음을 `－`로 적는다) */
const NAMES: Readonly<Record<DataLocale, Readonly<Record<'tower' | 'hall' | 'castle' | 'arcade', string>>>> = {
  ko: { tower: '배틀타워', hall: '배틀스테이지', castle: '배틀캐슬', arcade: '배틀룰렛' },
  en: { tower: 'Battle Tower', hall: 'Battle Hall', castle: 'Battle Castle', arcade: 'Battle Arcade' },
  ja: { tower: 'バトルタワ－', hall: 'バトルステ－ジ', castle: 'バトルキャッスル', arcade: 'バトルル－レット' },
}

/** 받침이 있으면 「은」 · 없으면 「는」 (배틀캐슬은 · 배틀타워는) */
function topic(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00
  return c >= 0 && c < 11172 && c % 28 !== 0 ? '은' : '는'
}

/** 이 맵이 막힌 시설인가 */
export function isDeferredFacility(map: number): boolean {
  return DEFERRED[map] !== undefined
}

/** 문 앞에서 띄우는 안내. 막힌 시설이 아니면 null — `\r`이 쪽을 나눈다 */
export function deferredFacilityNotice(map: number, locale: DataLocale): string | null {
  const kind = DEFERRED[map]
  if (kind === undefined) return null
  const name = NAMES[locale][kind]
  switch (locale) {
    case 'en': return `The ${name} isn't open yet.\rIt will open in a future update.`
    // 일본판 대사는 낱말 사이를 전각 빈칸(U+3000)으로 띄운다
    case 'ja': return `${name}は\u3000まだ\u3000じゅんびちゅうだ。\rこんごの\u3000アップデ－トで\u3000ひらかれる！`
    default: return `${name}${topic(name)} 아직 준비 중이다.\r차후 업데이트에서 문을 연다!`
  }
}
