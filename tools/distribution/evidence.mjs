// 릴리스 증거의 봉투 (PLATINUM_3D_COMPLETION_PLAN §6.1 · PT-01)
//
// ⚠️ **결과 파일이 있다는 것과 「이 배포물을 다 쟀다」는 것은 다르다.**
// `blockers.mjs`는 오래 `.audit/e2e.json`을 열어 FAIL·BLOCKED·NOT RUN이 하나도
// 없으면 통과로 셌다. 그 판정은 다음을 **전부 통과로 읽는다** — 재현은
// `evidence.test.mjs`에 있다:
//
//   · `{"results":[]}`                   빈 배열에는 FAIL이 없다
//   · `{"results":[{"status":"WIP"}]}`   모르는 status는 세 갈래 중 어느 것도 아니다
//   · 스물아홉 중 셋만 돌리고 그 셋만 적은 파일
//   · **두 달 전 다른 dist**를 잰 결과 (파일은 소스를 고쳐도 그대로 살아 있다)
//   · `{}`                               `results`가 없으면 `.filter`에서 터진다.
//                                        실패가 아니라 crash라 판정 자체가 안 난다
//
// 여기서 정하는 것은 「무엇이어야 증거인가」의 최소 계약이다. 봉투에
// **무엇을 쟀는지**(artifactDigest·sourceDigest·buildId), **언제 어디서**
// (testedAt·environment·실제 backend), **무엇을 재려 했고 실제로 뭘 쟀는지**
// (expectedCases·executedCases)를 같이 넣는다. 하나라도 빠지면 통과가 아니다.
//
// ⚠️ **봉투가 제 시험 목록을 스스로 정하지 못한다** (기획서 §3.2). 판 1에서는
// expected·executed·results를 전부 한 건짜리로 맞춘 합성 봉투가 통과했다 —
// 셋이 서로 어긋나지 않는지만 봤기 때문이다. 판 2부터 **정본 목록(roster)을
// 판정기가 소유하고** 봉투의 expected는 그것과 글자 하나까지 같아야 한다.
// 하네스가 옳은 목록을 넣는 것과 판정기가 줄어든 목록을 거부하는 것은 다른
// 보장이다.
//
// ⚠️ **HEAD 문자열로 판정하지 않는다.** 문서만 고친 커밋은 빌드를 다시 굽지
// 않는 것이 정책이라(DEPLOY.md), 커밋 해시가 다르다는 이유로 증거를 버리면
// 문서를 고칠 때마다 브라우저 검사를 35분씩 다시 돌게 된다. 재는 것은 커밋이
// 아니라 **게임 산출물**이다 — `docs/`는 두 지문 어느 쪽에도 안 들어간다.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { platform, release } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')

/**
 * 봉투 판. 계약이 바뀌면 올린다 — 옛 판 봉투는 「다시 돌려야 하는 것」이다.
 *
 * 1 → 2: 정본 목록·검사 계약 판·하네스 지문·시작 지문이 들어왔다 (PT-01)
 */
export const EVIDENCE_SCHEMA = 2

/**
 * 결과 줄이 가질 수 있는 status.
 *
 * ⚠️ **이 밖의 값은 통과가 아니다.** 「FAIL이 아니면 통과」로 세면 오타 하나,
 * 새로 만든 status 하나가 조용히 초록이 된다
 */
export const STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'NOT RUN']

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

/** `git ls-files -z`가 이름 사이에 끼우는 글자. 소스에 날바이트를 두지 않는다 */
const NUL = String.fromCharCode(0)
/** 줄바꿈 한 글자. 위와 같은 까닭으로 이름을 준다 */
const NL = String.fromCharCode(10)

/**
 * 소스 지문에 드는 것.
 *
 * ⚠️ **`docs/`도 `tools/`도 안 든다.** 문서는 게임을 안 바꾸고(위 주석),
 * 도구는 재는 쪽이라 여기 넣으면 하네스를 한 줄 고칠 때마다 증거가 죽는다 —
 * 도구 변경은 무시하는 것이 아니라 **따로**(`harnessDigest`) 센다.
 * `raw/`·`saves/`·`shots/`·`.audit/`는 추적 대상이 아니거나 산출물이다
 */
const SOURCE_ROOTS = [
  'src', 'public', 'index.html', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'tsconfig.json',
]

/**
 * 이 아래 것은 **어떤 일이 있어도 소스가 아니다.**
 *
 * ⚠️ 원본 유래 추출물이다. `.gitignore`가 이미 막지만, 무시 규칙 한 줄이
 * 느슨해지는 날 그것이 소스 목록에 섞여 들어온다 — 그러면 지문이 기계마다
 * 달라지고, 무엇보다 **추출물 경로 목록이 증거 파일에 실린다.** 걸리면 조용히
 * 걸러 내는 것이 아니라 지문 자체를 못 내게 한다 (COPYRIGHT.md §5)
 */
const NEVER_SOURCE = ['public/data/', 'public/models/']

