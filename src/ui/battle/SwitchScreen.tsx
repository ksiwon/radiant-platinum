// 누구를 내보낼까 (PLAN §2.5 · `.audit/menu-ui/switch.md`)
//
// 「출전 대기 줄」이다. 배틀 무대 위로 **파티 여섯의 가로 띠**가 올라오고, 그 아래 **신상 창**이 고른 한 마리의
// 타입 · 기술 넷과 남은 PP · 능력치 · 특성 · 도구를 보이고, 맨 아래 **글 창**이 롬 문장을 띄운다. 위 200px은
// 덮지 않는다 — 상대 체력판이 보여야 고른다.
//
// 결정은 **한 번 누르기**다(Z · 클릭). 「능력치를 본다 / 기술을 본다」는 같은 화면 신상 창의 Tab이다.
//
// ⚠️ **오래 알약 여섯 개였다.** 이름과 레벨만 있었으니 체력도 타입도 기술도 모르는 채로 골라야 했다 — 교체는 그
// 정보로 하는 결정인데 화면에 근거가 없었다.
//
// 값은 전부 배틀에서 온다. 벤치에 있는 애의 체력·기술·특성·능력치·도구까지 요청(`|request|`)에 실려 오므로 세이브를
// 다시 열 이유가 없다 (`battle/choice`의 `partySummary`). 세이브에서 오는 것은 PP와 경험치뿐이다.
import { useEffect, useMemo, useState } from 'react'
import type { BattleAction, PartySlot } from '../../engine/battle/choice'
import { shownType } from '../../engine/battle/movePreview'
import { romAbility } from '../../engine/battle/sim/bridge'
import { loadSpecies, type SpeciesTable } from '../../data/gameData'
import type { Move } from '../../data/schema'
import { expToNextLevel, levelProgress } from '../../engine/pokemon/exp'
import type { RosterEntry } from '../../state/battleStore'
import { useBattleStore } from '../../state/battleStore'
import { dexHas, useSaveStore } from '../../state/saveStore'
import type { MoveSlot, PokemonInstance } from '../../engine/pokemon/instance'
import { maxPpOf } from '../../engine/pokemon/instance'
import { SPECIES_EGG } from '../../engine/pokemon/form'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import { KeyHints } from '../common/KeyHints'
import type { BattleNames } from './messages'
import { MonSheet, type SheetMove, type SheetPage } from './MonSheet'
import { PartyCards, type PartyCard } from './PartyCards'
import { romLine } from './romLine'
import { PARTY, PARTY_BANK } from './romText'
import { useBattleWords } from './battleWords'
import { useRomLines } from './useRomLines'
import { bestMatch, firstPickable, matchView, whyLine, type Foe } from './switchLogic'
import * as css from './switchScreen.css'

/** 이름·타입·특성 이름을 푸는 데 필요한 것 */
interface SwitchNames extends BattleNames {
  types: string[]
  /** 특성 설명. 특성 이름과 같은 색인 */
  abilityText: string[]
  move(id: number): Move | undefined
  /** 그 모습의 타입 둘. 기술 메뉴의 상성과 **같은 함수**다 (BattleScreen의 `Extras`) */
  typesOf(species: number, form: number): readonly number[] | null
}

/**
 * 파티 자리 키(`p1-3`)가 가리키는 세이브의 한 마리. 종이 안 맞으면 없다.
 *
 * ⚠️ **요청의 차례(`PartySlot.index`)로 세이브를 찾지 않는다.** sim은 교체할
 * 때마다 팀 차례를 바꾸고, 선두가 쓰러져 있으면 시작부터 당겨 세운다
 * (`battleStore`의 `awake`) — 한때 그 차례로 찾아서 남의 PP가 떴다. 키는
 * `aftermath.partyKey`가 붙인 세이브 자리 그대로다.
 *
 * 종까지 맞춰 보는 것은 대여 파티 때문이다. 팩토리에서는 배틀의 파티가 세이브의
 * 파티가 아니다 — 그때 남의 개체값·알 표시를 빌려 오지 않는다
 */
function savedOf(
  party: readonly PokemonInstance[], key: string, entry: RosterEntry | undefined,
): PokemonInstance | undefined {
  const n = Number(key.slice(3))
  const mon = Number.isInteger(n) ? party[n] : undefined
  return mon && entry && mon.species === entry.species ? mon : undefined
}

/** `12/20` 꼴. 세이브가 없으면 최대치만 */
function ppText(slot: MoveSlot | undefined, data: Move | undefined): string {
  if (!data) return ''
  if (!slot) return String(data.pp)
  return `${String(slot.pp)}/${String(maxPpOf(slot, data.pp))}`
}


