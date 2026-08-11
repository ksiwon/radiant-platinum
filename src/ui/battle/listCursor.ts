// 배틀 명령 목록의 커서.
//
// 칸이 세로로 한 줄이라 위아래가 한 칸씩 움직인다. 좌우도 같이 받는 이유는
// 원작이 십자키 게임이어서다 — 오른쪽을 눌렀는데 아무 일도 안 일어나면
// 고장으로 읽힌다.
//
// `BattleScreen` 안에 있던 것을 꺼냈다. 기술을 잊는 물음(`LearnMove`)도
// 같은 커서를 써야 한다 — 같은 자리에 뜨는 목록이라 움직임이 다르면 안 된다.
import { useState } from 'react'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'

export function useListCursor(
  count: number, onPick: (i: number) => void, onBack?: () => void,
): number {
  const [at, setAt] = useState(0)
  const cursor = Math.min(at, Math.max(0, count - 1))
  const step = (d: number) => () => { setAt(clampCursor(cursor, d, count)) }
  useMenuKeys({
    up: step(-1),
    down: step(1),
    left: step(-1),
    right: step(1),
    confirm: () => { onPick(cursor) },
    cancel: onBack,
  })
  return cursor
}
