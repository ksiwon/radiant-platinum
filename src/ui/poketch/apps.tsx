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
  loadHiddenItems, loadLabels, loadPoketchMap, loadSpecies, loadSpeciesNames,
  POKETCH_MAP_ATLAS, type SpeciesLookup,
} from '../../data/gameData'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { loadUiText } from '../../data/uiText'
import { typeMultiplier } from '../../engine/battle/ai/typeChart'
import { BG_EVENT_TYPE, mapById, signsOf, world } from '../../engine/map/world'
import { fieldScripts, HIDDEN_ITEM_FLAG_BASE, HIDDEN_ITEM_SCRIPT_BASE } from '../../engine/script/field'
import { statsOf } from '../../engine/pokemon/instance'
import {
  DOTART_HEIGHT, DOTART_WIDTH, MOVE_TESTER_TYPE_ORDER, POKETCH_COLOR_COUNT,
  POKETCH_MARKER_COUNT, PoketchApp, dotArtGet, dotArtSet, dowsingInRange,
  applyCalcKey, CALC_KEYS, friendshipTier, modifyDotArt,
  moveTesterExclamations, poketchShades, setMarker, setScreenColor, type CalcState,
} from '../../engine/world/poketch'
import {
  POKETCH_MAP_VIEW, hiddenSpots, mapCell, mapPoint, readyBerrySpots,
} from '../../engine/world/poketchMap'
import { poketchLastCell, poketchMarkCell } from '../../scene/poketch'
import { radarChain } from '../../scene/pokeRadar'
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

/** 아틀라스의 가로 차례. `poketchMap.json`의 `maps`와 같은 순서다 */
const MAP_VARIANT = { marking: 0, berry: 1 } as const

/**
 * 신오 지도 한 장. 마킹맵과 나무열매탐색기가 나눠 쓴다.
 *
 * ⚠️ **그림이 이미 액정 색이다** — 롬 아틀라스가 색 여덟을 다 들고 있어서
 * 지금 색의 줄을 오려 내기만 하면 된다. 자료가 아직 없으면 지도 없이
 * 표식만 뜬다 — 빈 화면보다는 자리라도 보이는 편이 낫다.
 */
function PoketchMapView(
  { variant, large, children }:
  { variant: keyof typeof MAP_VARIANT, large: boolean, children?: React.ReactNode },
) {
  const color = useSaveStore((s) => s.poketch.screenColor)
  const sheet = useAssetImage(POKETCH_MAP_ATLAS)
  const [meta, setMeta] = useState<{ width: number, height: number, themes: number } | null>(null)
  useEffect(() => {
    let live = true
    void loadPoketchMap()
      .then((file) => { if (live) setMeta({ width: file.width, height: file.height, themes: file.themes }) })
      .catch(() => { /* 지도 없이 표식만 */ })
    return () => { live = false }
  }, [])

  const w = meta?.width ?? POKETCH_MAP_VIEW.width
  const h = meta?.height ?? POKETCH_MAP_VIEW.height
  const scale = (large ? 168 : 92) / w
  const at = ((color % (meta?.themes ?? 8)) + (meta?.themes ?? 8)) % (meta?.themes ?? 8)

  return (
    <div className={css.mapBox} style={{ width: w * scale, height: h * scale }}>
      {sheet && meta && (
        <img
          className={css.mapSheet}
          src={sheet}
          alt=""
          style={{
            transform: `scale(${String(scale)}) translate(${String(-MAP_VARIANT[variant] * w)}px, ${String(-at * h)}px)`,
          }}
        />
      )}
      <div className={css.mapSheet} style={{ width: w * scale, height: h * scale }}>{children}</div>
    </div>
  )
}

/** 지도 위 픽셀 → 화면 자리. 접힌 시계와 펼친 시계의 배율이 다르다 */
const mapAt = (point: { x: number, y: number }, large: boolean): { left: number, top: number } => {
  const scale = (large ? 168 : 92) / POKETCH_MAP_VIEW.width
  return { left: point.x * scale, top: point.y * scale }
}

/** 지금 서 있는 칸. 밖이면 새로 적고, 안이면 마지막으로 밖이었던 칸이다 */
function hereCell(): { x: number, y: number } | null {
  if (mapById(world.mapId)?.matrix === 0) {
    const cell = mapCell(worldState.player.position.x, worldState.player.position.z)
    poketchMarkCell(cell)
    return cell
  }
  return poketchLastCell()
}

/**
 * 마킹맵 — 신오 지도 위에 표식 여섯.
 *
 * 지금 서 있는 자리는 빈 동그라미로, 찍어 둔 표식은 채운 점으로 그린다.
 *
 * ⚠️ **격자 한 칸이 맵 한 장이다** (`PoketchMap_GetPlayerLocation`이 타일
 * 좌표를 32로 나눈다) — 마을 안을 걸어 다니는 동안 점이 안 움직이는 것이 원작이다
 */
