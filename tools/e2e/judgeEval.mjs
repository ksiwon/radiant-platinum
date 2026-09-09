// **보류 검증셋으로 지형 판정자를 한 번 평가한다** (다음 구간 계획 §4 B3).
//
//     node tools/e2e/judgeEval.mjs --labels=<라벨.json> [--out=<결과.json>]
//
// ⚠️ **이 도구로 문턱을 고르지 않는다.** 판정식은 평가 **전에** 못 박혀 있어야
// 하고(`terrainJudge.mjs`의 `CELL_EDGE`), 여기서는 그 고정된 식을 보류해 둔
// 묶음에 **한 번** 걸 뿐이다. 결과가 나쁘다고 문턱을 옮겨 다시 돌리면 그 순간
// 이 묶음은 보류가 아니라 개발 대조군이 된다.
//
// ⚠️ **정답은 알고리즘이 아니라 사람이 정한다.** 라벨 파일의 `want`는 그림을
// 직접 보고 적은 값이다. 애매하면 `null`(불명)로 두고 셈에서 뺀다 — 판정자의
// 옛 출력으로 정답을 만들지 않는다.
//
// 라벨 파일 꼴:
//
//     { "묶음": "2026-09-09 커널시티 왕복", "backend": "webgpu",
//       "cuts": [ { "path": "...png", "want": true, "why": "바닥·벽·계산대가 보인다" } ] }
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { judgeTerrain, JUDGE_CONTRACT } from './terrainJudge.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit === undefined ? d : hit.slice(n.length + 3)
}
const LABELS = flag('labels')
if (LABELS === null) throw new Error('--labels=<라벨.json>이 있어야 한다')
const OUT = flag('out', LABELS.replace(/\.json$/, '-결과.json'))

const spec = JSON.parse(readFileSync(resolve(ROOT, LABELS), 'utf8'))
const rows = []
for (const c of spec.cuts) {
  const at = resolve(ROOT, c.path)
  if (!existsSync(at)) { rows.push({ ...c, missing: true }); continue }
  const j = judgeTerrain(readFileSync(at))
  rows.push({
    ...c,
    drawn: j.drawn,
    filled: j.filled,
    roi: j.roi,
    voids: j.voids,
    ratio: j.ratio,
    // 가장 빠듯한 칸 — 문턱에서 얼마나 떨어져 있는지가 여유다
    low: Math.min(...j.cells.filter((x) => x.r >= 1).map((x) => x.edge)),
  })
}

const judged = rows.filter((r) => r.missing !== true && (r.want === true || r.want === false))
const tp = judged.filter((r) => r.want && r.drawn).length
const fn = judged.filter((r) => r.want && !r.drawn).length
const fp = judged.filter((r) => !r.want && r.drawn).length
const tn = judged.filter((r) => !r.want && !r.drawn).length
const out = {
  묶음: spec.묶음 ?? null,
  backend: spec.backend ?? null,
  contract: JUDGE_CONTRACT,
  잰것: judged.length,
  불명: rows.filter((r) => r.want === null).length,
  없는컷: rows.filter((r) => r.missing === true).length,
  성한것을맞힘: tp,
  성한것을거절: fn,
  망가진것을통과: fp,
  망가진것을거절: tn,
  rows,
}
writeFileSync(resolve(ROOT, OUT), `${JSON.stringify(out, null, 1)}\n`)

console.log(`  계약 ${String(JUDGE_CONTRACT)} · 잰 것 ${String(judged.length)}장`
  + ` (불명 ${String(out.불명)} · 없는 컷 ${String(out.없는컷)})`)
console.log(`  성한 것 ${String(tp + fn)}장 중 ${String(tp)}장 통과 · **거절 ${String(fn)}장**`)
console.log(`  망가진 것 ${String(fp + tn)}장 중 ${String(tn)}장 거절 · **통과 ${String(fp)}장**`)
for (const r of rows.filter((x) => x.want === true && x.drawn === false)) {
  console.log(`  ✗ 정상인데 떨어졌다 — ${r.path} (${String(r.filled)}/${String(r.roi)} · 최저칸 ${String(r.low)})`)
}
for (const r of rows.filter((x) => x.want === false && x.drawn === true)) {
  console.log(`  ✗ 망가졌는데 통과했다 — ${r.path} (${String(r.filled)}/${String(r.roi)} · 최저칸 ${String(r.low)})`)
}
console.log(`  ${OUT}`)
process.exit(fn === 0 && fp === 0 ? 0 : 1)
