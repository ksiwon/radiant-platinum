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
  {
    path: 'src/data/textBanks.json',
    holds: '대사 뱅크 697개의 이름 · 상수 · 복호화 키(u16) · 지역별 인덱스 · 엔트리 수',
    origin: '이름과 상수는 디컴프, 키와 엔트리 수는 롬 뱅크 헤더',
    inBundle: false,
    marker: 'moves_used_in_battle',
    note:
      '⚠️ **미해결.** `key`는 사용자 롬 뱅크 헤더 +2의 u16을 그대로 옮긴 값이다 '
      + '(697개). 자리나 개수가 아니라 롬에서 읽은 값이라 §2의 "비표현적 '
      + '메타데이터"에 그대로 들지 않는다. 지금 상태: 배포물에는 안 들어간다(측정), '
      + '리포와 히스토리에는 있다. 지우려면 `tools/extract/textbanks.js`가 (키, '
      + '엔트리 수) 쌍으로 ko·ja 인덱스를 확정하는 근거와 `textBanks.test.ts`의 '
      + '유일성 검사를 대신할 것이 있어야 한다 — 판단이 필요한 자리라 '
      + '혼자 지우지 않았다.',
  },
]

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
