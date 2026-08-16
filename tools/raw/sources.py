"""raw 원천 어댑터 — 파이썬 쪽 창구 (`tools/raw/sources.cjs`와 같은 답).

    from tools.raw.sources import source_dir, require_dir
    root = require_dir('bdsp.characters')

⚠️ **후보 경로를 여기 다시 적지 않는다.** 정본은 `sources.cjs` 하나고 여기서는
그것을 `--json`으로 부른다. 두 벌을 들고 있으면 한쪽만 고치는 날이 오고, 그날
"내 기계에서는 되는데"가 시작된다.
"""
from __future__ import annotations

import json
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def _sources() -> dict:
    out = subprocess.run(
        ['node', str(ROOT / 'tools/raw/sources.cjs'), '--json'],
        capture_output=True, text=True, check=True, cwd=ROOT,
    )
    return json.loads(out.stdout)


def source_dir(name: str) -> Path | None:
    at = _sources()['dirs'].get(name)
    return Path(at) if at else None


def require_dir(name: str) -> Path:
    at = source_dir(name)
    if at is None:
        raise SystemExit(
            f"raw 원천 '{name}'을(를) 못 찾았다. `node tools/raw/sources.cjs`로 무엇이 "
            '어디로 풀리는지 본다.'
        )
    return at


def platinum_rom(locale: str) -> Path | None:
    at = _sources()['platinum'].get(locale)
    return Path(at) if at else None


if __name__ == '__main__':
    for k, v in _sources()['dirs'].items():
        print(f'{k:26} {v or "(없음)"}')
    sys.exit(0)
