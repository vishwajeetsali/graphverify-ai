const axios = require('axios')
const FormData = require('form-data')
const Document = require('../models/Document')
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

function saveBase64Image(base64Str, prefix, docId, ext = 'png') {
    if (!base64Str) return null
    // Remove header if present
    const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, "")
    const buffer = Buffer.from(cleanBase64, 'base64')
    
    const uploadsDir = path.join(__dirname, '..', 'uploads')
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
    }
    
    const filename = `${prefix}-${docId}.${ext}`
    const filePath = path.join(uploadsDir, filename)
    fs.writeFileSync(filePath, buffer)
    
    return `/uploads/${filename}`
}

exports.uploadDocument = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' })
    }

    const isDbConnected = mongoose.connection.readyState === 1
    let docId = 'transient-' + Date.now()
    let doc = null

    if (isDbConnected) {
        try {
            doc = await Document.create({
                userId: req.user.userId,
                fileName: req.file.originalname,
                status: 'processing'
            })
            docId = doc._id
        } catch (err) {
            if (req.file && req.file.path) {
                fs.promises.unlink(req.file.path).catch(err => console.error('[CLEANUP ERROR]', err.message))
            }
            return res.status(500).json({ error: 'DB error: ' + err.message })
        }
    }

    try {
        // Step 1: forward file to FastAPI from disk stream
        const form = new FormData()
        form.append('file', fs.createReadStream(req.file.path), {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        })

        const pythonRes = await axios.post(`${PYTHON_URL}/process-image`, form, {
            headers: form.getHeaders(),
            timeout: 60000
        })
        const aiResult = pythonRes.data

        // Step 2: Rule-based math check and Ollama explanations (Visual Confidence Cascade Bypass)
        let logicalWarnings = []
        let logicalExplanation = null
        let isStructuralAnomaly = false

        // Cascade gate: If visual score is highly confident it's clean (< 15.0), bypass downstream layers
        if (aiResult.risk_score >= 15.0) {
            const { checkLogic } = require('./logicController')
            const ocrText = aiResult.structural?.ocr_text || ''
            const ocrWords = aiResult.structural?.ocr_words || []

            console.log('[LOGIC INPUT] Original originalname:', req.file.originalname)
            console.log('[LOGIC INPUT] OCR text length:', ocrText.length)
            
            const logicResult = await checkLogic(
                req.file.path, 
                req.file.mimetype, 
                ocrText,
                ocrWords, // Pass actual OCR words metadata for confidence checks
                req.file.originalname
            )
            logicalWarnings = logicResult.warnings || []
            logicalExplanation = logicResult.explanation || null

            isStructuralAnomaly = ['HIGH'].includes(aiResult.structural?.risk_level)
        } else {
            console.log(`[CASCADE BYPASS] Visual risk score ${aiResult.risk_score}% is < 15.0%. Bypassing structural/logical checks.`)
            // Clear structural anomalies and risk level to prevent false visual highlighting in frontend
            if (aiResult.structural) {
                aiResult.structural.anomalies = []
                aiResult.structural.anomaly_count = 0
                aiResult.structural.risk_level = 'CLEAN'
                aiResult.structural.overlay_b64 = null
            }
        }

        console.log('[LOGIC RESULT] warnings:', logicalWarnings)
        console.log('[LOGIC RESULT] explanation:', logicalExplanation)

        // Step 3: save result, converting large Base64 images to static files on disk
        const heatmapPath = saveBase64Image(aiResult.heatmap_base64, 'heatmap', docId, 'png')
        const gradcamPath = saveBase64Image(aiResult.gradcam_base64, 'gradcam', docId, 'png')
        
        if (aiResult.structural?.overlay_b64) {
            aiResult.structural.overlay_b64 = saveBase64Image(aiResult.structural.overlay_b64, 'overlay', docId, 'jpg')
        }

        // Calibrate validation status
        const isLogicalAnomaly = logicalWarnings && logicalWarnings.length > 0
        const status = (aiResult.forged || isStructuralAnomaly || isLogicalAnomaly) ? 'flagged' : 'clean'

        if (isDbConnected && doc) {
            await Document.findByIdAndUpdate(doc._id, {
                status,
                forensicScore: aiResult.risk_score,
                heatmapImage: heatmapPath,
                gradcamImage: gradcamPath,
                originalImage: `/uploads/${req.file.filename}`,
                logicalWarnings,
                logicalExplanation,
                structural: aiResult.structural || {}
            })
        } else {
            console.log('⚠️ [OFFLINE UPLOAD] MongoDB disconnected. Skipping database document log.')
        }

        // Step 4: return to React
        return res.json({
            documentId: docId,
            status,
            forensicScore: aiResult.risk_score,
            heatmap: heatmapPath,
            gradcam: gradcamPath,
            originalImage: `/uploads/${req.file.filename}`,
            logicalWarnings,
            logicalExplanation,
            structural: aiResult.structural || {},
            layer: aiResult.layer
        })

    } catch (err) {
        if (doc) await Document.findByIdAndDelete(doc._id)

        // Clean up temporary uploaded file from disk on error
        if (req.file && req.file.path) {
            fs.promises.unlink(req.file.path).catch(err => console.error('[CLEANUP ERROR]', err.message))
        }

        if (err.code === 'ECONNREFUSED') {
            return res.status(503).json({
                error: 'Python AI service is down. Run: uvicorn main:app --port 8000'
            })
        }
        return res.status(500).json({ error: err.message })
    }
}

exports.getDocuments = async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        console.warn('⚠️ [OFFLINE DASHBOARD] MongoDB disconnected. Returning empty history.')
        return res.json([])
    }
    try {
        const docs = await Document.find({ userId: req.user.userId })
            .sort({ uploadDate: -1 })
            .select('-heatmapImage -gradcamImage -structural.overlay_b64')
        res.json(docs)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

exports.getDocumentById = async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'Database is offline' })
    }
    try {
        const doc = await Document.findOne({ _id: req.params.id, userId: req.user.userId })
        if (!doc) {
            return res.status(404).json({ error: 'Document not found' })
        }
        // Map DB field names to match the upload response format expected by frontend
        res.json({
            documentId: doc._id,
            fileName: doc.fileName,
            uploadDate: doc.uploadDate,
            status: doc.status,
            forensicScore: doc.forensicScore,
            heatmap: doc.heatmapImage || null,
            gradcam: doc.gradcamImage || null,
            originalImage: doc.originalImage || null,
            logicalWarnings: doc.logicalWarnings || [],
            logicalExplanation: doc.logicalExplanation || null,
            structural: doc.structural || {},
            layer: 'forensic'
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}