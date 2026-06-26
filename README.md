# GraphVerify AI — SuRaksha Cyber Hackathon 2.0 Prototype

GraphVerify AI is a real-time, multi-modal document forensics and logical ledger auditing platform built for bank underwriting operations. It serves as an intelligent verification layer to detect material alterations on scanned paper documents and digital statement uploads before credit disbursals.

Developed under **Theme 1: Real-time anomaly detection**, the prototype is designed to work in fully offline, local environments.

---

## 🛡️ The 3-Layer Forensic Cascade

GraphVerify AI secures the document ingestion pipeline using a multi-modal verification cascade:

1.  **Layer 1: Visual Forensic Analysis (Pixel-Level & Neural)**
    *   Fuses three image pre-processing streams: **Error Level Analysis (ELA)**, **SRM High-Pass Noise Residuals**, and **Discrete Cosine Transform (DCT) Grid Analysis**.
    *   Processes these streams through a **U-Net++ Segmenter** and **EfficientNet-B4 Classifier** to draw glowing red boundaries around tampered pixels and output a visual risk score.
2.  **Layer 2: Structural Layout Analysis (Geometric Coordinates)**
    *   Constructs a spatial coordinate graph of words from OCR layout coordinates.
    *   Uses statistical z-scores to automatically identify **font-size discrepancies**, **margin alignment breaks**, and **spacing outliers**—making it document type-agnostic (salary slips, plans, agreements).
3.  **Layer 3: Logical Ledger Auditor (Mathematical Reconciliation)**
    *   Audits numerical ledger columns.
    *   Performs mathematical summations (`Running Balance + Deposit - Withdrawal = Target Balance`) to uncover numeric digit swaps or line deletions.

---

## 🛠️ Tech Stack
*   **Frontend:** React (Vite), Vanilla CSS, React Dropzone.
*   **API Gateway Middleware:** Node.js, Express, WebAuthn Platform Biometrics, JWT Auth.
*   **AI Microservice:** Python FastAPI, PyTorch, Segmentation Models PyTorch (smp), OpenCV, Albumentations, Pytesseract (Tesseract OCR).
*   **Database:** MongoDB (with offline grace fallbacks).

---

## 🚀 Quick Setup & Installation

### Prerequisites
1.  **MongoDB Local Service** installed and running on `mongodb://localhost:27017` (the backend connects automatically; if offline, it gracefully falls back to bypass logging).
2.  **Tesseract OCR Engine** installed:
    *   *Windows:* Install to default path `C:\Program Files\Tesseract-OCR\tesseract.exe`
    *   *Linux/macOS:* Ensure `tesseract` is available in your system `PATH`.
3.  **Python 3.10+** and **Node.js 18+** installed.

### One-Click Boot (Windows)
Double-click the launcher script at the root folder:
```bash
start.bat
```
This will open three terminal screens running the services:
*   **Frontend client:** http://localhost:5173
*   **Node.js API Gateway:** http://localhost:5000
*   **Python AI Engine:** http://localhost:8000
*   **Test Gallery:** http://localhost:8000/gallery

---

## 📥 Manual Service Bootstrapping

If you are running on macOS, Linux, or booting manually:

### 1. Python AI Engine Setup
Navigate to the `backend-python/` directory:
```bash
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 2. Node.js Gateway Setup
Navigate to the `backend-node/` directory:
```bash
npm install
npm start
```

### 3. React Frontend Setup
Navigate to the `frontend/` directory:
```bash
npm install
npm run dev
```

---

## 🧠 Model Weights Setup
Because PyTorch weights exceed standard GitHub single-file limits, the model files are ignored in the repository. Please download the pre-trained weights and normalizations stats:

1.  **resnet_classifier.pt** (EfficientNet-B4 classification model)
2.  **unet_segmenter.pt** (U-Net++ segmentation model)
3.  **normalization_stats.json** (Tri-stream mean/std normalization values)

Place all three files directly inside the:
📁 **`backend-python/models/`** folder before running uvicorn.

---

## 🔒 Platform Biometrics Authentication
The gateway implements native FIDO2 / WebAuthn passwordless biometrics. Underwriters can click **Register Device Biometrics** to link their device credentials (e.g. Windows Hello PIN, face unlock, or fingerprint sensors) locally to their username, providing audit-trail security.

---

## 🛡️ Robust Fail-Safe Fallbacks
*   **Offline DB Fallback:** If MongoDB is offline, the Node.js server starts normally and lets you bypass database logs. stand-alone local scans still work.
*   **Offline Model Fallback:** If the PyTorch `.pt` weights are missing or running on low-resource environments, the Python service automatically falls back to **Classical CV Heuristic Mode** (using ELA noise variance heatmaps) so the application remains functional.
