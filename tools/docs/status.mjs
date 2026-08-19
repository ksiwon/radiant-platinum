// 남은 일을 한 장으로 모은다 — `docs/STATUS.md`를 **만든다**
//
//     node tools/docs/status.mjs           대장을 다시 쓴다
//     node tools/docs/status.mjs --check   커밋된 것과 맞대 본다 (시험이 이걸 쓴다)
//
// ⚠️ **손으로 적는 목록을 하나 더 만들지 않는다.** DEPLOY.md가 blocker 목록에
// 적어 둔 말이 그대로 여기에도 맞는다 — 「손으로 지우는 목록은 일이 끝나서가
// 아니라 잊혀서 비워진다」. 그래서 이 도구는 **임자 문서에 이미 있는 표식만
// 긁어 온다.** 대장에 줄을 더하고 싶으면 임자 문서를 고쳐야 하고, 임자 문서에서
// 일이 끝나면 대장에서도 저절로 빠진다.
//
// 임자와 표식:
//
//   배포 blocker   `tools/distribution/blockers.mjs`의 `BLOCKERS` (id·why·where)
//   우리가 어긋낸 것 `docs/REPAIR.md` §0 표
//   원작 대비       `docs/PARITY.md`의 `◐`·`✖` 행
//   화면에 안 서는 것 `docs/3D_GAP_AUDIT.md` §5의 `- [ ]`
//   알고 남긴 것    `docs/PLAN.md` §16.10 표
//
// ⚠️ **지금 상태(통과·실패)는 안 적는다.** blocker의 `resolved()`는 `dist/`와
// `.audit/`을 읽는데 그 둘은 기계마다 다르고 저장소에 없다 — 그것을 대장에
// 적으면 파일이 기계마다 달라져서 시험이 못 맞댄다. **무엇이 걸려 있는지**만
// 적고, 지금 어느 것이 열려 있는지는 `pnpm release:check`가 그 자리에서 잰다.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BLOCKERS } from '../distribution/blockers.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const AT = resolve(ROOT, 'docs/STATUS.md')

const read = (name) => readFileSync(resolve(ROOT, 'docs', name), 'utf8')

/** 표 한 줄을 칸으로. 앞뒤 빈 칸은 버린다 */
function cells(line) {
  return line.split('|').slice(1, -1).map((c) => c.trim())
}

/** 그 문서에서 표 하나를 집는다 — 머리글이 `head`와 같은 표의 몸통 줄들 */
function tableAfter(text, head) {
  const lines = text.split(/\r?\n/)
  const at = lines.findIndex((l) => l.trim() === head)
  if (at < 0) throw new Error(`표 머리글을 못 찾았다: ${head}`)
  const out = []
  // 머리글 다음 줄이 구분선이고 그다음부터 몸통이다
  for (let i = at + 2; i < lines.length && lines[i]?.startsWith('|'); i++) {
    out.push(cells(lines[i]))
  }
  if (out.length === 0) throw new Error(`표가 비어 있다: ${head}`)
  return out
}

