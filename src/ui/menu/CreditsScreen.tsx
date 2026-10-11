// 크레딧 (PARITY §8.12) — `overlay099/ov99_021D0D80.c` · `ov99_021D3E78.c`
//
// 명예의 전당이 리포트를 다 쓰면 이 화면이 뜨고, 두루마리가 다 흐르면 타이틀로
// 나간다. 원작의 차례가 그렇다 — 전당 → 리포트 → 크레딧 → 리셋.
//
// ⚠️ **글은 롬의 대사 뱅크 548이다.** 우리가 한 글자도 짓지 않고, 색 부호와
// 앞의 빈칸까지 그대로 찍는다. 줄 수는 판마다 다르다 — 미국 237 · 한국 209 ·
// 일본 184.
//
// ⚠️ **자리와 정렬은 사용자 롬의 오버레이 #99에서 온다** (`data/credits.<판>.json`).
// 어느 줄이 몇 픽셀째에 서고 어느 줄이 가운데인지가 롬 자료(NARC)에는 없고 코드 안
// 표에 있다. 한동안 미국 표 237줄을 **뱅크 길이로 잘라** 썼는데, 그것은 범위만
// 지키고 자리는 안 지킨다 — 일본판은 목록이 127번째 줄부터 갈려 열네 자리가
// 어긋났고, 한국판은 뱅크 237칸 중 뒤 28칸이 비어서 빈 줄 스물여덟이 흘렀다.
//
// ⚠️ **처음 깬 판에서도 바로 넘긴다** (사용자 결정 · 2026-09-29). 원작은 `gameCompleted`일 때만 START를 받아 처음
// 끝낸 사람은 131초를 다 봐야 한다 — 우리는 Z · X · Enter · Esc · Space 한 번에 3D 장면을 건너뛰고 「The End」로 간다.
//
// **3D 장면 일곱을 세운다** (`scene/CreditsStage` · `engine/world/creditsStage`) — 원작의 상태 기계(`ov99_021D1A54.c`의 일곱 단계)를 한 틱씩 옮긴
// 시계(`CreditsClock`)가 장면을 넘기고 밝기를 낸다: 노을 · 낮 · 밤에 나무와 가로등이 지나가고 자전거 탄 주인공이 서는 3D 셋, 회상 사진 두 묶음,
// 밤의 떡잎마을, 마지막 장면(「The End」). 글 두루마리는 이 화면(DOM)이 같은 틱으로 흘린다 — 원작도 글 BG는 장면의 밝기 변화를 안 받는다.
// 한 화면인 우리는 원작의 두 화면을 하나로 합친다: 위 화면의 하늘 · 날아다니는 포켓몬이 3D 화면의 하늘 위로 올라온다.
//
// ⚠️ **끝에 우리 몫이 붙는다** — 두루마리가 아니라 **따로 서는 한 화면**이다(`MakerScreen`). 롬 목록과 섞어 흘리면
// 남의 이름 옆에 우리 이름을 얹은 것처럼 읽힌다. 「The End」가 꺼지면 그 화면이 서고, 한 번 더 누르면
// 타이틀로 간다(원작 FIN의 자리다).
//
// 두루마리의 롬 글 · 자리 · 정렬 · 배경 장면 · 색은 **하나도 안 바꾼다.** 바뀐 것은 둘레(양옆 가장자리 · 진행 선 · 넘기기 안내의
// 키캡)와 만든 사람 화면의 위계(로고 · 세 칸 맞춤 · 묶음 페이드)다 (`records` §4.5).
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { music } from '../../engine/audio/music'
import { loadCreditRows, type DataLocale } from '../../data/gameData'
import type { CreditRows } from '../../data/schema'
import { loadUiText } from '../../data/uiText'
import { KeyHints } from '../common/KeyHints'
import { vars } from '../theme/contract.css'
import { creditsProgress } from './recordsLayout'
import { parseMessage } from '../../engine/script/text'
import { creditsAt, creditsRows } from '../../engine/world/credits'
import { CreditsClock, naturalSchedule } from '../../engine/world/creditsStage'
import { creditsLive } from '../../scene/creditsLive'
import { APP_ROOT } from '../../data/assetBase'
import { useGameLocale } from '../../state/optionsStore'
import { useMenuStore } from '../../state/menuStore'
import { footWords } from './footWords'
import * as css from './credits.css'

