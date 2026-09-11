// 뱅크 하나를 받아 든다 — 배틀 안의 두 화면이 쓴다 (PARITY §2.26).
//
// ⚠️ **없어도 화면이 서지 않는다.** 뱅크를 못 받으면 빈 배열이고, `romLine`이
// 그 자리를 null로 낸다 — 부르는 쪽이 우리 글로 떨어지거나 그 한 줄만 비운다.
// 배틀 위 화면의 이름표와 다른 자리다: 저쪽 여섯은 없으면 배틀이 통째로 안
// 뜨지만(REPAIR §29) 아래 화면의 안내 한 줄은 그렇지 않다.
import { useEffect, useState } from 'react'
import { loadDialogueBank } from '../../data/gameData'
import { useGameLocale } from '../../state/optionsStore'

/**
 * 그 뱅크의 줄. 아직 못 받았으면 빈 배열.
 *
 * 받은 것은 `gameData`가 캐시하므로 같은 뱅크를 두 화면이 불러도 요청은 한 번이다
 */
export function useRomLines(bank: number): readonly string[] {
  const [lines, setLines] = useState<readonly string[]>([])
  // 설정의 언어. 바뀌면 글을 그 언어로 다시 받는다
  const locale = useGameLocale()
  useEffect(() => {
    let alive = true
    void loadDialogueBank(locale, bank)
      .then((got) => { if (alive) setLines(got) })
      .catch((e: unknown) => { console.error(`뱅크 ${String(bank)}를 못 받았다`, e) })
    return () => { alive = false }
  }, [locale, bank])
  return lines
}
