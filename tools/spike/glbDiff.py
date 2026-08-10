"""glb 두 개를 대 본다 — 개발 추출기와 브라우저 변환기가 같은 것을 내는가.

    py -3.13 tools/spike/glbDiff.py <기준.glb> <새것.glb>

⚠️ **바이트로 못 잰다.** PNG는 브라우저 `CompressionStream`과 zlib이 서로 다른
바이트를 내고(같은 픽셀이어도), 접근자 차례도 다를 수 있다. 그래서 **뜻으로**
잰다: 정점·색인·가중치는 값으로, 그림은 픽셀로, 애니메이션은 채널별 표본으로.
"""
from __future__ import annotations

import io
import json
import struct
import sys

import numpy as np
from PIL import Image

COMP = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16}
PARTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load(path):
    raw = open(path, 'rb').read()
    at, chunks = 12, {}
    while at + 8 <= len(raw):
        size, kind = struct.unpack_from('<II', raw, at)
        chunks[kind] = raw[at + 8: at + 8 + size]
        at += 8 + size
    g = json.loads(chunks[0x4E4F534A])
    return g, chunks[0x004E4942]


def acc(g, blob, i):
    a = g['accessors'][i]
    v = g['bufferViews'][a['bufferView']]
    n = a['count'] * PARTS[a['type']]
    arr = np.frombuffer(blob, dtype=COMP[a['componentType']], count=n,
                        offset=v.get('byteOffset', 0))
    return arr.reshape(a['count'], -1)


