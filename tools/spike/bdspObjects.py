# BDSP 번들 안에 무엇이 몇 개 있는가 — UnityPy 기준값 (IMPORT.md §12 spike)
#
#     py -3.13 tools/spike/bdspObjects.py raw/bdsp/pokemon/pm0001_00_00
#
# 브라우저 spike(`src/import/bdsp/unityfs.ts`)가 같은 수를 내는지 대조하는 데
# 쓴다. ⚠️ 이 값이 **오라클이다** — spike가 틀리면 이쪽이 맞다고 본다.
# UnityPy가 오래 돌고 검증된 쪽이기 때문이다.
import json
import sys

import UnityPy


def main() -> int:
    if len(sys.argv) < 2:
        print("쓰기: bdspObjects.py <번들 파일>", file=sys.stderr)
        return 2
    env = UnityPy.load(sys.argv[1])
    counts: dict[str, int] = {}
    for obj in env.objects:
        counts[obj.type.name] = counts.get(obj.type.name, 0) + 1
    out = {
        "file": sys.argv[1],
        "objects": len(env.objects),
        "counts": dict(sorted(counts.items())),
    }
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
