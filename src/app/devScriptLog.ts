// 스크립트 전수 점검 판의 **게임 쪽 반** — 개발 전용 (지시서 GAPS_20261011 「H. 스크립트 · 이벤트 전수」).
//
// 하는 일은 셋이다:
//   ① 엿보기 — 스크립트 한 판의 시작 · 끝 · 오류 · 미구현 명령(`skipper`) · 대사 표시를 기록한다 (`engine/script/spy`)
//   ② 몰기 — 스크립트 하나를 **끝까지** 민다. 대사는 A로 넘기고, 메뉴는 회차마다 정한 칸을 고르고, 멈추면 멈춘 자리를 적는다
//   ③ 걷기 표본 — 사람 · 간판 앞에 서서 **진짜 입력**으로 말을 걸고, 좌표 사건 앞에서 걸어 들어간다
//
// **배포본은 이 청크를 안 받는다.** 부르는 쪽이 `import.meta.env.DEV` 뒤의 동적 import 하나뿐이라(`app/App`) 배포
// 빌드에서는 rollup이 가지째 흔들어 낸다 — `app/devConsole` · `app/devWarp`와 같은 잣대고 `devBackdoor.test`가 지킨다.
//
// ⚠️ **직접 시작은 시선 · 충돌 · 걸어 들어가기를 건너뛴다.** `fieldScripts`의 `start`를 부르면 그 스크립트의 **바이트코드**
// 는 돌지만 「그 사람에게 말이 걸리는가」는 안 잰다. 그래서 ③이 맵마다 표본으로 따로 잰다.
//
// ⚠️ **배틀은 켜지 않는다.** 스크립트가 여는 배틀(`startTrainerBattle` 등)은 서비스 묶음을 감싸서 곧바로 이긴 것으로
// 돌려준다 — 여기서 재는 것은 스크립트 줄이 끝까지 가는가이지 배틀 화면이 아니다(그것은 `story` · `journey`가 잰다).
import { world as mapWorld, mapById, npcsOf, signsOf, triggersOf } from '../engine/map/world'
import {
  abortScript, fieldScripts, start as startScript,
} from '../engine/script/field'
import { scriptSpy } from '../engine/script/spy'
import type { Checkpoint } from '../engine/dev/checkpoints'
import { worldState } from '../state/worldState'
import { useSaveStore } from '../state/saveStore'
import { useMenuStore } from '../state/menuStore'
import { npcActors } from '../engine/actor/npcs'
import { gridFor } from '../scene/worldData'
import { devWarp, warpTo } from './devWarp'

// ── 기록 ─────────────────────────────────────────────────────────────────────

/** 한 번 몰 때 모으는 것 */
interface Trace {
  starts: { script: number, file: number, entry: number, kind: string }[]
  msgs: number
  /** 빈 글 — 뱅크에 그 번호가 없거나 빈 문자열이다. `bank`는 지금 읽던 뱅크의 크기(0이면 뱅크 자체가 안 왔다) */
  empty: { id: number, bank: number, file: number }[]
  errors: string[]
  unimpl: Map<string, number>
  unimplAt: { name: string, file: number, at: number | null }[]
  ops: number
  last: string[]
  visited: Map<number, Set<number>>
  menus: number
  services: Map<string, number>
  battles: string[]
  /** 보통 판이 끝난 횟수 (`scriptSpy.end`) — 매 프레임 표가 곧바로 새 판을 걸어도 **내 판이 끝났음**을 안다 */
  ended: number
  /** 지금 도는 스크립트 파일 — 빈 글이 어느 파일의 것인지 적는 데 쓴다 */
  file: number
}

function newTrace(): Trace {
  return {
    starts: [], msgs: 0, empty: [], errors: [], unimpl: new Map(), unimplAt: [], ops: 0, last: [],
    visited: new Map(), menus: 0, services: new Map(), battles: [], ended: 0, file: -1,
  }
}

let trace: Trace = newTrace()

const LAST_OPS = 8

/** 명령 이름. 표를 못 읽으면 숫자 그대로 */
function opName(opcode: number): string {
  return fieldScripts.data?.meta.commands[opcode]?.name ?? `0x${opcode.toString(16)}`
}

