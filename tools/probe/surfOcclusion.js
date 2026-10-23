// 220번수로 물 칸마다 3인칭 카메라 자리에서 주인공 겨눔점까지 땅 · 절벽만 쏘아, 그 사이에 든 칸을 센다. 겨눔은 발 + 1.0 + 파도타기로 든 몸(1.08)
//     pnpm shot pastoria --warp=467 --at=190,912 --surf --eval=tools/probe/surfOcclusion.js   (2026-10-23: 물 칸 1,885 · 가린 칸 0)
async () => {
  const THREE = await import('/node_modules/three/build/three.webgpu.js')
  const sr = await import('/src/scene/sceneRefs.ts')
  const S = await import('/src/state/worldState.ts')
  const W = await import('/src/engine/map/world.ts')
  const Z = await import('/src/engine/map/zone.ts')
  const FF = await import('/src/scene/fieldFade.ts')
  const C = await import('/src/engine/actor/camera.ts')
  const cam = sr.sceneRefs.stage.camera
  const p = S.worldState.player.position
  const off = cam.position.clone().sub(p)
  const ground = []
  sr.sceneRefs.stage.scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (FF.isGround(mats) && !mats.some((m) => /Water|Sea/.test(m.name))) ground.push(o)
  })
  const g = W.world.grid
  const rc = new THREE.Raycaster()
  let water = 0, hidden = 0
  const where = []
  for (let z = 880; z <= 935; z++) for (let x = 150; x <= 230; x++) {
    if (g.isBlocked(x, z) || !Z.isWater(g.behavior(x, z))) continue
    if (W.world.zoneAt && W.world.zoneAt(x, z) !== 467) continue
    water++
    const lift = 1.08
    const aim = new THREE.Vector3(x + 0.5, p.y + 1.0 + lift, z + 0.5)
    const eye = aim.clone().add(off).sub(new THREE.Vector3(0, 1.0 + lift, 0))
    const dir = aim.clone().sub(eye); const len = dir.length(); dir.normalize()
    rc.set(eye, dir); rc.far = len - 0.3
    const h = rc.intersectObjects(ground, false)[0]
    if (h) { hidden++; const b = new THREE.Box3().setFromObject(h.object); if (where.length < 40) where.push([x, z, +h.distance.toFixed(1), h.object.name, b.min.toArray().map(v=>+v.toFixed(1)), b.max.toArray().map(v=>+v.toFixed(1))]) }
  }
  return { lift: C.cameraSystem.mountLift, off: off.toArray().map(v => +v.toFixed(2)), ground: ground.length, water, hidden, where }
}
