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
            pix  = page.get_pixmap(dpi=300)  # 300 DPI — better OCR accuracy for tampered digit detection
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
    """Detect text blocks that break column alignment.
    Skips the top 28% of the document (header/title area) since bank
    statement headers (Account Number, Statement Period, bank name) are
    naturally indented differently from transaction data columns and must
    not be flagged as alignment anomalies.
    """
    if len(boxes) < 6:
        return []

    # Determine document vertical extent
    all_ys = [b['y'] for b in boxes]
    doc_top = min(all_ys)
    doc_bottom = max(all_ys)
    doc_height = max(1, doc_bottom - doc_top)
    header_cutoff = doc_top + doc_height * 0.28   # skip top 28%

    # Only analyse boxes in the transaction body area
    body_boxes = [b for b in boxes if b['y'] >= header_cutoff]
    if len(body_boxes) < 6:
        return []

    # Group boxes by approximate row (same y ± 10px)
    rows = {}
    for box in body_boxes:
        placed = False
        for row_y in rows:
            if abs(box['y'] - row_y) < 12:
                rows[row_y].append(box)
                placed = True
                break
        if not placed:
            rows[box['y']] = [box]

    # Find boundary column starts
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

    # Cluster boundary x positions
    left_xs_arr = np.array(row_starts)
    hist, edges = np.histogram(left_xs_arr, bins=20)
    dominant_cols = []
    for i, count in enumerate(hist):
        if count >= 3:
            dominant_cols.append((edges[i] + edges[i+1]) / 2)

    if not dominant_cols:
        return []

    anomalies = []
    from collections import defaultdict
    offset_bucket = defaultdict(list)
    for box in body_boxes:
        min_dist = min(abs(box['x'] - col) for col in dominant_cols)
        if 3 <= min_dist <= 25 and len(str(box['text'])) > 3:
            bucket_key = round(min_dist / 3) * 3
            offset_bucket[bucket_key].append((box, min_dist))

    for bucket_key, items in offset_bucket.items():
        # Skip buckets with too many entries — large buckets indicate a normal
        # structural pattern (e.g. indented section header), not a forgery signal
        if len(items) > 8:
            continue
        for box, min_dist in items:
            anomalies.append({
                'type':     'ALIGNMENT_BREAK',
                'severity': 'MEDIUM',
                'text':     box['text'],
                'location': f"({box['x']}, {box['y']})",
                'detail':   f"Text shifted from column line (offset={min_dist:.0f}px, {len(items)} occurrence(s))"
            })

    return anomalies[:5]


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


# ── ROW DELETION DETECTOR ──────────────────────────────────────────────────

