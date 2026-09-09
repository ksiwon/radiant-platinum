// **기하가 어디서 태어나는가** — UUID가 아니라 **만든 자리**를 센다 (지시 §C).
//
// ⚠️ **「수가 늘었다」로는 못 고친다.** `renderer.info.memory.geometries`는 만들고
// 안 버린 것의 **개수**만 준다 — 어느 코드가 만들었는지도, 누가 주인인지도 없다.
// 실측(2026-09-08 `_land42`)에서 전환마다 약 230개가 늘었는데 후보를 눈으로 하나씩
// 지워 나가다 결국 못 짚었다. 그러니 **생성 자리를 그 자리에서 받아 적는다.**
//
// ⚠️ **객체를 붙잡지 않는다.** 남기는 것은 스택 글 한 줄과 수뿐이다 — 추적기가
// 스스로 누수가 되면 재는 뜻이 없다.
//
// 어떻게: three의 `BufferGeometry` 생성자가 `this.uuid = …`를 쓴다. 그 **프로토타입에
// 접근자를 걸면** 새로 태어나는 것마다 한 번씩 손이 닿는다 — 이미 있는 것은 제
// 프로퍼티를 들고 있어서 안 걸린다(그래서 예열 뒤에 걸면 **그 뒤의 증가만** 센다).
// `dispose`도 같이 감싸 **생성−해제 잔액**을 낸다.

/** 페이지 안에서 도는 말. `page.evaluate`로 넣는다 */
export const armGeoSpy = async (page, keepStacks = 40) => page.evaluate(async (keep) => {
  const w = window
  if (w.__geoSpy) return { already: true, ...w.__geoSpy.summary() }
  // 제품이 내놓은 자리에서 무대를 얻는다 (`stageProbe`와 같은 길이다)
  const refs = await import('/src/scene/sceneRefs.ts')
  const scene = refs.sceneRefs.stage.scene
  if (!scene) return { error: '무대를 못 찾았다' }
  // 아무 메시의 기하에서 BufferGeometry 프로토타입까지 올라간다
  let proto = null
  scene.traverse((o) => {
    if (proto || o.isMesh !== true || !o.geometry) return
    let p = Object.getPrototypeOf(o.geometry)
    while (p && p.constructor?.name !== 'BufferGeometry') p = Object.getPrototypeOf(p)
    proto = p
  })
  if (!proto) return { error: '기하를 하나도 못 찾았다' }

  const born = new Map()   // 스택 → 만든 수
  const freed = new Map()  // 스택 → 버린 수
  const place = (skip) => {
    const lines = String(new Error().stack ?? '').split('\n').slice(skip, skip + 6)
    // 우리 감시자 자신의 줄은 뺀다
    return lines.map((l) => l.trim().replace(/^at\s+/, '').replace(/\?[a-z0-9=&_-]+/gi, ''))
      .filter((l) => l && !l.includes('__geoSpy')).slice(0, 6).join(' ← ')
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
  w.__geoSpy = {
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

/** 지금까지의 생성·해제 잔액 */
export const readGeoSpy = (page) => page
  .evaluate(() => (window.__geoSpy ? window.__geoSpy.summary() : { error: '안 걸려 있다' }))
  .catch((e) => ({ error: String(e?.message ?? e).slice(0, 120) }))

/** 예열 뒤 셈을 0으로 되돌린다 — 「전환당 증가」만 보려면 여기서 끊는다 */
export const resetGeoSpy = (page) => page
  .evaluate(() => { window.__geoSpy?.reset() }).catch(() => {})
