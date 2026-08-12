// 포켓치 앱 스물다섯 (PARITY §7.3)
//
// 앱 하나가 컴포넌트 하나다. 전부 같은 인자를 받는다:
//
//   `nav`   커서 자리와 「눌렀다」 횟수. 크게 펼쳤을 때만 움직인다
//   `large` 크게 펼쳤는가 — 작을 때는 **보여 주기만** 한다
//
// ⚠️ **작게 놓였을 때 조작이 없는 것이 요점이다.** BDSP도 구석에 접힌 시계는
// 눈으로 보는 것이고, R로 키워야 손을 댄다. 접힌 채로 계산기를 두드릴 수
// 있게 만들면 걸어 다니는 키와 부딪친다.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadHiddenItems, loadLabels, loadSpecies, loadSpeciesNames, type SpeciesLookup,
} from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { typeMultiplier } from '../../engine/battle/ai/typeChart'
import { BG_EVENT_TYPE, signsOf, world } from '../../engine/map/world'
import { fieldScripts, HIDDEN_ITEM_FLAG_BASE, HIDDEN_ITEM_SCRIPT_BASE } from '../../engine/script/field'
import { statsOf } from '../../engine/pokemon/instance'
import {
  DOTART_HEIGHT, DOTART_WIDTH, MOVE_TESTER_TYPE_ORDER, POKETCH_COLOR_COUNT,
  POKETCH_MARKER_COUNT, POKETCH_PALETTE, PoketchApp, dotArtGet, dotArtSet, dowsingInRange,
  applyCalcKey, CALC_KEYS, friendshipTier, modifyDotArt, moveTesterExclamations, setMarker,
  setScreenColor, type CalcState,
} from '../../engine/world/poketch'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { worldState } from '../../state/worldState'
import { usePoketchMemory } from './usePoketchMemory'
import * as css from './poketch.css'

export interface Nav {
  /** 커서 자리. 앱마다 뜻이 다르다 */
  x: number
  y: number
  /** Z를 누른 횟수. 앱은 이 수가 늘 때 한 번 움직인다 */
  press: number
  /** 크게 펼쳤는가 */
  large: boolean
}

/** Z가 눌린 그 프레임에 한 번만 부른다 */
function useOnPress(press: number, fn: () => void): void {
  const last = useRef(press)
  useEffect(() => {
    if (press === last.current) return
    last.current = press
    fn()
    // fn은 매 렌더 새로 오지만 `press`가 바뀔 때만 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [press])
}

/** 60분의 1초까지 도는 시계. 스톱워치·타이머가 쓴다 */
function useTicker(active: boolean, ms = 100): number {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => { bump((n) => n + 1) }, ms)
    return () => { clearInterval(id) }
  }, [active, ms])
  return 0
}

const pad2 = (n: number): string => String(Math.floor(n)).padStart(2, '0')

/** 게임 시각을 시·분으로. `gameHour`는 소수 시간이다 */
function gameClock(): { hour: number; minute: number } {
  const h = worldState.time.gameHour
  return { hour: Math.floor(h) % 24, minute: Math.floor((h % 1) * 60) }
}

// ── 시계 셋 ──────────────────────────────────────────────────────────────────

export function DigitalWatch() {
  useTicker(true, 1000)
  const { hour, minute } = gameClock()
  return (
    <div className={css.center}>
      <div className={css.hugeNumber}>{pad2(hour)}:{pad2(minute)}</div>
    </div>
  )
}

export function AnalogWatch({ large }: Nav) {
  useTicker(true, 1000)
  const { hour, minute } = gameClock()
  const size = large ? 130 : 70
  const hand = (deg: number, len: number, w: number) => (
    <span
      className={css.hand}
      style={{
        width: w, height: len, marginLeft: -w / 2,
        transform: `rotate(${String(deg)}deg)`,
      }}
    />
  )
  return (
    <div className={css.center}>
      <div className={css.dial} style={{ width: size, height: size }}>
        {/* 시침은 분까지 보고 움직인다 — 정각에만 뛰면 시계가 아니다 */}
        {hand(((hour % 12) + minute / 60) * 30, size * 0.26, 3)}
        {hand(minute * 6, size * 0.38, 2)}
      </div>
    </div>
  )
}