function installSpy(): void {
  scriptSpy.start = (info) => {
    trace.starts.push({ script: info.script, file: info.file, entry: info.entry, kind: info.kind ?? 'run' })
    trace.file = info.file
  }
  scriptSpy.end = (kind) => { if (kind !== 'init') trace.ended++ }
  scriptSpy.error = (message, where) => { trace.errors.push(`${where}: ${message}`.slice(0, 300)) }
  scriptSpy.unimplemented = (name, file, at) => {
    trace.unimpl.set(name, (trace.unimpl.get(name) ?? 0) + 1)
    if (trace.unimplAt.length < 20) trace.unimplAt.push({ name, file, at })
  }
  scriptSpy.message = (id, text, bankSize) => {
    trace.msgs++
    if (text === '' && trace.empty.length < 20) trace.empty.push({ id, bank: bankSize, file: trace.file })
  }
  scriptSpy.opcode = (opcode, file, at) => {
    trace.ops++
    let set = trace.visited.get(file)
    if (set === undefined) { set = new Set(); trace.visited.set(file, set) }
    set.add(at)
    trace.last.push(opName(opcode))
    if (trace.last.length > LAST_OPS) trace.last.shift()
  }
}

// ── 서비스 감싸기 ────────────────────────────────────────────────────────────

/** 배틀을 여는 서비스 이름 — 이름이 `start…Battle` · `start…Encounter` 꼴이다 */
const BATTLE_START = /^start.*(Battle|Encounter)$/

/**
 * `fieldScripts.services`를 감싼다. 하는 일은 둘이다.
 *   ① 배틀을 여는 서비스는 열지 않고 **이긴 것**으로 돌려준다 (`battleResult` 'win')
 *   ② 어떤 서비스를 불렀는지 센다 — 멈춘 자리의 까닭을 가르는 데 쓴다
 */
/** 배틀을 이긴 것으로 돌려주는 중인가 — 판마다 다시 거짓으로 되돌린다 */
const battleState = { won: false, outcome: 'win' as 'win' | 'loss' }

function wrapServices<T extends object>(real: T, path: string): T {
  return new Proxy(real, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver)
      const name = typeof prop === 'string' ? `${path}${prop}` : ''
      if (path === '' && prop === 'battleResult') {
        return () => (battleState.won ? battleState.outcome : (value as (() => unknown) | undefined)?.())
      }
      // ⚠️ **결과 마스크도 같이 준다.** `CheckWonBattle`은 마스크를 먼저 읽고 — 진짜 서비스가 앞 배틀의 묵은 마스크를 들고 있으면
      // 이긴 것으로 돌려줘도 진 갈래(`BlackOutFromBattle`)로 간다. 태그 배틀 뒤 페이지가 타이틀로 떠난 까닭이 이 틈이었다
      if (path === '' && prop === 'battleMask') {
        return () => (battleState.won ? (battleState.outcome === 'win' ? 1 : 2) : (value as (() => unknown) | undefined)?.())
      }
      // ⚠️ **소리가 끝나기를 기다리지 않는다.** 헤드리스 브라우저는 오디오가 안 풀려 `WaitSE`가 영영 서는데, 사람 기계에서는
      // 소리가 나므로 그 기다림은 하네스의 탓이다
      if (path === 'sound.' && typeof prop === 'string' && /Playing$/.test(prop)) return () => false
      if (path === '' && prop === 'battleUp') return () => false
      if (name === '' || value === undefined) return value
      if (typeof value === 'function') {
        const isBattle = BATTLE_START.test(String(prop)) || (path !== '' && /startBattle$/.test(name))
        return (...args: unknown[]) => {
          trace.services.set(name, (trace.services.get(name) ?? 0) + 1)
          if (isBattle) {
            trace.battles.push(name)
            battleState.won = true
            return undefined
          }
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }
      if (typeof value === 'object' && value !== null) {
        return wrapServices(value as object, `${name}.`)
      }
      return value
    },
  })
}

// ── 구동 ─────────────────────────────────────────────────────────────────────

const frame = (): Promise<void> => new Promise((ok) => {
  // 숨은 탭에서는 rAF가 안 온다 — 시한으로 같이 건다
  let done = false
  const fin = (): void => { if (!done) { done = true; ok() } }
  requestAnimationFrame(fin)
  setTimeout(fin, 40)
})

