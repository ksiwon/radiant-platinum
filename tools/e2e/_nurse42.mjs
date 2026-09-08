// 짧은 재현 — **무쇠 센터(48)의 간호사에게 왜 말을 못 거는가**
//
//     node tools/e2e/_nurse42.mjs [--headed] [--save=.audit/journey/seg-10.rpsave]
//
// ⚠️ **여기까지 와 본 적이 없었다.** 2026-09-08 최종 판에서 **예산이 남은 채로**
// 처음 재현됐다 — 무쇠시티·탄광·체육관에 다 걸어 닿았는데 「간호사에게 못
// 걸었다」로 회복이 안 서서 관장에게 안 갔다.
//
// ── 재는 값은 **제품이 실제로 쓰는 것**이다 ────────────────────────────────
//
// ⚠️ **앞 판의 이 파일은 없는 값을 읽고 있었다.** `world.ts`에서 `tileInFront`와
// `FACING_STEP`을 꺼냈는데, 앞엣것은 `script/field.ts`에 있고 뒤엣것은 **어느
// 모듈에서도 export하지 않는다**(`world.ts` 511줄 · `field.ts` 889줄 둘 다
// 모듈 안에서만 산다). 그래서 `front`도 `step`도 `null`이 되고 `reach`까지
// 통째로 `null`인데, 그 판은 그것을 **정상 진단처럼 적었을** 것이다. 없는 값을
// null로 접어 넣고 나아가지 않는다 — 여기서는 셋 다 제품에서 가져온다:
//
//   · `field.ts`  `tileInFront` · `npcAt` · `fieldScripts`  (전부 export돼 있다)
//   · `world.ts`  `talkTile` · `quarterOf` · `world`        (전부 export돼 있다)
//   · 걸음 벡터   **베끼지 않고** `tileInFront`의 답에서 빼서 얻는다 —
//                 `front − floor(자리)`가 곧 제품이 쓴 `FACING_STEP[quarter]`다
//
// 진단용으로 같은 셈을 다시 적으면 **제품과 다른 답**을 재게 된다. 실제로
// `tryTalk`(`field.ts` 948줄)이 하는 차례가 이것이고, 여기서도 그 차례다:
//
//     front = tileInFront(x, z, facing)
//     reach = talkTile(grid, front, step)      ← 앞 칸이 계산대(0x80)면 한 칸 더
//     npc   = npcAt(mapId, reach.x, reach.z, vars)
//     npc && npc.script !== NO_SCRIPT → start(...)
//
// ⚠️ **`edges.a`는 관측 불가다.** A의 상승 모서리는 `field.ts` 687줄의 모듈
// 지역 변수고 한 프레임 안에서 소모된다 — 밖에서 읽을 자리가 없다. 대신 그
// **바로 앞 단계**인 `worldState.input.interact`를 누르고 있는 동안 재서, 키가
// 제품까지 닿았는지와 모서리가 섰는지를 갈라 적는다.
//
// ⚠️ **읽기만 한다.** 사람을 옮기지도, 회복을 대신 해 주지도, 간호사 스크립트를
// 직접 돌리지도 않는다. 진행은 방향키와 A로만 만든다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/seg-10.rpsave'
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '600') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/nurse42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

/** 무쇠시티 포켓몬센터 1F. 간호사는 그 맵 스크립트의 **첫 항목**이다 */
const CENTER = 48
const NURSE = 1

const out = { stamp: STAMP, save: SAVE, steps: [], boundary: null }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}
/** 최초로 무너진 경계를 **한 번만** 적는다 */
const bound = (where, why) => {
  if (out.boundary === null) out.boundary = { where, why }
}

/**
 * 그 맵에 선 사람들 — **날 좌표 그대로**.
 *
 * ⚠️ **정수화 방식을 짐작하지 않는다.** 제품의 `npcAt`은 `Math.round(actor.x)`로
 * 견주고 주인공 쪽 `tileInFront`는 `Math.floor(x)`를 쓴다. 둘이 다른 규칙이라
 * 여기서는 **원본 · floor · round를 다 적어** 어느 쪽이 어긋나는지 보이게 한다
 */
