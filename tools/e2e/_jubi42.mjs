// 짧은 재현 — **축복시티의 넷에게 왜 말을 못 거는가** (검토 지시 1·2)
//
//     node tools/e2e/_jubi42.mjs [--headed] [--save=.audit/journey/end.rpsave]
//
// ⚠️ **배치표 문제라고 가정하지 않는다.** `npcSpot`은 이미 런타임 `npcActors`의
// **지금 자리**를 읽는다. 그러니 「배치표 자리에 없어서」는 아직 가설도 아니다 —
// 여기서 재는 것은 **어느 단계가 처음 무너지는가**다:
//
//   ① 그 사람이 명부에 있는가 (신원 · 숨김 깃발)
//   ② 지금 어디 서 있는가 · 움직이는가 (`movementType` · 걸음 중인가)
//   ③ 우리가 어디로 가려 했는가 (접근 목표 칸)
//   ④ 도착했을 때 그 사람이 **아직 거기 있는가**
//   ⑤ A를 눌렀을 때 **누구와** 말했는가 (`fieldScripts.ctx`의 파일·읽기 위치)
//
// ⚠️ **사람을 고정하거나 순간이동시키지 않는다.** 움직이는 상대는 **다가간 뒤
// 자리를 다시 읽고** 제한된 횟수만 다시 계획한다. 사람이 하는 것과 같다.
//
// ⚠️ **쿠폰으로 판정한다, 대화 성공으로가 아니다.** 원작의 계약은
// `scripts_jubilife_city.s`에 그대로 있다 —
// `JubilifeCity_SetObtainedCouponsCount`가 `FLAG_RECEIVED_COUPON_1..3`을 세고,
// **셋이 다 서야** `JubilifeCity_GivePoketch`가 돌아 `VAR_JUBILIFE_CITY_STATE`를
// 2로 올린다. 그래서 여기서는 **깃발 셋 · 포켓치 보유 · 동쪽 통행**을 잰다.
//
// ⚠️ **읽기만 한다.** 깃발도 변수도 여기서 쓰지 않는다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, startVite } from '../devServer.mjs'
import { gpuArgs } from '../gpuFlags.mjs'
import { driveStory } from './drive.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const HEADED = args.includes('--headed')
const SAVE = args.find((a) => a.startsWith('--save='))?.slice(7) ?? '.audit/journey/end.rpsave'
const BUDGET = Number(args.find((a) => a.startsWith('--budget='))?.slice(9) ?? '900') * 1000
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const OUT = resolve(ROOT, `shots/jubi42/${STAMP}`)
mkdirSync(OUT, { recursive: true })

const CITY = 3
/**
 * 축복시티의 넷. 번호는 `scripts_jubilife_city.s`의 `ScriptEntry` 차례(1부터)다 —
 * 14·15·16이 광대 셋, 18이 포켓치사 사장이다 (17은 좌표 이벤트라 사람이 아니다)
 */
const WHO = [
  { script: 14, what: '광대 1', coupon: 237 },
  { script: 15, what: '광대 2', coupon: 238 },
  { script: 16, what: '광대 3', coupon: 239 },
]
const PRESIDENT = { script: 18, what: '포켓치사 사장' }
/**
 * `VAR_JUBILIFE_CITY_STATE`. 목록 줄 4230 + 12273이다 — 그 더하기 값은
 * `VAR_FOLLOWER_RIVAL_STATE`(줄 4245 = 16518)로 맞춰 확인했다
 */
const VAR_CITY = 16503
/**
 * `FLAG_RECEIVED_COUPON_1..3`.
 *
 * ⚠️ **줄 셈으로 짐작하지 않는다 — 재서 얻은 값이다.** 깃발 diff로 광대 셋이
 * 세운 것이 **237·238·239**임을 봤고, 사장이 세운 **243**이
 * `FLAG_RECEIVED_POKETCH`(줄 246)와 **줄 −3**으로 맞는다. 확정값
 * `FLAG_HAS_POKEDEX = 144`(줄 147)도 같은 −3이다
 */
const COUPONS = [237, 238, 239]
/** `FLAG_RECEIVED_POKETCH` — 사장이 실제로 준 자리 */
const FLAG_POKETCH = 243

const out = { stamp: STAMP, save: SAVE, steps: [], traces: [] }
const note = (what, detail) => {
  out.steps.push({ what, detail })
  console.log(`  · ${what} — ${detail}`)
}