export function SwitchScreen(
  { replacing, actions, party, names, roster, onPick, onBack }: {
    /**
     * 교체로 **빠지는** 자리의 키(더블에서 어느 마리를 바꾸는지). 그 칸 위에 작은 아래 화살표가 선다.
     * 단식이면 안 그린다
     */
    replacing?: string | null
    actions: BattleAction[]
    party: readonly PartySlot[]
    names: SwitchNames | null
    roster: Record<string, RosterEntry>
    onPick: (a: BattleAction) => void
    onBack: (() => void) | null
  },
) {
  /** 그 칸을 내보내는 행동. 없으면 못 내보낸다 (쓰러졌거나 이미 나와 있거나 앞 자리가 골랐다) */
  const actionAt = (i: number): BattleAction | null => {
    const slot = party[i]
    if (!slot) return null
    return actions.find((a) => a.type === 'switch' && a.index === slot.index) ?? null
  }

  // ⚠️ 처음 커서는 **첫 번째로 고를 수 있는 칸**이다 — 기절한 뒤에 쓰러진 마리에서 시작하면 한 번 더 눌러야 한다
  const [at, setAt] = useState(() => firstPickable(party.map((_, i) => actionAt(i) !== null)))
  const [page, setPage] = useState<SheetPage>('moves')
  /** Q/E로 설명을 보고 있는 기술 줄 (기술 쪽에서만). 칸이 바뀌면 걷는다 */
  const [descAt, setDescAt] = useState<number | null>(null)
  const cursor = Math.min(at, Math.max(0, party.length - 1))
  const goto = (next: number): void => { setAt(next); setDescAt(null) }
  const step = (d: number) => (): boolean => {
    const next = clampCursor(cursor, d, party.length)
    if (next === cursor) return false
    goto(next)
    return true
  }
  const chosen = party[cursor] ?? null
  const moveCount = chosen?.moves.length ?? 0
  /** Q · E — 기술 설명을 보는 줄을 옮긴다. 처음 누르면 첫 줄이고, 끝에서 멈춘다 */
  const stepDesc = (d: number) => (): boolean => {
    if (page !== 'moves' || moveCount === 0) return false
    const next = descAt === null ? (d > 0 ? 0 : moveCount - 1) : clampCursor(descAt, d, moveCount)
    if (next === descAt) return false
    setDescAt(next)
    return true
  }

  useMenuKeys({
    up: step(-1),
    down: step(1),
    left: step(-1),
    right: step(1),
    confirm: () => { const a = actionAt(cursor); if (a) onPick(a) },
    cancel: onBack ?? undefined,
    tab: () => { setPage((p) => (p === 'moves' ? 'stats' : 'moves')); setDescAt(null) },
    pageUp: stepDesc(-1),
    pageDown: stepDesc(1),
  })

  const saveParty = useSaveStore((s) => s.party)
  // 기술 메뉴와 같은 규칙이다 — **상대해 본 종에게만** 상성을 적는다 (§2.22)
  const battledDex = useSaveStore((s) => s.pokedex.battled)

  // 상대 자리 둘. 싱글이면 p2b가 비어 있다
  const foeA = useBattleStore((s) => s.view?.active.p2a ?? null)
  const foeB = useBattleStore((s) => s.view?.active.p2b ?? null)
  /**
   * 기술이 얼마나 통하는지를 대고 잴 상대들.
   *
   * ⚠️ **오른쪽 하나로 몰지 않는다.** 한때 p2a만 봤다 — 더블에서 왼쪽 상대에게는 거짓 귀띔이었다. 둘이 같으면 한
   * 마디이고(`sharedMatch`) 다르면 상대 이름을 붙여 둘 다 적는다. 폼도 본다. 로토무는 모습마다 타입이 다르다
   */
  const foes = useMemo(() => {
    const out: Foe[] = []
    for (const m of [foeA, foeB]) {
      if (m === null || m.species === null || m.fainted) continue
      const it = roster[m.key]
      out.push({
        name: it?.nickname ?? names?.species[m.species] ?? '',
        types: names?.typesOf(m.species, it?.form ?? 0) ?? null,
        known: dexHas(battledDex, m.species),
      })
    }
    return out
  }, [foeA, foeB, names, roster, battledDex])

  // 다음 레벨까지는 종의 경험 곡선이 있어야 센다. 자료가 오기 전에는 그 줄이 없다
  const [speciesTable, setSpeciesTable] = useState<SpeciesTable | null>(null)
  useEffect(() => {
    let alive = true
    void loadSpecies().then((got) => { if (alive) setSpeciesTable(got) }).catch(() => { /* 그 줄만 빠진다 */ })
    return () => { alive = false }
  }, [])

  const entry = chosen ? roster[chosen.key] : undefined
  const types = entry ? names?.typesOf(entry.species, entry.form) ?? null : null
  const saved = chosen ? savedOf(saveParty, chosen.key, entry) : undefined
  // 잠재파워는 **쓰는 쪽**의 개체값이 타입을 정한다. 세이브에 없으면 적힌 타입이다
  const ivs = saved?.ivs ?? null

  const cards = party.map((slot, i): PartyCard => {
    const it = roster[slot.key]
    const own = savedOf(saveParty, slot.key, it)
    const egg = own?.isEgg ?? false
    return {
      slot,
      // 알의 이름은 「알」이다 — 종족 이름은 안에 든 것을 알려 준다 (SummaryScreen과 같은 규칙)
      label: egg ? names?.species[SPECIES_EGG] ?? '' : it?.nickname ?? (it ? names?.species[it.species] : null) ?? slot.key,
      level: it?.level ?? '?',
      mon: it ? { species: it.species, form: it.form, isEgg: own?.isEgg ?? false } : null,
      can: !egg && actionAt(i) !== null,
      best: bestMatch(slot.moves.map((m) => (m.move === null ? undefined : names?.move(m.move))), foes, own?.ivs ?? null),
    }
  })

  // 배틀 안 파티 화면의 글 (PARITY §2.26). 원작도 이 화면은 배틀 위 화면과 **다른 뱅크**를 연다
  const partyLines = useRomLines(PARTY_BANK)
  const words = useBattleWords()
  const who = cards[cursor]?.label ?? null
  const lineId = whyLine(chosen, actionAt(cursor) !== null)
  const say = lineId === null ? null : romLine(partyLines, lineId, who)
  const keys = [
    ...(actionAt(cursor) !== null ? [`Z ${romLine(partyLines, PARTY.shiftButton) ?? ''}`] : []),
    `Tab ${romLine(partyLines, page === 'moves' ? PARTY.summaryButton : PARTY.checkMovesButton) ?? ''}`,
    ...(onBack !== null ? [words.close] : []),
  ].join(' · ')

  const sheetMoves: SheetMove[] = (chosen?.moves ?? []).map((m, i) => {
    // 남은 PP는 **세이브가 정본**이다. 요청에는 나와 있는 한 마리 것만 실려 오고, 벤치에 있는 애의 PP는 배틀 중에
    // 줄지 않는다
    const data = m.move === null ? undefined : names?.move(m.move)
    // 칸 색과 타입 이름도 기술 메뉴처럼 **보이는 타입**이다 (잠재파워)
    const type = data ? shownType(data, ivs) : 0
    return {
      key: `${m.id}-${String(i)}`,
      name: (m.move === null ? null : names?.moves[m.move]) ?? m.id,
      type,
      typeName: names?.types[type] ?? '',
      data,
      match: matchView(data, foes, ivs),
      pp: ppText(saved?.moves[i], data),
    }
  })

  // ⚠️ **영어 이름표에 안 묻는다.** 프로토콜이 주는 `sandstream` 같은 아이디를 번호로 되돌리는 일은 sim 덱스가 이미
  // 한다 — 한때는 `names/labels.en.json`의 차례와 맞췄는데, **그 파일은 영어 롬 설치본에만 있다.** 한국·일본 롬으로
  // 깔면 그 한 파일이 404가 나면서 배틀 이름표가 통째로 안 왔다 (REPAIR §29)
  const abilityIdx = chosen ? romAbility(chosen.ability) ?? -1 : -1
  const ability = abilityIdx >= 0
    ? { name: names?.abilities[abilityIdx] ?? '', text: names?.abilityText[abilityIdx] ?? '' } : null

  // 도구는 요청이 말한다(배틀 중에 썼으면 빈 글). 어떤 도구인지는 세이브가 안다 — 세이브가 없으면(대여 파티) 줄을
  // 감춘다. 지어내지 않는다
  const item = chosen === null ? undefined
    : chosen.item === '' ? 'none' as const
      : saved && saved.heldItem > 0 ? { id: saved.heldItem, name: names?.items[saved.heldItem] ?? '' }
        : undefined

  const info = saved && speciesTable ? speciesTable.of(saved) : undefined
  const next = saved && info && !saved.isEgg
    ? { left: expToNextLevel(info.growthRate, saved.exp), ratio: levelProgress(info.growthRate, saved.exp) }
    : null

  return (
    <div className={css.sheet}>
      <div className={css.railSlot}>
        <PartyCards
          cards={cards}
          cursor={cursor}
          hereText={words.here}
          replacing={replacing ?? null}
          onHover={goto}
          onPick={(i) => { const a = actionAt(i); if (a) onPick(a) }}
        />
      </div>

      {chosen ? (
        <MonSheet
          slot={chosen}
          label={cards[cursor]?.label ?? chosen.key}
          level={entry?.level ?? '?'}
          species={entry?.species ?? null}
          form={entry?.form ?? 0}
          types={(types ?? []).filter((t, i, all) => all.indexOf(t) === i)}
          typeNames={names?.types ?? []}
          moves={sheetMoves}
          page={page}
          onPage={(p) => { setPage(p); setDescAt(null) }}
          descAt={page === 'moves' ? descAt : null}
          next={next}
          ability={ability}
          item={item}
        />
      ) : (
        <div className={css.empty}>{words.partyBlocked}</div>
      )}

      <div className={css.line}>
        <div className={say?.includes('\n') ? `${css.say} ${css.sayTwo}` : css.say}>{say ?? ''}</div>
        <div className={css.keys}><KeyHints text={keys} /></div>
      </div>
    </div>
  )
}
