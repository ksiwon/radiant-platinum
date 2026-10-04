// 배틀 화면 (PLAN §2.5) — 3D 무대 위에 뜨는 HUD.
//
// 배경을 칠하지 않는다. 뒤에는 `scene/battle/BattleStage`가 실제로 서 있고,
// 이 계층은 그 위에 얹히는 정보와 명령만 담당한다. HP 판을 상대는 왼쪽 위에,
// 나는 오른쪽 아래에 두는 것은 원작 배치다 — 포켓몬이 서는 자리의 반대편이라
// 서로 가리지 않는다.
//
// 사건을 시간축에 펴는 것은 `engine/battle/playback.ts`다. 이 화면은 그 재생기가
// 지금까지 접은 뷰만 그린다 — sim의 최종 상태를 직접 보지 않는다. 기술 연출과
// 카메라 컷(PLAN §7.3·§7.4)은 아직 없다.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BURST, burstWhite } from '../../engine/battle/encounterBurst'
import { encounterBurst } from '../../scene/battle/stageRefs'
import type { BattleAction } from '../../engine/battle/choice'
import type { SafariCommand } from '../../engine/battle/safariBattle'
import type { Actor, SlotId } from '../../engine/battle/events'
import { buildBeats, type Beat } from '../../engine/battle/playback'
import type { BattleView, ViewMon } from '../../engine/battle/view'
import {
  loadDialogueBank, loadItemNames, loadItems, loadLabels, loadMoveNames, loadMoves,
  loadSpecies, loadSpeciesNames, type DataLocale,
} from '../../data/gameData'
import { fillMenuText, START_MENU, UI_BANK } from '../../data/uiText'
import { isHmMove } from '../../engine/bag/fieldUse'
import {
  MATCH_LABEL, moveMatch, shownType, type MoveMatch,
} from '../../engine/battle/movePreview'
import { formSpeciesId } from '../../engine/pokemon/form'
import type { Move } from '../../data/schema'
import { hasTrainer, useBattleStore, type RosterEntry, type TrainerTag } from '../../state/battleStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSessionStore } from '../../state/sessionStore'
import { withTopic } from '../korean'
import { useMenuKeys } from '../menu/useMenuKeys'
import { HP_VARS, STATUS_VARS } from '../theme/window.css'
import { vars } from '../theme/contract.css'
import { useListCursor } from './listCursor'
import { LearnMove } from './LearnMove'
import { BattleBag } from './BattleBag'
import { SwitchScreen } from './SwitchScreen'
import { battleText, leadLines, learnResultLines, type BattleNames } from './messages'
import { ownerOfKey, type KeyOwner } from '../../engine/battle/aftermath'
import { askLine, openingLine, closingLines } from './bookends'
import { benchStatusOf } from './benchStatus'
import { LevelPanel, type LevelPanelShow } from '../menu/LevelPanel'
import { GAUGE_SLOTS, gaugeSlots } from './partyGauge'
import {
  BATTLE_BANK, BATTLE_PARTY_BANK, BATTLE_PARTY_HM_CANT_FORGET, MOVE_BANK, MSG, STAT_BANK, STATUS_BANK,
} from './romText'
import { romLine } from './romLine'
import { useRomLines } from './useRomLines'
import { TutorialPilot } from './TutorialPilot'
import { lockMenuKeysToPilot } from '../menu/useMenuKeys'
import { typeColor } from './typeColor'
import { useBattlePlayback } from './useBattlePlayback'
import { markVictory } from './victoryCue'
import { music } from '../../engine/audio/music'
import { shownColor, shownHp, useDrain, useSlide } from './hpDrain'
import { CommandButton } from './CommandButton'
import * as css from './battleScreen.css'
// ⚠️ **소리는 지연 마운트다.** `BattleScreen`은 App이 정적으로 잡는데(막을
// 화면이 언제 뜰지 몰라서다), `BattleSound`가 `music`을 정적으로 잡으면 소리
// 뭉치 gzip 11.1kB가 **타이틀 첫 화면**에 실린다. 배틀이 켜질 때 오면 된다
const BattleSound = lazy(() => import('./BattleSound').then((m) => ({ default: m.BattleSound })))
import { maxPpOf } from '../../engine/pokemon/instance'
import { dexHas, useSaveStore } from '../../state/saveStore'

/** 상태 딱지. 파티 화면과 같은 낱말이다 — 롬 `menu_entries` 0~4의 「잠듦」 (`PartyScreen`) */
const STATUS_LABEL: Record<string, string> = {
  slp: '잠듦', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비',
}

/**
 * 롬에 없는 우리 글 — 명령 칸 밑줄과 바닥 안내.
 *
 * 명령 이름(싸운다·가방…)은 롬 줄이라 설정의 언어를 저절로 따른다. 이 표는 그
 * 밑에 붙는 설명과 안내라 롬에서 못 가져오므로, 설정의 세 언어를 **같은 자리에**
 * 둔다 — 한국어만 적어 두면 언어를 바꿔도 이 줄만 한국어로 남아 한 칸에 두 언어가
 * 섞인다 (`OptionsScreen`의 `our`와 같은 까닭)
 */
interface Words {
  fight: string
  bag: string
  bagBlocked: string
  party: string
  partyBlocked: string
  run: string
  runNever: string
  runBlocked: string
  bait: string
  mud: string
  stay: string
  swap: string
  skip: string
  next: string
  pick: string
  back: string
  continue: string
  preparing: string
  leave: string
}

const WORDS: Record<DataLocale, Words> = {
  ko: {
    fight: '기술을 고른다', bag: '도구를 쓴다', bagBlocked: '지금은 쓸 수 없다', party: '교체한다',
    partyBlocked: '교체할 포켓몬이 없다',
    run: '배틀을 끝낸다', runNever: '도망칠 수 없다', runBlocked: '지금은 도망칠 수 없다',
    bait: '잡기 쉬워지고 잘 달아난다', mud: '안 달아나지만 잡기 어려워진다',
    stay: '그대로 싸운다', swap: '포켓몬을 고른다',
    skip: 'Z 넘기기', next: 'Z 계속', pick: '↑↓ 고르기 · Z 결정', back: ' · X 뒤로',
    continue: '계속', preparing: '배틀 준비 중…', leave: '필드로 돌아가기',
  },
  en: {
    fight: 'Choose a move', bag: 'Use an item', bagBlocked: 'Can\'t use items now', party: 'Switch Pokémon',
    partyBlocked: 'No Pokémon to switch in',
    run: 'End the battle', runNever: 'No escape here', runBlocked: 'Can\'t run right now',
    bait: 'Easier to catch, but flees more', mud: 'Flees less, but harder to catch',
    stay: 'Keep battling', swap: 'Choose a Pokémon',
    skip: 'Z Skip', next: 'Z Continue', pick: '↑↓ Select · Z Confirm', back: ' · X Back',
    continue: 'Continue', preparing: 'Preparing the battle…', leave: 'Return to the field',
  },
  ja: {
    fight: 'わざを選ぶ', bag: '道具を使う', bagBlocked: '今は使えない', party: '入れ替える',
    partyBlocked: '入れ替えるポケモンがいない',
    run: 'バトルを終える', runNever: '逃げられない', runBlocked: '今は逃げられない',
    bait: '捕まえやすいが逃げやすくなる', mud: '逃げにくいが捕まえにくくなる',
    stay: 'そのまま戦う', swap: 'ポケモンを選ぶ',
    skip: 'Z 送る', next: 'Z 続ける', pick: '↑↓ 選ぶ · Z 決定', back: ' · X 戻る',
    continue: '続ける', preparing: 'バトルの準備中…', leave: 'フィールドに戻る',
  },
}

/** 원작 한 프레임(ms). 닫히는 막의 시간이 이것으로 센다 */
const FRAME_MS = 1000 / 60

/** `p1-3` → 3. 파티 자리 키를 되짚는다 (`aftermath.partyKey`) */
function slotOfKey(key: string): number {
  const n = Number(key.slice(3))
  return Number.isInteger(n) ? n : -1
}

/**
 * 명령 메뉴가 지금 어느 단인가. 원작과 같은 두 단이다 —
 * 뿌리에서 무엇을 할지 고르고, 한 단 들어가서 무엇으로 할지 고른다
 */
type MenuPage = 'root' | 'fight' | 'bag' | 'party'

/**
 * 기술 한 칸이 **고르기 전에** 보여 주는 것 (PARITY §2.22).
 *
 * `type`이 기술표의 값과 다를 수 있다 — 잠재파워가 그렇다. 칸 색과 타입 이름도
 * 이 값을 따라가야 상성 표시와 어긋나지 않는다
 */
interface MovePreview {
  type: number | null
  match: MoveMatch | null
}

/** 기술 칸이 타입까지 보여주려면 기술표가 필요하다. 이름만으로는 모자란다 */
interface Extras {
  types: string[]
  /** 특성 설명. 교체 화면이 쓴다 */
  abilityText: string[]
  move(id: number): Move | undefined
  /** 그 모습의 타입 둘. 상성 표시가 본다 (§2.22) */
  typesOf(species: number, form: number): readonly number[] | null
  /**
   * 잊을 수 없는 기술이면 그 까닭(롬 글), 아니면 null — 비전기술이다
   * (`CheckSelectedMoveIsHM` · REPAIR §76)
   */
  hmLock(move: number): string | null
}

