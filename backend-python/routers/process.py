from fastapi import APIRouter, UploadFile, File, HTTPException
from services.inference import run_pipeline, CLASSICAL_MODE
from services.structural_analyzer import analyze_structure, analyze_pdf_metadata

router = APIRouter()
MODELS_LOADED = not CLASSICAL_MODE


@router.post("/process-image")
async def process_image(file: UploadFile = File(...)):
    if file.content_type not in ["image/jpeg", "image/png", "application/pdf"]:
        raise HTTPException(status_code=422, detail="Invalid file type. Send JPG, PNG or PDF.")

    image_bytes = await file.read()

    # Layer 1 — Visual (ELA + SRM + DCT + EfficientNet + U-Net)
    visual_result = run_pipeline(image_bytes, file.filename)

    is_digital_pdf = visual_result.get('layer') == 'digital_pdf'

    # Layer 2 — Structural (spatial graph anomaly detection)
    # Layer 4 — PDF Metadata Forensics (digital PDFs only — where visual ELA is inapplicable)
    if is_digital_pdf:
        structural_result = {
            'anomalies': [],
            'anomaly_count': 0,
            'risk_level': 'CLEAN',
            'overlay_b64': None,
            'words_found': 0,
            'ocr_text': '',
            'ocr_words': []
        }
        pdf_metadata_result = analyze_pdf_metadata(image_bytes)
    else:
        structural_result    = analyze_structure(image_bytes)
        pdf_metadata_result  = None

    return {
        # Visual layer
        'forged':            visual_result['forged'],
        'risk_score':        visual_result['risk_score'],
        'heatmap_base64':    visual_result.get('heatmap_base64'),
        'gradcam_base64':    visual_result.get('gradcam_base64'),
        'tta_scores':        visual_result.get('tta_scores', []),
        'layer':             visual_result.get('layer', 'forensic'),

        # Structural layer
        'structural': {
            'anomalies':     structural_result.get('anomalies', []),
            'anomaly_count': structural_result.get('anomaly_count', 0),
            'risk_level':    structural_result.get('risk_level', 'CLEAN'),
            'overlay_b64':   structural_result.get('overlay_b64'),
            'words_found':   structural_result.get('words_found', 0),
            'ocr_text':      structural_result.get('ocr_text', ''),
            'ocr_words':     structural_result.get('ocr_words', []),
        },

        # PDF Metadata Forensics layer (populated only for digital PDFs)
        'pdf_metadata': pdf_metadata_result,
    }