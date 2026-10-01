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
import { assignInlineVars } from '@vanilla-extract/dynamic'
import {
  loadDialogueBank, loadHiddenItems, loadLabels, loadPokeIcons, loadPoketchMap, loadSpecies,
  loadSpeciesNames, POKE_ICON_ATLAS, POKETCH_MAP_ATLAS, type SpeciesLookup,
} from '../../data/gameData'
import { atlasUrl } from '../../data/providers/atlas'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import type { PokeIcons } from '../../data/schema'
import { loadUiText } from '../../data/uiText'
import { typeMultiplier } from '../../engine/battle/ai/typeChart'
import { BG_EVENT_TYPE, mapById, signsOf, world } from '../../engine/map/world'
import { fieldScripts, HIDDEN_ITEM_FLAG_BASE, HIDDEN_ITEM_SCRIPT_BASE } from '../../engine/script/field'
import { compatibility, compatibilityLevel } from '../../engine/pokemon/breeding'
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
import { monIcon } from '../menu/pokeIcon'
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

function DigitalWatch() {
  useTicker(true, 1000)
  const { hour, minute } = gameClock()
  return (
    <div className={css.center}>
      <div className={css.hugeNumber}>{pad2(hour)}:{pad2(minute)}</div>
    </div>
  )
}

