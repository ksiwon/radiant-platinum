// 롬에서 나온 자료가 있어야 도는 시험 (COPYRIGHT.md §5)
//
// `public/data`는 롬에서 굽는 것이라 없는 환경이 있다. 그래서 시험 파일 95개 중
// **51개**가 파일 유무를 보고 빠진다.
//
// ⚠️ **없을 때 무슨 일이 나는지가 파일마다 달랐다.** 자료를 치우고 재 보면 41개는
// 그 자리에서 터지고 **10개는 조용히 초록으로 끝난다.** 41개가 시끄러운 것은
// 설계가 아니라 우연이다 — vitest는 건너뛰는 묶음도 몸통을 수집하므로, 몸통
// 첫머리에서 파일을 읽는 시험만 `ENOENT`로 터진다. `it` 안에서만 읽으면 안 터진다
// (`trainers.test.ts`의 자료를 치우면 9 skipped · 종료 코드 0이다).
//
// 이 프로젝트는 조용한 통과에 이미 한 번 속았다 — `shell.test.ts`가 색을 손으로
// 만들어 넘기는 바람에 소품 189종이 뚫린 채로 통과하고 있었다(DATA.md §2.2).
//
// 그래서 건너뛰기를 여기 한 군데로 모으고, **`PT_REQUIRE_DATA=1`이면 건너뛰는
// 대신 세운다.** `pnpm check`가 그 값을 켠다 — 개발 중에 하나씩 돌릴 때는
// 예전처럼 조용히 빠진다.
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe } from 'vitest'
import { AssetMissing, setAssetProvider, type AssetProvider } from './providers/assetProvider'

/** 굽는 자료가 놓이는 자리 */
export const DATA = resolve(__dirname, '../../public/data')

/**
 * 나무 셋. 없을 수 있는 이유가 저마다 달라서 실패 메시지도 달라야 한다.
 *
 * - `data` — 롬에서 굽는다. `public/data`로 갈 것이고, 언젠가 CDN이다
 * - `models` — BDSP·립 모델. 지금도 gitignore라 없는 기계가 있다
 * - `decomp` — `raw/decomp`. 11GB짜리 원본 나무라 애초에 리포에 안 들어간다
 */
const TREE = {
  data: { root: DATA, how: '`pnpm extract`로 만들거나 CDN에서 받는다' },
  models: {
    root: resolve(__dirname, '../../public/models'),
    how: '`pnpm extract:npcModels` 등 모델 파이프라인으로 만든다',
  },
  decomp: {
    root: resolve(__dirname, '../../raw/decomp'),
    how: '디컴프 원본이다. `raw/`는 리포에 안 들어간다 (COPYRIGHT.md §7)',
  },
} as const

type TreeName = keyof typeof TREE

/**
 * 자료가 없으면 건너뛰지 말고 세운다.
 *
 * 모듈을 읽을 때 한 번 보지 않고 **부를 때마다** 본다 — 그래야 이 장치 자체를
 * 시험할 수 있다. 값을 상수로 굳히면 "세운다"는 쪽 길을 아무도 안 밟는다
 */
export function requireData(): boolean {
  return process.env.PT_REQUIRE_DATA === '1'
}

/** 이번 실행에서 자료가 없어 빠진 묶음들. 끝에 한 번 알려 준다 */
const skipped: string[] = []

/** 무엇이 빠졌는지. 리포터가 읽는다 */
export function skippedForMissingData(): readonly string[] {
  return skipped
}

/**
 * 시험 묶음을 여는 함수.
 *
 * `typeof describe`로 안 쓴다 — `describe`와 `describe.skip`은 딸린 것
 * (`each`·`skipIf`…)이 달라서 한쪽으로 못 맞춘다. 부르는 쪽이 쓰는 모양은
 * 이것뿐이라 여기까지만 약속한다
 */
export type SuiteFn = (name: string, body: () => void) => void

function gate(tree: TreeName, files: readonly string[]): SuiteFn {
  const { root, how } = TREE[tree]
  const missing = files.filter((f) => !existsSync(resolve(root, f)))
  if (missing.length === 0) return describe
  if (requireData()) {
    throw new Error(
      `${tree}: 있어야 할 것이 없다 — ${missing.join(' · ')}\n`
      + `  ${root} 아래에 있어야 한다. ${how}.\n`
      + '  (건너뛰고 싶으면 PT_REQUIRE_DATA 없이 돌린다)',
    )
  }
  skipped.push(`${tree}: ${missing.join(' · ')}`)
  return describe.skip
}

