// 타이틀 화면만 찍는다 — 고지가 **실제로 보이는지** 재려고 (COPYRIGHT.md §11)
//
//     node tools/shot/title.mjs            개발 서버를 띄워 찍는다
//     node tools/shot/title.mjs --url=…    이미 떠 있는 곳을 찍는다
//
// ⚠️ `shot.mjs`는 확인 지점(맵)으로 뛰어드는 도구라 타이틀에 안 머문다.
// 고지는 타이틀에만 있으므로 여기서 따로 본다. **눈으로 볼 것**을 만드는 것이
// 목적이고, 예쁜지 아닌지는 사람이 정한다.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const OUT = resolve(import.meta.dirname, '../../shots')
const VIEW = { width: 1280, height: 720 }
const flag = (name) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

function freePort() {
  return new Promise((done) => {
    const s = createServer()
    s.listen(0, () => { const { port } = s.address(); s.close(() => { done(port) }) })
  })
}

function startVite(port) {
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    cwd: resolve(import.meta.dirname, '../..'), shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((done, fail) => {
    const timer = setTimeout(() => { fail(new Error('vite가 안 떴다')) }, 120_000)
    child.stdout.on('data', (b) => {
      if (String(b).includes('Local:')) { clearTimeout(timer); done({ child, url: `http://localhost:${port}/` }) }
    })
  })
}

const main = async () => {
  let url = flag('url')
  let vite = null
  if (!url) { vite = await startVite(await freePort()); url = vite.url }

  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
  // 글꼴과 배경이 자리 잡을 틈
  await page.waitForTimeout(1200)

  mkdirSync(OUT, { recursive: true })
  writeFileSync(resolve(OUT, 'title.png'), await page.screenshot())

  // 고지가 **화면 안에** 있는지. DOM에 있는 것과 보이는 것은 다르다
  const seen = await page.evaluate(() => {
    const hit = [...document.querySelectorAll('p')].find((p) => p.textContent?.includes('비공식·비제휴'))
    if (!hit) return { found: false }
    const box = hit.getBoundingClientRect()
    const style = getComputedStyle(hit)
    return {
      found: true,
      onScreen: box.top >= 0 && box.bottom <= window.innerHeight && box.width > 0,
      box: { top: Math.round(box.top), bottom: Math.round(box.bottom) },
      display: style.display, visibility: style.visibility, opacity: style.opacity,
      title: document.title,
    }
  })
  console.log(JSON.stringify(seen, null, 1))
  console.log(`→ shots/title.png`)

  await browser.close()
  vite?.child.kill()
}

await main()
