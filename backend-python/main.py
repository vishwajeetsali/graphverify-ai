from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
import os
from routers import process

app = FastAPI(
    title="GraphVerify AI — Python Engine",
    description="ELA + ResNet + U-Net forensic pipeline",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins — covers Render→HF server calls and direct browser access
    allow_credentials=False,  # Must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(process.router)

@app.get("/demo-file/{filename}")
def get_demo_file(filename: str):
    # Resolve dataset directory relative to this project's root (one level up from backend-python)
    dataset_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'synthetic_dataset', 'findit2')
    
    # Try exact match, uppercase, and lowercase variants across all splits
    variants = [filename, filename.upper(), filename.lower()]
    for fn in variants:
        for split in ["test", "val", "train"]:
            path = os.path.join(dataset_dir, split, fn)
            if os.path.exists(path):
                return FileResponse(path)
                
    raise HTTPException(status_code=404, detail=f"Demo file {filename} not found in splits")

@app.get("/", response_class=HTMLResponse)
def get_inference_page():
    html_path = os.path.join(os.path.dirname(__file__), "inference.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>inference.html not found</h1>", status_code=404)

@app.get("/gallery")
def get_gallery_page():
    # Use FileResponse (streaming) instead of reading the full 88MB file into memory
    html_path = os.path.join(os.path.dirname(__file__), "test_gallery.html")
    if os.path.exists(html_path):
        return FileResponse(html_path, media_type="text/html")
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content="<h1>test_gallery.html not found</h1>", status_code=404)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "graphverify-python",
        "models_loaded": process.MODELS_LOADED
    }