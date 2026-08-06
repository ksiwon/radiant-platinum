import sys
from PIL import Image
d=sys.argv[1]
Image.open(d+'/scene.ppm').save(d+'/scene.png')
print('저장')
