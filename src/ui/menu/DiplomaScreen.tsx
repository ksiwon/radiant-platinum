// 도감 완성 상장 (PARITY §5 `diploma`)
//
// 신오도감을 다 채우면 축복시티 크로스TV에서, 전국도감을 다 채우면 다시 한 번
// 준다 (`ShowDiplomaSinnoh` · `ShowDiplomaNationalDex`). 네 줄이 전부 롬의
// 글이다 (`TEXT_BANK_DIPLOMA`).
//
// ⚠️ **메뉴 창이 아니다.** 이건 벽에 거는 종이 한 장이라, 다른 화면과 같은
// 어두운 판에 얹으면 「알림창」이 된다.
//
// ⚠️ **종이는 원작 그림이다** (`diplomaArt.png` — 신오 · 전국도감 두 칸). 도감을 얼마나 채웠는가를 글만이 아니라 종이가
// 말한다. 그림을 **정수배**로 세우고 글을 원작 자리(`diploma.c`의 타일 좌표)에 얹는다. 한동안 지어낸 「DIPLOMA」 글자가
// 봉인 자리에 찍혀 있었다 — 롬 뱅크에는 네 줄뿐이다. 그림이 없는 판은 옛 크림 종이로 떨어진다.
import { useEffect, useState, type CSSProperties } from 'react'
import { loadDiplomaArt } from '../../data/gameData'
import { atlasUrl } from '../../data/providers/atlas'
import { fillMenuText, loadUiText } from '../../data/uiText'
import type { SpriteSheet } from '../../data/spriteSheet'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { KeyHints } from '../common/KeyHints'
import { DIPLOMA_AT, DIPLOMA_H, DIPLOMA_W, diplomaCell, diplomaScale } from './recordsLayout'
import { useMenuKeys } from './useMenuKeys'
import * as own from './diploma.css'

/** `diploma` 뱅크의 줄 자리 */
const LINE = { player: 0, sinnoh: 1, national: 2, maker: 3 } as const

/** 바닥 안내 */
const FOOT = 'Z · X 닫기'

/** 창 크기와 거기서 정한 종이 정수 배율. 창이 바뀌면 둘 다 다시 잰다 (바탕이 창을 채우는 배율도 창 크기를 따른다) */
function useView(): { scale: 1 | 2 | 3 | 4, w: number, h: number } {
  const read = (): { scale: 1 | 2 | 3 | 4, w: number, h: number } => (
    { scale: diplomaScale(window.innerWidth, window.innerHeight), w: window.innerWidth, h: window.innerHeight }
  )
  const [view, setView] = useState(read)
  useEffect(() => {
    const fit = (): void => { setView(read()) }
    window.addEventListener('resize', fit)
    return () => { window.removeEventListener('resize', fit) }
  }, [])
  return view
}

/**
 * 구운 그림에서 종이와 바탕을 자른다. 칸 하나가 256×384 — 위 192줄이 바탕(한 색), 아래 192줄이 종이다.
 * `k`는 종이의 정수 배율이고 바탕은 화면을 채우도록 더 크게(소수여도 한 색이라 상관없다) 늘인다
 */
function artStyles(sheet: SpriteSheet, national: boolean, k: number, view: { w: number, h: number }): {
  paper: CSSProperties
  backdrop: CSSProperties
} | null {
  const url = atlasUrl(sheet.path)
  if (url === '') return null
  const col = diplomaCell(national)
  const cellW = sheet.cellW
  const sheetW = sheet.cellW * sheet.cols
  const sheetH = sheet.cellH
  const fill = Math.ceil(Math.max(view.w / cellW, view.h / (sheet.cellH / 2)))
  return {
    paper: {
      width: DIPLOMA_W * k,
      height: DIPLOMA_H * k,
      backgroundImage: `url(${url})`,
      backgroundSize: `${String(sheetW * k)}px ${String(sheetH * k)}px`,
      backgroundPosition: `-${String(col * cellW * k)}px -${String(DIPLOMA_H * k)}px`,
    },
    backdrop: {
      backgroundImage: `url(${url})`,
      backgroundSize: `${String(sheetW * fill)}px ${String(sheetH * fill)}px`,
      backgroundPosition: `-${String(col * cellW * fill)}px 0`,
    },
  }
}

export function DiplomaScreen() {
  const back = useMenuStore((s) => s.back)
  const national = useMenuStore((s) => s.diplomaNational)
  const trainer = useSaveStore((s) => s.trainer)
  const [text, setText] = useState<string[]>([])
  /** `undefined`는 오는 중, `null`은 그림이 없다 */
  const [sheet, setSheet] = useState<SpriteSheet | null | undefined>(undefined)
  const { scale, w: viewW, h: viewH } = useView()

  useEffect(() => {
    let alive = true
    void loadUiText('diploma', gameLocale())
      .then((lines) => { if (alive) setText(lines) })
      .catch(() => { /* 글 없이는 종이만 뜬다 */ })
    void loadDiplomaArt().then((got) => { if (alive) setSheet(got) })
    return () => { alive = false }
  }, [])

  useMenuKeys({ confirm: back, cancel: back })

  const body = text[national ? LINE.national : LINE.sinnoh] ?? ''
  const player = fillMenuText(text[LINE.player] ?? '', [trainer.name])
  const maker = text[LINE.maker] ?? ''
  const art = sheet ? artStyles(sheet, national, scale, { w: viewW, h: viewH }) : null

  /** 글 한 덩어리의 자리 — 원작 256×192 안의 픽셀을 배율로 옮긴다. 원작 줄 간격이 16이다 */
  const placed = (at: { x: number, y: number }): CSSProperties => ({
    left: at.x * scale,
    top: at.y * scale,
    fontSize: 10 * scale,
    lineHeight: `${String(16 * scale)}px`,
  })

  return (
    <div className={own.overlay}>
      {art !== null && <div className={own.backdrop} style={art.backdrop} aria-hidden />}
      {sheet === undefined
        ? null
        : art !== null
          ? (
            <div className={own.paper} style={art.paper}>
              <p className={`${own.text} ${own.player}`} style={placed(DIPLOMA_AT.player)}>{player}</p>
              <p className={own.text} style={placed(DIPLOMA_AT.body)}>{body}</p>
              <p className={own.text} style={{ ...placed(DIPLOMA_AT.maker), fontWeight: 700 }}>{maker}</p>
            </div>
          )
          : (
            <div className={own.fallback}>
              <p className={own.fallbackBody}>{body}</p>
              <div className={own.fallbackPlayer}>{player}</div>
              <div className={own.fallbackMaker}>{maker}</div>
            </div>
          )}
      <div className={own.hint}>
        <KeyHints text={FOOT} />
      </div>
    </div>
  )
}
