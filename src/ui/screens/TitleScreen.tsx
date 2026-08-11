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
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { loadUiText, MAIN_MENU } from '../../data/uiText'
import { readReportDetailed } from '../../state/report'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import {
  dexHas, SAVE_VERSION, useSaveStore, type ImportPreview, type SaveData,
} from '../../state/saveStore'
import { PORTABLE_EXT } from '../../state/save/portable'
import { watchIntegrity } from '../../app/integrityWatch'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import { playSong, warmMenu } from '../../engine/audio/lazy'
import { TITLE_SONG } from '../../engine/audio/songIds'
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

/**
 * 에셋 설치 화면 (IMPORT.md §4).
 *
 * ⚠️ **지연 로드다.** 여기서 정적으로 끌어오면 NDS 리더·BDSP 스캐너·설치기가
 * 타이틀 청크에 실린다 — 타이틀은 그 코드를 한 줄도 안 쓴다
 */
const ImportWizard = lazy(() =>
  import('../../import/ui/ImportWizard').then((m) => ({ default: m.ImportWizard })))

const DEX_MAX = 493

export function TitleScreen() {
  const navigate = useNavigate()
  const [text, setText] = useState<string[]>([])
  const [report, setReport] = useState<SaveData | null | undefined>(undefined)
  /** 저장돼 있지만 **이 판이 못 읽는** 리포트. 없는 것과 다른 일이다 */
  const [unreadable, setUnreadable] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<(ImportPreview & { ok: true }) | null>(null)
  /** 에셋 설치 화면이 떠 있는가 */
  const [importing, setImporting] = useState(false)
  /** 한가할 때 훑은 설치본에서 어긋난 것이 나왔는가 */
  const [assetWarning, setAssetWarning] = useState<string | null>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  // 설정은 필드 메뉴와 **같은 화면**을 쓴다. 스택에 올려 두면 그쪽의 "돌아가기"가
  // 그대로 동작하고, 스택이 비면 여기서도 닫힌다
  const menuTop = useMenuStore((s) => s.top)
  // 설정의 언어. 타이틀에서 바꾸면 곧바로 그 언어로 다시 그린다
  const locale = useGameLocale()

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
  useEffect(() => { warmMenu() }, [])

  // 타이틀에 닿았으면 이제 설치본을 뒤에서 훑는다 (IMPORT.md §15).
  //
  // ⚠️ **부팅에서 안 한 일이 여기 있다.** 켤 때 630MB를 다시 해싱하면 첫 화면이
  // 몇 초씩 늦는다. 그렇다고 안 보면 브라우저가 조용히 되찾아 간 파일을 게임이
  // 만난다 — 그래서 화면이 뜬 뒤 한가할 때 본다. 개발판은 설치 기록이 없어서
  // 아무 일도 안 일어난다
  useEffect(() => watchIntegrity((got) => {
    if (got.broken.length > 0) {
      setAssetWarning(`⚠️ 설치본에서 파일 ${got.broken.length}개가 어긋납니다 — `
        + `다시 만들 그룹: ${got.groups.join(' · ')}`)
    }
  }), [])

  /**
   * 타이틀 곡 (`SEQ_TITLE01`).
   *
   * ⚠️ **브라우저가 여기서는 아직 소리를 못 낸다.** 사용자가 한 번 건드리기
   * 전에는 `AudioContext`가 안 열린다. `music.play`가 그걸 알고 곡 번호만
   * 적어 두었다가 깨어날 때 트므로 여기서는 그냥 부르면 된다 — 첫 키·첫
   * 클릭에서 흐르기 시작한다.
   *
   * 나갈 때 안 끈다. 필드로 들어가면 `MusicDirector`가 1초 안에 맵 헤더의
   * 곡으로 갈아타면서 이 곡을 겹쳐 끈다(`FADE`) — 여기서 먼저 끊으면
   * 그 사이가 정적이 된다
   */
  useEffect(() => { playSong(TITLE_SONG) }, [])

  useEffect(() => {
    let alive = true
    void readReportDetailed(SAVE_VERSION).then((got) => {
      if (!alive) return
      setReport(got.kind === 'ok' ? got.save : null)
      // ⚠️ **"없다"로 뭉개지 않는다.** 앱을 한 번 올린 것뿐인데 진행이 사라진
      // 것처럼 보이던 자리다 (IMPORT.md §11 끝) — 원본을 파일로 돌려줄 수 있다
      setUnreadable(got.kind === 'unreadable' ? explainStored(got.reason.kind) : null)
    }).catch(() => { if (alive) setReport(null) })
    void loadUiText('mainMenu', locale).then((bank) => { if (alive) setText(bank) })
      .catch(() => { /* 우리 글로 떨어진다 */ })
    return () => { alive = false }
  }, [locale])

  const at = (i: number, fallback: string): string => text[i] ?? fallback

  /** 이어하기는 바로 필드로, 새 모험은 인트로를 거친다 */
  const go = (fresh: boolean): void => {
    const save = useSaveStore.getState()
    if (fresh) {
      // 지우기 전에 백업을 시도한다 — 스토어가 알아서 한다 (IMPORT.md §11-8)
      void save.resetSave().then(() => { navigate('/intro') })
      return
    }
    void save.loadReport().then(() => { navigate('/play') })
  }

  const backup = (): void => {
    void useSaveStore.getState().exportReport().then((got) => {
      if (got.kind === 'none') { setNotice('받을 리포트가 없습니다'); return }
      setNotice(got.outcome.started
        ? `${got.fileName}${got.raw ? '\n(이 판이 못 읽는 리포트라 원본 그대로 담았습니다)' : ''}`
        : '브라우저가 다운로드를 막았습니다. 한 번 더 눌러 주세요')
    })
  }

  const pickFile = (file: File): void => {
    setNotice(null)
    void file.text().then((raw) => {
      const preview = useSaveStore.getState().previewImport(raw)
      if (!preview.ok) { setPending(null); setNotice(preview.why); return }
      setPending(preview)
    }).catch(() => { setNotice('파일을 읽지 못했습니다') })
  }

  const bringIn = (): void => {
    if (!pending) return
    const target = pending
    setPending(null)
    void useSaveStore.getState().commitImport(target).then((done) => {
      if (!done.ok) { setNotice(`불러오지 못했습니다 — ${done.why}\n지금 리포트는 그대로입니다`); return }
      navigate('/play')
    })
  }

  const hasSave = report !== null && report !== undefined
  /**
   * 고를 것 다섯. **한 줄에 놓이고 커서도 다섯을 다 돈다.**
   *
   * ⚠️ 예전에는 리포트 단추 둘이 따로 떠 있었고 커서는 셋만 돌았다 — 화면에는
   * 다섯이 보이는데 키보드로는 셋만 닿는 상태였다
   */
  const entries: { key: string, label: string, tone: 'main' | 'plain' | 'ghost', go: () => void }[] = [
    hasSave
      ? { key: 'continue', label: at(MAIN_MENU.continue_, '모험 계속하기'), tone: 'main', go: () => { go(false) } }
      : { key: 'new', label: '새로운 모험 시작하기', tone: 'main', go: () => { go(true) } },
    { key: 'options', label: '설정', tone: 'plain', go: () => { useMenuStore.getState().open('options') } },
    // ⚠️ **아직 완성되지 않은 것을 완성된 것처럼 두지 않는다.** 변환 그룹이
    // 하나만 옮겨져 있어서, 여기서 설치를 끝내도 게임은 시작되지 않는다
    { key: 'import', label: '에셋 설치', tone: 'plain', go: () => { setImporting(true) } },
    // ⚠️ **리포트가 없어도 보인다.** 새 브라우저·새 기계에서 파일을 들고 온
    // 사람에게는 이 둘이 유일한 입구인데, "리포트가 있을 때만"으로 두면
    // 그 사람에게는 아무 데도 없다 (IMPORT.md §11)
    { key: 'backup', label: '리포트 백업 받기', tone: 'ghost', go: backup },
    { key: 'load', label: '리포트 파일 불러오기', tone: 'ghost', go: () => { filePicker.current?.click() } },
  ]

  const [cursor, setCursor] = useState(0)
  // ⚠️ **버튼이 가로로 놓인다** (`titleScreen.css`의 `menu`가 `flex-direction: row`).
  // 한동안 ↑↓만 묶여 있어서, 나란히 놓인 것을 보고 ←→를 누르면 아무 일도 안
  // 일어났다. 네 방향을 다 받는다
  const move = (delta: number): void => {
    setCursor((c) => clampCursor(c, delta, entries.length))
  }
  // 설정이 떠 있는 동안에는 타이틀이 키를 안 듣는다 — 그쪽이 먼저다
  useMenuKeys({
    left: () => { move(-1) },
    right: () => { move(1) },
    up: () => { move(-1) },
    down: () => { move(1) },
    confirm: () => { entries[cursor]?.go() },
  }, menuTop === null)

  return (
    <div className={css.wrap}>
      <div className={css.sky} />
      <div className={css.ground} />

      <div className={css.head}>
        {/*
          ⚠️ 예전에 제목 위에 `POKÉMON`을 얹어 두었다. 그건 공식 로고가 놓이는
          자리와 같은 배치라, 화면에 안 보이더라도(지금 `crest`는 숨겨져 있다)
          문서에는 남아 검색과 스크린 리더에 그대로 읽힌다. 뺐다 (COPYRIGHT.md §11)
        */}
        <div className={css.halo} aria-hidden />
        <Emblem />
        <div className={css.crest}>
          <h1 className={css.title}>Radiant Platinum</h1>
          <span className={css.sub}>비공식 팬 프로젝트 · 비영리</span>
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
              className={[
                css.button,
                entry.tone === 'main' ? css.buttonMain : '',
                entry.tone === 'ghost' ? css.buttonGhost : '',
                i === cursor ? css.buttonOn : '',
              ].filter(Boolean).join(' ')}
              onClick={entry.go}
              onPointerEnter={() => {
                setCursor(i)
                if (entry.tone === 'main') prefetchGameChunk()
              }}
            >
              {i === cursor && <span className={css.caret} aria-hidden>▶</span>}
              {entry.label}
            </button>
          ))}
          <input
            ref={filePicker}
            type="file"
            accept={PORTABLE_EXT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              // 같은 파일을 두 번 고를 수 있어야 한다 — 값을 안 비우면 두 번째
              // change 이벤트가 아예 안 온다
              e.target.value = ''
              if (file) pickFile(file)
            }}
          />
        </div>

        {/*
          ⚠️ **눈에 띄는 자리여야 한다** (COPYRIGHT.md §11). `crest`와 `foot`은
          `display: none`이라 거기 넣으면 문서에만 있고 화면에는 없다 — 그건
          "표시했다"가 아니다. 메뉴 바로 아래, 리포트 단추와 같은 층에 둔다
        */}
        {/*
          ⚠️ **줄여도 다섯 가지는 다 남는다** (COPYRIGHT.md §11): 비공식·비제휴 ·
          상표는 권리자의 것 · 적법 보유분만 · 서버는 안 받고 안 저장한다 ·
          무료·비영리·BYOR가 허가를 뜻하지 않는다. 문장을 붙여 두 줄로 접었다
        */}
        <p className={css.disclaimer}>
          비공식·비제휴 팬 프로젝트입니다. 관련 상표와 저작물은 각 권리자의 것이며,
          무료·비영리·BYOR는 권리자의 허가를 뜻하지 않습니다.
          <br />
          적법하게 보유한 게임 데이터만 고르세요 — 서버는 원본도 변환 결과도
          받거나 저장하지 않습니다.
        </p>

        {/* 파일을 열어 보고 확인받는 자리, 그리고 실패 이유. 단추 줄 위로 쌓인다 */}
        <div className={css.filesArea}>
          {unreadable !== null && (
            <div className={css.notice}>
              {`저장된 리포트를 이 판이 못 읽습니다 — ${unreadable}\n`}
              {'"리포트 백업 받기"로 원본을 파일에 담아 두세요. 지우지 않습니다.'}
            </div>
          )}

          {pending && (
            <div className={css.notice}>
              {`${pending.envelope.summary.trainer || '이름 없음'} · `}
              {`${clock(pending.envelope.summary.playtimeMs)} · `}
              {`저장 ${stamp(pending.envelope.createdAt)}\n`}
              {pending.migrated ? '옛 판이라 지금 판으로 옮겨서 들입니다\n' : ''}
              {pending.contract === 'same' ? '' : '⚠️ 설치본과 콘텐츠 계약이 다릅니다\n'}
              {'지금 리포트는 들이기 전에 파일로 먼저 받습니다.'}
              <div className={css.files}>
                <button className={css.fileButton} onClick={bringIn}>이 리포트로 이어하기</button>
                <button className={css.fileButton} onClick={() => { setPending(null) }}>그만두기</button>
              </div>
            </div>
          )}

          {notice !== null && <div className={css.notice}>{notice}</div>}
          {/* 뒤에서 훑다 어긋난 것을 만났을 때. 화면을 막지 않는다 — 멀쩡한
              그룹은 그대로 열리고, 깨진 그룹을 실제로 읽을 때 그 자리에서 선다 */}
          {assetWarning !== null && <div className={css.notice}>{assetWarning}</div>}
        </div>

        {/*
          리포트가 있을 때만. 버튼이 아니라 글자인 것은 **되돌릴 수 없는 일**이라서다 —
          이어하기 바로 옆에 같은 크기로 두면 잘못 눌린다
        */}
        {report && (
          <button className={css.restart} onClick={() => { go(true) }}>
            처음부터 다시 시작하기 (지우기 전에 백업 파일을 받습니다)
          </button>
        )}
      </div>

      <div className={css.foot}>
        <p className={css.hint}>←→ 고르기 · Z·Enter 결정</p>
        <p className={css.hint}>
          WASD·방향키 이동 · Shift 달리기 · X 메뉴 · Z 말 걸기 · 휠·V 시점 전환
        </p>
      </div>

      {menuTop === 'options' && (
        <Suspense fallback={null}>
          <OptionsScreen />
        </Suspense>
      )}

      {importing && (
        <Suspense fallback={null}>
          <ImportWizard onClose={() => { setImporting(false) }} />
        </Suspense>
      )}
    </div>
  )
}

