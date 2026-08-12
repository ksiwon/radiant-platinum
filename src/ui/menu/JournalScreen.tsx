// 모험노트 (PARITY §7.4) — 열 쪽짜리 공책.
//
// 원작은 아래 화면 한 장에 하루를 통째로 그리고, L·R로 쪽을 넘긴다. 우리는 원
// 스크린이라 그 한 장을 화면 가운데에 놓는다.
//
// ⚠️ **표가 아니라 공책이다.** 항목을 상자에 담아 늘어놓으면 「기록 화면」이
// 되어 버리는데, 이건 주인공이 하루를 적어 둔 종이다. 줄지와 왼쪽 여백선,
// 그리고 철한 구멍이 그것을 만든다.
import { useEffect, useState } from 'react'
import { assets, readJson } from '../../data/providers/assetProvider'
import {
  loadItemNames, loadSpeciesNames, loadTrainerNames, loadTrainers,
} from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { mapById } from '../../engine/map/world'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { journalPage, type JournalNames, type JournalPage } from './journalLines'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './journalScreen.css'

export function JournalScreen() {
  const back = useMenuStore((s) => s.back)
  const journal = useSaveStore((s) => s.journal)
  const rivalName = useSaveStore((s) => s.rivalName)
  const [names, setNames] = useState<JournalNames | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    let live = true
    const locale = gameLocale()
    void Promise.all([
      loadUiText('journal', locale),
      loadUiText('gymNames', locale),
      loadUiText('timesOfDay', locale),
      loadUiText('monthNames', locale).catch(() => [] as string[]),
      readJson(assets(), `data/names/locations.${locale}.json`) as Promise<string[]>,
      loadItemNames(locale),
      loadSpeciesNames(locale),
      loadTrainerNames(locale),
      loadTrainers(),
    ]).then(([entries, gyms, times, months, locations, items, species, trainers, table]) => {
      if (!live) return
      setNames({
        entries, gyms, times, months, locations, items, species, trainers,
        trainerClass: (id) => table.get(id).class,
        rivalName,
        labelOf: (mapId) => mapById(mapId)?.label ?? 0,
      })
    }).catch(() => { /* 자료를 못 받으면 빈 노트로 둔다 */ })
    return () => { live = false }
  }, [rivalName])

  // 쓴 쪽만 넘긴다. 열 칸이 다 있지만 뒤쪽은 아직 빈 종이다
  const pages: JournalPage[] = names === null
    ? []
    : journal.map((e) => journalPage(e, names)).filter((p): p is JournalPage => p !== null)

  const count = pages.length
  useMenuKeys({
    cancel: back,
    left: () => { setPage((p) => clampCursor(p, -1, count)) },
    right: () => { setPage((p) => clampCursor(p, 1, count)) },
    up: () => { setPage((p) => clampCursor(p, -1, count)) },
    down: () => { setPage((p) => clampCursor(p, 1, count)) },
  })

  const shown = pages[Math.min(page, Math.max(0, count - 1))] ?? null

  return (
    <MenuScreen
      title="모험노트"
      note={count > 0 ? `${String(Math.min(page, count - 1) + 1)} / ${String(count)}` : undefined}
      foot="← → 쪽 넘기기 · X 닫기"
    >
      <div className={css.stageWide}>
        <div className={own.paper}>
          <div className={own.rings} aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => <span key={i} className={own.ring} />)}
          </div>
          {shown === null
            ? <p className={own.blank}>아직 아무것도 적혀 있지 않다</p>
            : (
              <div className={own.sheet}>
                <div className={own.dateRow}>
                  <span className={own.date}>{shown.date}</span>
                  <span className={own.weekday}>{shown.weekday}</span>
                </div>
                <p className={own.from}>{shown.from}</p>
                <ul className={own.lines}>
                  {shown.lines.map((line, i) => <li key={i} className={own.line}>{line}</li>)}
                </ul>
              </div>
            )}
        </div>
      </div>
    </MenuScreen>
  )
}
