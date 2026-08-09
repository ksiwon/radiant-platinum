// 진짜 브라우저에서 Import Worker가 뜨는가 (IMPORT.md §6)
//
//     pnpm check:worker
//
// 시험은 `MessageChannel`로 직렬화 경계를 재고, 여기서는 **스레드 자체**를 잰다.
// `new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' })`가
// vite 청크로 잘 나왔는지는 브라우저를 열기 전에는 안 보인다.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 5198
const vite = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: process.cwd(), shell: true, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((done) => {
  vite.stdout.on('data', (b) => { if (String(b).includes('ready in')) done() })
  setTimeout(done, 40_000)
})

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`))

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })

const result = await page.evaluate(async () => {
  const { spawnImportWorker } = await import('/src/import/worker/client.ts')
  const client = spawnImportWorker()
  try {
    // 롬이 아닌 것을 넘긴다. **Worker가 판정해서 돌려주는 것**이 요점이다
    const junk = new Blob([new Uint8Array(1024)])
    const bad = await client.validate(junk)
    // 진짜 롬이 없으니 성공 갈래는 못 재지만, 왕복은 이것으로 증명된다
    return { roundTrip: true, ok: bad.ok, step: bad.ok ? null : bad.step, why: bad.ok ? null : bad.why }
  } finally { client.close() }
})

await browser.close()
vite.kill()

console.log('Worker 왕복:', result.roundTrip ? '됐다' : '안 됐다')
console.log('  판정:', JSON.stringify(result))
console.log('  콘솔 오류:', errors.length === 0 ? '없음' : errors.join(' | '))
process.exit(result.roundTrip && errors.length === 0 ? 0 : 1)
