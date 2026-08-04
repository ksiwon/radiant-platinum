// WebGPU 스파이크 핵심 (PLAN §2.4): three 내장 TSL PostProcessing + 블룸
// 실패해도 게임은 돌아야 하므로 방어적으로 초기화한다
import type { Camera, Scene } from 'three'
import { PostProcessing, type WebGPURenderer } from 'three/webgpu'
import { pass } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

export interface PostChain {
  render(): void
}

export function createPostChain(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
): PostChain | null {
  try {
    const post = new PostProcessing(renderer)
    const scenePass = pass(scene, camera)
    const color = scenePass.getTextureNode('output')
    post.outputNode = color.add(bloom(color, 0.35, 0.4, 0.9))
    return { render: () => post.render() }
  } catch (e) {
    console.warn('[post] TSL PostProcessing 초기화 실패 — 기본 렌더로 폴백', e)
    return null
  }
}
