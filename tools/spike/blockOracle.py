"""블록 압축 오라클 — `texture2ddecoder`가 같은 바이트를 어떻게 푸는가.

    py -3.13 tools/spike/blockOracle.py <종류> <너비> <높이> [블록크기]

압축 바이트를 stdin으로 받아 RGBA8을 stdout으로 낸다. UnityPy가 부르는 바로 그
디코더라, 여기와 다르면 우리가 틀린 것이다 (`bcn.test.ts` · `astc.test.ts`).

⚠️ `texture2ddecoder`는 **BGRA**를 낸다. 여기서 RGBA로 바꿔 내보낸다 — 시험 쪽에서
채널을 또 바꾸면 두 번 뒤집혀 맞아 보인다.
"""
import sys

import texture2ddecoder as td


def main() -> int:
    kind = sys.argv[1]
    width, height = int(sys.argv[2]), int(sys.argv[3])
    src = sys.stdin.buffer.read()
    if kind == 'astc':
        bw, bh = int(sys.argv[4]), int(sys.argv[5])
        out = td.decode_astc(src, width, height, bw, bh)
    else:
        out = getattr(td, f'decode_{kind}')(src, width, height)
    rgba = bytearray(out)
    rgba[0::4], rgba[2::4] = out[2::4], out[0::4]
    sys.stdout.buffer.write(bytes(rgba))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