const sleep = (ms: number): Promise<void> => new Promise((ok) => { setTimeout(ok, ms) })

/** 키를 한 번 톡 친다 — 필드는 눌린 순간을 `tapped`로 기억한다 (`engine/input/keys`) */
function tap(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
}

const marks = (): { map: number, script: boolean, talk: boolean, scene: string, menu: string } => {
  const d = document.documentElement.dataset
  return {
    map: Number(d.map ?? -1), script: d.script === '1', talk: d.talk === '1',
    scene: d.scene ?? '', menu: d.menu ?? '',
  }
}

type Pre =
  | { clearFlag: number }
  | { setFlag: number }
  | { setVar: number, value?: number, valueOf?: number }

interface SweepSite {
  key: string
  kind: string
  script: number
  mapFile: number
  local: number
  pre: readonly Pre[]
}

type RunStatus = 'done' | 'stall' | 'timeout' | 'refused' | 'error' | 'battle'

interface RunReport {
  key: string
  kind: string
  round: number
  status: RunStatus
  ms: number
  taps: number
  starts: number
  msgs: number
  empty: { id: number, bank: number, file: number }[]
  errors: string[]
  unimpl: { name: string, count: number }[]
  unimplAt: { name: string, file: number, at: number | null }[]
  ops: number
  lastOps: string[]
  menus: number
  chained: number
  stalledAt: string | null
  battles: string[]
  services: { name: string, count: number }[]
  /** 파일 번호 → 읽은 명령 주소(정렬) */
  visited: Record<string, number[]>
}

interface RunOpts {
  /** 몇 회차인가 — 메뉴에서 0은 첫째 · 1은 둘째 칸을 고른다 */
  round: number
  /** 이만큼 지나면 끊는다 (ms) */
  timeoutMs?: number
  /** 이만큼 명령이 안 오르면 멈춘 것이다 (ms) */
  stallMs?: number
  /**
   * 내 판이 한 번 끝나면 거기서 끝낸다.
   *
   * ⚠️ **맵의 매 프레임 표가 곧바로 새 판을 거는 자리가 있다** — 변수가 안 바뀌는 채로 `LockAll` 뒤 `End`로 끝나는 장면(물가시티의
   * `OnFrame_Flint`는 z가 790 · 791이 아니면 `ReleaseAll` 없이 끝난다)이 그렇다. 놓아주기를 기다리면 영영 안 놓인다
   */
  stopAtEnd?: boolean
}

const busy = (): boolean => fieldScripts.ctx !== null || marks().script

/**
 * 멈춘 판이 화면(상점 · 낱말 고르기 · 저장)을 쥔 채 끝났을 수 있다 — 열린 채로 두면 다음 판의 키가 그 화면으로 가서 **뒤따른 판이
 * 전부 대사에서 멈춘 것으로** 나온다(실측: 베일스톤 지하 상점). B를 눌러 보고 메뉴 스택을 비운다
 */
async function closeUi(): Promise<void> {
  for (let i = 0; i < 4; i++) { tap('KeyX'); tap('Escape'); await frame() }
  useMenuStore.getState().closeAll()
  await frame()
}

/** 변수·플래그를 통째로 떠 둔다 — 한 판 뒤에 되돌린다 */
function snapshot() {
  const save = useSaveStore.getState()
  return {
    saved: Uint16Array.from(fieldScripts.vars.saved),
    flags: Uint8Array.from(fieldScripts.vars.flags),
    party: save.party, bag: save.bag, money: save.money,
  }
}

function restore(snap: ReturnType<typeof snapshot>): void {
  const vars = fieldScripts.vars
  vars.saved.set(snap.saved)
  vars.flags.set(snap.flags)
  useSaveStore.setState({ party: snap.party, bag: snap.bag, money: snap.money })
  useSaveStore.getState().commitScriptState(vars.saved, vars.flags)
}

function applyPre(pre: readonly Pre[]): void {
  const vars = fieldScripts.vars
  for (const p of pre) {
    if ('clearFlag' in p) vars.clearFlag(p.clearFlag)
    else if ('setFlag' in p) vars.setFlag(p.setFlag)
    else vars.set(p.setVar, p.valueOf !== undefined ? vars.get(p.valueOf) : (p.value ?? 0))
  }
}

