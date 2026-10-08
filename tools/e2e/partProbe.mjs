/**
 * **탐침을 파트로 올린다** — `_dw`(P4) · `_league`(P5)가 같이 쓴다
 * (`docs/orders/JOURNEY_PARTS_20261008.md` §5).
 *
 * 탐침은 결과를 `shots/*\/실행.json`에만 남기고 늘 0으로 끝났다. `--part=N`으로 돌면
 *
 *   · 시작 세이브는 앞 파트의 끝 세이브와 그 옆의 하네스 기억이다 (`partStart`)
 *   · 다리 하나가 결과 줄 하나다 — 다리의 `reached()`가 그대로 판정이다
 *   · 마지막 다리의 리포트가 `part-N.rpsave`가 되고, 봉투는 `.audit/parts/part-N.json`이다
 *   · 못 닿으면 종료 코드 1이다
 *
 * 봉투 모양은 journey 파트 봉투와 같아 `parts-check.mjs`가 같은 눈으로 읽는다
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataDigest, sourceDigest } from '../distribution/evidence.mjs'
import { keepPartEnd, partEnvelope, partStart, PARTS_DIR } from './parts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * 파트 표 — 다리마다 결과 줄 번호와 이름. 번호대는 journey 정본(01~56 · 99)과 안 겹친다.
 * `candy`는 파트를 시작할 때 맞추는 레벨이다 — 탐침 판들이 통과한 값이다
 * (P4: `HANDOFF_20260923` 깨어진 세계 1F 78/76/76 · P5: `_league` 머리 주석 80/78/78)
 */
export const PROBE_PARTS = {
  4: {
    what: '배지 7 뒤 → 깨어진 세계 클리어', suite: 'dw', candy: '78,76,76',
    legs: { e: ['61', '예지호수 장면을 본다'], f: ['62', '갤럭시단 아지트에서 호수 셋을 풀어 준다'],
      g: ['63', '창기둥을 지나 깨어진 세계 1F에 든다'], h: ['64', '깨어진 세계를 지나 기라티나 방에 닿는다'],
      i: ['65', '기라티나를 잡고 송별의 샘으로 나온다'] },
    harness: ['tools/e2e/_dw.mjs', 'tools/e2e/badgesDW.mjs', 'tools/e2e/distortionSolve.mjs'],
  },
  5: {
    what: '→ 챔피언 · 전당등록', suite: 'league', candy: '80,78,78',
    legs: { j: ['71', '물가시티 톱니 체육관에서 여덟째 배지를 받는다'], k: ['72', '승리의 길을 지나 리그 남쪽 센터에 닿는다'],
      l: ['73', '챔피언로드를 지나 리그 북쪽 센터에서 라이벌을 이긴다'],
      m: ['74', '사천왕 · 난천을 이기고 전당에 오른 뒤 이어하기로 떡잎마을 침실에 선다'] },
    harness: ['tools/e2e/_league.mjs', 'tools/e2e/badgesLeague.mjs'],
  },
}

/** 이 파트를 재는 도구의 지문 — 공용 걸음(drive · observe · route)과 파트 표까지 */
const COMMON = ['tools/e2e/drive.mjs', 'tools/e2e/observe.mjs', 'tools/e2e/route.mjs', 'tools/e2e/parts.mjs',
  'tools/e2e/partProbe.mjs', 'tools/devServer.mjs', 'tools/gpuFlags.mjs']
const harnessOf = (files) => {
  const h = createHash('sha256')
  for (const rel of [...files, ...COMMON].sort()) {
    const at = resolve(ROOT, rel)
    h.update(`${rel}\0${existsSync(at) ? createHash('sha256').update(readFileSync(at)).digest('hex') : 'absent'}\0`)
  }
  return h.digest('hex')
}

/** `--part=N`을 읽어 시작점을 낸다. 파트가 아니면 null */
export function probePartStart(n, saveFlag) {
  const def = PROBE_PARTS[n]
  if (def === undefined) throw new Error(`--part=${String(n)} — 이 탐침이 도는 파트가 아니다`)
  const start = partStart(n, saveFlag)
  if (!start.ok) throw new Error(`파트 ${String(n)}을 못 시작한다 — ${start.why.join(' · ')}`)
  console.log(`  파트 ${String(n)} — ${def.what} · 시작 세이브 ${String(start.save)} (${String(start.digest)})`)
  for (const w of start.why) console.log(`  ⚠️ 이 판은 **진단**이다 — ${w}`)
  return { def, start, dataAtStart: dataDigest(), t0: Date.now() }
}

/**
 * 봉투를 쓴다. `legsRun`은 다리 글자 → `{ reached, detail }`, `end`는 마지막 다리가 남긴
 * `{ file, memory, at }`(못 닿았으면 null)다. 돌려준 값이 종료 코드다
 */
export function sealProbePart(n, ctx, { legsRun, end, crash = null, extra = {} }) {
  const { def, start, dataAtStart, t0 } = ctx
  const expected = Object.values(def.legs).map(([id]) => id)
  const results = []
  for (const [leg, [id, what]] of Object.entries(def.legs)) {
    const r = legsRun[leg]
    if (r === undefined) continue // 앞 다리에서 멈췄다 — 줄을 안 만들고 미실행으로 남긴다
    results.push({ id, what, status: r.reached ? 'PASS' : 'FAIL', detail: r.detail })
  }
  const digest = end !== null && existsSync(resolve(ROOT, end.file))
    ? keepPartEnd(n, resolve(ROOT, end.file), end.memory, end.at) : null
  const allLegs = results.length === expected.length && results.every((r) => r.status === 'PASS')
  const data = dataDigest()
  const env = {
    suite: `part-${def.suite}`,
    sourceDigest: sourceDigest(),
    dataDigest: data,
    dataChangedDuringRun: dataAtStart !== data,
    harnessDigest: harnessOf(def.harness),
    testedAt: new Date().toISOString(),
    ms: Date.now() - t0,
    scope: { suite: `part-${def.suite}`, selection: `part-${String(n)}`, expectedCases: expected,
      executedCases: results.map((r) => r.id), shortcuts: [] },
    results,
    crash,
    part: {
      n, what: def.what, startSave: start.save, startSaveDigest: start.digest ?? null,
      startDiagnostic: start.diagnostic, startWhy: start.why,
      endSaveDigest: digest, at: end?.at ?? null,
      // journey 파트와 같은 칸 — 이 파트의 경계는 배지 수가 아니라 다리 끝이다
      badges: end?.at?.badges ?? null, wantBadges: null, healed: true, healWhy: null,
      ok: allLegs && digest !== null && crash === null,
    },
    ...extra,
  }
  mkdirSync(PARTS_DIR, { recursive: true })
  writeFileSync(partEnvelope(n), `${JSON.stringify(env, null, 1)}\n`)
  console.log(`\n  파트 ${String(n)} 끝 — ${env.part.ok ? '통과' : '못 닿았다'} · 줄 ${String(results.length)}/${String(expected.length)}`
    + ` · 끝 세이브 ${String(digest)} · ${partEnvelope(n)}`)
  return env.part.ok ? 0 : 1
}
