// 천관산 벽화 앞면을 0.05칸 격자로 수평으로 쏘아, 그림보다 앞(1칸 안)에 맞는 다른 면을 센다 (REPAIR §171)
//     pnpm shot coronet --warp=208 --at=7,25 --eval=tools/probe/paintingPoke.js
async () => {
  const THREE = await import('/node_modules/three/build/three.webgpu.js')
  const sr = await import('/src/scene/sceneRefs.ts')
  const scene = sr.sceneRefs.stage.scene
  const paint = [], other = []
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return
    if (/^벽화 203/.test(o.name)) paint.push(o)
    else if (!o.isSkinnedMesh && !/주인공|player/i.test(o.name)) other.push(o)
  })
  if (paint.length === 0) return 'no painting'
  const box = new THREE.Box3(); for (const m of paint) box.expandByObject(m)
  const rc = new THREE.Raycaster()
  const rows = []
  let worst = -9, at = null
  for (let y = box.min.y + 0.02; y <= box.max.y; y += 0.05) {
    for (let x = box.min.x + 0.05; x <= box.max.x - 0.05; x += 0.05) {
      rc.set(new THREE.Vector3(x, y, box.max.z + 3), new THREE.Vector3(0, 0, -1))
      const hp = rc.intersectObjects(paint, false)[0]
      if (!hp) continue
      const ho = rc.intersectObjects(other, false).find((h) => h.point.z - hp.point.z < 1 && h.point.z - hp.point.z > -0.02)
      if (!ho) continue
      const d = ho.point.z - hp.point.z  // >0 이면 BDSP가 그림 앞으로 나왔다
      if (d > worst) { worst = d; at = [x, y, ho.object.name, (Array.isArray(ho.object.material) ? ho.object.material[ho.face.materialIndex] : ho.object.material)?.name] }
      if (d > 0.005) rows.push([+x.toFixed(2), +y.toFixed(2), +d.toFixed(3)])
    }
  }
  return { box: [box.min.toArray().map(v=>+v.toFixed(2)), box.max.toArray().map(v=>+v.toFixed(2))], worst: +worst.toFixed(3), at, poking: rows.length, sample: rows.sort((a,b)=>b[2]-a[2]).slice(0, 12) }
}
