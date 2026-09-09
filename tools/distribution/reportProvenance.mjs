// 번들 출처를 사람이 읽게 찍는다 (DEPLOY.md §4).
//
//     pnpm build && pnpm provenance
//
// `vite build`가 `.audit/bundle-provenance.json`을 남기고, 이 파일이 그것을 읽는다.
// 숫자는 `renderedLength` — 원본 파일 크기가 아니라 **그 청크에 실제로 실린**
// 바이트다. tree-shaking 뒤의 값이라야 "무엇이 얼마나 나가는가"의 답이 된다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { forbiddenIn } from './provenance.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const AT = resolve(ROOT, '.audit/bundle-provenance.json')

if (!existsSync(AT)) {
  console.error('출처 보고서가 없다. `pnpm build`를 먼저 돌린다.')
  process.exit(2)
}

const kb = (n) => `${(n / 1024).toFixed(0)}kB`.padStart(8)
const report = JSON.parse(readFileSync(AT, 'utf8'))

console.log('청크별 출처 (숫자는 minify 전 renderedLength)\n')
for (const c of report.chunks) {
  const kinds = Object.entries(c.byKind).sort((a, b) => b[1] - a[1])
  console.log(`${c.file}  ${(c.bytes / 1024).toFixed(0)}kB · 모듈 ${c.modules}개`)
  for (const [kind, bytes] of kinds) console.log(`   ${kind.padEnd(14)}${kb(bytes)}`)
  const pkgs = Object.entries(c.byPkg).sort((a, b) => b[1] - a[1]).slice(0, 4)
  if (pkgs.length) console.log(`   ← ${pkgs.map(([p, b]) => `${p} ${(b / 1024).toFixed(0)}kB`).join(' · ')}`)
  console.log('')
}

const bad = forbiddenIn(report)
if (bad.length === 0) {
  console.log('제3자 정적 게임 데이터: 없음')
  process.exit(0)
}

const total = bad.reduce((a, b) => a + b.bytes, 0)
console.log(`⛔ 제3자 정적 게임 데이터 ${bad.length}개 모듈 · ${(total / 1048576).toFixed(2)}MB`)
console.log('   MIT 패키지라는 사실과, 거기 담긴 게임 데이터를 우리가 배포해도 되는지는')
console.log('   다른 질문이다. 미해결 release blocker다 — docs/DEPLOY.md §4\n')
for (const b of bad.sort((a, x) => x.bytes - a.bytes).slice(0, 15)) {
  console.log(`   ${kb(b.bytes)}  ${b.id.replace(/^.*node_modules\//, '')}`)
}
if (bad.length > 15) console.log(`   … 외 ${bad.length - 15}개`)
process.exitCode = 1
