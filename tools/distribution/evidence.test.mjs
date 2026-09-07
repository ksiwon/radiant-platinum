// 릴리스 증거 계약 (PLATINUM_3D_COMPLETION_PLAN §6.1 · PT-01)
//
// ⚠️ **이 시험이 재는 것은 「검사가 통과하는가」가 아니라 「가짜가 떨어지는가」다.**
// 아래 것들은 모두 어느 판에선가 **초록이었다.** 그래서 각 시험은 옛 판정도 같이
// 돌려, 옛것이 통과시키고 새것이 막는 것을 나란히 적는다 — 「고쳤다」가 아니라
// **「무엇이 뚫려 있었는가」**가 남아야 다시 안 뚫린다.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  EVIDENCE_SCHEMA, SUITES, bindingDigest, checkEvidence, rosterOf, sealEvidence, sourceFiles,
  strayExtracts, validateEvidence,
} from './evidence.mjs'

/**
 * `blockers.mjs`가 오래 쓰던 판정 그대로.
 *
 * FAIL·NOT RUN·BLOCKED가 하나도 없으면 통과다. **다른 것은 아무것도 안 본다** —
 * 이 함수가 `true`를 내는데 새 판정이 막는 자리가 곧 그동안 메운 구멍이다
 */
function oldVerdict(parsed) {
  const { results } = parsed
  if (results.filter((r) => r.status === 'FAIL').length) return false
  if (results.filter((r) => r.status === 'NOT RUN').length) return false
  if (results.filter((r) => r.status === 'BLOCKED').length) return false
  return true
}

/**
 * 판 1의 판정 — **셋(예상·실행·결과)이 서로 맞기만 하면 통과였다.**
 *
 * ⚠️ 여기가 기획서 §3.2가 실제로 함수를 불러 확인한 구멍이다: expected·executed·
 * results를 전부 임의의 한 건으로 맞춘 합성 봉투에 **ok: true**가 나왔다.
 * 목록이 정본과 같은지를 아무도 안 물었기 때문이다
 */
function schemaOneVerdict(env) {
  const { expectedCases: want, executedCases: ran } = env.scope
  if (!Array.isArray(want) || want.length === 0) return false
  if (!Array.isArray(ran)) return false
  if (ran.some((id) => !want.includes(id))) return false
  if (want.some((id) => !ran.includes(id))) return false
  if (!Array.isArray(env.results) || env.results.length === 0) return false
  return oldVerdict(env)
}

const ART = 'a'.repeat(64)
const SRC = 'b'.repeat(64)
const HARNESS = 'c'.repeat(64)
const E2E = rosterOf('installed-e2e')
const STORY = rosterOf('story')

const WHERE = {
  browser: 'Chromium 141', os: 'Windows 11', gpu: 'Intel Arc 140V', backend: 'WebGPUBackend',
}

/** 흠 없는 봉투 하나. 시험마다 여기서 한 군데씩만 흐트러뜨린다 */
function envelope(over = {}) {
  const cases = E2E.cases
  return {
    schemaVersion: EVIDENCE_SCHEMA,
    contractVersion: SUITES['installed-e2e'].contract,
    artifactDigest: ART,
    sourceDigest: SRC,
    harnessDigest: HARNESS,
    rosterDigest: E2E.digest,
    buildId: '6c5e534',
    testedAt: '2026-09-07T10:00:00.000Z',
    environment: { ...WHERE },
    scope: {
      suite: 'installed-e2e',
      selection: 'all',
      expectedCases: [...cases],
      executedCases: [...cases],
      startDigest: ART,
    },
    results: cases.map((id) => ({ id, what: `시험 ${id}`, status: 'PASS', detail: '' })),
    ...over,
  }
}

const judge = (env) => validateEvidence(env, 'installed-e2e',
  { artifact: ART, source: SRC, harness: HARNESS, roster: E2E })

