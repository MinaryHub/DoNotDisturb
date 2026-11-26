"""Godot 4.5.1 실행 파일과 필요한 내보내기 템플릿만 받는다 (배포 빌드·새 개발 환경용).

템플릿 묶음(.tpz)은 1.3GB라 통째로 받지 않고, HTTP Range로 zip 목차를 읽어 필요한 파일만 꺼낸다.
사용: python3 tools/godot-setup.py [템플릿 이름 ...]   (기본: 웹 템플릿)
  예) python3 tools/godot-setup.py web_nothreads_release.zip linux_release.x86_64 windows_release_x86_64.exe
결과: tools/.godot/godot (실행 파일), ~/.local/share/godot/export_templates/4.5.1.stable/
"""
import io
import os
import stat
import sys
import urllib.request
import zipfile

VERSION = "4.5.1"
BASE = f"https://github.com/godotengine/godot-builds/releases/download/{VERSION}-stable/"
EDITOR = f"Godot_v{VERSION}-stable_linux.x86_64.zip"
TEMPLATES = f"Godot_v{VERSION}-stable_export_templates.tpz"
HERE = os.path.dirname(os.path.abspath(__file__))
BIN_DIR = os.path.join(HERE, ".godot")
TPL_DIR = os.path.expanduser(f"~/.local/share/godot/export_templates/{VERSION}.stable")


class RangeFile(io.RawIOBase):
    """원격 파일을 필요한 만큼만 읽는 파일 객체"""

    def __init__(self, url):
        self.url = url
        head = urllib.request.urlopen(urllib.request.Request(url, method="HEAD"))
        self.size = int(head.headers["Content-Length"])
        self.pos = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def tell(self):
        return self.pos

    def readinto(self, buf):
        n = min(len(buf), self.size - self.pos)
        if n <= 0:
            return 0
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"})
        data = urllib.request.urlopen(req).read()
        buf[: len(data)] = data
        self.pos += len(data)
        return len(data)


def extract(url, wanted, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    z = zipfile.ZipFile(io.BufferedReader(RangeFile(url), buffer_size=8 << 20))
    for name in wanted:
        dst = os.path.join(out_dir, os.path.basename(name))
        if os.path.exists(dst):
            continue
        member = next(n for n in z.namelist() if n == name or n.endswith("/" + name))
        with z.open(member) as src, open(dst + ".part", "wb") as f:
            while chunk := src.read(8 << 20):
                f.write(chunk)
        os.replace(dst + ".part", dst)
        print("받음:", dst)
    return [os.path.join(out_dir, os.path.basename(n)) for n in wanted]


def main():
    wanted = sys.argv[1:] or ["web_nothreads_release.zip"]
    binary = extract(BASE + EDITOR, [EDITOR.replace(".zip", "")], BIN_DIR)[0]
    target = os.path.join(BIN_DIR, "godot")
    if not os.path.exists(target):
        os.replace(binary, target)
    os.chmod(target, os.stat(target).st_mode | stat.S_IEXEC)
    extract(BASE + TEMPLATES, ["version.txt"] + wanted, TPL_DIR)
    print(target)


if __name__ == "__main__":
    main()
