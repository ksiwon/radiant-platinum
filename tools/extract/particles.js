// 입자 자료(`.spa`)를 롬에서 잘라 낸다 (DATA.md §2.28)
//
//     pnpm extract:particles
//
// ⚠️ **굽는 쪽이 둘이다.** 브라우저 쪽은 `src/import/platinum/particles.ts`이고
// **바이트가 같아야 한다** — 둘 다 하는 일이 「NARC 멤버를 이어 붙이고 자리표를
// 적는다」뿐이라 그 규칙이 자동으로 지켜진다. 어긋나지 않는지는
// `src/import/platinum/particles.test.ts`가 롬으로 직접 잰다.
//
// ⚠️ **읽는 것은 여기서 안 한다.** `.spa`를 푸는 것은 실행 중에
// `engine/battle/spl/resource`가 하고, 그래서 이 파일에는 형식이 하나도 안 적혀
// 있다 — 형식이 두 군데 적히면 갈린다.
'use strict'
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve, dirname } = require('node:path')
const { openRom, ROOT } = require('./rom')

/** 입자가 든 NARC 여덟. 이름과 차례가 브라우저 쪽 `PARTICLE_NARCS`와 같아야 한다 */
const NARCS = [
  { name: 'waza', path: '/wazaeffect/effectdata/waza_particle.narc' },
  { name: 'ball', path: '/wazaeffect/effectdata/ball_particle.narc' },
  { name: 'egg', path: '/demo/egg/data/particle/egg_demo_particle.narc' },
  { name: 'evolve', path: '/demo/shinka/data/particle/shinka_demo_particle.narc' },
  { name: 'frontier', path: '/particledata/pl_frontier/frontier_particle.narc' },
  { name: 'formChange', path: '/particledata/pl_pokelist/pokelist_particle.narc' },
  { name: 'etc', path: '/particledata/pl_etc/pl_etc_particle.narc' },
  { name: 'common', path: '/particledata/particledata.narc' },
]

/** 바이트로 ` `·A·P·S */
const MAGIC = 0x53504120

const OUT = resolve(ROOT, 'public/data/particles')

function main() {
  const rom = openRom()
  mkdirSync(OUT, { recursive: true })
  const index = {}
  let members = 0
  let bytes = 0

  for (const group of NARCS) {
    const narc = rom.narc(group.path)
    const count = narc.count ?? narc.length
    const at = []
    const size = []
    const parts = []
    let total = 0
    for (let i = 0; i < count; i++) {
      const member = Buffer.from(narc.get ? narc.get(i) : narc[i])
      // ⚠️ **번호가 밀리면 대본이 엉뚱한 입자를 부른다** — 대본이 주는 것이
      // 이름이 아니라 멤버 번호라, 하나라도 건너뛰면 그 뒤가 다 어긋난다
      if (member.length < 32 || member.readUInt32LE(0) !== MAGIC) {
        throw new Error(`${group.name} ${i}번이 .spa가 아니다`)
      }
      at.push(total)
      size.push(member.length)
      parts.push(member)
      total += member.length
    }
    writeFileSync(resolve(OUT, `${group.name}.bin`), Buffer.concat(parts))
    index[group.name] = { at, size }
    members += count
    bytes += total
  }

  const json = resolve(OUT, 'index.json')
  mkdirSync(dirname(json), { recursive: true })
  writeFileSync(json, `${JSON.stringify(index)}\n`)
  console.log(`입자 ${NARCS.length}묶음 · 멤버 ${members}개 · ${(bytes / 1048576).toFixed(2)}MiB`
    + ` → public/data/particles/`)
}

main()