const roster = (page) => page.evaluate(async () => {
  const m = await import('/src/engine/actor/npcs.ts')
  const reg = m.npcActors
  return {
    mapId: reg.mapId,
    list: reg.list.map((a) => ({
      script: a.info?.script ?? null,
      localID: a.localID,
      sprite: a.info?.sprite ?? null,
      raw: { x: a.x, z: a.z },
      floor: { x: Math.floor(a.x), z: Math.floor(a.z) },
      round: { x: Math.round(a.x), z: Math.round(a.z) },
      /** 배치표가 적어 둔 처음 자리 — 지금 자리와 다르면 걸어 옮긴 것이다 */
      spawn: a.info === undefined ? null : { x: a.info.x, z: a.info.z },
      move: a.info?.move ?? null,
      movementType: a.movementType ?? null,
      speed: a.speed ?? null,
      visible: a.visible !== false,
    })),
  }
})

/**
 * **왜 한 명도 안 섰는가** — `spawnNpcs`가 거르는 그 조건을 그대로 다시 읽는다.
 *
 * 배치표(`npcsOf`)는 몇 명인지, 각자의 숨김 플래그(`hideFlagOf`)가 무엇인지,
 * 그 플래그가 **지금 서 있는지**(`vars.checkFlag`)를 나란히 적는다. 셋 중
 * 어디서 잘리는지가 여기서 갈린다
 */
const spawnWhy = (page, mapId) => page.evaluate(async (map) => {
  const w = await import('/src/engine/map/world.ts')
  const f = await import('/src/engine/script/field.ts')
  const vars = f.fieldScripts.vars
  const placed = w.npcsOf(map)
  return {
    map,
    /** 헤더가 가리키는 이벤트 파일 번호 */
    header: w.mapById(map) === null ? null : w.mapById(map).events,
    placed: placed.length,
    /** 플래그 0이 서 있는가 — 배치표 대부분이 `flag: 0`이다 */
    flag0: vars.checkFlag(0),
    varsReady: f.fieldScripts.varsReady,
    rows: placed.map((n) => {
      const hide = w.hideFlagOf(n)
      return {
        localID: n.localID, script: n.script, at: { x: n.x, z: n.z },
        flag: n.flag, clone: w.isCloneNpc(n),
        hideFlag: hide,
        hidden: hide !== null && vars.checkFlag(hide),
      }
    }),
  }
}, mapId)

/**
 * **지금 A를 누르면 제품이 누구를 고르는가** — `tryTalk`의 차례를 그대로 읽는다.
 *
 * 한 시점의 값을 통째로 가져온다. 나눠서 여러 번 물으면 그 사이에 프레임이
 * 돌아 **다른 시점의 값이 섞인다**
 */
