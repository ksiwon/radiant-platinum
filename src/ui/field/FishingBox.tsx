// 낚시 화면 (PARITY §1.5).
//
// 상태는 전부 `scene/fishingSystem`에 있다. 여기는 **그리고, 끝나면 배틀로
// 넘긴다.** `MessageBox`와 같은 방식으로 rAF로 들여다보고 바뀐 프레임에만
// setState 한다 — 프레임마다 스토어를 건드리면 리렌더가 트리 전체로 번진다.
//
// ⚠️ **글을 지어내지 않는다.** 네 줄 다 원작 공용 글묶음(213)의 자리를 읽는다
import { useEffect, useRef, useState } from 'react'
import { COMMON_STRINGS_BANK, FISHING_TEXT, type FishingResult } from '../../engine/actor/fishing'
import { loadDialogueBank } from '../../data/gameData'
import { SFX } from '../../engine/audio/sfx'
import { fieldScripts } from '../../engine/script/field'
import { useGameLocale } from '../../state/optionsStore'
import { endFishing, fishing } from '../../scene/fishingSystem'
import { useBattleStore } from '../../state/battleStore'
import * as box from './messageBox.css'

interface View {
  phase: string
  result: FishingResult | null
}

export function FishingBox() {
  const locale = useGameLocale()
  const [view, setView] = useState<View | null>(null)
  const [bank, setBank] = useState<readonly string[] | null>(null)
  /** 끝을 두 번 처리하지 않는다 — 배틀이 두 번 열린다 */
  const closing = useRef(false)

  useEffect(() => {
    let alive = true
    loadDialogueBank(locale, COMMON_STRINGS_BANK)
      .then((got) => { if (alive) setBank(got) })
      .catch(() => { /* 글 없이도 연출은 돈다 */ })
    return () => { alive = false }
  }, [locale])

  useEffect(() => {
    let raf = 0
    let last = ''
    const poll = (): void => {
      raf = requestAnimationFrame(poll)
      if (fishing.splash) {
        fishing.splash = false
        fieldScripts.services.sound?.playEffect(SFX.CAST_ROD)
      }
      const s = fishing.state
      if (s === null) {
        if (last !== '') { last = ''; setView(null) }
        return
      }
      if (s.phase === 'done' && !closing.current) {
        closing.current = true
        const got = endFishing()
        setView(null)
        last = ''
        if (got) {
          void useBattleStore.getState().startWild({ species: got.species, level: got.level, form: got.form })
        }
        closing.current = false
        return
      }
      const key = `${s.phase}/${s.result ?? ''}`
      if (key === last) return
      last = key
      setView({ phase: s.phase, result: s.result })
    }
    raf = requestAnimationFrame(poll)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  if (view === null) return null
  const text = view.result === null ? null : bank?.[FISHING_TEXT[view.result]] ?? null

  // 낚싯대·찌·입질 표시는 플레이어와 함께 움직이는 3D 씬에서 그린다.
  if (view.phase !== 'message' || text === null) return null

  return (
    <div className={box.frame}>
      <div className={box.box}>
        <div className={box.line}>{text}</div>
        <span className={box.arrow} aria-hidden>▼</span>
      </div>
    </div>
  )
}