/**
 * 무대가 다 서기를 기다리는 시한(ms).
 *
 * 실측으로 모델과 규칙기까지 3.5초쯤이다 (`scene/battle/EncounterBurst` 머리말).
 * 느린 기계와 첫 판(규칙기 483KB)을 넉넉히 덮는 값이고, 넘기면 **안 기다린다**
 */
const STAGE_DEADLINE_MS = 15_000

/** 무대가 아직 안 선 동안 재생기에 주는 빈 목록. **매번 같은 배열이어야 한다** */
const NO_BEATS: readonly Beat[] = []

function useNames(): {
  names: BattleNames | null; extras: Extras | null
  lines: readonly string[]; moveLines: readonly string[]
} {
  const [names, setNames] = useState<BattleNames | null>(null)
  const [extras, setExtras] = useState<Extras | null>(null)
  // 롬의 배틀 글 (PARITY §2.24). 화면에 뜨는 배틀 문장이 여기서 온다
  const [lines, setLines] = useState<readonly string[]>([])
  const [moveLines, setMoveLines] = useState<readonly string[]>([])
  // 설정의 언어. 바뀌면 글을 그 언어로 다시 받는다
  const locale = useGameLocale()
  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpeciesNames(locale), loadMoveNames(locale), loadLabels(locale), loadMoves(),
      loadItemNames(locale),
      // ⚠️ **다른 언어 파일을 이름으로 부르지 않는다.** 설치본에는 **롬의 제
      // 언어 한 벌만** 들어 있다 (`import/platinum/text.ts`가 `ctx.locale` 한
      // 벌만 굽는다). 한때 여기서 `loadLabels('en')`을 같이 받았는데, 한국·일본
      // 롬 설치본에는 그 파일이 없어서 **이 묶음이 통째로 깨졌다** — 그러면
      // 아래 `beats`가 빈 채로 서고 사건이 뷰에 하나도 안 접힌다 (REPAIR §29)
      //
      // 종족표는 배틀을 열 때 이미 받아 뒀다 (`battleStore.open`) — 두 번째
      // 호출은 캐시에서 돌아온다
      loadSpecies(),
      // ⚠️ **이 하나만 넘어져도 되게 잡는다.** 위의 여섯은 없으면 배틀이 통째로
      // 안 뜨지만(REPAIR §29) 배틀 글은 없어도 판이 돈다 — 로그가 조용해질 뿐이다.
      // 로케일 하나에 이 뱅크가 없다고 배틀을 못 하게 만들 이유가 없다
      loadDialogueBank(locale, BATTLE_BANK).catch((e: unknown) => {
        console.error('배틀 글 뱅크를 못 받았다', e)
        return [] as string[]
      }),
      loadDialogueBank(locale, MOVE_BANK).catch((e: unknown) => {
        console.error('기술 줄 뱅크를 못 받았다', e)
        return [] as string[]
      }),
      loadDialogueBank(locale, STAT_BANK).catch((e: unknown) => {
        console.error('랭크 이름표를 못 받았다', e)
        return [] as string[]
      }),
      // 상태 이름표 — 멘탈허브 줄의 빈칸이다. 없으면 「헤롱헤롱이 풀렸다」로 떨어진다
      loadDialogueBank(locale, STATUS_BANK).catch((e: unknown) => {
        console.error('상태 이름표를 못 받았다', e)
        return [] as string[]
      }),
      // 비전기술 잠금에 쓴다 — 없으면 잠그지 않을 뿐 배틀은 돈다
      loadItems().catch(() => null),
      loadDialogueBank(locale, BATTLE_PARTY_BANK).catch(() => [] as string[]),
    ])
      .then(([species, moves, labels, table, items, dex, battleLines, usedLines, stats, conditions, itemTable, partyLines]) => {
        if (!alive) return
        setNames({ species, moves, abilities: labels.abilities, items, stats, conditions })
        setLines(battleLines)
        setMoveLines(usedLines)
        setExtras({
          types: labels.types,
          abilityText: labels.abilityText,
          move: (id) => table.byId.get(id),
          // 표에 없는 번호가 오면 상성 칸을 비운다. 화면 하나 때문에 던지지 않는다
          typesOf: (id, form) => dex.byId.get(formSpeciesId(id, form))?.types ?? null,
          hmLock: (id) => (itemTable !== null && isHmMove(id, itemTable.tmMoves)
            ? partyLines[BATTLE_PARTY_HM_CANT_FORGET] ?? null : null),
        })
      })
      // ⚠️ **조용히 넘기지 않는다.** 한때 여기 「영어 원문으로 떨어진다」고
      // 적혀 있었는데 **거짓이었다** — 이름표가 없으면 `beats`가 비고, 사건이
      // 뷰에 안 접혀서 포켓몬 칸도 모델도 로그도 통째로 안 뜬다. 콘솔에 적어
      // 두면 다음 사람이 화면만 보고 헤매지 않는다
      .catch((e: unknown) => { console.error('배틀 이름표를 못 받았다', e) })
    return () => { alive = false }
  }, [locale])
  return { names, extras, lines, moveLines }
}

/** 잡는 법 강습의 가방 — 몬스터볼 스물 (`Bag_TryAddItem(dto->bag, ITEM_POKE_BALL, 20, …)`) */
const TUTORIAL_BAG = [[{ item: 4, count: 20 }]] as const

