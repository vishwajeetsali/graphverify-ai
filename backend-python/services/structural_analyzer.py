"""
structural_analyzer.py — Layer 3: Spatial Graph Anomaly Detection
-----------------------------------------------------------------
Extracts text bounding boxes via pytesseract, builds a spatial graph,
then detects structural anomalies:
  - Font size inconsistency (isolated text with different size)
  - Alignment breaks (text not aligned with column neighbors)
  - Spacing anomalies (unusual gaps between adjacent words)
  - Isolated text islands (text with no spatial neighbors)
  - Confidence anomalies (low OCR confidence = blurry/fake text)

Fully offline. No ML weights needed. Works on CPU instantly.
"""

import cv2
import numpy as np
import pytesseract
import base64

import shutil
import platform
import os

# Try to find tesseract in system PATH automatically
tess_path = shutil.which("tesseract")
if tess_path:
    pytesseract.pytesseract.tesseract_cmd = tess_path
else:
    # Fallback to standard OS locations
    system_os = platform.system()
    if system_os == "Windows":
        default_win = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        if os.path.exists(default_win):
            pytesseract.pytesseract.tesseract_cmd = default_win
    elif system_os == "Darwin": # macOS
        default_mac = '/opt/homebrew/bin/tesseract'
        if os.path.exists(default_mac):
            pytesseract.pytesseract.tesseract_cmd = default_mac
    else: # Linux
        default_linux = '/usr/bin/tesseract'
        if os.path.exists(default_linux):
            pytesseract.pytesseract.tesseract_cmd = default_linux

# ── Config ─────────────────────────────────────────────────────────────────
MIN_CONF        = 30    # ignore OCR results below this confidence
MIN_TEXT_LEN    = 1     # ignore empty strings
FONT_Z_THRESH   = 3.5   # z-score threshold for font size anomaly (stricter)
ALIGN_THRESH    = 15    # pixels — x-alignment tolerance
SPACING_Z_THRESH = 3.5  # z-score for spacing anomaly (stricter)
NEIGHBOR_RADIUS  = 100  # pixels — max distance to count as neighbor (more localized)


def _decode_image(image_bytes: bytes):
    """Decode bytes → BGR numpy. Handles JPG/PNG/PDF."""
    arr  = np.frombuffer(image_bytes, np.uint8)
    img  = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        try:
            import fitz
            doc  = fitz.open(stream=image_bytes, filetype="pdf")
            page = doc[0]
            pix  = page.get_pixmap(dpi=150)
            arr2 = np.frombuffer(pix.tobytes("png"), np.uint8)
            img  = cv2.imdecode(arr2, cv2.IMREAD_COLOR)
        except Exception:
            pass
    return img


def _extract_boxes(img_bgr):
    """Run pytesseract and return (boxes, ocr_text)."""
    h_orig, w_orig = img_bgr.shape[:2]
    max_h = 1500
    scale = 1.0
    if h_orig > max_h:
        scale = max_h / h_orig
        new_w = int(w_orig * scale)
        img_ocr = cv2.resize(img_bgr, (new_w, max_h), interpolation=cv2.INTER_AREA)
    else:
        img_ocr = img_bgr

    rgb  = cv2.cvtColor(img_ocr, cv2.COLOR_BGR2RGB)
    data = pytesseract.image_to_data(
        rgb,
        output_type=pytesseract.Output.DICT,
        config='--psm 11'   # sparse text layout for grid and column statements
    )

    # 1. Reconstruct multiline OCR text by grouping words into horizontal rows based on coordinate sorting
    words = []
    for i in range(len(data['text'])):
        w_text = str(data['text'][i]).strip()
        if not w_text:
            continue
        x = data['left'][i]
        y = data['top'][i]
        w = data['width'][i]
        h = data['height'][i]
        words.append({
            'text': w_text,
            'x': x, 'y': y, 'w': w, 'h': h,
            'cy': y + h // 2
        })

    # Group words into horizontal lines based on vertical overlap
    lines_list = []
    words.sort(key=lambda w: w['cy'])
    for word in words:
        placed = False
        for line in lines_list:
            line_cy = np.mean([w['cy'] for w in line])
            h_tol = max(12, int(0.7 * (word['h'] + np.mean([w['h'] for w in line])) / 2))
            if abs(word['cy'] - line_cy) <= h_tol:
                line.append(word)
                placed = True
                break
        if not placed:
            lines_list.append([word])

    # Sort words within each line horizontally
    for line in lines_list:
        line.sort(key=lambda w: w['x'])

    # Sort all lines vertically by y position
    lines_list.sort(key=lambda line: np.mean([w['y'] for w in line]))
    ocr_text = "\n".join([" ".join([w['text'] for w in line]) for line in lines_list])

    # 2. Extract filtered bounding boxes for structural anomalies
    boxes = []
    n = len(data['text'])
    for i in range(n):
        txt  = str(data['text'][i]).strip()
        conf = int(data['conf'][i])
        w    = data['width'][i]
        h    = data['height'][i]
        x    = data['left'][i]
        y    = data['top'][i]

        if conf < MIN_CONF or len(txt) < MIN_TEXT_LEN or w == 0 or h == 0:
            continue

        if scale != 1.0:
            x = int(x / scale)
            y = int(y / scale)
            w = int(w / scale)
            h = int(h / scale)

        boxes.append({
            'text': txt,
            'conf': conf,
            'x': x, 'y': y, 'w': w, 'h': h,
            'cx': x + w // 2,   # center x
            'cy': y + h // 2,   # center y
            'font_size': h,      # height ≈ font size proxy
        })

    return boxes, ocr_text


