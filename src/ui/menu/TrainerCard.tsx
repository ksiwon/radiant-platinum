// 트레이너 카드 — 시작 메뉴에서 이름 자리를 고르면 뜬다 (`applications/trainer_case`).
//
// 원작은 두 화면이다: 위가 카드, 아래가 배지 케이스. 한 창에서는 둘을 나란히 둔다(`trainerCard.css`).
//
//   앞면  IDNo. · 등급 별 · 이름(제일 큰 글) · 용돈 · 도감(도감을 받은 뒤에만) · 스코어 · 플레이 시간 · 모험을 시작한 날,
//         사진 칸에 주인공(도트 정수 3배)
//   뒷면  첫 전당등록(날짜와 시각 — 아직이면 「--」) · 통신한 횟수 · 통신대전 · 통신교환, 아래에 서명 칸
//   케이스 배지 여덟이 2열 4줄 홈에 선다. 받은 것만 방향키로 고르고, 고른 배지에 관장 · 도시 · 배지 이름이 붙는다
//
// Z가 뒤집고 X가 닫는다 (`TrainerCaseApp_Main`의 `INPUT_A_BUTTON` → `TrainerCase_FlipTrainerCard` · `INPUT_B_BUTTON`).
//
// ⚠️ **판은 롬 그림이 아니라 CSS다** — `card.png` · `case.png`는 더 안 굽고 안 읽는다(설치본에 없다). 색은 `cardRank.*` ·
// `caseTray.*` 토큰이다 (`trainerCard.css`).
//
// ⚠️ **글은 한 줄도 우리가 안 짓는다.** 이름표와 문장 틀이 다 트레이너 카드 뱅크(`TEXT_BANK_TRAINER_CARD`)의 것이고, 배지
// 이름 · 관장 · 도시도 롬 글이다(`trainerBadges`). 롬에서 못 뽑은 칸은 비운다 — 우리 세이브에는 배지를 이긴 날짜가 없어
// 그 칸은 아예 두지 않는다.
//
// 범위 밖인 것: 서명(통신 광장에서 쓴다 — 서명 칸은 빈 채다) · 배지 닦기와 때(터치로 문지르는 놀이 · 날마다 때가 낀다 —
// 받은 배지는 받은 날의 광 그대로 선다) · 케이스 뚜껑(터치 단추로 연다 — 열린 채로 둔다).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { loadDialogueBank, loadLocationNames, loadPokedexSort, loadTrainerNames } from '../../data/gameData'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { fillMenuText, UI_BANK } from '../../data/uiText'
import { fieldScripts } from '../../engine/script/field'
import { SYSTEM_FLAG, trainerCardLevel } from '../../engine/script/commands'
import { FLAG_HAS_POKEDEX } from '../../engine/script/vars'
import { RECORD_TRAINER_SCORE, recordValue } from '../../engine/world/gameRecords'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { BADGE_ART, BADGE_WINDOW, badgeArtStyle, hasBadge } from '../common/BadgeRail'
import { badgeOff } from '../common/parts.css'
import { dexCounts, nationalDexCompleted } from './dexCounts'
import { useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import {
  BADGE_COUNT, BADGE_LEADERS, badgeNames, firstPick, stepBadge, usableName,
} from './trainerBadges'
import * as own from './trainerCard.css'

/**
 * 트레이너 카드 뱅크 (`TEXT_BANK_TRAINER_CARD`) — 미국 롬 번호다. 실제 로케일 번호(한국 610 · 일본 609)로는 추출이 옮겨 둔다
 * (`uiText.ts` 머리말)
 */
const TRAINER_CARD_BANK = 616

/** 그 뱅크의 줄 (`res/text/trainer_card.json` 차례) */
export const TRAINER_CARD_TEXT = {
  idNo: 0, name: 1, money: 2, pokedex: 3, score: 4, time: 5, adventureStarted: 6,
  hallOfFameDebut: 7, timesLinked: 8, linkBattles: 9, linkTrades: 10,
  colon: 11, twoDashes: 12,
  money$: 14, hhmm: 15, date: 17, win: 18, loss: 19, blankDate: 20, count: 21, times: 22,
} as const

/** 뱅크에 값 틀이 없을 때(일본 롬) 값만 찍는 틀 — 칸 번호는 원작 틀과 같다 */
export const VALUE_ONLY = {
  money$: '{STRVAR_1 55, 5, 0}',
  count: '{STRVAR_1 52, 5, 0}',
  times: '{STRVAR_1 55, 5, 0}',
  hhmm: '{STRVAR_1 51, 0, 0}:{STRVAR_1 51, 1, 0}',
  date: '{STRVAR_1 51, 2, 0}/{STRVAR_1 51, 3, 0}/{STRVAR_1 51, 4, 0}',
} as const

/** 카드 팔레트 일곱 줄 중 「도감 없음」 — 시트의 마지막 줄이다 (`trainer_card_normal_no_dex`) */
const NO_DEX_ROW = 6

/**
 * 카드 시트의 몇째 줄을 까는가 (`TrainerCase_LoadCardPalette`).
 *
 * 도감을 받기 전에는 등급과 상관없이 「도감 없음」 판이다 — 노멀과 같은 빨강인데 도감 줄의 띠가 없다
 */
export function cardRow(level: number, pokedexObtained: boolean): number {
  return pokedexObtained ? Math.max(0, Math.min(5, level)) : NO_DEX_ROW
}

/**
 * 받은 배지가 서는 때 줄 — 1이다.
 *
 * 원작 배지는 받는 순간 광 140(`BADGE_POLISH_THRESHOLD_NORMAL` · `TrainerCaseSaveData_Init`)에서 시작하고, 그 단계는
 * `BADGE_POLISH_LEVEL_NORMAL`(2)이라 때 줄은 `2_SPARKLES(3) − 2 = 1`이다 (`TrainerCaseApp_Init`). 닦기와 때 끼기는 아직 없다
 */
const BADGE_DIRT_ROW = 1

/** 홈의 정수 배율 (40 → `WELL` 80) */
const BADGE_SCALE = own.WELL / BADGE_WINDOW

/** 리그 문지기 대사 뱅크 — 「…시티의 ○○배지!」 여덟 토막이 배지 이름이다 (미국 롬 번호) */
const LEAGUE_GATE_BANK = 184

/** 원작이 기록에서 읽는 통신 칸 (`generated/game_records.txt`의 줄 차례 − 1) */
const RECORD = {
  localLinkTrades: 19, unk020: 20, localLinkBattleWins: 21, localLinkBattleLosses: 22,
  wifiTrades: 24, unk025: 25, wifiBattleWins: 26, wifiBattleLosses: 27, unk032: 32,
  linkContestParticipations: 91,
} as const

/**
 * 뒷면의 통신 세 줄 (`TrainerCase_Init` · `TrainerCase_SetLinkDataAndSignature`).
 *
 * 횟수는 여섯 칸을 더하고 999999에서, 대전 승패는 9999에서, 교환은 99999에서 멈춘다. 통신이 범위 밖이라 우리 판에서는 늘
 * 0이지만 원작 뒷면이 그 줄을 늘 그리므로 그대로 둔다
 */
export function linkRecords(records: readonly number[]): { linked: number, wins: number, losses: number, trades: number } {
  const v = (id: number): number => recordValue(records, id)
  return {
    linked: Math.min(999999, v(RECORD.linkContestParticipations) + v(RECORD.localLinkTrades) + v(RECORD.wifiTrades)
      + v(RECORD.unk020) + v(RECORD.unk025) + v(RECORD.unk032)),
    wins: Math.min(9999, v(RECORD.localLinkBattleWins) + v(RECORD.wifiBattleWins)),
    losses: Math.min(9999, v(RECORD.localLinkBattleLosses) + v(RECORD.wifiBattleLosses)),
    trades: Math.min(99999, v(RECORD.localLinkTrades) + v(RECORD.wifiTrades)),
  }
}

/** 시 · 분. 원작 플레이 시간은 999:59에서 멈춘다 (`PlayTime_Increment`) */
export function cardPlayTime(ms: number): { hours: string, minutes: string } {
  const total = Math.min(Math.floor(ms / 60000), 999 * 60 + 59)
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60).padStart(2, '0') }
}