export function BattleScreen() {
  const phase = useBattleStore((s) => s.phase)
  /**
   * 무대가 다 섰는가 (`state/battleStore`의 `sceneReady`).
   *
   * ⚠️ **`running`만 보면 이 화면이 빈 무대 앞에서 열린다.** 그 자리에서 온 것은
   * 규칙기와 자료뿐이고 모델은 그 뒤 몇 초에 온다 — 곡과 조우 연출이 먼저 나고
   * 포켓몬이 늦게 튀어나오던 자리다 (`scene/battle/BattleStage`의 `useSceneReady`)
   */
  const sceneReady = useBattleStore((s) => s.sceneReady)

  // 이미 잡아 본 종이면 상대 판에 공 표시가 뜬다 (원작 `HealthBox_DrawCaughtIcon`)
  const caughtDex = useSaveStore((s) => s.pokedex.caught)
  // 기술 칸의 상성은 **상대해 본 종에게만** 뜬다 (§2.22)
  const battledDex = useSaveStore((s) => s.pokedex.battled)
  // 가방 도구를 쓴 주어. 원작도 플레이어 이름으로 부른다 — 잡는 법 강습이면 동료의 이름이다
  const ally = useBattleStore((s) => s.ally)
  const savedName = useSaveStore((s) => s.trainer.name)
  const playerName = ally?.name ?? savedName
  const kind = useBattleStore((s) => s.kind)
  const foeName = useBattleStore((s) => s.foeName)
  // 롬의 네 줄이 트레이너를 **두 칸으로** 받는다 (PARITY §2.24)
  const foeClass = useBattleStore((s) => s.foeClass)
  const foeTrainer = useBattleStore((s) => s.foeTrainer)
  // 트레이너가 둘 이상인 판 (PARITY §2.2b). 사람마다 이름·공 줄·끝말이 따로다
  const foes = useBattleStore((s) => s.foes)
  const partner = useBattleStore((s) => s.partner)
  const defeatLines = useBattleStore((s) => s.defeatLines)
  const foeWinLines = useBattleStore((s) => s.foeWinLines)
  const downKeys = useBattleStore((s) => s.downKeys)
  const prize = useBattleStore((s) => s.prize)
  const penalty = useBattleStore((s) => s.penalty)
  const view = useBattleStore((s) => s.view)
  const actions = useBattleStore((s) => s.actions)
  const canSpendTurn = useBattleStore((s) => s.canSpendTurn)
  const doubles = useBattleStore((s) => s.doubles)
  const atSlot = useBattleStore((s) => s.atSlot)
  const backSlot = useBattleStore((s) => s.backSlot)
  const party = useBattleStore((s) => s.party)
  const events = useBattleStore((s) => s.events)
  const roster = useBattleStore((s) => s.roster)
  const outcome = useBattleStore((s) => s.outcome)
  const choose = useBattleStore((s) => s.choose)
  const throwBall = useBattleStore((s) => s.throwBall)
  // 이름을 `useItem`으로 받으면 eslint가 훅으로 읽는다 (`rules-of-hooks`)
  const spendItem = useBattleStore((s) => s.useItem)
  const run = useBattleStore((s) => s.run)
  const close = useBattleStore((s) => s.close)
  const playEvents = useBattleStore((s) => s.playEvents)
  const trainerClass = useBattleStore((s) => s.trainerClass)
  const setVictorySong = useBattleStore((s) => s.setVictorySong)
  /** 박자가 단 곡 · 효과음 신호 (`victoryCue`) */
  const cueBeat = useCallback((beat: Beat) => {
    if (beat.music !== undefined) setVictorySong(beat.music)
    if (beat.sound !== undefined) void music.playEffect(beat.sound)
  }, [setVictorySong])
  const shiftAsk = useBattleStore((s) => s.shiftAsk)
  const answerShift = useBattleStore((s) => s.answerShift)
  /**
   * 지금 교체 화면이 「교체」의 예로 열린 것인가 (`battleStore.freeShift`). 기절해서 바꾸는
   * 화면과 모양이 같지만 이쪽은 물러설 수 있다 — 물러서면 교체 없이 상대만 나온다
   */
  const freeShift = useBattleStore((s) => s.freeShift)
  const cancelShift = useBattleStore((s) => s.cancelShift)
  const learnMove = useBattleStore((s) => s.learnMove)
  /**
   * 여는 중에 **무언가 잘못됐을 때 할 말** (`state/battleStore`의 `error`).
   *
   * ⚠️ **안 적으면 밖에서는 「멈췄다」로만 보인다.** 파일럿 보고(2026-09-22):
   * 「배틀 배경으로 바뀌긴 했는데 BGM도 안 바뀌고 포켓몬들도 안 나오면서 그냥
   * 멈췄다」 — 그때 화면에 있던 것은 「배틀 준비 중…」 한 줄뿐이라, 오래
   * 걸리는 것인지 영영 안 오는 것인지 사람도 우리도 몰랐다
   */
  const trouble = useBattleStore((s) => s.error)
  const safari = useBattleStore((s) => s.safari)
  const safariAct = useBattleStore((s) => s.safariAct)
  // ⚠️ **세이브를 본다.** 배틀 안의 기술 칸(`moveSlotsOf`)이 아니다 — 레벨업으로
  // 배운 기술은 세이브에 먼저 들어가고 sim은 그 판이 끝날 때까지 모른다
  const savedParty = useSaveStore((s) => s.party)
  const { names, extras, lines, moveLines } = useNames()
  const words = WORDS[useGameLocale()]
  // 사파리 남은 볼은 시작 메뉴 뱅크의 롬 줄이다 (`START_MENU.ballStock`)
  const startMenuLines = useRomLines(UI_BANK.startMenu)
  const [page, setPage] = useState<MenuPage>('root')
  // 3D 무대는 씬이 떠 있을 때만 뒤에 선다. 개발 콘솔로 타이틀에서 배틀을 열면
  // 씬이 없으므로 그때만 배경을 깐다 — 안 그러면 타이틀 위에 HUD만 뜬다
  const staged = useSessionStore((s) => s.stageMounted)

  /**
   * ⚠️ **시한이 있어야 한다.** 무대가 못 서면 이 화면이 「배틀 준비 중…」에
   * 영영 묶인다 — 모델을 하나 못 받거나, 아예 3D 무대가 없는 자리에서 배틀을
   * 열면(개발 콘솔로 타이틀에서 여는 길) 알려 줄 사람이 없다. 그때는 덜 갖춘
   * 채로 여는 편이 낫다: 예전 그림, 곧 빈 무대에서 시작하는 그 화면이다
   */
  useEffect(() => {
    if (phase === 'off' || phase === 'loading' || sceneReady) return
    // 무대가 아예 없는 자리(타이틀에서 개발 콘솔로 여는 길)는 기다릴 것이 없다
    if (!staged) { useBattleStore.setState({ sceneReady: true }); return }
    const id = setTimeout(() => {
      // ⚠️ **조용히 열지 않는다.** 여기로 온 판은 무대나 몸이 안 온 채로 여는
      // 것이라, 포켓몬이 안 보이는 화면이 나올 수 있다. 그 까닭이 콘솔에 없으면
      // 밖에서는 또 「멈췄다」가 된다
      console.error(`배틀 무대가 ${String(STAGE_DEADLINE_MS / 1000)}초 안에 안 섰다 — 덜 갖춘 채로 연다`)
      useBattleStore.setState({ sceneReady: true })
    }, STAGE_DEADLINE_MS)
    return () => { clearTimeout(id) }
  }, [phase, sceneReady, staged])

  const moveActions = actions.filter((a) => a.type === 'move')
  const switchActions = actions.filter((a) => a.type === 'switch')
  // 벤치가 모자라 넘기는 자리 (`pass`). 고를 것이 하나뿐이라 곧바로 보낸다
  const passOnly = actions.length === 1 && actions[0]!.type === 'pass'
  useEffect(() => {
    if (passOnly) void choose(actions[0]!)
  }, [passOnly, actions, choose])
  // 쓰러진 직후에는 교체만 고를 수 있다. 그때는 뿌리 메뉴를 거치지 않는다 —
  // 원작도 "누구를 내보낼까?"로 바로 간다
  const forced = moveActions.length === 0 && switchActions.length > 0 && !passOnly
  /**
   * 물러설 곳이 **없는** 교체 — 기절한 뒤다. 「교체」의 예로 연 화면도 `forced`와 모양이
   * 같은데(고를 것이 교체뿐이다) 원작은 거기서 물러설 수 있다
   * (`subscript_replace_fainted.s` — 예 뒤 `WaitPokemonMenuResult _060`)
   */
  const forcedHard = forced && !freeShift

  // 고를 게 새로 생기면 뿌리로 돌아간다. 한 턴 고르고 나면 다음 턴은 처음부터다
  useEffect(() => { setPage('root') }, [actions])
  // Esc로 한 단 나온다. 교체만 고를 수 있는 화면은 그 화면이 제 X를 받는다
  // (`SwitchScreen`의 `onBack` — 기절한 뒤면 없고, 「교체」의 예로 열었으면 물러서기다)
  useEffect(() => {
    if (page === 'root' || forced) return
    const onEsc = (e: KeyboardEvent) => { if (e.code === 'Escape') setPage('root') }
    window.addEventListener('keydown', onEsc)
    return () => { window.removeEventListener('keydown', onEsc) }
  }, [page, forced])

  /**
   * 트레이너가 서 있는 판인가 (`battleStore.hasTrainer` — 무대가 상대 몸을 세우는 그 술어다).
   * **팩토리도 트레이너전이다** — `kind === 'trainer'`만 보면 팩토리에서 「야생 ○○」가 뜨고
   * 첫 줄이 없었다
   */
  const trainerSide = hasTrainer(kind)

  /** 키 → 화면에 쓸 이름. 상대 쪽에는 "야생 "이나 "상대 "를 앞에 붙인다 */
  const label = useMemo(() => (actor: Actor) => {
    const entry: RosterEntry | undefined = roster[actor.name]
    const base = entry?.nickname ?? names?.species[entry?.species ?? -1] ?? actor.name
    if (entry?.side !== 'p2') return base
    // 사파리도 야생이다 — 트레이너가 데리고 나온 마리만 「상대」다.
    // ⚠️ **「야생의」가 아니라 「야생 」이다** — 롬의 배틀 글 1,269줄에 「야생의」는
    // 0건이고 「야생 」이 344건이다. 롬은 자리마다 줄을 셋 들고 있는데(우리 편·
    // 야생·상대) 이름표가 롬의 말을 쓰면 **맨 줄 하나로 셋을 다 덮는다**
    return trainerSide ? `상대 ${base}` : `야생 ${base}`
  }, [roster, names, trainerSide])

  /**
   * 그 마리를 낸 트레이너 (PARITY §2.2b). 키 앞머리가 주인이다
   * (`aftermath.ownerOfKey`) — 둘째 상대의 마리가 첫 상대 이름으로 불리면 안 된다
   */
  const trainerOf = useMemo(() => (key: string): TrainerTag | null => {
    const who = ownerOfKey(key)
    if (who === 'foe') return foes[0] ?? null
    if (who === 'foe2') return foes[1] ?? null
    if (who === 'partner') return partner
    return null
  }, [foes, partner])

  /** 자리 표시 없는 이름. 아직 안 나온 마리를 부를 때 쓴다 */
  const bare = useMemo(() => (key: string) => {
    const entry: RosterEntry | undefined = roster[key]
    return entry?.nickname ?? names?.species[entry?.species ?? -1] ?? key
  }, [roster, names])

  /**
   * 기술 칸 밑에 뜨는 상성 (PARITY §2.22). 1배거나 보여 줄 수 없으면 null.
   *
   * ⚠️ **겨눈 자리를 본다.** 더블에서 상대 둘의 타입이 다르면 같은 기술도
   * 오른쪽과 왼쪽이 다르다 — 한 줄에 하나만 적으려고 상대 A로 몰면
   * 거짓말이 된다. 그래서 접힌 줄에는 아예 안 적고, "누구에게?"에서 적는다
   */
  const previewOf = useMemo(() => (action: BattleAction): MovePreview => {
    const none: MovePreview = { type: null, match: null }
    if (action.type !== 'move' || action.move === null || !extras) return none
    const move = extras.move(action.move)
    if (!move) return none
    // 잠재파워는 **쓰는 쪽**의 개체값이 타입을 정한다. 타입 이름과 칸 색도 그 값이다
    const me = view?.active[atSlot === 0 ? 'p1a' : 'p1b'] ?? null
    const ivs = me ? savedParty[slotOfKey(me.key)]?.ivs ?? null : null
    const type = shownType(move, ivs)

    const slot: SlotId = action.target === undefined || action.target === 1 ? 'p2a'
      : action.target === 2 ? 'p2b'
        : action.target === -1 ? 'p1a' : 'p1b'
    // 내 편을 겨눈 기술에는 안 뜬다
    if (slot === 'p1a' || slot === 'p1b') return { type, match: null }
    const target = view?.active[slot] ?? null
    if (target === null || target.species === null) return { type, match: null }
    const types = extras.typesOf(target.species, roster[target.key]?.form ?? 0)
    return {
      type,
      match: moveMatch(move, types, ivs, dexHas(battledDex, target.species)),
    }
  }, [extras, view, roster, atSlot, savedParty, battledDex])

  const beats = useMemo(() => {
    if (!names) return []
    const ctx = {
      names, lines, moveLines, label, foeName, foeClass, foeTrainer, bare, playerName, trainerOf,
    }
    // 더블의 첫 등판은 쪽마다 한 창이다 (`messages.leadLines`)
    const leads = leadLines(events, ctx, { trainer: trainerSide, partner })
    // 야생은 상대가 화면이 열릴 때 이미 서 있다 — 트레이너전은 글을 찍고
    // 공을 던진다 (`engine/battle/playback`의 `BeatOptions`)
    const out = buildBeats(events, (e) => {
      if (leads.has(e)) return leads.get(e) ?? null
      // ⚠️ **상금 줄은 끝말 뒤로 옮긴다.** 원작은 「이겼다!」 → 상대의 끝말 →
      // 상금 차례다 (`subscript_battle_won.s` _087 → _121). 사건 자리에 두면
      // 상금이 「이겼다!」보다 먼저 뜬다 — `bookends.closingLines`가 그 줄을 찍는다
      if (e.kind === 'prize') return null
      return battleText(e, ctx)
    }, {
      foeOnStage: !trainerSide,
      // 등판 글은 누를 때까지 선다 — 잡는 법 강습은 손이 대신 누르므로 끈다 (`TutorialPilot`)
      pressSendOut: ally === null,
    })
    // 트레이너전은 누가 걸어왔는지부터 말하고, 끝나면 이긴 줄·끝말·상금이 잇는다.
    // 사건이 아니라 판 자체의 사실이다 (`bookends`)
    const ends = {
      lines, kind, outcome, foes, foeName, foeClass, foeTrainer, defeatLines, foeWinLines, prize, penalty, playerName,
    }
    const challenge = openingLine(ends)
    if (challenge !== null) out.unshift({ text: challenge, events: [], hold: 30 })
    const closing = closingLines(ends)
    for (const text of closing) out.push({ text, events: [], hold: 30 })
    markVictory(out, { kind, outcome, trainerClass: foes[0]?.classId ?? trainerClass, closing: closing.length })
    return out
  }, [
    events, names, lines, moveLines, label, bare, outcome, kind, trainerSide,
    foeName, foeClass, foeTrainer, playerName, trainerOf, foes, partner, defeatLines, foeWinLines, prize, penalty,
    trainerClass, ally,
  ])

  // 박자를 하나씩 흘린다. 다 소화하기 전에는 명령이 안 뜬다 — 원작의 순서다
  // ⚠️ **무대가 서기 전에는 박자를 안 푼다.** 첫 박자가 등판이라, 여기서
  // 미리 흘리면 아직 안 온 몸 대신 빈 발판에 대고 「나와라!」가 뜬다
  const script = useBattlePlayback(sceneReady ? beats : NO_BEATS, playEvents, cueBeat)
  // 아직 재생 중이면 A가 빨리 감기다. 메뉴 키와 겹치면 안 된다.
  // ⚠️ **묻는 자리에서는 빨리 감기를 끈다** — 안 그러면 Z 한 번이 물음을
  // 넘기면서 동시에 답으로도 먹혀 아무거나 골라진다
  //
  // ⚠️ **이름표가 오기 전에도 읽는 중이다.** 이름표가 없으면 `beats`가 비고, 빈 박자는 재생기에게 「다 소화했다」라서
  // 그 틈에 명령 메뉴가 떴다 — 세션 첫 배틀에서 등판 글보다 먼저, 빈 발판 위에 1초 넘게(실측 `.audit/probe/playCutins.mjs`)
  const reading = !script.caughtUp || names === null

  // ── 잡는 법 강습 ─────────────────────────────────────────────────────────────
  // 손이 누르는 동안 사람 키는 안 받는다. 둘째 턴의 한 줄은 글창에 손이 대신 올린다
  const [pilotLine, setPilotLine] = useState<string | null>(null)
  useEffect(() => {
    lockMenuKeysToPilot(ally !== null)
    if (ally === null) setPilotLine(null)
    return () => { lockMenuKeysToPilot(false) }
  }, [ally])
  const tutorialLine = ally === null ? null
    : romLine(lines, ally.gender === 'girl' ? MSG.okTheGotIsHPDownTimeItsReadyForAPokeBall : MSG.allRightIGotItsHPDownTimeToThrowAPokeBall)

  /**
   * 배틀이 닫히는 길 — **16프레임에 검게 내린 뒤** 닫는다.
   *
   * 들어갈 때는 흰 막과 조우 연출이 있는데, 나올 때 곧바로 `close()`를 부르면 한
   * 프레임 만에 걷던 필드로 돌아간다. 원작은 끝나면 화면을 검게 내렸다가 필드를
   * 다시 연다. ⚠️ **두 번 안 닫는다** — 「계속」 클릭과 Z가 같은 프레임에 들어오면
   * `close()`가 두 번 돈다. `battleStore.close()`는 그대로다 — 진화 메뉴·필드
   * 다시 세우기가 `phase`가 'off'가 되는 그 순간에 기대고 있다
   */
  const [closing, setClosing] = useState(false)
  const closingNow = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeWithFade = useCallback(() => {
    if (closingNow.current) return
    closingNow.current = true
    setClosing(true)
    closeTimer.current = setTimeout(() => { closeTimer.current = null; close() }, 16 * FRAME_MS)
  }, [close])
  // 새 판이 열리면 막을 걷는다
  useEffect(() => {
    if (phase !== 'loading') return
    closingNow.current = false
    setClosing(false)
  }, [phase])
  useEffect(() => () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current) }, [])
  // 잡는 법 강습: 「잡았다!」 뒤 30프레임 쉬고 16프레임에 검게 닫힌다 — 누르기를 안 기다린다
  // (`SEQ_CATCH_MON_SET_CAUGHT_SPECIES`)
  useEffect(() => {
    if (ally === null || phase !== 'over' || reading) return
    const id = setTimeout(closeWithFade, 30 * FRAME_MS)
    return () => { clearTimeout(id) }
  }, [ally, phase, reading, closeWithFade])

  /**
   * 레벨업 능력치 창 (`LevelPanel`). 박자가 누를 때까지 서 있고, 첫 Z는 「+오른 폭」을
   * 「새 값」으로 바꾸고 둘째 Z가 넘긴다 (`SEQ_GET_EXP_LEVEL_UP_SUMMARY_PRINT_DIFF` →
   * `…_PRINT_TRUE` — 둘 다 A·B를 기다린다)
   */
  const [panelShow, setPanelShow] = useState<LevelPanelShow>('gain')
  useEffect(() => { setPanelShow('gain') }, [script.levelPanel])
  const press = useCallback(() => {
    if (script.levelPanel !== null && panelShow === 'gain') { setPanelShow('value'); return }
    script.advance()
  }, [script, panelShow])

  // 글창 클릭도 A와 같은 길이다. ⚠️ **키와 같은 조건을 건다** — 안 그러면
  // 명령 메뉴가 떠 있을 때나 「어느 기술을 잊게 할까?」 앞에서 클릭이 재생기에
  // 한 번 더 들어간다 (`useMenuKeys`의 조건과 짝이다)
  const tapLog = reading && script.ask === null ? press : undefined
  useMenuKeys({ confirm: press, cancel: press },
    phase !== 'off' && reading && script.ask === null)
  // 배틀이 끝난 뒤의 "계속". 여기만 키 처리가 비어 있어서 마우스로만 닫혔다
  useMenuKeys({ confirm: closeWithFade, cancel: closeWithFade }, phase === 'over' && !reading)
  // 배틀이 안 열리는 판에서 필드로 나가는 단추 (`loadingBack`). 키로도 누른다
  useMenuKeys({ confirm: close, cancel: close }, phase === 'loading' && trouble !== null)

  const shell = staged ? css.screen : `${css.screen} ${css.fallback}`

  if (phase === 'off') return null

  const mine = view?.active.p1a ?? null
  const foe = view?.active.p2a ?? null
  const mineB = view?.active.p1b ?? null
  const foeB = view?.active.p2b ?? null
  /** 지금 명령을 묻고 있는 마리. 더블에서 다른 자리의 판을 흐리게 하는 기준이다 */
  const asking = doubles ? view?.active[atSlot === 0 ? 'p1a' : 'p1b'] ?? null : null
  /**
   * 명령을 기다리는 동안 글창의 줄 — 「{이름}은 무엇을 할까?」 (`bookends.askLine`).
   *
   * ⚠️ **안 바꾸면 지난 턴의 줄이 그대로 남는다.** 「모부기의 몸통박치기!」가 떠 있는 채로
   * 명령 칸이 서서 기술이 도는 중인지 고를 차례인지 헷갈렸다. 싱글도 더블도 묻는 그 마리의
   * 이름이다. 뿌리 메뉴와 기술 단에서만 바꾼다 — 재생 중·물음 중·교체·가방 화면은 그대로다
   */
  const commanding = phase === 'running' && !reading && script.ask === null && shiftAsk === null
  const askingNow = view?.active[atSlot === 0 ? 'p1a' : 'p1b'] ?? null
  const commandLine = !commanding ? null : askLine({
    lines, kind, playerName,
    who: askingNow !== null && actions.length > 0 && !forced && (page === 'root' || page === 'fight')
      ? bare(askingNow.key) : null,
  })
  /**
   * 지금 뜬 명령 칸에 X로 돌아갈 단이 있는가. 기술 단과 더블 둘째 자리의 뿌리 메뉴뿐이다 —
   * 예·아니오의 X는 「아니오」고, 기술 배우기 물음도 제 답으로 간다. 교체만 고르는 화면은
   * 「교체」의 예로 열었을 때만 물러설 수 있다 (`forcedHard`)
   */
  const canBack = script.ask === null && shiftAsk === null && kind !== 'safari'
    && (forced ? !forcedHard : page === 'fight' || (page === 'root' && doubles && atSlot > 0))

  // 검은 막은 이 트리 안에 **한 번만** 마운트되어야 한다. loading과 running을
  // 서로 다른 return으로 나누면 그때마다 다시 마운트되어 두 번 깜빡인다
  return (
    <div className={shell}>
      <Suspense fallback={null}><BattleSound drainMs={script.holdMs} /></Suspense>
      {ally !== null && phase === 'running' && <TutorialPilot line={tutorialLine} onLine={setPilotLine} />}
      <div aria-hidden className={closing ? `${css.closeVeil} ${css.closeVeilOn}` : css.closeVeil} />
      {/*
        ⚠️ **준비가 끝날 때까지 안 걷는다.** 클래스만 갈아 끼우므로 이 판은
        여전히 **한 번만** 마운트된다 — 걷는 애니메이션은 클래스가 붙는
        그 순간부터 돈다
      */}
      {!sceneReady
        ? <div className={css.wipeHold} />
        : <BattleOpenVeil />}
      {/*
        ⚠️ **안 열리는 판에는 나갈 길을 준다.** 무엇을 기다리는지(진단)는 콘솔에만 있고
        (`battleStore`의 `SLOW_OPEN`), 화면에는 사람이 읽는 말과 필드로 돌아가는 단추가
        선다 — 단추는 배틀을 닫는 그 길(`close`)이다
      */}
      {!sceneReady
        ? (
          <div className={css.loading}>
            <span className={css.loadingText}>{trouble ?? words.preparing}</span>
            {trouble !== null && (
              <button className={css.loadingBack} onClick={close}>{words.leave}</button>
            )}
          </div>
        )
        : <>
      {/*
        누구를 내보낼까. **화면 전체를 덮는다** — 파티 여섯과 고른 한 마리의
        속사정을 나란히 놓아야 교체를 결정할 근거가 화면에 있다 (§2.5)
      */}
      {!reading && shiftAsk === null && phase !== 'over'
        && (forced || page === 'party') && actions.length > 0 && (
        <SwitchScreen
          actions={switchActions} party={party} roster={roster}
          names={names && extras ? { ...names, ...extras } : null}
          onPick={choose}
          onBack={forcedHard ? null
            : forced ? () => { void cancelShift() }
              : () => { setPage('root') }}
        />
      )}
      {/*
        가방도 **화면 전체**를 쓴다. 명령 메뉴 옆의 좁은 칸에 도구를 쌓으면
        회복약을 열 종류 들고 다닐 때 아무것도 안 보이고, 무엇보다 도구는
        대부분 "누구에게" 를 물어야 한다 — 그 파티 화면이 교체와 같은 카드다
      */}
      {!reading && shiftAsk === null && phase !== 'over'
        && !forced && page === 'bag' && actions.length > 0 && (
        <BattleBag
          wild={kind === 'wild'} party={party} roster={roster} names={names}
          askKey={asking?.key}
          twoFoes={doubles && foe !== null && !foe.fainted && foeB !== null && !foeB.fainted}
          onThrow={(ball) => void throwBall(ball)}
          onUse={(item, key, slot) => void spendItem(item, key, slot)}
          onBack={() => { setPage('root') }}
          {...(ally !== null ? { bagOverride: TUTORIAL_BAG } : {})}
        />
      )}
      <div className={css.field}>
        <div className={css.foeSlot}>
          {/*
            쪽마다 공 한 줄 (`PartyGaugeData_New`). 트레이너가 둘이면 한 줄에 첫 상대가
            0~2번, 둘째가 3~5번 칸이다 (`partyGauge.gaugeSlots`)
          */}
          {trainerSide && foes.length > 0
            ? (
              <PartyGauge
                label={foes.map((t) => t.label).join(' · ')}
                owners={foes.length > 1 ? ['foe', 'foe2'] : ['foe']}
                roster={roster} down={downKeys} view={view}
              />
            )
            : foeName && <div className={css.foeTrainer}>{foeName}</div>}
          {/*
            ⚠️ **판의 key는 마리다.** 자리 번호로 두면 쓰러진 마리(0)의 판이 그대로 다음
            마리 판이 되어, 새 포켓몬의 HP 바가 0에서 가득으로 1초 넘게 차올랐다
          */}
          {[foe, foeB].map((m) => m && (
            <MonCard
              key={m.key}
              mon={m} names={names} drainMs={script.holdMs} nickname={roster[m.key]?.nickname ?? null}
              caught={m.species !== null && dexHas(caughtDex, m.species)}
            />
          ))}
        </div>
        <div className={css.mineSlot}>
          {/*
            우리 쪽 공 줄은 편이 있어도 **내 파티만**이다 — 이야기의 편 배틀은 합친 갈래를
            안 탄다 (`battle_controller.c` 2132~2150)
          */}
          {trainerSide && (
            <PartyGauge
              label={playerName} owners={['player']} roster={roster} down={downKeys} view={view}
            />
          )}
          {[mine, mineB].map((m) => m && (
            <MonCard
              key={m.key} mon={m} names={names} drainMs={script.holdMs} showHp
              nickname={roster[m.key]?.nickname ?? null}
              // 묻는 동안만 흐린다 — 대사를 읽는 중(등판 줄 따위)에 둘째 판이 꺼져 보이면 안 된다
              dim={doubles && !reading && asking !== null && m.key !== asking.key}
            />
          ))}
        </div>
      </div>

      <div className={css.console_}>
        {/* 로그는 판이 아니라 글이다. 무대를 가리지 않게 상자를 없앴다 */}
        <div className={css.log} onClick={tapLog}>
          <div className={css.logText}>
            {pilotLine ?? commandLine ?? script.text}
            {/* 누름을 기다릴 때만 뜬다 — 연출·게이지 동안은 눌러도 아무 일이 없다 */}
            {script.waitingPress && <span className={css.nextArrow} aria-hidden>▼</span>}
          </div>
        </div>
        <div className={css.side}>
          {script.levelPanel !== null && (
            <LevelPanel
              before={script.levelPanel.before}
              after={script.levelPanel.after}
              show={panelShow}
              className={css.levelPanel}
            />
          )}
          <div className={css.menu}>
            {script.ask !== null && names && extras ? (
              // 기술 칸이 다 찼다. 답할 때까지 재생기가 서 있다
              <LearnMove
                move={script.ask.move}
                who={bare(script.ask.key)}
                slots={(savedParty[slotOfKey(script.ask.key)]?.moves ?? []).map((s) => ({
                  move: s.move,
                  pp: s.pp,
                  maxPp: maxPpOf(s, extras.move(s.move)?.pp ?? s.pp),
                }))}
                moveName={(id) => names.moves[id] ?? `#${String(id)}`}
                moveData={(id) => extras.move(id)}
                typeName={(t) => extras.types[t]}
                lockedWhy={(id) => extras.hmLock(id)}
                onAnswer={(forget) => {
                  const ask = script.ask!
                  // ⚠️ **잊을 기술은 덮기 전에 읽는다** — `learnMove`가 그 칸을 새 기술로 덮는다
                  const forgot = forget === null ? null
                    : savedParty[slotOfKey(ask.key)]?.moves[forget]?.move ?? null
                  learnMove(ask.key, ask.move, forget)
                  // 원작은 고른 뒤에도 말한다 — 「1, 2, 그리고… 짠!」 → 「잊었다」 → 「그리고…」 →
                  // 「배웠다」, 안 배우면 한 줄 (`BATTLE_SUBSCRIPT_LEARN_MOVE`). 그 줄들이 다
                  // 돈 뒤에 재생이 이어진다. 쪽은 통째로 올라간다
                  const who = bare(ask.key)
                  const learned = names.moves[ask.move] ?? `#${String(ask.move)}`
                  const said = forgot === null
                    ? learnResultLines(lines, { who, declined: learned })
                    : learnResultLines(lines, { who, forgot: names.moves[forgot] ?? `#${String(forgot)}`, learned })
                  script.resolve(said.map((text) => ({ text, events: [], hold: 30 })))
                }}
              />
            ) : reading ? null : phase === 'over' ? (ally !== null ? null : (
              <button
                className={`${css.button} ${css.buttonOn}`}
                style={{ ['--tint' as string]: css.TINT.run }}
                onClick={closeWithFade}
                autoFocus
              >
                <span className={css.caret} aria-hidden />
                <span className={css.face}>
                  <span className={css.dot} aria-hidden />
                  <span className={css.label}>{words.continue}</span>
                </span>
              </button>
            )) : shiftAsk !== null ? (
              // 시합규칙 「교체」 — 상대가 다음 마리를 내보내기 전에 묻는다.
              // 여기서 바꾸면 턴을 안 쓴다.
              // ⚠️ **물음은 글창의 롬 줄 하나다** (`messages`의 shift 줄 — 「포켓몬을
              // 교체하시겠습니까?」). 여기에 또 적으면 같은 물음이 두 말투로 두 번 뜬다
              <YesNo
                yes={romLine(lines, MSG.yes) ?? '예'}
                no={romLine(lines, MSG.no) ?? '아니오'}
                words={words}
                onPick={(yes) => void answerShift(yes)}
              />
            ) : kind === 'safari' ? (
              // ⚠️ **`actions`를 안 본다** (PARITY §2.19). 사파리는 sim이 안 도는
              // 갈래라 고를 기술도 교체할 마리도 없어서 그 목록이 늘 비어 있다 —
              // 아래의 「비었으면 …」 갈래보다 먼저 와야 명령이 뜬다
              <SafariMenu
                balls={safari?.balls ?? 0} onPick={safariAct} words={words} lines={lines}
                stock={startMenuLines[START_MENU.ballStock] ?? null}
              />
            ) : actions.length === 0 ? (
              // 고를 것이 아직 안 왔다. 칸을 비운다 — 기다림은 글창이 말한다
              null
            ) : forced || page === 'party' || page === 'bag' ? (
              // 교체와 가방은 **화면 전체**를 쓴다. 여기 칸에는 아무것도 안 남긴다 —
              // 같은 화면에 알약과 카드가 같이 뜨면 어디를 보는지 모른다
              null
            ) : page === 'fight' ? (
              <MoveMenu
                actions={moveActions} names={names} extras={extras} onPick={choose}
                doubles={doubles} previewOf={previewOf}
                targetName={(t) => targetLabel(t, atSlot, view, bare)}
                onBack={() => setPage('root')}
              />
            ) : (
              <RootMenu
                words={words} lines={lines}
                canFight={moveActions.length > 0}
                canSwitch={switchActions.length > 0}
                // ⚠️ **트레이너 더블에는 볼도 도망도 없다.** 편과 함께 만난 야생
                // 둘(`BATTLE_TYPE_AI_PARTNER`)은 도망칠 수 있다 — 원작의 도망 판정은
                // 배틀 형식을 안 보고 마주 선 상대 첫 자리와 견준다 (`battle_lib.c` 3284)
                wild={kind === 'wild' && (!doubles || partner !== null)}
                canSpend={canSpendTurn}
                // 글창이 이미 「무엇을 할까?」를 말하면 같은 물음을 또 안 적는다
                who={commandLine === null && asking ? bare(asking.key) : null}
                onPick={setPage}
                onRun={() => void run()}
                onBack={doubles && atSlot > 0 ? () => { backSlot() } : null}
              />
            )}
          </div>
          {/*
            전면 화면(교체·가방)은 자기 바닥에 직접 적는다.

            ⚠️ **누를 수 있는 것만 적는다.** 재생 중에는 줄일 것이 있을 때만 「Z 넘기기」,
            끝나면 고를 것이 「계속」 하나라 「Z 계속」, 잡는 법 강습은 저절로 닫히므로 비운다.
            「X 뒤로」는 돌아갈 단이 있을 때만이다 — 싱글 뿌리 메뉴·사파리는 X가 아무 일도 안 한다
          */}
          <div className={css.keyHint}>
            {reading
              ? (script.skippable || script.waitingPress ? words.skip : '')
              : phase === 'over'
                ? (ally !== null ? '' : words.next)
                : words.pick + (canBack ? words.back : '')}
          </div>
        </div>
      </div>
      </>}
    </div>
  )
}