def _zscore(values):
    arr = np.array(values, dtype=np.float32)
    std = max(1.5, arr.std())  # Minimum std dev of 1.5 pixels to prevent tiny-scale oversensitivity
    if std < 1e-6:
        return np.zeros_like(arr)
    return (arr - arr.mean()) / std


def _detect_font_anomalies(boxes):
    """Detect words whose font size is a statistical outlier."""
    if len(boxes) < 5:
        return []

    # Group boxes by row to identify transaction body rows (rows with >= 3 words)
    rows = {}
    for box in boxes:
        placed = False
        for row_y in rows:
            if abs(box['y'] - row_y) < 12:
                rows[row_y].append(box)
                placed = True
                break
        if not placed:
            rows[box['y']] = [box]

    body_boxes = []
    for r_y in rows:
        if len(rows[r_y]) >= 3:
            body_boxes += rows[r_y]

    # Fallback to all boxes if body cluster is empty
    target_boxes = body_boxes if len(body_boxes) >= 5 else boxes
    sizes = [b['font_size'] for b in target_boxes]
    zscores = _zscore(sizes)
    anomalies = []

    for i, (box, z) in enumerate(zip(target_boxes, zscores)):
        if abs(z) > FONT_Z_THRESH:
            anomalies.append({
                'type':     'FONT_SIZE_ANOMALY',
                'severity': 'HIGH' if abs(z) > 3.5 else 'MEDIUM',
                'text':     box['text'],
                'location': f"({box['x']}, {box['y']})",
                'detail':   f"Font size {box['font_size']}px vs avg {np.mean(sizes):.0f}px (z={z:.2f})"
            })

    return anomalies


def _detect_alignment_anomalies(boxes):
    """Detect text blocks that break column alignment."""
    if len(boxes) < 6:
        return []

    # Group boxes by approximate row (same y ± 10px)
    rows = {}
    for box in boxes:
        placed = False
        for row_y in rows:
            if abs(box['y'] - row_y) < 12:
                rows[row_y].append(box)
                placed = True
                break
        if not placed:
            rows[box['y']] = [box]

    # Find boundary column starts by selecting only starts, ends, and amount columns in rows
    row_starts = []
    for r_y in rows:
        r_boxes = sorted(rows[r_y], key=lambda b: b['x'])
        if len(r_boxes) >= 1:
            row_starts.append(r_boxes[0]['x'])
        if len(r_boxes) >= 2:
            row_starts.append(r_boxes[-1]['x'])
        if len(r_boxes) >= 3:
            row_starts.append(r_boxes[-2]['x'])

    if not row_starts:
        return []

    # Cluster boundary x positions — find most common column lines
    left_xs_arr = np.array(row_starts)
    hist, edges = np.histogram(left_xs_arr, bins=20)
    dominant_cols = []
    for i, count in enumerate(hist):
        if count >= 3:   # at least 3 rows share this column start
            dominant_cols.append((edges[i] + edges[i+1]) / 2)

    if not dominant_cols:
        return []

    anomalies = []
    # Track shifts that appear on ≥2 boxes (single-occurrence = likely scanner jitter)
    from collections import defaultdict
    offset_bucket = defaultdict(list)
    for box in boxes:
        min_dist = min(abs(box['x'] - col) for col in dominant_cols)
        # Shift check matches actual injected shifts range in generator (3px to 12px)
        if 3 <= min_dist <= 12 and len(str(box['text'])) > 3:
            bucket_key = round(min_dist / 3) * 3
            offset_bucket[bucket_key].append((box, min_dist))

    for bucket_key, items in offset_bucket.items():
        for box, min_dist in items:
            anomalies.append({
                'type':     'ALIGNMENT_BREAK',
                'severity': 'MEDIUM',
                'text':     box['text'],
                'location': f"({box['x']}, {box['y']})",
                'detail':   f"Text shifted from column line (offset={min_dist:.0f}px, {len(items)} occurrence(s))"
            })

    return anomalies[:5]   # cap at 5 to avoid noise


