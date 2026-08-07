// 부활 지점과 공중날기 목적지 (DATA.md §2.3)
//
// 원작 `src/spawn_locations.c`의 `sSpawnLocations` 스무 줄이 전부다. 한 줄에
// **전멸했을 때 서는 자리**(포켓몬센터 1층 안)와 **공중날기로 내리는 자리**
// (그 마을 바깥)가 같이 들어 있다.
//
// 이 표를 손으로 옮기지 않는다 — 맵 이름 20개와 좌표 80개를 옮기다 하나만
// 어긋나도 엉뚱한 마을에서 깨어난다. 이름은 `generated/map_headers.txt`의
// 줄 번호가 곧 맵 번호이므로 그대로 풀린다.
const { readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const DECOMP = resolve(__dirname, '../../raw/decomp')
const OUT = resolve(__dirname, '../../public/data/spawns.json')

const read = (p) => readFileSync(resolve(DECOMP, p), 'utf8')

/** `MAP_HEADER_*` → 맵 번호. 줄 번호가 곧 값이다 */
const mapIds = new Map(
  read('generated/map_headers.txt').split(/\r?\n/).map((name, i) => [name, i]),
)
/** `FIRST_ARRIVAL_*` → 그 존에 처음 온 것을 적는 시스템 플래그 번호 */
const arrivals = new Map(
  read('generated/first_arrival_to_zones.txt').split(/\r?\n/).map((name, i) => [name, i]),
)

const body = read('src/spawn_locations.c')
const table = body.slice(
  body.indexOf('sSpawnLocations[] = {'),
  body.indexOf('};', body.indexOf('sSpawnLocations[] = {')),
)

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
const out = {
  count: rows.length,
  spawns: rows.map((r) => ({
    ...r,
    blackOutName: names[r.blackOut.map],
    flyName: names[r.fly.map],
  })),
}
writeFileSync(OUT, JSON.stringify(out))
console.log(`스폰 지점 ${rows.length}개 → ${OUT}`)
for (const s of out.spawns) {
  console.log(`  ${s.flyName.replace('MAP_HEADER_', '').padEnd(28)} 전멸 ${String(s.blackOut.map).padStart(3)} (${s.blackOut.x},${s.blackOut.z}) · 날기 ${String(s.fly.map).padStart(3)} (${s.fly.x},${s.fly.z})`)
}
