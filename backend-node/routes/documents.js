const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const router = express.Router()
const uploadController = require('../controllers/uploadController')
const authMiddleware = require('../middleware/authMiddleware')

const uploadsDir = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir)
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
        cb(null, uniqueSuffix + path.extname(file.originalname))
    }
})

const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }
})

router.post(
    '/upload',
    authMiddleware,
    upload.single('file'),
    uploadController.uploadDocument
)

router.get('/', authMiddleware, uploadController.getDocuments)
router.get('/:id', authMiddleware, uploadController.getDocumentById)

module.exports = router