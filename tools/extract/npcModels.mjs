// 오버월드 NPC 모델 굽기 (DATA.md §2.16)
//
//     node --experimental-strip-types tools/extract/npcModels.mjs
//
// 어느 그림에 어느 사람을 세울지는 `engine/actor/npcModels`가 정한다 —
// **여기서 다시 적지 않는다.** 그 규칙을 두 군데 두면 화면에 서는 사람과
// 구워 둔 사람이 조용히 갈린다. 그래서 그 모듈을 그대로 불러 쓴다
// (노드가 타입만 벗겨 준다).
//
// ⚠️ **텍스처와 클립을 줄여서 굽는다.** 그냥 구우면 한 명이 5.07MB고
// 마흔둘이면 213MB다. 그 중 절반이 애니메이션 클립인데 걷기는
// `actor/locomotion`이 뼈를 직접 돌려서 만들므로(주인공도 그렇다) 쓸 자리가
// 없다. 텍스처는 긴 변 256으로 줄인다:
//
//   그대로            5.07MB
//   텍스처 256        2.58MB
//   + 클립 없이       1.06MB   ← 이것으로 굽는다
//
// 한 맵이 쓰는 서로 다른 그림이 중앙값 셋이라, 맵 하나에 3MB쯤이다.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundlesByTag, modelFor } from '../../src/engine/actor/npcModels.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = resolve(ROOT, 'public/data')
const OUT = resolve(ROOT, 'public/models/npc')
const PERSONS = resolve(ROOT, 'raw/bdsp/Characters/persons')

/** 텍스처 긴 변의 상한. 위 표가 근거다 */
const MAX_TEXTURE = 256

const read = (p) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

function main() {
  const table = read('bdspNpc.json')
  const sprites = read('npcSprites.json')
  const events = read('events.json').events

  /** 오버월드 배치에 실제로 나오는 그림만 굽는다 */
  const used = new Map()
  for (const e of Object.values(events)) {
    for (const n of e.npcs) used.set(n.sprite, (used.get(n.sprite) ?? 0) + 1)
  }

  const wanted = new Map()
  /** 그림 번호 → 갈래. 화면 쪽은 이 표만 보면 된다 */
  const bySprite = new Map()
  let placed = 0, bare = 0
  for (const [sprite, count] of used) {
    const name = sprites[String(sprite)]?.name
    const model = name ? modelFor(name, table) : null
    if (!model) { bare += count; continue }
    placed += count
    bySprite.set(sprite, model.tag)
    if (wanted.has(model.tag)) continue
    const set = bundlesByTag(model.build === 'battle' ? table.battle : table.field)
    // 옷만 다른 같은 사람이 여럿이면 **번호가 제일 앞선 것**을 쓴다. 우리가
    // 고르는 것이 아니라 늘 같은 것이 나오게만 하면 된다
    const bundle = [...(set.get(model.tag) ?? [])].sort()[0]
    if (bundle) wanted.set(model.tag, { build: model.build, bundle })
  }

  mkdirSync(OUT, { recursive: true })
  let made = 0, skipped = 0, bytes = 0
  const failed = []
  for (const [tag, { build, bundle }] of [...wanted].sort()) {
    const src = resolve(PERSONS, build, bundle)
    const out = resolve(OUT, `${tag}.glb`)
    if (!existsSync(src)) { console.warn(`  ⚠ 번들이 없다: ${src}`); continue }
    if (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs) {
      skipped++
      bytes += statSync(out).size
      continue
    }
    try {
      execFileSync('py', [
        '-3.13', resolve(ROOT, 'tools/extract/bdspGlb.py'), src,
        '-o', out, '--max-texture', String(MAX_TEXTURE), '--no-clips',
      ], { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (e) {
      // 번들 몇 개는 같은 폴더에 없는 CAB을 가리킨다 (`tr1085_00`). 한 명을
      // 못 구웠다고 마흔 명을 멈추지 않는다 — 그 그림은 판때기로 남는다
      failed.push(`${tag}(${bundle})`)
      continue
    }
    made++
    bytes += statSync(out).size
    console.log(`  ${tag} ← ${bundle} (${(statSync(out).size / 1024 / 1024).toFixed(2)}MB)`)
  }
  // 화면이 볼 표. **구워 낸 것만** 담는다 — 없는 glb를 받으러 가면 그 사람이
  // 판때기로도 안 서고 사라진다
  const table_out = {}
  for (const [sprite, tag] of [...bySprite].sort((a, b) => a[0] - b[0])) {
    if (existsSync(resolve(OUT, `${tag}.glb`))) table_out[sprite] = tag
  }
  writeFileSync(resolve(DATA, 'npcModels.json'), JSON.stringify(table_out))
  console.log(`  표 ${Object.keys(table_out).length}개 → public/data/npcModels.json`)
  console.log(`NPC 모델 ${wanted.size}종 — 새로 구운 것 ${made} · 그대로 둔 것 ${skipped}`)
  if (failed.length) console.warn(`  ⚠ 못 구운 번들 ${failed.length}개: ${failed.join(' ')}`)
  console.log(`  합계 ${(bytes / 1024 / 1024).toFixed(1)}MB`)
  console.log(`  배치 ${placed + bare}개 중 모델이 서는 것 ${placed}개 (${(placed / (placed + bare) * 100).toFixed(1)}%)`)
}

main()
