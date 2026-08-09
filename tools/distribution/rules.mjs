// 공개 배포 경계 — 무엇이 산출물에 있어도 되는가 (COPYRIGHT.md §6 · PLAN §14.1)
//
// ⚠️ **`.gitignore`는 이걸 못 막는다.** Vite는 Git 추적 여부와 상관없이
// `public/`을 통째로 `dist/`로 복사한다. 실제로 그렇게 나가 있었다 —
// `dist/data` 64MB · `dist/models` 581MB. 리포에는 한 바이트도 없는데 배포물에는
// 645MB가 있었다.
//
// 그래서 규칙을 **파일 목록으로** 잰다. "안 넣었을 것이다"가 아니라 "빌드가
// 실제로 뱉은 것을 다시 훑는다". 깨끗한 clone에서도 같은 검사가 돌아야 하므로
// 대상이 없으면 통과지 실패가 아니다.
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

/** 산출물 뿌리에 이 이름의 나무가 있으면 원본 유래다 */
export const FORBIDDEN_TREES = ['data', 'models', 'textures', 'audio', 'pack', 'packs']

/**
 * 경로 어디에 있어도 안 되는 이름.
 *
 * 원천 컨테이너·중간물·개발 보관물의 이름이다. `dist/x/raw/y.js`처럼 한 칸만
 * 들어가도 걸린다
 */
export const FORBIDDEN_SEGMENTS = [
  'raw', 'romfs', 'assetassistant', 'streamingassets', 'decomp', 'decomp-derived',
  'extracted', 'roms', 'nca', 'bdsp', 'dev-assets',
]

/**
 * 확장자.
 *
 * 원본(`.nds`·`.sdat`), 컨테이너(`.nsp`·`.nca`·`.xci`·`.narc`), 키(`.keys`),
 * Unity 번들(`.bundle`·`.assets`·`.resS`), 그리고 **변환 결과**(`.glb`·`.ktx2`·
 * `.pack`·`.bin`). 마지막 묶음이 핵심이다 — 원본을 안 넣어도 원본에서 나온
 * 것을 넣으면 같은 것을 배포하는 것이다
 */
export const FORBIDDEN_EXT = [
  '.nds', '.srl', '.rom', '.sdat', '.narc', '.nsbmd', '.nsbtx', '.btx0',
  '.nsp', '.nca', '.xci', '.keys',
  '.bundle', '.assets', '.ress', '.unity3d',
  '.glb', '.gltf', '.ktx2', '.basis', '.pack', '.bin', '.arc',
]

/**
 * 시험 도구가 배포물에 실려 나가면 안 된다.
 *
 * ⚠️ **`.testkit.`으로는 못 잡는다.** 롤업이 청크 이름에 해시를 `-`로 붙이므로
 * 실제로 나오는 이름은 `romData.testkit-abc123.js`다. 점 대신 **점이나 붙임표**를
 * 받는다
 */
export const FIXTURE_MARKS = [
  /\.testkit[.-]/, /\.test[.-]/, /\.spec[.-]/, /__fixtures__/, /(^|\/)fixtures\//,
]

/**
 * 에셋 저장소로 알려진 호스트 모양.
 *
 * ⚠️ **"바깥 주소가 하나라도 있으면 실패"로는 못 잰다.** 처음에 그렇게 짰더니
 * 위반 10,988건이 나왔는데 그중 거의 전부가 라이브러리 오류 문구의 문서
 * 링크였다(`react.dev` · `github.com` · `jcgt.org` · `www.shadertoy.com`).
 * 그런 글자는 네트워크를 안 탄다.
 *
 * 잡아야 하는 것은 **에셋을 실제로 받아 오는 뿌리**다. 둘로 잰다 —
 * 주소 뒤에 곧바로 `data/`·`models/`가 붙었거나, 호스트가 오브젝트 스토리지
 * 모양이거나 (COPYRIGHT.md §6 — `VITE_ASSET_BASE`와 R2 계획은 폐기됐다)
 */