/**
 * 대상 번호를 화면 이름으로. 상대는 1·2, 짝은 −1·−2다 (`choice.ts`).
 *
 * 이름을 그대로 쓴다 — 「앞」·「뒤」로 쓰면 무대의 어느 쪽인지가 안 맞는다
 */
function targetLabel(
  target: number, at: number, view: BattleView | null, bare: (key: string) => string,
): string {
  const slot: SlotId = target === 1 ? 'p2a'
    : target === 2 ? 'p2b'
      : target === -1 ? 'p1a' : 'p1b'
  const mon = view?.active[slot] ?? null
  if (!mon) return target > 0 ? '상대' : '짝'
  const name = bare(mon.key)
  if (target < 0) {
    const self = (at === 0 && target === -1) || (at === 1 && target === -2)
    return self ? `${name} (자신)` : `${name} (짝)`
  }
  return `상대 ${name}`
}

/**
 * 한 쪽의 이름과 파티 공 (PARITY §2.2b · `PartyGaugeData_Fill`).
 *
 * 공 하나가 파티의 한 칸이다 — 멀쩡함·상태 이상·기절·빈 칸 넷으로
 * 갈린다(`STOCK_STATUS_*`). 기절은 **재생기가 보여 준 만큼만** 센다(`downKeys`) —
 * 정본을 보면 쓰러지는 연출보다 공이 먼저 꺼진다
 */
