// 묶은 영상을 큐마다 한 장씩 — 각 큐의 가운데 프레임을 뽑아 이름을 얹어 한 장으로 (stamps.txt를 읽는다)
//
//     node tools/reels/review.mjs [--aspect=9:16] [--at=0.5]      .audit/reels/review-<16x9|9x16>.jpg
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const aspect = (args.find((a) => a.startsWith('--aspect=')) ?? '--aspect=16:9').slice(9)
const at = Number((args.find((a) => a.startsWith('--at=')) ?? '--at=0.5').slice(5))
const tag = aspect.replace(':', 'x')
const video = resolve(ROOT, '.audit/reels/out', aspect === '9:16' ? 'radiant-reveal-short.mp4' : 'radiant-reveal.mp4')
const total = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString())
const stamps = readFileSync(resolve(ROOT, '.audit/reels/work', tag, 'stamps.txt'), 'utf8').trim().split('\n').map((l) => l.split(' '))
const [w, h] = aspect === '9:16' ? [180, 320] : [320, 180]
const cols = aspect === '9:16' ? 10 : 6
const parts = []
const inputs = []
stamps.forEach(([cue, t0], i) => {
  const t1 = Number(stamps[i + 1]?.[1] ?? total)
  const t = Number(t0) + (t1 - Number(t0)) * at
  inputs.push('-ss', t.toFixed(3), '-i', video)
  parts.push(`[${String(i)}:v]scale=${String(w)}:${String(h)},drawtext=fontfile=arial.ttf:text='${cue} ${t.toFixed(1)}':x=4:y=4:fontsize=13:fontcolor=yellow:box=1:boxcolor=black@0.6[s${String(i)}]`)
})
const n = stamps.length
const layout = Array.from({ length: n }, (_, i) => `${String((i % cols) * w)}_${String(Math.floor(i / cols) * h)}`).join('|')
const chain = `${parts.join(';')};${Array.from({ length: n }, (_, i) => `[s${String(i)}]`).join('')}xstack=inputs=${String(n)}:layout=${layout}:fill=black`
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', chain, '-frames:v', '1', '-q:v', '3', resolve(ROOT, `.audit/reels/review-${tag}.jpg`)],
  { stdio: 'inherit', cwd: resolve(ROOT, '.audit/reels') })
