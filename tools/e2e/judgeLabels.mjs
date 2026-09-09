// **보류 검증셋의 라벨 틀을 만든다** — 사람이 그림을 보고 채우라고.
//
//     node tools/e2e/judgeLabels.mjs --dir=shots/land42/<시각> --out=<라벨.json> --묶음="..."
//
// ⚠️ **`want`를 비워 둔 채 낸다.** 여기서 판정자를 돌려 기본값을 채우면 그
// 순간 정답이 「옛 알고리즘의 출력」이 되어 검증이 아니게 된다. 채우는 것은
// **그림을 본 사람**이고, 애매하면 `null`(불명)로 남긴다.
import { readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit === undefined ? d : hit.slice(n.length + 3)
}
const DIR = flag('dir')
if (DIR === null) throw new Error('--dir=<컷 폴더>가 있어야 한다')
const OUT = flag('out', `${DIR}/라벨.json`)

// 같은 실행의 신원을 함께 적는다 — 어느 백엔드·어느 세이브에서 나온 컷인지
const runAt = resolve(ROOT, DIR, '실행.json')
const run = existsSync(runAt) ? JSON.parse(readFileSync(runAt, 'utf8')) : {}

const cuts = readdirSync(resolve(ROOT, DIR))
  .filter((f) => f.endsWith('.png'))
  .sort()
  .map((f) => ({ path: `${DIR}/${f}`, want: null, why: '' }))

writeFileSync(resolve(ROOT, OUT), `${JSON.stringify({
  묶음: flag('묶음', DIR),
  backend: run.backend ?? null,
  save: run.save ?? null,
  maps: run.maps ?? null,
  주의: 'want는 그림을 직접 보고 채운다. 판정자의 출력으로 채우지 않는다. 애매하면 null.',
  cuts,
}, null, 1)}\n`)
console.log(`  ${String(cuts.length)}장 · ${OUT}`)
