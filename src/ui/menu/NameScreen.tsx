// 이름 짓기 (`OpenPokemonNamingScreen`, DATA.md §2.10)
//
// 잔모래마을 연구소에서 마박사가 "별명을 지어 주겠나?"라고 묻는 그 자리다.
// 스크립트가 열고, 답이 나올 때까지 스크립트가 선다.
//
// **자판을 원작처럼 안 그린다.** 원작은 NDS 터치 자판이라 한글 자모를 조합하는
// 판이 따로 있는데, 우리는 키보드가 있는 기계에서 돌고 인트로의 이름 입력도
// 이미 `<input>` 하나다 (`ui/intro`). 두 자리가 다른 방식이면 그게 더 이상하다.
//
// ⚠️ **길이는 원작 값이다.** `constants/string.h`의 `MON_NAME_LEN`이 10이다 —
// 우리가 정한 상한이 아니다.
import { useEffect, useState } from 'react'
import {
  loadBoxWallpapers, loadPokeIcons, loadSpecies, loadSpeciesNames, type SpeciesTable,
} from '../../data/gameData'
import type { BoxWallpapers, PokeIcons } from '../../data/schema'
import { BOX_TEXT, loadUiText, NAMING_TEXT } from '../../data/uiText'
import { genderOf } from '../../engine/pokemon/instance'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { useGameLocale } from '../../state/optionsStore'
import { formatMessage, MessageSlots } from '../../engine/script/text'
import { GenderMark } from '../common/MonIdentity'
import { KeyHints } from '../common/KeyHints'
import * as chrome from './menuChrome.css'
import { MenuScreen } from './MenuScreen'
import { naming } from './namingAnswer'
import { boxWallpaper, monIconAt } from './pokeIcon'
import * as own from './nameScreen.css'

/** 이름 짓기 화면의 글 뱅크 (`TEXT_BANK_NAMING_SCREEN`) */
const NAMING_BANK = 'naming'

/**
 * 키 안내. 글자를 치는 자리라 Z·X가 글자로 들어간다 — 결정은 Enter, 지나가기는
 * Esc뿐이다. 안 적으면 마우스 없이 빠져나가는 길을 모른다
 */
export const NAME_HINT = 'Enter 결정 · Esc 그대로 두기'