/** `**굵게**`·링크·각주 같은 꾸밈을 벗긴다 — 한 줄 표에 들어갈 글로 */
function plain(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── 임자마다 긁어 오기 ───────────────────────────────────────────────────────

/** 공개 배포를 막는 자리. 지금 열렸는지는 `pnpm release:check`가 잰다 */
function blockers() {
  return BLOCKERS.map((b) => ({ what: plain(b.why), where: plain(b.where) }))
}

/**
 * 우리가 만든 자리가 어긋난 것 (REPAIR.md §0).
 *
 * ⚠️ **그 문서는 다 하면 지운다** — 제 머리말에 그렇게 적혀 있다. 없으면 이
 * 갈래가 비는 것이 맞고, 여기서 터지면 안 된다
 */
function repair() {
  let text
  try { text = read('REPAIR.md') } catch { return [] }
  return tableAfter(text, '| | 무엇이 어긋났나 | 값 | 순서 |')
    .map(([id, what, size, order]) => ({
      id: plain(id), what: plain(what), size: plain(size), order: plain(order),
    }))
}

/** 원작에 있는데 우리는 반쯤이거나 없는 것 (PARITY.md) */
function parity() {
  const out = []
  for (const line of read('PARITY.md').split(/\r?\n/)) {
    const m = /^\|\s*([0-9]+\.[0-9]+)\s+([^|]*?)\s*\|\s*(◐|✖)\s*\|(.*)$/.exec(line)
    if (!m) continue
    // ⚠️ **절마다 칸 수가 다르다.** §1은 「원작 | 우리」 넷이고 §6은 셋이다.
    // **마지막 빈칸 아닌 칸**이 늘 우리 쪽 이야기라 그것을 집는다
    const rest = (m[4] ?? '').split('|').map(plain).filter((c) => c !== '')
    out.push({ id: `§${m[1]}`, what: plain(m[2]), state: m[3], said: rest[rest.length - 1] ?? '' })
  }
  return out
}

/** 화면에 아직 안 서는 것 (3D_GAP_AUDIT.md §5) */
function gaps() {
  const lines = read('3D_GAP_AUDIT.md').split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.startsWith('- [ ]')) continue
    // 이어지는 들여쓴 줄까지가 한 항목이다
    let text = lines[i].slice(5)
    for (let j = i + 1; j < lines.length && /^ {2,}\S/.test(lines[j] ?? ''); j++) {
      text += ` ${lines[j]}`
    }
    out.push(plain(text))
  }
  return out
}

/** 알고 남겨 둔 것 (PLAN.md §16.10) */
function known() {
  return tableAfter(read('PLAN.md'), '| | 크기 | 다음에 할 일 |')
    .map(([what, size, next]) => ({ what: plain(what), size: plain(size), next: plain(next) }))
}

// ── 대장 쓰기 ────────────────────────────────────────────────────────────────