/**
 * `public/data` 아래의 그 파일들이 다 있을 때만 도는 `describe`.
 *
 * 경로는 그 뿌리 기준 상대다 — 시험마다 `resolve(__dirname, '../../public/data')`를
 * 다시 적으면 계층이 깊어질 때마다 `../`가 하나씩 어긋난다.
 *
 * 없으면 기본은 건너뛰기고, `PT_REQUIRE_DATA=1`이면 **그 자리에서 세운다** —
 * 무엇이 없어서 안 도는지가 실패 메시지에 그대로 나온다
 */
export function withData(...files: readonly string[]): SuiteFn {
  return gate('data', files)
}

/** 같은 것을 `public/models` 아래로 */
export function withModels(...files: readonly string[]): SuiteFn {
  return gate('models', files)
}

/** 같은 것을 `raw/decomp` 아래로 */
export function withDecomp(...files: readonly string[]): SuiteFn {
  return gate('decomp', files)
}

// ── 롬 원본 ──────────────────────────────────────────────────────────────────

interface RawSources {
  platinumRom(locale: string): string | null
  sourceDir(key: string): string | null
  describeSources(): [string, string][]
}

/**
 * raw 원천 어댑터를 시험에서도 그대로 쓴다 (`tools/raw/sources.cjs`).
 *
 * ⚠️ **같은 결정을 두 번 적지 않는다.** 시험이 롬을 따로 찾으면 도구와 다른
 * 파일을 열 수 있고, 그러면 "도구는 되는데 시험은 안 된다"가 된다. CJS 모듈이라
 * `createRequire`로 부른다 — 도구 쪽 실행 경로를 안 바꾸려는 것이다
 */
const rawSources = createRequire(import.meta.url)('../../tools/raw/sources.cjs') as RawSources

/** 그 지역판 롬. 이 기계에 없으면 null (파일 이름이 아니라 헤더로 찾는다) */
export function romPath(locale: string): string | null {
  return rawSources.platinumRom(locale)
}

/**
 * 롬 파일을 브라우저 변환기가 받는 모양(`ByteSource`)으로.
 *
 * ⚠️ **통째로 안 읽는다.** 롬 하나가 128MB고 시험이 세 벌을 연다. 브라우저에서
 * `Blob.slice()`가 하는 것을 노드에서 `readSync`로 하는 것뿐이라, 변환기가 보는
 * 계약이 시험과 실제에서 같다
 */
export function fileSource(path: string): { readonly size: number, slice(a: number, b: number): Promise<Uint8Array> } {
  const size = statSync(path).size
  return {
    size,
    slice(start, end) {
      const want = Math.max(0, Math.min(end, size) - start)
      const out = Buffer.alloc(want)
      const fd = openSync(path, 'r')
      try { readSync(fd, out, 0, want, start) } finally { closeSync(fd) }
      return Promise.resolve(new Uint8Array(out.buffer, out.byteOffset, out.byteLength))
    },
  }
}

/**
 * BDSP 원본 폴더. 이 기계에 없으면 null.
 *
 * ⚠️ **번들을 커밋하지 않는다** (COPYRIGHT.md §5). BDSP spike는 이것이 있는
 * 기계에서만 진짜 번들을 열고, 없는 곳에서는 합성 fixture로만 돈다
 */
export function bdspDir(name: string): string | null {
  return rawSources.sourceDir(`bdsp.${name}`)
}

/**
 * 리포에 없는 **아무 로컬 파일**이 다 있을 때만 도는 `describe`.
 *
 * `withData`·`withModels`처럼 나무가 정해진 것이 아니라, BDSP 번들 하나나
 * 로컬 목차처럼 자리가 제각각인 것들을 위한 갈래다. `describe.skip`을 손으로
 * 적으면 `PT_REQUIRE_DATA`가 그 파일을 못 본다 — 그래서 여기로 모은다
 */
export function withLocal(label: string, ...files: readonly (string | null)[]): SuiteFn {
  const missing = files.filter((f) => f === null || !existsSync(f))
  if (missing.length === 0) return describe
  if (requireData()) {
    throw new Error(
      `${label}: 있어야 할 것이 없다\n`
      + `  ${files.map((f) => f ?? '(자리를 못 찾았다)').join('\n  ')}`,
    )
  }
  skipped.push(label)
  return describe.skip
}

