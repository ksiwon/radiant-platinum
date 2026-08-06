// 타이틀 — 이어할지 새로 시작할지.
//
// 두 갈래의 글은 원작 `main_menu_options` 뱅크에서 온다. 리포트가 있으면
// "모험을 계속한다"가 위에 뜨고 그 아래 요약(주인공·플레이 시간·도감·배지)이
// 붙는다 — 원작 메인 메뉴가 그렇게 생겼다.
//
// **리포트가 없으면 "계속한다"를 아예 안 보여준다.** 흐리게 두면 눌러 보고
// 나서야 없다는 걸 알게 된다.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { loadUiText, MAIN_MENU } from '../../data/uiText'
import { readReport } from '../../state/report'
import {
  dexHas, SAVE_VERSION, startNewGame, useSaveStore, type SaveData,
} from '../../state/saveStore'
import * as css from './titleScreen.css'

/** 게임 청크를 미리 받아둔다 — 클릭 시점의 대기를 없앤다 (PLAN §10.4) */
function prefetchGameChunk() {
  void import('../../scene/Stage')
  void import('../../app/PlayRoute')
}

const DEX_MAX = 493

export function TitleScreen() {
  const navigate = useNavigate()
  const [text, setText] = useState<string[]>([])
  const [report, setReport] = useState<SaveData | null | undefined>(undefined)

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

  /**
   * 인트로를 건너뛰고 방에서 시작한다. **개발 빌드에만 있다.**
   *
   * 이름은 지어내지 않고 인트로가 실제로 내미는 첫 후보를 쓴다 — 늘 같은 값이라
   * 여기서 시작한 판끼리 서로 비교가 된다 (`engine/intro/skip`)
   */
  const skip = (): void => {
    const save = useSaveStore.getState()
    void save.resetSave()
      .then(async () => {
        const { introSkipChoice } = await import('../../engine/intro/skip')
        return introSkipChoice()
      })
      .then((choice) => {
        startNewGame(choice)
        navigate('/play')
      })
      .catch(() => { navigate('/intro') })
  }

  return (
    <div className={css.wrap}>
      <h1 className={css.title}>pt-3d</h1>

      {report && (
        <>
          <button
            className={css.button}
            onClick={() => { go(false) }}
            onPointerEnter={prefetchGameChunk}
            autoFocus
          >
            {at(MAIN_MENU.continue_, '모험을 계속한다')}
          </button>
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
        </>
      )}

      <button
        className={css.button}
        onClick={() => { go(true) }}
        onPointerEnter={prefetchGameChunk}
        autoFocus={!report}
      >
        {at(MAIN_MENU.newGame, '새로운 모험을 시작한다')}
      </button>
      {report && (
        <p className={css.hint}>새로 시작하면 위 리포트는 지워집니다</p>
      )}

      {/*
        시험용. 마박사 대목을 건너뛰고 방에서 시작한다 — 그 뒤를 손볼 때 매번
        45줄을 다시 읽을 수는 없다. `import.meta.env.DEV`라 배포 빌드에서는
        이 가지가 통째로 죽고 `engine/intro/skip`은 청크로도 안 나온다
      */}
      {import.meta.env.DEV && (
        <>
          <button className={css.devButton} onClick={skip} onPointerEnter={prefetchGameChunk}>
            인트로 건너뛰기 (시험용)
          </button>
          <p className={css.hint}>
            ` (백틱) — 확인 지점. 보고 싶은 자리로 바로 뛰어들고 필요한 파티·가방도 채워집니다
          </p>
        </>
      )}

      <p className={css.hint}>
        WASD·방향키 이동 · Shift 달리기 · X 메뉴 · Z 말 걸기
      </p>
      <p className={css.hint}>
        휠·V 시점 전환 · 1인칭은 마우스로 둘러보고 보는 쪽으로 걷습니다 (Esc로 풀기)
      </p>
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
