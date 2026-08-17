// 오버월드 NPC 모델 굽기 (DATA.md §2.16)
//
//     node --experimental-strip-types tools/extract/npcModels.mjs
//
// 어느 그림에 어느 사람을 세울지는 `engine/actor/npcModels`가 정한다 —
// **여기서 다시 적지 않는다.** 그 규칙을 두 군데 두면 화면에 서는 사람과
// 구워 둔 사람이 조용히 갈린다. 그래서 그 모듈을 그대로 불러 쓴다
// (노드가 타입만 벗겨 준다).
//
// ⚠️ **파일 이름이 번들 이름이다.** 한동안 번들 안 텍스처 이름표(`eliteM`)로
// 이름을 붙였는데, 그 낱말은 **번들 하나를 가리키지 않는다** — `tr1024_00`
// (에이스 트레이너)과 `tr1053_00`(눈 지방 에이스 트레이너)이 둘 다 `eliteM`이라
// 먼저 구운 것이 나중 것을 덮었다. 번들 이름은 하나뿐이다.
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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOf, modelFor } from '../../src/engine/actor/npcModels.ts'
import { TRAINER_MODELS } from '../../src/import/bdsp/trainerModels.ts'
import { createRequire } from 'node:module'

const rawSources = createRequire(import.meta.url)('../raw/sources.cjs')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = resolve(ROOT, 'public/data')
const OUT = resolve(ROOT, 'public/models/npc')
const PERSONS = resolve(rawSources.requireDir('bdsp.characters'), 'persons')

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

  // ⚠️ **배치표만 보면 못 찾는 사람이 있다.** `OBJ_EVENT_GFX_VAR_0`~`VAR_F`
  // (101~116)는 자리표시자고, 무엇이 설지는 맵 초기화 스크립트가 변수에 넣는다
  // (`actor/npcs`의 `resolveGfx`). 201번 도로가 그 자리다 — 성별을 보고
  // 광휘나 빛나를 세운다. 정적으로는 못 푸는 값이라 **둘 다** 굽는다.
  //
  // 이 둘은 배치표에 한 번도 안 나오므로, 안 적으면 컷신에서 나타나는 사람만
  // 판때기로 서서 옆에 선 사람과 눈에 띄게 다르다
  const VAR_GFX = [101, 116]
  const THROUGH_VARS = [0, 97] // PLAYER_M · PLAYER_F
  const varSlots = [...used].filter(([g]) => g >= VAR_GFX[0] && g <= VAR_GFX[1])
  if (varSlots.length > 0) {
    const n = varSlots.reduce((a, [, c]) => a + c, 0)
    console.log(`  변수로 정해지는 자리 ${varSlots.length}종 (배치 ${n}건) → 주인공 둘을 함께 굽는다`)
    for (const g of THROUGH_VARS) used.set(g, (used.get(g) ?? 0) + 1)
  }

  /** 그림 번호 → 후보 번들들. 실제로 구워진 첫 번째가 그 사람이 된다 */
  const bySprite = new Map()
  /** 후보 차례 하나. 같은 차례를 여럿이 쓰면 한 번만 굽는다 */
  const wanted = new Map()
  for (const [sprite] of used) {
    const name = sprites[String(sprite)]?.name
    const model = name ? modelFor(name, table, sprite) : null
    if (!model) continue
    bySprite.set(sprite, model)
    if (!wanted.has(model.bundles.join(' '))) wanted.set(model.bundles.join(' '), model)
  }

  // ⚠️ **배틀에 서는 몸은 오버월드와 다르다.** 「PI」처럼 오버월드 그림을 다른
  // 갈래와 나눠 쓰는 사람이 있어서, 배치표만 보고 구우면 그 갈래로 배틀에
  // 들어갈 때 몸이 없다 (`scene/battle/BattleTrainers`). 근거표에 있는 갈래는
  // 전부 굽는다
  for (const [cls, bundle] of TRAINER_MODELS) {
    const order = [bundle, `fc${bundle.slice(2)}`]
      .filter((b, i) => i === 0 || b in table.field.bundles)
    if (!wanted.has(order.join(' '))) {
      wanted.set(order.join(' '), { bundles: order, via: `배틀 갈래 ${cls}` })
    }
  }

  mkdirSync(OUT, { recursive: true })
  const BAKER = resolve(ROOT, 'tools/extract/bdspGlb.py')
  // ⚠️ **굽는 쪽이 바뀌면 다시 굽는다.** 번들 날짜만 보면 굽는 규칙을 고쳐도
  // 전부 "그대로 둔 것"이 되어 낡은 glb가 남는다 — 실제로 스킨 폭을 고친 뒤에
  // 0개가 다시 구워졌다.
  //
  // ⚠️ **딸린 파일까지 본다.** `bdspGlb.py` 하나만 보면 색을 굽는
  // `bdsp_bake_albedo.py`나 리타깃을 고쳐도 아무것도 안 다시 구워진다 —
  // 엄마 얼굴의 파란 가면(ColorVariation 채널 순서)을 고치고도 106개가 전부
  // 건너뛰어졌다
  const bakerAt = Math.max(...['bdspGlb.py', 'bdsp_bake_albedo.py', 'bdspRetarget.py']
    .map((f) => statSync(resolve(ROOT, 'tools/extract', f)).mtimeMs))
  const done = new Set()
  const broken = new Set()
  let made = 0, skipped = 0, bytes = 0
  const failed = []
  /** 번들 하나. 이미 해 본 것은 다시 안 한다 — 여럿이 같은 몸을 쓴다 */
  const bake = (bundle) => {
    if (done.has(bundle)) return true
    if (broken.has(bundle)) return false
    const src = resolve(PERSONS, buildOf(bundle), bundle)
    if (!existsSync(src)) { broken.add(bundle); return false }
    const out = resolve(OUT, `${bundle}.glb`)
    const fresh = Math.max(statSync(src).mtimeMs, bakerAt)
    if (existsSync(out) && statSync(out).mtimeMs > fresh) {
      done.add(bundle)
      skipped++
      bytes += statSync(out).size
      return true
    }
    try {
      execFileSync('py', [
        '-3.13', BAKER, src, '-o', out,
        '--max-texture', String(MAX_TEXTURE), '--no-clips',
      ], { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch {
      broken.add(bundle)
      return false
    }
    done.add(bundle)
    made++
    bytes += statSync(out).size
    return true
  }

  for (const [key, model] of [...wanted].sort()) {
    // ⚠️ **앞엣것이 되면 뒤엣것은 안 굽는다.** 후보가 등신 하나에 치비 하나라,
    // 다 구우면 쓰지도 않을 치비 백 벌이 같이 남는다 (37MB였다)
    const hit = model.bundles.find(bake)
    if (hit === undefined) { failed.push(key); continue }
    console.log(`  ${hit} ← ${model.via}`)
  }

  // 화면이 볼 표. **구워 낸 것만** 담는다 — 없는 glb를 받으러 가면 그 사람이
  // 판때기로도 안 서고 사라진다
  const table_out = {}
  for (const [sprite, model] of [...bySprite].sort((a, b) => a[0] - b[0])) {
    const bundle = model.bundles.find((b) => done.has(b))
    if (bundle !== undefined) table_out[sprite] = bundle
  }
  // ⚠️ **안 쓰는 glb를 남기지 않는다.** 규칙을 고칠 때마다 낡은 파일이 쌓이고,
  // 그것이 에셋 목차에 그대로 들어가 배포 크기로 잡힌다. 이름 규칙을 한 번
  // 바꿨을 때 87벌이 그렇게 남았다. **이 폴더는 이 도구가 임자다**
  const stale = readdirSync(OUT).filter((f) => !done.has(f.replace(/\.glb$/, '')))
  for (const f of stale) rmSync(resolve(OUT, f))
  if (stale.length) console.log(`  안 쓰는 glb ${stale.length}벌을 치웠다`)

  writeFileSync(resolve(DATA, 'npcModels.json'), JSON.stringify(table_out))
  console.log(`  표 ${Object.keys(table_out).length}개 → public/data/npcModels.json`)
  console.log(`NPC 모델 ${done.size}벌 — 새로 구운 것 ${made} · 그대로 둔 것 ${skipped}`)
  if (broken.size) console.warn(`  ⚠ 열다 끊긴 번들 ${broken.size}개: ${[...broken].join(' ')}`)
  if (failed.length) console.warn(`  ⚠ 후보가 다 끊긴 사람 ${failed.length}: ${failed.join(' · ')}`)
  console.log(`  합계 ${(bytes / 1024 / 1024).toFixed(1)}MB`)
  // ⚠️ **짝이 맞은 것이 아니라 실제로 구워진 것을 센다.** 못 구운 번들이 있으면
  // 그 그림은 판때기로 서는데(`table_out`에서 빠진다), 짝 기준으로 세면 안 선
  // 사람까지 "선다"로 잡힌다. 그리고 변수 자리로 넣은 주인공 둘은 배치가 0이라
  // 분모에서도 뺀다
  const real = [...used].filter(([g]) => !THROUGH_VARS.includes(g))
  const total = real.reduce((a, [, c]) => a + c, 0)
  const shown = real.filter(([g]) => table_out[g] !== undefined).reduce((a, [, c]) => a + c, 0)
  console.log(`  배치 ${total}개 중 모델이 서는 것 ${shown}개 (${(shown / total * 100).toFixed(1)}%)`)
}

main()
