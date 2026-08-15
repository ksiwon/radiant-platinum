// 크레딧 (PARITY §8.12) — `overlay099/ov99_021D0D80.c` · `ov99_021D3E78.c`
//
// 명예의 전당이 리포트를 다 쓰면 이 화면이 뜨고, 두루마리가 다 흐르면 타이틀로
// 나간다. 원작의 차례가 그렇다 — 전당 → 리포트 → 크레딧 → 리셋.
//
// ⚠️ **글은 롬의 대사 뱅크 548 237줄이다.** 우리가 한 글자도 짓지 않고, 색 부호와
// 앞의 빈칸까지 그대로 찍는다.
//
// ⚠️ **자리와 정렬은 디컴프에서 구운 표다** (`pnpm gen:credits`). 어느 줄이 몇
// 픽셀째에 서고 어느 줄이 가운데인지가 롬 자료에 없다.
//
// ⚠️ **넘기는 것은 한 번 깬 뒤부터다** — 원작이 `gameCompleted`일 때만 START를
// 받는다. 처음 끝낸 사람에게는 흐르는 것을 보여 준다.
//
// ⚠️ **3D 장면 일곱은 없다.** 원작은 아래 화면에 장면 일곱을 3D로 돌리고 그 위로
// 사람이 지나간다(`ov99_021D1A54.c`의 상태 기계 일곱). 우리는 위 화면 배경 세
// 장만 굽는다 — 바뀌는 자리도 그래서 우리가 정한 것이다 (`creditsScene`).
//
// ⚠️ **끝에 우리 몫이 붙는다** (`OURS`). 롬의 목록과 **화면 하나를 통째로 띄워**
// 잇는다 — 붙여 놓으면 남의 이름 옆에 우리 이름을 얹은 것처럼 읽힌다. 이 줄들만
// 우리가 쓴 글이고, 그래서 롬에서 오는 글과 다른 배열에 따로 둔다.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { music } from '../../engine/audio/music'
import { creditsImage, loadCreditsAtlas } from '../../data/gameData'
import type { CreditsAtlas } from '../../data/schema'
import { atlasUrl } from '../../data/providers/atlas'
import { loadUiText } from '../../data/uiText'
import { parseMessage } from '../../engine/script/text'
import {
  creditsAt, creditsFrames, creditsRows, creditsScene, CREDIT_SCENE_PAN,
} from '../../engine/world/credits'
import { CREDIT_LINES } from '../../engine/world/creditsTable'
import { useGameLocale } from '../../state/optionsStore'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import * as css from './credits.css'

/** 원작 화면 크기. 자리를 백분율로 옮기는 데 쓴다 */
const VIEW_W = 256
const VIEW_H = 192

/**
 * 롬의 목록 뒤에 붙는 **우리 몫**.
 *
 * 여기만 우리가 쓴 글이다. 색 부호는 롬 것과 같은 규칙이라(`{COLOR 2}`가 항목
 * 이름) 대사창과 같은 함수가 그대로 읽는다.
 *
 * ⚠️ **고지 넉 줄을 빼지 않는다** — 타이틀 화면과 같은 문장이고(COPYRIGHT §11)
 * 게임을 끝까지 본 사람이 마지막으로 읽는 자리다
 */
const OURS: readonly { text: string; centered?: boolean }[] = [
  { text: '{COLOR 1}Radiant Platinum{COLOR 0}', centered: true },
  { text: '비공식 팬 프로젝트', centered: true },
  { text: '' },
  { text: '{COLOR 2}제작{COLOR 0}' },
  { text: '    Siwon J. Park' },
  { text: '' },
  { text: '{COLOR 2}원작 해석{COLOR 0}' },
  { text: '    pret/pokeplatinum' },
  { text: '' },
  { text: '{COLOR 2}고지{COLOR 0}' },
  { text: '    비공식·비제휴 팬 프로젝트입니다.' },
  { text: '    관련 상표와 저작물은 각 권리자의 것이며,' },
  { text: '    무료·비영리·BYOR는' },
  { text: '    권리자의 허가를 뜻하지 않습니다.' },
]

