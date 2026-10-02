"""블록 압축 오라클 — UnityPy가 같은 바이트를 어떻게 푸는가.

    py -3.13 tools/spike/blockOracle.py <종류> <너비> <높이> [블록크기]

압축 바이트를 stdin으로 받아 RGBA8을 stdout으로 낸다. UnityPy가 부르는 바로 그
디코더라, 여기와 다르면 우리가 틀린 것이다 (`bcn.test.ts` · `astc.test.ts`).

⚠️ **ASTC는 `texture2ddecoder`가 아니다.** UnityPy 1.25는 ASTC를 `astc_encoder`(ARM astcenc · LDR ·
`USE_DECODE_UNORM8`)로 푼다 (`Texture2DConverter.astc`). 한동안 여기서 `texture2ddecoder`를 불러 그쪽에 맞췄더니
브라우저 변환기가 개발 추출기와 ±1씩 갈렸다 — 512² 한 장에서 18,385바이트다. 그래서 UnityPy의 그 함수를 그대로 부른다.
BC 계열은 UnityPy도 `texture2ddecoder`다

⚠️ `texture2ddecoder`는 **BGRA**를 낸다. 여기서 RGBA로 바꿔 내보낸다 — 시험 쪽에서
채널을 또 바꾸면 두 번 뒤집혀 맞아 보인다.
"""
import sys

import texture2ddecoder as td
from UnityPy.export.Texture2DConverter import astc as unitypy_astc


def main() -> int:
    kind = sys.argv[1]
    width, height = int(sys.argv[2]), int(sys.argv[3])
    src = sys.stdin.buffer.read()
    if kind == 'astc':
        bw, bh = int(sys.argv[4]), int(sys.argv[5])
        # 이쪽은 이미 RGBA다 — 아래 BGRA 뒤집기를 안 탄다
        sys.stdout.buffer.write(unitypy_astc(src, width, height, (bw, bh)).tobytes())
        return 0
    else:
        out = getattr(td, f'decode_{kind}')(src, width, height)
    rgba = bytearray(out)
    rgba[0::4], rgba[2::4] = out[2::4], out[0::4]
    sys.stdout.buffer.write(bytes(rgba))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
