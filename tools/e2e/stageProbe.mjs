// **무대를 재는 자** — 카메라 · 지형 · 자원을 한 형식으로 남긴다 (지시 §4).
//
// ⚠️ **제품이 내놓은 것만 읽는다.** 함수를 베껴 오면 그 순간부터 **다른 셈**을
// 재게 된다 (`probe-must-be-verified-too`). 여기서 부르는 것은 전부
// `src/`가 export하는 것이다 — `terrainReady()`·`sceneRefs.stage`·`perfSnapshot`.
//
// ⚠️ **큰 three 객체를 통째로 찍지 않는다.** 씬을 훑되 밖으로 내는 것은 **수**뿐이고,
// 행렬은 「유한한가」한 줄로 접는다. 개발 서버에서만 도는 자리라 배포물에는 없다.
//
// ⚠️ **읽기만 한다.** 카메라를 옮기거나 청크를 붙이지 않는다.

/** 개발 서버에서 모듈을 열어 무대를 잰다. 못 읽는 값은 `null`로 두고 **접지 않는다** */
export const stageState = (page) => page.evaluate(async () => {
  const finite = (m) => m !== null && m !== undefined
    && Array.from(m.elements ?? []).every((v) => Number.isFinite(v))
  const fx = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(3) : null)
  try {
    const t = await import('/src/scene/terrainMark.ts')
    const refs = await import('/src/scene/sceneRefs.ts')
    const st = await import('/src/state/worldState.ts')
    const w = await import('/src/engine/map/world.ts')
    const npcs = await import('/src/engine/actor/npcs.ts')
    const fs = await import('/src/engine/loop/frameStats.ts')

    const ready = t.terrainReady()
    const cam = refs.sceneRefs.stage.camera
    const scene = refs.sceneRefs.stage.scene
    const gl = refs.sceneRefs.stage.gl
    const p = st.worldState.player.position
    const want = st.worldState.camera

    // ── 씬을 훑는다. 수만 낸다 ────────────────────────────────────────────
    //
    // ⚠️ **「몇 개 만들었나」와 「몇 개 쓰고 있나」를 따로 센다.** three의
    // `info.memory`는 **만들고 안 버린 것**을 세고, 아래 훑기는 **지금 씬에서
    // 닿는 것**을 센다. 둘의 차이가 곧 **주인 없이 남은 것**이다 — 「메모리가
    // 높다」가 아니라 「이만큼이 씬에 없는데 안 버려졌다」라고 말할 수 있다
    let meshes = 0, visible = 0, instanced = 0, objects = 0
    let boundsFinite = true
    const geos = new Set(), mats = new Set(), texes = new Set()
    if (scene) {
      scene.traverse((o) => {
        objects += 1
        if (o.isMesh !== true) return
        meshes += 1
        if (o.visible) visible += 1
        if (o.isInstancedMesh === true) instanced += 1
        const g = o.geometry
        if (g) geos.add(g.uuid)
        if (g?.boundingSphere && !Number.isFinite(g.boundingSphere.radius)) boundsFinite = false
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m) continue
          mats.add(m.uuid)
          for (const k of ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'lightMap']) {
            if (m[k]?.uuid) texes.add(m[k].uuid)
          }
        }
      })
    }

    const info = gl?.info ?? null
    const cv = document.querySelector('#stage-wrap canvas')
    const d = document.documentElement.dataset
    return {
      ready,
      camera: cam === null ? null : {
        kind: cam.type ?? null,
        uuid: String(cam.uuid ?? '').slice(0, 8),
        // ⚠️ **R3F가 몰래 둘째 카메라를 만든 적이 있다.** 그때 이 `aspect`가 0이었다
        aspect: fx(cam.aspect), near: fx(cam.near), far: fx(cam.far),
        zoom: fx(cam.zoom), fov: fx(cam.fov),
        at: [fx(cam.position?.x), fx(cam.position?.y), fx(cam.position?.z)],
        projFinite: finite(cam.projectionMatrix),
        viewFinite: finite(cam.matrixWorldInverse),
        layers: cam.layers?.mask ?? null,
      },
      /** 우리가 **원한** 시점. 위와 어긋나면 그 자체가 답이다 */
      wantCamera: {
        mode: want.mode,
        at: [fx(want.position.x), fx(want.position.y), fx(want.position.z)],
        aim: [fx(want.target.x), fx(want.target.y), fx(want.target.z)],
      },
      player: { x: fx(p.x), y: fx(p.y), z: fx(p.z) },
      ground: w.world.grid === null ? null : fx(w.world.grid.heightAtWorld(p.x, p.z, p.y)),
      scene: {
        objects, meshes, visible, instanced, boundsFinite,
        /** 씬에서 **닿는** 것 — 이 수는 왕복해도 안 늘어야 한다 */
        geometries: geos.size, materials: mats.size, textures: texes.size,
      },
      resources: info === null ? null : {
        geometries: info.memory?.geometries ?? null,
        textures: info.memory?.textures ?? null,
        calls: info.render?.drawCalls ?? null,
        tris: info.render?.triangles ?? null,
      },
      frames: refs.perfSnapshot.frames,
      fps: Math.round(refs.perfSnapshot.fps),
      npcs: npcs.npcActors.list.length,
      canvas: cv === null ? null
        : { css: `${String(Math.round(cv.getBoundingClientRect().width))}x`
            + `${String(Math.round(cv.getBoundingClientRect().height))}`,
          buffer: `${String(cv.width)}x${String(cv.height)}`, dpr: window.devicePixelRatio },
      marks: {
        scene: d.scene ?? null, map: d.map ?? null, tile: d.tile ?? null,
        renderer: d.renderer ?? null, restoring: d.restoring ?? null,
        talk: d.talk ?? null, script: d.script ?? null,
      },
      spans: Object.fromEntries([...fs.frameStats.spans].map(([k, v]) => [k, {
        first: +v.first.toFixed(1), worst: +v.worst.toFixed(1), count: v.count,
      }])),
      heap: performance.memory?.usedJSHeapSize ?? null,
    }
  } catch (e) {
    // ⚠️ **못 읽었다를 「정상」으로 접지 않는다**
    return { unobservable: String(e?.message ?? e).slice(0, 200) }
  }
})