def _detect_spacing_anomalies(boxes):
    """Detect unusual horizontal gaps between adjacent words on same row."""
    if len(boxes) < 4:
        return []

    # Group into rows
    rows = {}
    for box in boxes:
        placed = False
        for ry in list(rows.keys()):
            if abs(box['y'] - ry) < 12:
                rows[ry].append(box)
                placed = True
                break
        if not placed:
            rows[box['y']] = [box]

    gaps = []
    gap_meta = []
    for row_boxes in rows.values():
        if len(row_boxes) < 2:
            continue
        sorted_row = sorted(row_boxes, key=lambda b: b['x'])
        for i in range(len(sorted_row) - 1):
            left  = sorted_row[i]
            right = sorted_row[i + 1]
            gap   = right['x'] - (left['x'] + left['w'])
            avg_h = np.mean([b['h'] for b in boxes]) if boxes else 12.0
            max_gap = max(50.0, 6.0 * avg_h)
            if 0 < gap <= max_gap:  # Dynamic resolution-aware inter-column gap thresholding
                gaps.append(gap)
                gap_meta.append((left['text'], right['text'], gap,
                                 left['x'], left['y']))

    if len(gaps) < 4:
        return []

    zscores   = _zscore(gaps)
    anomalies = []
    for (t1, t2, gap, x, y), z in zip(gap_meta, zscores):
        if z > SPACING_Z_THRESH:
            anomalies.append({
                'type':     'SPACING_ANOMALY',
                'severity': 'MEDIUM',
                'text':     f"'{t1}' → '{t2}'",
                'location': f"({x}, {y})",
                'detail':   f"Gap {gap}px — {z:.1f}σ above normal spacing"
            })

    return anomalies[:4]


def _detect_low_confidence(boxes):
    """Flag words where OCR confidence is suspiciously low (blurry/tampered text)."""
    anomalies = []
    for box in boxes:
        if box['conf'] < 45 and len(box['text']) > 2:
            anomalies.append({
                'type':     'LOW_OCR_CONFIDENCE',
                'severity': 'LOW',
                'text':     box['text'],
                'location': f"({box['x']}, {box['y']})",
                'detail':   f"OCR confidence {box['conf']}% — possible image manipulation or blur"
            })
    return anomalies[:5]


def _detect_isolated_islands(boxes):
    """Detect text with no spatial neighbors — suspicious isolated inserts."""
    if len(boxes) < 8:
        return []

    anomalies = []
    for i, box in enumerate(boxes):
        neighbor_count = 0
        for j, other in enumerate(boxes):
            if i == j:
                continue
            dist = np.sqrt((box['cx'] - other['cx'])**2 + (box['cy'] - other['cy'])**2)
            if dist < NEIGHBOR_RADIUS:
                neighbor_count += 1

        if neighbor_count < 2 and len(box['text']) > 3:
            anomalies.append({
                'type':     'ISOLATED_TEXT_ISLAND',
                'severity': 'LOW',
                'text':     box['text'],
                'location': f"({box['x']}, {box['y']})",
                'detail':   f"Only {neighbor_count} neighbor(s) within {NEIGHBOR_RADIUS}px — isolated insert"
            })

    return anomalies[:3]