function AnalogWatch({ large }: Nav) {
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
function AlarmClock({ x, press, large }: Nav) {
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
      {/* 울리는 동안은 글자가 깜빡인다 — 액정 글씨 그대로다. 컬러 그림 문자를 얹으면 OS 글꼴이 끼어든다 */}
      <div className={ringing ? css.smallBlink : css.small}>{ringing ? '알람!' : poketch.alarm.set ? '켜짐' : '꺼짐'}</div>
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
function Stopwatch({ press, large }: Nav) {
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
function KitchenTimer({ y, press, large }: Nav) {
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
      <div className={done ? css.smallBlink : css.small}>{done ? '끝!' : state.until !== null ? '재는 중' : '↑↓ 분 · Z 시작'}</div>
    </div>
  )
}

// ── 숫자 넷 ──────────────────────────────────────────────────────────────────

/** 계산기. 4×4 자판을 방향키로 짚고 Z로 누른다 */
function Calculator({ x, y, press, large }: Nav) {
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
function Counter({ y, press, large }: Nav) {
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
function Pedometer({ y, press, large }: Nav) {
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
function CoinToss({ press, large }: Nav) {
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

/**
 * 포켓치 앱이 직접 부르는 글 뱅크 (미국 롬 번호 · `apps.test.ts`가 이름 순서와 맞댄다).
 *
 * ⚠️ **통신서치 뱅크는 노드 쪽 굽기에 아직 없다** (`tools/extract/dialogue.js`의
 * `EXTRA_BANKS`). 브라우저 설치본은 뱅크를 다 실으니 거기서는 롬 글이 뜨고,
 * 노드로 구운 자료에서는 받기가 실패해 대체 글이 뜬다
 */
export const POKETCH_TEXT_BANK = {
  /** `TEXT_BANK_POKETCH_POKEMON_HISTORY` — 「손에 넣은 포켓몬」 한 줄 */
  history: 458,
  /** `TEXT_BANK_POKETCH_LINK_SEARCHER` — 0 제목 · 3 `LinkSearcher_Text_Unusable` */
  linkSearcher: 461,
} as const

/** 롬 뱅크 한 벌. 못 받으면 빈 목록 — 받는 쪽이 제 대체 글을 둔다 */
function useBank(bank: number): readonly string[] {
  const [lines, setLines] = useState<readonly string[]>([])
  useEffect(() => {
    let live = true
    void loadDialogueBank(gameLocale(), bank)
      .then((got) => { if (live) setLines(got) })
      .catch(() => { /* 뱅크가 없는 자료 — 대체 글로 */ })
    return () => { live = false }
  }, [bank])
  return lines
}

function useSpeciesNames(): {
  names: string[]
  table: SpeciesLookup | null
  maxHp: (i: number) => number
} {
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
    table,
    maxHp: (i) => {
      const mon = party[i]
      if (!mon || !table) return Math.max(1, mon?.hp ?? 1)
      return statsOf(mon, table.of(mon)).hp
    },
  }
}

/**
 * 화면에 적는 이름. 별명이 없으면 종족 이름이다.
 *
 * ⚠️ **이름표를 못 받았으면 빈 글자다.** 도감 번호(「#387」)를 대신 찍으면
 * 기기 화면에 내부 값이 뜬다 — 아이콘이 이미 누구인지 말한다
 */
function monName(mon: { nickname?: string | null, species: number }, names: readonly string[]): string {
  return mon.nickname ?? names[mon.species] ?? ''
}

// ── 액정 아이콘 ──────────────────────────────────────────────────────────────

/**
 * 아이콘 색 한 점이 액정 명암 몇 번째인가 — 0 바탕 · 1 중간 · 2 어둠 · 3 글씨
 * (`PoketchTask_MapToActivePaletteFromLuminance`).
 *
 * 원작은 아이콘 팔레트를 5비트 그대로 회색값으로 바꾸고(`RGB_TO_GREYSCALE`
 * 299·587·114), 그것을 3비트 밀어 0~3으로 자른다. 0이 제일 어둡고 액정 팔레트
 * 1번(글씨) · 1 → 8번 · 2 → 15번 · 3 → 4번(바탕)으로 간다. `shades`는 그 넷을
 * 밝은 쪽부터 [4, 15, 8, 1] 차례로 들고 있으므로(`tools/extract/poketchMap.js`)
 * 차례가 정확히 뒤집힌다
 */
export function lcdShade(r: number, g: number, b: number): number {
  const grey = Math.floor(((r >> 3) * 299 + (g >> 3) * 587 + (b >> 3) * 114) / 1000)
  return 3 - Math.min(3, grey >> 3)
}

function rgbOf(hex: string): [number, number, number] {
  const v = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? '000000'
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}

/**
 * RGBA 픽셀을 액정 명암 넷으로 칠한다. 투명한 칸(원작의 0번 색)은 그대로 둔다.
 *
 * `shades`는 `poketchShades`의 넷 — 바탕 · 중간 · 어둠 · 글씨
 */
export function paintLcd(px: Uint8ClampedArray, shades: readonly string[]): void {
  const rgb = shades.map(rgbOf)
  const last = rgb[rgb.length - 1] ?? [0, 0, 0]
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 128) { px[i + 3] = 0; continue }
    const to = rgb[lcdShade(px[i]!, px[i + 1]!, px[i + 2]!)] ?? last
    px[i] = to[0]; px[i + 1] = to[1]; px[i + 2] = to[2]; px[i + 3] = 255
  }
}

/**
 * 액정 색으로 칠한 아이콘 아틀라스 한 장. 색 하나에 한 장만 굽는다.
 *
 * ⚠️ **CSS 필터로 누르지 않는다.** `grayscale`·`contrast`로는 명암 네 단계에
 * 안 떨어지고, 색이 바뀌면(컬러체인저) 액정 팔레트로 갈아입을 길도 없다 —
 * 원작이 팔레트를 바꿔 끼우는 일을 캔버스에서 한 번 한다
 */
let lcdSheet: { key: string, url: Promise<string> } | null = null

function paintSheet(src: string, shades: readonly string[]): Promise<string> {
  const key = `${src}|${shades.join(',')}`
  if (lcdSheet?.key === key) return lcdSheet.url
  const before = lcdSheet
  const url = new Promise<HTMLImageElement>((ok, no) => {
    const img = new Image()
    img.onload = () => { ok(img) }
    img.onerror = () => { no(new Error('아이콘 아틀라스를 못 읽었다')) }
    img.src = src
  }).then((img) => new Promise<string>((ok, no) => {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) { no(new Error('캔버스가 없다')); return }
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    paintLcd(data.data, shades)
    ctx.putImageData(data, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) ok(URL.createObjectURL(blob))
      else no(new Error('액정 아이콘을 못 구웠다'))
    })
  }))
  lcdSheet = { key, url }
  // 새 장이 선 뒤에 옛 장을 놓는다 — 먼저 놓으면 갈아입는 사이에 아이콘이 빈다
  if (before) {
    void url.then(() => before.url).then((old) => { URL.revokeObjectURL(old) })
      .catch(() => { /* 옛 장이 애초에 못 섰다 */ })
  }
  // 실패를 붙들어 두면 다시 부를 길이 막힌다
  url.catch(() => { if (lcdSheet?.url === url) lcdSheet = null })
  return url
}

