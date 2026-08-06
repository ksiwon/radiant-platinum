// 확인 지점 화면 (백틱 `) — 시험용.
//
// 만든 것을 눈으로 봐야 할 때 처음부터 걸어갈 수는 없다. 여기서 고르면 그 자리에
// 서고, 확인에 필요한 조건(파티·가방·소지금)도 같이 채워진다.
//
// 타이틀에서 눌러도 되고 게임 중에 눌러도 된다. 타이틀에서 누르면 새 판을 열지만
// **리포트는 안 지운다** — 확인하려다 남의 판을 날리면 안 된다.
//
// **배포 빌드에 없다.** 이 파일에 닿는 유일한 길이 `App`의 DEV 동적 import다.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CHECKPOINTS, type Checkpoint } from '../../engine/dev/checkpoints'
import { warpTo } from '../../app/devWarp'
import { useMenuStore } from '../../state/menuStore'
import { startNewGame } from '../../state/saveStore'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import * as css from '../menu/menuChrome.css'
import * as own from './devWarpScreen.css'

const SPOT_NOTE: Record<Checkpoint['spot']['kind'], string> = {
  warp: '워프 위',
  atWarp: '워프 앞',
  grass: '풀숲',
}

export function DevWarpScreen({ onClose }: { onClose: () => void }) {
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const inPlay = useLocation().pathname === '/play'
  const cp = CHECKPOINTS[Math.min(cursor, CHECKPOINTS.length - 1)]

  // 떠 있는 동안 메뉴 스택에 한 칸 올린다. 그림 때문이 아니라 **키** 때문이다 —
  // 스택이 비어 있지 않아야 필드 입력이 멈추고 X가 뒤에서 시작 메뉴를 열지 않는다
  useEffect(() => {
    useMenuStore.getState().push('devWarp')
    return () => { useMenuStore.getState().back() }
  }, [])

  const jump = (): void => {
    if (!cp || busy) return
    setBusy(true)
    void (async () => {
      // 타이틀에서 들어왔으면 판이 없다. 인트로 건너뛰기와 **같은 이름**으로
      // 새 판을 연다 — 늘 같은 값이라 여기서 시작한 판끼리 비교가 된다.
      // `resetSave`는 부르지 않는다: 그건 리포트를 디스크에서 지운다
      if (!inPlay) {
        const { introSkipChoice } = await import('../../engine/intro/skip')
        startNewGame(await introSkipChoice())
      }
      await warpTo(cp)
      onClose()
      if (!inPlay) navigate('/play')
    })().catch((e: unknown) => {
      console.error('확인 지점 실패', e)
      setBusy(false)
    })
  }

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, CHECKPOINTS.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, CHECKPOINTS.length)) },
    pageUp: () => { setCursor((c) => clampCursor(c, -5, CHECKPOINTS.length)) },
    pageDown: () => { setCursor((c) => clampCursor(c, 5, CHECKPOINTS.length)) },
    confirm: jump,
    cancel: onClose,
  })

  return (
    <div className={css.overlay}>
      <div className={css.header}>
        <span>확인 지점 <span className={own.badge}>시험용</span></span>
        <span className={css.headerNote}>{inPlay ? '이 판 위에서 옮긴다' : '새 판을 열고 간다'}</span>
      </div>
      <div className={css.body}>
        <div className={css.panel}>
          <div className={css.scroll}>
            {CHECKPOINTS.map((c, i) => (
              <div
                key={c.id}
                className={i === cursor ? css.rowOn : css.row}
                onPointerEnter={() => { setCursor(i) }}
                onClick={jump}
              >
                <span>{c.label}</span>
                <span className={own.rowNote}>#{c.map}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={css.panel}>
          <div className={css.detail}>
            {cp?.check}
            {cp && <div className={own.setup}>{describe(cp)}</div>}
          </div>
        </div>
      </div>
      <div className={css.footer}>
        ↑↓ 고르기 · Z 뛰어들기 · X 닫기 · ` 로 언제든 다시 연다
        {busy && ' — 가는 중…'}
      </div>
    </div>
  )
}

/** 이 지점이 채워 주는 조건. 안 적으면 왜 배틀이 열리는지 화면에서 알 수 없다 */
function describe(cp: Checkpoint) {
  const lines: [string, string][] = [['자리', `맵 ${cp.map} · ${SPOT_NOTE[cp.spot.kind]}`]]
  if (cp.party) {
    lines.push(['파티', cp.party.map((p) => `#${p.species} L${p.level}`).join(', ')
      + (cp.hurt ? ' (다쳐 있다)' : '')])
  }
  if (cp.items) lines.push(['가방', cp.items.map(([i, n]) => `#${i}×${n}`).join(', ')])
  if (cp.money !== undefined) lines.push(['소지금', `${cp.money}엔`])
  if (cp.badges !== undefined) lines.push(['배지', `0b${cp.badges.toString(2)}`])
  if (cp.battle) {
    lines.push(['배틀', cp.battle.kind === 'trainer'
      ? `트레이너 ${cp.battle.id}`
      : `야생 #${cp.battle.species} L${cp.battle.level}`])
  }
  return lines.map(([k, v]) => (
    <div key={k}><span className={own.setupKey}>{k}</span>{v}</div>
  ))
}
