// 대표 구간을 **구간별로 이어 달리기** — 다만 신원이 같을 때만 (검토 지시 4)
//
// ⚠️ **진단을 빠르게 하려고 두는 것이다.** 최종 판정용 `journey`는 **새 게임부터**
// 정상 진행으로 돈다. 여기서 건너뛴 단계는 **미실행**이고, 전체 PASS에 안 보탠다
// (`journey.mjs`가 `executedCases`를 **실제로 밟은 줄**에서 뽑으므로 저절로 그렇게
// 된다 — 건너뛴 줄은 결과에 아예 안 들어간다).
//
// ⚠️ **「검증됐다」는 그때 그 신원에서 검증됐다는 뜻이다.** 실측(2026-09-08):
// `sim/session.ts`의 한 줄이 **모든 배틀**에 걸렸다 — 앞 구간을 「이미 통과했으니」로
// 건너뛰었다면 그 버그를 못 봤다. 그래서 소스만이 아니라 **세이브·하네스·데이터·
// 그 단계의 전제**까지 함께 확인하고, 하나라도 다르면 **조용히 전체를 돈다.**
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dataDigest, harnessDigest, sourceDigest } from '../distribution/evidence.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const DIR = resolve(ROOT, '.audit/journey')
const BOOK = resolve(DIR, 'segments.json')

/** 파일 하나의 내용 지문. 없으면 null */
function digestOf(path) {
  const at = resolve(ROOT, path)
  if (!existsSync(at)) return null
  return createHash('sha256').update(readFileSync(at)).digest('hex').slice(0, 16)
}

/**
 * 이 구간이 **어떤 세상에서** 검증됐는가.
 *
 * 셋을 다 적는다 — 하나만 봐서는 못 막는다:
 *
 * · `source`  게임 소스 (`sourceDigest`) — 배틀·화면·규칙이 다 여기 걸린다
 * · `harness` 검사 하네스 (`harnessDigest('journey')`) — 재는 자가 바뀌면 값도 바뀐다
 * · `data`    `public/data` **나무 전체** — 아래 ⚠️
 * · `save`    이어 달릴 세이브 파일 그 자체 (`writeSegment`가 덧붙인다)
 *
 * ⚠️ **`sourceDigest`는 `public/data/`를 일부러 뺀다.** 원본 유래 추출물이라
 * 지문에 경로가 실리면 안 된다는 규칙이다(`evidence.mjs`의 `NEVER_SOURCE`).
 * 그래서 **자료 쪽은 여기서 따로 세야 한다.** 한때 이 자리가 `events.json`과
 * `maps.json` 두 파일뿐이었는데, 그러면 단계의 전제가 걸려 있는
 * **`matrices/`(격자)와 `scripts.bin`(롬 스크립트)이 어느 지문에도 안 들어간다** —
 * 격자 한 칸이나 스크립트 한 줄이 바뀌어도 「같은 세상」으로 읽혔다. 골라 담으면
 * 언젠가 또 빠지므로 **나무를 통째로** 센다 (실측 69MB · 한 번에 1초 안쪽).
 */
export function identityNow() {
  return {
    source: sourceDigest(),
    harness: harnessDigest('journey'),
    // 봉투(`sealEvidence`)가 적는 것과 **같은 자**다 — 둘이 갈라지면 뜻을 잃는다
    data: dataDigest(),
  }
}

/** 적어 둔 구간들. 파일이 없거나 깨졌으면 빈 목록이다 */
export function readSegments() {
  if (!existsSync(BOOK)) return { segments: [] }
  try {
    const one = JSON.parse(readFileSync(BOOK, 'utf8'))
    return Array.isArray(one.segments) ? one : { segments: [] }
  } catch { return { segments: [] } }
}

/**
 * 구간 하나를 적는다 — **정상 진행으로 그 자리에 선 판에서만** 불린다.
 *
 * @param id      그 구간의 이름 (`AFTER_STOPS`의 `id`와 같은 글자)
 * @param save    그 자리에서 정상 UI로 쓴 리포트 파일 (repo 상대 경로)
 * @param at      그때 선 자리 · 이야기 전제 (다음 판이 같은 자리에서 이어졌는지 볼 값)
 */
export function writeSegment(id, save, at) {
  mkdirSync(DIR, { recursive: true })
  const book = readSegments()
  const one = {
    id,
    save,
    at,
    verifiedAt: new Date().toISOString(),
    identity: { ...identityNow(), save: digestOf(save) },
  }
  book.segments = [...book.segments.filter((x) => x.id !== id), one]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  writeFileSync(BOOK, `${JSON.stringify(book, null, 1)}\n`)
  return one
}

/**
 * `--from=<id>`로 이어 달려도 되는가.
 *
 * ⚠️ **되는 쪽보다 안 되는 쪽을 정확히 말한다.** 「신원이 다르다」로만 적으면
 * 다음 사람이 무엇이 바뀌었는지 다시 찾아야 한다 — 어느 값이 어떻게 달라졌는지
 * 그대로 돌려준다
 *
 * @returns `{ ok, segment, why }`
 */
export function resumableAt(id) {
  const book = readSegments()
  const one = book.segments.find((x) => x.id === id)
  if (one === undefined) return { ok: false, segment: null, why: `구간 ${id}을 적어 둔 적이 없다` }
  if (!existsSync(resolve(ROOT, one.save))) {
    return { ok: false, segment: one, why: `세이브가 없다 (${one.save})` }
  }
  const now = { ...identityNow(), save: digestOf(one.save) }
  const drift = []
  for (const key of ['source', 'harness', 'data', 'save']) {
    if (one.identity[key] !== now[key]) {
      drift.push(`${key} ${String(one.identity[key])} → ${String(now[key])}`)
    }
  }
  if (drift.length > 0) {
    return { ok: false, segment: one, why: `신원이 달라졌다 — ${drift.join(' · ')}` }
  }
  return { ok: true, segment: one, why: '' }
}