def image(g, blob, i):
    v = g['bufferViews'][g['images'][i]['bufferView']]
    data = blob[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
    return np.asarray(Image.open(io.BytesIO(data)).convert('RGBA'), dtype=np.int16)


def close(a, b, tol):
    if a.shape != b.shape:
        return f'모양 {a.shape} ≠ {b.shape}'
    d = float(np.abs(a.astype(np.float64) - b.astype(np.float64)).max()) if a.size else 0.0
    return None if d <= tol else f'최대 차 {d:.6g}'


def main() -> int:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    ga, ba = load(sys.argv[1])
    gb, bb = load(sys.argv[2])
    bad = []

    def check(name, cond):
        if cond:
            bad.append(f'{name}: {cond}')
        print(f'  {name:<28} {cond or "같다"}')

    check('노드 수', None if len(ga['nodes']) == len(gb['nodes'])
          else f"{len(ga['nodes'])} ≠ {len(gb['nodes'])}")
    check('메시 수', None if len(ga['meshes']) == len(gb['meshes'])
          else f"{len(ga['meshes'])} ≠ {len(gb['meshes'])}")
    check('재질 수', None if len(ga.get('materials', [])) == len(gb.get('materials', []))
          else f"{len(ga.get('materials', []))} ≠ {len(gb.get('materials', []))}")

    # 뼈 자세
    for key, tol in (('translation', 1e-6), ('rotation', 1e-6), ('scale', 1e-6)):
        pa = np.array([n.get(key, [0, 0, 0]) for n in ga['nodes'] if 'mesh' not in n], dtype=np.float64)
        pb = np.array([n.get(key, [0, 0, 0]) for n in gb['nodes'] if 'mesh' not in n], dtype=np.float64)
        check(f'뼈 {key}', close(pa, pb, tol))
    names_a = [n.get('name') for n in ga['nodes']]
    names_b = [n.get('name') for n in gb['nodes']]
    check('뼈 이름', None if names_a == names_b else '차례나 이름이 다르다')

    # 메시 속성
    for m, (ma, mb) in enumerate(zip(ga['meshes'], gb['meshes'])):
        if len(ma['primitives']) != len(mb['primitives']):
            bad.append(f'메시 {m}: 서브메시 수가 다르다')
            continue
        for p, (pa_, pb_) in enumerate(zip(ma['primitives'], mb['primitives'])):
            for attr, tol in (('POSITION', 1e-6), ('NORMAL', 1e-6), ('TEXCOORD_0', 1e-6),
                              ('JOINTS_0', 0), ('WEIGHTS_0', 1e-6)):
                if attr not in pa_['attributes'] or attr not in pb_['attributes']:
                    continue
                check(f'메시{m}/{p} {attr}',
                      close(acc(ga, ba, pa_['attributes'][attr]),
                            acc(gb, bb, pb_['attributes'][attr]), tol))
            check(f'메시{m}/{p} 색인',
                  close(acc(ga, ba, pa_['indices']), acc(gb, bb, pb_['indices']), 0))
        sa, sb = ga['skins'][m], gb['skins'][m]
        check(f'스킨{m} 관절', None if sa['joints'] == sb['joints'] else '관절 배열이 다르다')
        check(f'스킨{m} 역바인드',
              close(acc(ga, ba, sa['inverseBindMatrices']),
                    acc(gb, bb, sb['inverseBindMatrices']), 1e-5))

    # 그림 — 픽셀로 잰다
    ia = {img['name']: k for k, img in enumerate(ga.get('images', []))}
    ib = {img['name']: k for k, img in enumerate(gb.get('images', []))}
    check('그림 이름', None if set(ia) == set(ib) else f'{sorted(set(ia) ^ set(ib))}')
    worst, off, total = 0.0, 0, 0
    for name in sorted(set(ia) & set(ib)):
        pa_ = image(ga, ba, ia[name])
        pb_ = image(gb, bb, ib[name])
        if pa_.shape != pb_.shape:
            bad.append(f'그림 {name}: 크기 {pa_.shape} ≠ {pb_.shape}')
            continue
        d = np.abs(pa_ - pb_)
        worst = max(worst, float(d.max()))
        off += int((d.max(axis=2) > 0).sum())
        total += pa_.shape[0] * pa_.shape[1]
    # ⚠️ 그림은 **바이트로 못 잰다.** sRGB 왕복이 부동소수라 마지막 자리가
    # 갈린다(파이썬은 짝수 반올림, JS는 위로 올림). 한 칸 차이는 눈에 안 보인다
    print(f'  {"그림 픽셀":<28} 최대 차 {worst:.0f} · 다른 픽셀 {off}/{total} '
          f'({100 * off / max(1, total):.3f}%)')
    if worst > 2:
        bad.append(f'그림 픽셀 최대 차 {worst:.0f}')

    # 애니메이션
    aa = {a['name']: a for a in ga.get('animations', [])}
    ab = {a['name']: a for a in gb.get('animations', [])}
    check('클립 이름', None if set(aa) == set(ab) else f'{sorted(set(aa) ^ set(ab))}')
    animWorst = 0.0
    for name in sorted(set(aa) & set(ab)):
        ca = sorted(((c['target']['node'], c['target']['path'], c['sampler']) for c in aa[name]['channels']))
        cb = sorted(((c['target']['node'], c['target']['path'], c['sampler']) for c in ab[name]['channels']))
        if [(n, p) for n, p, _ in ca] != [(n, p) for n, p, _ in cb]:
            bad.append(f'클립 {name}: 채널 짝이 다르다')
            continue
        for (_, _, s1), (_, _, s2) in zip(ca, cb):
            for key in ('input', 'output'):
                x = acc(ga, ba, aa[name]['samplers'][s1][key])
                y = acc(gb, bb, ab[name]['samplers'][s2][key])
                if x.shape != y.shape:
                    bad.append(f'클립 {name}: {key} 모양 {x.shape} ≠ {y.shape}')
                    break
                animWorst = max(animWorst, float(np.abs(x - y).max()))
    check('애니메이션 최대 차', None if animWorst <= 1e-5 else f'{animWorst:.6g}')

    print(f'\n{"모두 같다" if not bad else f"{len(bad)}곳 다르다"}')
    return 1 if bad else 0


if __name__ == '__main__':
    raise SystemExit(main())