describe('봉투가 제 시험 목록을 스스로 정하지 못한다', () => {
  it('정본 스물아홉을 한 건으로 줄인 봉투가 떨어진다 (기획서 §3.2)', () => {
    // 기획서가 함수를 직접 불러 확인한 그 합성 입력이다 — 셋을 전부 한 건으로 맞췄다
    const one = envelope({
      scope: {
        suite: 'installed-e2e', selection: 'all',
        expectedCases: ['01'], executedCases: ['01'], startDigest: ART,
      },
      results: [{ id: '01', what: '시험 01', status: 'PASS', detail: '' }],
    })
    expect(oldVerdict(one)).toBe(true)
    // ⚠️ **판 1은 여기서 ok였다.** 셋이 서로 어긋나지 않았기 때문이다
    expect(schemaOneVerdict(one)).toBe(true)
    const said = judge(one)
    expect(said.ok).toBe(false)
    expect(said.detail).toContain('정본과 다르다')
    expect(said.detail).toContain('빠진 것 28개')
  })

  it('훑기 여든여덟을 한 건으로 줄인 봉투도 떨어진다', () => {
    const one = {
      ...envelope(),
      rosterDigest: STORY.digest,
      contractVersion: SUITES.story.contract,
      scope: {
        suite: 'story', selection: 'all',
        expectedCases: ['open'], executedCases: ['open'], startDigest: SRC,
      },
      results: [{ id: 'open', what: '새 게임', status: 'PASS', detail: '' }],
    }
    expect(schemaOneVerdict(one)).toBe(true)
    const said = validateEvidence(one, 'story',
      { artifact: ART, source: SRC, harness: HARNESS, roster: STORY })
    expect(said.ok).toBe(false)
    expect(said.detail).toContain('정본과 다르다')
  })

  it('정본에 없는 이름을 목록에 끼워 넣어도 떨어진다', () => {
    const env = envelope()
    env.scope.expectedCases = [...E2E.cases, '30']
    env.scope.executedCases = [...E2E.cases, '30']
    env.results.push({ id: '30', what: '내가 지은 시험', status: 'PASS', detail: '' })
    expect(judge(env).detail).toContain('정본에 없는 것')
  })

  it('정본 목록이 나온 자료가 바뀌면 다시 돌려야 한다', () => {
    // 확인 지점 표가 바뀌면 이름이 그대로여도 **자리**가 달라진다
    expect(judge(envelope({ rosterDigest: 'f'.repeat(64) })).detail).toContain('정본 case 목록이 그 뒤로 바뀌었다')
    expect(judge(envelope({ rosterDigest: undefined })).detail).toContain('rosterDigest')
  })

  it('훑기의 정본은 확인 지점 표에서 나온다 — 하네스가 짓지 않는다', () => {
    expect(STORY.from).toBe('src/engine/dev/checkpoints.ts')
    expect(STORY.cases[0]).toBe('open')
    expect(STORY.cases.at(-1)).toBe('ending')
    // ① 새 게임 + ② 확인 지점 + ③ 엔딩. 표가 줄면 여기도 줄고, 그러면 봉투가 갈린다
    expect(STORY.cases.length).toBeGreaterThan(80)
    expect(new Set(STORY.cases).size).toBe(STORY.cases.length)
  })
})

describe('옛 판정이 통과시키던 가짜 증거', () => {
  it('빈 결과 — 없는 것에는 FAIL도 없다', () => {
    const env = envelope({ results: [] })
    expect(oldVerdict(env)).toBe(true)
    expect(judge(env).ok).toBe(false)
    expect(judge(env).detail).toContain('비었다')
  })

  it('모르는 status — 세 갈래 중 어느 것도 아니면 통과였다', () => {
    const env = envelope()
    env.results[1].status = 'WIP'
    expect(oldVerdict(env)).toBe(true)
    expect(judge(env).ok).toBe(false)
    expect(judge(env).detail).toContain('WIP')
  })

  it('일부만 돌린 결과 — 안 돌린 줄을 아예 안 적으면 티가 안 났다', () => {
    const env = envelope()
    env.scope.executedCases = ['01', '02', '03']
    env.results = env.results.slice(0, 3)
    expect(oldVerdict(env)).toBe(true)
    const said = judge(env)
    expect(said.ok).toBe(false)
    expect(said.detail).toContain('26/29')
  })

  it('선언 안 한 시험을 돌린 결과 — 하네스만 늘고 목록이 그대로면 조용히 안 세어진다', () => {
    const env = envelope()
    env.scope.expectedCases = E2E.cases.slice(0, 28)
    // 옛 판정은 전부 PASS라 초록이다. 새 시험 하나가 목록 밖에서 도는 것을 못 본다
    expect(oldVerdict(env)).toBe(true)
    const said = judge(env)
    expect(said.ok).toBe(false)
    // 정본과 갈린 것이 먼저 잡힌다 — 목록을 줄인 것 자체가 흠이다
    expect(said.detail).toContain('정본과 다르다')
  })

  it('다른 배포물의 도장 — 파일은 소스를 고쳐도 그대로 살아 있다', () => {
    const env = envelope()
    expect(oldVerdict(env)).toBe(true)
    const said = validateEvidence(env, 'installed-e2e',
      { artifact: 'd'.repeat(64), source: SRC, harness: HARNESS, roster: E2E })
    expect(said.ok).toBe(false)
    expect(said.detail).toContain('바뀌었다')
  })

  it('결과가 없는 케이스를 돌렸다고 적는다 — 목록만 늘려서는 못 통과한다', () => {
    const env = envelope()
    env.results = env.results.slice(0, 28)
    expect(oldVerdict(env)).toBe(true)
    expect(judge(env).detail).toContain('결과가 없다')
  })
})

