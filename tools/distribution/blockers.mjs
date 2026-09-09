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
import { artifactDigest, buildStamp, checkEvidence } from './evidence.mjs'
import { forbiddenIn } from './provenance.mjs'
import { ACCEPTED_BRAND_RISK, brandRisks } from './shellArt.mjs'

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
      // 대장(`shellArt.mjs`)에 적힌 사실로 판정하고, 그림을 바꾸면 목록이 빈다
      const risks = brandRisks()
      if (risks.length === 0) return { ok: true }
      // ⚠️ 사실은 그대로 있는데 **만든 사람이 알고 감수하기로 했다.** 바뀌는 것은
      // 판정뿐이고 무엇을 안고 가는지는 `acceptedRisks()`가 공개 판정마다 찍는다 —
      // 대장을 고쳐서 통과시키는 것과는 다른 자리다 (shellArt.mjs 주석)
      if (ACCEPTED_BRAND_RISK !== null) return { ok: true }
      return { ok: false, detail: risks.map((r) => `${r.path} (${r.why})`).join(' · ') }
    },
  },
  {
    id: 'csp-header',
    why: '실제 호스트의 CSP 응답 헤더를 잰 적이 없다',
    where: 'DEPLOY.md §3',
    resolved() {
      const at = read('.audit/deploy-verified.json')
      if (!at) return { ok: false, detail: 'pnpm verify:deploy <url>을 돌린 적이 없다' }
      let v
      try {
        v = JSON.parse(at)
      } catch {
        return { ok: false, detail: 'deploy-verified.json이 깨졌다 — 다시 재야 한다' }
      }
      if (!v.ok) return { ok: false, detail: `${v.url}: ${v.problems?.length ?? '?'}건` }
      // ⚠️ **잰 빌드에만 붙는 도장이다.** e2e ⑯은 이 값을 지금 빌드와 맞대는데
      // 여기서는 안 맞댔다 — 그래서 `58c9284`를 잰 도장이 `6c5e534` 배포물의
      // 통과로 읽혔다. 껍데기가 통과했는가가 아니라 **어느 배포물을 쟀는가**로
      // 판정한다 (기획서 §2.4)
      if (!v.browserChecked) {
        return { ok: false, detail: `${v.url}: 브라우저를 못 띄워 약한 갈래로 갔다 — 외부 요청을 실제로 못 셌다` }
      }
      const now = buildStamp()?.buildId ?? null
      if (now === null) return { ok: false, detail: '빌드 도장이 없다 — 어느 배포물을 쟀는지 견줄 수 없다' }
      if (typeof v.buildId !== 'string' || v.buildId === '') {
        return { ok: false, detail: `${v.url}는 통과했지만 어느 빌드를 잰 것인지 모른다 — 다시 재야 한다` }
      }
      if (v.buildId !== now) {
        return { ok: false, detail: `${v.url}는 ${v.buildId}를 쟀다. 지금 빌드는 ${now}다 — 다시 재야 한다` }
      }
      return { ok: true }
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
      // ⚠️ **표가 둘이다.** Platinum 롬 쪽과 BDSP 폴더 쪽이 각자 파일을 갖는다
      // (`src/import/groups.ts`가 둘을 합친다). 한쪽만 읽으면 BDSP 그룹 셋이
      // 영영 "안 만들어진 것"으로 남는다
      const convert = [
        read('src/import/platinum/convert.ts'),
        read('src/import/bdsp/convert.ts'),
      ].filter(Boolean).join('\n')
      if (!required || convert === '') return { ok: false, detail: '목록을 못 읽었다' }
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
      // 변환기가 붙은 그룹 = 그 항목 안에 `convert:`가 적힌 것.
      //
      // ⚠️ **`[^}]*?`로 항목 끝을 잡으면 안 된다.** 한때 그렇게 적었는데, 산출물
      // 이름에 `data/chunks/{번호}.bin`처럼 중괄호가 들어가는 순간 거기서 끊겨
      // 구현된 그룹이 **안 구현된 것으로 보였다**. 검사가 헐거워지는 방향은
      // 아니었지만(있는 것을 없다고 셌다) 어느 쪽이든 틀린 수를 보고한 것이다.
      // 항목 경계는 다음 `name:`으로 잡는다
      const at = [...convert.matchAll(/name:\s*'([a-zA-Z]+)'/g)]
      const made = at
        .filter((m, i) => {
          const from = m.index
          const to = i + 1 < at.length ? at[i + 1].index : convert.length
          return /convert:\s*\w/.test(convert.slice(from, to))
        })
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
      // ⚠️ **결과 파일이 있다는 것과 「이 dist를 다 쟀다」는 것은 다르다.**
      // 한때 여기서 FAIL·NOT RUN·BLOCKED만 셌는데, 그 판정은 빈 배열도 모르는
      // status도 스물아홉 중 셋만 적은 파일도 **두 달 전 dist를 잰 결과**도
      // 전부 초록으로 읽었다. 다섯 가지를 옛 판정과 나란히 재현한 것이
      // `evidence.test.mjs`에 있다 — 고친 사실보다 **무엇이 뚫려 있었는지**가 남는다.
      //
      // 이제는 봉투(`evidence.mjs`)가 무엇을·언제·어디서·어디까지 쟀는지까지 본다
      return checkEvidence('installed-e2e')
    },
  },
  {
    id: 'story-sweep',
    why: '처음부터 엔딩까지가 통과 상태가 아니다',
    where: 'tools/e2e/story.mjs',
    resolved() {
      // ⚠️ **`browser-e2e`가 이걸 안 잰다.** 그쪽은 설치·저장·헤더처럼 껍데기를
      // 재고, 이야기가 실제로 **진행되는가**는 `pnpm story`만 잰다. 그래서 한때
      // story가 4개 떨어진 채로 release:check가 초록일 수 있었다 — 게임이 엔딩까지
      // 안 가는데 "공개 가능"이라고 적히는 자리였다.
      //
      // ⚠️ **묶이는 지문이 `browser-e2e`와 다르다.** 훑기는 개발 서버에서 도므로
      // (확인 지점이 `import.meta.env.DEV` 뒤라 배포 빌드에는 조각이 아예 없다)
      // dist가 아니라 **게임 소스**에 묶인다. `--only`·`--from`·`--act`로 일부만
      // 돌린 것은 봉투의 expectedCases와 executedCases가 갈려서 걸린다 —
      // 깃발을 하나씩 세어 막던 것을 「무엇을 재려 했는가」 하나로 합친다
      return checkEvidence('story')
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
      const stamp = JSON.parse(at)
      const { version, buildId } = stamp
      if (buildId.endsWith('-dirty')) {
        return { ok: false, detail: `${version}+${buildId} — 커밋 안 한 변경이 섞였다. 재현이 안 된다` }
      }
      if (buildId === 'dev' || buildId === 'unknown') {
        return { ok: false, detail: `${version}+${buildId} — 커밋 해시가 안 박혔다` }
      }
      // ⚠️ **무엇으로 만든 dist인지, 그리고 그 dist가 아직 그대로인지** (기획서 §6.1).
      // 커밋 해시는 「어느 커밋 곁에서 구웠나」일 뿐이라 구운 뒤에 `dist/`를
      // 손댄 것을 못 본다 — 그러면 브라우저 실측이 잰 배포물과 올라가는 것이
      // 다른 물건일 수 있다. 지문은 `check.mjs`가 빌드 직후에 한 번 적는다
      if (typeof stamp.sourceDigest !== 'string' || stamp.sourceDigest === '') {
        return { ok: false, detail: `${version}+${buildId} — 무엇으로 구웠는지가 도장에 없다. 다시 구워야 한다` }
      }
      const now = artifactDigest()
      if (now === null) return { ok: false, detail: 'dist/가 없다 — 배포 후보가 없다' }
      if (stamp.artifactDigest !== now) {
        return {
          ok: false,
          detail: `구울 때 ${String(stamp.artifactDigest).slice(0, 12)}이던 dist가 지금 ${now.slice(0, 12)}다`
            + ' — 구운 뒤에 배포물이 바뀌었다',
        }
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
  {
    id: 'gpu-loss',
    why: '장치를 잃었을 때 게임이 사람 손에 남는지 잰 적이 없다',
    where: 'tools/e2e/gpuLoss.mjs',
    resolved() {
      // ⚠️ **`pnpm gpu:loss`의 종료 코드로 세면 안 된다** (기획서 §3.3). 그것은
      // 오래 FAIL만 보고 1을 냈다 — BLOCKED만 남은 판, 그러니까 **못 잰 판**이
      // 종료 0으로 나가서 부르는 쪽에서는 합격과 구별이 안 됐다. 봉투는
      // BLOCKED·NOT RUN도 통과로 안 센다 (`evidence.mjs`).
      //
      // ⚠️ **여기 있는 것은 WebGL2 길의 손실뿐이다.** WebGPU는 브라우저가
      // 손잡이를 안 내준다(three가 `reason: 'destroyed'`를 일부러 무시한다).
      // G-G의 나머지 — 배틀 중·스크립트 중·설치본 장시간 — 는 아직 이 묶음
      // 밖이고, 그것을 이 blocker가 풀렸다고 해서 잰 것으로 세면 안 된다
      return checkEvidence('gpu-loss')
    },
  },
  {
    id: 'render-first',
    why: '첫 3D 화면이 창을 흔들기 전까지 안 나온다',
    where: 'tools/e2e/firstFrame.mjs',
    resolved() {
      // ⚠️ **`pnpm journey`가 통과해도 이 줄은 안 풀린다.** 대표 구간은 걸어서
      // 이어지는가를 보고, 여기서 보는 것은 **사람이 처음 보는 화면이 나오는가**다.
      // 검사가 제 손으로 창이나 부모 CSS를 흔들면 그 판은 스스로 결함을 고치므로
      // (실측: `pnpm shot`이 오래 그러고 있었다), 이 하네스는 마지막 크기로
      // **처음부터** 시작하고 재는 동안 아무것도 안 흔든다 (REPAIR §41).
      //
      // ⚠️ **정본 목록에 ①②③이 들어 있다.** 그것들은 게임이 아니라 **자**를
      // 재는 줄이다 — 배경만 나온 컷을 거절하는가, 정지 프레임을 거절하는가,
      // 찍는 동안 대상을 안 바꿨는가. 없으면 ④⑤의 통과가
      // 「아무것도 안 잡는 자가 통과했다」와 구별이 안 된다
      return checkEvidence('render-first')
    },
  },
  {
    id: 'journey',
    why: '새 게임에서 첫 배지까지를 정상 입력으로 끝까지 걸어 본 적이 없다',
    where: 'tools/e2e/journey.mjs',
    resolved() {
      // ⚠️ **`pnpm story`가 통과한 것과 다른 것을 잰다.** 훑기는 확인 지점
      // 여든여덟 자리로 **뛰어들어** 그 장면이 서는지를 본다 — 장면이 다 서도
      // 그 사이가 안 이어질 수 있다. 여기서 재는 것은 방향키·A·B만으로
      // **걸어서 이어지는가**고, 그래서 확인 지점을 한 번도 안 주입한다
      // (기획서 §1.4 · §7).
      //
      // ⚠️ **열두 자리를 다 지나도 그것만으로는 통과가 아니다.** 15(찍은 화면이
      // 실제로 그려져 있다)와 16(콘솔이 조용하다)이 같은 목록에 있다 — 검은
      // 화면으로 완주한 판을 완주로 세지 않기 위해서다
      return checkEvidence('journey')
    },
  },
]

/** 아직 안 풀린 것만 */
export function openBlockers() {
  return BLOCKERS
    .map((b) => ({ ...b, state: b.resolved() }))
    .filter((b) => !b.state.ok)
}

/**
 * 잰 사실은 그대로인데 **사람이 감수하기로 한 것.**
 *
 * ⚠️ **blocker에서 빠져도 여기서는 안 빠진다.** 감수한 위험이 목록에서 조용히
 * 사라지면 다음 사람은 그것이 없어진 줄 안다. 공개 판정마다 무엇을 안고 가는지
 * 다시 읽게 한다 — 잊힌 결정은 결정이 아니다.
 *
 * 그림을 실제로 바꾸면 `brandRisks()`가 비고, 그때는 감수할 것도 없어 빈 배열이다
 */
export function acceptedRisks() {
  if (ACCEPTED_BRAND_RISK === null) return []
  const risks = brandRisks()
  if (risks.length === 0) return []
  return [{
    id: 'brand-art',
    where: 'COPYRIGHT.md §11',
    what: risks.map((r) => `${r.path} (${r.why})`).join(' · '),
    ...ACCEPTED_BRAND_RISK,
  }]
}