function PartyGauge(
  { label, owners, roster, down, view }: {
    label: string
    owners: readonly KeyOwner[]
    roster: Record<string, RosterEntry>
    down: readonly string[]
    view: BattleView | null
  },
) {
  const keys = gaugeSlots(Object.keys(roster), owners)
  // ⚠️ **벤치도 본다** (`benchStatus`). 서 있는 네 자리만 보면 독에 걸린 채 물러난 마리가
  // 공 줄에서 멀쩡한 초록으로 돌아간다 — 원작은 파티 전원의 `STOCK_STATUS`를 쓴다
  const statusOf = (key: string): string | null => {
    for (const m of [view?.active.p1a, view?.active.p1b, view?.active.p2a, view?.active.p2b]) {
      if (m && m.key === key) return m.status === 'ok' ? null : m.status
    }
    return benchStatusOf(key)
  }
  return (
    <div className={css.gaugeRow}>
      <span>{label}</span>
      {Array.from({ length: GAUGE_SLOTS }, (_, i) => {
        const key = keys[i]
        const state = key === undefined ? 'empty'
          : down.includes(key) ? 'fainted'
            : statusOf(key) !== null ? 'status' : 'alive'
        return <span key={i} className={css.gaugeBall[state]} aria-label={state} />
      })}
    </div>
  )
}