/**
 * 설치본 실측이 다 돌면 내야 할 시험 스물아홉.
 *
 * ⚠️ **하네스가 아니라 여기 있다.** `run.mjs` 안에 두면 「시험을 줄이면서 목록도
 * 같이 줄이는」 한 번의 편집이 통과를 만든다. 여기 있으면 그 편집이 `harness`
 * 지문까지 흔들어서 옛 결과가 통째로 무효가 된다
 */
const E2E_CASES = Array.from({ length: 29 }, (_, i) => String(i + 1).padStart(2, '0'))

/**
 * 장치 손실 복구가 다 돌면 내야 할 아홉.
 *
 * `99`는 **검사가 끝까지 갔는가**다 — 도중에 터지면 그 줄이 FAIL로 남아야지,
 * 「돌린 것이 좀 적다」로만 보이면 안 된다
 */
const GPU_LOSS_CASES = ['01', '02', '03', '04', '05', '06', '07', '08', '99']

/**
 * 첫 3D 화면이 다 돌면 내야 할 다섯 (`tools/e2e/firstFrame.mjs`).
 *
 * ⚠️ **①이 목록에 있는 것이 핵심이다.** 그것은 게임이 아니라 **자를 재는 줄**이다 —
 * 같은 판에서 캔버스만 뺀 컷(= 페이지 배경)이 「그려졌다」로 안 읽히는지, 움직임
 * 없는 두 컷이 「갱신됐다」로 안 읽히는지를 본다. ③은 **검사가 제 손으로 크기를
 * 흔들지 않았는지**다. 이 셋이 없으면 ④⑤의 통과는 「아무것도 안 잡는 자가
 * 통과했다」와 구별이 안 된다 (REPAIR §41)
 */
const RENDER_FIRST_CASES = ['01', '02', '03', '04', '05']

/**
 * 대표 구간이 다 돌면 내야 할 열일곱.
 *
 * ⚠️ **자리 목록이 아니라 시험 목록이다.** 08~11(축복시티·무쇠시티·탄광·체육관)은
 * 「걸어서 닿는가」 넷이고, 나머지는 켜기·오프닝·리포트·배틀·상점·배지·이어하기와
 * **화면이 실제로 그려졌는가**(15)·**콘솔이 조용한가**(16)다. 15와 16이 목록에
 * 있는 것이 핵심이다 — 열두 자리를 다 지나도 화면이 검거나 콘솔이 오류로 차 있으면
 * 그것은 완주가 아니다 (기획서 §7 「테스트 수가 아니라 실제 결과」)
 */
const JOURNEY_CASES = [
  '01', '02', '03', '04', '05', '06', '07', '08',
  '09', '10', '11', '12', '13', '14', '15', '16', '99',
]

/** 확인 지점 표의 정본. 훑기의 목록은 **이 파일에서** 나온다 */
const CHECKPOINT_SOURCE = 'src/engine/dev/checkpoints.ts'

/** 글로 적어 둔 목록 하나를 roster 꼴로 접는다 */
function listRoster(cases, from) {
  return { cases, digest: sha(cases.join(NUL)), from }
}

/**
 * 훑기의 정본 목록 — ① 새 게임 · ② 확인 지점 전부 · ③ 엔딩.
 *
 * ⚠️ **자료에서 뽑고 그 자료의 지문까지 같이 묶는다** (기획서 §6.1). 목록이
 * 자료를 따라 움직이므로, 이름이 그대로여도 **자리가 바뀌면** 다시 돌려야 한다.
 *
 * ⚠️ **못 읽으면 `null`이다.** 표를 못 읽었는데 「목록이 비었으니 다 돌았다」로
 * 읽히면 안 된다 — 부르는 쪽이 그것을 실패로 센다
 */
function storyRoster() {
  const at = resolve(ROOT, CHECKPOINT_SOURCE)
  if (!existsSync(at)) return null
  const src = readFileSync(at, 'utf8')
  // 줄 단위로 본다 — 줄 끝의 CR을 정규식에 적어 두면 그 자체가 함정이 된다
  const ids = []
  for (const raw of src.split(NL)) {
    const hit = /^ {4}id: '([^']+)',$/.exec(raw.replace(/\s+$/, ''))
    if (hit !== null) ids.push(hit[1])
  }
  if (ids.length === 0) return null
  return { cases: ['open', ...ids, 'ending'], digest: sha(src), from: CHECKPOINT_SOURCE }
}

