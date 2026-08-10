// 공개 배포를 막고 있는 것 (DEPLOY.md §1)
//
// ⚠️ **목록을 손으로 관리하지 않는다.** 손으로 지우는 목록은 일이 끝나서가 아니라
// 잊혀서 비워진다. 여기 있는 것들은 각자 `resolved()`로 **직접 재고**, 재서
// 풀렸으면 스스로 빠진다.
//
// 위반(violation)과 다르다. 위반은 지금 고칠 수 있고 고쳐야 하는 것이라 빌드를
// 세운다. blocker는 아직 못 고친 것이라 빌드는 통과시키고 매번 숫자를 찍되,
// `--release`에서만 실패로 바꾼다. 개발이 멈추지 않으면서 공개는 막힌다.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { forbiddenIn } from './provenance.mjs'
import { brandRisks } from './shellArt.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const read = (rel) => (existsSync(resolve(ROOT, rel)) ? readFileSync(resolve(ROOT, rel), 'utf8') : null)

/** 각 항목: `{ id, why, where, resolved() → true면 풀린 것 }` */
export const BLOCKERS = [
  {
    id: 'bundle-data',
    why: '번들에 제3자 정적 게임 데이터가 있다',
    where: 'DEPLOY.md §4',
    resolved() {
      const at = read('.audit/bundle-provenance.json')
      // 보고서가 없으면 잰 적이 없는 것이다. 안 잰 것을 풀렸다고 하지 않는다
      if (!at) return { ok: false, detail: '출처 보고서가 없다 — pnpm build를 안 돌렸다' }
      const bad = forbiddenIn(JSON.parse(at))
      const bytes = bad.reduce((a, b) => a + b.bytes, 0)
      return bad.length === 0
        ? { ok: true }
        : { ok: false, detail: `${bad.length}개 모듈 · ${(bytes / 1048576).toFixed(1)}MB` }
    },
  },
  {
    id: 'brand-art',
    why: '앱 셸 그림이 공식처럼 보인다',
    where: 'COPYRIGHT.md §11',
    resolved() {
      // ⚠️ 바이트 검사가 절대 못 잡는 자리다 — 전부 우리가 그린 PNG라 출처
      // 검사도 매직바이트도 다 통과한다. 화면을 열어야 보인다 (tools/shot/title.mjs).
      // 대장(`shellArt.mjs`)에 적힌 사실로 판정하고, 그림을 바꾸면 스스로 풀린다
      const risks = brandRisks()
      return risks.length === 0
        ? { ok: true }
        : { ok: false, detail: risks.map((r) => `${r.path} (${r.why})`).join(' · ') }
    },
  },
  {
    id: 'csp-header',
    why: '실제 호스트의 CSP 응답 헤더를 잰 적이 없다',
    where: 'DEPLOY.md §3',
    resolved() {
      const at = read('.audit/deploy-verified.json')
      if (!at) return { ok: false, detail: 'pnpm verify:deploy <url>을 돌린 적이 없다' }
      const v = JSON.parse(at)
      return v.ok ? { ok: true } : { ok: false, detail: `${v.url}: ${v.problems?.length ?? '?'}건` }
    },
  },
  {
    id: 'bdsp-convert',
    why: 'BDSP 변환이 없어 3D 에셋을 만들 수 없다',
    where: 'IMPORT.md §12',
    resolved() {
      // spike가 무엇에 막혔는지 스스로 적어 둔다 (`unityfs.ts`의 SPIKE_BLOCKERS).
      // 목록이 비면 풀린 것이고, 그때까지는 컨테이너까지만 된 것이다.
      // ⚠️ 타입 선언(`{ what: string; … }`)이 아니라 **값**만 센다
      const src = read('src/import/bdsp/unityfs.ts')
      if (!src) return { ok: false, detail: 'spike조차 없다' }
      const list = src.slice(src.indexOf('export const SPIKE_BLOCKERS'))
      const n = (list.match(/^\s*what: /gm) ?? []).length
      return n === 0
        ? { ok: true }
        : { ok: false, detail: `spike가 막힌 자리 ${n}곳 — 컨테이너까지만 된다` }
    },
  },
  {
    id: 'install-groups',
    why: '필수 설치 그룹이 다 구현되지 않았다',
    where: 'IMPORT.md §8',
    resolved() {
      // ⚠️ `bdsp-convert`와 다른 것을 잰다. 그쪽은 BDSP spike가 어디서 막혔는지,
      // 이쪽은 **게임을 시작하는 데 필요한 12개 중 몇 개가 실제로 만들어지는가**다.
      // Platinum 쪽 7개가 안 옮겨진 것은 BDSP와 무관한 별개의 미완이고,
      // 그걸 BDSP blocker에 얹으면 BDSP를 푸는 날 조용히 함께 풀린다
      const required = read('src/import/install/required.ts')
      const convert = read('src/import/platinum/convert.ts')
      if (!required || !convert) return { ok: false, detail: '목록을 못 읽었다' }
      const names = (src, from) => {
        const at = src.indexOf(from)
        if (at < 0) return []
        const block = src.slice(at, src.indexOf(']', at))
        return [...block.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1])
      }
      const need = [
        ...names(required, 'REQUIRED_PLATINUM_GROUPS'),
        ...names(required, 'REQUIRED_BDSP_GROUPS'),
      ]
      // 변환기가 붙은 그룹 = `convert:`가 적힌 항목
      const made = [...convert.matchAll(/name:\s*'([a-zA-Z]+)',[^}]*?convert:\s*\w/gs)]
        .map((m) => m[1])
      const missing = need.filter((n) => !made.includes(n))
      return missing.length === 0
        ? { ok: true }
        : { ok: false, detail: `${String(made.length)}/${String(need.length)} — 남은 것: ${missing.join(' · ')}` }
    },
  },
  {
    id: 'browser-e2e',
    why: '브라우저 실측이 통과 상태가 아니다',
    where: 'DEPLOY.md §5',
    resolved() {
      // 안 돌린 것을 통과로 세지 않는다. BLOCKED 줄이 하나라도 있으면 아직이다 —
      // 그 줄들이 곧 "브라우저에서 아직 증명 못 한 것"의 목록이다
      const at = read('.audit/e2e.json')
      if (!at) return { ok: false, detail: 'pnpm e2e를 돌린 적이 없다' }
      const { results } = JSON.parse(at)
      const bad = results.filter((r) => r.status === 'FAIL')
      const blocked = results.filter((r) => r.status === 'BLOCKED')
      const notRun = results.filter((r) => r.status === 'NOT RUN')
      if (bad.length) return { ok: false, detail: `FAIL ${String(bad.length)}건: ${bad.map((r) => r.id).join(' · ')}` }
      if (notRun.length) return { ok: false, detail: `NOT RUN ${String(notRun.length)}건 — 전부 돌린 결과가 아니다` }
      if (blocked.length) return { ok: false, detail: `BLOCKED ${String(blocked.length)}건: ${blocked.map((r) => `${r.id} ${r.what}`).join(' · ')}` }
      return { ok: true }
    },
  },
  {
    id: 'release-build',
    why: '이 배포물이 어느 커밋에서 나왔는지 말할 수 없다',
    where: 'state/save/contract.ts',
    resolved() {
      // 빌드가 스스로 적어 둔 것을 읽는다. 여기서 git을 다시 묻지 않는 이유는
      // **빌드 시점과 검사 시점 사이에 나무가 바뀔 수 있어서다** — 재야 하는
      // 것은 지금 나무가 아니라 `dist/`를 만든 그 나무다
      const at = read('.audit/build.json')
      if (!at) return { ok: false, detail: '빌드 도장이 없다 — pnpm build를 안 돌렸다' }
      const { version, buildId } = JSON.parse(at)
      if (buildId.endsWith('-dirty')) {
        return { ok: false, detail: `${version}+${buildId} — 커밋 안 한 변경이 섞였다. 재현이 안 된다` }
      }
      if (buildId === 'dev' || buildId === 'unknown') {
        return { ok: false, detail: `${version}+${buildId} — 커밋 해시가 안 박혔다` }
      }
      return { ok: true }
    },
  },
  {
    id: 'git-history',
    why: 'Git 히스토리에 원본 유래 산출물이 남아 있다',
    where: 'COPYRIGHT.md §9',
    resolved() {
      let out
      try {
        // ⚠️ `auditHistory.mjs`의 `TARGETS`와 같은 목록이어야 한다. 갈리면
        // 감사가 잡은 것을 blocker가 못 보고 조용히 풀린다
        out = execFileSync('git', ['log', '--all', '--oneline', '--',
          'public/data', 'public/models', 'assets-manifest.json', 'src/data/textBanks.json',
          'raw', 'dist', 'dist-assets'],
        { cwd: ROOT, encoding: 'utf8' })
      } catch {
        return { ok: false, detail: 'git을 못 읽었다' }
      }
      const n = out.split('\n').filter(Boolean).length
      return n === 0 ? { ok: true } : { ok: false, detail: `커밋 ${n}개가 그 경로를 건드린다` }
    },
  },
]

/** 아직 안 풀린 것만 */
export function openBlockers() {
  return BLOCKERS
    .map((b) => ({ ...b, state: b.resolved() }))
    .filter((b) => !b.state.ok)
}
