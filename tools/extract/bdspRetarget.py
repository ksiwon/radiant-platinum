"""치비 동작을 등신 몸으로 옮긴다 (PLAN §4.3).

BDSP 인물은 두 벌이다. **등신**(`battle/tr####`)에 붙은 클립 여덟은 전부
제자리 배틀 동작이라 걷는 것이 없고, **치비**(`field/fc####`)에는 걷기·낚시·
잠자기까지 쉰여섯이 있다. 우리는 등신을 쓰기로 했으므로(§4.3) 걷기를 옮겨 온다.

⚠️ **두 리그는 다르다.** 뼈 이름이 121 중 51개만 겹친다. 그래서 로컬 회전을
그냥 복사하면 안 된다 — 같은 이름의 뼈라도 쉬는 자세의 방향이 서로 달라서,
복사한 순간 팔이 엉뚱한 데를 본다.

대신 **쉬는 자세에서 얼마나 돌았는가**를 옮긴다. 월드 기준으로:

    D  = 지금소스전역 · 소스쉼전역⁻¹        (쉼에서 벗어난 만큼)
    지금타깃전역 = D · 타깃쉼전역
    타깃로컬 = 부모의 지금타깃전역⁻¹ · 지금타깃전역

이러면 두 리그의 쉬는 자세가 달라도 "얼마나 돌았나"만 건너온다.

**자리 옮김은 안 옮긴다.** 뼈 길이가 다르므로 그대로 옮기면 팔다리가 늘어난다.
`Hips`의 위아래 흔들림만 키 비율로 줄여 옮긴다 — 그게 없으면 걸을 때 몸이
땅에 붙어 미끄러진다.

⚠️ 실측: `walk_f`가 움직이는 뼈 34개 중 **23개가 등신에 있고, 없는 11개는
전부 가방끈과 목도리**다. 뼈대는 하나도 안 빠진다.
"""
from __future__ import annotations

import numpy as np


def quat_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """(x, y, z, w) 두 개를 곱한다. `a·b`는 b를 먼저 돌리고 a를 돌린 것이다."""
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ], dtype=np.float64)


def quat_conj(q: np.ndarray) -> np.ndarray:
    """단위 사원수의 역. 켤레와 같다."""
    return np.array([-q[0], -q[1], -q[2], q[3]], dtype=np.float64)


def quat_norm(q: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(q))
    return q / n if n > 1e-12 else np.array([0.0, 0.0, 0.0, 1.0])


class Rig:
    """뼈 이름 → 부모·쉬는 자세. FK를 돌리는 데 필요한 최소한만 든다."""

    def __init__(self, parent: dict[str, str | None], rest: dict[str, np.ndarray],
                 offset: dict[str, np.ndarray]) -> None:
        self.parent = parent
        self.rest = rest
        self.offset = offset
        self._global: dict[str, np.ndarray] = {}
        for name in parent:
            self._global[name] = self._rest_global(name)

    def _rest_global(self, name: str) -> np.ndarray:
        q = np.array([0.0, 0.0, 0.0, 1.0])
        chain = []
        at: str | None = name
        seen = set()
        while at is not None and at in self.rest and at not in seen:
            seen.add(at)
            chain.append(at)
            at = self.parent.get(at)
        for b in reversed(chain):
            q = quat_mul(q, self.rest[b])
        return quat_norm(q)

    def rest_global(self, name: str) -> np.ndarray:
        return self._global[name]

    def order(self) -> list[str]:
        """부모가 늘 자식보다 먼저 오는 차례. FK가 한 번에 돈다."""
        done: list[str] = []
        seen: set[str] = set()

        def visit(name: str) -> None:
            if name in seen or name not in self.rest:
                return
            seen.add(name)
            p = self.parent.get(name)
            if p is not None:
                visit(p)
            done.append(name)

        for name in self.rest:
            visit(name)
        return done


def forward(rig: Rig, local: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """로컬 회전들로 전역 회전을 구한다. 없는 뼈는 쉬는 자세를 쓴다."""
    out: dict[str, np.ndarray] = {}
    for name in rig.order():
        q = local.get(name, rig.rest[name])
        p = rig.parent.get(name)
        out[name] = quat_norm(quat_mul(out[p], q) if p in out else q)
    return out


def retarget(
    source: Rig, target: Rig, frames: list[dict[str, np.ndarray]],
) -> tuple[list[dict[str, np.ndarray]], list[str]]:
    """
    소스의 프레임별 로컬 회전을 타깃의 로컬 회전으로 옮긴다.

    옮기는 것은 **이름이 같은 뼈**뿐이다. 나머지는 타깃의 쉬는 자세로 남는다 —
    지어내지 않는다.
    """
    shared = [b for b in target.order() if b in source.rest]
    out: list[dict[str, np.ndarray]] = []
    for local in frames:
        src = forward(source, local)
        want: dict[str, np.ndarray] = {}
        got: dict[str, np.ndarray] = {}
        for name in target.order():
            p = target.parent.get(name)
            parent_global = got.get(p, np.array([0.0, 0.0, 0.0, 1.0])) if p else None
            if name in source.rest:
                delta = quat_mul(src[name], quat_conj(source.rest_global(name)))
                here = quat_norm(quat_mul(delta, target.rest_global(name)))
            else:
                # 짝이 없는 뼈는 부모를 따라가되 제 쉬는 자세를 지킨다
                here = quat_norm(
                    quat_mul(parent_global, target.rest[name]) if parent_global is not None
                    else target.rest[name]
                )
            got[name] = here
            want[name] = quat_norm(
                quat_mul(quat_conj(parent_global), here) if parent_global is not None else here
            )
        out.append(want)
    return out, shared


def round_trip_error(source: Rig, target: Rig, frames: list[dict[str, np.ndarray]]) -> float:
    """
    ⚠️ **이 파일에서 가장 중요한 자다.**

    소스 → 타깃 → 소스로 되돌렸을 때 원래 회전이 나와야 한다. 켤레를 한 번
    잘못 걸거나 곱하는 차례를 바꾸면 여기서 바로 벌어진다 — 화면을 못 보는
    상태에서 이 수식이 맞는지 확인할 수 있는 거의 유일한 방법이다.
    """
    there, shared = retarget(source, target, frames)
    back, _ = retarget(target, source, there)
    worst = 0.0
    for before, after in zip(frames, back):
        for name in shared:
            a = quat_norm(before.get(name, source.rest[name]))
            b = quat_norm(after[name])
            # 사원수는 부호가 반대여도 같은 회전이다
            worst = max(worst, float(min(np.abs(a - b).max(), np.abs(a + b).max())))
    return worst


def build_rig(env, bone_name, transform_paths):
    """번들에서 리그와 (경로해시 → 뼈 이름) 표를 뽑는다."""
    import zlib

    tr = {o.path_id: o.read() for o in env.objects if o.type.name == "Transform"}
    parent = {}
    for pid, t in tr.items():
        for c in t.m_Children:
            parent[c.m_PathID] = pid
    name = {pid: bone_name(t) for pid, t in tr.items()}
    par, rest, off = {}, {}, {}
    for pid, t in tr.items():
        n = name[pid]
        par[n] = name.get(parent.get(pid))
        q, p = t.m_LocalRotation, t.m_LocalPosition
        rest[n] = np.array([q.x, q.y, q.z, q.w], dtype=np.float64)
        off[n] = np.array([p.x, p.y, p.z], dtype=np.float64)
    hashes = {
        zlib.crc32(p.encode()) & 0xFFFFFFFF: name[pid]
        for pid, p in transform_paths(env).items()
    }
    return Rig(par, rest, off), hashes
