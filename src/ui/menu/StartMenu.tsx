// 시작 메뉴 — C를 누르면 뜬다 (X·Esc로도). 화면 오른쪽에 붙는 세로 레일이다 (SYSTEM §0 L1 붙는 창).
//
// 항목이 상황에 따라 나타났다 사라진다. 도감은 마박사에게 받기 전에는 없고, 포켓몬은 파티가 비어 있으면
// 없다 (`StartMenu_GetNormalHiddenOptions` — 원작은 첫 파트너 변수를 본다). 사파리게임 중에는 「포기한다」가 맨
// 위에 서고 리포트가 빠지며, 교감광장에서는 포켓몬과 가방이 빠진다 (`startMenuEntries`가 차례와 숨김을 쥔다).
// 가방부터 닫기까지 다섯 줄은 늘 있다 — 가방은 새 판을 열 때 받으므로(`StartNewSave`) 첫 파트너를 받기 전에
// 메뉴를 열면 그 다섯 줄뿐이다. 없는 항목은 흐리게 두지 않고 아예 뺀다 — 원작도 목록에서 뺀다.
//
// 줄은 원작 아이콘이 주인공이다(`menuIcon`). 고른 줄의 아이콘만 컬러로 부풀었다가 흔들린다(30Hz 프레임).
// 고른 것은 줄 밖의 금 띠 하나가 미끄러지고(`pickBand`), 옆에는 그 항목의 실제 상태 엿보기가 뜬다(`StartPeek`).
// 포켓치는 메뉴 스택이 열려 있는 동안 걷힌다(`PoketchWidget`) — 그 대신 시각이 레일 머리로 온다.
import { useEffect, useState } from 'react'
import { loadMoveNames, loadPokeIcons, loadStartMenuIcons } from '../../data/gameData'
import type { PokeIcons } from '../../data/schema'
import { fillMenuText, loadUiText, START_MENU } from '../../data/uiText'
import { mapById, world } from '../../engine/map/world'
import { fieldScripts, flyVerdictNow, start as startScript } from '../../engine/script/field'
import { FIELD_MOVES } from '../../engine/script/fieldMoves'
import { FLAG_HAS_POKEDEX } from '../../engine/script/vars'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { useSessionStore } from '../../state/sessionStore'
import { worldState } from '../../state/worldState'
import { KeyHints } from '../common/KeyHints'
import { bandAt } from '../common/pickBand'
import { LINE } from '../theme/scale'
import { clampCursor, useMenuKeys, wrapCursor } from './useMenuKeys'
import { loadBagData } from './BagScreen'
import { menuIcon, warnMenuIconsMissing } from './menuIcon'
import { monIconAt } from './pokeIcon'
import { StartPeek } from './StartPeek'
import {
  iconKeyOf, MAP_AMITY_SQUARE, peekKindOf, SAFARI_RETIRE_SCRIPT, startMenuKeys, type StartKey,
} from './startMenuEntries'
import * as own from './startMenu.css'

interface Entry {
  key: StartKey
  label: string
  go: () => void
}

/** 레일 아래 안내 — 키 글자만 키캡으로 감싼다. 「닫기」 한 동사다 (SYSTEM §0 L6) */
const FOOT = '↑↓ 고르기 · Z 결정 · X 닫기'

/** 고른 줄의 가운데가 화면 위에서 몇 px인가 — 엿보기가 이 높이에 앉는다 */
function rowCenterY(at: number): number {
  return own.RAIL_INSET + own.RAIL_BORDER + own.HEAD_HEIGHT + 1 + own.LIST_PAD_Y
    + at * LINE.rowTall + LINE.rowTall / 2
}