/**
 * 그 지역판 롬들이 다 있을 때만 도는 `describe`.
 *
 * `raw/`는 리포에 안 들어가므로 없는 기계가 정상이다. `PT_REQUIRE_DATA=1`이면
 * 건너뛰는 대신 선다 — 개발 기계에서 지문 표가 실제와 갈리는 것을 놓치지 않는다
 */
export function withRom(...locales: readonly string[]): SuiteFn {
  const missing = locales.filter((l) => romPath(l) === null)
  if (missing.length === 0) return describe
  if (requireData()) {
    throw new Error(
      `롬이 없다 — ${missing.join(' · ')}\n`
      + '  파일 이름은 상관없다. 헤더의 게임 코드로 찾는다 (tools/raw/sources.cjs).\n'
      + '  다른 데 있으면 raw.sources.local.json에 적는다 (raw.sources.example.json 참고).',
    )
  }
  skipped.push(`rom: ${missing.join(' · ')}`)
  return describe.skip
}

/**
 * 시험용 Provider — 디스크에서 바로 읽는다 (IMPORT.md §7).
 *
 * ⚠️ **`fetch`를 흉내 내던 것을 대신한다.** 예전에는 시험마다 `globalThis.fetch`에
 * `{ ok, json }`만 든 가짜를 꽂아 두었는데, 로더가 `.text()`나 `.arrayBuffer()`를
 * 쓰기 시작하면 그 자리에서 죽는다 — 실제로 그렇게 26개가 한 번에 터졌다.
 * Provider 계약을 통째로 갈아 끼우면 무엇을 부르든 같은 파일이 나온다.
 *
 * 시험은 노드라 Blob URL이 없다. `objectUrl`은 `file://` 주소를 준다 — 실제로
 * 그림을 그리지는 않지만 "주소가 나온다"는 계약은 지킨다
 */
export function nodeAssetProvider(): AssetProvider {
  const PUBLIC = resolve(__dirname, '../../public')
  const at = (path: string): string => {
    if (!/^(data|models)\//.test(path)) {
      throw new Error(`논리 경로는 data/ 나 models/ 로 시작해야 한다: ${path}`)
    }
    return resolve(PUBLIC, path)
  }
  const read = (path: string): Buffer => {
    const file = at(path)
    if (!existsSync(file)) throw new AssetMissing(path, 'node')
    return readFileSync(file)
  }
  return {
    kind: 'node-disk',
    exists: (path) => Promise.resolve(existsSync(at(path))),
    bytes: (path) => {
      const b = read(path)
      return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
    },
    text: (path) => Promise.resolve(read(path).toString('utf8')),
    blob: (path) => Promise.resolve(new Blob([read(path) as unknown as BlobPart])),
    objectUrl: (path) => Promise.resolve(pathToFileURL(at(path)).href),
    releaseObjectUrl: () => { /* 파일 주소라 거둘 것이 없다 */ },
  }
}

/** 시험 파일 하나가 통째로 디스크에서 읽게 한다. `afterAll`에서 되돌린다 */
export function installNodeAssets(): () => void {
  setAssetProvider(nodeAssetProvider())
  return () => { setAssetProvider(null) }
}

/**
 * 우리가 구운 PNG를 편다 — 8비트 RGBA · 인터레이스 없음 (`tools/extract/png.js`).
 *
 * 시험이 **그림의 픽셀을 직접 봐야 하는 자리**가 여럿이다: 소품의 빠진 면이
 * 실제로 막혔는가, 빛기둥의 알파가 정말 절반도 안 차는가. 파일마다 따로 적으면
 * 필터 다섯 가지를 푸는 코드가 그만큼 갈라진다
 */
export function decodePng(
  file: string,
): { width: number, height: number, pixels: Uint8ClampedArray } {
  const buf = readFileSync(file)
  let at = 8, width = 0, height = 0, depth = 0, kind = 0
  const idat: Buffer[] = []
  while (at < buf.length) {
    const len = buf.readUInt32BE(at)
    const type = buf.toString('ascii', at + 4, at + 8)
    const body = buf.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4)
      depth = body[8]!; kind = body[9]!
    }
    if (type === 'IDAT') idat.push(body)
    at += 12 + len
  }
  if (depth !== 8 || kind !== 6) {
    throw new Error(`예상 밖 PNG: ${String(depth)}비트 · 형식 ${String(kind)}`)
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    const row = y * (stride + 1) + 1
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? out[y * stride + i - 4]! : 0
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0
      const c = i >= 4 && y > 0 ? out[(y - 1) * stride + i - 4]! : 0
      let v = raw[row + i]!
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + i] = v & 255
    }
  }
  return { width, height, pixels: out }
}
