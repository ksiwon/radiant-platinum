// 집을 나서다 화면이 멎는가 — 칸 22 멈춤(2026-10-23 · 맥 헤드리스 WebGL · MTLCompilerService가 13분을 굽는 동안 메인 스레드가 동기 GL 호출에 묶였다)
//   node tools/probe/houseExitHang.mjs --save=.audit/parts/cell-21.rpsave --lane=fix|base --trials=3 [--out=.audit/houseexit-fix.json]
// 세이브(떡잎 집 2층 415)를 불러 1층(414) → 떡잎마을(411)로 건너가며 2초마다 페이지에 묻는다. 대답이 늦으면 멈춘 것이다.
// 동기 GL 호출(링크 · 상태 묻기)이 100ms를 넘으면 그 호출과 JS 자리를 적는다. `base`는 해제 장치를 끈다(`__noGlRelease`)
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { startVite, freePort } from '../devServer.mjs'
import { gpuArgs, gpuInitScript } from '../gpuFlags.mjs'

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3)
const save = arg('save', '.audit/parts/cell-21.rpsave')
const lane = arg('lane', 'fix')
const trials = Number(arg('trials', '3'))
const out = arg('out', `.audit/houseexit-${lane}.json`)
/** 이만큼 대답이 없으면 멈춘 것으로 적고, 이만큼 더 기다려도 없으면 그 판을 버린다 (ms) */
const STUCK_MS = 15_000
const GIVE_UP_MS = 300_000

const mtlCpu = () => {
  try {
    return execSync('ps -Ao pcpu,comm | grep MTLCompilerService | grep -v grep', { encoding: 'utf8' })
      .split('\n').map((l) => Number(l.trim().split(/\s+/)[0])).filter((n) => n > 0).reduce((a, b) => a + b, 0)
  } catch { return 0 }
}

const vite = await startVite(await freePort(), `node_modules/.vite-houseexit-${lane}`)
const results = []
try {
  for (let t = 1; t <= trials; t++) {
    const browser = await chromium.launch({ args: [...gpuArgs('gl'), '--mute-audio'] })
    const r = { trial: t, lane, stuck: [], slow: [], maps: [], programs: null, verdict: 'ok' }
    try {
      const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
      const init = gpuInitScript('gl'); if (init) await page.addInitScript(init)
      if (lane === 'base') await page.addInitScript(() => { globalThis.__noGlRelease = true })
      await page.addInitScript(() => {
        const p = WebGL2RenderingContext.prototype
        const c = { programs: 0, links: 0, slow: [] }
        globalThis.__hx = c
        const timed = (name) => {
          const f = p[name]
          p[name] = function (...a) {
            if (name === 'createProgram') c.programs++
            if (name === 'linkProgram') c.links++
            const t0 = performance.now(); const v = f.apply(this, a); const ms = performance.now() - t0
            if (ms > 100) {
              c.slow.push({ call: name, ms: Math.round(ms), at: Math.round(t0), stack: (new Error().stack ?? '').split('\n').slice(2, 9).map((x) => x.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+/, '')).join(' < ') })
            }
            return v
          }
        }
        for (const n of ['createProgram', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getUniformLocation', 'useProgram', 'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) timed(n)
      })
      page.setDefaultNavigationTimeout(600_000)
      await page.goto(vite.url, { waitUntil: 'load' })
      await page.getByRole('button', { name: '시작', exact: true }).waitFor({ timeout: 300_000 })
      await page.setInputFiles('input[type=file]', resolve(save))
      await page.getByRole('button', { name: '이 리포트로 이어하기' }).click()
      await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live', null, { timeout: 300_000 })
      const ask = () => Promise.race([
        page.evaluate(() => ({ map: Number(document.documentElement.dataset.map), c: { programs: globalThis.__hx.programs, links: globalThis.__hx.links } })),
        new Promise((res) => { setTimeout(() => res(null), STUCK_MS) }),
      ])
      const hold = async (label, ms) => {
        const until = Date.now() + ms
        while (Date.now() < until) {
          const t0 = Date.now()
          let got = await ask()
          if (got === null) {
            const s = { label, from: t0, mtl: mtlCpu() }
            while (got === null && Date.now() - t0 < GIVE_UP_MS) got = await ask()
            s.ms = Date.now() - t0
            s.mtlEnd = mtlCpu()
            r.stuck.push(s)
            if (got === null) { r.verdict = 'hung'; return false }
          }
          r.maps.push([label, got.map]); r.programs = got.c
          await new Promise((res) => { setTimeout(res, 2000) })
        }
        return true
      }
      const first = await hold('415', 6000)
      for (const map of first ? [414, 411] : []) {
        await page.evaluate(async (m) => { const w = await import('/src/app/devWarp.ts'); w.devWarp.pending = { id: `hx${String(m)}${String(Math.random())}`, map: m, spot: { kind: 'warp', index: 0 } } }, map)
        if (!await hold(String(map), 20_000)) break
      }
      if (r.verdict === 'ok') {
        const hx = await Promise.race([page.evaluate(() => globalThis.__hx), new Promise((res) => { setTimeout(() => res(null), STUCK_MS) })])
        r.slow = hx?.slow ?? []
        if (r.stuck.length > 0) r.verdict = 'stalled'
      }
    } catch (e) {
      r.verdict = `error — ${String(e?.message ?? e).slice(0, 200)}`
    } finally {
      await browser.close().catch(() => {})
    }
    results.push(r)
    console.log(lane, `판 ${String(t)}`, r.verdict, '멈춤', r.stuck.map((s) => `${s.label} ${String(s.ms)}ms mtl ${String(s.mtl)}%`).join(' · ') || '없음',
      '프로그램', JSON.stringify(r.programs), '느린 GL', r.slow.length, r.slow.slice(0, 3).map((s) => `${s.call} ${String(s.ms)}ms`).join(' · '))
    writeFileSync(out, JSON.stringify(results, null, 1))
  }
} finally {
  vite.child.kill()
}
