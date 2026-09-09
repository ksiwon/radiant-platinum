// 헤드리스 크로미움에 **진짜 GPU와 WebGPU**를 붙이는 깃발 한 벌.
//
// ⚠️ **네 하네스가 이 한 자리를 같이 본다** (`shot` · `look` · `story` · `e2e`).
// 따로 적으면 「순회는 WebGPU로 쟀는데 e2e는 폴백이었다」가 조용히 생긴다.
//
// ⚠️ **「헤드리스에는 WebGPU가 없다」는 틀렸다.** 한 세션 내내 그렇게 적고
// 있었고 순회 표에도 「WebGPU 없다」가 찍혔는데, 실측(2026-09-05,
// `.audit/probe/webgpuProbe3.mjs`)으로 막고 있던 것이 **둘**이었다:
//
//   ① `about:blank`은 보안 컨텍스트가 아니라 `navigator.gpu` **자체가 안 뜬다.**
//      `http://127.0.0.1`(또는 localhost)로 옮긴 뒤에야 어댑터를 물어볼 수 있다.
//      우리 하네스는 어차피 vite로 가므로 이 조건은 이미 맞다.
//
//   ② 어댑터는 잡히는데(`intel · xe-2lpg`) `requestDevice`가 죽었다 —
//      `DynamicLib.Open: dxil.dll Windows Error: 87`. Dawn의 D3D12 길이 DXC로
//      셰이더를 굽는데 번들 크로미움이 제 `dxil.dll`을 못 연다(파일은 있다).
//      **DXC를 끄면(`use_dxc`) FXC로 굽고 37ms에 장치가 선다.**
//
// 실측 (같은 기계 · Intel Arc 140V):
//
//   about:blank + 어떤 깃발이든        navigator.gpu 없음
//   http + 기본 깃발                    어댑터 O · 장치 X (dxil.dll 87)
//   http + `--disable-dawn-features`    장치 **37ms**
//   http + `--use-webgpu-adapter=d3d11` 장치 **21ms**
//   설치된 크롬·엣지(channel)           장치 170·211ms (깃발 없이)
//
// ⚠️ **여기서 잰 값은 이 기계의 내장 GPU 값이다.** 사용자 기계의 수치는 여전히
// 그쪽 HUD가 정본이다 — 다만 「WebGPU 경로를 한 번도 안 재 봤다」는 구멍은 닫힌다.

/** ANGLE(WebGL2 폴백 경로)이 진짜 GPU를 잡게 한다 */
const ANGLE = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--enable-gpu', '--ignore-gpu-blocklist']

/**
 * WebGPU(사용자가 실제로 타는 길)를 연다.
 *
 * ⚠️ **`--disable-dawn-features=use_dxc`가 요점이다.** 이것 없이는 어댑터까지만
 * 잡히고 장치 생성에서 죽어서, 우리 렌더러가 조용히 WebGL2로 내려앉는다 —
 * 그 상태로 잰 프레임을 「WebGPU 수치」로 적으면 거짓말이 된다
 */
const WEBGPU = ['--enable-unsafe-webgpu', '--disable-dawn-features=use_dxc']

/** 소프트웨어 래스터라이저로 못 박는다. 픽셀이 기계마다 안 갈리는 것이 필요할 때만 */
const SOFTWARE = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']

/**
 * WebGPU를 **실제로 끈다.** `navigator.gpu`가 안 뜨므로 three가 WebGL2로 내려앉는다.
 *
 * ⚠️ **ANGLE 깃발만으로는 WebGPU가 안 꺼진다.** 오래 `gl` 프로필이 그것뿐이었고,
 * 그 이름을 믿고 「WebGL2 경로를 쟀다」고 적을 뻔했다 — 실제로는 그 판도 WebGPU로
 * 돌고 있었다. 이름이 아니라 **화면의 `data-backend`**로 확인한다
 */
const NO_WEBGPU = ['--disable-features=WebGPU,WebGPUExperimentalFeatures']

/**
 * 띄울 때 줄 깃발.
 *
 * @param {'webgpu' | 'gl' | 'software' | 'default'} mode
 *   `webgpu` 헤드리스에서 WebGPU를 여는 한 벌 (기본) ·
 *   `gl` **WebGPU를 끄고** ANGLE로 (WebGL2 폴백을 일부러 잴 때) ·
 *   `software` SwiftShader (픽셀이 기계마다 같아야 할 때) ·
 *   `default` **아무 깃발도 안 준다** — 사람이 제 브라우저에서 여는 것과 같은 조건.
 *   ⚠️ 플레이라이트 제 기본 깃발까지 없다는 뜻은 아니다. 실제로 넘어간 목록은
 *   `browser.args`가 아니라 하네스가 **제가 넘긴 것**을 그대로 적는다
 */
export function gpuArgs(mode = 'webgpu') {
  if (mode === 'default') return []
  if (mode === 'software') return [...SOFTWARE]
  if (mode === 'gl') return [...ANGLE, ...NO_WEBGPU]
  return [...ANGLE, ...WEBGPU]
}

/** 그 프로필이 기대하는 백엔드 이름. 실제와 다르면 그 환경 검증은 미완료다 */
export function wantBackend(mode = 'webgpu') {
  if (mode === 'gl') return 'WebGLBackend'
  if (mode === 'webgpu') return 'WebGPUBackend'
  return null
}

/**
 * 열린 화면이 **실제로** 무엇을 잡았는지 잰다. 깃발을 줬다고 믿지 않는다.
 *
 * @returns `{ renderer, software, webgpu, adapter, device }`
 *   `webgpu`는 `navigator.gpu`가 있는가, `device`는 **장치가 실제로 섰는가**다 —
 *   그 둘이 갈리는 것이 위 ②의 실패다
 */
export async function probeGpu(page) {
  return page.evaluate(async () => {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    const renderer = gl
      ? (ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '(가려짐)')
      : '(WebGL 없음)'
    const out = {
      renderer,
      software: !gl || /swiftshader|llvmpipe|software|paint/i.test(renderer),
      webgpu: 'gpu' in navigator,
      adapter: null,
      device: false,
    }
    if (!out.webgpu) return out
    try {
      const a = await navigator.gpu.requestAdapter()
      if (!a) return out
      const info = a.info ?? {}
      out.adapter = `${String(info.vendor ?? '?')}/${String(info.architecture ?? '?')}`
      out.device = await a.requestDevice().then(() => true).catch(() => false)
    } catch { /* 어댑터를 못 물어보면 없는 것으로 둔다 */ }
    return out
  })
}
