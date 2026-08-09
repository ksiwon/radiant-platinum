// 번들 출처 (COPYRIGHT.md §6 · DEPLOY.md §4)
//
// `public/`에서 **복사**되는 것은 `appShell.mjs`가 파일 단위로 심사한다. 그런데
// 배포물의 대부분은 복사가 아니라 `src/`와 `node_modules/`에서 **컴파일**되어
// 나온다. 경로·확장자 검사는 거기를 못 본다 — `dist/assets/battle-sim-*.js`는
// 이름도 `.js`고 자리도 `assets/`라 모든 규칙을 통과한다.
//
// 그 안에 무엇이 들어 있었는지가 이 파일이 재는 것이다. 실측: 그 청크는
// 6,547,238바이트고 그중 대부분이 `@pkmn/sim`의 종족·기술·특성·도구·습득기술·
// 세대별 규칙 표다. MIT 라이선스 패키지라는 사실과, 그 패키지에 담긴 게임
// 데이터를 우리가 배포해도 되는지는 **다른 질문**이다.
//
// ⚠️ 여기서 나온 보고서는 `dist/`에 안 넣는다. 배포물이 아니라 감사 기록이다.

/** rollup이 붙이는 가상 모듈. 파일이 아니다 */
const VIRTUAL = /^\0/

/**
 * 배포 번들에 들어가면 세우는 모듈.
 *
 * `@pkmn/sim`은 엔진 코드(`build/esm/sim`, `lib`, `config`)와 데이터
 * (`build/esm/data`)가 한 패키지에 있다. 엔진만 쓰고 데이터는 사용자의 롬에서
 * 온 것으로 채우는 것이 §2.9가 정한 방향이라, **데이터 쪽만** 막는다
 */
export const FORBIDDEN_DATA = [
  {
    why: '@pkmn/sim 정적 게임 데이터',
    re: /[/\\]@pkmn[/\\]sim[/\\]build[/\\](?:esm|cjs)[/\\]data[/\\]/,
  },
  {
    why: '@pkmn/data 정적 게임 데이터',
    re: /[/\\]@pkmn[/\\]data[/\\]build[/\\](?:esm|cjs)[/\\]data[/\\]/,
  },
]

/** 이 모듈은 무엇인가 */
export function classify(id) {
  if (VIRTUAL.test(id)) return { kind: '가상', pkg: null }
  const norm = id.replace(/\\/g, '/')
  if (!norm.includes('node_modules')) return { kind: '앱', pkg: null }
  // `node_modules/.pnpm/<이름>@<판>/node_modules/<실제 이름>/…`
  const after = norm.slice(norm.lastIndexOf('node_modules/') + 'node_modules/'.length)
  const parts = after.split('/')
  const pkg = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
  const bad = FORBIDDEN_DATA.find((f) => f.re.test(norm))
  return { kind: bad ? '의존성-데이터' : '의존성-코드', pkg, why: bad?.why }
}

/**
 * rollup 번들에서 청크별 모듈 출처를 뽑는다.
 *
 * `renderedLength`를 쓴다 — 원본 파일 크기가 아니라 **이 청크에 실제로 실린
 * 바이트**다. tree-shaking이 얼마나 걷어냈는지가 그 차이라, 원본 크기로 재면
 * "6.5MB 중 5MB가 learnsets"처럼 틀린 결론이 나온다
 */
export function collectProvenance(bundle) {
  const chunks = []
  for (const [file, out] of Object.entries(bundle)) {
    if (out.type !== 'chunk') continue
    const mods = Object.entries(out.modules ?? {}).map(([id, m]) => {
      const c = classify(id)
      return { id: id.replace(/\\/g, '/'), bytes: m.renderedLength ?? 0, ...c }
    })
    const byKind = {}
    const byPkg = {}
    for (const m of mods) {
      byKind[m.kind] = (byKind[m.kind] ?? 0) + m.bytes
      if (m.pkg) byPkg[m.pkg] = (byPkg[m.pkg] ?? 0) + m.bytes
    }
    chunks.push({
      file,
      bytes: out.code?.length ?? 0,
      modules: mods.length,
      byKind,
      byPkg,
      forbidden: mods.filter((m) => m.kind === '의존성-데이터')
        .sort((a, b) => b.bytes - a.bytes)
        .map((m) => ({ id: m.id, bytes: m.bytes, why: m.why })),
    })
  }
  chunks.sort((a, b) => b.bytes - a.bytes)
  return { version: 1, chunks }
}

/** 보고서에서 금지 모듈만 골라 한 줄씩 */
export function forbiddenIn(report) {
  return report.chunks.flatMap((c) => c.forbidden.map((f) => ({ chunk: c.file, ...f })))
}
