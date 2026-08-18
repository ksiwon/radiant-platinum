// E2E가 쓰는 재료 (DEPLOY.md §6)
//
// ⚠️ **내용은 합성이다. 그 사실을 숨기지 않는다.** 실제 설치는 필수 그룹 12개
// 중 2개(`moves`·`marts`)만 만들 수 있어서 `ready`에 도달할 수 없다
// (blocker 3). 그래서 "설치본이 있을 때 부팅이 어디로 가는가"를 재려면
// 기록을 손으로 심는 수밖에 없다.
//
// 재는 것과 안 재는 것을 갈라 둔다:
//
//   재는 것    부팅 갈래 · HTTP로 안 되돌아가는가 · 길이/해시 검증에 이빨이
//              있는가 · reload 없이 갈아 끼우는가
//   안 재는 것  변환 정확도. 그건 노드 parity 시험이 잰다 (`convert.test.ts`)
//
// 심는 것은 **앱이 실제로 읽는 모양 그대로**다 — `install.json`의 스키마도,
// SHA-256도, 두 저장소로 나뉜 자리도. 모양을 대충 맞추면 통과가 거짓이 된다.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')

/**
 * 지금 앱이 보는 그룹별 산출물 판 (`src/import/install/assetFormat.ts`).
 *
 * ⚠️ **손으로 베끼지 않는다.** 여기가 1로 굳어 있던 동안, 변환기를 고쳐 판을
 * 올리면 심어 둔 기록이 통째로 `install:outdated`가 되어 ⑥⑧⑲㉒가 한꺼번에
 * 붉어졌다 — 앱이 잘못된 것이 아니라 재료가 낡은 것이었다. 그래서 표를 읽는다
 */
export const GROUP_FORMAT = (() => {
  const src = readFileSync(resolve(ROOT, 'src/import/install/assetFormat.ts'), 'utf8')
  const block = /GROUP_FORMAT:[^=]*=\s*\{([\s\S]*?)\n\}/.exec(src)
  if (!block) throw new Error('assetFormat.ts에서 GROUP_FORMAT을 못 찾았다')
  const out = {}
  for (const m of block[1].matchAll(/^\s{2}(\w+):\s*(\d+),/gm)) out[m[1]] = Number(m[2])
  if (Object.keys(out).length === 0) throw new Error('GROUP_FORMAT이 비었다 — 파싱이 어긋났다')
  return out
})()

/**
 * 최소 모양의 `AssetAssistant/` 폴더를 만든다.
 *
 * ⚠️ **진짜 BDSP 덤프가 아니다.** `scanBdsp`가 재는 것은 *모양*이다 — 그룹
 * 색인 다섯 개, 각 폴더에 번들이 하나라도, 표본 종 둘에 두 벌씩. 그 판정
 * 로직을 브라우저에서 지나가게 하는 것이 목적이고, 변환은 어차피 막혀 있다
 * (blocker 3). 수만 개짜리 진짜 폴더를 브라우저 파일 입력에 밀어 넣으면
 * 재려던 것과 상관없는 데서 몇 분이 간다.
 *
 * 리포 밖(`.audit/`)에 만든다 — 산출물이 아니고 커밋 대상도 아니다
 */
export function fakeBdsp() {
  const base = resolve(ROOT, '.audit/e2e-bdsp')
  rmSync(base, { recursive: true, force: true })
  const at = resolve(base, 'AssetAssistant')
  for (const g of ['Dpr', 'Battle', 'Characters', 'Environments', 'Pokemon Database']) {
    mkdirSync(resolve(at, g), { recursive: true })
    writeFileSync(resolve(at, `${g}.bin`), Buffer.alloc(64, 1))
    writeFileSync(resolve(at, g, 'placeholder'), Buffer.alloc(128, 2))
  }
  // 표본 종은 한 종에 두 벌 이상이어야 한다 (`SAMPLE_SPECIES`)
  for (const s of ['pm0387', 'pm0001']) {
    for (const n of ['_00_00', '_00_01']) {
      writeFileSync(resolve(at, 'Pokemon Database', `${s}${n}`), Buffer.alloc(256, 3))
    }
  }
  return base
}

/**
 * 페이지 안에서 도는 함수 — OPFS의 설치 기록과 파일 해시를 읽어 온다.
 *
 * `page.evaluate(readInstalled)`. 앱 모듈을 안 부른다: 재려는 것이 **저장소에
 * 실제로 남은 것**이지 앱이 뭐라고 말하는지가 아니다
 */
export async function readInstalled() {
  const root = await navigator.storage.getDirectory()
  const rp = await root.getDirectoryHandle('radiant-platinum')
  const assets = await rp.getDirectoryHandle('assets')
  const manifest = JSON.parse(await (await (await rp.getFileHandle('install.json')).getFile()).text())
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
  const sha = {}
  for (const group of Object.values(manifest.groups)) {
    for (const rec of group.files) {
      const parts = rec.path.split('/')
      let dir = assets
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
      const file = await (await dir.getFileHandle(parts.at(-1))).getFile()
      sha[rec.path] = hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
    }
  }
  return { state: manifest.state, groups: Object.keys(manifest.groups), sha }
}

/**
 * 같은 것을 **해시 없이**. 진짜 BDSP까지 설치한 뒤에는 파일이 수천 개에
 * 580MB라, 전부 다시 읽어 SHA-256을 뜨는 것만으로 몇 분이 간다.
 *
 * 무결성은 앱이 부팅할 때 스스로 검사한다 — 여기서는 **무엇이 몇 개 들어왔는지**와
 * 이름을 대서 고른 몇 개만 본다 (`want`에 적은 경로)
 */
