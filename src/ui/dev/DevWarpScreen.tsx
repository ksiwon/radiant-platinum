// 확인 지점 화면 (백틱 `) — 시험용.
//
// 만든 것을 눈으로 봐야 할 때 처음부터 걸어갈 수는 없다. 여기서 고르면 그 자리에
// 서고, 확인에 필요한 조건(파티·가방·소지금)도 같이 채워진다.
//
// 타이틀에서 눌러도 되고 게임 중에 눌러도 된다. 타이틀에서 누르면 새 판을 열지만
// **리포트는 안 지운다** — 확인하려다 남의 판을 날리면 안 된다.
//
// ⚠️ **한 줄짜리 긴 목록이 아니다.** 지점이 쉰 개를 넘으면서 세로로 늘어놓은
// 것을 훑기가 힘들어졌다. 이야기 단계(`stageOf` — 배지 0~8 · 전당등록 전 ·
// 전당등록 이후)로 묶고 칸을 옆으로 채운다. 어디로 가는지·무엇을 볼지는
// **올려놓기만 하면** 오른쪽에 뜬다.
//
// **배포 빌드에 없다.** 이 파일에 닿는 유일한 길이 `App`의 DEV 동적 import다.
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CHECKPOINTS, stageOf, type Checkpoint } from '../../engine/dev/checkpoints'
import { warpTo } from '../../app/devWarp'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { startNewGame } from '../../state/saveStore'
import { useMenuKeys } from '../menu/useMenuKeys'
import { MenuScreen } from '../menu/MenuScreen'
import * as css from '../menu/menuChrome.css'
import * as own from './devWarpScreen.css'

const SPOT_NOTE: Record<Checkpoint['spot']['kind'], string> = {
  warp: '워프 위',
  atWarp: '워프 앞',
  grass: '풀숲',
}

/** 시각 → 원작 시간대 이름 (`map/timeOfDay`의 경계) */
function partOfDay(h: number): string {
  if (h <= 3) return '심야'
  if (h <= 9) return '아침'
  if (h <= 16) return '낮'
  if (h <= 19) return '해질녘'
  return '밤'
}

interface Group {
  key: string
  /** 이 묶음에 든 지점들. 값은 **표 전체에서의 번호**라 커서가 그대로 쓴다 */
  items: { at: number, cp: Checkpoint }[]
}

/** 표 순서를 지키면서 단계별로 묶는다 */
function groupAll(): Group[] {
  const out: Group[] = []
  CHECKPOINTS.forEach((cp, at) => {
    const key = stageOf(cp)
    const last = out[out.length - 1]
    if (last && last.key === key) last.items.push({ at, cp })
    else out.push({ key, items: [{ at, cp }] })
  })
  return out
}