function render() {
  const b = blockers(), r = repair(), p = parity(), g = gaps(), k = known()
  const half = p.filter((x) => x.state === '◐').length
  const none = p.filter((x) => x.state === '✖').length

  const out = []
  const say = (...lines) => out.push(...lines)

  say(
    '# 남은 일 — 한 장',
    '',
    '⚠️ **이 파일은 손으로 고치지 않는다.** `tools/docs/status.mjs`가 임자 문서의',
    '표식을 긁어 만든다 (`pnpm status`). 줄을 더하거나 지우려면 **임자 문서**를',
    '고친다 — 그러면 여기가 따라온다. 어긋나면 `pnpm check`가 선다.',
    '',
    '왜 생성물인가: 손으로 적는 목록은 **일이 끝나서가 아니라 잊혀서** 비워진다',
    '([DEPLOY.md](DEPLOY.md) §1이 blocker 목록에 같은 말을 적어 두었다).',
    '',
    '| 갈래 | 남은 수 | 임자 |',
    '|---|---:|---|',
    `| 공개 배포를 막을 수 있는 자리 | 재는 자리 ${b.length} | [DEPLOY.md](DEPLOY.md) §1 |`,
    `| 우리가 만든 자리가 어긋난 것 | ${r.length} | [REPAIR.md](REPAIR.md) |`,
    `| 원작 대비 반쯤 · 없음 | ${half} · ${none} | [PARITY.md](PARITY.md) |`,
    `| 화면에 아직 안 서는 것 | ${g.length} | [3D_GAP_AUDIT.md](3D_GAP_AUDIT.md) §5 |`,
    `| 알고 남겨 둔 것 | ${k.length} | [PLAN.md](PLAN.md) §16.10 |`,
    '',
    '⚠️ **지금 무엇이 열려 있는지는 여기서 안 잰다.** blocker는 각자 `resolved()`로',
    '`dist/`와 `.audit/`을 읽는데 그 둘은 기계마다 다르고 저장소에 없다 — 그것을',
    '여기 적으면 파일이 기계마다 달라진다. 지금 상태는 `pnpm release:check`가',
    '그 자리에서 잰다.',
    '',
    '---',
    '',
    '## 1. 공개 배포를 막을 수 있는 자리',
    '',
    '**아홉이 다 열려 있다는 뜻이 아니다.** 각자 `resolved()`로 그 자리에서 재고,',
    '재서 풀렸으면 스스로 빠진다 (`tools/distribution/blockers.mjs`). 지금 몇 개가',
    '열려 있는지는 `pnpm release:check` 한 줄로 나온다.',
    '',
    '| 무엇이 막을 수 있는가 | 근거 |',
    '|---|---|',
  )
  for (const x of b) say(`| ${x.what} | ${x.where} |`)

  say(
    '',
    '## 2. 우리가 만든 자리가 어긋난 것',
    '',
    '원작에 없던 것을 우리가 만들면서 어긋난 자리다. 다 하면 임자 문서가 비고,',
    '빈 문서는 지운다.',
    '',
  )
  if (r.length === 0) say('다 했다 — 임자 문서를 지웠다.')
  else {
    say('| | 무엇이 어긋났나 | 값 | 순서 |', '|---|---|---|---|')
    for (const x of r) say(`| ${x.id} | ${x.what} | ${x.size} | ${x.order} |`)
  }

  say(
    '',
    '## 3. 원작에 있는데 우리는 반쯤인 것',
    '',
    '`✖`(없음)이 하나도 없다 — 남은 것은 전부 **반쯤**이다.',
    '',
    '| | 무엇 | 어디까지 됐나 |',
    '|---|---|---|',
  )
  for (const x of p) say(`| ${x.id} | ${x.what} | ${x.said.slice(0, 150)} |`)

  say(
    '',
    '## 4. 화면에 아직 안 서는 것',
    '',
    '「기능이 있는가」가 아니라 **「플레이 중 화면에 실제로 3D로 서는가」**다.',
    '',
  )
  for (const x of g) say(`- ${x}`)

  say(
    '',
    '## 5. 알고 남겨 둔 것',
    '',
    '**「언젠가」가 아니라 무엇을 재면 되는지까지** 적힌 것들이다. 뒤의 셋은',
    '헤드리스로는 이득을 못 재므로 **실기에서 모자랄 때** 여는 자리다.',
    '',
    '| 무엇 | 크기 | 다음에 할 일 |',
    '|---|---|---|',
  )
  for (const x of k) say(`| ${x.what} | ${x.size} | ${x.next} |`)

  say(
    '',
    '## 6. 여기 안 세는 것',
    '',
    '| 무엇 | 왜 |',
    '|---|---|',
    '| [BUGS.md](BUGS.md) | 「할 일」이 아니라 **옮기면 안 되는 것**이다. §2는 그 계통을 만들 때 먼저 보는 표다 |',
    '| [VR.md](VR.md) | **검토**고 아무것도 안 정했다. 하기로 하면 그때 이 대장에 들어온다 |',
    '| [HISTORY.md](HISTORY.md) | 끝난 일의 기록이다 (blocker ⑨의 근거) |',
    '| [SIWON.md](SIWON.md) | 원작 재현이 아니라 우리가 덧붙인 것 |',
    '| PARITY.md §9 | **범위 밖**으로 정한 것 — 통신·콘테스트·지하통로 |',
    '',
  )
  return `${out.join('\n')}\n`
}

const made = render()
if (process.argv.includes('--check')) {
  let had
  try { had = readFileSync(AT, 'utf8') } catch { had = null }
  if (had !== made) {
    console.error('docs/STATUS.md가 임자 문서와 어긋난다 — `pnpm status`로 다시 쓴다')
    process.exit(1)
  }
  console.log('docs/STATUS.md가 임자 문서와 같다')
} else {
  writeFileSync(AT, made)
  console.log(`docs/STATUS.md — ${made.split('\n').length}줄`)
}
