// 트레이너 카드 — 시작 메뉴에서 이름 자리를 고르면 뜬다 (`applications/trainer_case`).
//
// 원작은 두 화면이다: 위가 카드, 아래가 배지 케이스. 한 창에서는 둘을 나란히 둔다(`trainerCard.css`).
//
//   앞면  IDNo. · 이름 · 용돈 · 도감(도감을 받은 뒤에만) · 스코어 · 플레이 시간 · 모험을 시작한 날, 사진 칸에 주인공
//   뒷면  첫 전당등록(날짜와 시각 — 아직이면 「--」) · 통신한 횟수 · 통신대전 · 통신교환, 아래에 서명 칸
//   케이스 배지 여덟. 받은 것만 홈 위에 앉는다
//
// Z가 뒤집고 X가 닫는다 (`TrainerCaseApp_Main`의 `INPUT_A_BUTTON` → `TrainerCase_FlipTrainerCard` · `INPUT_B_BUTTON`).
//
// ⚠️ **글은 한 줄도 우리가 안 짓는다.** 이름표와 문장 틀이 다 트레이너 카드 뱅크(`TEXT_BANK_TRAINER_CARD`)의 것이다.
//
// 범위 밖인 것: 서명(통신 광장에서 쓴다 — 서명 칸은 빈 채다) · 배지 닦기와 때(터치로 문지르는 놀이 · 날마다 때가 낀다 —
// 받은 배지는 받은 날의 광 그대로 선다) · 케이스 뚜껑(터치 단추로 연다 — 열린 채로 둔다).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { loadDialogueBank, loadPokedexSort } from '../../data/gameData'
import { assets, readJson } from '../../data/providers/assetProvider'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { fillMenuText, UI_BANK } from '../../data/uiText'
import { fieldScripts } from '../../engine/script/field'
import { SYSTEM_FLAG, trainerCardLevel } from '../../engine/script/commands'
import { FLAG_HAS_POKEDEX } from '../../engine/script/vars'
import { RECORD_TRAINER_SCORE, recordValue } from '../../engine/world/gameRecords'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { dexCounts, nationalDexCompleted } from './dexCounts'
import { useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
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
 * 원작 창 자리 — [왼쪽 타일 · 위 타일 · 폭 타일 · 높이 타일] (`sTrainerCardWindowTemplates` · `card_text.c`).
 * 아래 화면 256×192 기준이라 카드 그림 상자로 옮겨 쓴다
 */
const WINDOWS = {
  id: [2, 4, 17, 2], name: [2, 6, 17, 2], money: [2, 9, 17, 2], pokedex: [2, 12, 17, 2], score: [2, 15, 17, 2],
  time: [2, 18, 28, 2], adventure: [2, 20, 28, 2],
  hof: [2, 2, 28, 4], linked: [2, 7, 28, 2], battles: [2, 9, 28, 2], trades: [2, 11, 28, 2],
} as const

const TILE = 8

/** 구운 상자 · 글자 색 (`data/trainerCase/index.json`) */
interface CaseArt {
  card: [number, number, number, number]
  trainer: [number, number, number, number]
  badge: [number, number, number, number]
  text: [[number, number, number], [number, number, number]][]
}

/** 상자 없이 그릴 때(그룹을 아직 못 받았다)의 카드 자리 — 원작 카드는 화면 (8, 8)에서 240×176이다 */
const BARE_CARD: CaseArt['card'] = [8, 8, 240, 176]

/** 화면 좌표 상자를 카드 안 백분율로 */
function place(box: readonly number[], card: readonly number[]): CSSProperties {
  const [x, y, w, h] = box as [number, number, number, number]
  const [cx, cy, cw, ch] = card as [number, number, number, number]
  return {
    left: `${String(((x - cx) / cw) * 100)}%`,
    top: `${String(((y - cy) / ch) * 100)}%`,
    width: `${String((w / cw) * 100)}%`,
    height: `${String((h / ch) * 100)}%`,
  }
}

/** 원작 창 하나의 자리 */
function windowAt(key: keyof typeof WINDOWS, card: readonly number[]): CSSProperties {
  const [tx, ty, tw, th] = WINDOWS[key]
  return place([tx * TILE, ty * TILE, tw * TILE, th * TILE], card)
}

/**
 * 배지 여덟의 자리 — 아래 화면 좌표 (`sBadgeCoordinates` · `trainer_case/sprites.c`). 차례가 배지 비트 차례다
 * (석탄 · 숲 · 광석 · 늪 · 유물 · 광산 · 고드름 · 등대)
 */
const BADGE_AT: readonly (readonly [number, number])[] = [
  [24, 40], [80, 40], [136, 40], [192, 40], [24, 72], [80, 72], [136, 72], [192, 72],
]

/**
 * 받은 배지가 서는 때 줄 — 1이다.
 *
 * 원작 배지는 받는 순간 광 140(`BADGE_POLISH_THRESHOLD_NORMAL` · `TrainerCaseSaveData_Init`)에서 시작하고, 그 단계는
 * `BADGE_POLISH_LEVEL_NORMAL`(2)이라 때 줄은 `2_SPARKLES(3) − 2 = 1`이다 (`TrainerCaseApp_Init`). 닦기와 때 끼기는 아직 없다
 */
const BADGE_DIRT_ROW = 1

/** 배지 비트 차례 여덟 (`BADGE_ID_COAL` … `_BEACON`) */
const BADGES = 8

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

const rgb = (c: readonly number[]): string => `rgb(${c.join(' ')})`

export function TrainerCard() {
  const back = useMenuStore((s) => s.back)
  const locale = useGameLocale()
  const { trainer, money, badges, pokedex, records, nationalDex } = useSaveStore()
  const [face, setFace] = useState<'front' | 'back'>('front')
  const [fold, setFold] = useState<'none' | 'in' | 'out'>('none')
  const timers = useRef<number[]>([])

  const [text, setText] = useState<readonly string[]>([])
  const [months, setMonths] = useState<readonly string[]>([])
  const [lists, setLists] = useState<Readonly<Record<string, readonly number[]>> | null>(null)
  const [art, setArt] = useState<CaseArt | null>(null)

  useEffect(() => {
    let alive = true
    // ⚠️ 뱅크 하나가 없어도 나머지는 선다 — 일본판 롬은 달 이름 뱅크가 없다(`UI_BANK.monthNames`)
    loadDialogueBank(locale, TRAINER_CARD_BANK).then((t) => { if (alive) setText(t) }, () => { if (alive) setText([]) })
    loadDialogueBank(locale, UI_BANK.monthNames).then((t) => { if (alive) setMonths(t) }, () => { if (alive) setMonths([]) })
    loadPokedexSort(locale).then((s) => { if (alive) setLists(s.lists) }, () => { if (alive) setLists(null) })
    return () => { alive = false }
  }, [locale])

  useEffect(() => {
    let alive = true
    ;(readJson(assets(), 'data/trainerCase/index.json') as Promise<CaseArt>)
      .then((a) => { if (alive) setArt(a) }, () => { if (alive) setArt(null) })
    fieldScripts.services.sound?.playEffect(SE_CARD_OPEN)
    const pending = timers.current
    return () => { alive = false; for (const t of pending) window.clearTimeout(t) }
  }, [])

  const cardPng = useAssetImage(art ? 'data/trainerCase/card.png' : null)
  const trainerPng = useAssetImage(art ? 'data/trainerCase/trainer.png' : null)
  const casePng = useAssetImage(art ? 'data/trainerCase/case.png' : null)
  const badgePng = useAssetImage(art ? 'data/trainerCase/badges.png' : null)

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
  // 뒤집는 동안은 원작도 입력을 안 본다 (`TRAINER_CASE_STATE_FLIP_CARD`)
  useMenuKeys({ cancel: () => (fold === 'none' ? back() : false), confirm: flip })

  const pokedexObtained = fieldScripts.vars.checkFlag(FLAG_HAS_POKEDEX)
  const gameCompleted = fieldScripts.vars.checkFlag(SYSTEM_FLAG.gameCompleted)
  // ⚠️ 셋은 늘 거짓이다 — 배틀타워는 막혀 있고 콘테스트 · 지하통로는 범위 밖이다 (`GetTrainerCardLevel`과 같은 판단)
  const level = trainerCardLevel({
    gameCompleted, nationalDexCompleted: nationalDexCompleted(pokedex.caught),
    towerStreak100: false, contestMaster: false, undergroundPlatBase: false,
  })
  const row = cardRow(level, pokedexObtained)
  const seen = lists === null ? null : dexCounts(lists, nationalDex, pokedex).seen
  const link = linkRecords(records)
  const time = cardPlayTime(trainer.playtimeMs)

  const t = (at: number): string => text[at] ?? ''
  /**
   * 값 틀. ⚠️ **일본 롬의 이 뱅크는 14줄이다** — 이름표까지만 있고 값 틀(돈 · 마리 · 날짜 · 승패 …)은 코드가 찍는다. 그 자리는
   * 값만 찍는다(`VALUE_ONLY`) — 일본어 낱말을 지어내지 않는다
   */
  const tpl = (at: keyof typeof VALUE_ONLY): string => text[TRAINER_CARD_TEXT[at]] || VALUE_ONLY[at]
  const box = art?.card ?? BARE_CARD
  const ink = art?.text[row]
  const cardStyle: CSSProperties = {
    aspectRatio: `${String(box[2])} / ${String(box[3])}`,
    ...(cardPng !== null ? {
      backgroundImage: `url(${cardPng})`,
      backgroundSize: '200% 700%',
      backgroundPosition: `${face === 'front' ? '0%' : '100%'} ${String((row / NO_DEX_ROW) * 100)}%`,
    } : {}),
    ...(ink
      ? { color: rgb(ink[0]), textShadow: `calc(100cqw / ${String(box[2])}) calc(100cqw / ${String(box[2])}) 0 ${rgb(ink[1])}` }
      : {}),
    transform: fold === 'in' ? 'scaleX(0)' : 'scaleX(1)',
    transition: fold === 'in' ? `transform ${String(FOLD_MS)}ms ease-in`
      : fold === 'out' ? `transform ${String(UNFOLD_MS)}ms ease-out` : 'none',
  }
  const dateLine = (at: number): string => cardDate(tpl('date'), months, new Date(at))
  const debut = trainer.firstClearedAt === null ? null : new Date(trainer.firstClearedAt)

  return (
    <MenuScreen title="트레이너 카드" foot="Z 뒤집기 · X 닫기">
      <div className={own.stage}>
        <div className={own.cardSlot}>
          <div className={cardPng ? own.card : `${own.card} ${own.cardBare}`} style={cardStyle}>
            {face === 'front' ? (
              <dl>
                <div className={own.line} style={windowAt('id', box)}>
                  <dt>{t(TRAINER_CARD_TEXT.idNo)}</dt><dd>{String(trainer.id).padStart(5, '0')}</dd>
                </div>
                <div className={own.line} style={windowAt('name', box)}>
                  <dt>{t(TRAINER_CARD_TEXT.name)}</dt><dd>{trainer.name}</dd>
                </div>
                <div className={own.line} style={windowAt('money', box)}>
                  <dt>{t(TRAINER_CARD_TEXT.money)}</dt>
                  <dd>{fillMenuText(tpl('money$'), ['', '', '', '', '', money.toLocaleString('ko-KR')])}</dd>
                </div>
                {/* 원작도 도감을 받기 전에는 이 줄을 이름표째 안 그린다 (`TrainerCard_DrawFrontText`) */}
                {pokedexObtained && (
                  <div className={own.line} style={windowAt('pokedex', box)}>
                    <dt>{t(TRAINER_CARD_TEXT.pokedex)}</dt>
                    <dd>{seen === null ? '' : fillMenuText(tpl('count'), ['', '', '', '', '', String(seen)])}</dd>
                  </div>
                )}
                {/* 트레이너 스코어 (PARITY §7.5). 기록 1번 칸이 곧 이 값이다 */}
                <div className={own.line} style={windowAt('score', box)}>
                  <dt>{t(TRAINER_CARD_TEXT.score)}</dt>
                  <dd>{recordValue(records, RECORD_TRAINER_SCORE).toLocaleString('ko-KR')}</dd>
                </div>
                <div className={own.line} style={windowAt('time', box)}>
                  <dt>{t(TRAINER_CARD_TEXT.time)}</dt>
                  <dd>{time.hours}<span className={own.colon}>{t(TRAINER_CARD_TEXT.colon)}</span>{time.minutes}</dd>
                </div>
                {/* 옛 리포트는 시작한 날을 안 적어 뒀다 — 지어내지 않고 줄을 안 그린다 */}
                {trainer.adventureStartedAt !== null && (
                  <div className={own.line} style={windowAt('adventure', box)}>
                    <dt>{t(TRAINER_CARD_TEXT.adventureStarted)}</dt><dd>{dateLine(trainer.adventureStartedAt)}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <dl>
                {/* 첫 전당등록은 두 줄이다 — 날짜, 그 아래 시각. 아직이면 빈 날짜와 「--:--」 (`TrainerCard_DrawBackText`) */}
                <div className={`${own.line} ${own.twoRows}`} style={windowAt('hof', box)}>
                  <dt>{t(TRAINER_CARD_TEXT.hallOfFameDebut)}</dt>
                  <dd>
                    <span>{debut === null ? t(TRAINER_CARD_TEXT.blankDate) : dateLine(debut.getTime())}</span>
                    <span>
                      {debut === null
                        ? fillMenuText(tpl('hhmm'), [t(TRAINER_CARD_TEXT.twoDashes), t(TRAINER_CARD_TEXT.twoDashes)])
                        : fillMenuText(tpl('hhmm'), [String(debut.getHours()), String(debut.getMinutes()).padStart(2, '0')])}
                    </span>
                  </dd>
                </div>
                <div className={own.line} style={windowAt('linked', box)}>
                  <dt>{t(TRAINER_CARD_TEXT.timesLinked)}</dt>
                  <dd>{fillMenuText(tpl('times'), ['', '', '', '', '', String(link.linked)])}</dd>
                </div>
                {/* 「승」은 창 14칸째, 「패」는 22칸째에 박고 수는 그 뒤 칸 끝에 붙인다 */}
                <div className={own.line} style={windowAt('battles', box)}>
                  <dt>{t(TRAINER_CARD_TEXT.linkBattles)}</dt>
                  <dd>
                    <span className={own.pinned} style={{ left: `${String((14 / 28) * 100)}%` }}>{t(TRAINER_CARD_TEXT.win)}</span>
                    <span className={own.pinned} style={{ right: `${String((8 / 28) * 100)}%` }}>{String(link.wins)}</span>
                    <span className={own.pinned} style={{ left: `${String((22 / 28) * 100)}%` }}>{t(TRAINER_CARD_TEXT.loss)}</span>
                    <span className={own.pinned} style={{ right: 0 }}>{String(link.losses)}</span>
                  </dd>
                </div>
                <div className={own.line} style={windowAt('trades', box)}>
                  <dt>{t(TRAINER_CARD_TEXT.linkTrades)}</dt>
                  <dd>{fillMenuText(tpl('times'), ['', '', '', '', '', String(link.trades)])}</dd>
                </div>
              </dl>
            )}
            {/* 주인공은 앞면에만 선다 — 뒤집으면 그 판을 비운다 (`TrainerCase_ClearTrainerSprite`) */}
            {face === 'front' && art && trainerPng && (
              <div
                className={own.trainer}
                style={{
                  ...place(art.trainer, box),
                  backgroundImage: `url(${trainerPng})`,
                  backgroundSize: '200% 100%',
                  // 광휘(남) 0번 · 빛나(여) 1번 — 원작은 `lucas_NSCR`에 성별을 더해 고른다
                  backgroundPosition: `${trainer.gender === 'boy' ? '0%' : '100%'} 0`,
                }}
              />
            )}
          </div>
        </div>

        <div className={own.caseSlot}>
          <div
            className={casePng ? own.caseArt : `${own.caseArt} ${own.caseBare}`}
            style={casePng ? { backgroundImage: `url(${casePng})` } : undefined}
          >
            {art && badgePng && Array.from({ length: BADGES }, (_, i) => {
              if ((badges & (1 << i)) === 0) return null
              const [bx, by, bw, bh] = art.badge
              const [x, y] = BADGE_AT[i]!
              return (
                <span
                  key={i}
                  className={own.badge}
                  style={{
                    ...place([x + bx, y + by, bw, bh], [0, 0, 256, 192]),
                    backgroundImage: `url(${badgePng})`,
                    backgroundSize: `${String(BADGES * 100)}% 400%`,
                    backgroundPosition: `${String((i / (BADGES - 1)) * 100)}% ${String((BADGE_DIRT_ROW / 3) * 100)}%`,
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </MenuScreen>
  )
}
