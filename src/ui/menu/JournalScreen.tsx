// 모험노트 (PARITY §7.4) — 열 쪽짜리 공책.
//
// 원작은 아래 화면 한 장에 하루를 통째로 그리고, L·R로 쪽을 넘긴다. 우리는 원 스크린이라 그 한 장을 창 가운데에
// 놓는다. 창 안에 종이 한 장뿐이고 판을 더 깔지 않는다.
//
// ⚠️ **표가 아니라 공책이다.** 항목을 상자에 담아 늘어놓으면 「기록 화면」이 되어 버리는데, 이건 주인공이 하루를
// 적어 둔 종이다. 장소 일은 발자국 줄(금 점 + 세로선)로, 포켓몬 · 트레이너 일은 한 줄 띄워 점 없이 둔다 —
// 원작 인쇄기가 이 차례로 찍는다.
//
// 키: ←→↑↓가 쪽을 넘기고 **A(Z · Enter)도 다음 쪽**이다 (`journal_controller.c:324-351`). 마지막 쪽에서는 아무 일도 없다.
import { useEffect, useRef, useState } from 'react'
import { assets, readJson } from '../../data/providers/assetProvider'
import {
  loadItemNames, loadSpeciesNames, loadTrainerNames, loadTrainers,
} from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { mapById } from '../../engine/map/world'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import {
  bookmarkLabels, journalPage, nextPage, type JournalNames, type JournalPage,
} from './journalLines'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import { PaperSheet } from './PaperSheet'
import * as own from './journalScreen.css'

/** 철한 구멍은 종이 높이(약 536)에 맞춰 다섯이다 */
const RINGS = 5

export function JournalScreen() {
  const back = useMenuStore((s) => s.back)
  const journal = useSaveStore((s) => s.journal)
  const rivalName = useSaveStore((s) => s.rivalName)
  const [names, setNames] = useState<JournalNames | null>(null)
  // 이어하기가 저절로 펼친 노트는 **지난번 쪽**에서 시작한다 (`scene/journal`)
  const [page, setPage] = useState(useMenuStore.getState().journalAt)
  // 쪽을 넘긴 방향 — 종이 안 내용이 그쪽으로 8px 밀리며 들어온다
  const dir = useRef(1)

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
  const at = Math.min(page, Math.max(0, count - 1))
  const go = (to: number): void => {
    dir.current = to >= at ? 1 : -1
    setPage(to)
  }
  useMenuKeys({
    cancel: back,
    left: () => { go(clampCursor(at, -1, count)) },
    right: () => { go(clampCursor(at, 1, count)) },
    up: () => { go(clampCursor(at, -1, count)) },
    down: () => { go(clampCursor(at, 1, count)) },
    confirm: () => { go(nextPage(at, count)) },
  })

  const shown = pages[at] ?? null
  const marks = bookmarkLabels(pages)
  // 장소 일은 앞에서부터 이어 붙어 있다 — 나머지와 한 줄 띄워 가른다
  const places = shown?.lines.filter((l) => l.kind === 'place') ?? []
  const rest = shown?.lines.filter((l) => l.kind !== 'place') ?? []

  return (
    <MenuScreen
      title="모험노트"
      note={count > 0 ? `${String(at + 1)} / ${String(count)}` : undefined}
      foot={count > 1 ? '←→ 쪽 넘기기 · X 닫기' : 'X 닫기'}
    >
      <div className={own.body}>
        {/* key가 쪽이라 쪽이 바뀔 때마다 새로 서며 움직임이 다시 돈다 */}
        <PaperSheet
          key={at}
          rings={RINGS}
          marginAt={64}
          ruleTop={40}
          className={own.paper}
          style={{ ['--turn' as string]: dir.current > 0 ? '8px' : '-8px' }}
        >
          {shown === null
            ? <p className={own.blank}>아직 아무것도 적혀 있지 않다</p>
            : (
              <>
                <div className={own.dateRow}>
                  <span className={own.date}>{shown.date}</span>
                  <span className={own.weekday}>{shown.weekday}</span>
                </div>
                <p className={own.from}>{shown.from}</p>
                {places.length > 0 && (
                  <ul className={`${own.trail} ${own.place}`}>
                    {places.map((l, i) => <li key={i} className={`${own.line} ${own.dot}`}>{l.text}</li>)}
                  </ul>
                )}
                {places.length > 0 && rest.length > 0 && <div className={own.gap} />}
                {rest.length > 0 && (
                  <ul className={own.trail}>
                    {rest.map((l, i) => <li key={i} className={own.line}>{l.text}</li>)}
                  </ul>
                )}
              </>
            )}
        </PaperSheet>
        {marks.length > 0 && (
          <div className={own.tabs} aria-hidden="true">
            {marks.map((m, i) => <div key={i} className={i === at ? own.tabOn : own.tab}>{m}</div>)}
          </div>
        )}
      </div>
    </MenuScreen>
  )
}
