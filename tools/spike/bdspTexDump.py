"""진짜 BDSP 텍스처의 압축 바이트와 UnityPy 복호 결과를 나란히 떨군다.

    pnpm spike:texDump [개수]

`raw/work/astcParity/`에 `<번호>.raw`(압축 그대로)·`<번호>.rgba`(UnityPy가 푼 것)·
`meta.json`을 쓴다. `astc.test.ts`·`bcn.test.ts`가 그것으로 우리 디코더를 대조한다.

⚠️ **여기 나온 것을 커밋하지 않는다** (COPYRIGHT.md §5). `raw/work`는 Git 무시고,
이 파일들은 원본 자산의 픽셀 그대로다.

⚠️ 텍스처 대부분은 번들 안 `.resS` 스트림에 있다. `image_data`만 보면 빈손이다.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import UnityPy
import texture2ddecoder as td

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.raw.sources import ROOT, require_dir  # noqa: E402

# Unity TextureFormat 번호 → (우리 이름, 블록 너비, 블록 높이)
FORMATS = {
    1: ('alpha8', 0, 0),
    10: ('bc1', 0, 0), 12: ('bc3', 0, 0), 25: ('bc7', 0, 0),
    26: ('bc4', 0, 0), 27: ('bc5', 0, 0),
    48: ('astc', 4, 4), 49: ('astc', 5, 5), 50: ('astc', 6, 6),
    51: ('astc', 8, 8), 52: ('astc', 10, 10), 53: ('astc', 12, 12),
}


def main() -> int:
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    out = ROOT / 'raw/work/astcParity'
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('*'):
        old.unlink()

    root = require_dir('bdsp.root')
    files = [p for p in root.rglob('*') if p.is_file() and not p.suffix]
    # 한 폴더만 훑으면 형식이 한쪽으로 쏠린다. 섞어서 고른다
    random.seed(11)
    random.shuffle(files)

    meta = []
    for path in files:
        if len(meta) >= want:
            break
        try:
            env = UnityPy.load(str(path))
        except Exception:
            continue
        for obj in env.objects:
            if obj.type.name != 'Texture2D' or len(meta) >= want:
                continue
            try:
                d = obj.read()
            except Exception:
                continue
            fmt = int(d.m_TextureFormat)
            if fmt not in FORMATS:
                continue
            kind, bw, bh = FORMATS[fmt]
            if kind == 'alpha8':
                continue
            raw = bytes(d.image_data) if d.image_data else b''
            if not raw and d.m_StreamData and d.m_StreamData.path:
                cab = env.cabs.get(d.m_StreamData.path.split('/')[-1].lower())
                if cab is None:
                    continue
                cab.seek(d.m_StreamData.offset)
                raw = cab.read(d.m_StreamData.size)
            if not raw:
                continue
            try:
                dec = (td.decode_astc(raw, d.m_Width, d.m_Height, bw, bh) if kind == 'astc'
                       else getattr(td, f'decode_{kind}')(raw, d.m_Width, d.m_Height))
            except Exception:
                continue
            # texture2ddecoder는 BGRA를 낸다
            rgba = bytearray(dec)
            rgba[0::4], rgba[2::4] = dec[2::4], dec[0::4]
            i = len(meta)
            (out / f'{i}.raw').write_bytes(raw)
            (out / f'{i}.rgba').write_bytes(bytes(rgba))
            meta.append({'i': i, 'kind': kind, 'bw': bw, 'bh': bh,
                         'w': d.m_Width, 'h': d.m_Height, 'fmt': fmt})
    (out / 'meta.json').write_text(json.dumps(meta), encoding='utf8')
    kinds = {}
    for m in meta:
        kinds[m['kind']] = kinds.get(m['kind'], 0) + 1
    print(f'{len(meta)}장 -> {out.relative_to(ROOT)} · ' + ' '.join(f'{k}={v}' for k, v in kinds.items()))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