/**
 * **선 깃발을 통째로 훑는다.** 말 걸기 앞뒤로 떠서 **무엇이 바뀌었는지**를 본다.
 *
 * ⚠️ **번호를 믿고 시작하지 않는다.** 「쿠폰이 233·234·235다」는 목록 줄 −7
 * 규칙에서 나온 값이라 **가설**이다. 광대에게 말을 걸었을 때 실제로 서는 깃발이
 * 무엇인지 diff로 보면, 번호가 맞는지와 쿠폰이 실제로 섰는지를 **한 번에** 가른다
 */
const flagsNow = (page) => page.evaluate(async () => {
  const f = await import('/src/engine/script/field.ts')
  const v = f.fieldScripts.vars
  const on = []
  for (let n = 0; n < 2600; n++) { if (v.checkFlag(n)) on.push(n) }
  return on
})

/** 이야기 상태를 **읽는다** — 쿠폰 셋 · 도시 단계 · 포켓치 보유 */
const story = (page) => page.evaluate(async ([varCity, coupons, poketchFlag]) => {
  const f = await import('/src/engine/script/field.ts')
  const save = await import('/src/state/saveStore.ts')
  const v = f.fieldScripts.vars
  const s = save.useSaveStore.getState()
  return {
    cityState: v.get(varCity),
    coupons: coupons.map((n) => v.checkFlag(n)),
    received: v.checkFlag(poketchFlag),
    poketch: { enabled: s.poketch.enabled, apps: s.poketch.registry.filter((n) => n > 0).length },
  }
}, [VAR_CITY, COUPONS, FLAG_POKETCH])

/** 그 맵에 실제로 선 사람들 — 신원·지금 자리·움직임까지 */
const roster = (page) => page.evaluate(async () => {
  const m = await import('/src/engine/actor/npcs.ts')
  const reg = m.npcActors
  return {
    mapId: reg.mapId,
    paused: reg.paused,
    list: reg.list.map((a) => ({
      script: a.info?.script ?? null,
      localID: a.localID,
      sprite: a.info?.sprite ?? null,
      /** 배치표가 적어 둔 자리 */
      spawn: a.info === undefined ? null : { x: a.info.x, z: a.info.z },
      /** **지금** 자리 (걸음 중이면 소수점이 뜬다) */
      at: { x: Number(a.x.toFixed(2)), z: Number(a.z.toFixed(2)) },
      tile: { x: Math.round(a.x), z: Math.round(a.z) },
      /** 다음 칸으로 가는 중인가 */
      moving: typeof a.tickX === 'number'
        ? (Math.abs(a.x - a.tickX) > 0.01 || Math.abs(a.z - a.tickZ) > 0.01) : null,
      movementType: a.movementType ?? null,
      dir: a.dir ?? null,
      visible: a.visible !== false,
    })),
  }
})

/** 지금 무엇이 도는가 — **누구와** 말했는지가 여기 있다 */
const ctx = (page) => page.evaluate(async () => {
  const f = await import('/src/engine/script/field.ts')
  const st = await import('/src/state/worldState.ts')
  const c = f.fieldScripts.ctx
  const p = st.worldState.player
  const box = document.querySelector('[class*="dialog"], [class*="message"]')
  return {
    player: {
      x: Number(p.position.x.toFixed(2)),
      z: Number(p.position.z.toFixed(2)),
      facing: Number(p.facing.toFixed(3)),
    },
    running: c === null ? null : { file: c.file, pc: c.pointer, state: c.state },
    text: box === null ? null : String(box.textContent ?? '').replace(/\s+/g, ' ').slice(0, 120),
    marks: { ...document.documentElement.dataset },
  }
})