/**
 * 알람 (`alarm_clock`). 크게 펼치면 시·분을 맞춘다.
 *
 * ⚠️ **맞춘 시각은 리포트에 남는다** — 원작이 `Poketch` 구조체에 넣어 두었다
 */
export function AlarmClock({ x, press, large }: Nav) {
  const poketch = useSaveStore((s) => s.poketch)
  useTicker(true, 1000)
  const { hour, minute } = gameClock()
  const ringing = poketch.alarm.set
    && poketch.alarm.hour === hour && poketch.alarm.minute === minute

  useOnPress(press, () => {
    if (!large) return
    const set = useSaveStore.getState().poketch
    const next = { ...set.alarm }
    if (x === 0) next.hour = (next.hour + 1) % 24
    else if (x === 1) next.minute = (next.minute + 1) % 60
    else next.set = !next.set
    useSaveStore.setState({ poketch: { ...set, alarm: next } })
  })

  return (
    <div className={css.center}>
      <div className={css.small}>{ringing ? '⏰ 알람!' : poketch.alarm.set ? '켜짐' : '꺼짐'}</div>
      <div className={css.bigNumber}>
        <span style={{ outline: large && x === 0 ? '1px solid currentColor' : 'none' }}>
          {pad2(poketch.alarm.hour)}
        </span>
        :
        <span style={{ outline: large && x === 1 ? '1px solid currentColor' : 'none' }}>
          {pad2(poketch.alarm.minute)}
        </span>
      </div>
      {large && (
        <div className={css.small} style={{ outline: x === 2 ? '1px solid currentColor' : 'none' }}>
          {poketch.alarm.set ? '끈다' : '켠다'}
        </div>
      )}
    </div>
  )
}

/** 스톱워치. 실제 시간으로 돈다 — 게임 시계가 아니다 */
export function Stopwatch({ press, large }: Nav) {
  const [state, setState] = usePoketchMemory<{ running: boolean; base: number; acc: number }>(
    PoketchApp.STOPWATCH, { running: false, base: 0, acc: 0 },
  )
  useTicker(state.running, 50)
  useOnPress(press, () => {
    if (!large) return
    if (state.running) setState({ running: false, base: 0, acc: state.acc + (Date.now() - state.base) })
    else setState({ running: true, base: Date.now(), acc: state.acc })
  })
  const ms = state.acc + (state.running ? Date.now() - state.base : 0)
  return (
    <div className={css.center}>
      <div className={css.bigNumber}>
        {pad2(ms / 60000)}:{pad2((ms / 1000) % 60)}
        <span className={css.small}>.{pad2((ms % 1000) / 10)}</span>
      </div>
      {large && <div className={css.small}>{state.running ? 'Z 멈춘다' : 'Z 잰다'}</div>}
    </div>
  )
}

/** 키친타이머. 위아래로 분을 맞추고 Z로 센다 */
export function KitchenTimer({ y, press, large }: Nav) {
  const [state, setState] = usePoketchMemory<{ minutes: number; until: number | null }>(
    PoketchApp.KITCHEN_TIMER, { minutes: 3, until: null },
  )
  useTicker(state.until !== null, 200)
  useOnPress(press, () => {
    if (!large) return
    if (state.until !== null) setState({ minutes: state.minutes, until: null })
    else setState({ minutes: state.minutes, until: Date.now() + state.minutes * 60_000 })
  })
  // 위아래 커서가 분을 정한다. 크게 펼쳤을 때만 움직인다
  const minutes = state.until === null && large
    ? Math.max(1, Math.min(60, state.minutes - y))
    : state.minutes
  const left = state.until === null ? minutes * 60_000 : Math.max(0, state.until - Date.now())
  const done = state.until !== null && left === 0
  return (
    <div className={css.center}>
      <div className={css.bigNumber}>{pad2(left / 60000)}:{pad2((left / 1000) % 60)}</div>
      <div className={css.small}>{done ? '⏰ 끝!' : state.until !== null ? '재는 중' : '↑↓ 분 · Z 시작'}</div>
    </div>
  )
}

