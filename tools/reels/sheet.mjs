// 정지 화면 여러 장을 한 장으로 — node tools/reels/sheet.mjs out.jpg B2-twinleaf D1-lake …  (16:9 · 둘씩 한 줄 · 이름을 얹는다)
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
const ROOT = resolve(import.meta.dirname, '../..')
const [out, ...ids] = process.argv.slice(2)
const font = 'arial.ttf' // 경로에 콜론이 있으면 drawtext가 못 읽는다 — .audit/reels에 복사해 두고 그 안에서 돈다
const inputs = ids.flatMap((id) => ['-i', resolve(ROOT, '.audit/reels/take/16x9', id, 'still.png')])
const parts = ids.map((id, i) => `[${String(i)}:v]scale=960:540,drawtext=fontfile='${font}':text='${id}':x=12:y=12:fontsize=28:fontcolor=yellow:box=1:boxcolor=black@0.6[s${String(i)}]`)
const layout = ids.map((_, i) => `${String((i % 2) * 960)}_${String(Math.floor(i / 2) * 540)}`).join('|')
const chain = ids.length === 1 ? `${parts[0].replace(/\[s0\]$/, '')}` : `${parts.join(';')};${ids.map((_, i) => `[s${String(i)}]`).join('')}xstack=inputs=${String(ids.length)}:layout=${layout}:fill=black`
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', chain, '-q:v', '3', resolve(ROOT, out)], { stdio: 'inherit', cwd: resolve(ROOT, '.audit/reels') })