/**
 * 도는 스크립트를 **끝까지** 민다. 이미 걸려 있어야 한다.
 *
 * @returns 끝난 모습. `stall`이면 마지막으로 읽은 명령이 어디서 섰는지 알려 준다
 */
async function drive(opts: RunOpts): Promise<{
  status: RunStatus, taps: number, chained: number, stalledAt: string | null,
}> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const stallMs = opts.stallMs ?? 15_000
  const t0 = performance.now()
  let taps = 0
  let chained = 0
  let lastProgress = performance.now()
  let seen = ''
  let idleFrames = 0
  let seenMenu: unknown = null
  const visits = new Map<string, number>()
  let escTried = 0
  for (let n = 0; ; n++) {
    await frame()
    const now = performance.now()
    if (now - t0 > timeoutMs) {
      abortScript()
      return { status: 'timeout', taps, chained, stalledAt: trace.last.at(-1) ?? null }
    }
    const world = fieldScripts.world
    if (opts.stopAtEnd === true && trace.ended > 0) {
      abortScript()
      return { status: 'done', taps, chained, stalledAt: null }
    }
    if (!busy()) {
      // 끝났다. 바로 뒤에 매 프레임 표가 새 판을 거는 수가 있어 두 프레임 더 본다
      idleFrames++
      if (idleFrames >= 4) return { status: 'done', taps, chained, stalledAt: null }
      continue
    }
    if (idleFrames > 0) { chained++; idleFrames = 0; if (chained > 6) { abortScript(); return { status: 'done', taps, chained, stalledAt: null } } }
    if (marks().scene === 'battle') {
      abortScript()
      return { status: 'battle', taps, chained, stalledAt: 'battle' }
    }
    // 메뉴가 떠 있으면 회차가 고르는 칸을 고른다 — 한 메뉴에 한 번만
    if (world?.menu != null) {
      if (seenMenu !== world.menu) {
        seenMenu = world.menu
        trace.menus++
        const entries = world.menu.entries
        // 같은 자리의 메뉴가 거듭 뜨면 한 칸씩 돌려 고른다 — 끝 칸(나가기)에 닿아야 끝나는 칠판 · 안내판이 있다.
        // 너무 많이 뜨면 끝 칸으로 못 박는다
        const site = `${String(trace.file)}:${String(fieldScripts.ctx?.pointer ?? -1)}`
        const visit = visits.get(site) ?? 0
        visits.set(site, visit + 1)
        const pick = entries[trace.menus > 40 ? entries.length - 1 : (opts.round + visit) % Math.max(1, entries.length)]
        if (pick !== undefined) world.choose(pick.value)
        else world.choose(-2)
      }
    } else if (n % 3 === 0) {
      tap('Space')
      taps++
    }
    // 진행 지문 — 명령 수 · 대사 수 · 메뉴 수. 하나라도 오르면 살아 있다
    const sig = `${String(trace.ops)}|${String(trace.msgs)}|${String(trace.menus)}|${String(fieldScripts.ctx?.pointer ?? '')}`
    if (sig !== seen) { seen = sig; lastProgress = now; escTried = 0 }
    else if (now - lastProgress > stallMs) {
      // 화면이 쥐고 있을 수 있다 — B로 닫아 본다. 그래도 안 풀리면 멈춘 것이다
      if (escTried < 3) {
        escTried++
        tap('KeyX'); tap('Escape')
        lastProgress = now - stallMs + 2_000
      } else {
        const at = `${trace.last.at(-1) ?? '?'}`
        abortScript()
        return { status: 'stall', taps, chained, stalledAt: at }
      }
    }
  }
}

function report(
  site: SweepSite, round: number, ms: number, run: Awaited<ReturnType<typeof drive>> | null,
  status: RunStatus,
): RunReport {
  const visited: Record<string, number[]> = {}
  for (const [file, set] of trace.visited) visited[String(file)] = [...set].sort((a, b) => a - b)
  return {
    key: site.key, kind: site.kind, round, status, ms: Math.round(ms), taps: run?.taps ?? 0,
    starts: trace.starts.length, msgs: trace.msgs, empty: trace.empty, errors: trace.errors,
    unimpl: [...trace.unimpl].map(([name, count]) => ({ name, count })),
    unimplAt: trace.unimplAt, ops: trace.ops, lastOps: trace.last, menus: trace.menus,
    chained: run?.chained ?? 0, stalledAt: run?.stalledAt ?? null, battles: trace.battles,
    services: [...trace.services].map(([name, count]) => ({ name, count })), visited,
  }
}

