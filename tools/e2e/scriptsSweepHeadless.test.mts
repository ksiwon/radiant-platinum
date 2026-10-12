// 스크립트 전수 점검의 **브라우저 없는 반쪽** — 정적 닿는 곳 셈과 VM 몰기 (지시서 GAPS_20261011 「H. 스크립트 · 이벤트 전수」)
//
//     SCRIPT_SWEEP_HEADLESS=1 npx vitest run tools/e2e/scriptsSweepHeadless.test.mts
//       → .audit/scripts-sweep/headless.json
//
// 이 파일이 재는 것은 둘이다.
//   ① **정적** — 범위 안 시작 자리(`scriptsSweepList`)에서 닿는 모든 명령을 바이트코드째 걸어 센다. 구현이 없는 명령(`skipper`가
//      건너뜀) · 표에 없는 opcode(`ScriptError`) · **빈 대사**(그 번호가 뱅크에 없거나 빈 글)는 실행 없이도 **전부** 나온다.
//   ② **동적** — 시작 자리마다 진짜 VM(`ScriptContext` · `scriptSystem`)으로 끝까지 몬다. 조건 분기는 **뒤집어서** 모든 가지를 간다
//      (`GoToIf` · `CallIf`를 순서대로 뒤집는 깊이 우선 — 최대 `MAX_RUNS`판). 뒤집은 가지는 앞 스크립트가 세워 줘야 닿는 길이라 **현실에
//      없는 상태**일 수 있다 — 그래서 오류 · 멈춤은 「자연 판」과 「뒤집은 판」을 갈라 적는다.
//
// ⚠️ **바깥 일감은 다 끝난 것으로 답한다**(`allDoneServices`) — 배틀은 이기고 화면은 곧바로 닫힌다. 여기서 재는 것은 스크립트 줄이
// 끝까지 가는가이지 화면이 아니다. 화면이 쥐는 자리는 브라우저 판(`scriptsSweep.mjs`)이 잰다.
//
// 환경변수가 없으면 이 파일은 빠진다 — 몇 분 걸리는 훑기라 `pnpm check`에 안 넣는다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — tools/는 타입 검사 밖의 순수 JS다
import { buildList } from './scriptsSweepList.mjs'
import type { EventFile, MapHeader } from '../../src/engine/map/world'
import { world as mapWorld } from '../../src/engine/map/world'
import { worldState } from '../../src/state/worldState'
import { buildCommands, HANDLERS } from '../../src/engine/script/commands'
import { conditionHolds, operandWidth, type CommandFn } from '../../src/engine/script/context'
import { parseScriptMeta, resolveScript } from '../../src/engine/script/data'
import {
  abortScript, enterMap, fieldScripts, makeWorld, scriptBusy, scriptSystem, start,
} from '../../src/engine/script/field'
import { scriptSpy } from '../../src/engine/script/spy'
import { screenFade } from '../../src/engine/script/fade'
import { objectFxTick } from '../../src/engine/actor/objectFx'
import { TRAINER_DEFEATED_FLAGS_START } from '../../src/engine/script/commands'
import { VarStore, VAR_LAST_TALKED } from '../../src/engine/script/vars'
import { installNodeAssets, withData } from '../../src/data/romData.testkit'
import { allDoneServices } from '../../src/engine/script/services.testkit'

const DATA = resolve(import.meta.dirname, '../../public/data')
const OUT = resolve(import.meta.dirname, '../../.audit/scripts-sweep')
const RUN = process.env.SCRIPT_SWEEP_HEADLESS === '1'
const maybe = RUN ? withData('scripts.bin', 'events.json', 'maps.json') : describe.skip

const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 자연 판 한 번이 쓸 프레임 상한. 60프레임이 1초라 100초다 */
const FRAME_CAP = 6_000
/** 뒤집은 판은 고리에 잘 빠지므로 짧게 끊는다 */
const FLIP_FRAME_CAP = 1_500
/** 시작 자리 하나에 돌 판 수 상한 */
const MAX_RUNS = 24
/** 뒤집는 분기의 깊이 상한 */
const MAX_DEPTH = 40

