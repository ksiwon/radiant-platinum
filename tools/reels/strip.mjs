// 찍은 장면을 한눈에 — 장면마다 고르게 여섯 장을 한 줄로 (시각을 얹는다)
//
//     node tools/reels/strip.mjs out.jpg C1-wild C6-catch …        (--aspect=9:16이면 세로 장면)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const aspect = (args.find((a) => a.startsWith('--aspect=')) ?? '--aspect=16:9').slice(9)
const [out, ...ids] = args.filter((a) => !a.startsWith('--'))
const N = 6
const [w, h] = aspect === '9:16' ? [180, 320] : [320, 180]
const inputs = []
const parts = []
let k = 0
for (const id of ids) {
  const dir = resolve(ROOT, '.audit/reels/take', aspect.replace(':', 'x'), id)
  const { frames } = JSON.parse(readFileSync(resolve(dir, 'frames.json'), 'utf8'))
  const t0 = frames[0].t
  for (let i = 0; i < N; i++) {
    const f = frames[Math.min(frames.length - 1, Math.round((i * (frames.length - 1)) / (N - 1)))]
    inputs.push('-i', resolve(dir, f.name))
    const label = `${id} ${(f.t - t0).toFixed(1)}s`
    parts.push(`[${String(k)}:v]scale=${String(w)}:${String(h)},drawtext=fontfile=arial.ttf:text='${label}':x=4:y=4:fontsize=13:fontcolor=yellow:box=1:boxcolor=black@0.6[s${String(k)}]`)
    k++
  }
}
const layout = Array.from({ length: k }, (_, i) => `${String((i % N) * w)}_${String(Math.floor(i / N) * h)}`).join('|')
const chain = `${parts.join(';')};${Array.from({ length: k }, (_, i) => `[s${String(i)}]`).join('')}xstack=inputs=${String(k)}:layout=${layout}`
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', chain, '-q:v', '3', resolve(ROOT, out)],
  { stdio: 'inherit', cwd: resolve(ROOT, '.audit/reels') })