/** 지금 액정 색의 명암 넷 (바탕 · 중간 · 어둠 · 글씨) */
function useLcdShades(): readonly string[] {
  const color = useSaveStore((s) => s.poketch.screenColor)
  const [installed, setInstalled] = useState<readonly (readonly string[])[] | null>(null)
  useEffect(() => {
    let live = true
    void loadPoketchMap()
      .then((file) => { if (live) setInstalled(file.shades) })
      .catch(() => { /* 자료가 아직 없으면 우리 색으로 */ })
    return () => { live = false }
  }, [])
  const s = poketchShades(color, installed)
  return useMemo(() => [s.ground, s.mid, s.dark, s.ink], [s.ground, s.mid, s.dark, s.ink])
}

/**
 * 포켓몬 아이콘 — 박스 화면과 같은 아틀라스를 같은 칸 자르기(`monIcon`)로 쓰고,
 * 그림만 액정 색으로 갈아입힌다. `sheet`가 null이면 아직 없거나 못 받은 것이다
 */
function useMonIcons(): { icons: PokeIcons | undefined, sheet: string | null } {
  const shades = useLcdShades()
  const [icons, setIcons] = useState<PokeIcons>()
  const [sheet, setSheet] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void loadPokeIcons()
      .then((got) => { if (live) setIcons(got) })
      .catch(() => { /* 아이콘 없이 이름만 */ })
    return () => { live = false }
  }, [])
  useEffect(() => {
    const src = icons ? atlasUrl(POKE_ICON_ATLAS) : ''
    if (!src) return
    let live = true
    void paintSheet(src, shades)
      .then((url) => { if (live) setSheet(url) })
      .catch(() => { if (live) setSheet(null) })
    return () => { live = false }
  }, [icons, shades])
  return { icons, sheet }
}

/** `iconSlot`이 받는 셋. 개체가 아닌 칸(알 · 사랑동이)도 이 꼴로 부른다 */
interface IconOf { species: number, form: number, isEgg: boolean }

const EGG: IconOf = { species: 0, form: 0, isEgg: true }

function MonIcon(
  { icons, sheet, mon, px, flip = false }:
  { icons: PokeIcons | undefined, sheet: string | null, mon: IconOf | null, px: number, flip?: boolean },
) {
  const shown = mon !== null && sheet !== null && icons !== undefined
  return (
    <span
      className={css.monIcon}
      style={{
        // 칸 자리는 `monIcon` 그대로 · 그림만 액정 색 한 장으로 바꿔 끼운다
        ...(shown ? { ...monIcon(icons, mon, px), backgroundImage: `url(${sheet})` } : { width: px, height: px }),
        transform: flip ? 'scaleX(-1)' : undefined,
      }}
      aria-hidden
    />
  )
}

/**
 * 포켓몬리스트 — 아이콘과 체력 막대 (`party_status`).
 *
 * ⚠️ **두 줄 셋이 원작 자리다** (`sMonPosition` — x 64·160 × y 36·84·132).
 * 원작 화면에는 이름이 없다. 접힌 시계는 그 배치 그대로 두고, 펼친 시계와
 * 아이콘을 못 받은 때만 이름을 적는다 — 아이콘이 없으면 누군지 말할 것이 이름뿐이다
 */
