"""Generates the مِرفق app icons (favicon.svg + PNGs) from one geometry
definition so the SVG and the raster icons can never drift apart.

Run: python3 tools/generate-icons.py   (from artifacts/mirfaq)
"""
import zlib, struct, math

BG = (8, 145, 178)   # #0891b2
FG = (255, 255, 255)

HEAD_CX, HEAD_CY = 90, 60
HEAD_OUTER, HEAD_INNER = 26, 13
NOTCH_HALF = 11
HANDLE_X, HANDLE_W = 79, 22
HANDLE_TOP, HANDLE_BOTTOM = 60, 140


def rounded_rect(x, y, w, h, r, px, py):
    if px < x or py < y or px > x + w or py > y + h:
        return False
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def rotate(px, py, cx, cy, deg):
    a = math.radians(deg)
    dx, dy = px - cx, py - cy
    return cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)


def is_fg(px, py):
    """Design space is 180x180, identical to favicon.svg."""
    rx, ry = rotate(px, py, 90, 90, 45)

    if rounded_rect(HANDLE_X, HANDLE_TOP, HANDLE_W, HANDLE_BOTTOM - HANDLE_TOP, 11, rx, ry):
        return True

    d = math.hypot(rx - HEAD_CX, ry - HEAD_CY)
    in_ring = HEAD_INNER <= d <= HEAD_OUTER
    in_notch = abs(rx - HEAD_CX) <= NOTCH_HALF and ry <= HEAD_CY
    return in_ring and not in_notch


def render(size, samples=4):
    scale = size / 180
    out = bytearray()
    total = samples * samples
    for y in range(size):
        out.append(0)
        for x in range(size):
            hits = inside = 0
            for sy in range(samples):
                for sx in range(samples):
                    px = (x + (sx + 0.5) / samples) / scale
                    py = (y + (sy + 0.5) / samples) / scale
                    if not rounded_rect(0, 0, 180, 180, 40, px, py):
                        continue
                    inside += 1
                    if is_fg(px, py):
                        hits += 1
            if inside == 0:
                out += bytes(4)
                continue
            t = hits / inside
            out += bytes(round(BG[i] + (FG[i] - BG[i]) * t) for i in range(3))
            out.append(round(255 * inside / total))
    return bytes(out)


def write_png(path, size):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(render(size), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


SVG = f"""<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="180" height="180" rx="40" fill="#0891b2"/>
  <g transform="rotate(-45 90 90)">
    <rect x="{HANDLE_X}" y="{HANDLE_TOP}" width="{HANDLE_W}" height="{HANDLE_BOTTOM - HANDLE_TOP}" rx="11" fill="#ffffff"/>
    <path fill="#ffffff" fill-rule="evenodd" d="M{HEAD_CX - NOTCH_HALF} {HEAD_CY - HEAD_OUTER + 2}
      A{HEAD_OUTER} {HEAD_OUTER} 0 1 0 {HEAD_CX + NOTCH_HALF} {HEAD_CY - HEAD_OUTER + 2}
      L{HEAD_CX + NOTCH_HALF} {HEAD_CY}
      A{HEAD_INNER} {HEAD_INNER} 0 1 1 {HEAD_CX - NOTCH_HALF} {HEAD_CY} Z"/>
  </g>
</svg>
"""

if __name__ == "__main__":
    with open("public/favicon.svg", "w", encoding="utf-8") as fh:
        fh.write(SVG)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        write_png(f"public/{name}", size)
        print("wrote", name)