/** 원작 화면 높이. 자리를 백분율로 옮기는 데 쓴다 */
const VIEW_H = 192

/**
 * 만든 사람 화면의 글 — **우리가 쓴 글은 여기뿐이다.** 소개는 만든 사람의 누리집(siwon.it.kr)에 적힌 그대로다.
 *
 * ⚠️ **다른 게임은 타이틀의 「이런 게임은 어떠세요?」(`screens/gameLinks`)와 글자까지 같다.** 한동안 여기만 따로 적어
 * 같은 게임이 두 화면에서 「Pokerhythm」·「PokeRhythm」으로, 소개도 다른 말로 나왔다. 그 파일은 세 저장소가 같은
 * 내용으로 나눠 가져서 이쪽에 맞추지 않는다 — 어긋나면 `creditsScreen.test`가 선다.
 *
 * ⚠️ **고지 줄을 빼지 않는다** — 타이틀 화면과 같은 문장이고(COPYRIGHT §11) 게임을 끝까지 본 사람이 마지막으로 읽는 자리다.
 * 그래서 돈이 오가는 링크(후원 · 판매)는 안 싣는다 — 「무료 · 비영리」와 부딪친다. 「BYOR」는 줄임말을 아는 사람에게만
 * 읽혀서 타이틀처럼 풀어 쓴다
 */
export const MAKER = {
  title: 'Radiant Platinum',
  tagline: '포켓몬스터 플래티넘을 브라우저 3D로 다시 만든 비공식 팬 프로젝트',
  name: 'Siwon J. Park',
  about: 'KAIST 산업디자인 · 전산학부 — 교육과 의료를 위한 AI 서비스를 설계하고 만듭니다',
  links: [
    { label: 'siwon.it.kr', href: 'https://siwon.it.kr/' },
    { label: 'github.com/ksiwon', href: 'https://github.com/ksiwon' },
  ],
  games: [
    { title: 'Pokemon Aegis', about: '포켓몬 타워 디펜스 X TFT 게임', label: 'aegis.siwon.it.kr', href: 'https://aegis.siwon.it.kr/' },
    { title: 'PokeRhythm', about: '포켓몬 BGM 리듬게임', label: 'pokerhythm.siwon.it.kr', href: 'https://pokerhythm.siwon.it.kr/' },
  ],
  thanks: 'pret 팀의 pokeplatinum 디컴파일 프로젝트',
  notice: [
    '비공식·비제휴 팬 프로젝트입니다.',
    '관련 상표와 저작물은 각 권리자의 것이며,',
    '직접 가진 게임 파일을 쓰는 무료·비영리 방식이어도 권리자의 허가를 뜻하지는 않습니다.',
  ],
} as const

/**
 * 만든 사람 화면의 글 세 언어. 이름 · 제목 · 주소는 언어와 무관해 `MAKER`에 한 번만 두고, 풀어 쓴 글만 갈린다.
 * 한국어는 `MAKER`의 글 그대로다
 */
interface MakerText {
  tagline: string
  about: string
  labelMaker: string
  labelGames: string
  labelThanks: string
  /** `MAKER.games`와 같은 차례 */
  gameAbouts: readonly [string, string]
  thanks: string
  notice: readonly [string, string, string]
}

