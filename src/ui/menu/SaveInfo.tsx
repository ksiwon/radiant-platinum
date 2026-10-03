// 리포트 요약창 — 맨 위 지명 한 줄과 주인공·배지·도감·플레이 시간 넉 줄 (`SaveInfoWindow_Draw`). 도감을 받기 전에는 도감 줄이 없다.
//
// **두 곳이 같은 창을 쓴다.** 시작 메뉴의 「리포트」(`SaveScreen`)와, **스크립트가
// 여는 저장**(`OpenSaveInfo` — 배틀프런티어 도전 앞에서 이 창이 뜬다)이다.
// 베껴 쓰면 한쪽만 고쳐지므로 여기 한 벌만 둔다.
import { useEffect, useState } from 'react'
import { loadPokedexSort } from '../../data/gameData'
import { loadUiText, SAVE_INFO } from '../../data/uiText'
import { fieldScripts } from '../../engine/script/field'
import { FLAG_HAS_POKEDEX } from '../../engine/script/vars'
import { useGameLocale } from '../../state/optionsStore'
import { dexHas, useSaveStore } from '../../state/saveStore'
import { useSessionStore } from '../../state/sessionStore'
import { dexCounts } from './dexCounts'
import * as own from './dialog.css'

/** 전국도감 493종. 본 수를 세는 범위다 */
const DEX_MAX = 493
/** 배지 8개 */
const BADGES = 8

export function countDex(bits: Uint8Array): number {
  let n = 0
  for (let id = 1; id <= DEX_MAX; id++) if (dexHas(bits, id)) n++
  return n
}

function countBits(value: number, upTo: number): number {
  let n = 0
  for (let i = 0; i < upTo; i++) if ((value >> i) & 1) n++
  return n
}

/** 시:분. 원작이 분까지만 찍는다 */
export function clock(ms: number): string {
  const total = Math.floor(ms / 60000)
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}

export function SaveInfo() {
  const [labels, setLabels] = useState<string[]>([])
  const locale = useGameLocale()
  const save = useSaveStore()
  // 지금 선 곳 — 존 배너와 같은 이름이다(집 안은 그 마을 이름)
  const place = useSessionStore((s) => s.zoneName)
  // 도감 줄은 트레이너 카드와 같은 셈이다 — 전국도감 전에는 신오 목록 안의 본 수 (`dexCounts`)
  const [lists, setLists] = useState<Readonly<Record<string, readonly number[]>> | null>(null)
  useEffect(() => {
    let alive = true
    loadPokedexSort(locale).then((s) => { if (alive) setLists(s.lists) }, () => { if (alive) setLists(null) })
    return () => { alive = false }
  }, [locale])
  const dex = !fieldScripts.vars.checkFlag(FLAG_HAS_POKEDEX) ? 0
    : lists === null ? countDex(save.pokedex.seen) : dexCounts(lists, save.nationalDex, save.pokedex).seen

  useEffect(() => {
    let alive = true
    void loadUiText('saveInfo', locale)
      .then((info) => { if (alive) setLabels(info) })
      .catch(() => { /* 이름표가 없어도 값은 뜬다 */ })
    return () => { alive = false }
  }, [locale])

  return (
    <dl className={own.info}>
      {place && <dt className={own.infoPlace}>{place}</dt>}
      <dt>{labels[SAVE_INFO.player] ?? '주인공'}</dt>
      <dd>{save.trainer.name || '이름 없음'}</dd>
      <dt>{labels[SAVE_INFO.badges] ?? '가진 배지'}</dt>
      <dd>{countBits(save.badges, BADGES)}개</dd>
      {/* **본 수**다 — 도감을 받기 전에는 0이고, 0이면 줄째로 안 찍는다 (`SaveInfo_Init`의 `Pokedex_CountSeen` · `SaveInfoWindow_PrintText`) */}
      {dex > 0 && <>
        <dt>{labels[SAVE_INFO.pokedex] ?? '포켓몬 도감'}</dt>
        <dd>{dex}마리</dd>
      </>}
      <dt>{labels[SAVE_INFO.playtime] ?? '플레이 시간'}</dt>
      <dd>{clock(save.trainer.playtimeMs)}</dd>
    </dl>
  )
}
