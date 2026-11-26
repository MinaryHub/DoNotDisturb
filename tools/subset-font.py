#!/usr/bin/env python3
"""한글 글꼴을 게임에서 쓰는 글자만 남겨 줄인다 (웹 내보내기 크기를 줄이려고).

남기는 글자: KS X 1001 한글 2,350자 + data/·game/ 안의 모든 글자 + 아스키·흔한 문장 부호.
원본: Noto Sans KR (SIL Open Font License 1.1) — https://fonts.google.com/noto/specimen/Noto+Sans+KR
사용: python3 tools/subset-font.py <원본 NotoSansKR[wght].ttf>
"""
import pathlib, sys
from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
src = sys.argv[1]
out = root / "game/assets/fonts/NotoSansKR-subset.ttf"

chars = set(chr(c) for c in range(0x20, 0x7F))
# KS X 1001 완성형 한글 2,350자 (EUC-KR B0A1~C8FE)
for hi in range(0xB0, 0xC9):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode("euc-kr"))
        except UnicodeDecodeError:
            pass
chars.update("·…‘’“”–—•※→←↑↓▲▼◀▶●○◎■□★☆♥♡~％％、。「」『』【】〈〉《》！？：；（）［］＋－＝ⅠⅡⅢ")
for pattern in ("data/**/*.json", "data/**/*.csv", "game/**/*.gd", "game/**/*.tscn"):
    for p in root.glob(pattern):
        chars.update(p.read_text(encoding="utf-8"))
chars = {c for c in chars if c.isprintable() or c == " "}

opts = subset.Options()
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
opts.notdef_outline = True
font = subset.load_font(src, opts)
s = subset.Subsetter(opts)
s.populate(text="".join(sorted(chars)))
s.subset(font)
subset.save_font(font, str(out), opts)
print(f"{len(chars)}자 → {out.relative_to(root)} ({out.stat().st_size // 1024} KB)")