export const MAKER_TEXT: Record<DataLocale, MakerText> = {
  ko: {
    tagline: MAKER.tagline, about: MAKER.about, labelMaker: '만든 사람', labelGames: '다른 게임', labelThanks: '원작 해석',
    gameAbouts: [MAKER.games[0].about, MAKER.games[1].about], thanks: MAKER.thanks, notice: MAKER.notice,
  },
  en: {
    tagline: 'An unofficial fan project that rebuilds Pokémon Platinum as browser 3D',
    about: 'KAIST Industrial Design and Computer Science — designing and building AI services for education and healthcare',
    labelMaker: 'Made by', labelGames: 'More games', labelThanks: 'Original analysis',
    gameAbouts: ['A Pokémon tower defense x TFT game', 'A Pokémon BGM rhythm game'],
    thanks: 'The pokeplatinum decompilation project by the pret team',
    notice: [
      'This is an unofficial, unaffiliated fan project.',
      'All related trademarks and works belong to their respective owners.',
      'Using game files you own, free and non-commercially, does not mean the rights holders have given permission.',
    ],
  },
  ja: {
    tagline: 'ポケットモンスター プラチナをブラウザの3Dで作り直した非公式ファンプロジェクト',
    about: 'KAIST 産業デザイン・コンピュータサイエンス — 教育と医療のためのAIサービスを設計し、作っています',
    labelMaker: '制作', labelGames: '他のゲーム', labelThanks: '原作の解析',
    gameAbouts: ['ポケモンのタワーディフェンス x TFT ゲーム', 'ポケモンBGMのリズムゲーム'],
    thanks: 'pretチームの pokeplatinum デコンパイルプロジェクト',
    notice: [
      '非公式・非提携のファンプロジェクトです。',
      '関連する商標と著作物は各権利者のものであり、',
      'ご自身が持つゲームファイルを使う無料・非営利の方式でも、権利者の許可を意味するものではありません。',
    ],
  },
}

/**
 * 만든 사람 화면 — 두루마리가 끝나거나 넘기면 서서, 누를 때까지 머문다.
 *
 * 세 묶음이 0 · 160 · 320ms 간격으로 400ms 페이드한다(오르는 이동 없음): ① 로고 · 이름 · 소개 ② 만든 사람 ③ 다른 게임과 감사 · 고지.
 * 다른 게임은 `제목 | 소개 | 주소` 세 칸 맞춤이다 — 두 줄이 같은 칸에 서므로 가운데 맞춤 때의 들쭉날쭉이 없다
 */
function MakerScreen() {
  const t = MAKER_TEXT[useGameLocale()]
  const plain = runStyle(0)
  const accent = runStyle(1)
  const label = runStyle(2)
  const link = (l: { label: string, href: string }) => (
    <a key={l.href} className={css.makerLink} style={plain} href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a>
  )
  return (
    <div className={css.maker}>
      <div className={css.makerGroup}>
        {/* 앱 아이콘 — 장식이다 */}
        <img className={css.makerLogo} src={`${APP_ROOT}assets/radiant-platinum-icon.png`} alt="" />
        <div className={css.makerTitle} style={accent}>{MAKER.title}</div>
        <div className={css.makerSmall} style={plain}>{t.tagline}</div>
      </div>
      <div className={css.makerHair} aria-hidden />

      <div className={css.makerGroup} style={{ animationDelay: '160ms' }}>
        <div className={css.makerLabel} style={label}>{t.labelMaker}</div>
        <div className={css.makerName} style={plain}>{MAKER.name}</div>
        <div className={css.makerSmall} style={plain}>{t.about}</div>
        <div className={css.makerRow}>{MAKER.links.map(link)}</div>
      </div>

      <div className={css.makerGroup} style={{ animationDelay: '320ms' }}>
        <div className={css.makerLabel} style={label}>{t.labelGames}</div>
        <div className={css.makerGames}>
          {MAKER.games.map((g, gi) => (
            <div key={g.href} className={css.makerGame}>
              <span className={css.makerGameTitle} style={accent}>{g.title}</span>
              <span className={css.makerGameAbout} style={plain}>{t.gameAbouts[gi]}</span>
              {link(g)}
            </div>
          ))}
        </div>
        <div className={css.makerFoot}>
          <div><span style={label}>{t.labelThanks}</span> <span style={plain}>{t.thanks}</span></div>
          {t.notice.map((n) => <div key={n}>{n}</div>)}
        </div>
      </div>
    </div>
  )
}

