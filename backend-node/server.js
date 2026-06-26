require('dotenv').config()
const express = require('express')
const cors = require('cors')
const connectDB = require('./config/db')

const authRoutes = require('./routes/auth')
const documentRoutes = require('./routes/documents')

const path = require('path')
const app = express()
const PORT = process.env.PORT || 5000

connectDB()

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'], credentials: true }))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use('/auth', authRoutes)
app.use('/api/documents', documentRoutes)

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'graphverify-node',
        timestamp: new Date().toISOString()
    })
})

app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
})

app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message)
    res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
    console.log(`✅ Node server running on http://localhost:${PORT}`)
})