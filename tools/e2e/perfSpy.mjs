// **`performance.measure`를 감싸 터진 것만 적는 자** — `_perf42`와 `_land42`가 같이 쓴다.
//
// ⚠️ **하네스 쪽 `addInitScript`고 제품 코드가 아니다.** 배포물에는 이 줄이 없다.
// 원래 호출과 예외를 **그대로** 보존하고(삼키지 않는다), 적는 횟수에 상한을 둔다.

/**
 * **재는 자를 먼저 심는다.** 문서가 서기 전에 돌아야 첫 렌더의 측정까지 잡는다.
 *
 * 여기서 하는 일은 셋뿐이다 — 부른 횟수를 세고, **터진 것만** 이름과
 * detail 속성의 타입 요약을 적고, **오류를 그대로 다시 던진다.**
 * 거대한 객체를 다시 직렬화하지 않는다: 값이 아니라 `typeof`와 생성자 이름만 본다
 */
export const SPY = () => {
  const w = window
  w.__perfSpy = { calls: 0, fails: [] }
  const was = performance.measure.bind(performance)
  const kindOf = (v) => {
    if (v === null) return 'null'
    const t = typeof v
    if (t !== 'object' && t !== 'function') return t
    if (t === 'function') return 'function'
    if (Array.isArray(v)) return `array(${String(v.length)})`
    const name = v.constructor?.name ?? 'Object'
    return name
  }
  const summarize = (detail) => {
    if (detail === null || typeof detail !== 'object') return kindOf(detail)
    const out = {}
    for (const [k, v] of Object.entries(detail)) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        const inner = {}
        for (const [k2, v2] of Object.entries(v)) inner[k2] = kindOf(v2)
        out[k] = inner
      } else out[k] = kindOf(v)
    }
    return out
  }
  performance.measure = function patched(name, options, end) {
    w.__perfSpy.calls += 1
    try {
      return end === undefined ? was(name, options) : was(name, options, end)
    } catch (e) {
      if (w.__perfSpy.fails.length < 20) {
        w.__perfSpy.fails.push({
          name: String(name).replace(/​/g, '').slice(0, 80),
          why: String(e?.message ?? e).slice(0, 160),
          detail: summarize(options?.detail ?? null),
          /**
           * **누가 불렀는가.** 우리 코드에는 `performance.measure`가 한 줄도
           * 없다(실측: `src/`에 0건) — 그러니 부르는 쪽은 의존성이고, 그 이름이
           * 여기 찍힌다. 삼키지 않고 그대로 다시 던지므로 원래 오류는 남는다
           */
          stack: String(e?.stack ?? new Error('perf').stack ?? '')
            .split(String.fromCharCode(10)).slice(1, 8).map((l) => l.trim()).join(' | ').slice(0, 600),
          /** 그때 화면과 전환 — 특정 장면에서만 터지는지 가른다 */
          marks: { ...document.documentElement.dataset },
          /**
           * **실제로 복제를 막은 값까지 짚는다.**
           *
           * 타입 이름만으로는 「Object 안의 Object」에서 멎는다. 그래서
           * `structuredClone`을 **잎마다 한 번씩** 걸어 처음 터지는 길을 찾는다 —
           * 값을 찍는 것이 아니라 **되는가 안 되는가**만 묻는 것이라 큰 객체를
           * 다시 직렬화하지 않는다. 깊이와 개수에 상한을 둔다
           */
          culprit: (() => {
            const seen = new WeakSet()
            const bad = []
            const walk = (v, path, depth) => {
              if (bad.length >= 5 || depth > 6) return
              try { structuredClone(v); return } catch { /* 아래에서 쪼갠다 */ }
              if (v === null || typeof v !== 'object') {
                bad.push({ path, kind: kindOf(v) }); return
              }
              if (seen.has(v)) return
              seen.add(v)
              let split = false
              const entries = Array.isArray(v)
                ? v.slice(0, 24).map((x, i) => [String(i), x])
                : Object.entries(v).slice(0, 24)
              for (const [k, child] of entries) {
                try { structuredClone(child); continue } catch { /* 이 아이다 */ }
                split = true
                walk(child, `${path}.${k}`, depth + 1)
              }
              // 자식은 다 되는데 저는 안 된다 — 그 객체 자신이 범인이다
              if (!split) bad.push({ path, kind: kindOf(v), keys: entries.map(([k]) => k).slice(0, 12) })
            }
            walk(options?.detail ?? null, 'detail', 0)
            return bad
          })(),
          // 그 detail 안의 **속성 목록**이 범인을 가리킨다
          props: (() => {
            const p = options?.detail?.devtools?.properties
            if (!Array.isArray(p)) return null
            return p.slice(0, 12).map((row) => (Array.isArray(row)
              ? row.map((cell) => kindOf(cell))
              : kindOf(row)))
          })(),
        })
      }
      throw e
    }
  }
}
