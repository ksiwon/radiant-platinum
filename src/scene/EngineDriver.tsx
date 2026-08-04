// useFrame → 게임 루프 → 씬 동기화 → 렌더 (priority 1: 렌더를 우리가 소유)
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { gameLoop } from '../engine/loop/GameLoop'
import { inputSystem } from '../engine/input/keyboard'
import { playerSystem } from '../engine/actor/player'
import { cameraSystem } from '../engine/actor/camera'
import { worldState } from '../state/worldState'
import { sceneRefs, perfSnapshot } from './sceneRefs'
import { createPostChain, type PostChain } from './fx/post'

let systemsRegistered = false
const interpolated = new Vector3()

export function EngineDriver({ bloom: useBloom = true }: { bloom?: boolean }) {
  const { gl, scene, camera } = useThree()
  const postRef = useRef<PostChain | null>(null)

  useEffect(() => {
    if (!systemsRegistered) {
      // 시스템 실행 순서 고정 (PLAN §3.4): Input → Movement → Camera
      gameLoop.register(inputSystem)
      gameLoop.register(playerSystem)
      gameLoop.register(cameraSystem)
      systemsRegistered = true
    }
  }, [])

  useEffect(() => {
    const renderer = gl as unknown as WebGPURenderer
    perfSnapshot.backend = renderer.backend?.constructor?.name ?? 'unknown'
    postRef.current = useBloom ? createPostChain(renderer, scene, camera) : null
    return () => { postRef.current = null }
  }, [gl, scene, camera, useBloom])

  // 탭 비활성 → 루프 정지 (PLAN §11.2)
  useEffect(() => {
    const onVis = () => { gameLoop.paused = document.hidden }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useFrame((state, delta) => {
    gameLoop.tick(delta)

    // 씬 동기화 — 렌더 보간 (prev → current, alpha)
    const p = worldState.player
    if (sceneRefs.player) {
      // 플레이어 노드의 원점은 발밑(y=0) 기준이므로 보간값을 그대로 쓴다
      interpolated.copy(p.prevPosition).lerp(p.position, gameLoop.alpha)
      sceneRefs.player.position.copy(interpolated)
      sceneRefs.player.rotation.y = p.facing
    }
    state.camera.position.copy(worldState.camera.position)
    state.camera.lookAt(worldState.camera.target)

    // 렌더 (post 실패 시 기본 렌더 폴백)
    if (postRef.current) postRef.current.render()
    else state.gl.render(state.scene, state.camera)

    // 계측
    const info = (state.gl as unknown as WebGPURenderer).info
    perfSnapshot.fps = gameLoop.stats.fps
    perfSnapshot.frameMs = gameLoop.stats.frameMs
    perfSnapshot.drawCalls = info?.render?.drawCalls ?? 0
    perfSnapshot.triangles = info?.render?.triangles ?? 0
  }, 1)

  return null
}
