// 물음표 하나로 펼치는 설명 (IMPORT.md §4)
//
// ⚠️ **`title` 속성이 아니다.** 그건 여러 줄을 못 담고, 터치 기기에서는 아예
// 안 뜨며, 읽어 주는지도 브라우저마다 다르다. 여기서 설명해야 하는 것은
// 「AssetAssistant가 무엇이고 어디 있는가」처럼 **폴더 나무가 들어가는 글**이라
// 한 줄짜리 장치로는 안 된다.
import { useEffect, useId, useRef, useState } from 'react'
import * as css from './hint.css'

export function Hint({ label, children }: {
  /** 무엇에 대한 설명인지. 눈에는 안 보이고 읽어 주는 이름이 된다 */
  label: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)

  // 바깥을 누르거나 Esc를 누르면 닫는다. 안 닫히면 다음 것을 가린다
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <span className={css.wrap} ref={wrap}>
      <button
        type="button"
        className={css.button}
        aria-label={`${label} 설명`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => { setOpen((o) => !o) }}
      >
        ?
      </button>
      {/* ⚠️ **열렸을 때만 그린다.** 감춰 두면 화면에는 없는데 문서에는 있어서
          찾기와 스크린 리더에 그대로 읽힌다 */}
      {open && <span className={css.bubble} id={id} role="note">{children}</span>}
    </span>
  )
}

/** 폴더 나무 한 덩이. `Hint` 안에서 쓴다 */
export function HintTree({ children }: { children: string }) {
  return <span className={css.tree}>{children}</span>
}

/** 「이건 안내하지 않는다」처럼 밑에 따로 다는 줄 */
export function HintCaveat({ children }: { children: React.ReactNode }) {
  return <span className={css.caveat}>{children}</span>
}
