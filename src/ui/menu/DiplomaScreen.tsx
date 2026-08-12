// 도감 완성 상장 (PARITY §5 `diploma`)
//
// 신오도감을 다 채우면 축복시티 크로스TV에서, 전국도감을 다 채우면 다시 한 번
// 준다 (`ShowDiplomaSinnoh` · `ShowDiplomaNationalDex`). 네 줄이 전부 롬의
// 글이다 (`TEXT_BANK_DIPLOMA`).
//
// ⚠️ **메뉴 창이 아니다.** 이건 벽에 거는 종이 한 장이라, 다른 화면과 같은
// 어두운 판에 얹으면 「알림창」이 된다.
import { useEffect, useState } from 'react'
import { fillMenuText, loadUiText } from '../../data/uiText'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { useMenuKeys } from './useMenuKeys'
import * as own from './diploma.css'

/** `diploma` 뱅크의 줄 자리 */
const LINE = { player: 0, sinnoh: 1, national: 2, maker: 3 } as const

export function DiplomaScreen() {
  const back = useMenuStore((s) => s.back)
  const national = useMenuStore((s) => s.diplomaNational)
  const trainer = useSaveStore((s) => s.trainer)
  const [text, setText] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    void loadUiText('diploma', gameLocale())
      .then((lines) => { if (alive) setText(lines) })
      .catch(() => { /* 글 없이는 종이만 뜬다 */ })
    return () => { alive = false }
  }, [])

  useMenuKeys({ confirm: back, cancel: back })

  return (
    <div className={own.overlay}>
      <div className={own.paper}>
        <div className={own.crest}>DIPLOMA</div>
        <p className={own.body}>{text[national ? LINE.national : LINE.sinnoh] ?? ''}</p>
        <div className={own.player}>
          {fillMenuText(text[LINE.player] ?? '', [trainer.name])}
        </div>
        <div className={own.maker}>{text[LINE.maker] ?? ''}</div>
      </div>
      <div className={own.hint}>Z · X 닫는다</div>
    </div>
  )
}
