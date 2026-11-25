# 构建高清部署包：dist2/
#   昼面 8K 原图直传（不二次编码）
#   云   8K 单通道灰度（着色器只读 .r，显存省 4 倍）
#   夜灯 4K / 月面 2K
import os, shutil
from PIL import Image

ROOT = r'D:\01\starry\earth'
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(ROOT, 'dist2', 'assets')
os.makedirs(OUT, exist_ok=True)

# 昼面：原样复制 8K JPEG
shutil.copyfile(os.path.join(A, 'day8k.jpg'), os.path.join(OUT, 'day.jpg'))

# 云：灰度 8K（云是无高频噪声的平滑遮罩，q62 在显示尺度上看不出差别，体积只剩 1/2）
im = Image.open(os.path.join(A, 'clouds8k.jpg')).convert('L')
im.save(os.path.join(OUT, 'clouds.jpg'), quality=62, optimize=True, progressive=True)

# 夜灯：4K RGB（城市灯光是暖白点，用默认色度抽样省体积）
im = Image.open(os.path.join(A, 'night8k.jpg')).convert('RGB').resize((4096, 2048), Image.LANCZOS)
im.save(os.path.join(OUT, 'lights.jpg'), quality=88, optimize=True, progressive=True)

# 月面：2K RGB
im = Image.open(os.path.join(A, 'moon8k.jpg')).convert('RGB').resize((2048, 1024), Image.LANCZOS)
im.save(os.path.join(OUT, 'moon.jpg'), quality=82, optimize=True, progressive=True, subsampling=0)

for n in ('spec.jpg', 'normal.jpg'):
    shutil.copyfile(os.path.join(A, n), os.path.join(OUT, n))

total = 0
for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    im = Image.open(p)
    sz = os.path.getsize(p)
    total += sz
    print(f'{f:14} {im.size[0]}x{im.size[1]:<6} {im.mode:5} {sz/1024:8.0f} KB')
print(f'{"合计":14} {"":22} {total/1048576:8.2f} MB')
