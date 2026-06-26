const mongoose = require('mongoose')

const DocumentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fileName: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['clean', 'flagged', 'processing'], default: 'processing' },
    forensicScore: { type: Number, default: 0 },
    heatmapImage: { type: String, default: null },
    gradcamImage: { type: String, default: null },
    originalImage: { type: String, default: null },
    logicalWarnings: { type: [String], default: [] },
    logicalExplanation: { type: String, default: null },
    structural: { type: mongoose.Schema.Types.Mixed, default: {} }
})

module.exports = mongoose.model('Document', DocumentSchema)