// `src/`에 들어 있는 자료 표 (COPYRIGHT.md §2 · §6)
//
// ⚠️ **경로 규칙은 이것들을 하나도 못 봤다.** `src/**/*.json`은 소스 나무 안에
// 있으니 `public/data` 검사에 안 걸리고, 확장자도 `.json`이라 `dist` 규칙도
// 통과한다. 그런데 그 안에 든 것이 롬에서 읽은 값일 수 있다.
//
// 실제로 그랬다: 내용 기반 히스토리 감사(`auditHistory.mjs`)를 붙이고 나서야
// `src/data/textBanks.json`이 보였다 — 114KB, 뱅크 697개, 그 안에 **사용자
// 롬 뱅크 헤더 +2에서 읽은 u16 복호화 키**가 들어 있다. 경로로 찾는 검사는
// 이것을 영영 못 찾는다.
//
// 그래서 앱 셸과 같은 규율을 건다: **목록에 없으면 빌드를 세운다.** 무엇이
// 들었는지 적고, 배포물에 들어가는지 아닌지를 못 박고, 그 판정을 실제로 잰다.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')

/**
 * `src/` 아래 자료 표 전부. 하나라도 빠지면 `check.mjs`가 선다.
 *
 * `inBundle`은 **주장이 아니라 검사 대상이다** — `false`라고 적으면 빌드 후에
 * `marker`를 `dist/`에서 실제로 찾아보고, 있으면 위반이다
 */
export const TRACKED_TABLES = [
  {
    path: 'src/import/platinum/supported.json',
    holds: '지원 지역판 지문 — 헤더 필드 · 컨테이너 엔트리 수 · ARM9 표의 자리와 개수',
    origin: '개발 기계의 롬 셋에서 실측',
    inBundle: true,
    marker: 'POKEMON PL',
    note:
      'COPYRIGHT.md §2의 비표현적 호환성 메타데이터. 원본 바이트도, 문자열도, '
      + '재고도 없다 — 자리와 개수뿐이다.',
  },
]

/**
 * 지웠고 다시 오면 안 되는 파일.
 *
 * `src/data/textBanks.json`은 뱅크 724개의 **암호화 키(u16)** 와 로케일별 인덱스·
 * 엔트리 수를 들고 있었다 — 자리나 개수가 아니라 사용자 롬에서 읽은 값이다.
 * 지금은 `src/import/platinum/textBanks.ts`가 **이름 순서에서 자리를 계산**하고
 * 사용자의 롬으로 검산한다. 표는 `raw/work/`에서만 굽는다 (gitignore).
 */
export const BANNED_TABLES = [
  {
    path: 'src/data/textBanks.json',
    why: '뱅크 암호화 키(u16) 724개. 자리 계산이 대신한다 — import/platinum/textBanks.ts',
  },
]

/**
 * 내용으로 찾는다. **경로 규칙은 이름을 바꾸면 못 본다.**
 *
 * 이름 목록은 남아 있어도 된다 — 지운 것은 **값**이다. 그래서 이름이 아니라
 * 값이 붙어 있는 모양을 찾는다
 */
export const BANNED_CONTENT = [
  {
    what: '뱅크 암호화 키 표',
    why: '뱅크 헤더 +2의 u16을 그대로 옮긴 값 (COPYRIGHT.md §6)',
    signature: /"constant"\s*:\s*"TEXT_BANK_|"key"\s*:\s*\d+\s*,\s*"bank"\s*:/,
  },
]

/** 롬 컨테이너 그 자체. tracked 나무에 있으면 안 된다 */
const ROM_MAGIC = [
  { kind: 'NARC', sig: 'NARC' }, { kind: 'SDAT', sig: 'SDAT' },
  { kind: 'NCLR', sig: 'RLCN' }, { kind: 'NCGR', sig: 'RGCN' },
  { kind: 'NSBMD', sig: 'BMD0' }, { kind: 'NSBTX', sig: 'BTX0' },
  { kind: 'UnityFS', sig: 'UnityFS' },
]

/** 다시 생긴 금지 파일 */
export function bannedTablesPresent() {
  return BANNED_TABLES.filter((t) => existsSync(resolve(ROOT, t.path)))
}

/**
 * tracked 파일을 **내용으로** 훑는다.
 *
 * 경로도 확장자도 안 본다 — 머리 바이트가 롬 컨테이너인지, 본문이 지운 값의
 * 모양인지를 본다. 이름을 바꿔 옮겨 놓아도 여기서 걸린다
 */
export function trackedContentLeaks(trackedPaths) {
  const bad = []
  for (const rel of trackedPaths) {
    const at = resolve(ROOT, rel)
    if (!existsSync(at)) continue
    const size = statSync(at).size
    if (size === 0 || size > 8 * 1024 * 1024) continue
    const bytes = readFileSync(at)
    const head = bytes.subarray(0, 16).toString('latin1')
    for (const m of ROM_MAGIC) {
      if (head.startsWith(m.sig)) bad.push({ path: rel, what: `${m.kind} 컨테이너`, why: '롬 파일 그 자체' })
    }
    // 텍스트가 아니면 서명 검사는 건너뛴다 (NUL이 있으면 이진으로 본다)
    if (bytes.includes(0)) continue
    const text = bytes.toString('utf8')
    for (const c of BANNED_CONTENT) {
      if (c.signature.test(text)) bad.push({ path: rel, what: c.what, why: c.why })
    }
  }
  return bad
}

/** `src/` 아래 실제 `.json` 전부 (리포 상대 경로) */
export function jsonTablesIn(srcDir = resolve(ROOT, 'src')) {
  const out = []
  const walk = (at, rel) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { walk(resolve(at, e.name), childRel); continue }
      if (e.name.endsWith('.json')) out.push(`src/${childRel}`)
    }
  }
  walk(srcDir, '')
  return out.sort()
}

/** 목록에 없는 표. 있으면 빌드를 세운다 */
export function unlistedTables(srcDir) {
  const listed = new Set(TRACKED_TABLES.map((t) => t.path))
  return jsonTablesIn(srcDir).filter((p) => !listed.has(p))
}

/** 목록에는 있는데 파일이 없는 것. 이름이 갈리면 검사가 조용히 무의미해진다 */
export function missingTables() {
  return TRACKED_TABLES.filter((t) => !existsSync(resolve(ROOT, t.path))).map((t) => t.path)
}

/**
 * `inBundle: false`가 정말인가. **배포물을 실제로 뒤진다.**
 *
 * 트리 셰이킹은 import 하나만 늘어도 깨진다. "안 들어간다"를 가정으로 두면
 * 어느 날 조용히 들어간다
 */
export function tablesLeakedInto(distDir) {
  const bad = []
  if (!existsSync(distDir)) return bad
  const files = []
  const walk = (at, rel) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { walk(resolve(at, e.name), childRel); continue }
      if (/\.(js|css|html|json)$/.test(e.name)) files.push({ rel: childRel, at: resolve(at, e.name) })
    }
  }
  walk(distDir, '')
  for (const t of TRACKED_TABLES) {
    if (t.inBundle) continue
    for (const f of files) {
      if (statSync(f.at).size === 0) continue
      if (readFileSync(f.at, 'utf8').includes(t.marker)) {
        bad.push({ table: t.path, file: f.rel, marker: t.marker })
      }
    }
  }
  return bad
}