describe('이름 목록이 성한가', () => {
  it('같은 이름을 두 번 적어 수를 채우지 못한다', () => {
    const env = envelope()
    env.scope.executedCases = [...E2E.cases.slice(0, 28), '01']
    expect(judge(env).detail).toContain('두 번 있다')
  })

  it('결과 줄이 겹쳐도 막는다 — 한 시험을 두 번 적어 통과시키는 길', () => {
    const env = envelope()
    env.results = [...env.results.slice(0, 28), { ...env.results[0] }]
    expect(judge(env).detail).toContain('두 번 있다')
  })

  it('글자가 아닌 이름은 이름이 아니다', () => {
    const env = envelope()
    env.scope.executedCases = [...E2E.cases.slice(0, 28), 29]
    expect(judge(env).detail).toContain('글자가 아닌')
  })

  it('정본에 없는 결과 줄이 섞이면 막는다', () => {
    const env = envelope()
    env.results.push({ id: '99', what: '검사가 터졌다', status: 'PASS', detail: '' })
    expect(judge(env).detail).toContain('정본에 없는 결과 줄')
  })

  it('무엇을 걸러 돌렸는지를 안 적으면 막는다', () => {
    const env = envelope()
    delete env.scope.selection
    expect(judge(env).detail).toContain('selection')
  })
})

describe('재는 도중에 대상이나 도구가 바뀌면 무효다', () => {
  it('시작 지문이 없으면 언제부터 잰 것인지 모른다', () => {
    const env = envelope()
    delete env.scope.startDigest
    expect(judge(env).detail).toContain('startDigest')
  })

  it('시작과 끝의 지문이 다르면 앞뒤가 다른 것을 잰 것이다', () => {
    const env = envelope()
    env.scope.startDigest = 'e'.repeat(64)
    const said = judge(env)
    expect(said.ok).toBe(false)
    expect(said.detail).toContain('도는 동안')
  })

  it('검사 도구가 바뀌면 그 결과는 지금 하네스가 낸 적 없는 판정이다', () => {
    expect(judge(envelope({ harnessDigest: 'f'.repeat(64) })).detail).toContain('검사 도구가 그 뒤로 바뀌었다')
    expect(judge(envelope({ harnessDigest: undefined })).detail).toContain('harnessDigest')
  })

  it('검사 계약 판이 다르면 형식이 멀쩡해도 다시 돌려야 한다', () => {
    const env = envelope({ contractVersion: SUITES['installed-e2e'].contract + 1 })
    expect(oldVerdict(env)).toBe(true)
    expect(judge(env).detail).toContain('검사 계약 판')
  })
})