export function NameScreen() {
  const what = useMenuStore((s) => s.naming)
  const closeAll = useMenuStore((s) => s.closeAll)
  const back = useMenuStore((s) => s.back)
  const party = useSaveStore((s) => s.party)
  const wallpapers = useSaveStore((s) => s.wallpapers)
  const locale = useGameLocale()
  const [prompt, setPrompt] = useState('')
  const [draft, setDraft] = useState(what?.initial ?? '')
  const [icons, setIcons] = useState<PokeIcons>()
  const [walls, setWalls] = useState<BoxWallpapers>()
  const [species, setSpecies] = useState<SpeciesTable>()
  const [speciesNames, setSpeciesNames] = useState<readonly string[]>([])
  const [boxText, setBoxText] = useState<readonly string[]>([])

  useEffect(() => {
    let alive = true
    void loadUiText(NAMING_BANK, locale)
      .then((bank) => {
        if (!alive) return
        // `{STRVAR_1 1, 0, 0}의 이름은?` — 0번 칸에 지금 이름이 들어간다.
        // `{SCREEN 0}`은 예/아니오를 부르는 부호라 글로는 안 나온다
        const slots = new MessageSlots()
        slots.set(0, what?.initial ?? '')
        // 무엇의 이름인가에 따라 물음이 다르다 — 별명은 1번, 석판은 6번이다
        const line = what?.kind === 'tablet' ? NAMING_TEXT.tablet
          : what?.kind === 'box' ? NAMING_TEXT.box : NAMING_TEXT.pokemon
        setPrompt(formatMessage(bank[line] ?? '', slots).trim())
      })
      // 글이 안 오면 물음 줄을 비운다 — 롬 글이 아닌 말을 지어 채우지 않는다
      .catch(() => { setPrompt('') })
    return () => { alive = false }
  }, [locale, what])

  // 개체 아이콘과 「비워 두면」 줄에 쓰는 자료. 못 받으면 그 자리만 빈다
  useEffect(() => {
    let alive = true
    void Promise.all([
      loadPokeIcons(), loadBoxWallpapers(), loadSpecies(), loadSpeciesNames(locale),
      loadUiText('storageSystem', locale),
    ]).then(([i, w, sp, names, box]) => {
      if (!alive) return
      setIcons(i); setWalls(w); setSpecies(sp); setSpeciesNames(names); setBoxText(box)
    }).catch(() => { /* 아이콘 없이도 입력은 선다 */ })
    return () => { alive = false }
  }, [locale])

  /**
   * 결정한다. **빈 이름은 안 바꾼 것으로 친다** — 원작도 이름을 비우면 종족
   * 이름으로 되돌린다(`Pokemon_SetValue`가 기본 이름을 다시 넣는다)
   */
  const done = (name: string): void => {
    if (!what) return
    // 박스 이름은 스크립트가 안 기다린다 — 곧바로 적고 박스 화면으로 돌아간다. 비우면 기본 이름이다
    if (what.kind === 'box') {
      const at = what.slot
      useSaveStore.setState((st) => ({ boxNames: st.boxNames.map((n, i) => (i === at ? name.trim() || null : n)) }))
      back()
      return
    }
    naming.answer = { name: name.trim(), slot: what.slot, kind: what.kind }
    closeAll()
  }

  /**
   * Esc로 그냥 지나간다 — 원작의 B다.
   *
   * ⚠️ **`useMenuKeys`를 못 쓴다.** 그쪽은 X와 Backspace도 "물러난다"로 잡고
   * `preventDefault`까지 하는데, 여기는 글자를 치는 자리라 그러면 이름에 x를
   * 못 넣고 지우지도 못한다. 그래서 Esc 하나만 따로 듣는다.
   *
   * ⚠️ **한글 조합 중의 Esc는 조합을 취소하는 키다.** `isComposing`이면 넘겨서 별명 짓기를 건너뛰지 않는다
   *
   * 마우스 없이도 이 화면을 빠져나갈 수 있어야 한다 — Enter로 결정, Esc로 통과
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape' || what === null || e.isComposing) return
      e.preventDefault()
      done('')
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  })

  if (!what) return null

  const mon = what.kind === 'pokemon' ? party[what.slot] : undefined
  const ratio = mon && species ? species.of(mon).genderRatio : undefined
  const gender = mon && ratio !== undefined ? genderOf(mon.pid, ratio) : undefined
  // 비우면 무엇이 되는가 — 규칙 한 줄. 석판은 지금 이름이 그대로라 적을 것이 없다
  const fallback = mon
    ? speciesNames[mon.species] ?? ''
    : what.kind === 'box' ? boxText[BOX_TEXT.boxName + what.slot] ?? '' : ''
  const length = [...draft].length

  return (
    /*
      ⚠️ **`MenuScreen`의 덮개(`overlay`)가 층을 잡는다.** 덮개가 없으면 화면이 3D 밑에 깔린다 — 무대
      (`scene/Stage`의 `#stage-wrap`)는 `position: fixed`라 자리를 안 잡은 상자는 캔버스 뒤에 그려진다.
      그러면 그려지긴 하는데 한 조각도 안 보이고, 스크립트는 답이 나올 때까지 서므로 마우스로 노는 사람에게는
      연구소에서 게임이 멎은 것으로 보인다 (e2e ㉖이 여기서 60초를 서다 떨어졌다).

      머리와 바닥은 `bare`로 끄고 바닥 줄만 아래에 직접 둔다 — 이 창은 제목 대신 개체 아이콘이 선다.
    */
    <MenuScreen title="이름 짓기" variant="center" width={own.WIDTH} bare>
      <div className={own.body}>
        {what.kind !== 'tablet' && (
          <div className={own.hero}>
            {mon !== undefined && <div style={monIconAt(icons, mon, 2)} aria-hidden="true" />}
            {what.kind === 'box' && walls !== undefined && (
              <div className={own.piece} aria-hidden="true">
                <div className={own.pieceArt} style={boxWallpaper(walls, wallpapers[what.slot] ?? 0, 1)} />
              </div>
            )}
            {gender !== undefined && <GenderMark gender={gender} />}
          </div>
        )}
        <form
          className={own.form}
          onSubmit={(e) => { e.preventDefault(); done(draft) }}
        >
          <p className={own.prompt}>{prompt}</p>
          <div className={own.row}>
            <input
              className={own.input}
              value={draft}
              maxLength={what.max}
              autoFocus
              onChange={(e) => { setDraft(e.target.value) }}
              aria-label="별명"
            />
            <button className={own.ok} type="submit">결정</button>
          </div>
          {/* 길이 계기 — 원작의 열 칸 밑줄을 계기로 옮겼다. 한글 조합 입력은 칸에 못 맞춘다 */}
          <div className={own.meter} aria-hidden="true">
            <div className={own.cells}>
              {Array.from({ length: what.max }, (_, i) => (
                <i key={i} className={i < length ? `${own.cell} ${own.cellOn}` : own.cell} />
              ))}
            </div>
            <span className={own.count}>{length} / {what.max}</span>
          </div>
          <div className={own.skipRow}>
            <span>{fallback !== '' ? `비워 두면 ${fallback}` : ''}</span>
            {/*
              안 짓고 넘어갈 수 있어야 한다. 원작도 여기서 B를 누르면 별명 없이
              지나가고, 스크립트가 그 답(1)으로 갈라진다
            */}
            <button className={own.skip} type="button" onClick={() => { done('') }}>
              그대로 두기
            </button>
          </div>
        </form>
      </div>
      <div className={chrome.foot}>
        <KeyHints text={NAME_HINT} />
      </div>
    </MenuScreen>
  )
}
