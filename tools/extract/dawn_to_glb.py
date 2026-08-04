"""Dawn(.dae) → glb 변환 (PLAN §4.3). Blender 4.2 LTS에서 실행한다.

    blender -b --factory-startup --python tools/extract/dawn_to_glb.py

주의사항 두 가지:

1. **스케일을 여기서 만지지 않는다.** 아머처에 스케일을 걸고 내보내면 역바인드 행렬과
   노드 스케일에 이중으로 실려 결과가 제곱으로 줄어든다(1.50m 의도 → 실측 0.88m).
   정규화는 로드 시점 `normalizeModel()`이 담당한다.
2. **Base Color를 베이크된 알베도로 교체한다.** 원본 `_col`은 알베도가 아니라 그레이스케일
   음영 맵이라 그대로 쓰면 캐릭터가 순백으로 나온다. `bdsp_bake_albedo.py`가 미리 구워둔
   `<머티리얼>_albedo.png`로 갈아끼운다.

Blender 5.0에서는 Collada 임포트가 제거됐으므로 4.2 LTS여야 한다.
"""

import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DAE = os.path.join(ROOT, "raw", "models", "Dawn", "Dawn.dae")
BAKED = os.path.join(ROOT, "raw", "models", "Dawn", "baked")
OUT = os.path.join(ROOT, "public", "models", "dawn.glb")

# 기본 복장과 겹쳐 z-fighting을 내는 대체 복장 메시. 엔진이 이름으로 숨긴다.
ALT_OUTFIT = {"pc0002_00_hair2Skin", "pc0002_00_shoes2Skin"}


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.collada_import(filepath=DAE)

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    print(f"[dawn] 메시 {len(meshes)}개, 액션 {len(bpy.data.actions)}개")

    swapped, missing = 0, []
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        path = os.path.join(BAKED, f"{mat.name}_albedo.png")
        if not os.path.exists(path):
            missing.append(mat.name)
            continue

        img = bpy.data.images.load(path, check_existing=True)
        base = bsdf.inputs["Base Color"]
        node = base.links[0].from_node if base.is_linked else None
        if node is not None and node.type == "TEX_IMAGE":
            node.image = img  # UV 연결을 그대로 두고 이미지만 교체
        else:
            node = mat.node_tree.nodes.new("ShaderNodeTexImage")
            node.image = img
            mat.node_tree.links.new(base, node.outputs["Color"])
        swapped += 1

    print(f"[dawn] 알베도 교체 {swapped}개" + (f", 누락 {missing}" if missing else ""))
    if missing:
        print("[dawn] ! bdsp_bake_albedo.py를 먼저 돌려야 한다", file=sys.stderr)

    for o in meshes:
        if o.name in ALT_OUTFIT:
            print(f"[dawn] 대체 복장 메시 유지(엔진이 숨김): {o.name}")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        use_selection=False,
    )
    print(f"[dawn] 완료: {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
