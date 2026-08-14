// NPC 교환 장면 (PARITY §10) — `overlay006/npc_trade.c` · `overlay095`
//
// 원작의 마디와 글과 소리를 그대로 따라간다:
//
//   {내 마리}를 {상대}에게 보냅니다!    ← 10프레임 뒤
//   바이바이! {내 마리}!                ← 그 60프레임 뒤. 여기서 내 마리가 운다
//   (통신관을 지나간다)
//   {상대}로부터 {받는 마리} 전송됐다!  ← 도착. `SEQ_FANFA5`가 울린다
//   {받는 마리} 귀여워해 줘!            ← 그 60프레임 뒤
//
// ⚠️ **글을 짓지 않는다.** 네 줄 다 뱅크 350(`TEXT_BANK_TRADE`)에서 그대로
// 온다. 칸 셋은 원작이 넣는 것과 같다 — 0 내 마리 · 1 받는 마리 · 2 상대
// (`StringTemplate_SetNickname` 둘 + `_SetPlayerName`).
//
// ⚠️ **통신관 그림은 옮기지 않는다.** 원작 일곱 마디 중 다섯이 볼이 관을 타고
// 건너가는 2D 연출이라 3D 무대에 대응물이 없다. `transit` 한 마디로 묶고
// 그동안 무대를 비운다 (`cinematicMotion.tradePose`) — 지어낸 그림으로 채우지
// 않는다.
//
// ⚠️ **버튼이 없다.** 원작도 이 장면에서는 입력을 안 받는다. 시간이 다 흐르면
// 저절로 닫히고 스크립트가 이어진다
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadMoves, loadNpcTrades, loadSpecies, loadSpeciesNames,
} from '../../data/gameData'
import { fillMenuText, loadUiText, TRADE_TEXT } from '../../data/uiText'
import { music } from '../../engine/audio/music'
import { fieldBgm } from '../../engine/audio/songs'
import {
  createTradedMon, npcTradeNames, type NpcTradeNames,
} from '../../engine/pokemon/npcTrade'
import { fillPp, genderOf, isShiny, statsOf, type PokemonInstance } from '../../engine/pokemon/instance'
import { metToday } from '../../engine/pokemon/origin'
import { useCinematicStore } from '../../state/cinematicStore'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { poketchGotMon } from '../../scene/poketch'
import { MenuScreen } from './MenuScreen'
import * as own from './evolutionScreen.css'

/**
 * 교환 장면의 곡 (`SEQ_KOUKAN`).
 *
 * ⚠️ **여기서 직접 틀지 않는다.** 곡을 고르는 자리가 하나뿐이라
 * (`MusicDirector`), 여기서 `music.play`를 부르면 다음 초에 지휘자가 필드 곡을
 * 다시 얹는다. 스크립트가 곡을 갈 때와 같은 길로 — 덮어쓰기 칸에 놓고 맡긴다
 */
const BGM = 1170
/** 도착 팡파르 (`SEQ_FANFA5`) */
const FANFARE = 1156

const FRAME_MS = 1000 / 60
/** 마디가 시작하고 첫 줄이 뜨기까지 (`> 10`) */
const FIRST_LINE_MS = 10 * FRAME_MS
/** 줄과 줄 사이 (`> 60`) */
const LINE_HOLD_MS = 60 * FRAME_MS
/**
 * 통신관을 건너가는 시간.
 *
 * ⚠️ **이 숫자는 우리 것이다.** 원작의 그 자리는 프레임 수가 아니라 다섯
 * 마디짜리 스프라이트 연출이라 옮길 값이 없다. 실기에서 대략 이만큼 걸린다
 */
const TRANSIT_MS = 1800

/**
 * 마디 하나. 차례가 곧 흐름이다.
 *
 * `line`이 null인 마디는 창을 비워 둔다 — 원작도 관을 지나가는 동안에는
 * 대사창을 지운다
 */
type Step = 0 | 1 | 2 | 3 | 4 | 5

interface Ready {
  names: NpcTradeNames
  /** 내가 보내는 마리. 파티에서 빠지기 전에 떠 둔 것이다 */
  sending: PokemonInstance
  receiving: PokemonInstance
  speciesNames: string[]
  tradeText: string[]
}

