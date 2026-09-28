// 운하시티 도서관 3층의 텔레비전 뉴스 (`StartLibraryTV` · `library_tv/library_tv.c`)
//
// 필드가 어두워진 뒤 한 화면에 원작 판 셋을 겹친다(`data/libraryTv.png` · DATA §2.21d) — BG3 뉴스 그림, 그 위에
// BG1 주사선을 4:12로 섞어(불투명도 4/16) 한 프레임에 0.25픽셀씩 흘리고, 맨 위에 BG0 텔레비전 틀. 6프레임에 밝아지고
// 240프레임(`90 + 150`) 서 있다가 6프레임에 어두워지면 스크립트가 이어진다. 누르기를 안 받는다.
import { useEffect, useRef, useState } from 'react'
import { atlasUrl } from '../../data/providers/atlas'
import { LIBRARY_TV_ATLAS, loadLibraryTv } from '../../data/gameData'
import * as css from './libraryTv.css'

/** 원작 한 프레임 */
const FRAME_MS = 1000 / 60
/** 밝아지는 · 어두워지는 프레임 (`StartScreenFade(…, 6, 1, …)`) */
const FADE = 6
/** 서 있는 프레임 (`LIBRARY_TV_DURATION`) */
const HOLD = 90 + 150
/** 판 셋의 자리 — 아틀라스 256×640의 위에서부터 */
const SHEET = { h: 640, scan: 192 } as const

/** 주사선이 내려간 양 — `scanLinePos += 4` · `Bg_SetOffset(…, scanLinePos >> 4)` */
function scanOffset(frame: number): number {
  return (Math.max(0, Math.floor(frame)) * 4) >> 4
}

export function LibraryTvScreen({ onDone }: { onDone: () => void }) {
  const [ready, setReady] = useState(false)
  const scan = useRef<HTMLDivElement>(null)
  const shade = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void loadLibraryTv().then(() => { if (alive) setReady(true) })
      .catch(() => { if (alive) onDone() })
    return () => { alive = false }
  }, [onDone])

  useEffect(() => {
    if (!ready) return
    let raf = 0
    const start = performance.now()
    let ended = false
    const tick = (): void => {
      const f = (performance.now() - start) / FRAME_MS
      // ⚠️ **주사선 판은 타일 하나를 깐 것이라 세로 8픽셀마다 같다** (`intro_tv` 5번의 칸이 전부 0) — 8로 돌려 아틀라스 안에서 끝낸다
      if (scan.current) scan.current.style.backgroundPositionY = `${String(((SHEET.scan + (scanOffset(f) % 8)) / (SHEET.h - 192)) * 100)}%`
      if (shade.current) {
        const out = f - (FADE + HOLD)
        shade.current.style.opacity = String(f < FADE ? 1 - f / FADE : out > 0 ? Math.min(1, out / FADE) : 0)
      }
      if (f >= FADE + HOLD + FADE) {
        if (!ended) { ended = true; onDone() }
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf) }
  }, [ready, onDone])

  const url = ready ? `url("${atlasUrl(LIBRARY_TV_ATLAS)}")` : 'none'
  return (
    <div className={css.backdrop}>
      <div className={css.stage}>
        <div className={css.layer} style={{ backgroundImage: url, backgroundPositionY: '0%' }} />
        <div ref={scan} className={css.scan} style={{ backgroundImage: url }} />
        <div className={css.layer} style={{ backgroundImage: url, backgroundPositionY: '100%' }} />
        <div ref={shade} className={css.shade} />
      </div>
    </div>
  )
}
