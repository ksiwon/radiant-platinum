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
  'distortion', 'trainerSprites',
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

/**
 * 설치된 것을 **그룹째로** 돌려준다 (REPAIR.md §2.2).
 *
 * `readInstalled`는 파일을 다 읽어 해싱하느라 7,000개에서 몇 분이 가고,
 * `readInstalledLight`는 이름 댄 몇 개만 본다. 이것은 그 사이다 —
 * **목차만 읽어 그룹마다 개수·바이트·경로**를 주고, 무거운 해싱은 그룹마다
 * **대표 한 파일씩**만 한다.
 *
 * ⚠️ **대표를 손으로 안 고른다.** 그룹 안에서 경로를 정렬해 첫 번째를 쓴다 —
 * 손으로 고른 표는 변환기가 파일 이름을 바꾸면 조용히 낡는다. 그림과 그 밖의
 * 것을 따로 하나씩 뽑는 이유는 아래 `readPixelSha`와 같다
 *
 * ⚠️ **그림은 펴서 픽셀을 해싱한다.** deflate가 같은 픽셀에서 여러 정답을
 * 내므로 바이트로는 노드 산출물과 영영 안 맞는다 (`import/platinum/png.ts`).
 * 캔버스를 안 쓰는 이유는 색 관리 때문이다 — `createImageBitmap`을 거치면
 * 브라우저가 색공간을 바꿔 놓을 수 있어서, 그러면 **픽셀이 달라도 우리 탓인지
 * 캔버스 탓인지 못 가른다.** 그래서 여기서 직접 편다
 */
export async function readInstalledGroups(known = []) {
  const root = await navigator.storage.getDirectory()
  const rp = await root.getDirectoryHandle('radiant-platinum')
  const assets = await rp.getDirectoryHandle('assets')
  const manifest = JSON.parse(await (await (await rp.getFileHandle('install.json')).getFile()).text())
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

  const fileAt = async (path) => {
    const parts = path.split('/')
    let dir = assets
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
    return (await dir.getFileHandle(parts.at(-1))).getFile()
  }

  // ⚠️ **그림은 여기서 안 편다 — 바이트를 그대로 내보낸다.**
  //
  // 처음에는 페이지 안에서 펴서 픽셀을 해싱했는데, 그러면 펴는 자가 둘이 되고
  // (노드 `decodePng`과 여기) **둘이 어긋나면 멀쩡한 변환기가 붉어진다.** 게다가
  // 정본 CSP에는 `unsafe-eval`이 없어서 소스를 넘겨 다시 세우는 길도 막힌다
  // (`page.evaluate: EvalError … script-src 'self'` — 실제로 여기서 떨어졌다).
  //
  // 그래서 대표 그림 **한 장의 바이트**만 실어 보내고, 펴서 견주는 일은 노드가
  // 제 `decodePng` 하나로 양쪽 다 한다. 자가 하나가 되고 CSP도 안 건드린다
  const base64 = (bytes) => {
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(s)
  }
  /** 대표 한 장이라 크지 않다. 그래도 상한을 둔다 — 넘으면 「못 잼」이다 */
  const PIXEL_CAP = 8 << 20

  const groups = {}
  const reps = {}
  for (const [name, group] of Object.entries(manifest.groups)) {
    const paths = group.files
      .map((rec) => [rec.path, rec.bytes ?? 0])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    groups[name] = {
      files: paths.length,
      bytes: paths.reduce((s, [, n]) => s + n, 0),
      paths,
    }
    // ⚠️ **일부러 다른 것을 대표로 뽑지 않는다.** 뽑으면 그 그룹의 대표 축이
    // 늘 붉거나 늘 「못 잼」이라, 그룹 하나가 통째로 안 재진다
    const pick = (test) => paths.find(([p]) => test(p) && !known.includes(p))?.[0] ?? null
    const pngPath = pick((p) => p.endsWith('.png'))
    const glbPath = pick((p) => p.endsWith('.glb'))
    const bytePath = pick((p) => !p.endsWith('.png') && !p.endsWith('.glb'))
    reps[name] = { byte: null, pixel: null, model: null }
    if (bytePath) {
      const buf = await (await fileAt(bytePath)).arrayBuffer()
      reps[name].byte = { path: bytePath, sha: hex(await crypto.subtle.digest('SHA-256', buf)) }
    }
    if (pngPath) {
      const buf = new Uint8Array(await (await fileAt(pngPath)).arrayBuffer())
      reps[name].pixel = buf.byteLength > PIXEL_CAP
        ? { path: pngPath, tooBig: buf.byteLength }
        : { path: pngPath, png: base64(buf) }
    }
    // 모델도 같은 까닭으로 바이트를 그대로 보낸다 — 노드가 구조로 견준다
    if (glbPath) {
      const buf = new Uint8Array(await (await fileAt(glbPath)).arrayBuffer())
      reps[name].model = buf.byteLength > PIXEL_CAP
        ? { path: glbPath, tooBig: buf.byteLength }
        : { path: glbPath, glb: base64(buf) }
    }
  }
  return { state: manifest.state, groups, reps }
}

/**
 * 이름 댄 파일 몇 개의 **알맹이**를 읽어 온다.
 *
 * ⚠️ **크기만 적힌 실패는 다시 몰게 만든다.** 「브라우저 1744 ≠ 노드 1708」로는
 * 무엇이 늘었는지 몰라서 ⑮를 한 번 더 돌려야 하는데, 그 한 번이 몇십 분이다.
 * 어긋난 것을 발견한 그 자리에서 알맹이를 받아 **무엇이 다른지까지** 적는다
 */
export async function readFiles(paths) {
  const root = await navigator.storage.getDirectory()
  const rp = await root.getDirectoryHandle('radiant-platinum')
  const assets = await rp.getDirectoryHandle('assets')
  const out = {}
  for (const path of paths) {
    try {
      const parts = path.split('/')
      let dir = assets
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
      out[path] = await (await (await dir.getFileHandle(parts.at(-1))).getFile()).text()
    } catch (e) { out[path] = null }
  }
  return out
}