export function TradeScreen() {
  const locale = useGameLocale()
  const trade = useMenuStore((s) => s.trade)
  const closeAll = useMenuStore((s) => s.closeAll)
  const [ready, setReady] = useState<Ready | null>(null)
  const [step, setStep] = useState<Step>(0)
  /** 한 교환에 한 번만 갈아 끼운다 — 표가 늦게 와도 두 번 들어오지 않는다 */
  const applied = useRef<number | null>(null)

  // ── 표를 받고 교환을 실제로 치른다 ──────────────────────────────────────
  //
  // ⚠️ **원작도 그림보다 먼저 갈아 끼운다.** `FieldTask_ProcessNPCTrade`의
  // 0번 상태가 `NPCTrade_ReceiveMon`을 부르고 그다음에야 화면이 열린다 —
  // 도중에 게임이 죽어도 교환은 이미 끝나 있다
  useEffect(() => {
    if (!trade) return
    let alive = true
    void Promise.all([
      loadNpcTrades(), loadSpecies(), loadMoves(), loadSpeciesNames(locale),
      loadUiText('trade', locale), loadUiText('npcTradeNames', locale),
    ]).then(([trades, species, moves, speciesNames, tradeText, nameBank]) => {
      if (!alive) return
      const record = trades.trades[trade.tradeId]
      const save = useSaveStore.getState()
      const sending = save.party[trade.slot]
      if (!record || !sending) { closeAll(); return }
      if (applied.current === trade.tradeId) return

      const names = npcTradeNames(nameBank, trade.tradeId)
      const info = species.get(record.species)
      // 레벨은 **내가 주는 마리의 것**이다 (`NPCTrade_FillAnimationTemplate`)
      const built = fillPp(
        createTradedMon(record, info, sending.level, names, metToday()),
        (id) => moves.byId.get(id)?.pp ?? 5,
      )
      const receiving: PokemonInstance = { ...built, hp: statsOf(built, info).hp }

      applied.current = trade.tradeId
      const party = [...save.party]
      party[trade.slot] = receiving
      useSaveStore.setState({ party })
      // `SaveData_UpdateCatchRecords` — 도감과 포켓치 이력. **상대해 본 표시는
      // 안 붙는다** (`Pokedex_Capture`가 그 칸을 안 만진다)
      save.markSeen(receiving.species)
      save.markCaught(receiving.species)
      poketchGotMon({ species: receiving.species, form: receiving.form })

      useCinematicStore.getState().startTrade(
        {
          species: sending.species, form: sending.form,
          gender: genderOf(sending.pid, species.get(sending.species).genderRatio),
          shiny: isShiny(sending.pid, sending.otId, sending.otSecretId),
        },
        {
          species: receiving.species, form: receiving.form,
          gender: genderOf(receiving.pid, info.genderRatio),
          shiny: isShiny(receiving.pid, receiving.otId, receiving.otSecretId),
        },
      )
      fieldBgm.override = BGM
      setReady({ names, sending, receiving, speciesNames, tradeText })
      setStep(0)
    }).catch(() => {
      // 표를 못 받으면 교환을 못 치른다. 조용히 파티를 건드리느니 닫는다
      closeAll()
    })
    return () => { alive = false }
  }, [trade, locale, closeAll])

  useEffect(() => () => {
    useCinematicStore.getState().clear()
    fieldBgm.override = null
  }, [])

  // ── 마디를 넘긴다 ────────────────────────────────────────────────────────
  const advance = useCallback((next: Step): void => {
    const cinematic = useCinematicStore.getState()
    if (next === 2 && ready) void music.playCry(ready.sending.species)
    if (next === 3) cinematic.setTradePhase('transit')
    if (next === 4 && ready) {
      cinematic.setTradePhase('arriving')
      void music.playCry(ready.receiving.species)
      void music.playEffect(FANFARE)
    }
    setStep(next)
  }, [ready])

  useEffect(() => {
    if (!ready) return
    if (step === 5) {
      const done = setTimeout(() => {
        useCinematicStore.getState().clear()
        fieldBgm.override = null
        closeAll()
      }, LINE_HOLD_MS)
      return () => { clearTimeout(done) }
    }
    const wait = step === 0 ? FIRST_LINE_MS : step === 3 ? TRANSIT_MS : LINE_HOLD_MS
    const timer = setTimeout(() => { advance((step + 1) as Step) }, wait)
    return () => { clearTimeout(timer) }
  }, [ready, step, advance, closeAll])

  if (!trade || !ready) return null

  return (
    <MenuScreen title="교환" foot="">
      <div className={own.stage}>
        <div className={own.cinematicSpace} aria-hidden />
        <div className={own.line}>{lineFor(ready, step)}</div>
      </div>
    </MenuScreen>
  )
}

/** 그 마디에 뜨는 글. 뱅크에서 그대로 오고 칸 셋만 채운다 */
function lineFor(ready: Ready, step: Step): string {
  const at = MESSAGE_AT[step]
  if (at === null) return ''
  const raw = ready.tradeText[at]
  if (raw === undefined) return ''
  return fillMenuText(raw, [
    nameOf(ready.sending, ready.speciesNames),
    nameOf(ready.receiving, ready.speciesNames),
    ready.names.otName,
  ])
}

/** 마디 → 뱅크 350의 줄. 0(뜨기 전)과 3(관을 지나가는 동안)은 창이 비어 있다 */
const MESSAGE_AT: Readonly<Record<Step, number | null>> = {
  0: null,
  1: TRADE_TEXT.willBeSent,
  2: TRADE_TEXT.byeBye,
  3: null,
  4: TRADE_TEXT.sentOver,
  5: TRADE_TEXT.takeCare,
}

const nameOf = (mon: PokemonInstance, names: readonly string[]): string =>
  mon.nickname ?? names[mon.species] ?? ''