function PartyStatus({ large }: Nav) {
  const party = useSaveStore((s) => s.party)
  const { names, maxHp } = useSpeciesNames()
  const { icons, sheet } = useMonIcons()
  if (!party.length) return <div className={css.missing}>포켓몬이 없다</div>
  const px = large ? 32 : 24
  return (
    <div className={css.monGrid}>
      {party.map((mon, i) => {
        const max = maxHp(i)
        return (
          <div key={i} className={css.monCell}>
            <MonIcon icons={icons} sheet={sheet} mon={mon} px={px} />
            <div className={css.monInfo}>
              {(large || !sheet) && <span className={css.name}>{monName(mon, names)}</span>}
              {large && <span className={css.small}>{mon.hp}/{max}</span>}
              <span className={css.cellBar}>
                <span className={css.barFill} style={{ width: `${String(Math.max(0, Math.min(100, (mon.hp / max) * 100)))}%` }} />
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * 친밀도체커 — 하트 0~6 (`friendship_checker`).
 *
 * 원작도 여섯 마리를 두 줄 셋으로 처음 세운다 (`initialLocations`)
 */
function FriendshipChecker({ large }: Nav) {
  const party = useSaveStore((s) => s.party)
  const { names } = useSpeciesNames()
  const { icons, sheet } = useMonIcons()
  if (!party.length) return <div className={css.missing}>포켓몬이 없다</div>
  const px = large ? 32 : 24
  return (
    <div className={css.monGrid}>
      {party.map((mon, i) => (
        <div key={i} className={css.monCell}>
          <MonIcon icons={icons} sheet={sheet} mon={mon} px={px} />
          <div className={css.monInfo}>
            {(large || !sheet) && <span className={css.name}>{monName(mon, names)}</span>}
            <span className={css.hearts}>
              {/* 알은 친밀도 칸을 **남은 걸음**으로 쓴다. 하트를 그리면 거짓말이 된다 */}
              {mon.isEgg ? '—' : '♥'.repeat(friendshipTier(mon.friendship)) || '·'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 상성체커 ─────────────────────────────────────────────────────────────────

/** 상성체커가 고른 두 마리 — **알 아닌 마리만 센** 목록의 자리다 */
interface MatchupPick { left: number, right: number }

/** 처음 자리 — 왼쪽 0 · 오른쪽 1, 한 마리뿐이면 둘 다 0 (`matchup_checker/main.c` `Init`) */
export function matchupStart(count: number): MatchupPick {
  return { left: 0, right: count > 1 ? 1 : 0 }
}

/**
 * 한쪽을 다음 마리로 (`UpdateLeftMon` · `UpdateRightMon`).
 *
 * ⚠️ **세 마리 이상일 때만 돈다.** 둘이면 바꿀 곳이 없어 원작도 아무 일을 안 한다
 * (null). 돌다가 **맞은편이 고른 마리는 건너뛴다** — 같은 마리끼리는 맞대지 않는다
 */
export function matchupTurn(pick: MatchupPick, side: 'left' | 'right', count: number): MatchupPick | null {
  if (count <= 2) return null
  const other = side === 'left' ? pick.right : pick.left
  let at = side === 'left' ? pick.left : pick.right
  do { at = at + 1 >= count ? 0 : at + 1 } while (at === other)
  return side === 'left' ? { left: at, right: pick.right } : { left: pick.left, right: at }
}

/**
 * 궁합 단계 → 켜지는 하트 수 (`InitAnimationSequence`).
 *
 * 0(최고) 셋 · 1 둘 · 2 하나 · 3(안 맞음) 없음 — 하트 칸 애니메이션 3·2·1·0과 같다
 */
export function matchupHearts(level: number): number {
  return Math.max(0, Math.min(3, 3 - level))
}

/** 사랑동이 — 원작이 두 마리 사이에 띄우는 물고기 (`SPRITE_LUVDISC_*`) */
const LUVDISC: IconOf = { species: 370, form: 0, isEgg: false }
/** 하트 하나에 사랑동이가 다가가는 거리 — 원작 화면 16점을 16프레임에 (`ANIM_COMMAND_MOVE_FORWARD, 16, 16`) */
const LUVDISC_STEP = 16
const FRAME_S = 1 / 60

/**
 * 상성체커 — 파티의 두 마리가 키우미집에서 알을 만들 궁합 (`matchup_checker`).
 *
 * 하트 칸 · 사랑동이 둘 · 아래의 두 마리와 가운데 버튼 — 원작 화면의 세 층
 * 그대로다. 버튼 셋은 ←→로 고르고 Z로 누른다: 왼쪽·오른쪽 마리를 짚고 누르면
 * 그쪽이 다음 마리로 돌고(`BUTTON_CHANGE_*_MON`), 가운데를 누르면 맞대 본다
 * (`BUTTON_CHECK_MATCHUP` → `BoxMon_GetPairDaycareCompatibilityLevel`).
 * 커서는 가운데에서 시작한다.
 *
 * ⚠️ **알은 목록에 없다.** 한 마리뿐이면 오른쪽이 비고 버튼이 눌린 채로
 * 멈춘다 — 원작도 그 자리에서 삑 소리만 낸다.
 *
 * ⚠️ **사랑동이는 종족 아이콘으로 그린다.** 상성체커 전용 사랑동이·하트 칸
 * 그림(`matchup_checker_NCGR`)은 아직 굽지 않는다. 움직임(하트 하나에 16점
 * 다가가기 · 안 맞으면 등을 돌려 물러나기 · 최고면 깜빡임)은 원작 명령표를 따른다.
 *
 * ⚠️ **왼쪽 마리는 오른쪽을 보게 뒤집는다** (`UpdateMonIcon`의 애니메이션 5).
 * 원작은 종족 자료의 `SPECIES_DATA_FLIP_SPRITE`가 선 마리만 안 뒤집는데, 그 칸이
 * 아직 종족 자료에 없어서 모두 뒤집는다
 */
function MatchupChecker({ x, press, large }: Nav) {
  const party = useSaveStore((s) => s.party)
  const { names, table } = useSpeciesNames()
  const { icons, sheet } = useMonIcons()
  const mons = party.filter((m) => !m.isEgg)
  const count = mons.length
  const [state, setState] = usePoketchMemory<{ pick: MatchupPick, level: number | null, run: number }>(
    PoketchApp.MATCHUP_CHECKER, { pick: matchupStart(count), level: null, run: 0 },
  )
  // 파티가 줄었으면 처음 자리로 — 없는 칸을 가리키면 아이콘이 빈다
  const pick = state.pick.left < count && state.pick.right < count ? state.pick : matchupStart(count)
  // 커서 0이 가운데 버튼이다. ← 왼쪽 마리 · → 오른쪽 마리
  const button = (((x + 1) % 3) + 3) % 3

  useOnPress(press, () => {
    if (!large || !count) return
    if (button === 1) {
      const a = mons[pick.left], b = mons[pick.right]
      if (count < 2 || !table || !a || !b) return
      const level = compatibilityLevel(compatibility(a, b, (id) => table.get(id)))
      setState({ pick, level, run: state.run + 1 })
      return
    }
    const next = matchupTurn(pick, button === 0 ? 'left' : 'right', count)
    // 마리를 바꾸면 사랑동이와 하트가 처음으로 돌아간다 (`ResetIndicatorPositions`)
    if (next) setState({ pick: next, level: null, run: state.run })
  })

  if (!party.length) return <div className={css.missing}>포켓몬이 없다</div>
  // 표가 오는 중에는 아무것도 안 그린다 — 「없다」가 깜빡이면 거짓말이다
  if (!table) return <div />
  if (!count) return <div className={css.missing}>포켓몬이 없다</div>

  const px = large ? 32 : 24
  const k = px / 32
  const level = state.level
  const hearts = level === null ? 0 : matchupHearts(level)
  const spurned = level === 3
  const left = mons[pick.left]
  const right = count > 1 ? mons[pick.right] : undefined
  // 하트 하나에 16프레임. 최고면 다 다가간 뒤 16프레임 쉬고 깜빡인다
  const travel = hearts * LUVDISC_STEP * FRAME_S
  const heartClass = (i: number): string =>
    i >= hearts ? css.heartOff : level === 0 ? css.heartBlink : css.heartOn
  const luvdisc = (side: 'left' | 'right') => (
    <span
      key={`${String(state.run)}/${side}`}
      className={level === null ? css.luvdisc : spurned ? css.luvdiscSpurn : css.luvdiscNear}
      style={{
        [side]: 0,
        ...assignInlineVars({
          // 아이콘은 왼쪽을 보고 그려져 있다 — 왼쪽 물고기만 뒤집어 마주 보게 한다
          [css.face]: side === 'left' ? '-1' : '1',
          [css.shift]: `${String((side === 'left' ? 1 : -1) * (spurned ? LUVDISC_STEP : hearts * LUVDISC_STEP) * k)}px`,
        }),
        animationDuration: `${String(spurned ? 3 * LUVDISC_STEP * FRAME_S : travel)}s`,
      }}
    >
      <MonIcon icons={icons} sheet={sheet} mon={LUVDISC} px={px} />
    </span>
  )

  return (
    <div className={css.matchup} style={{ width: 128 * k + px }}>
      <div className={css.heartMeter}>
        {[0, 1, 2].map((i) => (
          <span
            key={`${String(state.run)}/${String(i)}`}
            className={heartClass(i)}
            style={level === 0 ? { animationDelay: `${String(travel + LUVDISC_STEP * FRAME_S)}s` } : undefined}
          >
            ♥
          </span>
        ))}
      </div>
      <div className={css.matchupRow} style={{ height: px }}>
        {luvdisc('left')}
        {right && luvdisc('right')}
      </div>
      <div className={css.matchupRow} style={{ height: px }}>
        <span className={css.matchupMon} style={{ left: 0, outline: large && button === 0 ? '1px solid currentColor' : 'none' }}>
          <MonIcon icons={icons} sheet={sheet} mon={left ?? null} px={px} flip />
        </span>
        <span
          className={count < 2 ? css.matchupButtonDown : css.matchupButton}
          style={{ outline: large && button === 1 ? '1px solid currentColor' : 'none' }}
        >
          ♥
        </span>
        {right && (
          <span className={css.matchupMon} style={{ right: 0, outline: large && button === 2 ? '1px solid currentColor' : 'none' }}>
            <MonIcon icons={icons} sheet={sheet} mon={right} px={px} />
          </span>
        )}
      </div>
      {(large || !sheet) && (
        <div className={css.matchupNames}>
          <span className={css.name}>{left ? monName(left, names) : ''}</span>
          <span className={css.name} style={{ textAlign: 'right' }}>{right ? monName(right, names) : ''}</span>
        </div>
      )}
    </div>
  )
}

/**
 * 키우미집체커 — 맡긴 둘과 알 (`daycare_checker`).
 *
 * 원작은 맡긴 둘의 아이콘과 레벨을 그리고, 알이 생기면 그 사이에 알을 띄운다
 */
function DaycareChecker({ large }: Nav) {
  const daycare = useSaveStore((s) => s.daycare)
  const { names } = useSpeciesNames()
  const { icons, sheet } = useMonIcons()
  const slots = daycare.slots.filter((s) => s !== null)
  if (!slots.length) return <div className={css.missing}>맡긴 포켓몬이 없다</div>
  const px = large ? 32 : 24
  return (
    <div className={css.rows}>
      {daycare.slots.map((slot, i) => (
        <div key={i} className={css.row}>
          <MonIcon icons={icons} sheet={sheet} mon={slot ? slot.mon : null} px={px} />
          <span className={css.name}>{slot ? monName(slot.mon, names) : '—'}</span>
          {slot && <span className={css.small}>Lv.{slot.mon.level}</span>}
        </div>
      ))}
      <div className={css.row}>
        {/* 알 속은 아직 정해지지 않았다 — 흰 알이다 */}
        <MonIcon icons={icons} sheet={sheet} mon={daycare.eggPid !== 0 ? EGG : null} px={px} />
        <span className={css.name}>알</span>
        <span className={css.small}>{daycare.eggPid !== 0 ? '있다!' : '없다'}</span>
      </div>
    </div>
  )
}

/**
 * 포켓몬히스토리 — 손에 넣은 열둘 (`pokemon_history`).
 *
 * ⚠️ **넷씩 세 줄, 먼저 온 마리가 왼쪽 위다.** 원작 줄은 끝에 새 마리를 붙이고
 * 꽉 차면 맨 앞을 민다(`Poketch_PokemonHistoryEnqueue`) — 화면은 그 차례 그대로
 * 0번부터 칸에 놓는다(`HISTORY_ICON_STEP_X` 40 · `_Y` 48). 머리글 「손에 넣은
 * 포켓몬」도 롬 줄이다. 아직 아무도 없으면 머리글만 선다
 */
function PokemonHistory({ large }: Nav) {
  const history = useSaveStore((s) => s.poketch.history)
  const { names } = useSpeciesNames()
  const { icons, sheet } = useMonIcons()
  const title = useBank(POKETCH_TEXT_BANK.history)[0]
  const px = large ? 32 : 24
  return (
    <div className={css.historyBox}>
      {title && <div className={css.title}>{title}</div>}
      <div className={css.historyGrid}>
        {history.map((h, i) => (
          <span key={i} className={css.historyCell} style={{ height: px }}>
            {sheet
              ? <MonIcon icons={icons} sheet={sheet} mon={{ ...h, isEgg: false }} px={px} />
              : <span className={css.name}>{names[h.species] ?? ''}</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── 기술효과체커 ─────────────────────────────────────────────────────────────

function MoveTester({ x, y, large }: Nav) {
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
function MemoPad({ x, y, press, large }: Nav) {
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
function DotArtist({ x, y, press, large }: Nav) {
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
function Roulette({ x, y, press, large }: Nav) {
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
function MarkingMap({ x, press, large }: Nav) {
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
function BerrySearcher({ large }: Nav) {
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
function TrainerCounter() {
  const records = useSaveStore((s) => s.radar.records)
  const { names } = useSpeciesNames()
  const chain = radarChain()
  const best = [...records].filter((r) => r.species !== 0 && r.count > 0)
    .sort((a, b) => b.count - a.count)
  const nameOf = (species: number): string => names[species] ?? ''
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
function DowsingMachine({ large }: Nav) {
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

function Calendar({ x, y, press, large }: Nav) {
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

function ColorChanger({ x, press, large }: Nav) {
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

// ── 통신서치 ─────────────────────────────────────────────────────────────────

/** `LinkSearcher_Text_*`의 줄 자리 (`poketch_link_searcher.json`) */
const LINK_SEARCHER_TEXT = { title: 0, unusable: 3 } as const

/**
 * 통신서치 — 근처의 통신을 찾는 앱. **통신은 우리 게임에 없다.**
 *
 * ⚠️ **빈 화면으로 두지 않는다.** 아무것도 안 그리면 「고장」과 「원래 이렇다」가
 * 화면에서 같아진다. 원작이 검색을 못 하는 자리에서 띄우는 글
 * (`LinkSearcher_Text_Unusable`)을 그대로 띄운다 — 기획 문서의 말(범위 밖 · PARITY §9)은
 * 기기 화면에 안 올린다. 뱅크를 못 받은 자료에서는 그 줄의 뜻을 우리 말로 적는다
 */
function LinkSearcher() {
  const lines = useBank(POKETCH_TEXT_BANK.linkSearcher)
  const title = lines[LINK_SEARCHER_TEXT.title]
  return (
    <div className={css.missing}>
      {title && <div className={css.title}>{title}</div>}
      <div>{lines[LINK_SEARCHER_TEXT.unusable] ?? '이곳에서는 검색할 수 없다'}</div>
    </div>
  )
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