export const ASSET_HOST_SHAPES = [
  /r2\.dev$/, /\.r2\.cloudflarestorage\.com$/, /amazonaws\.com$/, /backblazeb2\.com$/,
  /\.b-cdn\.net$/, /storage\.googleapis\.com$/, /^cdn[.-]/, /\.cdn\./,
  /jsdelivr\.net$/, /unpkg\.com$/,
]

const lower = (s) => s.toLowerCase()

/** 이 한 경로가 어긴 규칙들. 뿌리 기준 상대 경로(POSIX)를 받는다 */
export function pathViolations(rel) {
  const p = lower(rel)
  const parts = p.split('/')
  const out = []

  const head = parts[0]
  if (parts.length > 1 && FORBIDDEN_TREES.includes(head)) {
    out.push(`원본 유래 나무 '${head}/'`)
  }
  for (const seg of parts.slice(0, -1)) {
    if (FORBIDDEN_SEGMENTS.includes(seg)) out.push(`금지된 폴더 이름 '${seg}'`)
  }
  const dot = p.lastIndexOf('.')
  const ext = dot < 0 ? '' : p.slice(dot)
  if (FORBIDDEN_EXT.includes(ext)) out.push(`금지된 확장자 '${ext}'`)

  const marked = FIXTURE_MARKS.find((re) => re.test(p))
  if (marked) out.push(`시험 자산 ${String(marked)}`)

  return out
}

/** 나무 하나를 전부 훑는다. 없으면 빈 목록 — 깨끗한 clone에서도 돌아야 한다 */
export function listTree(root) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const e of entries) {
    const child = join(root, e.name)
    if (e.isDirectory()) {
      for (const rel of listTree(child)) out.push(`${e.name}/${rel}`)
      continue
    }
    out.push(e.name)
  }
  return out
}

/** 글 자산에 남은 **에셋** 오리진. 문서 링크는 오리진이 아니다 */
export function originsIn(text) {
  const out = new Set()
  for (const m of text.matchAll(/https?:\/\/([a-zA-Z0-9._-]+)(\/[a-zA-Z0-9._/-]*)?/g)) {
    const host = lower(m[1])
    const path = m[2] ?? ''
    const rooted = /^\/(data|models|textures|audio|pack)s?\//.test(path)
    if (rooted || ASSET_HOST_SHAPES.some((re) => re.test(host))) out.add(m[1])
  }
  return [...out]
}

const TEXTUAL = ['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.webmanifest', '.map']

/**
 * 산출물 나무 하나를 검사한다.
 *
 * 경로 규칙과 오리진 규칙을 함께 본다. `bytes`는 무엇이 얼마나 나갔는지를
 * 보고에 적기 위한 것이다 — 645MB가 나가고 있었다는 사실은 개수가 아니라
 * 용량으로만 드러난다
 */
export function scanTree(root, { label = root } = {}) {
  const files = listTree(root)
  const violations = []
  let bytes = 0

  for (const rel of files) {
    const abs = join(root, ...rel.split('/'))
    let size = 0
    try { size = statSync(abs).size } catch { /* 훑는 중에 사라졌으면 없는 것이다 */ }
    bytes += size

    for (const why of pathViolations(rel)) {
      violations.push({ file: `${label}/${rel}`, why, bytes: size })
    }

    const dot = rel.lastIndexOf('.')
    if (dot >= 0 && TEXTUAL.includes(lower(rel.slice(dot)))) {
      let text = ''
      try { text = readFileSync(abs, 'utf8') } catch { continue }
      for (const host of originsIn(text)) {
        violations.push({ file: `${label}/${rel}`, why: `바깥 오리진 '${host}'`, bytes: size })
      }
    }
  }

  return { root, label, files, bytes, violations }
}

/** OS 경로를 POSIX로. Windows에서 규칙이 조용히 안 걸리는 것을 막는다 */
export function toPosix(p) {
  return p.split(sep).join('/')
}
