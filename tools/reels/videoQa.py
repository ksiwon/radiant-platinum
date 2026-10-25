"""완성한 쇼츠의 이음 · 번쩍임 · 정지를 잰다.

    py -3.13 tools/reels/videoQa.py .audit/reels/out/radiant-reveal-short-v139.mp4 .audit/reels/work/9x16-v139/stamps.txt

· 큐 경계 근처 프레임 차이 > 35 — 이음이 한 프레임에 화면을 바꾸는 곳
· 한 프레임 밝기 깜빡임(255→49→255처럼 양쪽으로 60 넘게 튀었다 돌아옴)
· 경계 밖 프레임 차이 > 60 — 게임 연출 안의 번쩍임이다(지우지 않는다)
· 6프레임 넘는 정지
"""
import subprocess,numpy as np,sys
v=sys.argv[1]; W,H=135,240
raw=subprocess.run(['ffmpeg','-v','error','-i',v,'-vf',f'scale={W}:{H},format=gray','-f','rawvideo','-'],capture_output=True).stdout
fr=np.frombuffer(raw,dtype=np.uint8).reshape(-1,H*W).astype(np.float32)
d=np.abs(fr[1:]-fr[:-1]).mean(axis=1); br=fr.mean(axis=1)
st=[l.split(' ') for l in open(sys.argv[2],encoding='utf8').read().split('\n') if l.strip()]
print('frames',len(fr),'dur',round(len(fr)/30,2))
bounds=[(c,float(t)) for c,t in st]
print('경계(큐 시작 전후 0.2초) 최대 프레임 차이 >35:')
for c,t in bounds:
    i=int(t*30); seg=d[max(0,i-3):i+6]
    if seg.max()>35: print(f"  {c:6s} t={t:6.2f} max={seg.max():5.1f}")
print('밝기 깜빡임(한 프레임 급락 후 복귀, |Δ|>60 양방향):')
for i in range(1,len(br)-1):
    if abs(br[i]-br[i-1])>60 and abs(br[i+1]-br[i])>60 and (br[i]-br[i-1])*(br[i+1]-br[i])<0: print(f"  t={i/30:6.2f}s  {br[i-1]:.0f}->{br[i]:.0f}->{br[i+1]:.0f}")
print('경계 밖 프레임 차이>60 (게임 연출 포함):')
for i,x in enumerate(d):
    t=(i+1)/30
    if x>60 and all(abs(t-b)>0.25 for _,b in bounds): print(f"  t={t:6.2f}s diff={x:5.1f}")
print('정지 6프레임+:')
run=0
for i,x in enumerate(d):
    if x<0.03: run+=1
    else:
        if run>=6: print(f"  t={(i-run+1)/30:6.2f}s {run}프레임")
        run=0
if run>=6: print(f"  t={(len(d)-run+1)/30:6.2f}s {run}프레임 (끝)")