/** 게임 시각 `hh:mm`. 포켓치의 시계와 같은 값이다 (`worldState.time.gameHour`) */
function gameClockText(): string {
  const h = worldState.time.gameHour
  const hour = Math.floor(h) % 24
  const minute = Math.floor((h % 1) * 60)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** 시각을 다시 읽는다. 초마다 확인하고 글이 바뀔 때(분이 넘어갈 때)만 상태가 바뀐다 */
function useGameClock(): string {
  const [text, setText] = useState(gameClockText)
  useEffect(() => {
    const id = window.setInterval(() => { setText(gameClockText()) }, 1000)
    return () => { window.clearInterval(id) }
  }, [])
  return text
}

/** 창 높이. 엿보기를 화면 안으로 자를 때 쓴다 */
function useViewportHeight(): number {
  const [h, setH] = useState(() => window.innerHeight)
  useEffect(() => {
    const onResize = (): void => { setH(window.innerHeight) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [])
  return h
}

/** 원작 `menuCursorPos`의 첫 값 0 = `START_MENU_OPTION_POKEDEX` */
const FIRST_KEY: StartKey = 'pokedex'

/**
 * 커서가 마지막으로 놓였던 항목 (`fieldSystem->menuCursorPos` · `start_menu.c`).
 *
 * ⚠️ **자리 번호가 아니라 항목을 남긴다.** 원작도 `options[i]`의 id를 견준다 —
 * 도감·포켓몬·공중날기가 나타났다 사라지면 같은 번호가 다른 항목이 되기 때문이다.
 * 그 항목이 없으면 맨 위에 선다. 화면이 닫혀도(가방을 보고 돌아와도) 남아야
 * 해서 컴포넌트 밖에 둔다.
 *
 * 원작 값은 필드가 새로 설 때 0으로 돌아간다 (`InitFieldSystem`의 `MI_CpuClear8`) —
 * 새 게임이든 이어하기든 타이틀을 거쳐 온 판이다. 그래서 타이틀로 나가면 비운다
 */
let lastKey: StartKey = FIRST_KEY
useSessionStore.subscribe((s, prev) => {
  if (s.phase === 'title' && prev.phase !== 'title') lastKey = FIRST_KEY
})

export function StartMenu() {
  const [texts, setTexts] = useState<string[]>([])
  const [moveNames, setMoveNames] = useState<string[]>([])
  const [icons, setIcons] = useState<PokeIcons | undefined>(undefined)
  const [cursorKey, setCursorKey] = useState<StartKey>(lastKey)
  /** 아이콘 그림이 왔거나(또는 못 오는 것이 정해졌거나) — 그 전에는 판을 안 그린다(아이콘이 뒤늦게 차오르지 않게) */
  const [iconsSettled, setIconsSettled] = useState(false)
  const push = useMenuStore((s) => s.push)
  const closeAll = useMenuStore((s) => s.closeAll)
  const party = useSaveStore((s) => s.party)
  const trainer = useSaveStore((s) => s.trainer)
  const balls = useSaveStore((s) => s.safari.balls)
  const zone = useSessionStore((s) => s.zoneName)
  const clock = useGameClock()
  const viewportH = useViewportHeight()
  // 설정의 언어. 바뀌면 글을 그 언어로 다시 받는다
  const locale = useGameLocale()

  useEffect(() => {
    let alive = true
    void loadUiText('startMenu', locale)
      .then((bank) => { if (alive) setTexts(bank) })
      .catch((e: unknown) => { console.error('시작 메뉴 글을 못 받았다', e) })
    // 가방은 시작 메뉴에서 가장 자주 여는 화면이다 — 여기서 미리 받아 두면 첫 프레임부터 찬다
    void loadBagData(locale).catch(() => { /* 가방이 열릴 때 다시 받고, 거기서 드러낸다 */ })
    // 공중날기 줄의 글. 원작 시작 메뉴 뱅크에는 그 줄이 없어서(아래 `canFly`) 롬의
    // 기술 이름을 그대로 쓴다 — 그래야 언어를 바꿔도 한 목록에 두 언어가 안 섞인다
    void loadMoveNames(locale)
      .then((names) => { if (alive) setMoveNames(names) })
      .catch(() => { /* 우리 이름으로 둔다 */ })
    // 공중날기 줄의 아이콘은 날 포켓몬의 것이다
    void loadPokeIcons()
      .then((got) => { if (alive) setIcons(got) })
      .catch(() => { /* 아이콘 없이도 줄은 선다 */ })
    // 아이콘은 언어마다 따로 구워진다. 못 받으면 칸을 비우고 한 번 알린다 (SYSTEM §6.1 ④)
    void loadStartMenuIcons(locale)
      .then((sheet) => { if (sheet === null) warnMenuIconsMissing() })
      .catch(() => { warnMenuIconsMissing() })
      .finally(() => { if (alive) setIconsSettled(true) })
    return () => { alive = false }
  }, [locale])

  /**
   * 항목 글. **인쇄기를 태워서 낸다.**
   *
   * 3번 자리가 `{STRVAR_1 3, 0, 0}`이라 그냥 그리면 제어 부호가 글자 그대로
   * 화면에 뜬다 — 실제로 그렇게 떴다. 0번 칸에 주인공 이름을 넣는 것은
   * 원본도 화면을 열 때 하는 일이다
   */
  const label = (at: number): string => fillMenuText(texts[at] ?? '', [trainer.name])
  const hasDex = fieldScripts.vars.checkFlag(FLAG_HAS_POKEDEX)

  /**
   * 공중날기를 쓸 수 있는가 (`FieldMoves_CheckFly`).
   *
   * 원작은 이 항목이 시작 메뉴가 아니라 **포켓몬 화면**에 붙는다. 여기 둔 것은
   * 우리 지름길이다 — 조건은 원작 그대로다: 자갈뱃지 · 맵 헤더의 `isFlyAllowed` ·
   * 동행 없음 · 사파리 밖, 그리고 공중날기를 아는 파티원 하나. 헤더가 막는 맵
   * (실내·굴·깨어진 세계)에서는 항목이 안 뜬다 (REPAIR §91). 판정은 파티 화면·
   * 타운맵과 같은 `flyVerdictNow` 한 자리다
   */
  const canFly = flyVerdictNow() === null
  const inSafari = fieldScripts.services.safari?.active?.() === true
  /** 공중날기를 쓸 파티원 — 줄 아이콘과 엿보기가 이 마리다 (알은 못 쓴다) */
  const flyer = party.find((m) => !m.isEgg && m.moves.some((s) => s.move === FIELD_MOVES.fly.move)) ?? null

  const keys = startMenuKeys({
    hasDex, hasPartner: party.length > 0, inSafari, inAmity: world.mapId === MAP_AMITY_SQUARE, canFly,
  })

  const entries: Entry[] = keys.map((key): Entry => {
    switch (key) {
      case 'retire': return {
        key,
        label: label(START_MENU.retire),
        go: () => {
          // 사파리게임을 접는다 — 롬의 스크립트(`SCRIPT_ID(SAFARI_GAME, 21)`)가 묻고 제 대사로 답한다
          closeAll()
          startScript(SAFARI_RETIRE_SCRIPT, mapById(world.mapId)?.scripts ?? -1)
        },
      }
      case 'pokedex': return { key, label: label(START_MENU.pokedex), go: () => { push('pokedex') } }
      case 'party': return { key, label: label(START_MENU.party), go: () => { push('party') } }
      case 'fly': return {
        key, label: moveNames[FIELD_MOVES.fly.move] ?? FIELD_MOVES.fly.label, go: () => { push('fly') },
      }
      case 'bag': return { key, label: label(START_MENU.bag), go: () => { push('bag') } }
      case 'trainerCard': return { key, label: label(START_MENU.trainerCard), go: () => { push('trainerCard') } }
      case 'save': return { key, label: label(START_MENU.save), go: () => { push('save') } }
      case 'options': return { key, label: label(START_MENU.options), go: () => { push('options') } }
      case 'exit': return { key, label: label(START_MENU.exit), go: closeAll }
    }
  })

  const found = entries.findIndex((entry) => entry.key === cursorKey)
  const at = found < 0 ? 0 : found
  const atKey: StartKey = entries[at]?.key ?? FIRST_KEY

  // 원작은 열자마자 선 자리를 다시 적고(`menuCursorPos = options[cursorPos]`),
  // 커서가 움직일 때마다 또 적는다
  useEffect(() => { lastKey = atKey }, [atKey])

  /**
   * 네 줄 이상이면 끝에서 돈다 (`start_menu.c`의 `optionCount >= 4` → `loopAround`).
   * 우리 목록은 가방부터 닫기까지 다섯 줄이 늘 있어 실제로는 늘 돈다 — 원작은
   * 숨김 깃발(`hideOptionFlags`)로 그보다 줄 때가 있어 조건을 그대로 둔다. 안 도는
   * 목록의 끝에서 더 밀면 소리도 안 난다
   */
  const step = (by: number): boolean => {
    const next = (entries.length >= 4 ? wrapCursor : clampCursor)(at, by, entries.length)
    if (next === at) return false
    setCursorKey(entries[next]?.key ?? atKey)
    return true
  }

  useMenuKeys({
    up: () => step(-1),
    down: () => step(1),
    confirm: () => entries[at]?.go(),
    cancel: closeAll,
    // 연 키(C)로도 닫힌다 — 원작은 연 X 버튼이 B와 같이 닫는 키다
    // (`Menu_New(…, PAD_BUTTON_B | PAD_BUTTON_X)`)
    menu: closeAll,
  })

  /**
   * ⚠️ **글이 오기 전에는 판을 안 그린다.** 빈 줄과 ▶만 있는 판이 바쁜 맵에서 몇 프레임 떴다
   * (2026-10-10 연쇄 P4 영상 48:32 · 48:41). 키는 위에서 이미 받으므로 그 사이 눌러도 자리는 그대로다.
   * 아이콘 그림도 같다 — 줄이 먼저 서고 아이콘이 뒤늦게 차오르면 레일이 한 번 깜박인다
   */
  if (texts.length === 0 || !iconsSettled) return null

  const gender = trainer.gender
  const peek = peekKindOf(atKey)
  // 엿보기는 고른 줄 가운데에 앉고 화면 안으로 자른다. 꼭지는 줄을 가리킨다
  const cy = rowCenterY(at)
  const peekTop = Math.max(
    own.RAIL_INSET,
    Math.min(cy - own.PEEK.height / 2, viewportH - own.RAIL_INSET - own.PEEK.height),
  )
  const nibAt = Math.max(16, Math.min(cy - peekTop, own.PEEK.height - 16))

  return (
    <div className={own.frame}>
      {/* 필드는 왼쪽 절반이 그대로 보인다 — 오른쪽으로 갈수록 짙은 옆 덮개 */}
      <div className={own.scrim} aria-hidden />

      {inSafari && (
        <div className={own.balls} aria-hidden>
          <span>{label(START_MENU.safariBalls)}</span>
          <span className={own.ballCount}>{fillMenuText(texts[START_MENU.ballStock] ?? '', [String(balls)])}</span>
        </div>
      )}

      {peek !== null && <StartPeek kind={peek} flyer={flyer} top={peekTop} nibAt={nibAt} />}

      <div className={own.rail}>
        {/* 머리: 지명과 시각. 포켓치를 걷은 대신 그 시계를 여기로 옮겼다 */}
        <div className={own.head}>
          <span className={own.place}>{zone ?? ''}</span>
          <span className={own.clock}>{clock}</span>
        </div>
        <div className={own.list}>
          <div className={own.track}>
            {/* 금 띠 하나 — 줄이 아니라 줄 밖의 요소다. `aria-checked`와 띠 자리는 한 값(`at`)에서 나온다 */}
            <span className={own.band} aria-hidden style={bandAt('y', at, LINE.rowTall)}>
              <span className={own.bandCaret} />
            </span>
            {/*
              ⚠️ **고르는 줄은 `radiogroup`으로 내준다.** 화면 낭독기에게 「지금 몇 칸
              중 몇째가 골라져 있는가」를 말해 주는 자리고, 대사창의 선택지도 같은
              것을 쓴다 — 한 화면만 다른 문법을 쓰면 낭독기가 여기서만 침묵한다.
              값을 써서 게임을 움직일 수 있는 길은 없다: 고르는 것은 여전히 키뿐이다.
              줄의 `textContent`는 항목 글 하나뿐이다 — 커서는 띠 안에, 아이콘은 그림이다
            */}
            <div role="radiogroup">
              {entries.map((entry, i) => {
                const lit = i === at
                const iconKey = iconKeyOf(entry.key)
                return (
                  <div
                    key={entry.key}
                    className={lit ? own.rowOn : own.row}
                    role="radio"
                    aria-checked={lit}
                  >
                    {iconKey !== null
                      ? (
                        <span
                          className={lit ? `${own.icon} ${own.iconLit}` : own.icon}
                          style={menuIcon(iconKey, gender, lit, 1, locale)}
                          aria-hidden
                        />
                      )
                      // 공중날기는 원작 아이콘이 없다 — 날 포켓몬의 아이콘이다 (안 고르면 회색)
                      : (
                        <span
                          className={lit ? own.icon : `${own.icon} ${own.iconGray}`}
                          style={flyer === null ? undefined : monIconAt(icons, flyer, 1)}
                          aria-hidden
                        />
                      )}
                    <span className={own.label}>{entry.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div className={own.foot}><KeyHints text={FOOT} /></div>
      </div>
    </div>
  )
}