/**
 * 제목 뒤의 추상 표식 — 퍼져 나가는 고리 여섯.
 *
 * ⚠️ **여기 있는 것이 무엇인지 대장에 적혀 있다** (`tools/distribution/shellArt.mjs`).
 * `public/assets/mark.svg`와 같은 그림이고, 생물 실루엣도 몬스터볼 모양도 공식
 * 로고 형태도 없다. 예전에 이 자리에 있던 2.4MB짜리 배경 그림(금속 워드마크 +
 * 기라티나로 보이는 형상)은 **되살리지 않는다** — 그것이 release blocker였다
 * (COPYRIGHT.md §11).
 *
 * 파일로 안 받고 문서에 직접 그린다. 첫 화면에 요청을 하나 더 만들 이유가 없다
 */
const RINGS: readonly (readonly [number, number])[] = [
  [240.6, 15.4], [194.6, 11.3], [153.6, 25.6], [112.6, 8.2], [76.8, 35.8], [33.3, 66.6],
]

function Emblem() {
  return (
    <svg className={css.emblem} viewBox="0 0 512 512" aria-hidden focusable="false">
      <defs>
        <linearGradient id="rp-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="46%" stopColor="#d6e4f4" />
          <stop offset="54%" stopColor="#9fb2c6" />
          <stop offset="100%" stopColor="#7f92a8" />
        </linearGradient>
      </defs>
      {RINGS.map(([r, w]) => (
        <circle
          key={r} cx="256" cy="256" r={r}
          fill="none" stroke="url(#rp-metal)" strokeWidth={w}
        />
      ))}
    </svg>
  )
}

/** 저장된 리포트를 왜 못 읽는가. 사용자가 할 일이 갈리므로 뭉치면 안 된다 */
function explainStored(kind: 'too-new' | 'unsupported-old' | 'invalid'): string {
  switch (kind) {
    case 'too-new': return '더 새로운 판이 쓴 리포트입니다'
    case 'unsupported-old': return '너무 옛 판이라 옮길 길이 없습니다'
    case 'invalid': return '내용이 어긋납니다'
  }
}

/** ISO 시각을 그 기계의 시각으로. 파일을 고른 사람이 보는 것은 자기 시계다 */
function stamp(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '알 수 없음' : at.toLocaleString()
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
