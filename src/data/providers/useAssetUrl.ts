// 주소가 꼭 필요한 화면을 위한 다리 (IMPORT.md §7)
//
// CSS 배경, `Image`, `GLTFLoader`는 **동기 문자열**을 요구한다. Provider는
// 비동기다 — OPFS에서 바이트를 읽어 Blob으로 감싸야 주소가 나온다. 그 사이를
// React가 메운다.
//
// 갈래가 둘인 것은 **수명이 둘이기 때문**이다:
//
//   `useAssetUrl`   주인공·자전거·배틀 무대 GLB처럼 세션 내내 사는 것. 잡고 안 놓는다
//   `useAssetImage` 도감 격자의 종별 그림처럼 많고 짧게 사는 것. 잡았다 놓는다
//
// ⚠️ **한 벌을 여러 컴포넌트가 나눠 쓰면 참조 수를 잘못 세기 쉽다.** 약속을
// 캐시해 두고 각자 언마운트할 때 놓게 하면, 하나가 잡은 것을 여럿이 놓아서
// 아직 쓰는 화면의 그림이 죽는다. 그래서 오래 사는 쪽은 아예 안 놓는다 —
// Provider를 갈아 끼울 때 `unpinAll()`이 한 번에 거둔다.
import { use, useEffect, useState } from 'react'
import { assets, type AssetPath } from './assetProvider'
import { pinAtlas } from './atlas'

/**
 * 논리 경로 → 주소. 준비될 때까지 서스펜드한다.
 *
 * 잡은 참조를 안 놓는다 — 위 ⚠️ 참조. R3F의 `useLoader`도 파싱한 GLTF를
 * 영원히 캐시하므로 주소만 놓아 봐야 얻는 것이 없다
 */
export function useAssetUrl(path: AssetPath): string {
  return use(pinAtlas(path))
}

/**
 * 서스펜드하지 않는 갈래 — `<img>`와 CSS 배경용.
 *
 * ⚠️ 도감 격자는 한 화면에 그림 수십 장을 건다. 장마다 서스펜드하면 한 장이
 * 늦을 때 격자 전체가 사라졌다 돌아온다. 여기서는 준비될 때까지 `null`을
 * 주고, 화면은 그동안 빈 자리를 둔다
 */
export function useAssetImage(path: AssetPath | null): string | null {
  const provider = assets()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (path === null) { setUrl(null); return }
    let alive = true
    // ⚠️ **잡은 뒤에만 놓는다.** 이 표시가 없으면, 아직 못 받은 채로 언마운트한
    // 화면이 **다른 화면이 잡아 둔 참조**를 대신 놓는다 — 참조 수가 0이 되어
    // 아직 쓰는 쪽의 그림이 죽는다
    let acquired = false

    void provider.objectUrl(path).then((got) => {
      if (!alive) { provider.releaseObjectUrl(path); return }
      acquired = true
      setUrl(got)
    }).catch(() => { if (alive) setUrl(null) })

    return () => {
      alive = false
      if (acquired) provider.releaseObjectUrl(path)
    }
  }, [provider, path])

  return url
}