/**
 * 각 검사 묶음이 **무엇에 묶이고 무엇을 다 돌려야 하는가.**
 *
 * ⚠️ **묶이는 지문이 묶음마다 다르다.** `run.mjs`는 `serveDist(DIST)`로 **dist를
 * 띄워** 재므로 배포물에 묶인다. `story.mjs`·`gpuLoss.mjs`는 `startVite`로
 * **개발 서버**에서 도는데(확인 지점이 `import.meta.env.DEV` 뒤에 있어 배포
 * 빌드에는 조각이 아예 없다) 그쪽에 artifactDigest를 걸면 **재지도 않은 dist를
 * 잰 척하게 된다.** 그래서 둘은 소스 지문에 묶는다.
 *
 * · `contract` — 이 묶음의 **시험이 뜻하는 바**가 바뀌면 올린다. 옛 판 결과는
 *   형식이 멀쩡해도 다시 돌려야 하는 것이다
 * · `roster()` — 정본 case 목록. **하네스가 아니라 여기가 소유한다**
 * · `harness` — 이 묶음을 재는 도구들. 한 줄이라도 바뀌면 그 묶음의 결과는
 *   다시 돌려야 한다 (기획서 §6.1 「도구 변경을 무조건 무시하지 않는다」)
 */
export const SUITES = {
  'installed-e2e': {
    file: 'e2e.json',
    binds: 'artifact',
    label: '브라우저 실측',
    where: 'DEPLOY.md §5',
    contract: 1,
    roster: () => listRoster(E2E_CASES, 'tools/distribution/evidence.mjs'),
    harness: [
      'tools/e2e/run.mjs', 'tools/e2e/serve.mjs',
      'tools/e2e/drive.mjs', 'tools/e2e/observe.mjs', 'tools/e2e/route.mjs',
      'tools/devServer.mjs', 'tools/gpuFlags.mjs',
      'tools/distribution/evidence.mjs', 'tools/distribution/csp.mjs',
    ],
  },
  story: {
    file: 'story.json',
    binds: 'source',
    label: '이야기 훑기',
    where: 'tools/e2e/story.mjs',
    contract: 1,
    roster: storyRoster,
    harness: [
      'tools/e2e/story.mjs',
      'tools/e2e/drive.mjs', 'tools/e2e/observe.mjs', 'tools/e2e/route.mjs',
      'tools/e2e/sceneWatch.mjs', 'tools/devServer.mjs', 'tools/gpuFlags.mjs',
      'tools/shot/png.mjs', 'tools/distribution/evidence.mjs',
    ],
  },
  journey: {
    file: 'journey.json',
    binds: 'source',
    label: '대표 구간 완주',
    where: 'tools/e2e/journey.mjs',
    // ⚠️ **4다.** ⑮의 뜻이 또 갈렸다 — 「캔버스의 색이 여럿인가」가 아니라
    // **지형이 있는가**를 본다. 색 수로는 까만 원반 위에 주인공만 뜬 컷과
    // 바닥이 한 줄만 그려진 컷이 **통과**했다(2026-09-08 실측, 눈으로 확인).
    // 그리고 찍는 시점이 「도착 직후」가 아니라 **지형이 섰다는 상태**가 됐고,
    // 그 상한을 넘긴 컷은 판정 불가로 갈라 적는다.
    // **3으로 잰 판은 이 판정의 통과에 못 보탠다.**
    //
    // ⚠️ **5다.** 뜻이 두 곳에서 또 갈렸다 (2026-09-09).
    // ① 화면: 검은 칸을 **칸마다** 빼 주던 것이 「아래에서 통째로 한 줄씩」이
    //    됐다 — 앞 규칙에는 **검은 바탕에 두 칸만 무늬면 통과**하는 구멍이
    //    있었다(합성 대조로 실측). 살아 있는 칸의 최소도 2에서 4가 됐다.
    // ② 준비: 「표식의 맵 번호가 지금 맵과 같은가」가 「**가장 새 요청이
    //    커밋됐는가**」가 됐다. 앞 판은 한 행렬 안에서 존만 바뀌어도 거짓
    //    실패였고(도로를 걷는 내내 준비 안 됨), 텍스처 묶음만 바뀐 재요청은
    //    못 봤다.
    // **4로 잰 판도 이 판정의 통과에 못 보탠다.**
    contract: 5,
    roster: () => listRoster(JOURNEY_CASES, 'tools/distribution/evidence.mjs'),
    harness: [
      'tools/e2e/journey.mjs',
      'tools/e2e/drive.mjs', 'tools/e2e/observe.mjs', 'tools/e2e/route.mjs',
      'tools/e2e/canvasShot.mjs', 'tools/e2e/terrainJudge.mjs', 'tools/e2e/stageProbe.mjs',
      // ⚠️ 페이지에 심는 것도 도구다 — 빠지면 계측이 바뀐 판을 봉투가 못 잡는다
      'tools/e2e/perfSpy.mjs',
      'tools/devServer.mjs', 'tools/gpuFlags.mjs', 'tools/shot/png.mjs',
      'tools/distribution/evidence.mjs',
    ],
  },
  'render-first': {
    file: 'renderFirst.json',
    binds: 'source',
    label: '첫 3D 화면',
    where: 'tools/e2e/firstFrame.mjs',
    // ⚠️ **2다.** ⑤의 뜻이 바뀌었다 — 「걷기 앞뒤로 그림이 달라졌다」에
    // 「**앞뒤 둘 다 세계다**」가 더해졌다. 예전 판은 걷고 나서 단색이 되어도
    // 통과를 줄 수 있었으므로 옛 결과는 다시 돌려야 한다 (REPAIR §41)
    contract: 2,
    roster: () => listRoster(RENDER_FIRST_CASES, 'tools/distribution/evidence.mjs'),
    harness: [
      // ⚠️ 판정기(`firstFrameRules`)가 빠져 있었다 — 뜻을 바꾸는 파일이
      // 도구 목록 밖에 있으면 봉투가 그 변화를 못 잡는다
      'tools/e2e/firstFrame.mjs', 'tools/e2e/firstFrameRules.mjs',
      'tools/e2e/canvasShot.mjs', 'tools/e2e/drive.mjs', 'tools/e2e/observe.mjs',
      'tools/devServer.mjs', 'tools/gpuFlags.mjs', 'tools/shot/png.mjs',
      'tools/distribution/evidence.mjs',
    ],
  },
  'gpu-loss': {
    file: 'gpuLoss.json',
    binds: 'source',
    label: '장치 손실 복구',
    where: 'tools/e2e/gpuLoss.mjs',
    contract: 1,
    roster: () => listRoster(GPU_LOSS_CASES, 'tools/distribution/evidence.mjs'),
    harness: [
      'tools/e2e/gpuLoss.mjs',
      'tools/e2e/drive.mjs', 'tools/e2e/observe.mjs', 'tools/e2e/route.mjs',
      'tools/devServer.mjs', 'tools/gpuFlags.mjs', 'tools/distribution/evidence.mjs',
    ],
  },
}

