// 리포트 요약 장 — 맨 위 지명 한 줄과 주인공·배지·도감·플레이 시간 넉 줄 (`SaveInfoWindow_Draw`). 도감을 받기 전에는 도감 줄이 없다.
//
// **세 곳이 같은 값을 쓴다.** 시작 메뉴의 「리포트」(`SaveScreen`), **스크립트가 여는 저장**(`OpenSaveInfo` —
// 배틀프런티어 도전 앞에서 이 장이 뜬다), 시작 메뉴 엿보기(`StartPeek`). 베껴 쓰면 한쪽만 고쳐지므로 값은
// `useReportFacts` 한 곳에서 나온다.
//
// 「리포트 한 장」이다 — 숫자 표에 그치지 않고 세이브에 이미 있는 그림을 쓴다: 주인공(`trainer.png`), 배지 여덟
// 자리(`BadgeRail`), 지금 파티(`pokeIcons`). 지어낸 수치는 하나도 없다.
//
// ⚠️ **`dl`은 이 화면에 하나다.** 하네스가 문서의 **마지막 `dl`의 `dd`가 3개 또는 4개**인가로 리포트 화면이 떴는지 본다
// (`run.mjs:1772`). 배지 줄 · 파티 줄 · 주인공 그림은 `dl` 밖의 `div`/`span`이고 `dd`를 안 쓴다.
import { useEffect, useState } from 'react'
import { loadPokedexSort, loadPokeIcons } from '../../data/gameData'
import { loadUiText, SAVE_INFO } from '../../data/uiText'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import type { PokeIcons } from '../../data/schema'
import { fieldScripts } from '../../engine/script/field'
import { FLAG_HAS_POKEDEX } from '../../engine/script/vars'
import { useGameLocale } from '../../state/optionsStore'
import { dexHas, useSaveStore } from '../../state/saveStore'
import { useSessionStore } from '../../state/sessionStore'
import { BadgeRail } from '../common/BadgeRail'
import { dexCounts } from './dexCounts'
import { monIconAt } from './pokeIcon'
import * as own from './saveScreen.css'

/** 전국도감 493종. 본 수를 세는 범위다 */
const DEX_MAX = 493
/** 배지 8개 */
const BADGES = 8

export function countDex(bits: Uint8Array): number {
  let n = 0
  for (let id = 1; id <= DEX_MAX; id++) if (dexHas(bits, id)) n++
  return n
}

export function countBits(value: number, upTo: number): number {
  let n = 0
  for (let i = 0; i < upTo; i++) if ((value >> i) & 1) n++
  return n
}

/** 시:분. 원작이 분까지만 찍는다 */
export function clock(ms: number): string {
  const total = Math.floor(ms / 60000)
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}

/** 요약에 쓰는 값 한 벌 */
export interface ReportFacts {
  /** 지금 선 곳 — 존 배너와 같은 이름이다(집 안은 그 마을 이름). 없으면 null */
  place: string | null
  /** 주인공 이름. 비면 「이름 없음」 */
  player: string
  gender: 'boy' | 'girl'
  /** 가진 배지 비트마스크와 그 수 */
  badges: number
  badgeCount: number
  /** 본 수. 도감을 받기 전에는 0이고, 0이면 줄째로 안 찍는다 */
  dex: number
  /** `시:분` */
  playtime: string
  /** 이름표 넷 (`save_info_window` 뱅크 1~4). 안 오면 빈 문자열 */
  labels: { player: string; badges: string; pokedex: string; playtime: string }
}

/**
 * 도감의 본 수 · 잡은 수. 도감을 받기 전에는 둘 다 0이다.
 *
 * 카드 · 도감 머리와 같은 셈이다 — 전국도감 전에는 신오 목록 안의 수 (`dexCounts`). 목록이 아직 안 왔으면
 * 비트를 통째로 센 본 수로 때운다(잡은 수는 목록 없이 못 센다)
 */
export function useDexTotals(): { seen: number; caught: number } {
  const locale = useGameLocale()
  const pokedex = useSaveStore((s) => s.pokedex)
  const nationalDex = useSaveStore((s) => s.nationalDex)
  const [lists, setLists] = useState<Readonly<Record<string, readonly number[]>> | null>(null)
  useEffect(() => {
    let alive = true
    loadPokedexSort(locale).then((s) => { if (alive) setLists(s.lists) }, () => { if (alive) setLists(null) })
    return () => { alive = false }
  }, [locale])
  if (!fieldScripts.vars.checkFlag(FLAG_HAS_POKEDEX)) return { seen: 0, caught: 0 }
  if (lists === null) return { seen: countDex(pokedex.seen), caught: 0 }
  return dexCounts(lists, nationalDex, pokedex)
}

