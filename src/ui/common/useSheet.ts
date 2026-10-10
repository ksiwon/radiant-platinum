// 시트 한 장을 받아 든다. `undefined`는 아직 오는 중, `null`은 못 받았다(없다)는 뜻이다.
//
// 화면은 두 상태를 가른다 — 오는 중에는 자리만 잡고(칸이 뛰지 않게) 못 받았으면 그림 없이 서는 길을
// 탄다. 로더(`gameData`)가 던지지 않고 `null`을 준다 (SYSTEM §5 P0a 「불러오기」).
import { useEffect, useRef, useState } from 'react'
import type { SpriteSheet } from '../../data/spriteSheet'

/** `key`가 바뀌면 다시 받는다 (언어별 시트는 언어가 key다) */
export function useSheet(load: () => Promise<SpriteSheet | null>, key = ''): SpriteSheet | null | undefined {
  const [sheet, setSheet] = useState<SpriteSheet | null | undefined>(undefined)
  const loader = useRef(load)
  loader.current = load
  useEffect(() => {
    let alive = true
    void loader.current().then((got) => { if (alive) setSheet(got) })
    return () => { alive = false }
  }, [key])
  return sheet
}