describe('형식이 아닌 것은 crash가 아니라 판정이다', () => {
  it('results가 없는 객체에서 안 터진다', () => {
    // ⚠️ 옛 판정은 여기서 `results.filter`로 **터졌다** — 실패도 통과도 못 낸다
    expect(() => oldVerdict({})).toThrow()
    expect(judge({ ...envelope(), results: undefined }).ok).toBe(false)
  })

  it('배열·null·문자열이 와도 판정이 나온다', () => {
    for (const junk of [null, [], 'PASS', 42]) {
      expect(judge(junk).ok, String(junk)).toBe(false)
    }
  })

  it('깨진 JSON은 읽기에서 잡는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rp-evidence-'))
    try {
      writeFileSync(join(dir, SUITES['installed-e2e'].file), '{"results": [')
      const said = checkEvidence('installed-e2e', { auditDir: dir, artifact: ART, source: SRC })
      expect(said.ok).toBe(false)
      expect(said.detail).toContain('못 읽는다')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('파일이 없으면 「돌린 적 없다」다 — 통과가 아니다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rp-evidence-'))
    try {
      for (const suite of Object.keys(SUITES)) {
        expect(checkEvidence(suite, { auditDir: dir, artifact: ART, source: SRC }).ok, suite).toBe(false)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('봉투가 없는 옛 결과는 통과가 아니다', () => {
    const { schemaVersion: _drop, ...noEnvelope } = envelope()
    expect(oldVerdict(noEnvelope)).toBe(true)
    expect(judge(noEnvelope).detail).toContain('옛 결과')
  })
})

describe('무엇을 언제 어디서 쟀는지', () => {
  it('실행 환경을 안 적은 결과는 증거가 아니다', () => {
    for (const key of ['browser', 'os', 'gpu', 'backend']) {
      const env = envelope()
      delete env.environment[key]
      expect(judge(env).detail, key).toContain(key)
    }
  })

  it('잰 시각이 없거나 날짜가 아니면 막는다', () => {
    expect(judge(envelope({ testedAt: undefined })).ok).toBe(false)
    expect(judge(envelope({ testedAt: '언젠가' })).ok).toBe(false)
  })

  it('다른 묶음의 결과를 이 묶음의 통과로 읽지 않는다', () => {
    const env = envelope()
    env.scope.suite = 'story'
    expect(judge(env).detail).toContain('다른 묶음')
  })
})

describe('묶음마다 다른 것에 묶인다', () => {
  it('story·gpu-loss는 소스에, 브라우저 실측은 배포물에 묶인다', () => {
    // `story.mjs`·`gpuLoss.mjs`는 `startVite`로 돈다. 확인 지점이
    // `import.meta.env.DEV` 뒤라 배포 빌드에는 조각이 아예 없고, dist를 잰 적이 없다
    expect(SUITES.story.binds).toBe('source')
    expect(SUITES['gpu-loss'].binds).toBe('source')
    expect(SUITES['installed-e2e'].binds).toBe('artifact')
  })

  it('e2e는 소스가 바뀌어도 살아 있다 — dist를 띄워 재기 때문이다', () => {
    expect(validateEvidence(envelope(), 'installed-e2e',
      { artifact: ART, source: 'd'.repeat(64), harness: HARNESS, roster: E2E }).ok).toBe(true)
  })

  it('묶음마다 하네스 목록이 다르다 — 남의 도구 편집으로 죽지 않는다', () => {
    const story = new Set(SUITES.story.harness)
    expect(story.has('tools/e2e/story.mjs')).toBe(true)
    expect(story.has('tools/e2e/gpuLoss.mjs')).toBe(false)
    expect(SUITES['gpu-loss'].harness).toContain('tools/e2e/gpuLoss.mjs')
  })
})

describe('무엇이 게임 소스인가', () => {
  // ⚠️ **HEAD 문자열로 판정하면 문서 한 줄에 35분짜리 브라우저 검사가 다시 온다.**
  // 문서 전용 커밋은 빌드를 다시 안 굽는 것이 정책이라(DEPLOY.md), 재야 하는
  // 것은 커밋이 아니라 게임 산출물이다
  it('소스 지문에 docs가 안 든다', () => {
    const listed = sourceFiles()
    expect(listed).not.toBeNull()
    expect(listed.some((f) => f.startsWith('docs/'))).toBe(false)
    expect(listed.some((f) => f.startsWith('src/'))).toBe(true)
    expect(listed).toContain('pnpm-lock.yaml')
  })

  it('하네스(tools)를 고쳐도 소스 지문은 안 죽는다 — 그쪽은 harnessDigest가 센다', () => {
    expect(sourceFiles().some((f) => f.startsWith('tools/'))).toBe(false)
  })

  it('아직 커밋 안 한 앱 파일도 지문에 든다 (기획서 §3.1)', () => {
    // ⚠️ 판 1은 `git ls-files`만 봐서 **새로 만든 파일이 지문 밖**이었다 —
    // 실측으로 `rendererStore.ts`·`RendererTrouble.tsx`가 그랬다. 개발 중에
    // 제일 잦은 편집이 증거를 안 죽인다는 뜻이라 제일 나쁜 갈래였다
    const listed = sourceFiles()
    const app = listed.filter((f) => f.startsWith('src/') && f.endsWith('.ts'))
    expect(app.length).toBeGreaterThan(100)
    // 이 시험 파일이 사는 나무에서 실제로 추적 여부와 무관하게 다 든다는 것을
    // 보이려면 목록이 `git status`의 새 파일까지 덮어야 한다
    expect(listed).toContain('src/state/rendererStore.ts')
  })

  it('추출물이 소스 목록에 섞이면 지문을 아예 안 낸다', () => {
    // ⚠️ 걸러 내고 넘어가면 무시 규칙이 느슨해진 날을 아무도 모른다
    expect(strayExtracts(['src/app/App.tsx', 'public/data/encounters.json']))
      .toEqual(['public/data/encounters.json'])
    expect(strayExtracts(sourceFiles())).toEqual([])
  })

  it('buildId가 지금 HEAD와 달라도 지문이 같으면 통과다', () => {
    expect(judge(envelope({ buildId: '6c5e534' })).ok).toBe(true)
    expect(judge(envelope({ buildId: '58c9284' })).ok).toBe(true)
    // 다만 **어느 빌드 곁에서 쟀는지**는 적혀 있어야 한다
    expect(judge(envelope({ buildId: null })).ok).toBe(false)
  })
})

describe('하네스가 씌우는 봉투', () => {
  it('sealEvidence가 낸 것을 validateEvidence가 받는다', () => {
    // 소스에 묶이는 묶음으로 돈다 — dist가 없는 나무에서도 값이 정해진다
    const start = bindingDigest('story')
    const sealed = sealEvidence({
      suite: 'story',
      expectedCases: STORY.cases,
      executedCases: STORY.cases,
      startDigest: start,
      environment: { ...WHERE },
      results: STORY.cases.map((id) => ({ id, what: `자리 ${id}`, status: 'PASS', detail: '' })),
    })
    expect(sealed.schemaVersion).toBe(EVIDENCE_SCHEMA)
    expect(sealed.contractVersion).toBe(SUITES.story.contract)
    const said = validateEvidence(sealed, 'story', {
      artifact: sealed.artifactDigest,
      source: sealed.sourceDigest,
      harness: sealed.harnessDigest,
      roster: STORY,
    })
    expect(said.detail ?? '').toBe('')
    expect(said.ok).toBe(true)
  })

  it('FAIL·BLOCKED·NOT RUN은 그대로 막힌다 — 종료 0이라도 아니다', () => {
    for (const status of ['FAIL', 'BLOCKED', 'NOT RUN']) {
      const env = envelope()
      env.results[2].status = status
      expect(oldVerdict(env), status).toBe(false)
      expect(judge(env).detail, status).toContain(status)
    }
  })

  it('장치 손실도 같은 봉투를 쓴다 — BLOCKED 하나로 떨어진다 (기획서 §3.3)', () => {
    const roster = rosterOf('gpu-loss')
    const rows = roster.cases.map((id) => ({ id, what: `시험 ${id}`, status: 'PASS', detail: '' }))
    rows[4].status = 'BLOCKED'
    const env = {
      ...envelope(),
      contractVersion: SUITES['gpu-loss'].contract,
      rosterDigest: roster.digest,
      scope: {
        suite: 'gpu-loss', selection: 'all',
        expectedCases: roster.cases, executedCases: roster.cases, startDigest: SRC,
      },
      results: rows,
    }
    const said = validateEvidence(env, 'gpu-loss',
      { artifact: ART, source: SRC, harness: HARNESS, roster })
    expect(said.ok).toBe(false)
    expect(said.detail).toContain('BLOCKED')
  })
})

describe('대표 구간의 정본 목록', () => {
  it('열일곱 자리이고, 하네스가 아니라 판정기가 갖고 있다', () => {
    const roster = rosterOf('journey')
    expect(roster.cases).toHaveLength(17)
    expect(roster.from).toBe('tools/distribution/evidence.mjs')
  })

  it('「그려졌는가」와 「콘솔이 조용한가」가 목록 안에 있다', () => {
    // ⚠️ 이 둘이 밖에 있으면 **검은 화면으로 완주한 판**이 완주로 통과한다.
    // 걸어 닿은 자리 넷(08~11)만 세면 그 판은 PASS 열둘로 보인다
    const roster = rosterOf('journey')
    expect(roster.cases).toContain('15')
    expect(roster.cases).toContain('16')
  })

  it('소스에 묶인다 — 개발 서버에서 돌기 때문이다', () => {
    expect(SUITES.journey.binds).toBe('source')
    expect(SUITES.journey.harness).toContain('tools/e2e/journey.mjs')
    expect(SUITES.journey.harness).not.toContain('tools/e2e/gpuLoss.mjs')
  })

  it('하나라도 빠뜨린 봉투는 통과가 아니다', () => {
    const roster = rosterOf('journey')
    const short = roster.cases.filter((id) => id !== '15')
    const env = sealEvidence({
      suite: 'journey',
      expectedCases: short,
      executedCases: short,
      startDigest: bindingDigest('journey'),
      environment: { browser: 'Chromium 151', os: 'win 10', gpu: 'Arc', backend: 'WebGPUBackend' },
      results: short.map((id) => ({ id, what: id, status: 'PASS', detail: '' })),
    })
    expect(validateEvidence(env, 'journey', {
      artifact: env.artifactDigest, source: env.sourceDigest,
      harness: env.harnessDigest, roster,
    }).detail).toContain('정본과 다르다')
  })
})
