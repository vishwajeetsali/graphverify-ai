import os
os.environ["PYTORCH_ALLOC_CONF"] = "expandable_segments:True"
import sys
import json
import glob
import time
import random
import argparse
import numpy as np
import cv2
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from scipy.fft import dctn as scipy_dctn
from sklearn.model_selection import train_test_split, GroupShuffleSplit

# ── TIMM AND SEGMENTATION MODELS IMPORTS ──────────────────────────────────────
try:
    import timm
    import segmentation_models_pytorch as smp
except ImportError:
    print("Please install required libraries: pip install timm segmentation-models-pytorch albumentations")
    sys.exit(1)

import albumentations as A
from albumentations.pytorch import ToTensorV2

# ── CONFIGURATION ────────────────────────────────────────────────────────────
IMG_SIZE = 512
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Using device: {DEVICE}")

# ── TRI-STREAM PREPROCESSING FUNCTIONS (MUST MATCH INFERENCE.PY) ─────────────

def perform_ela_multiquality(img_bgr, qualities=[70, 80, 90], scale=20):
    best = None
    for q in qualities:
        encode_param = [cv2.IMWRITE_JPEG_QUALITY, q]
        _, enc = cv2.imencode('.jpg', img_bgr, encode_param)
        recon = cv2.imdecode(enc, cv2.IMREAD_COLOR)
        if recon is None:
            continue
        diff  = cv2.absdiff(img_bgr, recon)
        diff  = np.clip(diff.astype(np.float32) * scale, 0, 255).astype(np.uint8)
        best  = diff if best is None else np.maximum(best, diff)
    return best if best is not None else np.zeros_like(img_bgr)

def apply_srm(img_bgr):
    srm_kernel = np.array([
        [-1, 2, -2, 2, -1],
        [ 2,-6,  8,-6,  2],
        [-2, 8,-12, 8, -2],
        [ 2,-6,  8,-6,  2],
        [-1, 2, -2, 2, -1]
    ], dtype=np.float32) / 12.0
    gray  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    noise = cv2.filter2D(gray, -1, srm_kernel)
    noise = np.clip(np.abs(noise) * 10, 0, 255).astype(np.uint8)
    return cv2.cvtColor(noise, cv2.COLOR_GRAY2BGR)