export function DevWarpScreen({ onClose }: { onClose: () => void }) {
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const inPlay = useLocation().pathname === '/play'
  const groups = useMemo(groupAll, [])
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
        startNewGame(await introSkipChoice(gameLocale()))
      }
      await warpTo(cp)
      onClose()
      if (!inPlay) navigate('/play')
    })().catch((e: unknown) => {
      console.error('확인 지점 실패', e)
      setBusy(false)
    })
  }

  const step = (delta: number): void => {
    setCursor((c) => Math.min(CHECKPOINTS.length - 1, Math.max(0, c + delta)))
  }

  /**
   * ↑↓는 **묶음을 건너뛴다.**
   *
   * 칸이 옆으로 흐르므로 위아래로 한 칸씩 가는 것은 뜻이 흐릿하다. 대신
   * "다음 배지 단계로"가 여기서 제일 자주 하는 일이라 그것을 준다
   */
  const jumpGroup = (delta: number): void => {
    setCursor((c) => {
      const gi = groups.findIndex((g) => g.items.some((it) => it.at === c))
      const next = groups[Math.min(groups.length - 1, Math.max(0, gi + delta))]
      return next?.items[0]?.at ?? c
    })
  }

  useMenuKeys({
    left: () => { step(-1) },
    right: () => { step(1) },
    up: () => { jumpGroup(-1) },
    down: () => { jumpGroup(1) },
    pageUp: () => { jumpGroup(-1) },
    pageDown: () => { jumpGroup(1) },
    confirm: jump,
    cancel: onClose,
  })

  return (
    <MenuScreen
      title="확인 지점"
      tag={<span className={own.badge}>시험용</span>}
      note={inPlay ? '이 판 위에서 옮긴다' : '새 판을 열고 간다'}
      foot={<>
        ←→ 고르기 · ↑↓ 단계 넘기기 · Z 뛰어들기 · X 닫기 · ` 로 언제든 다시 연다
        {!inPlay && ' — 타이틀에서 열면 인트로를 건너뛰고 새 판으로 간다'}
        {busy && ' — 가는 중…'}
      </>}
    >
      <div className={css.stage}>
        <div className={own.groups}>
          {groups.map((g) => (
            <section key={g.key} className={own.group}>
              <h3 className={own.groupTitle}>
                {g.key}
                <span className={own.groupCount}>{g.items.length}</span>
              </h3>
              <div className={own.chips}>
                {g.items.map(({ at, cp: item }) => (
                  <button
                    key={item.id}
                    type="button"
                    className={at === cursor ? own.chipOn : own.chip}
                    // 올려놓기만 하면 오른쪽이 바뀐다 — 누르지 않아도 읽을 수 있다
                    onPointerEnter={() => { setCursor(at) }}
                    onFocus={() => { setCursor(at) }}
                    onClick={jump}
                  >
                    {item.label}
                    {/*
                      ⚠️ **그림 글자를 쓰지 않는다.** ⚔·☾을 썼더니 UI 폰트에
                      그 자리가 없어서 둘 다 네모 비슷한 것으로 떨어졌다 —
                      화면으로 확인하고서야 보였다. 짧은 말로 적는다
                    */}
                    {item.battle && <span className={own.chipMark}>전투</span>}
                    {item.hour !== undefined && (
                      <span className={own.chipMark}>{partOfDay(item.hour)}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className={css.detail}>
          {cp && (
            <>
              <div className={own.detailName}>{cp.label}</div>
              <div className={own.env}>{cp.env}</div>
              <div className={own.sectionTitle}>해 볼 것</div>
              <ul className={own.tryList}>
                {cp.try.map((line) => (
                  <li key={line} className={own.tryItem}>
                    <span className={own.tryMark} aria-hidden>●</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className={own.setup}>{describe(cp)}</div>
            </>
          )}
        </div>
      </div>
    </MenuScreen>
  )
}

/** 이 지점이 채워 주는 조건. 안 적으면 왜 배틀이 열리는지 화면에서 알 수 없다 */
function describe(cp: Checkpoint) {
  const lines: [string, string][] = [
    ['단계', stageOf(cp)],
    ['자리', `맵 ${cp.map} · ${SPOT_NOTE[cp.spot.kind]}`],
  ]
  // ⚠️ **빈 것은 줄을 안 만든다.** 새 판 지점은 파티도 가방도 비어 있는데
  // 이름표만 남으면 "값을 못 읽었다"로 보인다
  if (cp.party && cp.party.length > 0) {
    lines.push(['파티', cp.party.map((p) => `#${p.species} L${p.level}`).join(', ')
      + (cp.hurt ? ' (다쳐 있다)' : '')])
  }
  if (cp.items && cp.items.length > 0) {
    lines.push(['가방', cp.items.map(([i, n]) => `#${i}×${n}`).join(', ')])
  }
  if (cp.money !== undefined) lines.push(['소지금', `${cp.money}엔`])
  if (cp.badges !== undefined) lines.push(['배지', `0b${cp.badges.toString(2)}`])
  if (cp.dex) lines.push(['도감', '받은 뒤의 판 — 시작 메뉴에 도감이 뜬다'])
  if (cp.runningShoes) lines.push(['신발', '엄마가 준 뒤의 판 — Shift로 뛴다'])
  if (cp.hour !== undefined) lines.push(['시각', `${String(cp.hour)}시 (${partOfDay(cp.hour)})`])
  if (cp.battle) {
    lines.push(['배틀', cp.battle.kind === 'trainer'
      ? `트레이너 ${cp.battle.id}`
      : `야생 #${cp.battle.species} L${cp.battle.level}`])
  }
  return lines.map(([k, v]) => (
    <div key={k}><span className={own.setupKey}>{k}</span>{v}</div>
  ))
}
