// **`performance.measure`를 감싸 터진 것만 적는 자** — `_perf42`와 `_land42`가 같이 쓴다.
//
// ⚠️ **하네스 쪽 `addInitScript`고 제품 코드가 아니다.** 배포물에는 이 줄이 없다.
//
// ⚠️ **진단이 새 문제를 만들면 안 된다** (후속 §7). 세 가지를 지킨다:
//
//   ① **원래 오류를 그대로 다시 던진다.** 적는 일이 실패해도 마찬가지다 —
//      예전에는 기록을 만드는 코드가 `catch` 안에 있어서, getter나 proxy가
//      거기서 터지면 `throw e`에 닿지도 못하고 **다른 오류**가 나갔다.
//      원래 오류를 덮는 진단은 진단이 아니다.
//   ② **첫 실패만 무겁게 판다.** 이름·타입·prop 이름 같은 **싼 것**은 스무
//      번까지 적고, `structuredClone`을 잎마다 걸어 보는 **비싼 것**은 첫
//      실패 하나에만 한다. 깊이·개수 상한만으로는 비용이 안 잡힌다.
//   ③ **안 본 것을 봤다고 안 한다.** 자식을 24개까지만 보므로, 나쁜 아이가
//      그 뒤에 있으면 「자식은 다 되는데 저가 안 된다」가 거짓이다 —
//      잘렸으면 `truncated`를 적고 **범인으로 확정하지 않는다.**

export const SPY = () => {
  const w = window
  w.__perfSpy = { calls: 0, fails: [], probeErrors: [] }
  const was = performance.measure.bind(performance)

  const kindOf = (v) => {
    if (v === null) return 'null'
    const t = typeof v
    if (t !== 'object' && t !== 'function') return t
    if (t === 'function') return 'function'
    if (Array.isArray(v)) return `array(${String(v.length)})`
    // ⚠️ **생성자를 읽는 것도 터질 수 있다** (proxy). 그때도 답은 있어야 한다
    try { return v.constructor?.name ?? 'Object' } catch { return '읽다 터진 객체' }
  }

  /** detail 한 겹의 타입 요약. **값을 안 찍는다** */
  const summarize = (detail) => {
    if (detail === null || typeof detail !== 'object') return kindOf(detail)
    const out = {}
    for (const [k, v] of Object.entries(detail).slice(0, 32)) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        const inner = {}
        for (const [k2, v2] of Object.entries(v).slice(0, 32)) inner[k2] = kindOf(v2)
        out[k] = inner
      } else out[k] = kindOf(v)
    }
    return out
  }

  /**
   * 처음 복제를 막은 자리를 찾는다 — **첫 실패에만 쓴다.**
   *
   * 값을 찍는 것이 아니라 「되는가 안 되는가」만 묻는다. 그래도 `structuredClone`
   * 자체가 큰 가지를 통째로 복제하므로 **부르는 횟수에 상한을 둔다**
   */
  const findCulprit = (root) => {
    const seen = new WeakSet()
    const bad = []
    let clones = 0
    const clonable = (v) => {
      if (clones >= 200) return null
      clones++
      try { structuredClone(v); return true } catch { return false }
    }
    const walk = (v, path, depth) => {
      if (bad.length >= 5 || depth > 6) return
      const ok = clonable(v)
      if (ok === null) { bad.push({ path, kind: kindOf(v), gaveUp: '복제 시도 상한' }); return }
      if (ok === true) return
      if (v === null || typeof v !== 'object') { bad.push({ path, kind: kindOf(v) }); return }
      if (seen.has(v)) return
      seen.add(v)
      const all = Array.isArray(v) ? v.map((x, i) => [String(i), x]) : Object.entries(v)
      const entries = all.slice(0, 24)
      const truncated = all.length > entries.length
      let split = false
      for (const [k, child] of entries) {
        if (clonable(child) !== false) continue
        split = true
        walk(child, `${path}.${k}`, depth + 1)
      }
      if (!split) {
        // ⚠️ **잘렸으면 「저 자신이 범인」이라고 못 한다** — 안 본 아이가 있다
        bad.push({
          path, kind: kindOf(v), keys: entries.map(([k]) => k).slice(0, 12),
          ...(truncated
            ? { truncated: all.length, verdict: `자식 ${String(all.length)}개 중 24개만 봤다 — 미확정` }
            : { verdict: '자식은 다 되는데 저가 안 된다' }),
        })
      }
    }
    walk(root, 'detail', 0)
    return bad
  }

  /** 리컨사일러가 싣는 `[prop 이름, 값]` 줄. **이름이 곧 답이라 글자를 안 접는다** */
  const propNames = (detail) => {
    const p = detail?.devtools?.properties
    if (!Array.isArray(p)) return null
    const cell = (v) => (typeof v === 'string' ? v.slice(0, 60) : kindOf(v))
    return p.slice(0, 24).map((row) => (Array.isArray(row) ? row.map(cell) : cell(row)))
  }

  performance.measure = function patched(name, options, end) {
    w.__perfSpy.calls += 1
    try {
      return end === undefined ? was(name, options) : was(name, options, end)
    } catch (e) {
      // ⚠️ **여기서부터가 진단이다. 무엇이 나든 아래의 `throw e`가 이긴다**
      try {
        if (w.__perfSpy.fails.length < 20) {
          const detail = options?.detail ?? null
          const row = {
            name: String(name).replace(/\u200b/g, '').slice(0, 80),
            why: String(e?.message ?? e).slice(0, 160),
            marks: { ...document.documentElement.dataset },
          }
          // 싼 것부터 적는다 — 하나가 터져도 앞의 것은 남는다
          try { row.detail = summarize(detail) } catch (x) { row.detail = `요약이 터졌다: ${String(x?.message ?? x).slice(0, 80)}` }
          try {
            row.stack = String(e?.stack ?? new Error('perf').stack ?? '')
              .split(String.fromCharCode(10)).slice(1, 8).map((l) => l.trim()).join(' | ').slice(0, 600)
          } catch { row.stack = null }
          try { row.props = propNames(detail) } catch (x) { row.props = `prop을 못 읽었다: ${String(x?.message ?? x).slice(0, 80)}` }
          // ⚠️ **비싼 것은 첫 실패에만.** 나머지는 「안 팠다」로 남긴다
          if (w.__perfSpy.fails.length === 0) {
            try { row.culprit = findCulprit(detail) } catch (x) { row.culprit = `추적이 터졌다: ${String(x?.message ?? x).slice(0, 80)}` }
          } else row.culprit = '첫 실패에서만 판다'
          w.__perfSpy.fails.push(row)
        }
      } catch (probe) {
        // 진단이 통째로 실패해도 **원래 오류는 그대로 나간다**
        if (w.__perfSpy.probeErrors.length < 5) {
          w.__perfSpy.probeErrors.push(String(probe?.message ?? probe).slice(0, 160))
        }
      }
      throw e
    }
  }
}