const probe = (page) => page.evaluate(async () => {
  const w = await import('/src/engine/map/world.ts')
  const f = await import('/src/engine/script/field.ts')
  const st = await import('/src/state/worldState.ts')
  const p = st.worldState.player
  const grid = w.world.grid
  const vars = f.fieldScripts.vars

  // ⚠️ 제품의 함수로 앞 칸을 얻고, **걸음 벡터는 그 답에서 되뽑는다** —
  // `FACING_STEP`은 export되지 않으므로 베끼는 대신 빼서 얻는다
  const front = f.tileInFront(p.position.x, p.position.z, p.facing)
  const step = { x: front.x - Math.floor(p.position.x), z: front.z - Math.floor(p.position.z) }
  const reach = grid === null ? front : w.talkTile(grid, front, step)

  const cell = (t) => (grid === null
    ? { ...t, behavior: null, blocked: null, grid: false }
    : { ...t, behavior: grid.behavior(t.x, t.z), blocked: grid.isBlocked(t.x, t.z), grid: true })
  const whoAt = (t) => {
    const npc = f.npcAt(w.world.mapId, t.x, t.z, vars)
    return npc === null
      ? null
      : { script: npc.script, localID: npc.localID, sprite: npc.sprite,
        spawn: { x: npc.x, z: npc.z }, trainerType: npc.trainerType }
  }
  const ctx = f.fieldScripts.ctx
  const d = document.documentElement.dataset
  return {
    map: w.world.mapId,
    matrix: w.world.matrix,
    player: {
      x: p.position.x, z: p.position.z, facing: p.facing,
      quarter: w.quarterOf(p.facing),
      tile: { x: Math.floor(p.position.x), z: Math.floor(p.position.z) },
      /** 걷는 중인가 — `moving` 같은 값은 없다. 속도로 잰다 */
      speed: +Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.z * p.velocity.z).toFixed(3),
      hop: p.hop.active, surfing: p.surfing, flying: p.flying, riding: p.riding,
    },
    step,
    front: cell(front),
    reach: cell(reach),
    /** 앞 칸의 사람과 **계산대 너머**의 사람. 제품이 고르는 것은 뒤엣것이다 */
    frontWho: whoAt(front),
    reachWho: whoAt(reach),
    /** 0xffff면 말을 걸어도 아무 일이 없다 (`NO_SCRIPT`) */
    noScript: w.NO_SCRIPT,
    input: { interact: st.worldState.input.interact, cancel: st.worldState.input.cancel },
    /** ⚠️ `edges.a`는 모듈 지역이라 **관측 불가**. 그 앞 단계만 잰다 */
    edgeA: '관측 불가 (field.ts 687줄 모듈 지역)',
    varsReady: f.fieldScripts.varsReady,
    script: ctx === null ? null : { file: ctx.file, pc: ctx.pointer },
    lastError: f.fieldScripts.lastError,
    marks: { scene: d.scene, map: d.map, tile: d.tile, talk: d.talk, menu: d.menu, script: d.script },
  }
})

/**
 * A를 누르면서 **입력이 제품까지 닿는지** 같이 잰다.
 *
 * `keyboard.down` → `worldState.input.interact`가 참이 되는지를 누르고 있는
 * 동안 몇 번 읽는다. 한 번도 안 참이면 무너진 자리는 **입력**이고, 참인데
 * 아무 일이 없으면 무너진 자리는 **대상 탐색**이다
 */