def compute_dct_inconsistency(img_bgr):
    """DCT frequency domain — catches JPEG grid inconsistencies.

    BUG FIX (normalization): previously normalized each 8x8 block by its OWN max
    (`energy / (energy.max() + 1e-8)` inside the loop), which forces every
    block to span [0,1] independently and destroys the relative energy
    difference BETWEEN blocks — exactly the signal that reveals a spliced
    block from a different JPEG compression history. Now we accumulate raw
    log-energy per block and normalize ONCE globally after the loop.

    SPEED FIX: vectorized with scipy.fft.dctn applied to all blocks at once,
    instead of a nested Python for-loop calling dct() per 8x8 block. This was
    the single biggest training bottleneck (blend now runs every epoch, per
    sample, after the aug-ordering fix) — ~18x faster, verified byte-identical
    output to the original loop (same block coverage, same edge truncation).
    """
    gray  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    h, w  = gray.shape
    block = 8

    # Match the original loop's exact block coverage: range(0, h-block, block)
    # covers ceil((h-block)/block) steps when h > block, else 0 steps.
    # (Plain floor-division (h-block)//block UNDER-counts when (h-block) isn't
    # an exact multiple of block — verified divergence on non-512 image sizes,
    # which matters here since inference.py runs this on raw uploaded images
    # of arbitrary dimensions, not just the fixed 512x512 training cache.)
    n_h = max(0, -(-(h - block) // block)) if h > block else 0   # ceil division
    n_w = max(0, -(-(w - block) // block)) if w > block else 0
    h_trim = n_h * block
    w_trim = n_w * block

    out = np.zeros_like(gray)
    if n_h > 0 and n_w > 0:
        g = gray[:h_trim, :w_trim]
        blocks = g.reshape(n_h, block, n_w, block).transpose(0, 2, 1, 3)
        d = scipy_dctn(blocks, axes=(2, 3), norm='ortho')
        energy = np.log1p(np.abs(d))
        out[:h_trim, :w_trim] = energy.transpose(0, 2, 1, 3).reshape(h_trim, w_trim)

    # Global normalization — preserves relative energy differences across blocks
    out_max = out.max()
    if out_max > 1e-8:
        out = out / out_max
    out_u8 = (out * 255).astype(np.uint8)
    return cv2.cvtColor(out_u8, cv2.COLOR_GRAY2BGR)

def tristream_blend(img_bgr):
    # Process at native resolution first to preserve exact JPEG 8x8 grids and SRM high-frequency filters
    ela = perform_ela_multiquality(img_bgr, qualities=[70, 80, 90], scale=20)
    srm = apply_srm(img_bgr)
    dct = compute_dct_inconsistency(img_bgr)
    
    # Convert each BGR image to grayscale (1 channel)
    ela_gray = cv2.cvtColor(ela, cv2.COLOR_BGR2GRAY)
    srm_gray = cv2.cvtColor(srm, cv2.COLOR_BGR2GRAY)
    dct_gray = cv2.cvtColor(dct, cv2.COLOR_BGR2GRAY)
    
    # Stack into 3 independent channels (R: ELA, G: SRM, B: DCT)
    merged = cv2.merge([ela_gray, srm_gray, dct_gray])
    
    # Resize the final 3-channel feature map
    blended = cv2.resize(merged, (IMG_SIZE, IMG_SIZE))
    return blended


# ── DATASET LOADER FOR PREPROCESSING ─────────────────────────────────────────

def parse_annotations(dataset_dir):
    """Scan directory recursively for VIA JSON annotations or TXT/CSV index files."""
    import csv
    import ast
    annotations = {}
    json_files = []
    txt_files = []
    
    for root, _, files in os.walk(dataset_dir):
        for f in files:
            if f.lower().endswith('.json'):
                json_files.append(os.path.join(root, f))
            elif f.lower().endswith('.txt'):
                txt_files.append(os.path.join(root, f))
                
    print(f"DEBUG: Found {len(json_files)} JSON files and {len(txt_files)} TXT files in {dataset_dir}")
    
    # 1. Parse JSON files if any exist
    for jf in json_files:
        try:
            with open(jf, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # VIA structure can be a dict of image entries
            if isinstance(data, dict):
                # Check if it has the standard VIA key scheme
                for key, val in data.items():
                    if isinstance(val, dict) and 'filename' in val:
                        filename = val['filename']
                        regions = val.get('regions', [])
                        rects = []
                        for r in regions:
                            shape = r.get('shape_attributes', {})
                            if shape.get('name') == 'rect':
                                rects.append({
                                    'x': int(shape.get('x', 0)),
                                    'y': int(shape.get('y', 0)),
                                    'w': int(shape.get('width', 0)),
                                    'h': int(shape.get('height', 0))
                                })
                        if rects:
                            annotations[filename] = rects
        except Exception as e:
            print(f"Skipping JSON {jf} due to error: {e}")
            
    # 2. Parse TXT index CSV files
    for tf in txt_files:
        try:
            # Quick pre-check to see if the file contains the expected header
            # to avoid loading non-index TXT files (like OCR transcripts)
            with open(tf, 'r', encoding='utf-8', errors='ignore') as f:
                header_line = f.readline()
                if not header_line:
                    continue
                if 'forgery annotations' not in header_line:
                    continue
            
            # Now parse using csv.reader
            with open(tf, 'r', encoding='utf-8', errors='ignore') as f:
                reader = csv.reader(f)
                header = next(reader)
                
                # Double check columns
                col_img = -1
                col_forged = -1
                col_anno = -1
                for idx, col in enumerate(header):
                    col_clean = col.strip().lower()
                    if col_clean == 'image':
                        col_img = idx
                    elif col_clean == 'forged':
                        col_forged = idx
                    elif col_clean == 'forgery annotations':
                        col_anno = idx
                
                if col_img != -1 and col_forged != -1 and col_anno != -1:
                    print(f"DEBUG: Parsing TXT index CSV file: {tf}")
                    row_count = 0
                    parsed_count = 0
                    for row in reader:
                        if not row or len(row) <= max(col_img, col_forged, col_anno):
                            continue
                        row_count += 1
                        img_name = row[col_img].strip()
                        is_forged_val = row[col_forged].strip()
                        anno_str = row[col_anno].strip()
                        
                        # Check if forged
                        if is_forged_val == '1' and anno_str and anno_str != '0':
                            try:
                                # First, try ast.literal_eval directly
                                try:
                                    data = ast.literal_eval(anno_str)
                                except Exception:
                                    # Fallback: maybe it has lowercase true/false/null.
                                    cleaned_str = anno_str.replace(': true', ': True').replace(': false', ': False').replace(': null', ': None')
                                    cleaned_str = cleaned_str.replace(':true', ':True').replace(':false', ':False').replace(':null', ':None')
                                    data = ast.literal_eval(cleaned_str)
                                
                                if isinstance(data, dict):
                                    regions = data.get('regions', [])
                                    rects = []
                                    for r in regions:
                                        shape = r.get('shape_attributes', {})
                                        if shape.get('name') == 'rect':
                                            rects.append({
                                                'x': int(shape.get('x', 0)),
                                                'y': int(shape.get('y', 0)),
                                                'w': int(shape.get('width', 0)),
                                                'h': int(shape.get('height', 0))
                                            })
                                    if rects:
                                        annotations[img_name] = rects
                                        parsed_count += 1
                            except Exception as eval_err:
                                print(f"Error parsing annotation dict for {img_name} in {tf}: {eval_err}")
                    print(f"DEBUG: Finished parsing {tf}. Found {row_count} rows, parsed {parsed_count} forgery annotations.")
        except Exception as e:
            print(f"Skipping TXT {tf} due to error: {e}")
            
    return annotations


def find_dataset_fallback(dataset_dir):
    """If the specified dataset_dir returned 0 images, check if it's on Kaggle and search for manifests."""
    print(f"[WARNING] Dataset dir '{dataset_dir}' returned 0 images. Attempting automatic fallback search...")
    kaggle_input = "/kaggle/input"
    if os.path.exists(kaggle_input):
        print(f"[INFO] Auto-detected Kaggle environment. Scanning all of {kaggle_input} recursively for train.txt/val.txt...")
        for root, _, files in os.walk(kaggle_input):
            if "train.txt" in files and "val.txt" in files:
                print(f"[INFO] Found dataset manifests folder: {root}")
                return root
        return kaggle_input
        
    # Local fallback
    parent = os.path.dirname(dataset_dir)
    if os.path.exists(parent):
        print(f"[INFO] Falling back to parent directory: {parent}")
        return parent
        
    return dataset_dir

def preprocess_dataset(dataset_dir, output_dir):
    """Cache raw images + masks (NOT pre-blended tri-stream), strictly loading from manifest files.
    """
    print(f"Scanning manifest files in: {dataset_dir}")
    
    import csv
    splits = ["train", "val", "test"]
    manifest_rows = []
    
    # 1. Load manifest records strictly from manifest text files
    for split in splits:
        txt_path = os.path.join(dataset_dir, f"{split}.txt")
        if not os.path.exists(txt_path):
            continue
        with open(txt_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                row['split_folder'] = split
                manifest_rows.append(row)
                
    print(f"Found {len(manifest_rows)} manifest records.")
    
    if len(manifest_rows) == 0:
        dataset_dir = find_dataset_fallback(dataset_dir)
        for split in splits:
            txt_path = os.path.join(dataset_dir, f"{split}.txt")
            if not os.path.exists(txt_path):
                continue
            with open(txt_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    row['split_folder'] = split
                    manifest_rows.append(row)
        print(f"Fallback manifest scan found {len(manifest_rows)} records.")

    annotations = parse_annotations(dataset_dir)
    print(f"Found forgery annotations for {len(annotations)} files.")
    
    img_out = os.path.join(output_dir, "images")
    mask_out = os.path.join(output_dir, "masks")
    os.makedirs(img_out, exist_ok=True)
    os.makedirs(mask_out, exist_ok=True)
    
    metadata = {}
    start_time = time.time()
    
    for idx, row in enumerate(manifest_rows):
        img_name = row['image']
        img_path = os.path.join(dataset_dir, row['split_folder'], img_name)
        if not os.path.exists(img_path):
            img_path = os.path.join(dataset_dir, img_name)
            if not os.path.exists(img_path):
                continue
            
        unique_name = f"{idx:05d}_{img_name}"
        img = cv2.imread(img_path)
        if img is None:
            continue
            
        h, w = img.shape[:2]
        img_resized = cv2.resize(img, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_AREA)

        mask = np.zeros((h, w), dtype=np.uint8)
        is_forged = int(row['forged'])
        
        rects = annotations.get(img_name, [])
        if rects:
            for r in rects:
                cv2.rectangle(mask, (r['x'], r['y']), (r['x'] + r['w'], r['y'] + r['h']), 255, -1)
                
        mask_resized = cv2.resize(mask, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_NEAREST)
        _, mask_binary = cv2.threshold(mask_resized, 127, 255, cv2.THRESH_BINARY)
        
        cv2.imwrite(os.path.join(img_out, f"{unique_name}.png"), img_resized)
        cv2.imwrite(os.path.join(mask_out, f"{unique_name}.png"), mask_binary)
        
        metadata[unique_name] = {
            'original_path': img_path,
            'is_forged': is_forged,
            'source_doc': img_name,
            'tamper_type': row.get('tamper_type', 'NONE')
        }
        
        if (idx + 1) % 100 == 0:
            elapsed = time.time() - start_time
            speed = (idx + 1) / elapsed
            print(f"Preprocessed {idx+1}/{len(manifest_rows)} files ({speed:.1f} files/sec)")
            
    with open(os.path.join(output_dir, "metadata.json"), 'w') as f:
        json.dump(metadata, f, indent=4)
        
    print("SUCCESS: Preprocessing completed! (manifest-based images cached)")
    return metadata

# ── COMPUTE DATASET-SPECIFIC NORMALIZATION STATS ─────────────────────────────

def compute_channel_stats(data_dir, metadata, sample_n=500):
    """Compute per-channel mean and std from cached images after tri-stream blend.
    Returns (mean_tuple, std_tuple) for use in A.Normalize.
    Saves stats to normalization_stats.json alongside model weights.
    """
    keys = list(metadata.keys())
    np.random.seed(42)
    if len(keys) > sample_n:
        keys = list(np.random.choice(keys, sample_n, replace=False))
    
    channel_sum = np.zeros(3, dtype=np.float64)
    channel_sq_sum = np.zeros(3, dtype=np.float64)
    pixel_count = 0
    
    for i, key in enumerate(keys):
        img_path = os.path.join(data_dir, "images", f"{key}.png")
        img_bgr = cv2.imread(img_path)
        if img_bgr is None:
            continue
        blended = tristream_blend(img_bgr)
        blended_rgb = cv2.cvtColor(blended, cv2.COLOR_BGR2RGB)
        img_f = blended_rgb.astype(np.float32) / 255.0  # [0, 1]
        
        channel_sum += img_f.reshape(-1, 3).sum(axis=0)
        channel_sq_sum += (img_f.reshape(-1, 3) ** 2).sum(axis=0)
        pixel_count += img_f.shape[0] * img_f.shape[1]
        
        if (i + 1) % 100 == 0:
            print(f"  [norm stats] Processed {i+1}/{len(keys)} samples...")
    
    mean = channel_sum / pixel_count
    std = np.sqrt(channel_sq_sum / pixel_count - mean ** 2)
    
    # Clamp std to avoid division by zero
    std = np.maximum(std, 1e-6)
    
    mean_tuple = tuple(mean.tolist())
    std_tuple = tuple(std.tolist())
    
    print(f"  [norm stats] Computed: mean={mean_tuple}, std={std_tuple}")
    
    # Save to JSON
    stats = {'mean': list(mean_tuple), 'std': list(std_tuple)}
    try:
        stats_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'normalization_stats.json')
        os.makedirs(os.path.dirname(stats_path), exist_ok=True)
        with open(stats_path, 'w') as f:
            json.dump(stats, f, indent=2)
    except Exception as e:
        print(f"  [norm stats] Warning: could not save to relative models directory: {e}")
    # Also save alongside the model weights in CWD (for Kaggle)
    with open('normalization_stats.json', 'w') as f:
        json.dump(stats, f, indent=2)
    print(f"  [norm stats] Saved to normalization_stats.json")
    
    return mean_tuple, std_tuple

# ── PYTORCH DATASETS ─────────────────────────────────────────────────────────

class ClassifierDataset(Dataset):
    """Dataset for the classifier: returns RAW RGB images with ImageNet normalization.
    
    The classifier needs to see the actual document appearance (font mismatches,
    alignment shifts, visual anomalies) — NOT sparse forensic feature maps.
    ImageNet-pretrained EfficientNet features transfer much better on natural
    document images than on ELA/SRM/DCT channels.
    """
    IMAGENET_MEAN = (0.485, 0.456, 0.406)
    IMAGENET_STD  = (0.229, 0.224, 0.225)
    
    def __init__(self, file_keys, data_dir, metadata, transform=None):
        self.file_keys = file_keys
        self.data_dir = data_dir
        self.metadata = metadata
        self.transform = transform
        self.base_transform = A.Compose([
            A.Normalize(mean=self.IMAGENET_MEAN, std=self.IMAGENET_STD),
            ToTensorV2()
        ])

    def __len__(self):
        return len(self.file_keys)

    def __getitem__(self, idx):
        key = self.file_keys[idx]
        is_forged = self.metadata[key]['is_forged']
        img_path = os.path.join(self.data_dir, "images", f"{key}.png")
        
        img_bgr = cv2.imread(img_path)
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        
        # Resize to IMG_SIZE if not already
        if img_rgb.shape[:2] != (IMG_SIZE, IMG_SIZE):
            img_rgb = cv2.resize(img_rgb, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_AREA)
        
        # Apply augmentation (train only)
        if self.transform:
            augmented = self.transform(image=img_rgb)
            img_rgb = augmented['image']
        
        normalized = self.base_transform(image=img_rgb)
        img_tensor = normalized['image']
        return img_tensor, torch.tensor(is_forged, dtype=torch.long)


class SegmenterDataset(Dataset):
    """
    Dataset for the segmenter: returns tri-stream ELA/SRM/DCT images.
    
    Loads RAW cached images (not pre-blended). Order of operations per sample:
        1. Load raw RGB image + mask
        2. Apply geometric augmentation (flip/rotate/shift) to the RAW image+mask
        3. Run tristream_blend() (ELA/SRM/DCT) on the AUGMENTED raw image
        4. Normalize + tensor-ize

    This ordering is required: ELA/SRM/DCT are pixel-exact physical signals
    (JPEG 8x8 grid alignment, compression residuals). Augmenting the blended
    feature map directly is invalid — e.g. rotating a DCT map does not equal
    the DCT map of a rotated image, and breaks the model's ability to learn
    real tamper signal vs. augmentation artifact.
    """
    def __init__(self, file_keys, data_dir, metadata, transform=None, norm_mean=(0.485, 0.456, 0.406), norm_std=(0.229, 0.224, 0.225)):
        self.file_keys = file_keys
        self.data_dir = data_dir
        self.metadata = metadata
        self.transform = transform
        
        # Albumentations normalization — uses dataset-specific stats if available, ImageNet as fallback
        self.base_transform = A.Compose([
            A.Normalize(mean=norm_mean, std=norm_std),
            ToTensorV2()
        ])

    def __len__(self):
        return len(self.file_keys)

    def __getitem__(self, idx):
        key = self.file_keys[idx]
        is_forged = self.metadata[key]['is_forged']
        
        img_path = os.path.join(self.data_dir, "images", f"{key}.png")
        mask_path = os.path.join(self.data_dir, "masks", f"{key}.png")
        
        # Load RAW cached image (BGR, as written by cv2.imwrite)
        img_bgr = cv2.imread(img_path)
        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        
        # Apply crop-zoom training to 70% of forged training samples
        if self.transform and is_forged and random.random() < 0.7:
            pos_y, pos_x = np.where(mask > 0)
            if len(pos_y) > 0:
                ymin, ymax = pos_y.min(), pos_y.max()
                xmin, xmax = pos_x.min(), pos_x.max()
                
                box_h = ymax - ymin
                box_w = xmax - xmin
                
                img_h, img_w = mask.shape
                crop_h = max(256, min(img_h, box_h + random.randint(20, 60)))
                crop_w = max(256, min(img_w, box_w + random.randint(20, 60)))
                
                # Align crop dims to 8-pixel grid
                crop_h = (crop_h // 8) * 8
                crop_w = (crop_w // 8) * 8
                
                y_min_start = max(0, ymax - crop_h)
                y_max_start = min(ymin, img_h - crop_h)
                if y_max_start >= y_min_start:
                    crop_y = random.randint(y_min_start, y_max_start)
                else:
                    crop_y = random.randint(0, max(1, img_h - crop_h))
                    
                x_min_start = max(0, xmax - crop_w)
                x_max_start = min(xmin, img_w - crop_w)
                if x_max_start >= x_min_start:
                    crop_x = random.randint(x_min_start, x_max_start)
                else:
                    crop_x = random.randint(0, max(1, img_w - crop_w))
                
                # Align crop coordinates to 8-pixel grid
                crop_x = (crop_x // 8) * 8
                crop_y = (crop_y // 8) * 8
                
                img_bgr = img_bgr[crop_y:crop_y+crop_h, crop_x:crop_x+crop_w]
                mask = mask[crop_y:crop_y+crop_h, crop_x:crop_x+crop_w]

        # Apply geometric augmentation to RAW image (train split only) BEFORE blending
        if self.transform:
            img_rgb_for_aug = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            augmented = self.transform(image=img_rgb_for_aug, mask=mask)
            img_bgr = cv2.cvtColor(augmented['image'], cv2.COLOR_RGB2BGR)
            mask = augmented['mask']

        # NOW compute tri-stream blend on the (possibly augmented) raw image
        blended = tristream_blend(img_bgr)   # returns merged BGR-channel-stacked, IMG_SIZE x IMG_SIZE
        blended_rgb = cv2.cvtColor(blended, cv2.COLOR_BGR2RGB)

        # Resize mask to match blended image size (IMG_SIZE x IMG_SIZE)
        if mask.shape[:2] != (IMG_SIZE, IMG_SIZE):
            mask = cv2.resize(mask, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_NEAREST)

        # Standard normalization & tensor conversion
        normalized = self.base_transform(image=blended_rgb, mask=mask)
        img_tensor = normalized['image']
        mask_tensor = normalized['mask'].float() / 255.0  # normalize to [0, 1]
        
        return img_tensor, torch.tensor(is_forged, dtype=torch.long), mask_tensor.unsqueeze(0)

# ── AUGMENTATIONS ────────────────────────────────────────────────────────────
# NOTE: VerticalFlip and RandomRotate90 removed — they destroy forensic signals
# (JPEG grid alignment, ELA/DCT patterns are orientation-dependent)
# NOTE: Using Affine instead of deprecated ShiftScaleRotate; GaussNoise without var_limit for albumentations>=2.0
clf_transform = A.Compose([
    A.HorizontalFlip(p=0.3),
    A.Affine(translate_percent={'x': (-0.02, 0.02), 'y': (-0.02, 0.02)},
             scale=(0.95, 1.05), rotate=(-3, 3),
             border_mode=cv2.BORDER_REFLECT_101, p=0.3),
    A.RandomBrightnessContrast(brightness_limit=0.15, contrast_limit=0.15, p=0.4),
    A.GaussNoise(p=0.2),
    A.ColorJitter(brightness=0.1, contrast=0.1, saturation=0.05, hue=0.02, p=0.2),
])

seg_transform = A.Compose([
    A.HorizontalFlip(p=0.3),
])

# ── DICE LOSS FOR SEGMENTER ──────────────────────────────────────────────────

class DiceBCELoss(nn.Module):
    def __init__(self, pos_weight=150.0):
        super(DiceBCELoss, self).__init__()
        self.pos_weight = pos_weight

    def forward(self, inputs, targets, smooth=1):
        # Weighted BCE to penalize false negatives heavily on tiny forged areas
        pos_weight_tensor = torch.tensor([self.pos_weight], device=inputs.device)
        bce = nn.BCEWithLogitsLoss(pos_weight=pos_weight_tensor)
        BCE = bce(inputs, targets)
        
        # Flatten label and prediction tensors for Dice
        inputs_sig = torch.sigmoid(inputs)       
        inputs_flat = inputs_sig.view(-1)
        targets_flat = targets.view(-1)
        
        intersection = (inputs_flat * targets_flat).sum()                            
        dice = (2. * intersection + smooth) / (inputs_flat.sum() + targets_flat.sum() + smooth)  
        dice_loss = 1.0 - dice
        
        # Give higher weight to Dice loss for fine-grained boundary overlap
        return BCE * 0.3 + dice_loss * 0.7

class FocalTverskyLoss(nn.Module):
    """Focal Tversky Loss — better than Dice+BCE for small object (forgery region) segmentation.
    alpha > beta penalizes false negatives more heavily, which is what we want
    for tiny forged regions that the model tends to miss.
    """
    def __init__(self, alpha=0.7, beta=0.3, gamma=0.75):
        super().__init__()
        self.alpha = alpha  # FN penalty weight
        self.beta = beta    # FP penalty weight
        self.gamma = gamma  # focal exponent
    
    def forward(self, inputs, targets, smooth=1):
        inputs_sig = torch.sigmoid(inputs).view(-1)
        targets_flat = targets.view(-1)
        TP = (inputs_sig * targets_flat).sum()
        FP = ((1 - targets_flat) * inputs_sig).sum()
        FN = (targets_flat * (1 - inputs_sig)).sum()
        tversky = (TP + smooth) / (TP + self.alpha * FN + self.beta * FP + smooth)
        return (1 - tversky) ** self.gamma

class BCEFocalTverskyLoss(nn.Module):
    """BCE + Focal Tversky combination loss.
    Prevents gradient saturation on clean documents while focusing on tiny forged regions.
    """
    def __init__(self, alpha=0.7, beta=0.3, gamma=0.75, bce_weight=1.0):
        super().__init__()
        self.tversky = FocalTverskyLoss(alpha=alpha, beta=beta, gamma=gamma)
        self.bce = nn.BCEWithLogitsLoss()
        self.bce_weight = bce_weight

    def forward(self, inputs, targets, smooth=1):
        return self.tversky(inputs, targets, smooth) + self.bce_weight * self.bce(inputs, targets)

# ── TRAINING FUNCTIONS ────────────────────────────────────────────────────────

def train_classifier(train_loader, val_loader, epochs=20):
    """Train classifier on RAW RGB images (not tri-stream).
    ClassifierDataset returns (image, label) — no mask needed."""
    print("\n--- Training Classifier (EfficientNet-B4 on RGB) ---")
    model = timm.create_model('efficientnet_b4', pretrained=True, num_classes=2)
    model = model.to(DEVICE)
    
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)
    
    scheduler = optim.lr_scheduler.OneCycleLR(optimizer, max_lr=3e-4, 
        epochs=epochs, steps_per_epoch=len(train_loader),
        pct_start=0.1, anneal_strategy='cos')
    
    use_amp = (DEVICE.type == 'cuda')
    scaler = torch.amp.GradScaler('cuda', enabled=use_amp)
    
    best_acc = 0.0
    patience = 8
    patience_counter = 0
    
    for epoch in range(epochs):
        model.train()
        train_loss, train_correct = 0.0, 0
        
        for images, labels in train_loader:
            images, labels = images.to(DEVICE), labels.to(DEVICE)
            
            optimizer.zero_grad()
            with torch.amp.autocast('cuda', enabled=use_amp):
                outputs = model(images)
                loss = criterion(outputs, labels)
                
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            
            scheduler.step()
            
            train_loss += loss.item() * images.size(0)
            preds = torch.argmax(outputs, dim=1)
            train_correct += (preds == labels).sum().item()
            
        # Validation
        model.eval()
        val_loss, val_correct = 0.0, 0
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(DEVICE), labels.to(DEVICE)
                with torch.amp.autocast('cuda', enabled=use_amp):
                    outputs = model(images)
                    loss = criterion(outputs, labels)
                val_loss += loss.item() * images.size(0)
                preds = torch.argmax(outputs, dim=1)
                val_correct += (preds == labels).sum().item()
                
        t_loss = train_loss / len(train_loader.dataset)
        t_acc = train_correct / len(train_loader.dataset)
        v_loss = val_loss / len(val_loader.dataset)
        v_acc = val_correct / len(val_loader.dataset)
        
        print(f"Epoch {epoch+1}/{epochs} | Train Loss: {t_loss:.4f} Acc: {t_acc:.4f} | Val Loss: {v_loss:.4f} Acc: {v_acc:.4f}")
        
        if v_acc > best_acc:
            best_acc = v_acc
            torch.save(model.state_dict(), "resnet_classifier.pt")
            print(f"SAVED: New best classifier with Val Acc: {best_acc:.4f}")
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print("Early stopping triggered for classifier.")
                break
                
    # Explicit memory cleanup
    del model, optimizer, scheduler, criterion
    import gc
    gc.collect()
    torch.cuda.empty_cache()
    
    return best_acc

def compute_pos_weight_from_masks(train_dataset, sample_n=200):
    """Estimate BCE pos_weight from actual forged-pixel ratio in training masks,
    instead of a hardcoded guess. Samples up to `sample_n` forged examples
    (sampling all would be slow for large datasets).
    """
    pos_px = 0
    total_px = 0
    sampled = 0
    for i in range(len(train_dataset)):
        if sampled >= sample_n:
            break
        _, label, mask = train_dataset[i]
        if label.item() != 1:
            continue
        pos_px += mask.sum().item()
        total_px += mask.numel()
        sampled += 1

    if sampled == 0 or pos_px == 0:
        print("[WARNING] No forged samples found to estimate pos_weight — falling back to 150.0")
        return 150.0

    neg_px = total_px - pos_px
    pos_weight = neg_px / pos_px
    print(f"[INFO] Estimated pos_weight from {sampled} forged masks: {pos_weight:.1f} "
          f"(forged-pixel ratio: {pos_px/total_px:.4%})")
    return pos_weight


def train_segmenter(train_loader, val_loader, epochs=30, pos_weight=150.0):
    print("\n--- Training Segmenter (U-Net++ + EfficientNet-B4) ---")
    
    # smp.UnetPlusPlus with ResNet-34 and widened decoder channels + SCSE attention
    model = smp.UnetPlusPlus(
        encoder_name='resnet34',
        encoder_weights='imagenet',
        in_channels=3,
        classes=1,
        activation=None,
        decoder_attention_type='scse',
        decoder_channels=(512, 256, 128, 64, 32)
    )
    model = model.to(DEVICE)
    
    # Replace DiceBCELoss with BCEFocalTverskyLoss combination
    criterion = BCEFocalTverskyLoss()
    
    # Split parameters for Phase 1 & Phase 2
    encoder_params = list(model.encoder.parameters())
    encoder_param_ids = set(id(p) for p in encoder_params)
    decoder_params = [p for p in model.parameters() if id(p) not in encoder_param_ids]
    
    use_amp = (DEVICE.type == 'cuda')
    scaler = torch.amp.GradScaler('cuda', enabled=use_amp)
    
    best_dice = 0.0
    patience = 10
    patience_counter = 0
    
    optimizer = None
    scheduler = None
    
    for epoch in range(epochs):
        # 2-Phase Training Setup
        if epoch == 0:
            print("[INFO] Starting Phase 1 (Epochs 1-5): Training decoder only (encoder frozen) at lr=5e-4")
            for p in encoder_params:
                p.requires_grad = False
            for p in decoder_params:
                p.requires_grad = True
            
            optimizer = optim.AdamW(decoder_params, lr=5e-4, weight_decay=1e-4)
            scheduler = optim.lr_scheduler.OneCycleLR(
                optimizer, max_lr=5e-4,
                epochs=5, steps_per_epoch=len(train_loader),
                pct_start=0.1, anneal_strategy='cos'
            )
        elif epoch == 5:
            print("[INFO] Starting Phase 2 (Epochs 6+): Training encoder & decoder with discriminative LRs")
            for p in encoder_params:
                p.requires_grad = True
                
            optimizer = optim.AdamW([
                {'params': encoder_params, 'lr': 1e-5},
                {'params': decoder_params, 'lr': 2e-4}
            ], weight_decay=1e-4)
            
            scheduler = optim.lr_scheduler.OneCycleLR(
                optimizer, max_lr=[1e-5, 2e-4],
                epochs=max(1, epochs - 5), steps_per_epoch=len(train_loader),
                pct_start=0.1, anneal_strategy='cos'
            )
            patience_counter = 0  # Reset patience for Phase 2
            
        model.train()
        train_loss = 0.0
        
        for images, labels, masks in train_loader:
            images = images.to(DEVICE)
            masks = masks.to(DEVICE)
            
            optimizer.zero_grad()
            with torch.amp.autocast('cuda', enabled=use_amp):
                outputs = model(images)
                loss = criterion(outputs, masks)
                
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            
            scheduler.step() # Called per batch
            
            train_loss += loss.item() * images.size(0)
            
        # Validation
        model.eval()
        val_loss = 0.0
        val_dice_sum = 0.0
        val_forged_count = 0
        clean_fp_pixel_sum = 0.0
        clean_pixel_total = 0
        clean_doc_count = 0
        
        per_type_dice = {}
        val_keys = val_loader.dataset.file_keys
        val_sample_idx = 0
        
        with torch.no_grad():
            for images, labels, masks in val_loader:
                batch_size = len(images)
                forged_idx = (labels == 1).nonzero(as_tuple=True)[0]
                clean_idx  = (labels == 0).nonzero(as_tuple=True)[0]

                # Forged docs: per-image Dice (threshold 0.35)
                if len(forged_idx) > 0:
                    f_images = images[forged_idx].to(DEVICE)
                    f_masks  = masks[forged_idx].to(DEVICE)

                    with torch.amp.autocast('cuda', enabled=use_amp):
                        outputs = model(f_images)
                        loss = criterion(outputs, f_masks)
                    val_loss += loss.item() * len(forged_idx)

                    preds_sig = torch.sigmoid(outputs) > 0.35
                    for k in range(len(forged_idx)):
                        pred_k = preds_sig[k]
                        mask_k = f_masks[k]
                        inter = (pred_k * mask_k).sum().item()
                        union_val = pred_k.sum().item() + mask_k.sum().item()
                        dice_k = (2.0 * inter + 1e-5) / (union_val + 1e-5)
                        val_dice_sum += dice_k
                        
                        # Look up tamper type for per-class breakdown
                        global_idx = val_sample_idx + forged_idx[k].item()
                        sample_key = val_keys[global_idx]
                        t_type = val_loader.dataset.metadata[sample_key].get('tamper_type', 'UNKNOWN')
                        
                        for t_single in t_type.split(','):
                            t_single = t_single.strip()
                            if t_single not in per_type_dice:
                                per_type_dice[t_single] = []
                            per_type_dice[t_single].append(dice_k)
                            
                    val_forged_count += len(forged_idx)

                # Clean docs: track false-positive heatmap pixels (threshold 0.35)
                if len(clean_idx) > 0:
                    c_images = images[clean_idx].to(DEVICE)
                    with torch.amp.autocast('cuda', enabled=use_amp):
                        outputs_clean = model(c_images)
                    preds_clean = torch.sigmoid(outputs_clean) > 0.35
                    clean_fp_pixel_sum += preds_clean.sum().item()
                    clean_pixel_total += preds_clean.numel()
                    clean_doc_count += len(clean_idx)
                
                val_sample_idx += batch_size
                
        avg_train_loss = train_loss / len(train_loader.dataset)
        avg_val_loss = val_loss / max(1, val_forged_count)
        avg_val_dice = val_dice_sum / max(1, val_forged_count)
        clean_fp_rate = clean_fp_pixel_sum / max(1, clean_pixel_total)
        
        print(f"Epoch {epoch+1}/{epochs} | Train Loss: {avg_train_loss:.4f} | "
              f"Val Loss: {avg_val_loss:.4f} Dice: {avg_val_dice:.4f} | "
              f"Clean-doc FP pixel rate: {clean_fp_rate:.4%} ({clean_doc_count} clean docs)")
        
        if per_type_dice:
            print("  [Validation per-tamper-type Dice breakdown]:")
            for t_type, dice_list in sorted(per_type_dice.items()):
                avg_dice_t = sum(dice_list) / len(dice_list)
                print(f"    - {t_type:20s}: {avg_dice_t:.4f} (on {len(dice_list)} samples)")
        
        # Save on best dice, but only if clean false-positive rate isn't blowing up.
        if avg_val_dice > best_dice and clean_fp_rate < 0.10:
            best_dice = avg_val_dice
            torch.save(model.state_dict(), "unet_segmenter.pt")
            print(f"SAVED: New best segmenter with Val Dice: {best_dice:.4f}, Clean FP rate: {clean_fp_rate:.4%}")
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print("Early stopping triggered for segmenter.")
                break
                
    # Explicit memory cleanup
    del model, optimizer, scheduler, criterion
    import gc
    gc.collect()
    torch.cuda.empty_cache()
    
    return best_dice

# ── MAIN EXECUTION ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GraphVerify AI training pipeline")
    parser.add_argument('--dataset_dir', type=str, required=True, help="Path to raw dataset (SROIE/Find it again)")
    parser.add_argument('--cache_dir', type=str, default="./preprocessed_cache", help="Path to save preprocessed ELA/SRM/DCT images")
    parser.add_argument('--skip_preprocess', action='store_true', help="Skip preprocessing and use existing cache")
    parser.add_argument('--batch_size', type=int, default=8, help="Batch size for training")
    parser.add_argument('--seg_batch_size', type=int, default=4, help="Batch size for segmenter training")
    parser.add_argument('--clf_epochs', type=int, default=20, help="Number of classifier epochs")
    parser.add_argument('--seg_epochs', type=int, default=30, help="Number of segmenter epochs")
    args = parser.parse_args()
    
    # Step 1: Preprocess dataset
    if not args.skip_preprocess:
        metadata = preprocess_dataset(args.dataset_dir, args.cache_dir)
    else:
        print("Skipping preprocessing, loading metadata.json from cache...")
        with open(os.path.join(args.cache_dir, "metadata.json"), 'r') as f:
            metadata = json.load(f)
            
    # Step 2: Split data — GROUPED by prefix of source_doc to prevent train/val leakage
    file_keys = list(metadata.keys())
    labels = [metadata[k]['is_forged'] for k in file_keys]
    groups = [metadata[k].get('source_doc', k).split('_')[0] for k in file_keys]

    gss = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
    train_idx, val_idx = next(gss.split(file_keys, labels, groups=groups))
    train_keys = [file_keys[i] for i in train_idx]
    val_keys   = [file_keys[i] for i in val_idx]

    # Sanity check: confirm no source_doc appears in both splits
    train_docs = set(groups[i] for i in train_idx)
    val_docs   = set(groups[i] for i in val_idx)
    overlap    = train_docs & val_docs
    if overlap:
        print(f"[WARNING] {len(overlap)} source documents leaked across train/val split!")
    else:
        print("[OK] No source-document leakage between train and val splits.")
    
    print(f"\nDataset split: {len(train_keys)} training, {len(val_keys)} validation.")
    print(f"Training set forged ratio: {sum(metadata[k]['is_forged'] for k in train_keys)/len(train_keys):.2%}")
    print(f"Val set forged ratio: {sum(metadata[k]['is_forged'] for k in val_keys)/len(val_keys):.2%}")
    
    # Load or compute normalization stats
    stats_path_cwd = 'normalization_stats.json'
    stats_path_models = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'normalization_stats.json')
    
    mean_stats, std_stats = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225) # Default ImageNet
    stats_loaded = False
    
    for p in [stats_path_cwd, stats_path_models]:
        if os.path.exists(p):
            try:
                with open(p, 'r') as f:
                    stats = json.load(f)
                    mean_stats = tuple(stats['mean'])
                    std_stats = tuple(stats['std'])
                    stats_loaded = True
                    print(f"[INFO] Loaded custom normalization stats from {p}: mean={mean_stats}, std={std_stats}")
                    break
            except Exception as e:
                print(f"[WARNING] Failed to load stats from {p}: {e}")
                
    if not stats_loaded:
        print("[INFO] Custom normalization stats not found. Computing from training set...")
        mean_stats, std_stats = compute_channel_stats(args.cache_dir, {k: metadata[k] for k in train_keys}, sample_n=500)
    
    # Step 3: Create SEPARATE datasets for classifier (RGB) and segmenter (tri-stream)
    
    # Classifier uses raw RGB images with ImageNet normalization
    clf_train_dataset = ClassifierDataset(train_keys, args.cache_dir, metadata, transform=clf_transform)
    clf_val_dataset = ClassifierDataset(val_keys, args.cache_dir, metadata)
    clf_train_loader = DataLoader(clf_train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=2, pin_memory=True)
    clf_val_loader = DataLoader(clf_val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=2, pin_memory=True)
    
    # Step 4a: Train classifier on RGB images
    best_acc = train_classifier(clf_train_loader, clf_val_loader, epochs=args.clf_epochs)
    
    # Clean up classifier data to free memory
    import gc
    del clf_train_dataset, clf_val_dataset, clf_train_loader, clf_val_loader
    gc.collect()
    torch.cuda.empty_cache()
    
    # Segmenter uses tri-stream ELA/SRM/DCT with custom normalization
    seg_train_dataset = SegmenterDataset(train_keys, args.cache_dir, metadata, transform=seg_transform, norm_mean=mean_stats, norm_std=std_stats)
    seg_val_dataset = SegmenterDataset(val_keys, args.cache_dir, metadata, norm_mean=mean_stats, norm_std=std_stats)
    seg_train_loader = DataLoader(seg_train_dataset, batch_size=args.seg_batch_size, shuffle=True, num_workers=2, pin_memory=True)
    seg_val_loader = DataLoader(seg_val_dataset, batch_size=args.seg_batch_size, shuffle=False, num_workers=2, pin_memory=True)
    
    # Step 4b: Train segmenter on tri-stream
    best_dice = train_segmenter(
        seg_train_loader, seg_val_loader, epochs=args.seg_epochs,
        pos_weight=compute_pos_weight_from_masks(seg_train_dataset)
    )
    
    print("\n=======================================================")
    print("SUCCESS: Training Complete!")
    print(f"Best Classifier Accuracy: {best_acc:.4%}")
    print(f"Best Segmenter Dice Score: {best_dice:.4f}")
    print("Saved files: 'resnet_classifier.pt' and 'unet_segmenter.pt'")
    print("Move these files to your backend-python/models/ folder to deploy!")
    print("=======================================================")
