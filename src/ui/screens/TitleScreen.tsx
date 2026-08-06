// 타이틀 — 이어할지 새로 시작할지.
//
// 고를 것을 둘로 줄였다. 리포트가 있으면 첫 칸이 "모험 계속하기"가 되고 없으면
// "새로운 모험 시작하기"가 된다 — **없는 것을 흐리게 두지 않는다.** 흐리게 두면
// 눌러 보고 나서야 없다는 걸 알게 된다.
//
// 리포트가 있을 때만 "처음부터 다시 시작하기"가 요약 아래에 글자로 붙는다.
// 버튼으로 두면 이어하기 옆에서 잘못 눌리는데, 그건 되돌릴 수 없는 일이다.
//
// 요약 넷(주인공·플레이 시간·도감·배지)의 글은 원작 `main_menu_options` 뱅크에서
// 온다. 우리가 이름을 새로 짓지 않는다.
import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { loadUiText, MAIN_MENU } from '../../data/uiText'
import { readReport } from '../../state/report'
import { useMenuStore } from '../../state/menuStore'
import {
  dexHas, SAVE_VERSION, useSaveStore, type SaveData,
} from '../../state/saveStore'
import { music } from '../../engine/audio/music'
import { SFX } from '../../engine/audio/sfx'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import * as css from './titleScreen.css'

/** 게임 청크를 미리 받아둔다 — 클릭 시점의 대기를 없앤다 (PLAN §10.4) */
function prefetchGameChunk() {
  void import('../../scene/Stage')
  void import('../../app/PlayRoute')
}

/**
 * 설정은 여기서만 쓰는 게 아니라 필드 메뉴에도 있다. 타이틀 청크에 정적으로
 * 끌어오면 three를 안 쓰는 화면이 메뉴 화면 뭉치를 통째로 지고 뜬다
 */
const OptionsScreen = lazy(() =>
  import('../menu/OptionsScreen').then((m) => ({ default: m.OptionsScreen })))

const DEX_MAX = 493

export function TitleScreen() {
  const navigate = useNavigate()
  const [text, setText] = useState<string[]>([])
  const [report, setReport] = useState<SaveData | null | undefined>(undefined)
  // 설정은 필드 메뉴와 **같은 화면**을 쓴다. 스택에 올려 두면 그쪽의 "돌아가기"가
  // 그대로 동작하고, 스택이 비면 여기서도 닫힌다
  const menuTop = useMenuStore((s) => s.top)

  useEffect(() => {
    // 초기 렌더를 방해하지 않도록 유휴 시점에. Safari에는 requestIdleCallback이 없다
    const idle = window.requestIdleCallback
    if (idle) {
      const id = idle(prefetchGameChunk)
      return () => window.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(prefetchGameChunk, 300)
    return () => window.clearTimeout(t)
  }, [])

  // 메뉴 소리를 미리 펴 둔다. 깨어나기 전이면 줄을 서고 첫 입력 때 받는다 —
  // 안 그러면 타이틀에서 처음 커서를 움직일 때 452KB를 기다린다
  useEffect(() => { void music.prewarm([SFX.MENU]) }, [])

  useEffect(() => {
    let alive = true
    void readReport(SAVE_VERSION).then((data) => { if (alive) setReport(data) })
      .catch(() => { if (alive) setReport(null) })
    void loadUiText('mainMenu').then((bank) => { if (alive) setText(bank) })
      .catch(() => { /* 우리 글로 떨어진다 */ })
    return () => { alive = false }
  }, [])

  const at = (i: number, fallback: string): string => text[i] ?? fallback

  /** 이어하기는 바로 필드로, 새 모험은 인트로를 거친다 */
  const go = (fresh: boolean): void => {
    const save = useSaveStore.getState()
    if (fresh) {
      void save.resetSave().then(() => { navigate('/intro') })
      return
    }
    void save.loadReport().then(() => { navigate('/play') })
  }

  const hasSave = report !== null && report !== undefined
  const entries = [
    hasSave
      ? { key: 'continue', label: at(MAIN_MENU.continue_, '모험 계속하기'), go: () => { go(false) } }
      : { key: 'new', label: '새로운 모험 시작하기', go: () => { go(true) } },
    { key: 'options', label: '설정', go: () => { useMenuStore.getState().open('options') } },
  ]

  const [cursor, setCursor] = useState(0)
  // 설정이 떠 있는 동안에는 타이틀이 키를 안 듣는다 — 그쪽이 먼저다
  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, entries.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, entries.length)) },
    confirm: () => { entries[cursor]?.go() },
  }, menuTop === null)

  return (
    <div className={css.wrap}>
      <div className={css.sky} />
      <div className={css.ground} />

      <div className={css.head}>
        <div className={css.crest}>
          <span className={css.brand}>POKÉMON</span>
          <h1 className={css.title}>Radiant Platinum</h1>
          <span className={css.sub}>팬이 만든 3D 리메이크 · 비영리</span>
        </div>

        {report && (
          <dl className={css.summary}>
            <dt>{at(MAIN_MENU.player, '주인공')}</dt>
            <dd>{report.trainer.name || '이름 없음'}</dd>
            <dt>{at(MAIN_MENU.playtime, '플레이 시간')}</dt>
            <dd>{clock(report.trainer.playtimeMs)}</dd>
            <dt>{at(MAIN_MENU.dex, '포켓몬 도감')}</dt>
            <dd>{countDex(report.pokedex.caught)}마리</dd>
            <dt>{at(MAIN_MENU.badges, '가지고 있는 배지')}</dt>
            <dd>{countBadges(report.badges)}개</dd>
          </dl>
        )}

        <div className={css.menu}>
          {entries.map((entry, i) => (
            <button
              key={entry.key}
              className={`${css.button} ${i === cursor ? css.buttonOn : ''}`}
              onClick={entry.go}
              onPointerEnter={() => {
                setCursor(i)
                if (entry.key !== 'options') prefetchGameChunk()
              }}
            >
              {i === cursor && <span className={css.caret} aria-hidden>▶</span>}
              {entry.label}
            </button>
          ))}
        </div>

        {/*
          리포트가 있을 때만. 버튼이 아니라 글자인 것은 **되돌릴 수 없는 일**이라서다 —
          이어하기 바로 옆에 같은 크기로 두면 잘못 눌린다
        */}
        {report && (
          <button className={css.restart} onClick={() => { go(true) }}>
            처음부터 다시 시작하기 (지금 리포트는 지워집니다)
          </button>
        )}
      </div>

      <div className={css.foot}>
        <p className={css.hint}>↑↓ 고르기 · Z·Enter 결정</p>
        <p className={css.hint}>
          WASD·방향키 이동 · Shift 달리기 · X 메뉴 · Z 말 걸기 · 휠·V 시점 전환
        </p>
      </div>

      {menuTop === 'options' && (
        <Suspense fallback={null}>
          <OptionsScreen />
        </Suspense>
      )}
    </div>
  )
}

/** `HH:MM`. 원작 요약창도 시·분까지만 보여준다 */
function clock(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  return `${String(Math.floor(minutes / 60))}:${String(minutes % 60).padStart(2, '0')}`
}

function countDex(field: Uint8Array): number {
  let n = 0
  for (let i = 1; i <= DEX_MAX; i++) if (dexHas(field, i)) n++
  return n
}

function countBadges(mask: number): number {
  let n = 0
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) n++
  return n
}
