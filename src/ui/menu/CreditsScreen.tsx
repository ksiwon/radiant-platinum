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
// 끝낸 사람은 131초를 다 봐야 한다 — 우리는 Z · X · Enter · Esc · Space 한 번에 롬 목록을 건너뛰고 만든 사람 화면으로 간다.
//
// ⚠️ **3D 장면 일곱은 없다.** 원작은 아래 화면에 장면 일곱을 3D로 돌리고 그 위로
// 사람이 지나간다(`ov99_021D1A54.c`의 상태 기계 일곱). 우리는 위 화면 배경 세
// 장만 굽는다 — 바뀌는 자리도 그래서 우리가 정한 것이다 (`creditsScene`).
//
// ⚠️ **끝에 우리 몫이 붙는다** — 두루마리가 아니라 **따로 서는 한 화면**이다(`MakerScreen`). 롬 목록과 섞어 흘리면
// 남의 이름 옆에 우리 이름을 얹은 것처럼 읽힌다. 롬 목록이 다 흐르거나 넘기면 그 화면이 서고, 한 번 더 누르면
// 타이틀로 간다(원작 FIN의 자리다).
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { music } from '../../engine/audio/music'
import { creditsImage, loadCreditRows, loadCreditsAtlas } from '../../data/gameData'
import type { CreditRows, CreditsAtlas } from '../../data/schema'
import { atlasUrl } from '../../data/providers/atlas'
import { loadUiText } from '../../data/uiText'
import { parseMessage } from '../../engine/script/text'
import {
  creditsAt, creditsFrames, creditsRows, creditsScene, creditsSceneStart, CREDIT_SCENE_PAN, CREDIT_SCENE_RUN,
} from '../../engine/world/credits'
import { APP_ROOT } from '../../data/assetBase'
import { useGameLocale } from '../../state/optionsStore'
import { useMenuStore } from '../../state/menuStore'
import * as css from './credits.css'

/** 원작 화면 크기. 자리를 백분율로 옮기는 데 쓴다 */
const VIEW_W = 256
const VIEW_H = 192

/**
 * 만든 사람 화면의 글 — **우리가 쓴 글은 여기뿐이다.** 소개와 다른 게임은 만든 사람의 누리집(siwon.it.kr)에 적힌 그대로다.
 *
 * ⚠️ **고지 줄을 빼지 않는다** — 타이틀 화면과 같은 문장이고(COPYRIGHT §11) 게임을 끝까지 본 사람이 마지막으로 읽는 자리다.
 * 그래서 돈이 오가는 링크(후원 · 판매)는 안 싣는다 — 「무료 · 비영리」와 부딪친다
 */
const MAKER = {
  title: 'Radiant Platinum',
  tagline: '포켓몬스터 플래티넘을 브라우저 3D로 다시 만든 비공식 팬 프로젝트',
  name: 'Siwon J. Park',
  about: 'KAIST 산업디자인 · 전산학부 — 교육과 의료를 위한 AI 서비스를 설계하고 만듭니다',
  links: [
    { label: 'siwon.it.kr', href: 'https://siwon.it.kr/' },
    { label: 'github.com/ksiwon', href: 'https://github.com/ksiwon' },
  ],
  games: [
    { title: 'Pokemon Aegis', about: '1025마리가 다 나오는 타워 디펜스', label: 'aegis.siwon.it.kr', href: 'https://aegis.siwon.it.kr/' },
    { title: 'Pokerhythm', about: 'DS 포켓몬 곡 557개로 만든 리듬 게임', label: 'pokerhythm.siwon.it.kr', href: 'https://pokerhythm.siwon.it.kr/' },
  ],
  thanks: 'pret/pokeplatinum',
  notice: [
    '비공식·비제휴 팬 프로젝트입니다.',
    '관련 상표와 저작물은 각 권리자의 것이며,',
    '무료·비영리·BYOR는 권리자의 허가를 뜻하지 않습니다.',
  ],
} as const

