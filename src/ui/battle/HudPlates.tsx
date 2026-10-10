// 배틀 체력판 — 상대·내 쪽 판과 파티 공 줄 (`BattleScreen`에서 꺼냈다. SYSTEM 4.15).
//
// 화면의 짜맞춤과 상태는 `BattleScreen`이, 명령 구역은 `CommandArea`가 맡는다. 이 파일은
// **판 그리기**만 한다 — 게이지 폭·색·숫자는 `hpDrain`의 훅 하나가 쓰고(`useDrain`),
// 그 자취를 `hpDrain.test`가 이 파일까지 읽어 잠근다.
//
// 판의 모양과 테두리(사다리꼴 두 겹 `clip-path`)는 `battleScreen.css`의 `card`가 쥔다. 무엇을 그릴지의 규칙
// (공 모양 · 도감 공 · 변화 줄)은 `hudShapes`다.
import { useEffect, useRef } from 'react'
import { seqStage } from '../../scene/battle/stageRefs'
import type { BattleView, ViewMon } from '../../engine/battle/view'
import type { KeyOwner } from '../../engine/battle/aftermath'
import type { RosterEntry } from '../../state/battleStore'
import { HP_VARS, STATUS_VARS } from '../theme/window.css'
import { STATUS_LABEL } from '../common/StatusTag'
import { benchStatusOf } from './benchStatus'
import { GAUGE_SLOTS, gaugeSlots } from './partyGauge'
import { shownColor, shownHp, useDrain, useSlide } from './hpDrain'
import type { BattleNames } from './messages'
import { ballShape, changeItems, showsCaughtMark, showsExp } from './hudShapes'
import * as css from './battleScreen.css'

/**
 * 한 쪽의 이름과 파티 공 (PARITY §2.2b · `PartyGaugeData_Fill`) — **판 위에 붙는 작은 창**이다.
 *
 * 공 하나가 파티의 한 칸이다. 모양이 넷으로 갈린다(`ballShape`) — 멀쩡한 공 · 귀퉁이에 상태 색 점이 붙은
 * 공 · 회색 공 · 점선 빈 칸. 기절은 **재생기가 보여 준 만큼만** 센다(`downKeys`) — 정본을 보면 쓰러지는
 * 연출보다 공이 먼저 꺼진다. `balls`가 거짓이면 이름만 둔다 (야생의 `foeName`)
 */
export function PartyGauge(
  { label, owners, roster, down, view, balls = true, mine = false, inset = true }: {
    label: string
    owners: readonly KeyOwner[]
    roster: Record<string, RosterEntry>
    down: readonly string[]
    view: BattleView | null
    balls?: boolean
    /** 내 쪽(오른쪽 묶음)이면 안쪽이 왼쪽이다 */
    mine?: boolean
    /** 판의 바깥 끝에서 12px 안쪽에 세운다 */
    inset?: boolean
  },
) {
  const keys = gaugeSlots(Object.keys(roster), owners)
  // ⚠️ **벤치도 본다** (`benchStatus`). 서 있는 네 자리만 보면 독에 걸린 채 물러난 마리가 공 줄에서 멀쩡한
  // 초록으로 돌아간다 — 원작은 파티 전원의 `STOCK_STATUS`를 쓴다
  const statusOf = (key: string): string | null => {
    for (const m of [view?.active.p1a, view?.active.p1b, view?.active.p2a, view?.active.p2b]) {
      if (m && m.key === key) return m.status === 'ok' ? null : m.status
    }
    return benchStatusOf(key)
  }
  const inside = inset ? (mine ? css.trayInsetMine : css.trayInset) : ''
  return (
    <div className={`${css.tray} ${inside}`}>
      <span className={css.trayName}>{label}</span>
      {balls && (
        <span className={css.trayBalls}>
          {Array.from({ length: GAUGE_SLOTS }, (_, i) => {
            const key = keys[i]
            const status = key === undefined ? null : statusOf(key)
            const shape = ballShape(key, down, status)
            return (
              <span
                key={i}
                className={css.gaugeBall[shape]}
                style={shape === 'status' && status !== null ? STATUS_VARS[status] : undefined}
                aria-label={shape}
              />
            )
          })}
        </span>
      )}
    </div>
  )
}