/** 그 묶음이 다 돌면 내야 할 정본 목록. 못 내면 `null` */
export function rosterOf(suiteName) {
  return SUITES[suiteName]?.roster() ?? null
}

/** 경로와 내용을 함께 접는다. 파일이 **없어진 것**도 내용이 바뀐 것과 같이 잡힌다 */
function foldTree(entries) {
  const h = createHash('sha256')
  for (const [rel, digest] of entries.sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    h.update(`${rel}${NUL}${digest}${NL}`)
  }
  return h.digest('hex')
}

/**
 * 게임 소스·lockfile·빌드 설정으로 **치는 파일 목록**.
 *
 * ⚠️ **추적 안 한 앱 파일도 든다** (기획서 §3.1). 판 1은 `git ls-files`만 봐서
 * **아직 커밋 안 한 새 파일이 지문에 안 들어갔다** — 실측으로
 * `src/state/rendererStore.ts`·`src/ui/screens/RendererTrouble.tsx`가 그랬고,
 * 그 말은 「새로 만든 파일만 고치면 증거가 안 죽는다」는 뜻이다. 개발 중에는
 * 그 편집이 제일 잦다. `--others --exclude-standard`가 **무시되지 않은 새
 * 파일**까지 세어 준다 — `public/data`·`public/models`는 `.gitignore`가 막고,
 * 그 규칙이 느슨해진 날은 아래 `strayExtracts`가 잡는다.
 *
 * ⚠️ **목록은 git에서, 바이트는 지금 디스크에서.** `git rev-parse HEAD`는
 * 커밋 안 한 변경을 못 보고, 나무를 통째로 걷는 것은 `node_modules`를 밟는다.
 * 그래야 「고쳐 놓고 안 돌린 것」이 옛 증거를 되살리지 못한다.
 *
 * ⚠️ **검사를 위해 `git add`를 하지 않는다.** 지문을 내려고 사용자의 파일을
 * 무대에 올리는 것은 증거가 아니라 부작용이다 (기획서 §16.2)
 *
 * git을 못 부르면 `null`이다. **부르는 쪽이 그것을 통과로 세면 안 된다**
 */