/**
 * **지형이 설 때까지 기다린다 — 시간이 아니라 상태를.**
 *
 * ⚠️ **상한을 넘으면 「준비 실패」다.** 그때 찍는 컷은 판정 불가로 다뤄야 한다 —
 * 「기다리다 통과했다」로 접으면 사용자가 실제로 본 빈 화면이 사라진다
 *
 * @returns `{ ok, why, waitedMs }`
 */
export async function waitTerrain(page, capMs = 20_000) {
  const t0 = Date.now()
  let why = '아직 한 번도 못 물었다'
  /**
   * ⚠️ **`page.waitForFunction`에 async 판정식을 주면 안 된다.** 돌려준
   * `Promise` 객체가 **참**이라 첫 폴링에서 곧바로 통과한다 — 실측
   * (2026-09-08 판정용 journey): 이 자리가 「16ms에 섰다」고 적은 그 순간
   * `terrainReady().ok`는 **거짓**이었고(「씬에 선 청크가 다른 맵의 것이다」)
   * 그 상태는 이미 256프레임째 이어지고 있었다. 즉 **관문이 아무것도 안
   * 막고 있었다.**
   *
   * `import`가 필요하니 판정식은 async일 수밖에 없다. 그러면 기다리는 일을
   * 플레이라이트에 맡기지 말고 **여기서 직접 돈다** — `page.evaluate`는
   * 프로미스를 제대로 기다린다 (`stageState`가 그 증거다)
   */
  while (Date.now() - t0 < capMs) {
    const got = await page.evaluate(async () => {
      const t = await import('/src/scene/terrainMark.ts')
      const r = t.terrainReady()
      return { ok: r.ok, why: r.why }
    }).catch((e) => ({ ok: false, why: `못 물었다 — ${String(e?.message ?? e).slice(0, 80)}` }))
    if (got.ok) return { ok: true, why: null, waitedMs: Date.now() - t0 }
    why = got.why ?? '까닭을 안 줬다'
    await page.waitForTimeout(250)
  }
  return { ok: false, waitedMs: Date.now() - t0, why }
}
