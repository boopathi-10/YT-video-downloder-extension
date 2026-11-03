import os
from PIL import Image, ImageDraw

def create_icon(size):
    # Create image with transparent background (RGBA)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Padding
    pad = max(1, size // 16)
    
    # Draw rounded background circle/squircle
    # YouTube brand red gradient/color #FF0033
    bg_color = (255, 0, 51, 255)
    draw.ellipse([pad, pad, size - pad, size - pad], fill=bg_color)
    
    # Inner subtle glow/border
    border_color = (255, 255, 255, 40)
    draw.ellipse([pad + 1, pad + 1, size - pad - 1, size - pad - 1], outline=border_color, width=max(1, size // 32))
    
    # Arrow and tray dimensions
    cx = size / 2.0
    cy = size / 2.0
    s = size / 32.0  # scale factor
    
    # Draw download arrow (White)
    # Stem of arrow: rectangle from (cx - 2*s, cy - 7*s) to (cx + 2*s, cy + 1*s)
    stem_w = max(2.0, 3.0 * s)
    stem_top = cy - 7.0 * s
    stem_bot = cy + 1.0 * s
    draw.rectangle([cx - stem_w / 2.0, stem_top, cx + stem_w / 2.0, stem_bot], fill=(255, 255, 255, 255))
    
    # Arrow head (triangle)
    head_left = cx - 6.5 * s
    head_right = cx + 6.5 * s
    head_top = stem_bot - 1.0 * s
    head_tip = cy + 5.5 * s
    draw.polygon([(cx, head_tip), (head_left, head_top), (head_right, head_top)], fill=(255, 255, 255, 255))
    
    # Bottom tray/line
    tray_y = cy + 8.5 * s
    tray_thick = max(1.5, 2.5 * s)
    tray_w = 7.5 * s
    draw.rectangle([cx - tray_w, tray_y, cx + tray_w, tray_y + tray_thick], fill=(255, 255, 255, 255))
    
    return img

sizes = [16, 32, 48, 128]
out_dir = os.path.dirname(os.path.abspath(__file__))

for size in sizes:
    icon = create_icon(size)
    path = os.path.join(out_dir, f"icon{size}.png")
    icon.save(path, "PNG")
    print(f"Generated {path} ({size}x{size})")

print("All icons generated successfully!")