/**
 * 스크립트 하나를 건다 → 끝까지 민다 → 기록한다 → 변수를 되돌린다.
 *
 * 지금 그 맵에 서 있어야 한다 (`gotoMap`)
 */
export async function runSite(site: SweepSite, opts: RunOpts): Promise<RunReport> {
  const snap = snapshot()
  abortScript()
  applyPre(site.pre)
  trace = newTrace()
  battleState.won = false
  const t0 = performance.now()
  try {
    // 맵 글이 오기 전에는 `start`가 거절한다 — 한동안 다시 두드린다
    let started = false
    for (let tries = 0; tries < 200 && !started; tries++) {
      if (busy()) abortScript()
      if (mapWorld.pending === null && fieldScripts.varsReady) {
        started = startScript(site.script, site.mapFile, site.local)
      }
      if (!started) await frame()
    }
    if (!started) return report(site, opts.round, performance.now() - t0, null, 'refused')
    const run = await drive(opts)
    if (run.status === 'stall' || run.status === 'timeout') await closeUi()
    return report(site, opts.round, performance.now() - t0, run, run.status)
  } catch (e) {
    trace.errors.push(`하네스: ${e instanceof Error ? e.message : String(e)}`)
    abortScript()
    return report(site, opts.round, performance.now() - t0, null, 'error')
  } finally {
    abortScript()
    restore(snap)
  }
}

// ── 맵 옮기기 ────────────────────────────────────────────────────────────────

/** 이 맵에 섰는가 — 맵 번호 · 옮기는 중이 아님 · 변수가 부어짐 */
const there = (map: number): boolean =>
  marks().map === map && mapWorld.mapId === map && mapWorld.pending === null
  && fieldScripts.varsReady && !worldState.restoring
  // ⚠️ **맵 번호가 서는 것과 `enterMap`이 도는 것은 다른 프레임이다.** 그 틈에 걸면 앞 맵의 글 뱅크로 읽는다(`start`의 뱅크 대기는
  // `enterMap`이 세운 뒤에야 걸린다) — 실측으로 빈 대사 54건이 전부 이 틈이었다. 뱅크 번호가 맵 것이 된 뒤에야 선 것이다
  && fieldScripts.bank === mapById(map)?.msg

async function waitFor(ok: () => boolean, ms: number): Promise<boolean> {
  const t0 = performance.now()
  while (performance.now() - t0 < ms) {
    if (ok()) return true
    await sleep(100)
  }
  return ok()
}

/**
 * 순간이동이 끝나기를 기다린다.
 *
 * ⚠️ **같은 맵으로 옮길 때는 맵 번호가 안 바뀐다.** 씬이 줄을 받아 가는(`devWarp.pending`이 비는) 것을 먼저 보고,
 * 격자를 받아 `enter`가 도는 틈을 지난 뒤에 맵 번호를 본다
 */
async function arrive(map: number): Promise<void> {
  await waitFor(() => devWarp.pending === null, 20_000)
  await sleep(1_200)
  await waitFor(() => there(map), 90_000)
}

/** 순간이동 줄 하나 — 조건은 이미 채워져 있으므로 자리만 준다 */
function stripped(map: number, spot: Checkpoint['spot']): Checkpoint {
  return { id: 'script-sweep', label: '스크립트 전수', env: '', try: [], map, spot }
}