const GENDER_MARK: Record<string, { mark: string; cls: string }> = {
  male: { mark: '♂', cls: css.male },
  female: { mark: '♀', cls: css.female },
}

/**
 * BDSP 시퀀스가 체력판을 감추는 동안 감춘다 (`seqStage.gauge` — `GaugeDispAll visible=0` · 맞기 전 `GaugeDisp trg=1`로 맞는 쪽만 다시).
 * 원작 플래티나도 기술 연출 동안 체력판을 숨긴다(`BattleDisplay_GetAnimHideFlags`). 자리 · 미끄러짐은 `useSlide`가 쥐고 여기서는
 * `visibility`만 만진다 — 두 임자가 같은 속성을 다투지 않는다
 */
function useSeqGaugeHide(card: React.RefObject<HTMLDivElement | null>, slot: string): void {
  useEffect(() => {
    let raf = 0
    let hidden = false
    let touched: HTMLDivElement | null = null
    const tick = (): void => {
      const now = seqStage.gauge[slot] !== undefined
      const el = card.current
      if (el && now !== hidden) {
        hidden = now
        touched = el
        el.style.visibility = now ? 'hidden' : ''
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      if (touched) touched.style.visibility = ''
    }
  }, [card, slot])
}

/**
 * 체력판.
 *
 * ⚠️ **색은 비율이 아니라 픽셀 수가 정한다** (`engine/battle/healthbar`).
 * 원작은 게이지를 48픽셀로 먼저 줄이고 그 픽셀 수로 색을 고른다 — 79 중 16은
 * 비율로는 0.2025라 노랑이 되지만 픽셀로는 9라서 빨강이다.
 *
 * 상대 판에는 체력 숫자도 경험치 줄도 없다. 원작이 그렇게 정해 뒀다 —
 * `HEALTHBOX_INFO_NOT_ON_ENEMY = CURRENT_HP | MAX_HP | EXP_GAUGE`. 내 단식 판에는 둘 다 있고, **더블 내 판에는
 * EXP가 없다**(`healthbox.c:643`) — 숫자는 막대 옆 칸에 붙는다.
 *
 * 이름에 「야생」·「상대」를 안 붙인다 — 원작 체력판은 이름만이고, 그 말은 글창
 * 문장에만 붙는다. 붙이면 긴 이름이 판 폭을 밀어낸다.
 *
 * 판은 **미끄러져 들어오고 나간다** (`hpDrain`의 `useSlide` · `HealthBox_Scroll`) —
 * 등판 박자의 쉼이 끝난 뒤 들어오고, 쓰러지면 제 쪽 바깥으로 빠진다. 그 요소는 판을 감싼 겹이다 —
 * 판 자체는 `clip-path`로 잘려 그 밖에 서는 것(겨눈 삼각)이 못 선다
 */
export function MonCard(
  {
    mon, names, drainMs, nickname = null, showHp = false, caught = false, asking = false, aimed = false,
    doubles = false, inward = false, trainerSide = false,
  }: {
    mon: ViewMon; names: BattleNames | null; drainMs: number
    /** 그 마리의 별명 (`RosterEntry.nickname`). 원작 체력판은 별명을 쓴다 (`Healthbox_DrawPokemonName`) */
    nickname?: string | null
    showHp?: boolean
    /** 이미 잡아 본 종인가. **야생 상대 판에만** 공이 뜬다(`showsCaughtMark`) */
    caught?: boolean
    /** 더블에서 **지금 명령을 묻는** 내 쪽 판 — 금 테두리와 흔들림 */
    asking?: boolean
    /** 더블에서 **지금 겨눠지는** 상대 판 — 금 테두리와 왼쪽 삼각 */
    aimed?: boolean
    doubles?: boolean
    /** 더블의 첫 칸 — 안쪽으로 12px */
    inward?: boolean
    trainerSide?: boolean
  },
) {
  // ⚠️ **변신해도 이름은 제 것이다** (`baseSpecies`). 뷰의 `species`는 따라 한 쪽의 종이라
  // 그대로 쓰면 메타몽 판이 「꼬마돌」로 바뀐다 — 원작 체력판은 제 별명을 그대로 둔다
  const own = mon.baseSpecies ?? mon.species
  const name = nickname ?? (own !== null ? names?.species[own] : null) ?? mon.speciesName
  const ratio = mon.maxHp > 0 ? Math.max(0, Math.min(mon.hp, mon.maxHp)) / mon.maxHp : 0
  const maxHp = mon.maxHp
  const hpNow = useRef<HTMLSpanElement>(null)
  // ⚠️ **게이지는 CSS 전환이 아니라 연출 시계가 민다** (`hpDrain`). CSS는 벽시계라
  // 탭을 숨겨도, 프레임이 1초로 늘어져도 저 혼자 흐른다 — 재생기가 서 있는데
  // 체력만 마저 줄었다.
  //
  // ⚠️ **폭·숫자·색이 한 값을 본다.** 숫자를 목표 체력으로 찍으면 맞자마자 끝값이 되고,
  // 색을 목표 체력으로 고르면 바가 아직 초록 길이인데 빨강이 된다 — 원작은 게이지가 한
  // 칸씩 움직일 때 숫자도 같이 내려가고(`HealthBox_DrawCurrentHP`) 색은 보이는 픽셀
  // 수로 고른다(`App_BarColor`)
  const bar = useDrain(ratio, drainMs, (shown) => {
    const fill = bar.current
    if (fill) {
      const color = shownColor(shown, maxHp)
      if (fill.dataset.hp !== color) {
        fill.dataset.hp = color
        const tone = HP_VARS[color]
        if (tone) {
          fill.style.setProperty('--lit', tone['--lit'])
          fill.style.setProperty('--body', tone['--body'])
        }
      }
    }
    if (hpNow.current) hpNow.current.textContent = String(shownHp(shown, maxHp))
  })
  const wrap = useSlide(mon.presence !== 'down', drainMs, mon.slot, showHp ? 1 : -1)
  useSeqGaugeHide(wrap, mon.slot)
  const exp = expOf(mon)
  const gender = GENDER_MARK[mon.gender]
  const withExp = showsExp(showHp, doubles)
  const wrapClass = [
    css.plateWrap,
    asking ? css.asking : '',
    aimed ? css.aimed : '',
    inward ? (showHp ? css.inwardMine : css.inwardFoe) : '',
  ].filter(Boolean).join(' ')
  const cardClass = [
    css.card,
    showHp ? css.cardMine : css.cardFoe,
    showHp ? (doubles ? css.cardDouble : css.cardTall) : '',
  ].filter(Boolean).join(' ')
  const changes = changeItems(mon, names)
  return (
    <div ref={wrap} className={wrapClass} data-aimed={aimed ? '' : undefined}>
      {aimed && <span className={css.aimCaret} aria-hidden />}
      {/* 판 뿌리는 이 요소 하나다 — 하네스가 `cardFoe` · `cardMine`으로 찾는다 */}
      <div className={cardClass}>
        <div className={css.cardHead}>
          <span className={css.monName}>{name}</span>
          {gender && <span className={`${css.genderMark} ${gender.cls}`}>{gender.mark}</span>}
          {/* 브라우저 기본 말풍선(`title`)은 웹 페이지 티가 난다. 읽어 주는 이름만 둔다 */}
          {showsCaughtMark(trainerSide, caught) && !showHp
            && <span className={css.caughtMark} role="img" aria-label="도감에 등록된 포켓몬" />}
          <span className={css.monLevel}>
            <span className={css.monLevelTag}>Lv</span>{mon.level}
          </span>
        </div>
        <div className={css.barRow}>
          {/* 상태 딱지가 「HP」 글자 자리를 대신한다 (`healthbox.c:703-723`) */}
          {mon.status !== 'ok'
            ? (
              <span className={css.hpHome}>
                <span className={css.statusTag} style={STATUS_VARS[mon.status]}>
                  {STATUS_LABEL[mon.status] ?? mon.status}
                </span>
              </span>
            )
            : <span className={css.hpTag}>HP</span>}
          <div className={showHp && !doubles ? `${css.barTrack} ${css.barTrackTall}` : css.barTrack}>
            {/* ⚠️ 폭과 색은 style로 안 준다 — `useDrain`만 쓴다 (두 임자가 다투면 튕긴다) */}
            <div ref={bar} className={css.barFill} />
          </div>
          {showHp && doubles && <HpNumbers hpNow={hpNow} max={mon.maxHp} inline />}
        </div>
        {showHp && !doubles && <HpNumbers hpNow={hpNow} max={mon.maxHp} />}
        {withExp && exp !== null && <ExpLine progress={exp} level={mon.level} drainMs={drainMs} />}
        {changes.length > 0 && (
          <div className={css.changeRow}>
            {changes.map((c) => (
              <span
                key={c.key}
                className={`${css.changeItem} ${c.dir === 'up' ? css.changeUp : c.dir === 'down' ? css.changeDown : ''}`}
              >
                {c.text}
                {c.dir !== null && (
                  <>
                    <i className={c.dir === 'up' ? css.triUp : css.triDown} aria-hidden />
                    {c.amount}
                  </>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// `{현재} / {최대}` — 하네스가 슬래시 앞뒤의 두 수를 읽는다. 앞뒤 공백까지 이 꼴이다
function HpNumbers(
  { hpNow, max, inline = false }: { hpNow: React.RefObject<HTMLSpanElement | null>; max: number; inline?: boolean },
) {
  return (
    <div className={inline ? `${css.hpText} ${css.hpTextInline}` : css.hpText}>
      {/* 숫자도 훅이 쓴다 — 게이지와 같은 프레임에 같은 값으로 내려간다 */}
      <span ref={hpNow} className={inline ? `${css.hpNow} ${css.hpNowInline}` : css.hpNow} /> / {max}
    </div>
  )
}

/**
 * 사파리의 볼 판 — 내 판 자리에 선다. 사파리에는 내 판이 없고 볼 개수만 있다 (`healthbox.c:624-659`).
 * 글은 시작 메뉴 뱅크(367)의 9번 「사파리볼」과 11번 「{N}개 남음」이다. 뱅크가 안 왔으면 그리지 않는다
 */
export function SafariPlate({ label, count }: { label: string | null; count: string | null }) {
  if (label === null || count === null) return null
  return (
    <div className={css.plateWrap}>
      <div className={css.safariPlate}>
        <span className={css.safariLabel}>{label}</span>
        <span className={css.safariCount}>{count}</span>
      </div>
    </div>
  )
}

/**
 * 그 마리의 경험치 진행도 (0~1). 내 쪽에만 있다 (`ViewMon.expProgress` · `engine/pokemon/exp`의
 * `levelProgress`). 뷰가 안 실어 왔으면 null — 줄을 안 그린다
 */
function expOf(mon: ViewMon): number | null {
  const at = mon.expProgress
  return typeof at === 'number' && Number.isFinite(at) ? Math.max(0, Math.min(1, at)) : null
}

/**
 * 내 체력판의 경험치 줄 (`Healthbox_DrawExpBar`).
 *
 * HP 게이지와 **같은 시계**로 찬다 — 박자의 게이지 길이(`drainMs`) 동안이다. 레벨을
 * 넘으면 1까지 찬 뒤 **빈 게이지에서** 남은 몫을 다시 채운다 (`useDrain`의 `epoch`) —
 * 보이던 값에서 이으면 게이지가 거꾸로 줄어든다. 소리는 `BattleSound`가 같은 길이로 끊는다
 */
function ExpLine({ progress, level, drainMs }: { progress: number; level: number; drainMs: number }) {
  const fill = useDrain(progress, drainMs, undefined, level)
  return (
    <div className={css.expRow}>
      <span className={css.expTag}>EXP</span>
      <div className={css.expTrack}>
        <div ref={fill} className={css.expFill} />
      </div>
    </div>
  )
}