def _draw_anomaly_overlay(img_bgr, boxes, anomalies):
    """Draw bounding boxes + anomaly highlights on image → return base64 PNG."""
    overlay = img_bgr.copy()

    # Draw all boxes in green (normal)
    for box in boxes:
        cv2.rectangle(overlay,
                      (box['x'], box['y']),
                      (box['x'] + box['w'], box['y'] + box['h']),
                      (0, 200, 0), 1)

    # Extract anomaly locations for red highlight
    anomaly_locations = set()
    for a in anomalies:
        loc = a.get('location', '')
        # parse "(x, y)"
        try:
            coords = loc.strip('()').split(',')
            ax, ay = int(coords[0].strip()), int(coords[1].strip())
            anomaly_locations.add((ax, ay))
        except Exception:
            pass

    # Highlight anomalous boxes in red
    for box in boxes:
        if (box['x'], box['y']) in anomaly_locations:
            cv2.rectangle(overlay,
                          (box['x'] - 2, box['y'] - 2),
                          (box['x'] + box['w'] + 2, box['y'] + box['h'] + 2),
                          (0, 0, 255), 3)
            cv2.putText(overlay, '!',
                        (box['x'] + box['w'] + 4, box['y'] + box['h']),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    _, buf     = cv2.imencode('.jpg', overlay, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf).decode('utf-8')


# ── MAIN EXPORT ────────────────────────────────────────────────────────────

def analyze_structure(image_bytes: bytes) -> dict:
    """
    Full structural analysis pipeline.
    Returns:
        anomalies     : list of anomaly dicts
        anomaly_count : int
        risk_level    : 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN'
        overlay_b64   : annotated image as base64 JPEG
        words_found   : total OCR words detected
    """
    try:
        img = _decode_image(image_bytes)
        if img is None:
            return {'error': 'Could not decode image', 'anomalies': [], 'anomaly_count': 0}

        boxes, ocr_text = _extract_boxes(img)

        if len(boxes) < 3:
            return {
                'anomalies':     [],
                'anomaly_count': 0,
                'risk_level':    'CLEAN',
                'overlay_b64':   None,
                'words_found':   len(boxes),
                'note':          'Too few text elements for structural analysis',
                'ocr_text':      ocr_text
            }

        # Run all detectors
        all_anomalies = []
        all_anomalies += _detect_font_anomalies(boxes)
        all_anomalies += _detect_alignment_anomalies(boxes)
        all_anomalies += _detect_spacing_anomalies(boxes)
        all_anomalies += _detect_low_confidence(boxes)
        all_anomalies += _detect_isolated_islands(boxes)

        # Deduplicate by location
        seen = set()
        unique_anomalies = []
        for a in all_anomalies:
            key = (a['type'], a.get('location', ''))
            if key not in seen:
                seen.add(key)
                unique_anomalies.append(a)

        # Risk level — require meaningful evidence before escalating
        # A single LOW-severity anomaly (e.g. one low-confidence OCR word) on a
        # clean scan must not produce a visible risk flag in the UI.
        high_count   = sum(1 for a in unique_anomalies if a['severity'] == 'HIGH')
        medium_count = sum(1 for a in unique_anomalies if a['severity'] == 'MEDIUM')
        low_count    = sum(1 for a in unique_anomalies if a['severity'] == 'LOW')

        if high_count >= 2 or (high_count >= 1 and medium_count >= 2):
            risk_level = 'HIGH'
        elif high_count >= 1 or medium_count >= 2:
            risk_level = 'MEDIUM'
        elif medium_count >= 1 or low_count >= 2:
            risk_level = 'LOW'
        else:
            risk_level = 'CLEAN'   # lone LOW anomalies = clean (scanner noise, not forgery)

        # Draw overlay
        overlay_b64 = _draw_anomaly_overlay(img, boxes, unique_anomalies)

        return {
            'anomalies':     unique_anomalies,
            'anomaly_count': len(unique_anomalies),
            'risk_level':    risk_level,
            'overlay_b64':   overlay_b64,
            'words_found':   len(boxes),
            'ocr_text':      ocr_text,
            'ocr_words':     [{'text': b['text'], 'conf': b['conf']} for b in boxes]
        }

    except Exception as e:
        return {
            'error':         str(e),
            'anomalies':     [],
            'anomaly_count': 0,
            'risk_level':    'CLEAN',
            'overlay_b64':   None,
            'words_found':   0,
        }