/** 만든 사람 화면 — 두루마리가 끝나거나 넘기면 서서, 누를 때까지 머문다 */
function MakerScreen() {
  const plain = runStyle(0)
  const accent = runStyle(1)
  const label = runStyle(2)
  const link = (l: { label: string, href: string }) => (
    <a key={l.href} className={css.makerLink} style={plain} href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a>
  )
  return (
    <div className={css.maker}>
      <div className={css.makerTitle} style={accent}>{MAKER.title}</div>
      <div className={css.makerSmall} style={plain}>{MAKER.tagline}</div>

      <div className={css.makerLabel} style={label}>만든 사람</div>
      <div className={css.makerName} style={plain}>{MAKER.name}</div>
      <div className={css.makerSmall} style={plain}>{MAKER.about}</div>
      <div className={css.makerRow}>{MAKER.links.map(link)}</div>

      <div className={css.makerLabel} style={label}>다른 게임</div>
      {MAKER.games.map((g) => (
        <div key={g.href} className={css.makerGame}>
          <span style={accent}>{g.title}</span>
          <span className={css.makerSmall} style={plain}>{g.about}</span>
          {link(g)}
        </div>
      ))}

      <div className={css.makerFoot}>
        <div><span style={label}>원작 해석</span> <span style={plain}>{MAKER.thanks}</span></div>
        {MAKER.notice.map((n) => <div key={n}>{n}</div>)}
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

/**
 * 배경 한 장의 자리.
 *
 * ⚠️ **화면(256×192)보다 큰 그림을 「덮어 늘리지」 않는다.** 원작은 그 큰 판을
 * 그대로 두고 **창을 민다**(BG 오프셋) — 늘려서 맞추면 흐르는 폭이 사라진다.
 * 그래서 그림 한 도트가 화면 한 도트가 되게 두고, 남는 폭은 흐르는 값이 먹는다.
 *
 * ⚠️ **가로와 세로의 자가 다르다.** `%` 배경 크기는 가로가 요소 **폭**의,
 * 세로가 요소 **높이**의 백분율인데 요소는 256×192다 — 둘 다 192로 나누면
 * 가로만 4/3배로 늘어난다. 실제로 그렇게 나가 있었다
 */
function sceneStyle(at: number, size: { w: number; h: number; backdrop?: string }, frame: number): CSSProperties {
  const pan = CREDIT_SCENE_PAN[at] ?? { x: 0, y: 0 }
  // 원작의 BG 오프셋은 「창이 움직인다」라 그림은 반대로 간다.
  //
  // ⚠️ **판 크기로 감아 돌리지 않는다.** 원작 BG도 판 크기로 반복하지만,
  // 흐르는 값이 워낙 작아서(0x40/4096 = 한 프레임에 0.0156도트) 크레딧이 끝날
  // 때까지 판 한 장을 못 넘긴다 — 이음매를 한 번도 안 지나간다는 뜻이다.
  // 감아 돌리면 **음수 오프셋이 곧바로 판 오른쪽 끝으로 튀어서**, 첫 프레임부터
  // 창이 이음매를 물고 있게 된다. 실측: `credits0.png`(512×256)는 좌우 끝
  // 색 차이가 채널당 평균 16.0인데 바로 옆 칸끼리는 0.0이다 — 가로로 안 이어진
  // 그림이고, 그래서 크레딧 배경에 세로선이 하나 그어져 있었다.
  // CSS `repeat`는 음수 자리도 알아서 채우므로 그냥 두면 된다
  const dx = -pan.x * frame
  const dy = -pan.y * frame
  // 원작 화면(256×192)을 1로 잡은 배율. `%` 단위라 창 크기가 바뀌어도 따라간다
  const kx = 100 / VIEW_W
  const ky = 100 / VIEW_H
  return {
    backgroundImage: `url(${atlasUrl(creditsImage(at))})`,
    backgroundSize: `${String(size.w * kx)}% ${String(size.h * ky)}%`,
    // ⚠️ **자리는 `%`로 못 적는다.** `background-position`의 백분율은 밀어낸 거리가 아니라 「그림의 p% 점을 판의
    // p% 점에 맞춘다」여서, 판보다 큰 그림에서는 **방향이 뒤집히고** 판과 같은 폭이면 아예 안 움직인다. 그래서 첫
    // 장이 거꾸로 흘러 오른쪽에 뒤판 띠가 섰고 둘째 장 위에 뒤판 띠가 섰다(REPAIR §132). 무대의 크기 단위
    // (`cqw`·`cqh` — `credits.css`의 `stage`가 크기 컨테이너다)로 도트를 옮긴다
    backgroundPosition: `${String(dx * kx)}cqw ${String(dy * ky)}cqh`,
    backgroundRepeat: 'repeat',
    // 그림의 0번 색이 뚫린 자리에 보이는 뒤판 (`ov99_021D4134.c:197-198`)
    backgroundColor: size.backdrop,
  }
}

/** 엔딩 곡 (`SEQ_BLD_ENDING`) */
const BGM = 1186

export function CreditsScreen() {
  const closeAll = useMenuStore((s) => s.closeAll)
  const locale = useGameLocale()
  /** 롬 목록이 끝났거나 넘겼다 — 만든 사람 화면이 선다 */
  const [maker, setMaker] = useState(false)

  const [lines, setLines] = useState<string[] | null>(null)
  /** 그 판의 배치표. 글과 **같은 판**이라야 자리가 맞는다 */
  const [table, setTable] = useState<CreditRows | null>(null)
  const [atlas, setAtlas] = useState<CreditsAtlas | null>(null)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    let alive = true
    void Promise.all([loadUiText('credits', locale), loadCreditRows(locale), loadCreditsAtlas()])
      .then(([text, rows, meta]) => {
        if (!alive) return
        setLines(text)
        setTable(rows)
        setAtlas(meta)
      })
      // ⚠️ **자리표를 못 받아도 미국 표로 안 떨어진다.** 떨어지면 그 판의 화면이
      // 어긋난 채로 130초를 흐르고, 그것은 「안 나오는 것」보다 알아채기 어렵다.
      // 빈 표면 롬 목록이 한 줄도 안 흐르고 **우리 몫만** 지나간 뒤 타이틀로 나간다
      .catch(() => { if (alive) { setLines([]); setTable({ rows: [] }) } })
    return () => { alive = false }
  }, [locale])

  useEffect(() => {
    void music.play(BGM)
    return () => { music.stop() }
  }, [])

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

  // 두루마리. 원작이 프레임마다 1픽셀 올리므로 60fps에 맞춘다 —
  // ⚠️ **경과 시간으로 센다.** 프레임 수로 세면 느린 기계에서 크레딧이 늘어진다
  const started = useRef<number | null>(null)
  useEffect(() => {
    if (lines === null || table === null || maker) return
    const until = creditsFrames(table.rows)
    let raf = 0
    const tick = (now: number): void => {
      started.current ??= now
      const at = Math.floor(((now - started.current) / 1000) * 60)
      if (at >= until) { setMaker(true); return }
      setFrame(at)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf) }
  }, [lines, table, maker])

  // 넘기기 — 두루마리에서는 만든 사람 화면으로, 거기서는 타이틀로
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!['KeyZ', 'KeyX', 'Enter', 'Escape', 'Space'].includes(e.code)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      if (maker) leave()
      else setMaker(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  }, [maker, leave])

  /** 롬 목록만 흐르는 데 걸리는 프레임. **배경 셋을 나누는 자가 이것이다** */
  const romFrames = table === null ? 0 : creditsFrames(table.rows)
  const scene = atlas ? creditsScene(frame, atlas.count, romFrames) : 0
  /**
   * ⚠️ **자리를 세는 자가 배치표다.** 뱅크가 표보다 길 수 있다 — 한국 롬의 뱅크는 237칸인데 배치표는 209줄이고
   * 뒤 28칸이 빈 글이다. 뱅크 길이로 세면 빈 줄 스물여덟이 흐른다
   */
  const rows = table === null ? [] : creditsRows(table.rows, [])
  const shown = creditsAt(frame, rows)
  const textOf = (index: number): string => lines?.[index] ?? ''

  return (
    <div className={css.backdrop}>
      <div className={css.stage}>
        {atlas?.scenes.map((size, i) => (
          <div
            key={i}
            className={`${css.scene} ${i === scene ? css.sceneOn : css.sceneOff}`}
            style={sceneStyle(i, size, Math.min(CREDIT_SCENE_RUN[i] ?? 0,
              Math.max(0, frame - creditsSceneStart(i, atlas.count, romFrames))))}
          />
        ))}
        {maker && <MakerScreen />}
        <div className={css.roll} style={{ display: maker ? 'none' : undefined }}>
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
        <div className={css.hint}>{maker ? 'Z 타이틀로' : 'Z 넘기기'}</div>
      </div>
    </div>
  )
}