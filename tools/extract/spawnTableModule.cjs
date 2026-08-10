'use strict'
// `src/spawn_locations.c` → src/import/platinum/spawnTable.ts (DATA.md §2.3)
//
//     pnpm gen:spawnTable
//
// ⚠️ **롬에 없는 표다.** 전멸했을 때 서는 자리와 공중날기로 내리는 자리 스무
// 줄은 원작 소스의 `sSpawnLocations`에만 있다 — 코드에 박힌 배열이라 NARC으로도
// 오버레이로도 안 나온다. 공개 Importer가 쓸 수 있게 여기 구워 온다
// (`charmap`·`scriptMeta`·`spriteTable`과 같은 자리).
//
// ⚠️ **손으로 옮기지 않는다.** 맵 이름 20개와 좌표 80개를 옮기다 하나만
// 어긋나도 엉뚱한 마을에서 깨어난다.
const { readFileSync, writeFileSync } = require('node:fs')
const { resolve, relative } = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = resolve(ROOT, 'src/import/platinum/spawnTable.ts')

const read = (p) => readFileSync(resolve(DECOMP, p), 'utf8')

/** `MAP_HEADER_*` → 맵 번호. 줄 번호가 곧 값이다 */
const mapIds = new Map(read('generated/map_headers.txt').split(/\r?\n/).map((n, i) => [n, i]))
/** `FIRST_ARRIVAL_*` → 그 존에 처음 온 것을 적는 시스템 플래그 번호 */
const arrivals = new Map(
  read('generated/first_arrival_to_zones.txt').split(/\r?\n/).map((n, i) => [n, i]),
)

const body = read('src/spawn_locations.c')
const from = body.indexOf('sSpawnLocations[] = {')
const table = body.slice(from, body.indexOf('};', from))

const rows = []
for (const line of table.split(/\r?\n/)) {
  const m = /^\s*\{\s*(.+?)\s*\}\s*,?\s*$/.exec(line)
  if (!m) continue
  const f = m[1].split(',').map((s) => s.trim())
  if (f.length !== 9) throw new Error(`칸이 9개가 아니다: ${line}`)
  const num = (s) => {
    const v = Number(s)
    if (!Number.isFinite(v)) throw new Error(`숫자가 아니다: ${s}`)
    return v
  }
  const mapOf = (name) => {
    const id = mapIds.get(name)
    if (id === undefined) throw new Error(`맵 이름을 못 찾았다: ${name}`)
    return id
  }
  const arrival = arrivals.get(f[8])
  if (arrival === undefined) throw new Error(`도착 플래그를 못 찾았다: ${f[8]}`)
  rows.push({
    blackOut: { map: mapOf(f[0]), x: num(f[1]), z: num(f[2]) },
    fly: { map: mapOf(f[3]), x: num(f[4]), z: num(f[5]) },
    // 공중날기 자리가 그 존에 **처음 발을 들이면** 열린다
    unlockOnMapEntry: num(f[7]) === 1,
    firstArrival: arrival,
  })
}
if (rows.length !== 20) throw new Error(`스폰 지점이 20개가 아니다: ${rows.length}`)

// 이름을 붙여 둔다 — 자료를 눈으로 볼 때 어느 마을인지 알아야 한다
const names = [...mapIds.keys()]
const spawns = rows.map((r) => ({ ...r, blackOutName: names[r.blackOut.map], flyName: names[r.fly.map] }))

const line = (s) =>
  `  { blackOut: { map: ${s.blackOut.map}, x: ${s.blackOut.x}, z: ${s.blackOut.z} },`
  + ` fly: { map: ${s.fly.map}, x: ${s.fly.x}, z: ${s.fly.z} },`
  + ` unlockOnMapEntry: ${s.unlockOnMapEntry}, firstArrival: ${s.firstArrival},`
  + ` blackOutName: ${JSON.stringify(s.blackOutName)}, flyName: ${JSON.stringify(s.flyName)} },`

const out = `// 부활 지점과 공중날기 목적지 (DATA.md §2.3)
//
// ⚠️ **손으로 고치지 않는다.** \`pnpm gen:spawnTable\`이 디컴프에서 다시 만든다
// (\`tools/extract/spawnTableModule.cjs\`).
//
// 원작 \`src/spawn_locations.c\`의 \`sSpawnLocations\` 스무 줄이 전부다. 한 줄에
// **전멸했을 때 서는 자리**(포켓몬센터 1층 안)와 **공중날기로 내리는 자리**(그
// 마을 바깥)가 같이 들어 있다. 코드에 박힌 배열이라 롬 파일로는 안 나온다.

export interface SpawnPoint {
  blackOut: { map: number, x: number, z: number }
  fly: { map: number, x: number, z: number }
  /** 공중날기 자리가 그 존에 처음 발을 들이면 열리는가 */
  unlockOnMapEntry: boolean
  firstArrival: number
  blackOutName: string
  flyName: string
}

export const SPAWN_TABLE: readonly SpawnPoint[] = [
${spawns.map(line).join('\n')}
]
`
writeFileSync(OUT, out)
console.log(`스폰 지점 ${spawns.length}개 → ${relative(ROOT, OUT)}`)
