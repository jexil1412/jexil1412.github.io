# 把本地素材整理成站点可用的图片与可玩 demo
# 用法：pwsh -File scripts/prepare-assets.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = 'D:\MYSQL\homework\personal-site'
$uploads = Join-Path $root 'public\uploads\works'
$demo = Join-Path $root 'public\demo'
New-Item -ItemType Directory -Force -Path $uploads, $demo | Out-Null

function Resize-Jpeg {
  param([string]$Src, [string]$Dst, [int]$MaxW, [int]$Quality = 84)
  $img = [System.Drawing.Image]::FromFile($Src)
  try {
    $w = [Math]::Min($img.Width, $MaxW)
    $h = [int][Math]::Round($img.Height * ($w / $img.Width))
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $w, $h)
    $g.Dispose()
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$Quality)
    $dir = Split-Path -Parent $Dst
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $bmp.Save($Dst, $codec, $params)
    $bmp.Dispose()
  } finally { $img.Dispose() }
}

function Save-CoverSet {
  param([string]$Src, [string]$Dir, [string]$Name = 'cover')
  Resize-Jpeg -Src $Src -Dst (Join-Path $Dir "$Name-1600.jpg") -MaxW 1600
  Resize-Jpeg -Src $Src -Dst (Join-Path $Dir "$Name-800.jpg") -MaxW 800
}

# ---- 地球 ----
Save-CoverSet 'D:\01\starry\earth\preview-earth.png' (Join-Path $uploads 'earth')
Resize-Jpeg 'D:\01\starry\earth\preview-earth-phone.png' (Join-Path $uploads 'earth\gallery-1-800.jpg') 800
Resize-Jpeg 'D:\01\starry\preview-solar.png' (Join-Path $uploads 'earth\gallery-2-800.jpg') 800

# ---- 花（指尖花园）----
Save-CoverSet 'D:\MYSQL\homework\finger-bloom\preview\desktop.png' (Join-Path $uploads 'flower')
Resize-Jpeg 'D:\MYSQL\homework\finger-bloom\preview\pointer.png' (Join-Path $uploads 'flower\gallery-1-800.jpg') 800
Resize-Jpeg 'D:\MYSQL\homework\finger-bloom\preview\desktop2.png' (Join-Path $uploads 'flower\gallery-2-800.jpg') 800
Resize-Jpeg 'D:\MYSQL\homework\finger-bloom\preview\mobile.png' (Join-Path $uploads 'flower\gallery-3-800.jpg') 800

# ---- 眼睛 ----
Save-CoverSet 'D:\MYSQL\homework\eye-bloom\preview\amber.png' (Join-Path $uploads 'eye')
Resize-Jpeg 'D:\MYSQL\homework\eye-bloom\preview\cyan.png' (Join-Path $uploads 'eye\gallery-1-800.jpg') 800
Resize-Jpeg 'D:\MYSQL\homework\eye-bloom\preview\crimson.png' (Join-Path $uploads 'eye\gallery-2-800.jpg') 800
Resize-Jpeg 'D:\MYSQL\homework\eye-bloom\preview\closed.png' (Join-Path $uploads 'eye\gallery-3-800.jpg') 800
Resize-Jpeg 'D:\MYSQL\homework\eye-bloom\preview\desktop.png' (Join-Path $uploads 'eye\gallery-4-800.jpg') 800

# ---- 普通话 App：用应用图标做一张「标本卡」式封面（不是伪造截图）----
$iconPath = 'D:\MYSQL\homework\普通话学习\harmony\AppScope\resources\base\media\app_icon.png'
$appDir = Join-Path $uploads 'mandarin-app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Resize-Jpeg $iconPath (Join-Path $appDir 'icon-800.jpg') 800 92

$W = 1600; $H = 1000
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$paper = [System.Drawing.Color]::FromArgb(245, 241, 232)
$ink = [System.Drawing.Color]::FromArgb(28, 27, 23)
$muted = [System.Drawing.Color]::FromArgb(110, 106, 94)
$accent = [System.Drawing.Color]::FromArgb(166, 61, 47)
$g.Clear($paper)
$pen = New-Object System.Drawing.Pen($ink, 1)
$g.DrawRectangle($pen, 40, 40, $W - 80, $H - 80)
$icon = [System.Drawing.Image]::FromFile($iconPath)
$g.DrawImage($icon, 120, 150, 320, 320)
$icon.Dispose()
$fTitle = New-Object System.Drawing.Font('Microsoft YaHei', 62, [System.Drawing.FontStyle]::Bold)
$fSub = New-Object System.Drawing.Font('Microsoft YaHei', 24)
$fMono = New-Object System.Drawing.Font('Consolas', 18)
$bTitle = New-Object System.Drawing.SolidBrush($ink)
$bMuted = New-Object System.Drawing.SolidBrush($muted)
$bAccent = New-Object System.Drawing.SolidBrush($accent)
$g.DrawString('普通话正音器', $fTitle, $bTitle, 120, 540)
$g.DrawString('离线语音 · 河南考生版', $fSub, $bMuted, 124, 660)
$g.FillRectangle($bAccent, 124, 730, 64, 3)
$g.DrawString('WINDOWS / OFFLINE / 2026', $fMono, $bMuted, 124, 760)
$g.DrawString('NO.01', $fMono, $bAccent, 124, 96)
$g.Dispose()
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]88)
$bmp.Save((Join-Path $appDir 'cover-1600.jpg'), $codec, $params)
$bmp.Dispose()

# ---- 可玩 demo：直接复制三个项目（排除压缩包与预览大图）----
function Copy-Demo {
  param([string]$Src, [string]$Dst)
  if (Test-Path $Dst) { Remove-Item -Recurse -Force $Dst }
  New-Item -ItemType Directory -Force -Path $Dst | Out-Null
  Copy-Item -Path (Join-Path $Src '*') -Destination $Dst -Recurse -Force
  foreach ($junk in @('preview', '.git', 'node_modules')) {
    $p = Join-Path $Dst $junk
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
  }
  Get-ChildItem $Dst -Recurse -File -Include *.zip, *.apk -ErrorAction SilentlyContinue | Remove-Item -Force
}
Copy-Demo 'D:\01\starry\earth' (Join-Path $demo 'earth')
Copy-Demo 'D:\MYSQL\homework\finger-bloom' (Join-Path $demo 'flower')
Copy-Demo 'D:\MYSQL\homework\eye-bloom' (Join-Path $demo 'eye')

Write-Host 'assets ready'
Get-ChildItem $uploads -Recurse -File | Measure-Object Length -Sum | ForEach-Object { "uploads: $($_.Count) files, $([Math]::Round($_.Sum/1MB,1)) MB" }