const GENDER_MARK: Record<string, { mark: string; cls: string }> = {
  male: { mark: '♂', cls: css.male },
  female: { mark: '♀', cls: css.female },
}

/**
 * 체력판.
 *
 * ⚠️ **색은 비율이 아니라 픽셀 수가 정한다** (`engine/battle/healthbar`).
 * 원작은 게이지를 48픽셀로 먼저 줄이고 그 픽셀 수로 색을 고른다 — 79 중 16은
 * 비율로는 0.2025라 노랑이 되지만 픽셀로는 9라서 빨강이다.
 *
 * 상대 판에는 체력 숫자도 경험치 줄도 없다. 원작이 그렇게 정해 뒀다 —
 * `HEALTHBOX_INFO_NOT_ON_ENEMY = CURRENT_HP | MAX_HP | EXP_GAUGE`. 내 판에는 둘 다 있다.
 *
 * 이름에 「야생」·「상대」를 안 붙인다 — 원작 체력판은 이름만이고, 그 말은 글창
 * 문장에만 붙는다. 붙이면 긴 이름이 판 폭을 밀어낸다.
 *
 * 판은 **미끄러져 들어오고 나간다** (`hpDrain`의 `useSlide` · `HealthBox_Scroll`) —
 * 등판 박자의 쉼이 끝난 뒤 들어오고, 쓰러지면 제 쪽 바깥으로 빠진다
 */
