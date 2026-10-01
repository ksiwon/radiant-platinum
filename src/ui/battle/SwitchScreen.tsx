// 누구를 내보낼까 (PLAN §2.5)
//
// 원작(BDSP)의 교체 화면은 **왼쪽에 파티 여섯, 오른쪽에 고른 한 마리의 속사정**
// 이다: 타입 · 기술 넷과 남은 PP · 특성과 그 설명, 그리고 그 기술이 지금 상대에게
// 얼마나 통하는지.
//
// ⚠️ **오래 알약 여섯 개였다.** 이름과 레벨만 있었으니 체력도 타입도 기술도
// 모르는 채로 골라야 했다 — 교체는 그 정보로 하는 결정인데 화면에 근거가 없었다.
//
// 값은 전부 배틀에서 온다. 벤치에 있는 애의 체력·기술·특성까지 요청(`|request|`)에
// 실려 오므로 세이브를 다시 열 이유가 없다 (`battle/choice`의 `partySummary`).
import { useMemo, useState } from 'react'
import type { BattleAction, PartySlot } from '../../engine/battle/choice'
import { MATCH_LABEL, sharedMatch, shownType } from '../../engine/battle/movePreview'
import { romAbility } from '../../engine/battle/sim/bridge'
import type { Move } from '../../data/schema'
import type { RosterEntry } from '../../state/battleStore'
import { useBattleStore } from '../../state/battleStore'
import { dexHas, useSaveStore } from '../../state/saveStore'
import type { MoveSlot, PokemonInstance } from '../../engine/pokemon/instance'
import { maxPpOf } from '../../engine/pokemon/instance'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import type { BattleNames } from './messages'
import { PartyCards, type PartyCard } from './PartyCards'
import { romLine } from './romLine'
import { PARTY, PARTY_BANK } from './romText'
import { useRomLines } from './useRomLines'
import { typeColor } from './typeColor'
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
  { actions, party, names, roster, onPick, onBack }: {
    actions: BattleAction[]
    party: readonly PartySlot[]
    names: SwitchNames | null
    roster: Record<string, RosterEntry>
    onPick: (a: BattleAction) => void
    onBack: (() => void) | null
  },
) {
  const [at, setAt] = useState(0)
  const cursor = Math.min(at, Math.max(0, party.length - 1))
  const step = (d: number) => () => { setAt(clampCursor(cursor, d, party.length)) }

  /** 그 칸을 내보내는 행동. 없으면 못 내보낸다 (쓰러졌거나 이미 나와 있다) */
  const actionAt = (i: number): BattleAction | null => {
    const slot = party[i]
    if (!slot) return null
    return actions.find((a) => a.type === 'switch' && a.index === slot.index) ?? null
  }

  useMenuKeys({
    up: step(-1),
    down: step(1),
    left: step(-1),
    right: step(1),
    confirm: () => { const a = actionAt(cursor); if (a) onPick(a) },
    cancel: onBack ?? undefined,
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
   * ⚠️ **오른쪽 하나로 몰지 않는다.** 한때 p2a만 봤다 — 더블에서 왼쪽 상대에게는
   * 거짓 귀띔이었다. 둘 다 재고 같을 때만 적는다 (`sharedMatch`).
   * 폼도 본다. 로토무는 모습마다 타입이 다르다
   */
  const foes = useMemo(() => {
    const out: { types: readonly number[] | null; known: boolean }[] = []
    for (const m of [foeA, foeB]) {
      if (m === null || m.species === null || m.fainted) continue
      out.push({
        types: names?.typesOf(m.species, roster[m.key]?.form ?? 0) ?? null,
        known: dexHas(battledDex, m.species),
      })
    }
    return out
  }, [foeA, foeB, names, roster, battledDex])

  const chosen = party[cursor] ?? null
  const entry = chosen ? roster[chosen.key] : undefined
  const types = entry ? names?.typesOf(entry.species, entry.form) ?? null : null
  const saved = chosen ? savedOf(saveParty, chosen.key, entry) : undefined
  // 잠재파워는 **쓰는 쪽**의 개체값이 타입을 정한다. 세이브에 없으면 적힌 타입이다
  const ivs = saved?.ivs ?? null

  const cards = party.map((slot, i): PartyCard => {
    const it = roster[slot.key]
    return {
      slot,
      label: it?.nickname ?? (it ? names?.species[it.species] : null) ?? slot.key,
      level: it?.level ?? '?',
      mon: it ? {
        species: it.species,
        form: it.form,
        isEgg: savedOf(saveParty, slot.key, it)?.isEgg ?? false,
      } : null,
      can: actionAt(i) !== null,
      note: slot.active ? '나와 있다' : null,
    }
  })

  // 배틀 안 파티 화면의 글 (PARITY §2.26). 원작도 이 화면은 배틀 위 화면과
  // **다른 뱅크**를 연다 (`battle_party.c`의 `MessageLoader_Init`)
  const partyLines = useRomLines(PARTY_BANK)
  /**
   * 커서 밑의 한 마리를 두고 원작이 하는 말.
   *
   * ⚠️ **못 고르는 까닭이 셋 다 있는 것은 아니다.** `CheckCanSwitchPokemon`이
   * 세는 것은 기절·이미 나가 있음·알·파트너 것·이미 고른 것·기술 배우는 중
   * 여섯인데, 우리 화면에 올 수 있는 것은 앞의 둘뿐이다 — 묶여서 못 바꾸는
   * 자리는 원작도 이 화면에서 아무 말 안 하고 배틀 쪽이 나중에 말한다.
   * 그래서 그때는 이 화면의 **원래 물음**이 그대로 서 있다
   */
  const banner = (slot: PartySlot | null): string | null => {
    if (!slot) return null
    const who = cards[cursor]?.label ?? null
    if (slot.fainted) return romLine(partyLines, PARTY.cantSwitchWithFaintedPokemon, who)
    if (slot.active) return romLine(partyLines, PARTY.cantSwitchWithPokemonAlreadyInBattle, who)
    return romLine(partyLines, PARTY.chooseAPokemon)
  }

  return (
    <div className={css.sheet}>
      <PartyCards
        cards={cards}
        cursor={cursor}
        onHover={setAt}
        onPick={(i) => { const a = actionAt(i); if (a) onPick(a) }}
      />

      {chosen ? (
        <div className={css.detail}>
          <div className={`${css.banner} ${
            chosen.fainted ? css.bannerKind.down
              : chosen.active ? css.bannerKind.here : css.bannerKind.ok
          }`}
          >
            {banner(chosen)}
          </div>

          <div className={css.row}>
            <span className={css.rowLabel}>타입</span>
            {(types ?? []).filter((t, i, all) => all.indexOf(t) === i).map((t) => (
              <span
                key={t} className={css.typeChip}
                style={{ ['--tint' as string]: typeColor(t) }}
              >
                {names?.types[t] ?? t}
              </span>
            ))}
          </div>

          <div className={css.moves}>
            {chosen.moves.map((m, i) => {
              // 남은 PP는 **세이브가 정본**이다. 요청에는 나와 있는 한 마리 것만
              // 실려 오고, 벤치에 있는 애의 PP는 배틀 중에 줄지 않는다
              const data = m.move === null ? undefined : names?.move(m.move)
              const match = sharedMatch(data, foes, ivs)
              // 칸 색과 타입 이름도 기술 메뉴처럼 **보이는 타입**이다 (잠재파워)
              const type = data ? shownType(data, ivs) : 0
              return (
                <div key={`${m.id}-${String(i)}`} className={css.move}>
                  <span
                    className={css.typeChip}
                    style={{ ['--tint' as string]: typeColor(type) }}
                  >
                    {names?.types[type] ?? ''}
                  </span>
                  <span className={css.moveName}>
                    {(m.move === null ? null : names?.moves[m.move]) ?? m.id}
                  </span>
                  {match && <span className={css.hint[match]}>{MATCH_LABEL[match]}</span>}
                  <span className={css.pp}>{ppText(saved?.moves[i], data)}</span>
                </div>
              )
            })}
          </div>

          {(() => {
            // ⚠️ **영어 이름표에 안 묻는다.** 프로토콜이 주는 `sandstream` 같은
            // 아이디를 번호로 되돌리는 일은 sim 덱스가 이미 한다 — 한때는
            // `names/labels.en.json`의 차례와 맞췄는데, **그 파일은 영어 롬
            // 설치본에만 있다.** 한국·일본 롬으로 깔면 그 한 파일이 404가 나면서
            // 배틀 이름표가 통째로 안 왔다 (REPAIR §29)
            const idx = romAbility(chosen.ability) ?? -1
            if (idx < 0) return null
            return (
              <div className={css.ability}>
                <div className={css.abilityName}>특성 · {names?.abilities[idx]}</div>
                <div className={css.abilityText}>{names?.abilityText[idx]}</div>
              </div>
            )
          })()}
        </div>
      ) : (
        <div className={css.empty}>내보낼 포켓몬이 없다</div>
      )}
    </div>
  )
}