/** 맵으로 간다. 도착한 뒤 맵이 거는 장면(`OnFrame` 따위)은 끝까지 밀어 둔다 */
export async function gotoMap(
  map: number, spot: Checkpoint['spot'] = { kind: 'open' }, prep: readonly number[] = [],
): Promise<{ ok: boolean, ms: number, natural: Awaited<ReturnType<typeof drive>> | null }> {
  const t0 = performance.now()
  abortScript()
  for (const f of prep) fieldScripts.vars.clearFlag(f)
  useSaveStore.getState().commitScriptState(fieldScripts.vars.saved, fieldScripts.vars.flags)
  trace = newTrace()
  battleState.won = false
  await warpTo(stripped(map, spot))
  await arrive(map)
  const ok = there(map)
  if (!ok) return { ok: false, ms: performance.now() - t0, natural: null }
  await sleep(500)
  // 도착하며 걸린 장면이 있으면 민다 — 없으면 바로 돌아온다
  const natural = busy() ? await drive({ round: 0, timeoutMs: 90_000 }) : null
  return { ok: true, ms: performance.now() - t0, natural }
}

export function naturalTrace(): RunReport {
  return report({ key: 'natural', kind: 'natural', script: 0, mapFile: 0, local: 0, pre: [] }, 0, 0, null, 'done')
}

// ── 걷기 표본 ────────────────────────────────────────────────────────────────

interface Placement { x: number, z: number, facing: number }

/** 그 칸 둘레에서 설 수 있는 칸 하나 — 막히지 않고 사람이 안 선 칸. 카운터 너머도 본다 */
async function standNear(map: number, tx: number, tz: number): Promise<Placement | null> {
  const header = mapById(map)
  if (!header) return null
  const grid = await gridFor(header.matrix)
  const people = npcsOf(map)
  const taken = (x: number, z: number): boolean => people.some((p) => p.x === x && p.z === z)
  for (const d of [1, 2]) {
    for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
      const x = tx + dx * d
      const z = tz + dz * d
      if (grid.isBlocked(x, z) || taken(x, z)) continue
      // 사이 칸(카운터)이 사람이 아닌지 — 둘째 칸이면 첫 칸이 막혀 있어야 말이 닿는다
      if (d === 2 && !grid.isBlocked(tx + dx, tz + dz)) continue
      return { x, z, facing: Math.atan2(-dx, -dz) }
    }
  }
  return null
}

interface WalkSample {
  kind: 'npc' | 'sign' | 'trigger'
  /** 기대하는 스크립트의 (파일:진입점). 걸린 것이 이것과 같아야 한다 */
  expect: string | null
  /** 이 표본이 어디까지 갔나 */
  stood: boolean
  started: boolean
  matched: boolean
  starts: string[]
  detail: string
  status: RunStatus | null
  taps: number
}

/**
 * 진짜 입력으로 말을 건다 / 좌표 사건으로 걸어 들어간다.
 *
 * @param target 말을 걸 칸 (사람 · 간판) 또는 좌표 사건 칸
 * @param expect 걸려야 할 `파일:진입점` — 사람이 가린 경우 등으로 어긋날 수 있다. 어긋남은 결함 후보로만 적는다
 */
