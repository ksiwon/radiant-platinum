"""텍스처 시트 PNG를 생 RGBA로 뽑는다 — 노드 쪽 미리보기 렌더러가 읽는다.

영역 묶음은 번호로 고르고, 소품은 590개가 전부라 한 번에 다 뽑는다.
"""
import json, sys, os
from PIL import Image
D='public/data'
out=sys.argv[1]
os.makedirs(out, exist_ok=True)
idx=json.load(open(f'{D}/tex/index.json',encoding='utf-8'))
for si in [int(x) for x in sys.argv[2:]]:
    im=Image.open(f'{D}/tex/{si}.png').convert('RGBA')
    open(f'{out}/tex{si}.raw','wb').write(im.tobytes())
    json.dump({'w':im.width,'h':im.height,'items':idx['sets'][si]['items']},
              open(f'{out}/tex{si}.json','w'))
    print(si, im.width, im.height, len(idx['sets'][si]['items']))

props=json.load(open(f'{D}/props/index.json',encoding='utf-8'))
made=0
for pi, info in enumerate(props['sheets']):
    if not info: continue
    path=f'{D}/props/{pi}.png'
    if not os.path.exists(path): continue
    target=f'{out}/prop{pi}.raw'
    if os.path.exists(target): continue
    open(target,'wb').write(Image.open(path).convert('RGBA').tobytes())
    made+=1
print('소품 시트', made)