/**
 * `{COLOR n}`의 글자색과 그림자색 — 롬의 크레딧 팔레트다(`ending.narc` 85번 15벌 · `TEXT_COLOR(1, 2, 0)` ·
 * `{COLOR n}`이 글자 2n+1 · 그림자 2n+2 — `render_text.c:111-112`).
 *
 * ⚠️ **그림자가 글을 살린다.** 한동안 대사창의 강조색(노랑 · 하늘)을 그림자 없이 썼는데, 노을 하늘 위에서
 * 제목 줄(1번)이 거의 안 보였다. 원작 글은 하늘 위의 투명한 판에 서고 **한 도트 어두운 그림자**로만 읽힌다
 */
const COLORS: Record<number, { ink: string, shadow: string }> = {
  0: { ink: '#e7e7e7', shadow: '#424242' },
  1: { ink: '#ffdede', shadow: '#b56363' },
  2: { ink: '#dedeff', shadow: '#636bb5' },
}
/** 한 도트 — 글꼴이 8도트 높이라 1em의 8분의 1 */
const DOT = '0.125em'
const runStyle = (color: number): CSSProperties => {
  const c = COLORS[color] ?? COLORS[0]!
  return { color: c.ink, textShadow: `${DOT} 0 0 ${c.shadow}, 0 ${DOT} 0 ${c.shadow}, ${DOT} ${DOT} 0 ${c.shadow}` }
}

/** 한 줄을 색 조각으로 자른다. 색 부호 말고는 다 글자다 */
interface Run { text: string; color: number }

function runsOf(raw: string): Run[] {
  const out: Run[] = []
  let color = 0
  for (const token of parseMessage(raw)) {
    if (token.kind === 'color') { color = token.color; continue }
    if (token.kind !== 'text') continue
    const last = out[out.length - 1]
    if (last && last.color === color) last.text += token.text
    else out.push({ text: token.text, color })
  }
  return out
}

/** 엔딩 곡 (`SEQ_BLD_ENDING`) */
const BGM = 1186

/** 3D 무대가 모델 · 그림을 받는 것을 기다리는 데 걸리는 한도 (ms) — 넘으면 받은 만큼으로 시작한다 */
const READY_LIMIT = 8000

/** 한 번에 따라잡는 틱의 끝 — 탭을 오래 비웠다 돌아오면 그 사이는 건너뛴다 */
const CATCH_UP = 120