export async function readInstalledLight(want) {
  const root = await navigator.storage.getDirectory()
  const rp = await root.getDirectoryHandle('radiant-platinum')
  const assets = await rp.getDirectoryHandle('assets')
  const manifest = JSON.parse(await (await (await rp.getFileHandle('install.json')).getFile()).text())
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

  let files = 0
  let bytes = 0
  const counts = {}
  for (const [name, group] of Object.entries(manifest.groups)) {
    counts[name] = group.files.length
    files += group.files.length
    for (const rec of group.files) bytes += rec.bytes ?? 0
  }

  const sha = {}
  for (const path of want) {
    const parts = path.split('/')
    let dir = assets
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
    const file = await (await dir.getFileHandle(parts.at(-1))).getFile()
    sha[path] = hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
  }
  return { state: manifest.state, groups: Object.keys(manifest.groups), counts, files, bytes, sha }
}

// ⚠️ **`src/import/install/required.ts`와 같아야 한다.** 갈리면 ⑥이 거짓
// 통과한다. 둘로 나눠 두는 것은 ⑨가 **BDSP 없이** 도는 시험이라, "Platinum
// 쪽은 전부 나왔다"를 따로 못 박아야 하기 때문이다
export const REQUIRED_PLATINUM_GROUPS = [
  'text', 'species', 'moves', 'maps', 'chunks', 'scripts', 'marts', 'npcTrades', 'sound',
  'pokegra', 'encounters', 'trainers', 'spawns', 'items', 'npcSprites', 'itemIcons',
  'pokeIcons', 'boxWallpapers', 'poketchMap', 'signposts', 'starterScene', 'distortionProps',
  'trainerSprites',
]

export const REQUIRED_BDSP_GROUPS = ['npcModels', 'monModels', 'arenas', 'motionTiming']

export const REQUIRED_GROUPS = [...REQUIRED_PLATINUM_GROUPS, ...REQUIRED_BDSP_GROUPS]

/**
 * 페이지 안에서 도는 함수. `page.evaluate(SYNTHETIC, { state, groups })`.
 *
 * ⚠️ 앱 모듈을 import 하지 않는다 — 프로덕션 번들에는 경로가 없다. OPFS
 * 표준 API와 `crypto.subtle`만 쓴다. 그래서 이 함수가 만든 것이 앱이 읽는
 * 것과 같은지는 **스키마를 손으로 맞춰서** 보장한다 (`manifestSchema.ts`)
 */
export async function SYNTHETIC({ state, groups, groupFormat, commit }) {
  const ROOT = 'radiant-platinum'
  const ASSETS = 'assets'
  // ⚠️ `manifestSchema.ts`의 값과 같아야 한다. 갈리면 앱이 이 기록을 못 읽고,
  // 그러면 시험이 "설치본이 있을 때"가 아니라 "기록이 깨졌을 때"를 재게 된다
  const CONTRACT_VERSION = 3
  const ASSET_FORMAT = 1

  const root = await navigator.storage.getDirectory()
  const rp = await root.getDirectoryHandle(ROOT, { create: true })
  const assets = await rp.getDirectoryHandle(ASSETS, { create: true })

  const enc = new TextEncoder()
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

  const put = async (path, bytes) => {
    const parts = path.split('/')
    let dir = assets
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true })
    const h = await dir.getFileHandle(parts.at(-1), { create: true })
    const w = await h.createWritable()
    await w.write(bytes)
    await w.close()
    return {
      path,
      bytes: bytes.byteLength,
      sha256: hex(await crypto.subtle.digest('SHA-256', bytes)),
    }
  }

  const table = {}
  for (const name of groups) {
    // 그룹마다 파일 하나. 내용은 그룹 이름이라 서로 다른 해시가 나온다
    const bytes = enc.encode(JSON.stringify({ synthetic: name, note: 'e2e fixture' }))
    const record = await put(`data/${name}.json`, bytes)
    table[name] = {
      files: [record], bytes: record.bytes, converter: 1,
      // 그룹마다 산출물 판. 하나만 낡게 만들어 "그 그룹만 다시" 를 잴 수 있다
      format: groupFormat?.[name] ?? ASSET_FORMAT,
    }
  }

  const manifest = {
    contractVersion: CONTRACT_VERSION,
    state,
    platinumLocale: 'en',
    availableLocales: ['en'],
    startedAt: '2026-08-10T00:00:00.000Z',
    assetFormat: ASSET_FORMAT,
    groups: table,
  }
  if (state === 'ready') {
    manifest.finishedAt = '2026-08-10T00:01:00.000Z'
    // 도장. `commit: false`를 주면 일부러 안 찍는다 — 도장 없이 ready인
    // 기록을 앱이 거절하는지 재려고
    if (commit !== false) {
      manifest.commit = {
        at: '2026-08-10T00:01:00.000Z',
        appVersion: commit?.appVersion ?? '0.1.0',
        buildId: commit?.buildId ?? 'e2efixt',
        assetFormat: ASSET_FORMAT,
      }
    }
  }

  const write = async (name, value) => {
    const h = await rp.getFileHandle(name, { create: true })
    const w = await h.createWritable()
    await w.write(enc.encode(JSON.stringify(value, null, 1)))
    await w.close()
  }
  await write('install.json', manifest)
  await write('journal.json', {
    contractVersion: CONTRACT_VERSION, done: groups, running: null,
  })
  return groups.length
}
