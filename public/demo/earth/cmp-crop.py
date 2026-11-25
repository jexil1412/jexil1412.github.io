from PIL import Image, ImageDraw

ROOT = r'D:\01\starry\earth'
a = Image.open(ROOT + r'\cmp-old4k.png').convert('RGB')
b = Image.open(ROOT + r'\cmp-new8k.png').convert('RGB')

# 取地球主体中一块陆地+海洋的细节，放大 3 倍并排比较
box = (40, 600, 200, 720)
Z = 3
ca = a.crop(box).resize(((box[2]-box[0])*Z, (box[3]-box[1])*Z), Image.NEAREST)
cb = b.crop(box).resize(((box[2]-box[0])*Z, (box[3]-box[1])*Z), Image.NEAREST)

W, H = ca.width, ca.height
out = Image.new('RGB', (W*2 + 12, H + 26), (16, 18, 24))
out.paste(ca, (0, 26))
out.paste(cb, (W + 12, 26))
d = ImageDraw.Draw(out)
d.text((6, 8), 'OLD 4K cloud/d.  (deployed)', fill=(255, 170, 170))
d.text((W + 18, 8), 'NEW 8K cloud8k/day8k', fill=(170, 255, 190))
out.save(ROOT + r'\cmp-zoom.png')
print('saved', out.size)
