// 시작 메뉴 — C를 누르면 뜬다 (X·Esc로도).
//
// 항목이 상황에 따라 나타났다 사라진다. 도감은 마박사에게 받기 전에는 없고,
// 포켓몬은 파티가 비어 있으면 없다 (`StartMenu_GetNormalHiddenOptions` — 원작은
// 첫 파트너 변수를 본다). 가방부터 닫기까지 다섯 줄은 늘 있다 — 가방은 새 판을
// 열 때 받으므로(`StartNewSave`) 첫 파트너를 받기 전에 메뉴를 열면 그 다섯 줄뿐이다.
// 없는 항목은 흐리게 두지 않고 아예 뺀다 — 원작도 목록에서 뺀다.
import { useEffect, useState } from 'react'
import { loadMoveNames } from '../../data/gameData'
import { fillMenuText, loadUiText, START_MENU } from '../../data/uiText'
import { fieldScripts, flyVerdictNow } from '../../engine/script/field'
import { FIELD_MOVES } from '../../engine/script/fieldMoves'
import { FLAG_HAS_POKEDEX } from '../../engine/script/vars'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { useSessionStore } from '../../state/sessionStore'
import { clampCursor, useMenuKeys, wrapCursor } from './useMenuKeys'
import { loadBagData } from './BagScreen'
import * as own from './startMenu.css'

interface Entry {
  key: string
  label: string
  go: () => void
}

/** 원작 `menuCursorPos`의 첫 값 0 = `START_MENU_OPTION_POKEDEX` */
const FIRST_KEY = 'pokedex'

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
let lastKey = FIRST_KEY
useSessionStore.subscribe((s, prev) => {
  if (s.phase === 'title' && prev.phase !== 'title') lastKey = FIRST_KEY
})

export function StartMenu() {
  const [texts, setTexts] = useState<string[]>([])
  const [moveNames, setMoveNames] = useState<string[]>([])
  const [cursorKey, setCursorKey] = useState(lastKey)
  const push = useMenuStore((s) => s.push)
  const closeAll = useMenuStore((s) => s.closeAll)
  const party = useSaveStore((s) => s.party)
  const trainer = useSaveStore((s) => s.trainer)
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

  const entries: Entry[] = []
  if (hasDex) entries.push({ key: 'pokedex', label: label(START_MENU.pokedex), go: () => { push('pokedex') } })
  if (party.length > 0) entries.push({ key: 'party', label: label(START_MENU.party), go: () => { push('party') } })
  const fly = FIELD_MOVES.fly
  if (canFly) entries.push({ key: 'fly', label: moveNames[fly.move] ?? fly.label, go: () => { push('fly') } })
  entries.push({ key: 'bag', label: label(START_MENU.bag), go: () => { push('bag') } })
  entries.push({ key: 'trainerCard', label: label(START_MENU.trainerCard), go: () => { push('trainerCard') } })
  entries.push({ key: 'save', label: label(START_MENU.save), go: () => { push('save') } })
  entries.push({ key: 'options', label: label(START_MENU.options), go: () => { push('options') } })
  entries.push({ key: 'exit', label: label(START_MENU.exit), go: closeAll })

  const found = entries.findIndex((entry) => entry.key === cursorKey)
  const at = found < 0 ? 0 : found
  const atKey = entries[at]?.key ?? FIRST_KEY

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
   * (2026-10-10 연쇄 P4 영상 48:32 · 48:41). 키는 위에서 이미 받으므로 그 사이 눌러도 자리는 그대로다
   */
  if (texts.length === 0) return null

  return (
    <div className={own.frame}>
      {/*
        ⚠️ **고르는 줄은 `radiogroup`으로 내준다.** 화면 낭독기에게 「지금 몇 칸
        중 몇째가 골라져 있는가」를 말해 주는 자리고, 대사창의 선택지도 같은
        것을 쓴다 — 한 화면만 다른 문법을 쓰면 낭독기가 여기서만 침묵한다.
        값을 써서 게임을 움직일 수 있는 길은 없다: 고르는 것은 여전히 키뿐이다
      */}
      <div className={own.card} role="radiogroup">
        {entries.map((entry, i) => (
          <div
            key={entry.key}
            className={i === at ? own.rowOn : own.row}
            role="radio"
            aria-checked={i === at}
          >
            {/* 원작도 고른 줄 왼쪽에 손가락 커서가 선다 */}
            <span className={own.cursor} aria-hidden>{i === at ? '▶' : ''}</span>
            <span>{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