export function useReportFacts(): ReportFacts {
  const [labels, setLabels] = useState<string[]>([])
  const locale = useGameLocale()
  const trainer = useSaveStore((s) => s.trainer)
  const badges = useSaveStore((s) => s.badges)
  const place = useSessionStore((s) => s.zoneName)
  const dex = useDexTotals().seen

  useEffect(() => {
    let alive = true
    void loadUiText('saveInfo', locale)
      .then((info) => { if (alive) setLabels(info) })
      .catch(() => { /* 이름표가 없어도 값은 뜬다 */ })
    return () => { alive = false }
  }, [locale])

  return {
    place,
    player: trainer.name || '이름 없음',
    gender: trainer.gender,
    badges,
    badgeCount: countBits(badges, BADGES),
    dex,
    playtime: clock(trainer.playtimeMs),
    labels: {
      player: labels[SAVE_INFO.player] ?? '주인공',
      badges: labels[SAVE_INFO.badges] ?? '가진 배지',
      pokedex: labels[SAVE_INFO.pokedex] ?? '포켓몬 도감',
      playtime: labels[SAVE_INFO.playtime] ?? '플레이 시간',
    },
  }
}

/** 파티 줄의 자리 수 */
const PARTY_SLOTS = 6
/** 배지 칸 한 변. 원본 칸(63)보다 작아 부드럽게 줄인다 (`BadgeRail`) */
const BADGE_SIZE = 38
/** 주인공 그림 한 칸 — `trainer.png`는 36×66 둘(남 · 여)이고 정수 2배로 그린다 */
const TRAINER_CELL = { w: 36, h: 66, scale: 2 } as const

/** 이 장이 지금 무엇을 하는가 — 쓰는 중이면 빛띠가 지나가고, 다 썼으면 테두리가 숨 쉰다 */
export type SheetState = 'idle' | 'writing' | 'done'

export function SaveInfo({ state = 'idle' }: { state?: SheetState }) {
  const facts = useReportFacts()
  const party = useSaveStore((s) => s.party)
  const [icons, setIcons] = useState<PokeIcons | undefined>(undefined)
  useEffect(() => {
    let alive = true
    loadPokeIcons().then((got) => { if (alive) setIcons(got) }, () => { /* 아이콘 없이도 장은 선다 */ })
    return () => { alive = false }
  }, [])
  const trainerArt = useAssetImage('data/trainerCase/trainer.png')

  const art = {
    width: TRAINER_CELL.w * TRAINER_CELL.scale,
    height: TRAINER_CELL.h * TRAINER_CELL.scale,
    ...(trainerArt === null ? {} : { backgroundImage: `url(${trainerArt})` }),
    // 시트 전체를 같은 정수 배율로 민다. 남(0)이 왼쪽, 여(1)가 오른쪽이다
    backgroundSize: `${String(TRAINER_CELL.w * 2 * TRAINER_CELL.scale)}px ${String(TRAINER_CELL.h * TRAINER_CELL.scale)}px`,
    backgroundPosition: facts.gender === 'boy' ? '0 0' : `-${String(TRAINER_CELL.w * TRAINER_CELL.scale)}px 0`,
  }

  return (
    <section
      className={state === 'done' ? `${own.sheet} ${own.sheetDone}` : own.sheet}
      data-save-sheet={state}
    >
      {facts.place && <div className={own.place}>{facts.place}</div>}
      <div className={own.who}>
        <div className={own.trainer} style={art} aria-hidden />
        <dl className={own.info}>
          <dt>{facts.labels.player}</dt>
          <dd>{facts.player}</dd>
          <dt>{facts.labels.badges}</dt>
          <dd>{facts.badgeCount}개</dd>
          {/* **본 수**다 — 도감을 받기 전에는 0이고, 0이면 줄째로 안 찍는다 (`SaveInfo_Init`의 `Pokedex_CountSeen` · `SaveInfoWindow_PrintText`) */}
          {facts.dex > 0 && <>
            <dt>{facts.labels.pokedex}</dt>
            <dd>{facts.dex}마리</dd>
          </>}
          <dt>{facts.labels.playtime}</dt>
          <dd>{facts.playtime}</dd>
        </dl>
      </div>
      {/* 못 받은 배지도 같은 칸 · 같은 기준선에 선다. 0개여도 여덟 자리가 다 홈이라 「여덟 개를 모은다」가 보인다 */}
      <div className={own.badges}><BadgeRail badges={facts.badges} size={BADGE_SIZE} /></div>
      {/* 파티가 없으면(박사에게 받기 전) 줄과 그 위 점선을 통째로 뺀다 — 빈 점 여섯을 늘어놓지 않는다 */}
      {party.length > 0 && (
        <div className={own.party} role="group" aria-label="파티">
          {Array.from({ length: PARTY_SLOTS }, (_, i) => {
            const mon = party[i]
            return mon
              ? (
                <span key={i} className={own.slot} data-species={mon.species}>
                  <span style={monIconAt(icons, mon, 1)} />
                </span>
              )
              : <span key={i} className={`${own.slot} ${own.slotEmpty}`} />
          })}
        </div>
      )}
      {state === 'writing' && <span className={own.sweep} aria-hidden />}
    </section>
  )
}