export async function walkSample(
  map: number, kind: WalkSample['kind'], tx: number, tz: number, expect: string | null,
  opts: RunOpts, pre: readonly Pre[] = [],
): Promise<WalkSample> {
  const out: WalkSample = {
    kind, expect, stood: false, started: false, matched: false, starts: [], detail: '', status: null, taps: 0,
  }
  const at = await standNear(map, tx, tz)
  if (at === null) { out.detail = '설 자리를 못 찾았다'; return out }
  abortScript()
  trace = newTrace()
  await warpTo(stripped(map, { kind: 'tile', x: at.x, z: at.z, facing: at.facing }))
  await arrive(map)
  await sleep(700)
  abortScript()
  out.stood = true
  const snap = snapshot()
  applyPre(pre)
  trace = newTrace()
  battleState.won = false
  try {
    if (kind === 'trigger') {
      // 한 칸 앞에서 그 칸으로 걸어 들어간다 — 방향키를 눌러 두고 칸이 바뀔 때까지
      const dir = [
        { code: 'KeyS', x: 0, z: 1 }, { code: 'KeyD', x: 1, z: 0 },
        { code: 'KeyW', x: 0, z: -1 }, { code: 'KeyA', x: -1, z: 0 },
      ].map((d) => ({ ...d, dot: Math.sin(at.facing) * d.x + Math.cos(at.facing) * d.z }))
        .sort((a, b) => b.dot - a.dot)[0]!
      window.dispatchEvent(new KeyboardEvent('keydown', { code: dir.code, bubbles: true }))
      const t0 = performance.now()
      while (performance.now() - t0 < 2500 && trace.starts.length === 0 && !busy()) await frame()
      window.dispatchEvent(new KeyboardEvent('keyup', { code: dir.code, bubbles: true }))
    } else {
      tap('Space')
      const t0 = performance.now()
      while (performance.now() - t0 < 1500 && trace.starts.length === 0 && !busy()) await frame()
    }
    out.started = trace.starts.length > 0 || busy()
    if (out.started) {
      const run = await drive(opts)
      out.status = run.status
      out.taps = run.taps
    }
    out.starts = trace.starts.map((s) => `${String(s.file)}:${String(s.entry)}${s.kind === 'run' ? '' : `(${s.kind})`}`)
    out.matched = expect !== null && out.starts.some((s) => s === expect)
    if (!out.started) {
      // 왜 안 걸렸나를 가르는 값 — 서 있는 칸 · 바라보는 쪽 · 목표 칸 둘레의 사람 (우리가 정한 자리와 실제가 같은가)
      const p = worldState.player.position
      out.detail = `말이 안 걸렸다 ${JSON.stringify({
        stand: [at.x, at.z], now: [+p.x.toFixed(2), +p.z.toFixed(2)], facing: +worldState.player.facing.toFixed(2),
        want: +at.facing.toFixed(2), target: [tx, tz],
        near: npcActors.list.filter((a) => Math.abs(a.x - tx) < 3 && Math.abs(a.z - tz) < 3)
          .map((a) => [a.info.localID, +a.x.toFixed(1), +a.z.toFixed(1), a.visible]),
      })}`
    }
  } finally {
    abortScript()
    restore(snap)
  }
  return out
}

// ── 바깥 손잡이 ──────────────────────────────────────────────────────────────

const devScriptLog = {
  runSite, gotoMap, walkSample, naturalTrace,
  /** 지금 서 있는 맵의 사람 · 간판 · 사건 수 — 걷기 표본이 쓸 칸을 고르는 데 쓴다 */
  eventsOf: (map: number) => ({
    npcs: npcsOf(map).length, signs: signsOf(map).length, triggers: triggersOf(map).length,
  }),
  /** 맵에 서 있는 사람 번호 — 숨김 플래그를 지운 뒤 실제로 세워졌는지 본다 */
  actorLocals: (): number[] => [...npcActors.list].map((a) => a.info.localID),
  /** 글 뱅크 상태 — 맵 헤더의 뱅크 번호 · 지금 맵 글이 몇 줄인가 */
  bankInfo: () => ({
    want: mapById(mapWorld.mapId)?.msg ?? -1, have: fieldScripts.bank,
    lines: (fieldScripts.world as unknown as { messages?: readonly string[] } | null)?.messages?.length ?? -1,
  }),
  /** 감싼 배틀의 결과를 정한다 — 진 갈래(전멸)를 밟아 볼 때 */
  setBattleOutcome: (outcome: 'win' | 'loss'): void => { battleState.outcome = outcome },
  /** 지금 선 맵 — 스크립트가 맵을 옮겼는지 보는 데 쓴다 (옮기는 중이면 −1) */
  currentMap: (): number => (mapWorld.pending === null ? mapWorld.mapId : -1),
}

/**
 * 서비스 묶음을 **늘** 감싸서 내준다 — 씬이 새로 달아도(`fieldScripts.services = …`) 그 값을 받아 감싼다. 맵에 들어서며 도는
 * 장면(리그 방의 배틀 따위)도 배틀을 안 열어야 하므로 판마다가 아니라 설치할 때 한 번이다
 */
function installServiceWrap(): void {
  let wrapped = wrapServices(fieldScripts.services, '')
  Object.defineProperty(fieldScripts, 'services', {
    configurable: true,
    get: () => wrapped,
    set: (next: typeof fieldScripts.services) => { wrapped = wrapServices(next, '') },
  })
  if (fieldScripts.world !== null) fieldScripts.world.services = wrapped
}

export function installDevScriptLog(): void {
  installSpy()
  installServiceWrap()
  ;(globalThis as { __scriptSweep?: typeof devScriptLog }).__scriptSweep = devScriptLog
}