async function pressA(page) {
  await page.keyboard.down('Space')
  const seen = []
  for (let i = 0; i < 6; i++) {
    seen.push(await page.evaluate(async () => {
      const st = await import('/src/state/worldState.ts')
      return st.worldState.input.interact
    }))
    await page.waitForTimeout(12)
  }
  await page.keyboard.up('Space')
  await page.waitForTimeout(120)
  return { reached: seen.some((v) => v === true), samples: seen }
}

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-nurse42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)
  note('들인 자리', JSON.stringify(await page.evaluate(() => ({ ...document.documentElement.dataset }))))

  await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    verbose: true,
    totalMs: BUDGET,
    skipStory: true,
    after: async (api) => {
      // ① 접근 ─ 센터 안까지
      const came = await api.goTo(CENTER, Math.min(240_000, api.left()))
      note('① 센터(48)로 걸어간다', String(came))
      if (came !== 'arrived') { bound('접근', `센터에 못 갔다 (${String(came)})`); return { came } }
      await api.settle()

      out.roster = await roster(page)
      const nurse = out.roster.list.find((n) => n.script === NURSE)
      note('명부', `맵 ${String(out.roster.mapId)} · ${String(out.roster.list.length)}명`
        + ` · script ${JSON.stringify(out.roster.list.map((n) => n.script))}`)
      note('간호사(script 1)', nurse === undefined ? '**명부에 없다**' : JSON.stringify(nurse))
      if (nurse === undefined) {
        out.why = await spawnWhy(page, CENTER)
        note('왜 안 섰나', JSON.stringify(out.why))
        bound('사람 세우기', `배치표 ${String(out.why.placed)}명 중 숨은 것 `
          + `${String(out.why.rows.filter((r) => r.hidden).length)}명 · 플래그0 ${String(out.why.flag0)}`)
        return { came }
      }

      const spot = await api.npcSpot(CENTER, NURSE)
      note('npcSpot(하네스가 보는 자리)', JSON.stringify(spot))
      out.spot = spot
      if (spot === null) { bound('대상 탐색', 'npcSpot이 null'); return { came } }

      // ② 마주보기 ─ 계산대 너머 칸에 **직접 서서** 네 방향을 다 눌러 본다.
      // 어느 쪽이 제품의 `talkTile`을 태우는지 그대로 본다
      const stand = { x: spot.x, z: spot.z + 2 }
      const stood = await api.stepOn(CENTER, stand, Math.min(120_000, api.left()))
      note('② 계산대 너머 칸으로', `${stood} → ${JSON.stringify(stand)} · 지금 ${JSON.stringify(await api.now())}`)
      out.stood = { want: stand, how: stood }
      if (stood !== 'arrived') bound('접근', `계산대 너머 칸에 못 섰다 (${String(stood)})`)

      out.faces = []
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        // 짧게 눌러 방향만 돌린다. ⚠️ **그래도 걸어갈 수 있다** — 그래서
        // 누른 뒤의 자리와 방향을 **다시 읽는다**
        await api.tap(key, 40)
        const before = await probe(page)
        const press = await pressA(page)
        const after = await probe(page)
        const opened = after.script !== null || after.marks.talk === '1' || after.marks.menu !== undefined
        out.faces.push({ key, before, press, after, opened })
        note(`  ${key} 뒤`, `자리 ${JSON.stringify(before.player.tile)}`
          + ` 사분면 ${String(before.player.quarter)} 걸음 ${JSON.stringify(before.step)}`
          + ` · 앞칸 ${JSON.stringify(before.front)}`
          + ` → 닿는칸 ${JSON.stringify(before.reach)}`
          + ` · 거기 사람 ${JSON.stringify(before.reachWho)}`)
        note(`  ${key} A`, `입력 닿음 ${String(press.reached)}`
          + ` · 스크립트 ${JSON.stringify(after.script)}`
          + ` · ${opened ? '**열렸다**' : '안 열렸다'}`)
        if (opened) { await api.clearTalk(); break }
      }
      const hit = out.faces.find((f) => f.opened)
      if (hit === undefined) {
        const reached = out.faces.some((f) => f.press.reached)
        const found = out.faces.find((f) => f.before.reachWho !== null)
        if (!reached) bound('입력', 'A가 worldState.input.interact까지 안 닿았다')
        else if (found === undefined) bound('대상 탐색', '네 방향 어디서도 닿는 칸에 사람이 없다')
        else bound('대화 시작', `${JSON.stringify(found.before.reachWho)}를 찾았는데 스크립트가 안 섰다`)
      }

      // ③ 그리고 하네스가 평소에 하는 길로도 한 번
      const said = await api.talkToNpc(CENTER, NURSE, Math.min(120_000, api.left()))
      note('③ talkToNpc', said ? '됐다' : '**안 됐다**')
      const got = await api.healAt(CENTER, Math.min(240_000, api.left()))
      note('④ 회복 계약', got.ok ? '나았다' : String(got.why))
      out.heal = got
      if (!got.ok && out.boundary === null) bound('회복', String(got.why))
      await page.screenshot({ path: `${OUT}/센터.png` })
      return { came, spot, said, heal: got.ok }
    },
  })
} catch (e) {
  out.crash = String(e?.stack ?? e?.message ?? e).slice(0, 800)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  최초 실패 경계 — ${out.boundary === null ? '없다 (회복까지 됐다)' : `${out.boundary.where}: ${out.boundary.why}`}`)
console.log(`  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