/** `{COLOR n}`의 색. 대사창과 같은 표다 (`ui/field/MessageBox`) */
const COLORS: Record<number, string> = {
  1: '#ffd76a',
  2: '#9fd8ff',
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
function sceneStyle(at: number, size: { w: number; h: number }, frame: number): CSSProperties {
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
    backgroundPosition: `${String(dx * kx)}% ${String(dy * ky)}%`,
    backgroundRepeat: 'repeat',
  }
}

/** 엔딩 곡 (`SEQ_BLD_ENDING`) */
const BGM = 1186

export function CreditsScreen() {
  const navigate = useNavigate()
  const closeAll = useMenuStore((s) => s.closeAll)
  const locale = useGameLocale()
  // 한 번 깬 리포트인가. 넘기기가 이 값에 달렸다 (`v0->unk_00->gameCompleted`)
  const cleared = useSaveStore((s) => s.hallOfFame.total > 0)

  const [lines, setLines] = useState<string[] | null>(null)
  const [atlas, setAtlas] = useState<CreditsAtlas | null>(null)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    let alive = true
    void Promise.all([loadUiText('credits', locale), loadCreditsAtlas()])
      .then(([text, meta]) => { if (alive) { setLines(text); setAtlas(meta) } })
      .catch(() => { if (alive) setLines([]) })
    return () => { alive = false }
  }, [locale])

  useEffect(() => {
    void music.play(BGM)
    return () => { music.stop() }
  }, [])

  const leave = useCallback((): void => {
    music.stop()
    closeAll()
    navigate('/')
  }, [closeAll, navigate])

  // 두루마리. 원작이 프레임마다 1픽셀 올리므로 60fps에 맞춘다 —
  // ⚠️ **경과 시간으로 센다.** 프레임 수로 세면 느린 기계에서 크레딧이 늘어진다
  const started = useRef<number | null>(null)
  useEffect(() => {
    if (lines === null) return
    const until = creditsFrames(creditsRows(lines.length, OURS.map((l) => l.centered ?? false)))
    let raf = 0
    const tick = (now: number): void => {
      started.current ??= now
      const at = Math.floor(((now - started.current) / 1000) * 60)
      if (at >= until) { leave(); return }
      setFrame(at)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf) }
  }, [lines, leave])

  // 넘기기. 한 번 깬 리포트에서만 받는다
  useEffect(() => {
    if (!cleared) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyZ' && e.code !== 'KeyX' && e.code !== 'Enter' && e.code !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      leave()
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  }, [cleared, leave])

  const scene = atlas ? creditsScene(frame, atlas.count) : 0
  // ⚠️ **뱅크 길이에서 끊는다** — 일본 롬은 184줄뿐이라 표를 끝까지 돌리면
  // 뒤쪽 53줄이 빈 채로 1분 가까이 흐른다
  const rows = lines === null ? [] : creditsRows(lines.length, OURS.map((l) => l.centered ?? false))
  const shown = creditsAt(frame, rows)
  /** 그 줄의 글. 롬의 목록을 지나면 우리 몫이다 */
  const textOf = (index: number): string =>
    index < (lines?.length ?? 0)
      ? lines?.[index] ?? ''
      : OURS[index - Math.min(lines?.length ?? 0, rows.length)]?.text ?? ''

  return (
    <div className={css.backdrop}>
      <div className={css.stage}>
        {atlas?.scenes.map((size, i) => (
          <div
            key={i}
            className={`${css.scene} ${i === scene ? css.sceneOn : css.sceneOff}`}
            style={sceneStyle(i, size, frame)}
          />
        ))}
        <div className={css.roll}>
          {shown.map(({ index, y, centered }) => (
            <div
              key={index}
              className={`${css.line} ${centered ? css.align.center : css.align.indent}`}
              style={{ top: `${String((y / VIEW_H) * 100)}%` }}
            >
              {runsOf(textOf(index)).map((run, i) => (
                <span key={i} style={{ color: COLORS[run.color] }}>{run.text}</span>
              ))}
            </div>
          ))}
        </div>
        {cleared && <div className={css.hint}>Z 넘기기</div>}
      </div>
    </div>
  )
}

/** 뱅크가 표와 같은 줄 수인지 — 시험이 본다 */
export const CREDITS_EXPECTED_LINES = CREDIT_LINES
