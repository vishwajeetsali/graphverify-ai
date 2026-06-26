const mongoose = require('mongoose')

let dbConnected = false

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(
            process.env.MONGO_URI || 'mongodb://localhost:27017/graphverify'
        )
        dbConnected = true
        console.log(`✅ MongoDB connected: ${conn.connection.host}`)
    } catch (err) {
        console.error('⚠️  MongoDB connection failed:', err.message)
        console.error('⚠️  Server will continue running but document history/auth features will be unavailable.')
        console.error('⚠️  The standalone inference.html demo at http://localhost:8000 will still work.')
        // Do NOT process.exit(1) — allow the server to start for demo purposes
    }
}

module.exports = connectDB
module.exports.isConnected = () => dbConnected