export function MarkingMap({ x, press, large }: Nav) {
  const poketch = useSaveStore((s) => s.poketch)
  const at = ((x % POKETCH_MARKER_COUNT) + POKETCH_MARKER_COUNT) % POKETCH_MARKER_COUNT
  useOnPress(press, () => {
    if (!large) return
    // 커서가 가리키는 표식을 **지금 서 있는 자리**로 옮긴다. 원작은 터치로
    // 끌어다 놓는데 우리는 키보드라, "여기에 꽂는다"가 같은 일을 한다
    const cell = hereCell()
    if (!cell) return
    const point = mapPoint(cell.x, cell.y)
    if (!point) return
    const p = useSaveStore.getState().poketch
    useSaveStore.setState({ poketch: setMarker(p, at, point.x, point.y) })
  })
  const cell = hereCell()
  const here = cell ? mapPoint(cell.x, cell.y) : null
  return (
    <div className={css.center}>
      <PoketchMapView variant="marking" large={large}>
        {here && <span className={css.here} style={mapAt(here, large)} />}
        {poketch.markers.map((m, i) => (
          <span
            key={i}
            className={css.marker}
            style={{
              ...mapAt(m, large),
              outline: large && i === at ? '1px solid currentColor' : 'none',
            }}
          />
        ))}
      </PoketchMapView>
      {large && <div className={css.small}>←→ 표식 {at + 1} · Z 여기에 꽂는다</div>}
    </div>
  )
}

/**
 * 나무열매탐색기 — 열매가 **열린** 밭이 지도에 뜬다 (`berry_searcher`).
 *
 * ⚠️ **밭 118개가 점 서른여섯이다.** 한 마을에 밭이 넷씩 붙어 있어서 원작이
 * 이어진 같은 자리를 건너뛴다 (`GetReadyBerryPatches`) — 안 뭉치면 같은 점을
 * 네 번 찍는다.
 *
 * ⚠️ **본 적 없는 밭은 안 뜬다.** 화면에 한 번도 안 들어온 밭은 시간이 안
 * 흐르므로 열릴 수가 없다 (PARITY §4.6).
 *
 * ⚠️ **숨은 자리 넷도 여기서 뜬다** — 만월도·신월도·봄의길·바다이음길이고,
 * 이야기가 변수에 정해진 값을 적어야 나온다 (`SystemVars_CheckHiddenLocation`).
 */
export function BerrySearcher({ large }: Nav) {
  const patches = useSaveStore((s) => s.berryPatches)
  const dots = useMemo(() => readyBerrySpots(patches), [patches])
  const hidden = hiddenSpots((id) => fieldScripts.vars.get(id))
  const cell = hereCell()
  const here = cell ? mapPoint(cell.x, cell.y) : null
  return (
    <div className={css.center}>
      <PoketchMapView variant="berry" large={large}>
        {here && <span className={css.here} style={mapAt(here, large)} />}
        {dots.map((d, i) => (
          <span key={`b${String(i)}`} className={css.mapBerry} style={mapAt(d, large)} />
        ))}
        {hidden.map((s) => (
          <span key={s.name} className={css.mapHidden} style={mapAt(s, large)} />
        ))}
      </PoketchMapView>
      {large && <div className={css.small}>열린 밭 {dots.length}곳</div>}
    </div>
  )
}

/**
 * 포켓트레카운터 — **포켓몬레이더**의 사슬이다 (`trainer_counter`).
 *
 * ⚠️ **VS시커와 아무 상관이 없다.** 이름의 「포켓트레」가 ポケトレ,
 * 곧 포켓몬레이더다 — 원작 코드가 보는 것도 지금 잇는 사슬과 기록 셋뿐이다
 * (`RadarChainRecords_*`). 디컴프의 「trainer counter」라는 이름이 오래
 * 오해를 만들었다.
 *
 * ⚠️ **기록 셋은 늘 긴 차례로 줄 세워 보여 준다** (`SortChainRecords`) —
 * 리포트에 적힌 차례가 아니다.
 *
 * ⚠️ **원작은 아이콘을 세 마리 띄운다.** 우리 액정은 글자라 이름으로 적는다.
 */
export function TrainerCounter() {
  const records = useSaveStore((s) => s.radar.records)
  const { names } = useSpeciesNames()
  const chain = radarChain()
  const best = [...records].filter((r) => r.species !== 0 && r.count > 0)
    .sort((a, b) => b.count - a.count)
  const nameOf = (species: number): string => names[species] ?? `#${String(species)}`
  return (
    <div className={css.rows} style={{ fontSize: 10 }}>
      <div className={css.row}>
        <span className={css.name}>
          {chain.species === 0 ? '지금 잇는 사슬 없음' : nameOf(chain.species)}
        </span>
        <span>{chain.species === 0 ? '' : chain.count}</span>
      </div>
      {best.map((r, i) => (
        <div key={i} className={css.row}>
          <span className={css.name}>{nameOf(r.species)}</span>
          <span>{r.count}</span>
        </div>
      ))}
      {best.length === 0 && <div className={css.small}>기록 없음</div>}
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
  // 칸에 그리는 색은 그 액정의 **바탕**이다. 그게 화면의 86%를 덮는 색이라
  // 골랐을 때 무슨 색이 되는지를 가장 잘 말한다
  const [shades, setShades] = useState<readonly (readonly string[])[] | null>(null)
  useEffect(() => {
    let live = true
    void loadPoketchMap()
      .then((file) => { if (live) setShades(file.shades) })
      .catch(() => { /* 자료가 아직 없으면 우리 색으로 */ })
    return () => { live = false }
  }, [])
  useOnPress(press, () => {
    if (!large) return
    const p = useSaveStore.getState().poketch
    useSaveStore.setState({ poketch: setScreenColor(p, at) })
  })
  return (
    <div className={css.center}>
      <div className={css.swatches}>
        {Array.from({ length: POKETCH_COLOR_COUNT }, (_, i) => (
          <span
            key={i}
            className={large && i === at ? css.swatchOn : css.swatch}
            style={{ background: poketchShades(i, shades).ground, opacity: i === color ? 1 : 0.55 }}
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

export function LinkSearcher() {
  return <div className={css.missing}>통신은<br />범위 밖이다 (§9)</div>
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