function MonCard(
  { mon, names, drainMs, nickname = null, showHp = false, caught = false, dim = false }:
  {
    mon: ViewMon; names: BattleNames | null; drainMs: number
    /** 그 마리의 별명 (`RosterEntry.nickname`). 원작 체력판은 별명을 쓴다 (`Healthbox_DrawPokemonName`) */
    nickname?: string | null
    showHp?: boolean; caught?: boolean
    /** 더블에서 **지금 명령을 묻고 있지 않은** 쪽. 흐리게 둔다 */
    dim?: boolean
  },
) {
  // ⚠️ **변신해도 이름은 제 것이다** (`baseSpecies`). 뷰의 `species`는 따라 한 쪽의 종이라
  // 그대로 쓰면 메타몽 판이 「꼬마돌」로 바뀐다 — 원작 체력판은 제 별명을 그대로 둔다
  const own = mon.baseSpecies ?? mon.species
  const name = nickname ?? (own !== null ? names?.species[own] : null) ?? mon.speciesName
  const ratio = mon.maxHp > 0 ? Math.max(0, Math.min(mon.hp, mon.maxHp)) / mon.maxHp : 0
  const maxHp = mon.maxHp
  const hpNow = useRef<HTMLSpanElement>(null)
  // ⚠️ **게이지는 CSS 전환이 아니라 연출 시계가 민다** (`hpDrain`). CSS는 벽시계라
  // 탭을 숨겨도, 프레임이 1초로 늘어져도 저 혼자 흐른다 — 재생기가 서 있는데
  // 체력만 마저 줄었다.
  //
  // ⚠️ **폭·숫자·색이 한 값을 본다.** 숫자를 목표 체력으로 찍으면 맞자마자 끝값이 되고,
  // 색을 목표 체력으로 고르면 바가 아직 초록 길이인데 빨강이 된다 — 원작은 게이지가 한
  // 칸씩 움직일 때 숫자도 같이 내려가고(`HealthBox_DrawCurrentHP`) 색은 보이는 픽셀
  // 수로 고른다(`App_BarColor`)
  const bar = useDrain(ratio, drainMs, (shown) => {
    const fill = bar.current
    if (fill) {
      const color = shownColor(shown, maxHp)
      if (fill.dataset.hp !== color) {
        fill.dataset.hp = color
        const tone = HP_VARS[color]
        if (tone) {
          fill.style.setProperty('--lit', tone['--lit'])
          fill.style.setProperty('--body', tone['--body'])
        }
      }
    }
    if (hpNow.current) hpNow.current.textContent = String(shownHp(shown, maxHp))
  })
  const card = useSlide(mon.presence !== 'down', drainMs, mon.slot, showHp ? 1 : -1)
  const exp = expOf(mon)
  const gender = GENDER_MARK[mon.gender]
  return (
    <div
      ref={card}
      className={`${css.card} ${showHp ? css.cardMine : css.cardFoe}`}
      style={dim ? { opacity: 0.55 } : undefined}
    >
      <div className={css.cardHead}>
        <span className={css.monName}>{name}</span>
        {gender && <span className={`${css.genderMark} ${gender.cls}`}>{gender.mark}</span>}
        {/* 브라우저 기본 말풍선(`title`)은 웹 페이지 티가 난다. 읽어 주는 이름만 둔다 */}
        {caught && <span className={css.caughtMark} role="img" aria-label="도감에 등록된 포켓몬" />}
        {mon.status !== 'ok' && (
          <span className={css.statusTag} style={STATUS_VARS[mon.status]}>
            {STATUS_LABEL[mon.status] ?? mon.status}
          </span>
        )}
        <span className={css.monLevel}>Lv{mon.level}</span>
      </div>
      <div className={css.barRow}>
        <span className={css.hpTag}>HP</span>
        <div className={css.barTrack}>
          {/* ⚠️ 폭과 색은 style로 안 준다 — `useDrain`만 쓴다 (두 임자가 다투면 튕긴다) */}
          <div ref={bar} className={css.barFill} />
        </div>
      </div>
      {showHp && (
        <div className={css.hpText}>
          {/* 숫자도 훅이 쓴다 — 게이지와 같은 프레임에 같은 값으로 내려간다 */}
          <span ref={hpNow} className={css.hpNow} /> / {mon.maxHp}
        </div>
      )}
      {showHp && exp !== null && <ExpLine progress={exp} level={mon.level} drainMs={drainMs} />}
    </div>
  )
}

/**
 * 그 마리의 경험치 진행도 (0~1). 내 쪽에만 있다 (`ViewMon.expProgress` · `engine/pokemon/exp`의
 * `levelProgress`). 뷰가 안 실어 왔으면 null — 줄을 안 그린다
 */
function expOf(mon: ViewMon): number | null {
  const at = mon.expProgress
  return typeof at === 'number' && Number.isFinite(at) ? Math.max(0, Math.min(1, at)) : null
}

/**
 * 내 체력판의 경험치 줄 (`Healthbox_DrawExpBar`).
 *
 * HP 게이지와 **같은 시계**로 찬다 — 박자의 게이지 길이(`drainMs`) 동안이다. 레벨을
 * 넘으면 1까지 찬 뒤 **빈 게이지에서** 남은 몫을 다시 채운다 (`useDrain`의 `epoch`) —
 * 보이던 값에서 이으면 게이지가 거꾸로 줄어든다. 소리는 `BattleSound`가 같은 길이로 끊는다
 */
function ExpLine({ progress, level, drainMs }: { progress: number; level: number; drainMs: number }) {
  const fill = useDrain(progress, drainMs, undefined, level)
  return (
    <div className={css.expRow}>
      <span className={css.expTag}>EXP</span>
      <div className={css.expTrack}>
        <div ref={fill} className={css.expFill} />
      </div>
    </div>
  )
}

/**
 * 원작의 첫 단. 싸운다·가방·포켓몬·도망간다.
 *
 * 이름은 **롬 줄**이다 (배틀 글 뱅크 924~927 · `MSG`). 손으로 적은 「도망친다」는
 * 롬의 「도망간다」와도 달랐고 설정의 언어도 안 따랐다. 밑줄은 우리 글이라 `words`다
 */
function RootMenu(
  { words, lines, canFight, canSwitch, wild, canSpend, who, onPick, onRun, onBack }: {
    words: Words
    /** 배틀 글 뱅크 (`BATTLE_BANK`) */
    lines: readonly string[]
    canFight: boolean
    canSwitch: boolean
    wild: boolean
    /** 지금 명령을 묻고 있는 마리. 글창이 그 물음을 못 띄울 때만 있다 (더블) */
    who: string | null
    /** 앞 자리로 되돌아간다 (더블 둘째 자리). 없으면 X가 아무 일도 안 한다 */
    onBack: (() => void) | null
    /**
     * 턴을 쓸 수 있는 턴인가. 참기·역린에 묶였거나 앙코르에 걸리면 닫힌다 —
     * 그때 가방과 도망은 **눌러도 아무 일이 없다**(`session.hasIdle`)
     */
    canSpend: boolean
    onPick: (page: MenuPage) => void
    onRun: () => void
  },
) {
  const entries = [
    {
      label: romLine(lines, MSG.fight) ?? '싸운다',
      pilot: 'fight', sub: words.fight, tint: css.TINT.fight, on: canFight, go: () => { onPick('fight') },
    },
    {
      label: romLine(lines, MSG.bag) ?? '가방',
      pilot: 'bag',
      sub: canSpend ? words.bag : words.bagBlocked,
      tint: css.TINT.bag, on: canSpend, go: () => { onPick('bag') },
    },
    {
      label: romLine(lines, MSG.pokemon) ?? '포켓몬',
      // 가방·도망과 같은 결이다 — 꺼진 칸은 왜 꺼졌는지를 말한다
      sub: canSwitch ? words.party : words.partyBlocked,
      tint: css.TINT.party, on: canSwitch, go: () => { onPick('party') },
    },
    {
      label: romLine(lines, MSG.run) ?? '도망간다',
      sub: !wild ? words.runNever : canSpend ? words.run : words.runBlocked,
      tint: css.TINT.run, on: wild && canSpend, go: onRun,
    },
  ]
  const cursor = useListCursor(
    entries.length,
    (i) => { if (entries[i]?.on) entries[i].go() },
    onBack ?? undefined,
  )
  return (
    <>
      {/* 더블은 자리마다 물어본다. 누구에게 묻는지가 안 보이면 아무것도 못 고른다 */}
      {who !== null && <div className={css.askWho}>{withTopic(who)} 무엇을 할까?</div>}
      {entries.map((entry, i) => (
        <CommandButton
          key={entry.label}
          on={i === cursor}
          label={entry.label}
          sub={entry.sub}
          tint={entry.tint}
          {...('pilot' in entry ? { pilot: entry.pilot } : {})}
          onClick={entry.go}
          disabled={!entry.on}
        />
      ))}
    </>
  )
}

/**
 * 사파리의 명령 넷 (PARITY §2.19 · `PLAYER_INPUT_SAFARI_*`).
 *
 * 차례가 원작 그대로다 — 볼·미끼·진흙·도망. 원작은 아래 화면에 네 칸을 두고
 * 남은 볼을 그 옆에 적는데, 우리는 한 화면이라 **볼 수를 첫 칸에 붙인다**.
 *
 * ⚠️ **미끼와 진흙이 서로 반대가 아니다.** 미끼는 잡히는 값을 올리면서 도망도
 * 올리고, 진흙은 도망을 내리면서 잡히는 값도 내린다 — 어느 쪽도 공짜가 아니라
 * 그 대가를 칸 밑에 적는다
 */
function SafariMenu(
  { balls, onPick, words, lines, stock }: {
    balls: number; onPick: (command: SafariCommand) => void; words: Words
    /** 배틀 글 뱅크 (`BATTLE_BANK`). 칸 이름 넷이 롬 줄이다 (931~933 · 927) */
    lines: readonly string[]
    /**
     * 남은 볼 줄 — 시작 메뉴 뱅크의 「{N}개 남음」 (`START_MENU.ballStock`). 빈칸은
     * 0번 칸이다. 뱅크가 안 왔으면 null
     */
    stock: string | null
  },
) {
  const left = stock !== null ? fillMenuText(stock, [String(balls)]) : `${String(balls)}개 남음`
  // 칸 이름은 롬 줄이다 — 「사파리볼」·「미끼」·「도망친다」로 손에 들고 있었는데 롬은
  // 「볼」·「먹이」·「진흙」·「도망간다」다. 뱅크가 안 왔을 때만 같은 말로 물러선다
  const entries: { label: string; sub: string; tint: string; go: SafariCommand }[] = [
    { label: romLine(lines, MSG.ball) ?? '볼', sub: left, tint: css.TINT.fight, go: 'ball' },
    { label: romLine(lines, MSG.bait) ?? '먹이', sub: words.bait, tint: css.TINT.bag, go: 'bait' },
    { label: romLine(lines, MSG.mud) ?? '진흙', sub: words.mud, tint: css.TINT.party, go: 'mud' },
    // 일반 배틀의 도망 칸과 같은 말이다 — 한쪽만 「이 판을 끝낸다」였다
    { label: romLine(lines, MSG.run) ?? '도망간다', sub: words.run, tint: css.TINT.run, go: 'run' },
  ]
  const cursor = useListCursor(entries.length, (i) => {
    const entry = entries[i]
    // 볼이 0이면 던질 수가 없다. 그래도 칸은 남긴다 — 왜 못 던지는지가 보인다
    if (entry && !(entry.go === 'ball' && balls <= 0)) onPick(entry.go)
  })
  return (
    <>
      {entries.map((entry, i) => (
        <CommandButton
          key={entry.label}
          on={i === cursor}
          label={entry.label}
          sub={entry.sub}
          tint={entry.tint}
          onClick={() => { onPick(entry.go) }}
          disabled={entry.go === 'ball' && balls <= 0}
        />
      ))}
    </>
  )
}