def _detect_row_deletion(boxes):
    """
    Detects deleted rows by finding abnormal Y-coordinate gaps between
    consecutive OCR row groups. A deleted row creates a gap that is
    statistically larger than the median inter-row spacing.
    """
    if len(boxes) < 8:
        return []

    # Group boxes into rows by Y proximity
    rows = {}
    for box in boxes:
        placed = False
        for row_y in rows:
            if abs(box['y'] - row_y) < 14:
                rows[row_y].append(box)
                placed = True
                break
        if not placed:
            rows[box['y']] = [box]

    # Get sorted row Y-centers, only rows with >= 2 words (content rows)
    row_ys = sorted(
        [r_y for r_y in rows if len(rows[r_y]) >= 2]
    )

    if len(row_ys) < 4:
        return []

    gaps = [row_ys[i+1] - row_ys[i] for i in range(len(row_ys) - 1)]
    sorted_gaps = sorted(gaps)
    median_gap = sorted_gaps[len(sorted_gaps) // 2]

    if median_gap < 5:
        return []

    anomalies = []
    for i, gap in enumerate(gaps):
        if gap > median_gap * 2.5 and gap > 20:
            # Get representative text from surrounding rows
            above_row = sorted(rows.get(row_ys[i], []), key=lambda b: b['x'])
            below_row = sorted(rows.get(row_ys[i+1], []), key=lambda b: b['x'])
            above_text = ' '.join(b['text'] for b in above_row[:3]) if above_row else '?'
            below_text = ' '.join(b['text'] for b in below_row[:3]) if below_row else '?'
            anomalies.append({
                'type':     'ROW_DELETION_GAP',
                'severity': 'HIGH' if gap > median_gap * 4 else 'MEDIUM',
                'text':     f'{above_text} → {below_text}',
                'location': f'(y={row_ys[i]}→{row_ys[i+1]})',
                'detail':   (
                    f'Y-gap of {gap}px between consecutive text rows '
                    f'({gap/median_gap:.1f}× median={median_gap}px) — '
                    f'consistent with a deleted transaction row.'
                )
            })

    return anomalies[:3]


# ── OCR CONFIDENCE ANOMALY DETECTOR ─────────────────────────────────────

def _detect_ocr_confidence_anomalies(boxes):
    """
    Digitally injected or copy-moved text renders differently from surrounding
    printed text. Tesseract consistently returns anomalous confidence scores on
    such text.

    Skips masked/redacted words (e.g. 'xxxx-xxxx-3053') since OCR gives
    genuinely low confidence on intentionally obscured characters.
    """
    if len(boxes) < 10:
        return []

    # Focus on words that look like amounts/balances (contain digits)
    # Skip words that are mostly non-alphanumeric (masked account numbers, separators)
    numeric_boxes = [
        b for b in boxes
        if any(c.isdigit() for c in b['text'])
        and len(b['text']) >= 2
        and sum(1 for c in b['text'] if c.isalpha() or c.isdigit()) >= len(b['text']) * 0.5
    ]

    if len(numeric_boxes) < 5:
        return []

    confs = np.array([b['conf'] for b in numeric_boxes], dtype=np.float32)
    mean_conf = confs.mean()
    std_conf  = max(5.0, confs.std())

    anomalies = []
    for b, conf in zip(numeric_boxes, confs):
        z = (conf - mean_conf) / std_conf
        if abs(z) > 3.2:   # raised from 2.8 to reduce false positives
            direction = 'abnormally low' if z < 0 else 'suspiciously high'
            anomalies.append({
                'type':     'OCR_CONFIDENCE_OUTLIER',
                'severity': 'HIGH' if abs(z) > 4.0 else 'MEDIUM',
                'text':     b['text'],
                'location': f"({b['x']}, {b['y']})",
                'detail':   (
                    f"Numeric value '{b['text']}' has {direction} OCR confidence "
                    f"({conf:.0f} vs column mean {mean_conf:.0f}, z={z:.2f}) — "
                    f"may indicate digitally inserted or copy-moved text."
                )
            })

    return anomalies[:4]


# ── SIFT COPY-MOVE DETECTOR ────────────────────────────────────────────────

def _detect_copy_move(img_bgr):
    """
    ELA cannot detect copy-move forgeries. SIFT keypoint matching finds
    self-similar regions in the same image.

    Thresholds are set conservatively to avoid false positives on genuine
    bank statements which have repeated structural elements (horizontal
    lines, table cells, logo repeats).
    """
    try:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        h, w = gray.shape
        max_dim = 1200
        scale = 1.0
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            gray = cv2.resize(gray, (int(w * scale), int(h * scale)))

        sift = cv2.SIFT_create(nfeatures=800, contrastThreshold=0.04)
        kps, descs = sift.detectAndCompute(gray, None)

        if descs is None or len(kps) < 20:
            return []

        index_params  = dict(algorithm=1, trees=5)
        search_params = dict(checks=50)
        flann = cv2.FlannBasedMatcher(index_params, search_params)
        matches = flann.knnMatch(descs, descs, k=3)

        MIN_DIST_PX  = min(h, w) * 0.10   # raised: must be >= 10% of dimension apart
        MIN_Y_FRAC   = 0.12                # vertical separation must be >= 12% of height
        good_matches = []
        for m_list in matches:
            if len(m_list) < 3:
                continue
            m, n = m_list[1], m_list[2]
            if m.distance < 0.70 * n.distance and m.queryIdx != m.trainIdx:
                pt1 = np.array(kps[m.queryIdx].pt)
                pt2 = np.array(kps[m.trainIdx].pt)
                dist = np.linalg.norm(pt1 - pt2)
                y_dist = abs(pt1[1] - pt2[1])
                # Require both spatial distance AND vertical separation
                # This filters horizontal-only matches (table row repeats)
                if dist > MIN_DIST_PX and y_dist > h * MIN_Y_FRAC:
                    good_matches.append((pt1, pt2, m.distance))

        # Raised threshold: need 20+ strong matches to call copy-move
        # (repeated table lines/borders typically produce < 15 cross-region matches)
        if len(good_matches) < 20:
            return []

        pts1 = np.array([m[0] for m in good_matches])
        centroid1 = pts1.mean(axis=0) / scale
        pts2 = np.array([m[1] for m in good_matches])
        centroid2 = pts2.mean(axis=0) / scale

        return [{
            'type':     'COPY_MOVE_REGION',
            'severity': 'HIGH' if len(good_matches) >= 30 else 'MEDIUM',
            'text':     f'{len(good_matches)} matched keypoints',
            'location': f'({int(centroid1[0])},{int(centroid1[1])}) → ({int(centroid2[0])},{int(centroid2[1])})',
            'detail':   (
                f'{len(good_matches)} SIFT keypoint pairs match across spatially separated regions '
                f'with >12% vertical separation. '
                f'Source ~({int(centroid1[0])},{int(centroid1[1])}) → '
                f'dest ~({int(centroid2[0])},{int(centroid2[1])}) — '
                f'ELA-invisible copy-move forgery detected.'
            )
        }]

    except Exception as e:
        print(f'[COPY_MOVE] Detection failed: {e}')
        return []


# ── PDF METADATA FORENSICS ─────────────────────────────────────────────────

def analyze_pdf_metadata(image_bytes: bytes) -> dict:
    """
    Forensically analyze PDF metadata for post-issuance tampering signals.
    Used exclusively on digital PDFs where visual ELA is inapplicable.

    Detects:
      - Post-issuance modification (modDate > creationDate)
      - Suspicious producer software (Word, LibreOffice, etc.)
      - PDF structure repairs (sign of unauthorized editing)
      - Unexpected encryption state
    """
    try:
        import fitz
        from datetime import datetime

        doc      = fitz.open(stream=image_bytes, filetype="pdf")
        metadata = doc.metadata
        flags    = []

        # 1. Post-issuance modification check
        created  = metadata.get('creationDate', '') or ''
        modified = metadata.get('modDate', '')      or ''

        def _parse_pdf_date(d: str):
            try:
                d = d.replace('D:', '').strip()[:14]
                return datetime.strptime(d, '%Y%m%d%H%M%S')
            except Exception:
                return None

        created_dt  = _parse_pdf_date(created)
        modified_dt = _parse_pdf_date(modified)

        if created_dt and modified_dt and modified_dt > created_dt:
            delta = modified_dt - created_dt
            flags.append({
                'type':     'POST_ISSUANCE_MODIFICATION',
                'severity': 'HIGH',
                'detail':   (
                    f"Document modified {delta.days} day(s) "
                    f"{delta.seconds // 3600}h after creation. "
                    f"Created: {created_dt.strftime('%Y-%m-%d %H:%M')} — "
                    f"Modified: {modified_dt.strftime('%Y-%m-%d %H:%M')}"
                )
            })

        # 2. Suspicious producer / creator software
        producer = metadata.get('producer', '') or ''
        creator  = metadata.get('creator',  '') or ''
        combined = (producer + ' ' + creator).lower()

        SUSPICIOUS_APPS = [
            ('microsoft word',   'Word processor'),
            ('libreoffice',      'LibreOffice'),
            ('openoffice',       'OpenOffice'),
            ('google docs',      'Google Docs'),
            ('wps',              'WPS Office'),
            ('canva',            'Canva'),
            ('adobe photoshop',  'Photoshop'),
            ('gimp',             'GIMP image editor'),
        ]
        for keyword, label in SUSPICIOUS_APPS:
            if keyword in combined:
                flags.append({
                    'type':     'SUSPICIOUS_PRODUCER_SOFTWARE',
                    'severity': 'MEDIUM',
                    'detail':   (
                        f"Document produced by '{label}' — "
                        f"inconsistent with bank-issued statement software. "
                        f"Producer: '{producer}' | Creator: '{creator}'"
                    )
                })
                break

        # 3. PDF structure was repaired on open (sign of file corruption from unauthorized editing)
        if doc.is_repaired:
            flags.append({
                'type':     'PDF_STRUCTURE_REPAIRED',
                'severity': 'MEDIUM',
                'detail':   'PDF internal cross-reference table was repaired on open — '
                            'indicates possible file corruption from unauthorized binary editing.'
            })

        # 4. Unexpected encryption on a bank statement
        if doc.needs_pass:
            flags.append({
                'type':     'UNEXPECTED_ENCRYPTION',
                'severity': 'LOW',
                'detail':   'Document requires a password — unusual for standard bank-issued statements.'
            })

        # Risk level
        high_count   = sum(1 for f in flags if f['severity'] == 'HIGH')
        medium_count = sum(1 for f in flags if f['severity'] == 'MEDIUM')

        if high_count >= 1:
            risk_level = 'HIGH'
        elif medium_count >= 1:
            risk_level = 'MEDIUM'
        else:
            risk_level = 'CLEAN'

        return {
            'flags':       flags,
            'flag_count':  len(flags),
            'risk_level':  risk_level,
            'raw_metadata': {
                'producer':   producer,
                'creator':    creator,
                'created':    created,
                'modified':   modified,
                'page_count': len(doc),
                'encrypted':  doc.needs_pass,
            }
        }

    except Exception as e:
        return {
            'flags':      [],
            'flag_count': 0,
            'risk_level': 'CLEAN',
            'error':      str(e),
            'raw_metadata': {}
        }


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
        all_anomalies += _detect_row_deletion(boxes)
        all_anomalies += _detect_ocr_confidence_anomalies(boxes)
        all_anomalies += _detect_copy_move(img)

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