// 「이런 게임은 어떠세요?」 — 같은 사람이 만든 나머지 두 게임으로 가는 창.
// 타이틀 차림표의 마지막 칸이 연다 (`TitleScreen`).
//
// ⚠️ **새 탭으로 연다.** 타이틀에서만 열리니 하던 모험 중은 아니지만, 이 탭에는
// 설치본을 읽어 온 브라우저와 방금 읽은 리포트가 올라와 있다. 구경하러 갔다가
// 돌아올 자리를 없앨 이유가 없다. `rel="noopener"`는 열린 탭이 이 창을 되잡지
// 못하게 한다.
//
// ⚠️ **키로도 닿아야 한다.** 타이틀은 화면에 보이는 것과 커서가 도는 것이 같아야
// 한다는 자리를 이미 한 번 고쳤다(`TitleScreen`의 차림표 다섯). 여기도 마우스로만
// 눌리는 칸을 두지 않는다 — ↑↓로 고르고 Z·Enter로 열고 X·Esc로 닫는다.
import { useRef, useState } from 'react'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import { OTHER_GAMES } from './gameLinks'
import * as css from './otherGames.css'

interface Props { onClose: () => void }

export function OtherGames({ onClose }: Props) {
  const [cursor, setCursor] = useState(0)
  /**
   * 고른 칸의 `<a>`. 키로 결정할 때 여기를 눌러 준다.
   *
   * ⚠️ **`window.open`이 아니다.** 그쪽은 `target`·`rel`을 손으로 다시 적어야
   * 하는데, 링크가 이미 그것을 들고 있다. 사람이 누른 키에서 나는 클릭이라
   * 팝업 차단에도 안 걸린다
   */
  const links = useRef<(HTMLAnchorElement | null)[]>([])

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, OTHER_GAMES.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, OTHER_GAMES.length)) },
    left: () => { setCursor((c) => clampCursor(c, -1, OTHER_GAMES.length)) },
    right: () => { setCursor((c) => clampCursor(c, 1, OTHER_GAMES.length)) },
    confirm: () => { links.current[cursor]?.click() },
    cancel: onClose,
  })

  return (
    // 창 바깥을 누르면 닫힌다. 창 안에서 시작한 클릭은 여기까지 안 온다
    <div className={css.over} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={css.panel}>
        <h2 className={css.title}>이런 게임은 어떠세요?</h2>
        <p className={css.intro}>
          같은 사람이 만든 포켓몬 웹 게임입니다. 설치 없이 브라우저에서 바로 열립니다.
        </p>

        <div className={css.list}>
          {OTHER_GAMES.map((game, i) => (
            <a
              key={game.key}
              ref={(node) => { links.current[i] = node }}
              className={[css.card, i === cursor ? css.cardOn : ''].filter(Boolean).join(' ')}
              href={game.url}
              target="_blank"
              rel="noopener noreferrer"
              onPointerEnter={() => { setCursor(i) }}
            >
              <span className={css.name}>{game.name}</span>
              <span className={css.line}>{game.line}</span>
              <span className={css.go}>새 탭에서 열기 · {game.url.replace('https://', '')}</span>
            </a>
          ))}
        </div>

        <div className={css.foot}>
          <span className={css.hint}>↑↓ 고르기 · Z·Enter 열기 · X 닫기</span>
          <button className={css.close} onClick={onClose}>돌아가기</button>
        </div>
      </div>
    </div>
  )
}
