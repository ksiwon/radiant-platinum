// **그림이 어디서 태어나는가** — `geoSpy`와 같은 길, 대상만 `Texture`다 (후속 §5).
//
// ⚠️ **기하를 닫았다고 그림이 닫힌 것이 아니다.** 실측(2026-09-09 `_land42`,
// 축복시티↔축복 포켓몬센터 22왕복): 기하는 맵 3에서 177, 맵 6에서 157로
// **9바퀴 내내 평평**한데 그림은 250→364 · 175→266으로 **전환마다 +11**씩
// 올랐다. 수만으로는 누가 만들었는지를 못 짚으므로 만든 자리를 받아 적는다.
//
// ⚠️ **객체를 붙잡지 않는다.** 남기는 것은 스택 글 한 줄과 수뿐이다.
//
// 어떻게: three의 `Texture` 생성자가 `this.uuid = …`를 쓴다. 그 프로토타입에
// 접근자를 걸면 새로 태어나는 것마다 손이 닿는다 — 이미 있는 것은 제 프로퍼티를
// 들고 있어 안 걸리므로, **예열 뒤에 걸면 그 뒤의 증가만** 센다.

export const armTexSpy = async (page, keepStacks = 40) => page.evaluate(async (keep) => {
  const w = window
  if (w.__texSpy) return { already: true, ...w.__texSpy.summary() }
  const refs = await import('/src/scene/sceneRefs.ts')
  const scene = refs.sceneRefs.stage.scene
  if (!scene) return { error: '무대를 못 찾았다' }
  /**
   * 아무 재질의 그림에서 `Texture` 프로토타입까지 올라간다.
   *
   * ⚠️ **`DataTexture`에서 시작해도 된다** — 상속 사슬을 타고 올라가면
   * `Texture`가 나온다. 거기 걸어야 파생 클래스까지 한 번에 잡힌다
   */
  let proto = null
  scene.traverse((o) => {
    if (proto || o.isMesh !== true) return
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      const t = m?.map
      if (!t) continue
      let p = Object.getPrototypeOf(t)
      while (p && p.constructor?.name !== 'Texture') p = Object.getPrototypeOf(p)
      if (p) { proto = p; return }
    }
  })
  if (!proto) return { error: '그림을 문 재질을 하나도 못 찾았다' }

  const born = new Map()
  const freed = new Map()
  const place = (skip) => {
    const lines = String(new Error().stack ?? '').split('\n').slice(skip, skip + 6)
    return lines.map((l) => l.trim().replace(/^at\s+/, '').replace(/\?[a-z0-9=&_-]+/gi, ''))
      .filter((l) => l && !l.includes('__texSpy')).slice(0, 6).join(' ← ')
  }
  const bump = (m, k) => { m.set(k, (m.get(k) ?? 0) + 1) }

  const hidden = new WeakMap()
  Object.defineProperty(proto, 'uuid', {
    configurable: true,
    get() { return hidden.get(this) ?? '' },
    set(v) {
      if (!hidden.has(this)) { const at = place(3); hidden.set(this, v); this.__bornAt = at; bump(born, at) }
      else hidden.set(this, v)
    },
  })
  const realDispose = proto.dispose
  proto.dispose = function () {
    if (this.__bornAt && this.__freed !== true) { this.__freed = true; bump(freed, this.__bornAt) }
    return realDispose.apply(this, arguments)
  }

  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, keep)
  w.__texSpy = {
    summary: () => {
      const b = [...born.values()].reduce((a, c) => a + c, 0)
      const f = [...freed.values()].reduce((a, c) => a + c, 0)
      return {
        born: b, freed: f, live: b - f,
        rows: top(born).map(([at, n]) => ({ at, born: n, freed: freed.get(at) ?? 0, live: n - (freed.get(at) ?? 0) })),
      }
    },
    reset: () => { born.clear(); freed.clear() },
  }
  return { armed: true }
}, keepStacks)

export const readTexSpy = (page) => page
  .evaluate(() => (window.__texSpy ? window.__texSpy.summary() : { error: '안 걸려 있다' }))
  .catch((e) => ({ error: String(e?.message ?? e).slice(0, 120) }))

export const resetTexSpy = (page) => page
  .evaluate(() => { window.__texSpy?.reset() }).catch(() => {})