// ── 숫자 넷 ──────────────────────────────────────────────────────────────────

/** 계산기. 4×4 자판을 방향키로 짚고 Z로 누른다 */
export function Calculator({ x, y, press, large }: Nav) {
  const [state, setState] = usePoketchMemory<CalcState>(
    PoketchApp.CALCULATOR, { shown: '0', acc: null, op: null, fresh: true },
  )
  const at = ((y % 4) + 4) % 4 * 4 + ((x % 4) + 4) % 4

  useOnPress(press, () => {
    if (!large) return
    setState(applyCalcKey(state, CALC_KEYS[at] ?? '0'))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4 }}>
      <div className={css.bigNumber} style={{ textAlign: 'right', fontSize: large ? 22 : 18 }}>
        {state.shown.slice(0, 12)}
      </div>
      {large && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, fontSize: 12 }}>
          {CALC_KEYS.map((key, i) => (
            <span
              key={key}
              style={{
                textAlign: 'center',
                outline: i === at ? '1px solid currentColor' : 'none',
                opacity: i === at ? 1 : 0.75,
              }}
            >
              {key}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** 카운터. Z로 하나씩 올리고 아래쪽 버튼으로 0으로 되돌린다 */
export function Counter({ y, press, large }: Nav) {
  const [count, setCount] = usePoketchMemory<number>(PoketchApp.COUNTER, 0)
  useOnPress(press, () => {
    if (!large) return
    setCount(y === 1 ? 0 : Math.min(9999, count + 1))
  })
  return (
    <div className={css.center}>
      <div className={css.hugeNumber}>{String(count).padStart(4, '0')}</div>
      {large && (
        <div className={css.small}>
          <span style={{ outline: y !== 1 ? '1px solid currentColor' : 'none' }}>+1</span>
          {'  '}
          <span style={{ outline: y === 1 ? '1px solid currentColor' : 'none' }}>0으로</span>
        </div>
      )}
    </div>
  )
}

/** 만보기. 걸음은 세이브에 쌓인다 */
export function Pedometer({ y, press, large }: Nav) {
  const steps = useSaveStore((s) => s.poketch.stepCount)
  useOnPress(press, () => {
    if (!large || y !== 1) return
    const p = useSaveStore.getState().poketch
    useSaveStore.setState({ poketch: { ...p, stepCount: 0 } })
  })
  return (
    <div className={css.center}>
      <div className={css.hugeNumber}>{String(steps % 100000).padStart(5, '0')}</div>
      <div className={css.small}>걸음</div>
      {large && (
        <div className={css.small} style={{ outline: y === 1 ? '1px solid currentColor' : 'none' }}>
          0으로
        </div>
      )}
    </div>
  )
}

/** 동전던지기. 잉어킹 동전을 던진다 */
export function CoinToss({ press, large }: Nav) {
  const [heads, setHeads] = usePoketchMemory<boolean>(PoketchApp.COIN_TOSS, true)
  useOnPress(press, () => { if (large) setHeads(Math.random() < 0.5) })
  return (
    <div className={css.center}>
      <div className={css.hugeNumber}>{heads ? '앞' : '뒤'}</div>
      {large && <div className={css.small}>Z 던진다</div>}
    </div>
  )
}

// ── 파티를 보는 셋 ───────────────────────────────────────────────────────────

function useSpeciesNames(): { names: string[]; maxHp: (i: number) => number } {
  const party = useSaveStore((s) => s.party)
  const [names, setNames] = useState<string[]>([])
  const [table, setTable] = useState<SpeciesLookup | null>(null)
  useEffect(() => {
    let live = true
    void Promise.all([loadSpeciesNames(gameLocale()), loadSpecies()]).then(([n, t]) => {
      if (live) { setNames(n); setTable(t) }
    }).catch(() => { /* 이름 없이도 막대는 뜬다 */ })
    return () => { live = false }
  }, [])
  return {
    names,
    maxHp: (i) => {
      const mon = party[i]
      if (!mon || !table) return Math.max(1, mon?.hp ?? 1)
      return statsOf(mon, table.of(mon)).hp
    },
  }
}

/** 포켓몬리스트 — 이름과 체력 막대 */
export function PartyStatus({ large }: Nav) {
  const party = useSaveStore((s) => s.party)
  const { names, maxHp } = useSpeciesNames()
  if (!party.length) return <div className={css.missing}>포켓몬이 없다</div>
  return (
    <div className={css.rows}>
      {party.map((mon, i) => {
        const max = maxHp(i)
        return (
          <div key={i} className={css.row}>
            <span className={css.name}>{mon.nickname ?? names[mon.species] ?? `#${String(mon.species)}`}</span>
            {large && <span className={css.small}>{mon.hp}/{max}</span>}
            <span className={css.bar}>
              <span className={css.barFill} style={{ width: `${String(Math.max(0, Math.min(100, (mon.hp / max) * 100)))}%` }} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** 친밀도체커 — 하트 0~6 */
export function FriendshipChecker() {
  const party = useSaveStore((s) => s.party)
  const { names } = useSpeciesNames()
  if (!party.length) return <div className={css.missing}>포켓몬이 없다</div>
  return (
    <div className={css.rows}>
      {party.map((mon, i) => (
        <div key={i} className={css.row}>
          <span className={css.name}>{mon.nickname ?? names[mon.species] ?? `#${String(mon.species)}`}</span>
          <span className={css.hearts}>
            {/* 알은 친밀도 칸을 **남은 걸음**으로 쓴다. 하트를 그리면 거짓말이 된다 */}
            {mon.isEgg ? '—' : '♥'.repeat(friendshipTier(mon.friendship)) || '·'}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 상성체커 — 파티가 든 타입과 상대 타입을 맞대 본다 */
export function MatchupChecker({ x, large }: Nav) {
  const party = useSaveStore((s) => s.party)
  const [table, setTable] = useState<SpeciesLookup | null>(null)
  const [types, setTypes] = useState<readonly string[]>([])
  useEffect(() => {
    let live = true
    void Promise.all([loadSpecies(), loadLabels(gameLocale())]).then(([t, labels]) => {
      if (live) { setTable(t); setTypes(labels.types) }
    }).catch(() => { /* 타입 이름 없이도 수는 뜬다 */ })
    return () => { live = false }
  }, [])
  const foe = MOVE_TESTER_TYPE_ORDER[((x % MOVE_TESTER_TYPE_ORDER.length) + MOVE_TESTER_TYPE_ORDER.length) % MOVE_TESTER_TYPE_ORDER.length] ?? 0
  if (!party.length || !table) return <div className={css.missing}>포켓몬이 없다</div>
  return (
    <div className={css.rows}>
      <div className={css.row}>
        <span className={css.name}>상대 {types[foe] ?? `#${String(foe)}`}</span>
        {large && <span className={css.small}>←→ 타입</span>}
      </div>
      {party.map((mon, i) => {
        const sp = table.of(mon)
        // 상대 타입의 기술이 이 마리에게 얼마나 먹히는가
        const mul = typeMultiplier(foe, sp.types[0] ?? 0)
          * (sp.types[1] === sp.types[0] ? 1 : typeMultiplier(foe, sp.types[1] ?? 0))
        return (
          <div key={i} className={css.row}>
            <span className={css.name}>{mon.nickname ?? `#${String(mon.species)}`}</span>
            <span className={css.small}>×{mul}</span>
          </div>
        )
      })}
    </div>
  )
}

/** 키우미집체커 — 맡긴 둘과 알 */
export function DaycareChecker() {
  const daycare = useSaveStore((s) => s.daycare)
  const { names } = useSpeciesNames()
  const slots = daycare.slots.filter((s) => s !== null)
  if (!slots.length) return <div className={css.missing}>맡긴 포켓몬이 없다</div>
  return (
    <div className={css.rows}>
      {daycare.slots.map((slot, i) => (
        <div key={i} className={css.row}>
          <span className={css.name}>
            {slot ? (slot.mon.nickname ?? names[slot.mon.species] ?? `#${String(slot.mon.species)}`) : '—'}
          </span>
          {slot && <span className={css.small}>Lv.{slot.mon.level}</span>}
        </div>
      ))}
      <div className={css.row}>
        <span className={css.name}>알</span>
        <span className={css.small}>{daycare.eggPid !== 0 ? '있다!' : '없다'}</span>
      </div>
    </div>
  )
}

/** 포켓몬히스토리 — 손에 넣은 열둘 */
export function PokemonHistory() {
  const history = useSaveStore((s) => s.poketch.history)
  const { names } = useSpeciesNames()
  if (!history.length) return <div className={css.missing}>아직 없다</div>
  return (
    <div className={css.rows} style={{ fontSize: 10 }}>
      {[...history].reverse().map((h, i) => (
        <div key={i} className={css.row}>
          <span className={css.name}>{names[h.species] ?? `#${String(h.species)}`}</span>
        </div>
      ))}
    </div>
  )
}

// ── 기술효과체커 ─────────────────────────────────────────────────────────────

export function MoveTester({ x, y, large }: Nav) {
  const [types, setTypes] = useState<readonly string[]>([])
  const [says, setSays] = useState<readonly string[]>([])
  useEffect(() => {
    let live = true
    void Promise.all([loadLabels(gameLocale()), loadUiText('poketchMoveTester')])
      .then(([labels, lines]) => { if (live) { setTypes(labels.types); setSays(lines) } })
      .catch(() => { /* 이름이 없어도 느낌표는 센다 */ })
    return () => { live = false }
  }, [])
  const n = MOVE_TESTER_TYPE_ORDER.length
  const attack = MOVE_TESTER_TYPE_ORDER[((x % n) + n) % n] ?? 0
  const defend = MOVE_TESTER_TYPE_ORDER[((y % n) + n) % n] ?? 0
  const count = moveTesterExclamations(typeMultiplier, attack, defend, null)
  return (
    <div className={css.center}>
      <div className={css.small}>{types[attack] ?? '?'} → {types[defend] ?? '?'}</div>
      <div className={css.bigNumber} style={{ fontSize: 20 }}>{'!'.repeat(count) || '×'}</div>
      <div className={css.small}>{says[count] ?? ''}</div>
      {large && <div className={css.small}>←→ 기술 · ↑↓ 상대</div>}
    </div>
  )
}

// ── 그리는 셋 ────────────────────────────────────────────────────────────────

/** 메모용지 — 24×20 두 색. 앱을 넘기면 사라진다 */
export function MemoPad({ x, y, press, large }: Nav) {
  const [data, setData] = usePoketchMemory<Uint8Array>(
    PoketchApp.MEMO_PAD, new Uint8Array(DOTART_WIDTH * DOTART_HEIGHT),
  )
  const cx = ((x % DOTART_WIDTH) + DOTART_WIDTH) % DOTART_WIDTH
  const cy = ((y % DOTART_HEIGHT) + DOTART_HEIGHT) % DOTART_HEIGHT
  useOnPress(press, () => {
    if (!large) return
    const next = Uint8Array.from(data)
    const at = cy * DOTART_WIDTH + cx
    next[at] = next[at] ? 0 : 1
    setData(next)
  })
  return <DotGrid read={(px, py) => (data[py * DOTART_WIDTH + px] ? 3 : 0)} cx={large ? cx : -1} cy={cy} large={large} />
}

/** 도트아트 — 밝기 넷. **이것만 리포트에 남는다** */
export function DotArtist({ x, y, press, large }: Nav) {
  const poketch = useSaveStore((s) => s.poketch)
  const cx = ((x % DOTART_WIDTH) + DOTART_WIDTH) % DOTART_WIDTH
  const cy = ((y % DOTART_HEIGHT) + DOTART_HEIGHT) % DOTART_HEIGHT
  useOnPress(press, () => {
    if (!large) return
    const p = useSaveStore.getState().poketch
    const value = (dotArtGet(p.dotArt, cx, cy) + 1) & 3
    useSaveStore.setState({ poketch: modifyDotArt(p, dotArtSet(p.dotArt, cx, cy, value)) })
  })
  return <DotGrid read={(px, py) => dotArtGet(poketch.dotArt, px, py)} cx={large ? cx : -1} cy={cy} large={large} />
}

/**
 * 룰렛 — 그린 원반 위로 바늘이 돈다.
 *
 * ⚠️ **원작도 원반을 손으로 그린다** (`RouletteData.pixels`). 칸을 미리
 * 나눠 주지 않는다 — 몇 등분으로 쓸지는 그리는 사람이 정한다
 */
export function Roulette({ x, y, press, large }: Nav) {
  const [state, setState] = usePoketchMemory<{ pixels: Uint8Array; angle: number; spinning: boolean }>(
    PoketchApp.ROULETTE, { pixels: new Uint8Array(DOTART_WIDTH * DOTART_HEIGHT), angle: 0, spinning: false },
  )
  useTicker(state.spinning, 40)
  const cx = ((x % DOTART_WIDTH) + DOTART_WIDTH) % DOTART_WIDTH
  const cy = ((y % DOTART_HEIGHT) + DOTART_HEIGHT) % DOTART_HEIGHT
  useOnPress(press, () => {
    if (!large) return
    if (state.spinning) {
      setState({ ...state, spinning: false, angle: Math.floor(Math.random() * 360) })
      return
    }
    const pixels = Uint8Array.from(state.pixels)
    const at = cy * DOTART_WIDTH + cx
    pixels[at] = pixels[at] ? 0 : 1
    setState({ ...state, pixels })
  })
  const angle = state.spinning ? (Date.now() / 3) % 360 : state.angle
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <DotGrid read={(px, py) => (state.pixels[py * DOTART_WIDTH + px] ? 3 : 0)} cx={large ? cx : -1} cy={cy} large={large} />
      <span
        className={css.hand}
        style={{
          left: '50%', bottom: '50%', width: 2, height: large ? 60 : 30,
          transform: `rotate(${String(angle)}deg)`, marginLeft: -1,
        }}
      />
    </div>
  )
}

function DotGrid(
  { read, cx, cy, large }: {
    read: (x: number, y: number) => number
    cx: number
    cy: number
    large: boolean
  },
) {
  const px = large ? 7 : 4
  const cells = useMemo(() => {
    const out: { key: string; x: number; y: number; v: number }[] = []
    for (let y = 0; y < DOTART_HEIGHT; y++) {
      for (let x = 0; x < DOTART_WIDTH; x++) out.push({ key: `${String(x)}/${String(y)}`, x, y, v: read(x, y) })
    }
    return out
  }, [read])
  return (
    <div
      className={css.grid}
      style={{ gridTemplateColumns: `repeat(${String(DOTART_WIDTH)}, ${String(px)}px)` }}
    >
      {cells.map((c) => (
        <span
          key={c.key}
          className={css.cell}
          style={{
            height: px,
            opacity: c.v / 3,
            outline: c.x === cx && c.y === cy ? '1px solid currentColor' : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ── 지도 둘 ──────────────────────────────────────────────────────────────────

/**
 * 마킹맵 — 신오 지도 위에 표식 여섯.
 *
 * 지금 서 있는 자리는 빈 동그라미로, 찍어 둔 표식은 채운 점으로 그린다
 */
export function MarkingMap({ x, y, press, large }: Nav) {
  const poketch = useSaveStore((s) => s.poketch)
  const at = ((x % POKETCH_MARKER_COUNT) + POKETCH_MARKER_COUNT) % POKETCH_MARKER_COUNT
  useOnPress(press, () => {
    if (!large) return
    // 커서가 가리키는 표식을 **지금 서 있는 자리**로 옮긴다. 원작은 터치로
    // 끌어다 놓는데 우리는 키보드라, "여기에 꽂는다"가 같은 일을 한다
    const p = useSaveStore.getState().poketch
    const px = Math.round((worldState.player.position.x / 960) * 255)
    const pz = Math.round((worldState.player.position.z / 960) * 255)
    useSaveStore.setState({ poketch: setMarker(p, at, px, pz) })
  })
  const size = large ? 150 : 80
  const here = {
    x: (worldState.player.position.x / 960) * size,
    y: (worldState.player.position.z / 960) * size,
  }
  return (
    <div className={css.center}>
      <div style={{ position: 'relative', width: size, height: size, border: '1px solid currentColor' }}>
        <span className={css.here} style={{ left: here.x, top: here.y }} />
        {poketch.markers.map((m, i) => (
          <span
            key={i}
            className={css.marker}
            style={{
              left: (m.x / 255) * size,
              top: (m.y / 255) * size,
              outline: large && i === at ? '1px solid currentColor' : 'none',
            }}
          />
        ))}
      </div>
      {large && <div className={css.small}>←→ 표식 {at + 1} · Z 여기에 꽂는다 · {y === 0 ? '' : ''}</div>}
    </div>
  )
}

/**
 * 다우징머신 — 앞뒤 열다섯 칸 안의 **아직 안 주운** 숨은 도구.
 *
 * ⚠️ **원작은 터치한 자리 둘레를 훑는다.** 우리는 손가락이 없어서 주인공을
 * 가운데 두고 그 창을 통째로 보여 준다 — 잡히는 도구는 같고, 찍어 보는
 * 손짓만 없다. 탐지 반경(0·1·2)은 점 크기로 남긴다
 */
export function DowsingMachine({ large }: Nav) {
  const [ranges, setRanges] = useState<Map<number, { range: number }> | null>(null)
  useEffect(() => {
    let live = true
    void loadHiddenItems().then((t) => { if (live) setRanges(t) })
      .catch(() => { /* 반경을 모르면 점 크기만 같아진다 */ })
    return () => { live = false }
  }, [])
  const px = Math.floor(worldState.player.position.x)
  const pz = Math.floor(worldState.player.position.z)
  const found = signsOf(world.mapId)
    .filter((s) => s.type === BG_EVENT_TYPE.hiddenItem)
    .filter((s) => !fieldScripts.vars.checkFlag(
      HIDDEN_ITEM_FLAG_BASE + (s.script - HIDDEN_ITEM_SCRIPT_BASE)))
    .map((s) => ({ dx: s.x - px, dz: s.z - pz, script: s.script - HIDDEN_ITEM_SCRIPT_BASE }))
    .filter((s) => dowsingInRange(s.dx, s.dz))

  const cell = large ? 11 : 6
  return (
    <div className={css.center}>
      <div style={{ position: 'relative', width: cell * 15, height: cell * 14, border: '1px solid currentColor' }}>
        <span className={css.here} style={{ left: cell * 7.5, top: cell * 7.5 }} />
        {found.map((f, i) => {
          const r = ranges?.get(f.script)?.range ?? 2
          const size = 3 + r * 2
          return (
            <span
              key={i}
              className={css.marker}
              style={{
                left: cell * (f.dx + 7.5), top: cell * (f.dz + 7.5),
                width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
              }}
            />
          )
        })}
      </div>
      <div className={css.small}>{found.length ? `반응 ${String(found.length)}` : '반응 없음'}</div>
    </div>
  )
}

// ── 캘린더 · 색 ──────────────────────────────────────────────────────────────

export function Calendar({ x, y, press, large }: Nav) {
  const poketch = useSaveStore((s) => s.poketch)
  const now = new Date()
  const month = now.getMonth() + 1
  const today = now.getDate()
  const days = new Date(now.getFullYear(), month, 0).getDate()
  const first = new Date(now.getFullYear(), month - 1, 1).getDay()
  const at = Math.max(1, Math.min(days, 1 + ((y % 6) + 6) % 6 * 7 + ((x % 7) + 7) % 7 - first))

  useOnPress(press, () => {
    if (!large) return
    const p = useSaveStore.getState().poketch
    const marked = p.calendar.month === month && ((p.calendar.marks >>> (at - 1)) & 1) === 1
    const marks = marked
      ? (p.calendar.marks & ~(1 << (at - 1))) >>> 0
      : p.calendar.month === month ? (p.calendar.marks | (1 << (at - 1))) >>> 0 : (1 << (at - 1)) >>> 0
    useSaveStore.setState({ poketch: { ...p, calendar: { month, marks } } })
  })

  return (
    <div className={css.center} style={{ justifyContent: 'flex-start', gap: 2 }}>
      <div className={css.small}>{month}월</div>
      <div className={css.month}>
        {Array.from({ length: first }, (_, i) => <span key={`p${String(i)}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1
          const marked = poketch.calendar.month === month
            && ((poketch.calendar.marks >>> i) & 1) === 1
          const cls = d === today ? css.dayToday : marked ? css.dayMarked : css.day
          return (
            <span key={d} className={cls} style={{ outline: large && d === at ? '1px solid currentColor' : undefined }}>
              {d}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function ColorChanger({ x, press, large }: Nav) {
  const color = useSaveStore((s) => s.poketch.screenColor)
  const at = ((x % POKETCH_COLOR_COUNT) + POKETCH_COLOR_COUNT) % POKETCH_COLOR_COUNT
  useOnPress(press, () => {
    if (!large) return
    const p = useSaveStore.getState().poketch
    useSaveStore.setState({ poketch: setScreenColor(p, at) })
  })
  return (
    <div className={css.center}>
      <div className={css.swatches}>
        {POKETCH_PALETTE.map((c, i) => (
          <span
            key={i}
            className={large && i === at ? css.swatchOn : css.swatch}
            style={{ background: c.lit, opacity: i === color ? 1 : 0.55 }}
          />
        ))}
      </div>
      {large && <div className={css.small}>←→ 고르기 · Z 바꾼다</div>}
    </div>
  )
}

// ── 아직 그 계통이 없는 셋 ───────────────────────────────────────────────────
//
// ⚠️ **빈 화면으로 두지 않는다.** 아무것도 안 그리면 「고장」과 「원래 이렇다」가
// 화면에서 같아진다. 무엇이 없어서 안 도는지를 그 자리에서 말한다.

export function BerrySearcher() {
  return <div className={css.missing}>나무열매 밭이<br />아직 없다 (§4.6)</div>
}

export function LinkSearcher() {
  return <div className={css.missing}>통신은<br />범위 밖이다 (§9)</div>
}

export function TrainerCounter() {
  return <div className={css.missing}>VS시커가<br />아직 없다 (§7.9)</div>
}

/** 앱 번호 → 그리는 것 */
export const POKETCH_APPS: Record<number, (nav: Nav) => React.ReactElement | null> = {
  [PoketchApp.DIGITAL_WATCH]: DigitalWatch,
  [PoketchApp.CALCULATOR]: Calculator,
  [PoketchApp.MEMO_PAD]: MemoPad,
  [PoketchApp.PEDOMETER]: Pedometer,
  [PoketchApp.PARTY_STATUS]: PartyStatus,
  [PoketchApp.FRIENDSHIP_CHECKER]: FriendshipChecker,
  [PoketchApp.DOWSING_MACHINE]: DowsingMachine,
  [PoketchApp.BERRY_SEARCHER]: BerrySearcher,
  [PoketchApp.DAYCARE_CHECKER]: DaycareChecker,
  [PoketchApp.POKEMON_HISTORY]: PokemonHistory,
  [PoketchApp.COUNTER]: Counter,
  [PoketchApp.ANALOG_WATCH]: AnalogWatch,
  [PoketchApp.MARKING_MAP]: MarkingMap,
  [PoketchApp.LINK_SEARCHER]: LinkSearcher,
  [PoketchApp.COIN_TOSS]: CoinToss,
  [PoketchApp.MOVE_TESTER]: MoveTester,
  [PoketchApp.CALENDAR]: Calendar,
  [PoketchApp.DOT_ART]: DotArtist,
  [PoketchApp.ROULETTE]: Roulette,
  [PoketchApp.TRAINER_COUNTER]: TrainerCounter,
  [PoketchApp.KITCHEN_TIMER]: KitchenTimer,
  [PoketchApp.COLOR_CHANGER]: ColorChanger,
  [PoketchApp.MATCHUP_CHECKER]: MatchupChecker,
  [PoketchApp.STOPWATCH]: Stopwatch,
  [PoketchApp.ALARM_CLOCK]: AlarmClock,
}