/**
 * 날짜 한 줄 — 롬의 틀(`TrainerCard_Text_Format_MMDD20YY`)에 넣는다.
 *
 * 칸 2는 두 자리 해, 4는 두 자리 날(앞을 0으로 채운다). 칸 3은 **틀이 바라는 것**으로 채운다: 미국판 틀은 달 이름
 * (`{STRVAR_1 74, …}` — `StringTemplate_SetMonthName`)을, 한국판 틀은 숫자(`{STRVAR_1 51, …}`)를 바란다. 달 이름을
 * 한국판 틀에 넣으면 「10월월」이 된다 (달 이름 뱅크가 「10월」이다)
 */
export function cardDate(format: string, monthNames: readonly string[], at: Date): string {
  const month = at.getMonth() + 1
  const wantsName = /\{STRVAR_1 74, 3,/.test(format)
  return fillMenuText(format, [
    '', '',
    String(at.getFullYear() % 100).padStart(2, '0'),
    wantsName ? monthNames[month - 1] ?? String(month) : String(month),
    String(at.getDate()).padStart(2, '0'),
  ])
}

/** 뒤집기 — 접히는 8프레임 · 펴지는 7프레임 (`TrainerCase_FlipTrainerCard`의 배율 걸음을 세었다) */
const FRAME_MS = 1000 / 60
const FOLD_MS = 8 * FRAME_MS
const UNFOLD_MS = 7 * FRAME_MS

/** `SEQ_SE_DP_CARD3` — 카드를 열 때 · `SEQ_SE_DP_CARD5` — 뒤집을 때 (`generated/sdat.txt` 닻 1350에서 센 번호) */
const SE_CARD_OPEN = 1685
const SE_CARD_FLIP = 1686

/** 별 — 열 꼭짓점 한 벌(100×100). 외곽을 따라 도는 테두리가 있어 판 색이 바뀌어도 읽힌다 */
const STAR_POINTS = '50,0 61,36 98,36 68,58 79,94 50,72 21,94 32,58 2,36 39,36'

function Star({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={STAR_POINTS} />
    </svg>
  )
}

/** 정수 3배 주인공 — 시트 두 칸(남 · 여) 중 하나 */
const heroStyle = (url: string, girl: boolean): CSSProperties => {
  const { cellW, cellH, scale, sheetCols } = own.HERO
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${String(cellW * sheetCols * scale)}px ${String(cellH * scale)}px`,
    // 광휘(남) 0번 · 빛나(여) 1번 — 원작은 `lucas_NSCR`에 성별을 더해 고른다
    backgroundPosition: `-${String(girl ? cellW * scale : 0)}px 0`,
  }
}

/** 배지 한 칸의 그림. 받은 것과 못 받은 것이 **같은 그림**이고 못 받은 쪽만 `brightness(0)`이 걸린다 (`badgeArtStyle`) */
const badgeArt = (url: string | null, bit: number): CSSProperties =>
  badgeArtStyle(url, bit, BADGE_SCALE, BADGE_DIRT_ROW)

export function TrainerCard() {
  const back = useMenuStore((s) => s.back)
  const locale = useGameLocale()
  const { trainer, money, badges, pokedex, records, nationalDex } = useSaveStore()
  const [face, setFace] = useState<'front' | 'back'>('front')
  const [fold, setFold] = useState<'none' | 'in' | 'out'>('none')
  const timers = useRef<number[]>([])
  /** 고른 배지 — 받은 것 중 가장 높은 번호에서 시작한다. 하나도 없으면 null */
  const [pick, setPick] = useState<number | null>(() => firstPick(badges))

  const [text, setText] = useState<readonly string[]>([])
  const [months, setMonths] = useState<readonly string[]>([])
  const [caseText, setCaseText] = useState<readonly string[]>([])
  const [gate, setGate] = useState<readonly string[]>([])
  const [leaderNames, setLeaderNames] = useState<readonly string[]>([])
  const [placeNames, setPlaceNames] = useState<readonly string[]>([])
  const [lists, setLists] = useState<Readonly<Record<string, readonly number[]>> | null>(null)

  useEffect(() => {
    let alive = true
    // ⚠️ 뱅크 하나가 없어도 나머지는 선다 — 일본판 롬은 달 이름 뱅크가 없다(`UI_BANK.monthNames`)
    const bank = (n: number, set: (t: readonly string[]) => void): void => {
      loadDialogueBank(locale, n).then((t) => { if (alive) set(t) }, () => { if (alive) set([]) })
    }
    bank(TRAINER_CARD_BANK, setText)
    bank(UI_BANK.monthNames, setMonths)
    bank(UI_BANK.saveInfo, setCaseText)
    bank(LEAGUE_GATE_BANK, setGate)
    loadTrainerNames(locale).then((t) => { if (alive) setLeaderNames(t) }, () => { if (alive) setLeaderNames([]) })
    loadLocationNames(locale).then((t) => { if (alive) setPlaceNames(t) }, () => { if (alive) setPlaceNames([]) })
    loadPokedexSort(locale).then((s) => { if (alive) setLists(s.lists) }, () => { if (alive) setLists(null) })
    return () => { alive = false }
  }, [locale])

  useEffect(() => {
    fieldScripts.services.sound?.playEffect(SE_CARD_OPEN)
    const pending = timers.current
    return () => { for (const t of pending) window.clearTimeout(t) }
  }, [])

  const heroUrl = useAssetImage('data/trainerCase/trainer.png')
  const badgeUrl = useAssetImage(BADGE_ART.path)
  const leader = pick === null ? null : BADGE_LEADERS[pick]!
  const leaderUrl = useAssetImage(leader === null ? null : `data/trainers/${String(leader.cls)}.png`)

  const flip = (): boolean => {
    if (fold !== 'none') return false
    fieldScripts.services.sound?.playEffect(SE_CARD_FLIP)
    setFold('in')
    timers.current.push(window.setTimeout(() => {
      setFace((f) => (f === 'front' ? 'back' : 'front'))
      setFold('out')
      timers.current.push(window.setTimeout(() => { setFold('none') }, UNFOLD_MS))
    }, FOLD_MS))
    // 메뉴 소리 대신 카드 소리다
    return false
  }
  /** 받은 배지만 밟는다 (`stepBadge`). 옮길 데가 없으면 소리가 안 난다 */
  const movePick = (dir: 'left' | 'right' | 'up' | 'down') => (): boolean => {
    const next = stepBadge(badges, pick, dir)
    if (next === null) return false
    setPick(next)
    return true
  }
  // 뒤집는 동안은 원작도 입력을 안 본다 (`TRAINER_CASE_STATE_FLIP_CARD`)
  useMenuKeys({
    cancel: () => (fold === 'none' ? back() : false),
    confirm: flip,
    left: movePick('left'),
    right: movePick('right'),
    up: movePick('up'),
    down: movePick('down'),
  })

  const pokedexObtained = fieldScripts.vars.checkFlag(FLAG_HAS_POKEDEX)
  const gameCompleted = fieldScripts.vars.checkFlag(SYSTEM_FLAG.gameCompleted)
  // ⚠️ 셋은 늘 거짓이다 — 배틀타워는 막혀 있고 콘테스트 · 지하통로는 범위 밖이다 (`GetTrainerCardLevel`과 같은 판단)
  const level = trainerCardLevel({
    gameCompleted, nationalDexCompleted: nationalDexCompleted(pokedex.caught),
    towerStreak100: false, contestMaster: false, undergroundPlatBase: false,
  })
  const row = cardRow(level, pokedexObtained)
  /** 판 색 — 「도감 없음」(6)도 노멀과 같은 빨강이다 (`trainer_card_normal_no_dex`) */
  const plate = own.rank[`r${String(Math.min(row, 5))}` as keyof typeof own.rank]
  const seen = lists === null ? null : dexCounts(lists, nationalDex, pokedex).seen
  const link = linkRecords(records)
  const time = cardPlayTime(trainer.playtimeMs)

  const t = (at: number): string => text[at] ?? ''
  /**
   * 값 틀. ⚠️ **일본 롬의 이 뱅크는 14줄이다** — 이름표까지만 있고 값 틀(돈 · 마리 · 날짜 · 승패 …)은 코드가 찍는다. 그 자리는
   * 값만 찍는다(`VALUE_ONLY`) — 일본어 낱말을 지어내지 않는다
   */
  const tpl = (at: keyof typeof VALUE_ONLY): string => text[TRAINER_CARD_TEXT[at]] || VALUE_ONLY[at]
  const dateLine = (at: number): string => cardDate(tpl('date'), months, new Date(at))
  const debut = trainer.firstClearedAt === null ? null : new Date(trainer.firstClearedAt)

  const have = Array.from({ length: BADGE_COUNT }, (_, i) => i).filter((i) => hasBadge(badges, i)).length
  const names = badgeNames(gate)
  // 케이스 머리 — 「가진 배지」와 「n개」는 리포트 요약창(534번 뱅크)의 이름표와 틀이다
  const caseLabel = caseText[2] ?? ''
  const caseCount = caseText[6] ? fillMenuText(caseText[6], ['', '', String(have)]) : String(have)
  const pickName = pick === null ? null : names[pick] ?? null
  const place = leader === null ? null : usableName(placeNames[leader.place])
  const who = leader === null ? null : usableName(leaderNames[leader.trainer])
  const sub = [place, who].filter((x): x is string => x !== null).join(' · ')

  const cardClass = [
    own.card, plate,
    fold === 'in' ? own.foldIn : fold === 'out' ? own.foldOut : '',
  ].filter(Boolean).join(' ')

  return (
    <MenuScreen title="트레이너 카드" foot="Z 뒤집기 · ↑↓←→ 배지 · X 닫기">
      <div className={own.stage}>
        <div className={own.board}>
          <div className={own.cardSlot}>
            <div className={cardClass} data-card-face={face}>
              {face === 'front' ? (
                <>
                  <div className={own.markRing} />
                  <div className={own.markDot} />
                  <div className={own.cardHead}>
                    <span className={own.ballMark} />
                    <span className={own.idLabel}>{t(TRAINER_CARD_TEXT.idNo)}</span>
                    <span className={own.idNumber}>{String(trainer.id).padStart(5, '0')}</span>
                    <span className={own.headStars}>
                      {Array.from({ length: level }, (_, i) => <Star key={i} className={`${own.starSvg} ${own.starOn}`} />)}
                    </span>
                  </div>
                  <dl className={own.nameBlock}>
                    <dt className={own.nameLabel}>{t(TRAINER_CARD_TEXT.name)}</dt>
                    <dd className={own.nameValue}>{trainer.name}</dd>
                  </dl>
                  <dl className={own.bands}>
                    <div className={own.band}>
                      <dt className={own.bandLabel}>{t(TRAINER_CARD_TEXT.money)}</dt>
                      <dd className={own.bandValue}>{fillMenuText(tpl('money$'), ['', '', '', '', '', money.toLocaleString('ko-KR')])}</dd>
                    </div>
                    {/* 원작도 도감을 받기 전에는 이 줄을 이름표째 안 그린다 (`TrainerCard_DrawFrontText`) — 남은 띠가 같은 간격으로 선다 */}
                    {pokedexObtained && (
                      <div className={own.band}>
                        <dt className={own.bandLabel}>{t(TRAINER_CARD_TEXT.pokedex)}</dt>
                        <dd className={own.bandValue}>
                          {seen === null ? '' : fillMenuText(tpl('count'), ['', '', '', '', '', String(seen)])}
                        </dd>
                      </div>
                    )}
                    {/* 트레이너 스코어 (PARITY §7.5). 기록 1번 칸이 곧 이 값이다 */}
                    <div className={own.band}>
                      <dt className={own.bandLabel}>{t(TRAINER_CARD_TEXT.score)}</dt>
                      <dd className={own.bandValue}>{recordValue(records, RECORD_TRAINER_SCORE).toLocaleString('ko-KR')}</dd>
                    </div>
                  </dl>
                  <dl className={own.wide}>
                    <div className={own.wideBand}>
                      <dt className={own.bandLabel}>{t(TRAINER_CARD_TEXT.time)}</dt>
                      <dd className={`${own.wideValue} ${own.timeValue}`}>
                        {time.hours}<span className={own.colon}>{t(TRAINER_CARD_TEXT.colon)}</span>{time.minutes}
                      </dd>
                    </div>
                    {/* 옛 리포트는 시작한 날을 안 적어 뒀다 — 지어내지 않고 줄을 안 그린다. 남은 띠 하나가 아래에 붙는다 */}
                    {trainer.adventureStartedAt !== null && (
                      <div className={own.wideBand}>
                        <dt className={own.bandLabel}>{t(TRAINER_CARD_TEXT.adventureStarted)}</dt>
                        <dd className={own.wideValue}>{dateLine(trainer.adventureStartedAt)}</dd>
                      </div>
                    )}
                  </dl>
                  {/* 주인공은 앞면에만 선다 — 뒤집으면 그 판을 비운다 (`TrainerCase_ClearTrainerSprite`) */}
                  <div className={own.photoBox}>
                    {heroUrl !== null && (
                      <div className={own.hero} data-pixel-scale={own.HERO.scale} style={heroStyle(heroUrl, trainer.gender !== 'boy')} />
                    )}
                  </div>
                </>
              ) : (
                <>
                  <dl className={own.backBands}>
                    {/* 첫 전당등록은 두 줄이다 — 날짜, 그 아래 시각. 아직이면 빈 날짜와 「--:--」 (`TrainerCard_DrawBackText`) */}
                    <div className={`${own.backBand} ${own.twoRowBand}`}>
                      <div className={own.twoRow}>
                        <dt className={own.bandLabel}>{t(TRAINER_CARD_TEXT.hallOfFameDebut)}</dt>
                        <dd className={own.bandValue}>
                          {debut === null ? t(TRAINER_CARD_TEXT.blankDate) : dateLine(debut.getTime())}
                        </dd>
                      </div>
                      <div className={own.twoRow}>
                        <dd className={own.bandValue}>
                          {debut === null
                            ? fillMenuText(tpl('hhmm'), [t(TRAINER_CARD_TEXT.twoDashes), t(TRAINER_CARD_TEXT.twoDashes)])
                            : fillMenuText(tpl('hhmm'), [String(debut.getHours()), String(debut.getMinutes()).padStart(2, '0')])}
                        </dd>
                      </div>
                    </div>
                    <div className={own.backBand}>
                      <dt className={own.bandLabel}>{t(TRAINER_CARD_TEXT.timesLinked)}</dt>
                      <dd className={own.bandValue}>{fillMenuText(tpl('times'), ['', '', '', '', '', String(link.linked)])}</dd>
                    </div>
                    <div className={own.backBand}>
                      <dt className={own.bandLabel}>{t(TRAINER_CARD_TEXT.linkBattles)}</dt>
                      <dd className={own.winLoss}>
                        <span>{t(TRAINER_CARD_TEXT.win)}</span><span>{String(link.wins)}</span>
                        <span>{t(TRAINER_CARD_TEXT.loss)}</span><span>{String(link.losses)}</span>
                      </dd>
                    </div>
                    <div className={own.backBand}>
                      <dt className={own.bandLabel}>{t(TRAINER_CARD_TEXT.linkTrades)}</dt>
                      <dd className={own.bandValue}>{fillMenuText(tpl('times'), ['', '', '', '', '', String(link.trades)])}</dd>
                    </div>
                  </dl>
                  <div className={own.lowPanel} />
                  <div className={own.sign} />
                  {row === 5 && (
                    <>
                      <div className={`${own.pillar} ${own.pillarLeft}`}>
                        {[0, 1, 2, 3].map((i) => <Star key={i} className={`${own.starSvg} ${own.starOn}`} />)}
                      </div>
                      <div className={`${own.pillar} ${own.pillarRight}`}>
                        {[0, 1, 2, 3].map((i) => <Star key={i} className={`${own.starSvg} ${own.starOn}`} />)}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className={own.rankStrip}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={`${own.rankStar} ${i < level ? own.rankStarOn : ''}`} />
            ))}
            <span className={own.pips} aria-hidden="true">
              <span className={`${own.pip} ${face === 'front' ? own.pipOn : ''}`} />
              <span className={`${own.pip} ${face === 'back' ? own.pipOn : ''}`} />
            </span>
          </div>

          <section className={own.caseBox}>
            <div className={own.caseHead}>
              <span>{caseLabel}</span>
              <span className={own.caseCount}>{caseCount}</span>
            </div>
            {/* 받은 칸만 radio다 — 못 받은 칸은 같은 그림을 까맣게 눌러 새겨진 홈으로 보인다 */}
            <div className={own.tray} role="radiogroup" aria-label={caseLabel || undefined}>
              {Array.from({ length: BADGE_COUNT }, (_, i) => {
                const got = hasBadge(badges, i)
                const picked = got && i === pick
                const label = names[i] ?? undefined
                return (
                  <div
                    key={i}
                    className={own.well}
                    {...(got
                      ? {
                        role: 'radio',
                        'aria-checked': picked,
                        ...(label === undefined ? {} : { 'aria-label': label }),
                        onClick: () => { setPick(i) },
                      }
                      : { 'aria-hidden': true })}
                    data-badge={got ? 'on' : 'off'}
                  >
                    {picked && <span className={own.halo} />}
                    <div className={own.wellCell}>
                      <div className={got ? undefined : badgeOff} style={badgeArt(badgeUrl, i)} />
                    </div>
                    {/* 고른 배지의 반짝임 넷 — 칸이 바뀌면 다시 시작한다 */}
                    {picked && [[-36, -26, 0], [34, -18, 0.3], [-30, 26, 0.6], [38, 24, 0.9]].map(([x, y, d], k) => (
                      <i
                        key={`${String(i)}-${String(k)}`}
                        className={own.spark}
                        style={{ translate: `${String(x)}px ${String(y)}px`, animationDelay: `${String(d)}s` }}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
            <div className={own.caption} data-badge-caption={pick ?? ''}>
              {leaderUrl !== null && <div className={own.leader} style={{ backgroundImage: `url(${leaderUrl})` }} />}
              {pickName !== null || sub !== '' ? (
                <div className={own.captionText}>
                  {pickName !== null && <p className={own.badgeName}>{pickName}</p>}
                  {sub !== '' && <p className={own.badgeSub}>{sub}</p>}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </MenuScreen>
  )
}
