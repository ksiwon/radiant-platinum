"""찍은 장면(.audit/reels/take/<화면비>/<장면>/f-*.jpg)에서 멈춘 프레임 · 튀는 프레임을 잰다.

    cd .audit/reels/take/9x16 && py -3.13 ../../../../tools/reels/framecheck.py B1-room D5-first

frames.json의 시각은 가상 시계가 고르게 매긴 값이라 렌더가 끊겼는지의 증거가 못 된다 — 프레임마다 화면이 얼마나 바뀌었는지를 잰다.
dup = 거의 같은 프레임(카메라가 멈춘 구간 포함) · jump = 한 프레임에 화면이 크게 바뀐 곳(시점 전환 · 컷인).
"""
import os,sys,numpy as np
from PIL import Image
def load(p): return np.asarray(Image.open(p).convert('L').resize((135,240)),dtype=np.float32)
for d in sys.argv[1:]:
    fs=sorted(x for x in os.listdir(d) if x.endswith('.jpg'))
    prev=None; diffs=[]
    for f in fs:
        a=load(os.path.join(d,f))
        if prev is not None: diffs.append(float(np.abs(a-prev).mean()))
        prev=a
    dd=np.array(diffs); med=float(np.median(dd))
    dup=[i+2 for i,x in enumerate(dd) if x<0.02]            # 거의 같은 프레임(멈춤)
    jump=[(i+2,round(x,1)) for i,x in enumerate(dd) if x>max(8.0,med*6)]  # 튐
    print(f"{d:16s} n={len(fs):4d} med={med:5.2f} dup={len(dup):3d} {dup[:6]} jump={len(jump):2d} {jump[:6]}")