let vite = null
let browser = null
let page = null
try {
  const port = await freePort()
  vite = await startVite(port, 'node_modules/.vite-jubi42')
  browser = await chromium.launch({ args: gpuArgs('webgpu'), headless: !HEADED })
  page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  page.on('pageerror', (e) => { console.error(`  pageerror ${String(e.message).slice(0, 160)}`) })

  await page.goto(vite.url, { waitUntil: 'load', timeout: 180_000 })
  await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 120_000 })
  // ⚠️ **진단용 세이브다.** 정상 UI로 들이고, 이 판을 완주의 증거로 세지 않는다
  await page.setInputFiles('input[type=file]', resolve(ROOT, SAVE))
  const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
  await bring.waitFor({ timeout: 60_000 })
  await bring.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
  await page.waitForTimeout(1500)

  out.before = await story(page)
  note('들인 자리의 이야기 상태', JSON.stringify(out.before))

  const result = await driveStory(page, {
    log: (l) => { console.log(`    ${l}`) },
    verbose: true,
    totalMs: BUDGET,
    skipStory: true,
    after: async (api) => {
      const came = await api.goTo(CITY, Math.min(240_000, api.left()))
      note('축복시티에 선다', String(came))
      if (came !== 'arrived') return { came }
      await api.settle()

      out.roster = await roster(page)
      note('명부', `맵 ${String(out.roster.mapId)} · ${String(out.roster.list.length)}명`)
      for (const w of [...WHO, PRESIDENT]) {
        const hit = out.roster.list.find((n) => n.script === w.script)
        note(`  ${w.what} (script ${String(w.script)})`, hit === undefined
          ? '**명부에 없다** — 숨김 깃발이 서 있거나 아직 안 나타났다'
          : `자리 ${JSON.stringify(hit.tile)} (배치표 ${JSON.stringify(hit.spawn)})`
            + ` · 움직임유형 ${String(hit.movementType)} · 걷는중 ${String(hit.moving)}`
            + ` · 보임 ${String(hit.visible)}`)
      }

      /**
       * **다가가서 말을 건다 — 다가간 뒤 자리를 다시 읽는다.**
       *
       * 사람을 세우지도 옮기지도 않는다. 한 번에 끝까지 계획하지 않고,
       * 다가갈 때마다 그 사람이 **아직 거기 있는지**를 다시 보고 제한된
       * 횟수만 다시 계획한다
       */
      const chase = async (who, rounds = 5) => {
        const trace = { script: who.script, what: who.what, ok: false, rounds: [] }
        for (let i = 0; i < rounds && api.left() > 20_000; i++) {
          // ⚠️ **채취 시점을 적는다.** 「낡은 목표」라는 말이 뜻을 가지려면
          // 목표를 **언제** 읽었고 상호작용이 **언제** 일어났는지가 있어야
          // 한다 — 그 사이에 사람이 움직였는지를 그 둘로만 가른다
          const pickedAt = Date.now()
          const spot = await api.npcSpot(CITY, who.script)
          const bench = await roster(page)
          const before = await ctx(page)
          if (spot === null) {
            // ⚠️ **「없다」의 까닭이 셋이다.** 다른 맵에 서 있는 것과, 명부가
            // 아직 그 맵 것이 아닌 것과, 정말 그 사람이 없는 것은 다른 일이다
            const why = Number(before.marks.map) !== CITY
              ? `우리가 맵 ${String(before.marks.map)}에 있다 — 명부는 그 맵 것이다`
              : bench.mapId !== CITY
                ? `명부가 아직 맵 ${String(bench.mapId)} 것이다 — 준비가 안 됐다`
                : bench.list.length === 0
                  ? '명부가 비었다 — 아직 안 세워졌다'
                  : `명부 ${String(bench.list.length)}명 안에 script ${String(who.script)}가 없다`
            trace.rounds.push({ i, pickedAt, aimed: null, why, roster: { mapId: bench.mapId, n: bench.list.length } })
            break
          }
          const said = await api.talkTo(CITY, spot, 40_000)
          const spokeAt = Date.now()
          const after = await ctx(page)
          const near = await api.npcSpot(CITY, who.script)
          trace.rounds.push({
            i,
            /** 목표를 읽은 시각과, 말을 걸어 본 시각 */
            pickedAt, spokeAt, gapMs: spokeAt - pickedAt,
            /** 채취 순간의 명부 세대 */
            roster: { mapId: bench.mapId, n: bench.list.length, paused: bench.paused },
            /** 이 바퀴에 노린 자리 */
            aimed: spot,
            /** 다가간 뒤 그 사람이 실제로 있던 자리 — 다르면 그 사이에 움직인 것이다 */
            moved: near,
            /** 노린 자리와 그때 자리가 어긋났는가 — 이것이 「낡은 목표」다 */
            stale: near === null || near.unknown === true ? null
              : near.x !== spot.x || near.z !== spot.z,
            playerBefore: before.player,
            playerAfter: after.player,
            /** 다가간 뒤 우리가 선 칸 · 그 사람과의 칸 거리 */
            standing: { x: Number(after.marks.tile?.split(',')[0] ?? NaN), z: Number(after.marks.tile?.split(',')[1] ?? NaN) },
            said,
            /** A를 눌렀을 때 **누가** 열렸는가 */
            opened: after.running,
            text: after.text,
            marks: { talk: after.marks.talk ?? null, script: after.marks.script ?? null },
          })
          await api.clearTalk()
          await api.settle()
          if (said) { trace.ok = true; trace.at = i; break }
        }
        out.traces.push(trace)
        const last = trace.rounds.at(-1)
        note(`${who.what} 말 걸기`, `${trace.ok ? '됐다' : '**안 됐다**'}`
          + ` · ${String(trace.rounds.length)}바퀴`
          + ` · 마지막 노린 자리 ${JSON.stringify(last?.aimed)} → 그때 그 사람 ${JSON.stringify(last?.moved)}`
          + ` · 목표가 낡았나 ${String(last?.stale)}`
          + ` · 채취→말걸기 ${String(last?.gapMs)}ms`
          + (last?.why === undefined ? '' : ` · ${String(last.why)}`)
          + ` · 열린 것 ${JSON.stringify(last?.opened)}`)
        return trace.ok
      }

      // 광대 셋 — 쿠폰이 실제로 서는지를 매번 확인한다
      for (const w of WHO) {
        const before = await flagsNow(page)
        await chase(w)
        const after = await flagsNow(page)
        const rose = after.filter((n) => !before.includes(n))
        const fell = before.filter((n) => !after.includes(n))
        const st = await story(page)
        note(`  ${w.what} 뒤 쿠폰`, `${JSON.stringify(st.coupons)} · 도시단계 ${String(st.cityState)}`
          + ` · **선 깃발** ${rose.length === 0 ? '없다' : rose.join(',')}`
          + `${fell.length === 0 ? '' : ` · 내린 깃발 ${fell.join(',')}`}`)
        out.steps.at(-1).rose = rose
      }
      out.afterClowns = await story(page)

      // ⚠️ **쿠폰 셋이 안 서면 사장에게 가도 소용없다.** 원작이 그렇게 적혀 있다
      // (`GoToIfEq VAR_0x8004, 3, JubilifeCity_GivePoketch`). 그래도 **가 본다** —
      // 그때 사장이 무슨 말을 하는지가 다음 단서다
      const beforePres = await flagsNow(page)
      await chase(PRESIDENT)
      const afterPres = await flagsNow(page)
      out.presidentFlags = {
        rose: afterPres.filter((n) => !beforePres.includes(n)),
        fell: beforePres.filter((n) => !afterPres.includes(n)),
      }
      note('사장 앞뒤 깃발', `선 것 ${out.presidentFlags.rose.join(',') || '없다'}`
        + ` · 내린 것 ${out.presidentFlags.fell.join(',') || '없다'}`)
      const end = await story(page)
      out.afterPresident = end
      note('사장 뒤', `쿠폰 ${end.coupons.filter(Boolean).length}/3`
        + ` · 도시단계 ${String(end.cityState)}`
        + ` · 지급표시 ${end.received ? '섰다' : '**안 섰다**'}`
        + ` · 포켓치 ${end.poketch.enabled ? '켜졌다' : '**안 켜졌다**'}`)

      // 동쪽 통행 — 포켓치를 받아야 핸섬이 비켜 준다 (`CoordEvent_LookerBlockRoute203`)
      const east = await api.goTo(343, Math.min(180_000, api.left()))
      const at = await ctx(page)
      note('동쪽(203번도로) 통행', `${east} · 지금 맵 ${String(at.marks.map)} 칸 ${String(at.marks.tile)}`)
      out.east = { verdict: east, at }
      await page.screenshot({ path: `${OUT}/끝.png` })
      return { came, traces: out.traces.length }
    },
  })
  out.result = {
    trouble: result.trouble, battles: { wild: result.wild, trainer: result.trainer },
    // 목적지 하나 단위의 결말과 실패 자취 (후속 §4.1). 계획 하나 단위의
    // `plan`과 **다른 것을 센다** — 풀회피 실패 뒤 일반 성공은 성공한 여행이다
    observer: result.observer, movePicks: result.movePicks,
    plan: result.plan, episodes: result.episodes, failedEpisodes: result.failedEpisodes,
  }
} catch (e) {
  out.crash = String(e?.message ?? e).slice(0, 400)
  console.error(`  터졌다 — ${out.crash}`)
} finally {
  await browser?.close()
  vite?.child.kill()
}

writeFileSync(`${OUT}/실행.json`, `${JSON.stringify(out, null, 1)}\n`)
console.log(`\n  ${OUT}`)
process.exit(out.crash === undefined ? 0 : 1)