/**
 * 예·아니오 두 칸. 시합규칙 「교체」가 쓴다.
 *
 * 차례는 **예 → 아니오**다 — 필드 대사의 예·아니오, 원작과 같다. 그래도 커서는
 * **「아니오」에서 시작한다** — 원작이 그렇다. 빨리 넘기려고 Z를 연타하는 사람이
 * 뜻하지 않게 교체 화면으로 끌려가지 않는다. X는 「아니오」다 (필드와 같은 손버릇).
 *
 * 물음 글은 안 적는다 — 글창에 롬 줄이 이미 떠 있다
 */
function YesNo(
  { yes, no, words, onPick }: {
    yes: string; no: string; words: Words; onPick: (yes: boolean) => void
  },
) {
  const entries = [
    { label: yes, sub: words.swap, tint: css.TINT.party, yes: true },
    { label: no, sub: words.stay, tint: css.TINT.run, yes: false },
  ]
  const cursor = useListCursor(
    entries.length, (i) => { onPick(entries[i]!.yes) }, () => { onPick(false) }, 1,
  )
  return (
    <>
      {entries.map((entry, i) => (
        <CommandButton
          key={entry.label}
          on={i === cursor}
          label={entry.label}
          sub={entry.sub}
          tint={entry.tint}
          onClick={() => { onPick(entry.yes) }}
        />
      ))}
    </>
  )
}

/** 기술 네 칸. 원작처럼 타입과 남은 PP를 같이 보여준다 */
function MoveMenu(
  { actions, names, extras, onPick, onBack, doubles = false, targetName, previewOf }: {
    actions: BattleAction[]
    names: BattleNames | null
    extras: Extras | null
    onPick: (a: BattleAction) => void
    onBack: () => void
    doubles?: boolean
    /** 대상 번호 → 화면에 쓸 이름 */
    targetName?: (target: number) => string
    /** 그 명령을 고르기 전에 보여 줄 것 */
    previewOf: (a: BattleAction) => MovePreview
  },
) {
  /**
   * 대상을 고르는 중이면 그 기술의 후보들.
   *
   * ⚠️ **기술 목록에는 칸마다 하나만 세운다.** 후보를 그대로 펴면 몸통박치기가
   * 두 줄로 뜬다 — 원작도 기술을 고른 **다음에** 누구에게인지를 묻는다
   */
  const [aiming, setAiming] = useState<BattleAction[] | null>(null)
  // 같은 칸 번호의 후보를 하나로 접는다. 접힌 것이 둘 이상이면 대상을 묻는다
  const groups = new Map<number, BattleAction[]>()
  for (const a of actions) {
    if (a.type !== 'move') continue
    groups.set(a.slot, [...(groups.get(a.slot) ?? []), a])
  }
  const rows = [...groups.values()].map((g) => g[0]!)

  const pick = (row: BattleAction): void => {
    if (row.type !== 'move') return
    const all = groups.get(row.slot) ?? [row]
    if (doubles && all.length > 1) { setAiming(all); return }
    onPick(row)
  }

  const aimCursor = useListCursor(
    aiming?.length ?? 0,
    (i) => { const a = aiming?.[i]; if (a) onPick(a) },
    () => { setAiming(null) },
  )
  if (aiming) {
    return (
      <>
        <div className={css.askWho}>누구에게?</div>
        {aiming.map((a, i) => (
          <CommandButton
            key={a.type === 'move' ? a.target : i}
            on={i === aimCursor}
            label={a.type === 'move' ? targetName?.(a.target ?? 0) ?? '' : ''}
            sub={<MatchLine match={previewOf(a).match} />}
            onClick={() => { onPick(a) }}
          />
        ))}
        <button className={css.backButton} onClick={() => { setAiming(null) }}>← 돌아가기</button>
      </>
    )
  }
  return (
    <MoveRows
      rows={rows} names={names} extras={extras} onPick={pick} onBack={onBack}
      // 접힌 줄에는 후보가 하나일 때만 적는다. 여럿이면 자리마다 다르다
      previewOf={(a) => {
        const at = previewOf(a)
        return a.type === 'move' && (groups.get(a.slot)?.length ?? 1) > 1
          ? { type: at.type, match: null } : at
      }}
    />
  )
}

/** 기술 이름 밑 한 줄. 상성이 없으면 자리도 안 잡는다 */
function MatchLine({ match }: { match: MoveMatch | null }) {
  if (match === null) return null
  return <span className={`${css.matchLine} ${css.matchTone[match]}`}>{MATCH_LABEL[match]}</span>
}

function MoveRows(
  { rows: actions, names, extras, onPick, onBack, previewOf }: {
    rows: BattleAction[]
    names: BattleNames | null
    extras: Extras | null
    onPick: (a: BattleAction) => void
    onBack: () => void
    previewOf: (a: BattleAction) => MovePreview
  },
) {
  const cursor = useListCursor(actions.length, (i) => {
    const action = actions[i]
    if (action) onPick(action)
  }, onBack)
  return (
    <>
      {actions.map((action, i) => {
        if (action.type !== 'move') return null
        const label = (action.move !== null ? names?.moves[action.move] : null) ?? action.name
        const { type: typeId, match } = previewOf(action)
        const type = typeId !== null ? extras?.types[typeId] : undefined
        // PP를 못 푸는 칸이 있다 — 발버둥이 그렇다. 그때는 오른쪽을 비운다
        const hasPp = action.pp !== undefined && action.maxPp !== undefined
        const ppClass = !hasPp ? ''
          : action.pp === 0 ? css.ppOut
            : action.pp! <= Math.max(1, Math.floor(action.maxPp! / 4)) ? css.ppLow
              : ''
        return (
          <CommandButton
            key={`m${action.slot}`}
            on={i === cursor}
            // 기술 칸의 색은 **타입 색**이다. 색만 보고도 무엇을 고르는지 안다
            {...(typeId !== null ? { tint: typeColor(typeId) } : {})}
            label={label}
            /*
              타입과 상성이 **한 줄에 같이** 선다. BDSP는 타입을 글자 대신
              아이콘으로 놓아서 밑줄이 통째로 비지만, 우리 왼쪽에 있는 것은
              점 하나뿐이라 그 점만으로는 무슨 타입인지 못 읽는다
            */
            sub={type !== undefined && (
              <span className={css.subLine}>
                {type}
                {match !== null && <span className={css.sep} aria-hidden>·</span>}
                <MatchLine match={match} />
              </span>
            )}
            right={hasPp && (
              <span className={`${css.pp} ${ppClass}`}>
                <span className={css.ppNow}>{action.pp}</span>
                <span className={css.ppMax}>/{action.maxPp}</span>
              </span>
            )}
            pilot={`move-${String(i)}`}
            onClick={() => { onPick(action) }}
          />
        )
      })}
      <button className={css.backButton} onClick={onBack}>← 돌아가기</button>
    </>
  )
}


/**
 * 배틀이 열리는 순간의 막 (PARITY §7.13).
 *
 * 원작 `SysTask_SetupUI`는 열째 프레임부터 화면을 흰색으로 물들이고 스물여덟째
 * 부터 걷는다. 그 사이 스무째 프레임에 땅 입자 둘째 벌이 선다 —
 * 무대(`scene/battle/EncounterBurst`)와 **같은 시계**를 읽어야 둘이 맞는다.
 *
 * ⚠️ **앞의 검정은 우리 것이다.** 원작은 배틀 화면을 이미 세워 놓고 흰색만
 * 얹지만, 우리는 준비가 끝나는 그 프레임에 무대가 처음 보이므로 그대로 두면
 * 검정에서 화면으로 **탁 잘린다**. 첫 열 프레임에 걷는 검정을 앞에 둔다 —
 * 원작이 흰색을 시작하는 바로 그 프레임에 끝난다
 */
function BattleOpenVeil() {
  const veil = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const node = veil.current
      if (node) {
        const at = encounterBurst.at
        const frame = at > 0 ? (performance.now() - at) / (1000 / 60) : 0
        const black = Math.max(0, 1 - frame / BURST.whiteIn)
        const white = encounterBurst.white ? burstWhite(frame) : 0
        node.style.backgroundColor = black > white ? vars.scrim.black : vars.scrim.white
        node.style.opacity = String(Math.max(black, white))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [])
  return <div ref={veil} className={css.openVeil} />
}