export function sourceFiles() {
  let listed
  try {
    listed = execFileSync('git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...SOURCE_ROOTS],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
  } catch {
    return null
  }
  return listed.split(NUL).filter(Boolean)
}

/**
 * 소스 목록에 **있어서는 안 되는 것**이 섞였는가. 있으면 그 경로들.
 *
 * 무시 규칙이 느슨해진 날을 여기서 세운다 — 걸러 내고 넘어가면 그날을 아무도 모른다
 */
export function strayExtracts(listed) {
  return listed.filter((rel) => NEVER_SOURCE.some((no) => rel.startsWith(no)))
}

/** 위 목록의 지문. git을 못 부르거나 추출물이 섞이면 `null`이다 */
export function sourceDigest() {
  const listed = sourceFiles()
  if (listed === null) return null
  if (strayExtracts(listed).length > 0) return null
  const entries = []
  for (const rel of listed) {
    const at = resolve(ROOT, rel)
    // 목록에는 있는데 나무에 없다 = 지운 것이다. 「없음」도 하나의 상태로 접는다
    entries.push([rel, existsSync(at) ? sha(readFileSync(at)) : 'absent'])
  }
  return entries.length === 0 ? null : foldTree(entries)
}

/**
 * `dist/`의 지문 — 파일 목록과 내용 전부.
 *
 * 없으면 `null`이다 (아직 안 구웠다)
 */
export function artifactDigest() {
  const dist = resolve(ROOT, 'dist')
  if (!existsSync(dist)) return null
  const entries = []
  const walk = (at, rel) => {
    for (const e of readdirSync(at, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const child = join(at, e.name)
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(child, childRel)
      else if (statSync(child).isFile()) entries.push([childRel, sha(readFileSync(child))])
    }
  }
  walk(dist, '')
  return entries.length === 0 ? null : foldTree(entries)
}

/**
 * **개발 서버가 내주는 자료 나무**(`public/data`)의 지문 — 경로와 내용 전부.
 *
 * ⚠️ **`sourceDigest`가 이것을 안 센다.** 저작권 규칙(`NEVER_SOURCE`)이
 * `public/data/`와 `public/models/`를 소스 목록에서 통째로 뺀다 — 그래야
 * 추출물이 지문에 안 섞인다. 그런데 그 결과로 **행렬과 스크립트가 어느
 * 지문에도 없었다**: 맵 격자를 갈아 끼우고 같은 봉투로 「이어 달리기」를 해도
 * 아무도 못 막았다.
 *
 * ⚠️ **내용은 안 적는다.** 파일 이름과 바이트를 접어 만든 **한 줄**만 남는다 —
 * 원본 내용이 보고서로 새지 않는다 (COPYRIGHT.md §6).
 *
 * ⚠️ **설치본이 쓰는 자료는 이것이 아니다.** 배포 번들은 OPFS에 설치된
 * 것을 읽으므로(`app/boot.ts`가 `import.meta.env.DEV`로 가른다) 이 값은
 * **개발 서버로 잰 판**의 신원이다. 봉투의 `environment`가 어느 쪽인지를 적는다
 */
export function dataDigest() {
  const root = resolve(ROOT, 'public/data')
  if (!existsSync(root)) return null
  const entries = []
  const walk = (at, rel) => {
    for (const e of readdirSync(at, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const child = join(at, e.name)
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(child, childRel)
      else if (statSync(child).isFile()) entries.push([childRel, sha(readFileSync(child))])
    }
  }
  walk(root, '')
  return entries.length === 0 ? null : foldTree(entries)
}

/**
 * 그 묶음이 **묶이는 쪽**의 지금 지문.
 *
 * 하네스가 시작할 때 한 번 불러 두고 봉투에 같이 넣는다 — 끝난 시점의 지문만
 * 보면 「38분 도는 동안 소스를 고친 것」이 안 보인다 (기획서 §16.1)
 */
export function bindingDigest(suiteName) {
  const meta = SUITES[suiteName]
  if (meta === undefined) return null
  return meta.binds === 'artifact' ? artifactDigest() : sourceDigest()
}

/**
 * 그 묶음을 **재는 도구**의 지문.
 *
 * ⚠️ **묶음마다 다른 목록이다.** 하나로 합치면 `gpuLoss.mjs`를 고칠 때마다
 * 훑기 결과가 죽는다 — 관계없는 도구의 편집으로 38분짜리 검사를 다시 돌게
 * 하는 것은 검사를 안 돌리게 만드는 지름길이다
 */
export function harnessDigest(suiteName) {
  const meta = SUITES[suiteName]
  if (meta === undefined) return null
  return foldTree(meta.harness.map((rel) => {
    const at = resolve(ROOT, rel)
    return [rel, existsSync(at) ? sha(readFileSync(at)) : 'absent']
  }))
}

/** 빌드가 스스로 적어 둔 신원. 없으면 `null` */
export function buildStamp() {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, '.audit/build.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * 봉투의 `environment` 한 벌.
 *
 * ⚠️ **못 잰 값을 그럴듯한 기본값으로 채우지 않는다.** 빈 문자열로 두면
 * `validateEvidence`가 「어디서 잰 값인지 말할 수 없다」로 막는다 — 모르는 것을
 * 아는 것처럼 적는 쪽이 훨씬 나쁘다.
 *
 * `software`는 판정에 안 쓰지만 같이 남긴다. 소프트웨어 래스터라이저에서 잰
 * 프레임 시간을 나중에 실기 성능으로 읽는 일을 막는 것은 이 한 줄이다
 */
export function describeEnvironment({ browserVersion, gpu, backend }) {
  return {
    browser: browserVersion ? `Chromium ${browserVersion}` : '',
    os: `${platform()} ${release()}`,
    gpu: gpu?.renderer ?? '',
    backend: backend ?? '',
    software: gpu?.software ?? null,
  }
}

/**
 * 하네스가 결과에 씌우는 봉투.
 *
 * ⚠️ **`executedCases`를 결과에서 유도하지 않는다.** 결과 줄에서 뽑으면
 * 「돌다 만 것」과 「다 돌린 것」이 파일에서 똑같이 보인다 — 실제로 돌린 목록을
 * 부르는 쪽이 넘긴다. 대신 아래 `validateEvidence`가 셋(예상·실행·결과)이 서로
 * 어긋나지 않는지, 그리고 셋 다 **정본과 같은지**를 되짚는다
 */
export function sealEvidence({
  suite, selection = 'all', expectedCases, executedCases, environment, results,
  startDigest = null, dataAtStart = null, extra = {},
}) {
  const meta = SUITES[suite]
  const data = dataDigest()
  return {
    schemaVersion: EVIDENCE_SCHEMA,
    contractVersion: meta?.contract ?? null,
    artifactDigest: artifactDigest(),
    sourceDigest: sourceDigest(),
    harnessDigest: harnessDigest(suite),
    /** 이 판이 먹은 자료의 신원 (`dataDigest`) */
    dataDigest: data,
    /**
     * 도는 동안 자료가 바뀌었는가. 시작 지문을 안 받았으면 `null`(모른다)이다 —
     * **`false`로 접지 않는다**
     */
    dataChangedDuringRun: dataAtStart === null ? null : dataAtStart !== data,
    rosterDigest: meta?.roster()?.digest ?? null,
    buildId: buildStamp()?.buildId ?? null,
    testedAt: new Date().toISOString(),
    environment,
    scope: { suite, selection, expectedCases, executedCases, startDigest },
    results,
    ...extra,
  }
}

const bad = (detail) => ({ ok: false, detail })

/** 이름 목록 하나가 성한가 — 글자인가, 빈 것은 없는가, 겹치지는 않는가 */
function idProblem(what, list) {
  if (!Array.isArray(list)) return `${what}가 목록이 아니다`
  const odd = list.filter((id) => typeof id !== 'string' || id === '')
  if (odd.length > 0) return `${what}에 글자가 아닌 이름이 ${String(odd.length)}개 있다`
  const seen = new Set()
  const twice = new Set()
  for (const id of list) {
    if (seen.has(id)) twice.add(id)
    seen.add(id)
  }
  if (twice.size > 0) {
    return `${what}에 같은 이름이 두 번 있다: ${[...twice].slice(0, 6).join(' · ')}`
  }
  return null
}

/**
 * 봉투 하나를 열어 **이 나무·이 배포물의 통과인지** 판정한다.
 *
 * 순서가 곧 메시지의 순서다 — 먼저 「없다/깨졌다」, 그다음 「형식이 아니다」,
 * 그다음 「다른 것을 쟀다」, 마지막에 「내용이 떨어졌다」
 */
export function checkEvidence(suiteName, opts = {}) {
  const meta = SUITES[suiteName]
  if (meta === undefined) return bad(`모르는 검사 묶음 ${suiteName}`)
  const dir = opts.auditDir ?? resolve(ROOT, '.audit')
  const at = resolve(dir, meta.file)
  if (!existsSync(at)) return bad(`.audit/${meta.file}이 없다 — 돌린 적이 없다`)

  let env
  try {
    env = JSON.parse(readFileSync(at, 'utf8'))
  } catch (e) {
    // ⚠️ **깨진 JSON은 crash가 아니라 판정이다.** 여기서 터지면 release:check가
    // 「막힌 것 없음」도 「막혔음」도 못 내고 그냥 죽는다
    return bad(`.audit/${meta.file}을 못 읽는다 — ${String(e.message ?? e)}`)
  }
  return validateEvidence(env, suiteName, {
    artifact: 'artifact' in opts ? opts.artifact : artifactDigest(),
    source: 'source' in opts ? opts.source : sourceDigest(),
    harness: 'harness' in opts ? opts.harness : harnessDigest(suiteName),
    roster: 'roster' in opts ? opts.roster : meta.roster(),
  })
}

/**
 * 봉투 하나를 **지금 나무·지금 배포물·지금 정본 목록**과 맞대어 판정한다.
 *
 * 맞댈 것을 밖에서 받는다 — 시험이 「dist가 바뀐 뒤」를 파일 없이 만들 수 있어야
 * 하고, 판정 하나에 35분짜리 빌드를 매달지 않기 위해서다.
 *
 * 순서가 곧 메시지의 순서다 — 먼저 「형식이 아니다」, 그다음 「다른 것을 쟀다」,
 * 마지막에 「내용이 떨어졌다」
 */
export function validateEvidence(env, suiteName, { artifact, source, harness, roster }) {
  const meta = SUITES[suiteName]
  if (meta === undefined) return bad(`모르는 검사 묶음 ${suiteName}`)
  if (env === null || typeof env !== 'object' || Array.isArray(env)) {
    return bad(`.audit/${meta.file}이 봉투가 아니다`)
  }

  // ① 판. 옛 판(봉투가 없던 시절 포함)은 「통과」가 아니라 「다시 돌려야 하는 것」이다
  if (env.schemaVersion !== EVIDENCE_SCHEMA) {
    return bad(env.schemaVersion === undefined
      ? `봉투가 없는 옛 결과다 (schemaVersion 없음) — 다시 돌려야 한다 (${meta.label})`
      : `봉투 판 ${String(env.schemaVersion)}은 지금 계약(${String(EVIDENCE_SCHEMA)})이 아니다 — 다시 돌려야 한다`)
  }
  // ⚠️ **형식이 같아도 뜻이 다를 수 있다.** 시험 하나가 재던 것을 바꾸면 봉투
  // 모양은 그대로인데 옛 결과의 PASS가 다른 말이 된다 — 그때 올리는 것이 이 판이다
  if (env.contractVersion !== meta.contract) {
    return bad(`${meta.label}의 검사 계약 판이 ${String(env.contractVersion)}인데`
      + ` 지금은 ${String(meta.contract)}다 — 시험이 뜻하는 바가 바뀌었다. 다시 돌려야 한다`)
  }
  if (env.scope?.suite !== suiteName) {
    return bad(`다른 묶음의 결과다 — scope.suite가 ${String(env.scope?.suite)}다`)
  }

  // ② 언제·어디서 쟀는가. 「어느 기계의 수치인가」를 못 적는 결과는 증거가 아니다
  if (typeof env.testedAt !== 'string' || Number.isNaN(Date.parse(env.testedAt))) {
    return bad('언제 쟀는지가 없다 (testedAt)')
  }
  for (const key of ['browser', 'os', 'gpu', 'backend']) {
    if (typeof env.environment?.[key] !== 'string' || env.environment[key] === '') {
      return bad(`실행 환경 ${key}를 안 적었다 — 어디서 잰 값인지 말할 수 없다`)
    }
  }

  // ③ 무엇을 쟀는가. 여기가 「다른 배포물의 도장」을 막는 자리다
  const want = meta.binds === 'artifact' ? artifact : source
  const got = meta.binds === 'artifact' ? env.artifactDigest : env.sourceDigest
  const what = meta.binds === 'artifact' ? 'dist' : '게임 소스'
  if (typeof got !== 'string' || got === '') {
    return bad(`${what} 지문이 봉투에 없다 — 무엇을 쟀는지 말할 수 없다`)
  }
  if (want === null || want === undefined) {
    return bad(meta.binds === 'artifact'
      ? 'dist가 없어 지금 배포물과 견줄 수 없다 — pnpm build를 안 돌렸다'
      : '게임 소스 지문을 낼 수 없다 — git을 못 읽었거나 추출물이 소스 목록에 섞였다')
  }
  if (want !== got) {
    // 「배포물」·「게임 소스」 뒤에 오는 조사가 다르다 — 받침이 있는 쪽만 「이」다
    return bad(`${what}${what.endsWith('물') ? '이' : '가'} 그 뒤로 바뀌었다`
      + ` — ${got.slice(0, 12)}을 쟀는데 지금은 ${want.slice(0, 12)}다.`
      + ` 다시 돌려야 한다 (${meta.label})`)
  }
  // ⚠️ **재는 도중에 대상이 바뀌면 그 결과는 무효다** (기획서 §16.1). 훑기는
  // 38분을 도는데 그 사이에 소스를 고치면 앞 절반과 뒤 절반이 서로 다른 게임을
  // 잰 것이 된다 — 끝난 시점의 지문만 보면 그것이 안 보인다
  if (typeof env.scope?.startDigest !== 'string' || env.scope.startDigest === '') {
    return bad(`검사를 시작할 때의 ${what} 지문이 없다 (scope.startDigest)`)
  }
  if (env.scope.startDigest !== got) {
    return bad(`검사가 도는 동안 ${what}이 바뀌었다 — ${env.scope.startDigest.slice(0, 12)}으로 시작해`
      + ` ${got.slice(0, 12)}으로 끝났다. 다시 돌려야 한다`)
  }
  // ⚠️ **재는 도구가 바뀐 것도 「다른 것을 쟀다」다.** 시험 한 줄을 무르게 고치고
  // 옛 결과를 그대로 두면, 그 결과는 지금 하네스가 낸 적 없는 판정이다
  if (typeof env.harnessDigest !== 'string' || env.harnessDigest === '') {
    return bad('어느 검사 도구로 잰 것인지가 없다 (harnessDigest)')
  }
  if (harness !== null && harness !== undefined && env.harnessDigest !== harness) {
    return bad(`검사 도구가 그 뒤로 바뀌었다 — ${env.harnessDigest.slice(0, 12)}으로 쟀는데 지금은`
      + ` ${harness.slice(0, 12)}다. 다시 돌려야 한다 (${meta.where})`)
  }
  if (typeof env.buildId !== 'string' || env.buildId === '') {
    return bad('어느 빌드 곁에서 잰 것인지가 없다 (buildId)')
  }

  // ④ 재려 한 것이 **정본과 같은가.** 봉투가 제 시험 목록을 스스로 못 정한다
  if (roster === null || roster === undefined) {
    return bad(`${meta.label}의 정본 case 목록을 낼 수 없다 — 판정할 근거가 없다`)
  }
  if (typeof env.rosterDigest !== 'string' || env.rosterDigest === '') {
    return bad('어느 정본 목록으로 잰 것인지가 없다 (rosterDigest)')
  }
  if (env.rosterDigest !== roster.digest) {
    return bad(`정본 case 목록이 그 뒤로 바뀌었다 (${roster.from}) — ${env.rosterDigest.slice(0, 12)}으로`
      + ` 쟀는데 지금은 ${roster.digest.slice(0, 12)}다. 다시 돌려야 한다`)
  }
  const expected = env.scope?.expectedCases
  const executed = env.scope?.executedCases
  for (const [name, list] of [['expectedCases', expected], ['executedCases', executed]]) {
    const problem = idProblem(name, list)
    if (problem !== null) return bad(problem)
  }
  if (typeof env.scope?.selection !== 'string' || env.scope.selection === '') {
    return bad('무엇을 걸러 돌렸는지가 없다 (scope.selection)')
  }
  // ⚠️ **여기가 「한 건짜리 봉투」를 막는 자리다** (기획서 §3.2). 판 1은 셋이
  // 서로 맞기만 하면 통과였고, 그래서 expected·executed·results를 임의의 한
  // 건으로 맞춘 합성 봉투가 ok였다. 정본과 **집합이 같아야** 한다
  const canon = new Set(roster.cases)
  const declared = new Set(expected)
  const strange = expected.filter((id) => !canon.has(id))
  const shrunk = roster.cases.filter((id) => !declared.has(id))
  if (strange.length > 0 || shrunk.length > 0) {
    return bad(`재려 한 목록이 정본과 다르다 (${roster.from}) —`
      + (shrunk.length > 0 ? ` 빠진 것 ${String(shrunk.length)}개: ${shrunk.slice(0, 6).join(' · ')}` : '')
      + (strange.length > 0 ? ` 정본에 없는 것: ${strange.slice(0, 6).join(' · ')}` : ''))
  }
  // ⚠️ **선언 안 한 것을 돌린 결과도 통과가 아니다.** 시험을 늘리고 예상 목록을
  // 안 늘리면, 그 새 시험이 떨어져도 「예상한 것은 다 돌았다」로 초록이 된다
  const undeclared = executed.filter((id) => !declared.has(id))
  if (undeclared.length > 0) {
    return bad(`예상 목록에 없는 case를 돌렸다: ${undeclared.slice(0, 6).join(' · ')}`
      + ' — 정본 목록을 같이 늘려야 한다')
  }
  const ranSet = new Set(executed)
  const missing = expected.filter((id) => !ranSet.has(id))
  if (missing.length > 0) {
    return bad(`${String(missing.length)}/${String(expected.length)}개를 안 돌렸다:`
      + ` ${missing.slice(0, 6).join(' · ')}${missing.length > 6 ? ' …' : ''}`)
  }

  // ⑤ 결과. 여기까지 와야 내용을 센다
  if (!Array.isArray(env.results) || env.results.length === 0) {
    return bad('결과가 비었다 — 다시 돌려야 한다')
  }
  const rowIds = env.results.map((r) => (r === null || typeof r !== 'object' ? null : r.id))
  const rowProblem = idProblem('결과의 case 이름', rowIds)
  if (rowProblem !== null) return bad(rowProblem)
  const stray = rowIds.filter((id) => !declared.has(id))
  if (stray.length > 0) {
    return bad(`정본에 없는 결과 줄 ${String(stray.length)}건: ${stray.slice(0, 6).join(' · ')}`)
  }
  const known = new Set(STATUSES)
  const odd = env.results.filter((r) => !known.has(r?.status))
  if (odd.length > 0) {
    return bad(`모르는 status ${String(odd.length)}건: ${[...new Set(odd.map((r) => String(r?.status)))].join(' · ')}`)
  }
  // 봉투가 「돌렸다」고 한 것이 결과에 실제로 있는가. 목록만 늘려 통과시키는 길을 막는다
  const inResults = new Set(rowIds)
  const ghost = executed.filter((id) => !inResults.has(id))
  if (ghost.length > 0) {
    return bad(`돌렸다고 적혔는데 결과가 없다: ${ghost.slice(0, 6).join(' · ')}`)
  }

  // ⚠️ **BLOCKED도 통과가 아니다** (기획서 §3.3). 하네스가 종료 0을 냈다는
  // 이유로 「막힌 것 없음」이 되면, 안 잰 것이 잰 것으로 셈된다
  for (const status of ['FAIL', 'BLOCKED', 'NOT RUN']) {
    const hit = env.results.filter((r) => r.status === status)
    if (hit.length > 0) {
      return bad(`${status} ${String(hit.length)}건: `
        + hit.slice(0, 4).map((r) => `${r.id} ${r.what ?? ''}`.trim()).join(' · '))
    }
  }
  return { ok: true }
}