export function CreditsScreen() {
  const closeAll = useMenuStore((s) => s.closeAll)
  const locale = useGameLocale()
  /** 장면이 다 끝났다 — 만든 사람 화면이 선다 */
  const [maker, setMaker] = useState(false)

  const [lines, setLines] = useState<string[] | null>(null)
  /** 그 판의 배치표. 글과 **같은 판**이라야 자리가 맞는다 */
  const [table, setTable] = useState<CreditRows | null>(null)
  const [frame, setFrame] = useState(0)
  /** 지금 장면 번호 — 글 두루마리를 거둘 때를 본다 */
  const [scene, setScene] = useState(0)
  /** 지금 「The End」가 서 있는가 */
  const [endText, setEndText] = useState(false)
  /** 3D 장면과 화면 전체를 가리는 검정 — 매 틱 바뀌므로 DOM 값을 직접 쓴다 */
  const sceneDim = useRef<HTMLDivElement>(null)
  const screenDim = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)

  useEffect(() => {
    let alive = true
    void Promise.all([loadUiText('credits', locale), loadCreditRows(locale)])
      .then(([text, rows]) => {
        if (!alive) return
        setLines(text)
        setTable(rows)
      })
      // ⚠️ **자리표를 못 받아도 미국 표로 안 떨어진다.** 떨어지면 그 판의 화면이
      // 어긋난 채로 130초를 흐르고, 그것은 「안 나오는 것」보다 알아채기 어렵다.
      // 빈 표면 롬 목록이 한 줄도 안 흐르고 3D 장면만 지나간 뒤 만든 사람 화면으로 나간다
      .catch(() => { if (alive) { setLines([]); setTable({ rows: [] }) } })
    return () => { alive = false }
  }, [locale])

  /**
   * 타이틀로 — **통째로 다시 켠다** (`OS_ResetSystem(RESET_CLEAN)` · `clear_game.c:165`).
   *
   * ⚠️ **라우터로만 나가면 세계가 그대로 남는다.** 캔버스는 라우트 위에 떠 있어서(`app/App.tsx`) 타이틀에서도
   * 맵과 스크립트가 선 채로 기다리고, 「이어하기」는 리포트가 아니라 **그 자리**에서 다시 걷는다 — 실측(탐침 p9 ·
   * `_hof42`): 리포트는 떡잎마을 침실(415)인데 전당 방(187)에 서서 마박사의 대사가 다시 돌았다
   */
  const leave = useCallback((): void => {
    music.stop()
    closeAll()
    location.assign(APP_ROOT)
  }, [closeAll])

  /**
   * 장면 시계 — 원작의 한 틱(60Hz)마다 `CreditsClock.step`을 돌린다.
   *
   * ⚠️ **경과 시간으로 센다.** 프레임 수로 세면 느린 기계에서 크레딧이 늘어진다.
   * ⚠️ **글이 오기를 기다린다** — 시계는 글 두루마리와 같은 틱이다(`unk_10FC`). 글 없이 시작하면 줄이 늦게 올라온다.
   * 3D 무대가 모델 · 그림을 받는 동안(`creditsLive.ready`)도 기다린다. 한도(`READY_LIMIT`)를 넘으면 받은 만큼으로 간다
   */
  useEffect(() => {
    if (lines === null || table === null || maker) return
    const clock = new CreditsClock()
    creditsLive.view = clock.view()
    // 시작은 검정이다 (`BrightnessController_SetScreenBrightness(-16, …)`) — 받는 동안 3D가 비치지 않는다
    if (sceneDim.current) sceneDim.current.style.opacity = '1'
    let raf = 0
    let last: number | null = null
    let acc = 0
    const began = performance.now()
    let playing = false
    const tick = (now: number): void => {
      if (!playing) {
        if (!creditsLive.ready && now - began < READY_LIMIT) { raf = requestAnimationFrame(tick); return }
        playing = true
        void music.play(BGM)
      }
      if (last !== null) acc += Math.min(CATCH_UP / 60, (now - last) / 1000)
      last = now
      while (acc >= 1 / 60) {
        acc -= 1 / 60
        clock.step(pressed.current)
        pressed.current = false
      }
      const v = clock.view()
      creditsLive.view = v
      if (sceneDim.current) sceneDim.current.style.opacity = String(v.sceneDim)
      if (screenDim.current) screenDim.current.style.opacity = String(v.screenDim)
      setFrame(v.tick)
      setScene(v.scene)
      setEndText(v.endText)
      if (v.done) { setMaker(true); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); creditsLive.view = null }
  }, [lines, table, maker])

  // 3D 무대가 선 동안만 「받았다」가 의미가 있다 — 닫을 때 비운다
  useEffect(() => () => { creditsLive.ready = false }, [])

  // 넘기기 — 장면에서는 「The End」로, 거기서는 끝내고 만든 사람 화면으로, 거기서는 타이틀로
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!['KeyZ', 'KeyX', 'Enter', 'Escape', 'Space'].includes(e.code)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      if (maker) leave()
      else pressed.current = true
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  }, [maker, leave])

  /** 장면 5까지 — 글 두루마리가 서 있다 (장면 5를 올릴 때 원작이 글을 거둔다 · `ov99_021D12F0`) */
  const rollOn = !maker && !endText && scene < 5
  /**
   * ⚠️ **자리를 세는 자가 배치표다.** 뱅크가 표보다 길 수 있다 — 한국 롬의 뱅크는 237칸인데 배치표는 209줄이고
   * 뒤 28칸이 빈 글이다. 뱅크 길이로 세면 빈 줄 스물여덟이 흐른다
   */
  const rows = table === null ? [] : creditsRows(table.rows, [])
  // ⚠️ **마지막 줄은 두루마리가 안 흘린다** — 원작이 `unk_0C >= NELEMS - 1`에서 멈추고 그 줄은 「The End」 장면이 찍는다 (`ov99_021D4130`)
  const shown = rollOn ? creditsAt(frame, rows.slice(0, -1)) : []
  const textOf = (index: number): string => lines?.[index] ?? ''
  const endLine = textOf(Math.max(0, rows.length - 1))

  return (
    // 하네스가 두 장을 가른다 — 두루마리 · 만든 사람 (`story.mjs` ③ · `badgesLeague.mjs`)
    <div className={css.backdrop} data-credits={maker ? 'maker' : 'roll'}>
      <div className={css.stage}>
        {/* 3D 장면은 뒤의 캔버스가 그린다 (`scene/CreditsStage`) — 밝기 가림은 글 아래에 깐다. 원작도 글 BG는 밝기를 안 받는다 */}
        <div ref={sceneDim} className={css.dim} aria-hidden />
        {maker && <MakerScreen />}
        <div className={css.roll} style={{ display: rollOn ? undefined : 'none' }}>
          {shown.map(({ index, y, centered }) => (
            <div
              key={index}
              className={`${css.line} ${centered ? css.align.center : css.align.indent}`}
              style={{ top: `${String((y / VIEW_H) * 100)}%` }}
            >
              {runsOf(textOf(index)).map((run, i) => (
                <span key={i} style={runStyle(run.color)}>{run.text}</span>
              ))}
            </div>
          ))}
        </div>
        {/* 「The End」 — 가운데 · 위에서 80픽셀 (`ov99_021D2AAC`) */}
        {endText && (
          <div
            className={`${css.line} ${css.align.center}`}
            style={{ top: `${String((80 / VIEW_H) * 100)}%` }}
            data-credits-end
          >
            {runsOf(endLine).map((run, i) => (
              <span key={i} style={runStyle(0)}>{run.text}</span>
            ))}
          </div>
        )}
        {/* 양옆 가장자리 — 그림이 칼로 자른 듯 끝나지 않게 */}
        <div className={`${css.edge} ${css.edgeLeft}`} aria-hidden />
        <div className={`${css.edge} ${css.edgeRight}`} aria-hidden />
        {/* 진행 — 장면이 흐른 몫. 글자는 없다 */}
        {!maker && (
          <div
            className={css.progress}
            style={{ width: `${String(creditsProgress(frame, naturalSchedule().total) * 100)}%` }}
            aria-hidden
          />
        )}
        {/* 하늘 위에서 읽히도록 글 뒤에 1px 그림자 */}
        <div className={css.hint} style={{ textShadow: `1px 1px 0 ${vars.scrim.deep}` }}>
          <KeyHints text={maker ? footWords(locale).toTitle : footWords(locale).skip} tone="dark" />
        </div>
        {/* 화면 전체를 가리는 검정 — 건너뛰기 · 「The End」의 페이드 (글도 같이 꺼진다) */}
        <div ref={screenDim} className={css.dim} style={{ zIndex: 5 }} aria-hidden />
      </div>
    </div>
  )
}