interface Decision { natural: boolean, taken: boolean }

interface RunRecord {
  variant: string
  status: 'done' | 'stall' | 'error'
  frames: number
  ops: number
  decisions: number
  menus: number
  errors: string[]
  unimpl: Record<string, number>
  empty: { file: number, id: number, bank: number }[]
  lastOps: string[]
  stalledAt: string | null
  /** 멈췄을 때 창 · 메뉴 · 인쇄기의 모습 */
  stallInfo?: string
}

interface StaticSite { file: number, at: number, name: string }

maybe('스크립트 전수 점검 — 브라우저 없는 반쪽', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const events = (read('events.json') as { events: Record<string, EventFile> }).events
  const list = buildList(DATA) as {
    maps: { map: number, name: string, mapFile: number, sites: {
      kind: string, script: number, key: string, file: number, entry: number, fileName: string, common: boolean,
      local?: number, pre: ({ clearFlag: number } | { setVar: number, value?: number, valueOf?: number })[], auto?: boolean, trainer?: number,
    }[] }[]
    excluded: { map: number, why: string }[]
    keys: number
  }
  const NAME = new Map(meta.commands.map((c, i) => [c.name, i]))
  const dialogue = new Map<number, string[]>()
  const bankOf = (msg: number): string[] => {
    let hit = dialogue.get(msg)
    if (hit === undefined) {
      const file = resolve(DATA, `dialogue/ko/${String(msg)}.json`)
      hit = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as string[] : []
      dialogue.set(msg, hit)
    }
    return hit
  }

  /** 파일이 읽는 글 뱅크 — 공용 구역 파일은 그 구역 뱅크, 맵 파일은 맵 헤더의 `msg` */
  const fileBank = new Map<number, number>()
  for (const range of meta.ranges) if (range.file !== null && range.msg !== null) fileBank.set(range.file, range.msg)
  for (const m of maps) if (!fileBank.has(m.scripts)) fileBank.set(m.scripts, m.msg)

  // ── ① 정적 ────────────────────────────────────────────────────────────────

  const JUMPS = new Set(meta.commands
    .map((c, i) => ((/^(GoTo|Call)/.test(c.name) && String(c.args).includes('*')) ? i : -1)).filter((i) => i >= 0))
  const STOP = new Set(['End', 'Return', 'ReturnCommonScript'].map((n) => NAME.get(n)!))
  const GOTO = NAME.get('GoTo')!
  const CALL_COMMON = NAME.get('CallCommonScript')!
  /** 글 번호를 상수로 읽을 수 있는 명령 → 읽는 폭 */
  const MESSAGE_OPS = new Map<number, number>([
    ['Message', 1], ['MessageInstant', 1], ['MessageSynchronized', 1],
    ['MessageVar', 2], ['MessageNoSkip', 2], ['MessageAutoScroll', 2], ['MessageUnown', 2],
  ].map(([n, w]) => [NAME.get(n as string)!, w as number]))

  function entryAddress(file: number, entry: number): number {
    const info = meta.files[file]!
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return entry * 4 + 4 + view.getInt32(info.at + entry * 4, true)
  }

  const reached = new Map<number, Set<number>>()
  const staticUnimpl: StaticSite[] = []
  const staticEmpty: { file: number, at: number, id: number, bank: number, op: string }[] = []
  const staticOffTable: { file: number, at: number }[] = []
  /** 공용 호출이 가리키는 (파일:진입점) — 시작 자리가 아니어도 같이 센다 */
  const callTargets = new Set<string>()

  function walkFile(file: number, entries: number[]): void {
    const info = meta.files[file]!
    const buf = bytes.subarray(info.at, info.at + info.size)
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    let seen = reached.get(file)
    if (seen === undefined) { seen = new Set(); reached.set(file, seen) }
    const todo = [...entries]
    while (todo.length > 0) {
      let at = todo.pop()!
      for (;;) {
        if (at < 0 || at + 2 > buf.length || seen.has(at)) break
        seen.add(at)
        const opcode = view.getUint16(at, true)
        const cmd = meta.commands[opcode]
        if (cmd === undefined) { staticOffTable.push({ file, at }); break }
        if (!HANDLERS.has(cmd.name)) staticUnimpl.push({ file, at, name: cmd.name })
        const argAt = at + 2
        const width = operandWidth(cmd, view, argAt)
        const width1 = MESSAGE_OPS.get(opcode)
        if (width1 !== undefined) {
          const id = width1 === 1 ? view.getUint8(argAt) : view.getUint16(argAt, true)
          // `MessageVar`는 번호가 변수다 — 0x4000 아래면 상수고, 위면 값이 런타임에 정해진다
          if (id < 0x4000) {
            const msg = fileBank.get(file)
            const text = msg === undefined ? undefined : bankOf(msg)[id]
            if (text === undefined || text === '') {
              staticEmpty.push({ file, at, id, bank: msg ?? -1, op: cmd.name })
            }
          }
        }
        if (opcode === CALL_COMMON) {
          const target = resolveScript(meta, view.getUint16(argAt, true), -1)
          if (target !== null) callTargets.add(`${String(target.file)}:${String(target.entry)}`)
        }
        let off = argAt
        for (const spec of String(cmd.args).split(' ').filter(Boolean)) {
          const size = Number(spec[0])
          if (spec.endsWith('*') && size === 4 && JUMPS.has(opcode)) todo.push(off + 4 + view.getInt32(off, true))
          off += size
        }
        if (STOP.has(opcode) || opcode === GOTO) break
        at = argAt + width
      }
    }
  }

  function staticPass(): void {
    const byFile = new Map<number, Set<number>>()
    const add = (file: number, entry: number): void => {
      let set = byFile.get(file)
      if (set === undefined) { set = new Set(); byFile.set(file, set) }
      set.add(entry)
    }
    for (const m of list.maps) for (const s of m.sites) add(s.file, s.entry)
    // 공용 호출은 닿는 대로 따라간다 — 호출이 또 호출을 부른다
    for (let round = 0; round < 6; round++) {
      for (const [file, entries] of byFile) walkFile(file, [...entries].map((e) => entryAddress(file, e)))
      const before = [...byFile.values()].reduce((n, s) => n + s.size, 0)
      for (const key of callTargets) {
        const [f, e] = key.split(':').map(Number) as [number, number]
        if (meta.files[f]?.kind === 'code') add(f, e)
      }
      if ([...byFile.values()].reduce((n, s) => n + s.size, 0) === before) break
    }
  }

  // ── ② 동적 ────────────────────────────────────────────────────────────────

  const yieldToLoop = async (): Promise<void> => new Promise((done) => { setImmediate(done) })

  /** 이번 판의 기록 */
  let cur: RunRecord & { visited: Map<number, Set<number>>, file: number }
  let decisions: Decision[] = []
  let forced: boolean[] = []
  /** 메뉴에서 몇 번째 칸을 고르는가 */
  let menuPick = 0
  let flipped = false

  const opNames = meta.commands.map((c) => c.name)
  const sweepVisited = new Map<number, Set<number>>()

  function installCommands(): void {
    const built = buildCommands(meta.commands)
    const named = new Map<number, CommandFn>()
    const GOTOIF = NAME.get('GoToIf')!
    const CALLIF = NAME.get('CallIf')!
    const GOTO_TD = NAME.get('GoToIfTargetTrainerDefeated')!
    for (const [op, fn] of built.map) {
      if (op === GOTOIF || op === CALLIF) {
        named.set(op, (ctx) => {
          const condition = ctx.readByte()
          const target = ctx.readTarget()
          const natural = conditionHolds(condition, ctx.comparisonResult)
          const i = decisions.length
          const taken = flipped && i < forced.length ? forced[i]! : natural
          decisions.push({ natural, taken })
          if (taken) { if (op === GOTOIF) ctx.jump(target); else ctx.call(target) }
          return false
        })
      } else if (op === GOTO_TD) {
        named.set(op, (ctx) => {
          const target = ctx.readTarget()
          const natural = ctx.host.vars.checkFlag(TRAINER_DEFEATED_FLAGS_START + ctx.host.vars.get(VAR_LAST_TALKED))
          const i = decisions.length
          const taken = flipped && i < forced.length ? forced[i]! : natural
          decisions.push({ natural, taken })
          if (taken) ctx.jump(target)
          return false
        })
      } else named.set(op, fn)
    }
    fieldScripts.commands = { map: named, unhandled: built.unhandled }
  }

  function installSpy(): void {
    scriptSpy.start = (info) => { cur.file = info.file }
    scriptSpy.error = (message, where) => { cur.errors.push(`${where}: ${message}`.slice(0, 240)) }
    scriptSpy.unimplemented = (name) => { cur.unimpl[name] = (cur.unimpl[name] ?? 0) + 1 }
    scriptSpy.message = (id, text, bank) => { if (text === '') cur.empty.push({ file: cur.file, id, bank }) }
    scriptSpy.opcode = (opcode, file, at) => {
      cur.ops++
      let set = cur.visited.get(file)
      if (set === undefined) { set = new Set(); cur.visited.set(file, set) }
      set.add(at)
      cur.lastOps.push(opNames[opcode] ?? String(opcode))
      if (cur.lastOps.length > 8) cur.lastOps.shift()
    }
  }

  /** 시작 자리 하나를 한 번 몬다 */
  async function runOnce(
    mapId: number, header: MapHeader, site: typeof list.maps[number]['sites'][number], prep: number[],
    variant: string, cap: number,
  ): Promise<RunRecord & { visited: Map<number, Set<number>> }> {
    cur = {
      variant, status: 'done', frames: 0, ops: 0, decisions: 0, menus: 0, errors: [], unimpl: {}, empty: [],
      lastOps: [], stalledAt: null, visited: new Map(), file: -1,
    }
    decisions = []
    abortScript()
    const vars = fieldScripts.vars
    vars.reset()
    for (const f of prep) vars.clearFlag(f)
    for (const p of site.pre) {
      if ('clearFlag' in p) vars.clearFlag(p.clearFlag)
      else vars.set(p.setVar, p.valueOf !== undefined ? vars.get(p.valueOf) : (p.value ?? 0))
    }
    mapWorld.mapId = mapId
    enterMap(mapId)
    await yieldToLoop()
    // 맵 글이 오기를 기다린다 — 안 기다리면 `start`가 거절한다
    let started = false
    for (let tries = 0; tries < 200 && !started; tries++) {
      started = start(site.script, header.scripts, site.local ?? 0)
      if (!started) await yieldToLoop()
    }
    if (!started) { cur.status = 'error'; cur.errors.push('start()가 거절했다'); return cur }
    // `start`가 지역 칸을 비우므로 트레이너 번호는 그 뒤에 적을 필요가 없다 — 스크립트가 알아서 읽는다
    const world = fieldScripts.world!
    let seenMenu: unknown = null
    const visits = new Map<string, number>()
    let frames = 0
    for (; frames < cap && scriptBusy(); frames++) {
      worldState.input.interact = frames % 2 === 0
      if (world.menu !== null && seenMenu !== world.menu) {
        seenMenu = world.menu
        cur.menus++
        const entries = world.menu.entries
        // 같은 자리의 메뉴가 거듭 뜨면(고르면 설명하고 다시 메뉴로 돌아오는 칠판 · 안내판) 한 칸씩 돌려 고른다 —
        // 끝 칸(나가기)에 닿아야 끝난다. 늘 같은 칸만 고르면 영영 돈다. 너무 많이 뜨면 끝 칸으로 못 박는다
        const site = `${String(cur.file)}:${String(fieldScripts.ctx?.pointer ?? -1)}`
        const visit = visits.get(site) ?? 0
        visits.set(site, visit + 1)
        const last = Math.max(0, entries.length - 1)
        const pick = entries[cur.menus > 40 ? last : (menuPick + visit) % Math.max(1, entries.length)]
        world.choose(pick === undefined ? -2 : pick.value)
      }
      scriptSystem.fixedUpdate()
      // 장면이 굴리는 것들 — 사람 깜빡임 · 흔들림은 씬 시계가 굴려서 여기서 대신 굴린다
      objectFxTick(1 / 60)
      mapWorld.pending = null
      if (frames % 16 === 0) await yieldToLoop()
    }
    cur.frames = frames
    cur.decisions = decisions.length
    if (scriptBusy()) {
      cur.status = 'stall'
      cur.stalledAt = cur.lastOps.at(-1) ?? null
      cur.stallInfo = JSON.stringify({
        waiting: world.printer?.waiting ?? null, finished: world.printer?.finished ?? null,
        menu: world.menu !== null, box: world.boxOpen, ptr: fieldScripts.ctx?.pointer ?? null,
        lines: world.printer?.lines.length ?? 0, fade: screenFade.now === null ? null : [screenFade.now.elapsed, screenFade.now.frames],
      })
      abortScript()
    }
    if (cur.errors.length > 0 && cur.status === 'done') cur.status = 'error'
    return cur
  }

  it('정적 + 동적 훑기', async () => {
    mkdirSync(OUT, { recursive: true })
    // ⚠️ 글 뱅크를 디스크에서 읽게 한다 — 안 하면 뱅크가 안 와서 **모든 대사가 빈 글**로 나온다
    const uninstall = installNodeAssets()
    staticPass()

    mapWorld.maps = maps
    mapWorld.events = events
    fieldScripts.data = { meta, bytes }
    installCommands()
    installSpy()
    fieldScripts.services = allDoneServices as never
    fieldScripts.vars = new VarStore()
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    worldState.input.move.set(0, 0)
    worldState.input.cancel = false

    const only = process.env.SCRIPT_SWEEP_MAPS?.split(',').map(Number) ?? null
    const seenKeys = new Set<string>()
    const keyRows: {
      key: string, fileName: string, maps: number[], kind: string, runs: number, flipped: number,
      natural: RunRecord[], forced: RunRecord[],
    }[] = []
    const t0 = Date.now()
    let sitesRun = 0
    for (const m of list.maps) {
      if (only !== null && !only.includes(m.map)) continue
      const header = maps[m.map]!
      const prep = [...new Set(m.sites.filter((s) => s.kind === 'npc')
        .flatMap((s) => s.pre.map((p) => ('clearFlag' in p ? p.clearFlag : 0))).filter((f) => f > 0))]
      for (const site of m.sites) {
        if (site.auto === true || seenKeys.has(site.key)) continue
        seenKeys.add(site.key)
        sitesRun++
        const natural: RunRecord[] = []
        const forcedRuns: RunRecord[] = []
        // 첫 판: 자연. 메뉴가 있었으면 둘째 칸으로 한 번 더
        flipped = false
        menuPick = 0
        const first = await runOnce(m.map, header, site, prep, '자연·첫째', FRAME_CAP)
        natural.push(slim(first))
        for (const [file, set] of first.visited) mergeVisited(file, set)
        const base = decisions.slice()
        if (first.menus > 0) {
          menuPick = 1
          const second = await runOnce(m.map, header, site, prep, '자연·둘째', FRAME_CAP)
          natural.push(slim(second))
          for (const [file, set] of second.visited) mergeVisited(file, set)
          menuPick = 0
        }
        // 분기 뒤집기 — 깊이 우선. 앞 판이 만난 분기마다 반대로 가는 판을 하나씩
        const queue: boolean[][] = []
        const push = (ds: Decision[], from: number): void => {
          for (let i = Math.min(ds.length, MAX_DEPTH) - 1; i >= from; i--) {
            queue.push([...ds.slice(0, i).map((d) => d.taken), !ds[i]!.taken])
          }
        }
        push(base, 0)
        let runs = 0
        const seenVectors = new Set<string>()
        while (queue.length > 0 && runs < MAX_RUNS) {
          const prefix = queue.pop()!
          const k = prefix.join('')
          if (seenVectors.has(k)) continue
          seenVectors.add(k)
          runs++
          forced = prefix
          flipped = true
          const r = await runOnce(m.map, header, site, prep, `뒤집음 ${k}`, FLIP_FRAME_CAP)
          flipped = false
          forcedRuns.push(slim(r))
          for (const [file, set] of r.visited) mergeVisited(file, set)
          push(decisions, prefix.length)
        }
        keyRows.push({
          key: site.key, fileName: site.fileName, maps: [m.map], kind: site.kind, runs: natural.length + forcedRuns.length,
          flipped: forcedRuns.length, natural, forced: forcedRuns,
        })
        if (sitesRun % 100 === 0) console.log(`  ${String(sitesRun)}자리 · ${String(Math.round((Date.now() - t0) / 1000))}s`)
      }
    }

    // 파일별 덮음 — 정적으로 닿는 명령 중 몇이 한 번이라도 밟혔나
    const coverage: Record<string, { name: string, reachable: number, visited: number }> = {}
    for (const [file, set] of reached) {
      const v = sweepVisited.get(file)
      let hit = 0
      if (v !== undefined) for (const at of set) if (v.has(at)) hit++
      coverage[String(file)] = { name: meta.files[file]!.name, reachable: set.size, visited: hit }
    }
    const reachableTotal = [...reached.values()].reduce((n, s) => n + s.size, 0)
    const visitedTotal = Object.values(coverage).reduce((n, c) => n + c.visited, 0)

    const unimplByName = new Map<string, { sites: number, files: Set<number> }>()
    for (const u of staticUnimpl) {
      const e = unimplByName.get(u.name) ?? { sites: 0, files: new Set<number>() }
      e.sites++
      e.files.add(u.file)
      unimplByName.set(u.name, e)
    }
    const summary = {
      generatedAt: new Date().toISOString(),
      seconds: Math.round((Date.now() - t0) / 1000),
      sitesRun,
      keysTotal: list.keys,
      runs: keyRows.reduce((n, r) => n + r.runs, 0),
      reachableCommands: reachableTotal,
      visitedCommands: visitedTotal,
      staticUnimplSites: staticUnimpl.length,
      staticUnimplKinds: unimplByName.size,
      staticEmptyMessages: staticEmpty.length,
      staticOffTable: staticOffTable.length,
    }
    writeFileSync(resolve(OUT, 'headless.json'), JSON.stringify({
      summary,
      unimpl: [...unimplByName].sort((a, b) => b[1].sites - a[1].sites)
        .map(([name, e]) => ({
          name, sites: e.sites,
          files: [...e.files].map((f) => meta.files[f]!.name),
          at: staticUnimpl.filter((u) => u.name === name).slice(0, 12)
            .map((u) => `${meta.files[u.file]!.name}+0x${u.at.toString(16)}`),
        })),
      staticEmpty: staticEmpty.map((e) => ({ ...e, fileName: meta.files[e.file]!.name })),
      staticOffTable: staticOffTable.map((e) => ({ ...e, fileName: meta.files[e.file]!.name })),
      coverage,
      keys: keyRows,
    }))
    console.log(JSON.stringify(summary))
    uninstall()
    // ⚠️ 비어 있으면 뜻이 없다 — 하나도 안 돌았는데 초록이면 안 된다
    expect(sitesRun).toBeGreaterThan(only === null ? 1_000 : 0)
    expect(visitedTotal).toBeGreaterThan(only === null ? 1_000 : 0)
  }, 6 * 3_600_000)

  function mergeVisited(file: number, set: Set<number>): void {
    let all = sweepVisited.get(file)
    if (all === undefined) { all = new Set(); sweepVisited.set(file, all) }
    for (const at of set) all.add(at)
  }

  function slim(r: RunRecord & { visited?: Map<number, Set<number>> }): RunRecord {
    const { visited: _visited, ...rest } = r as RunRecord & { visited?: unknown }
    void _visited
    return rest
  }
})
