#!/usr/bin/env python3
"""生成 macOS 需要的图标资源（Windows 用不到，不影响原有打包）。

输入：build/icon.png（256x256，橙色圆角方块 + 白色太阳）
输出：
  build/icon.icns            macOS 应用图标（按 Apple 网格留 100px 透明边）
  build/trayTemplate.png     菜单栏模板图 16x16（黑 + alpha）
  build/trayTemplate@2x.png  菜单栏模板图 32x32

依赖：Pillow（pip install pillow）；macOS 自带 iconutil 生成 .icns。
用法：python3 scripts/make-mac-icons.py
"""
import math
import os
import shutil
import subprocess

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')

BG = (255, 122, 26, 255)
WHITE = (255, 255, 255, 255)
SS = 8  # 超采样倍数

# 从 build/icon.png（256px 设计稿）量出来的比例
DESIGN = 256.0
CORNER_RATIO = 56.0 / DESIGN
GLYPH_SPAN = 184.0 / DESIGN  # 太阳字形（含光线）占底块的比例
CIRCLE_RATIO = 48.0 / DESIGN
RAY_WIDTH_RATIO = 10.0 / DESIGN
RAY_INNER_RATIO = 71.0 / DESIGN
RAY_OUTER_RATIO = 92.0 / DESIGN


def draw_icon(size, content_ratio, fg, with_bg, glyph_fill):
    """画一张 size×size 的图标。

    content_ratio: 底块（圆角方块）占画布的比例；with_bg=False 时不画底块。
    glyph_fill: 太阳字形占底块（或画布）的比例。
    """
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = s / 2.0

    bg_px = size * content_ratio * SS
    if with_bg:
        radius = bg_px * CORNER_RATIO
        d.rounded_rectangle(
            [cx - bg_px / 2, cy - bg_px / 2, cx + bg_px / 2, cy + bg_px / 2],
            radius=radius,
            fill=BG,
        )

    base = bg_px if with_bg else s
    # 设计稿里字形跨度 184px（半径 92），换算到目标尺寸
    k = (glyph_fill * base) / 184.0

    def circle(px_ratio):
        return px_ratio * DESIGN * k

    cr = circle(CIRCLE_RATIO)
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=fg)

    w = max(1, int(round(circle(RAY_WIDTH_RATIO))))
    inner = circle(RAY_INNER_RATIO)
    outer = circle(RAY_OUTER_RATIO)
    for i in range(8):
        a = math.radians(i * 45)
        dx, dy = math.cos(a), math.sin(a)
        x0, y0 = cx + dx * inner, cy + dy * inner
        x1, y1 = cx + dx * outer, cy + dy * outer
        d.line([(x0, y0), (x1, y1)], fill=fg, width=w)
        r = w / 2.0
        for (px, py) in ((x0, y0), (x1, y1)):
            d.ellipse([px - r, py - r, px + r, py + r], fill=fg)

    return img.resize((size, size), Image.LANCZOS)


def make_app_icon(size):
    """macOS 应用图标：内容占 824/1024（Apple 图标网格），四周留透明边。"""
    return draw_icon(size, 824.0 / 1024.0, WHITE, True, GLYPH_SPAN)


def make_tray_icon(size):
    """菜单栏模板图：纯黑字形 + 透明背景，系统按浅/深色菜单栏自动反色。"""
    return draw_icon(size, 1.0, (0, 0, 0, 255), False, 0.92)


def main():
    os.makedirs(BUILD, exist_ok=True)

    # 1) .icns
    iconset = os.path.join(BUILD, 'icon.iconset')
    if os.path.isdir(iconset):
        shutil.rmtree(iconset)
    os.makedirs(iconset)
    for base in (16, 32, 128, 256, 512):
        make_app_icon(base).save(os.path.join(iconset, f'icon_{base}x{base}.png'))
        make_app_icon(base * 2).save(os.path.join(iconset, f'icon_{base}x{base}@2x.png'))
    subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', os.path.join(BUILD, 'icon.icns')], check=True)
    shutil.rmtree(iconset)

    # 2) 菜单栏模板图（16pt，@2x 供 Retina）
    make_tray_icon(16).save(os.path.join(BUILD, 'trayTemplate.png'))
    make_tray_icon(32).save(os.path.join(BUILD, 'trayTemplate@2x.png'))

    # 3) 预览图（方便肉眼检查，不打进安装包）
    make_app_icon(512).save(os.path.join(BUILD, 'icon-mac-preview.png'))
    print('done: build/icon.icns, build/trayTemplate.png, build/trayTemplate@2x.png')


if __name__ == '__main__':
    main()
