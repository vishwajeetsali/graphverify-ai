import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import UploadZone from '../components/UploadZone.jsx'
import ResultPanel from '../components/ResultPanel.jsx'
import { styles } from './DashboardPage.styles.js'

export default function DashboardPage() {
    const navigate = useNavigate()
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [uploadedFile, setUploadedFile] = useState(null)
    const [history, setHistory] = useState([])
    const [historyError, setHistoryError] = useState(false)
    const [uploadStage, setUploadStage] = useState(null)

    // Auth guard — redirect immediately if JWT is missing or expired
    useEffect(() => {
        const token = localStorage.getItem('gv_token')
        if (!token) {
            navigate('/login')
        }
    }, [navigate])

    const fetchHistory = async () => {
        setHistoryError(false)
        try {
            const res = await fetch('/api/documents', {
                headers: { Authorization: `Bearer ${localStorage.getItem('gv_token')}` }
            })
            if (res.status === 401) {
                // Token expired mid-session — redirect to login
                localStorage.removeItem('gv_token')
                navigate('/login')
                return
            }
            if (!res.ok) throw new Error(`History fetch failed: ${res.status}`)
            const data = await res.json()
            setHistory(data)
        } catch (err) {
            console.error('History fetch failed', err)
            setHistoryError(true)
        }
    }

    useEffect(() => { fetchHistory() }, [])

    const handleLogout = () => {
        localStorage.removeItem('gv_token')
        navigate('/login')
    }

    const handleSelectHistory = async (id) => {
        setLoading(true)
        setError(null)
        setResult(null)
        try {
            const res = await fetch(`/api/documents/${id}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('gv_token')}` }
            })
            if (!res.ok) throw new Error(`Server error: ${res.status}`)
            const data = await res.json()
            setResult(data)
            setUploadedFile({ name: data.fileName, type: 'historical' })
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleUpload = async (file) => {
        setLoading(true)
        setError(null)
        setResult(null)
        setUploadedFile(file)
        setUploadStage('📤 Uploading document to forensic pipeline...')

        // Time-gated stage messages — matches actual per-layer latency
        const stageTimers = [
            setTimeout(() => setUploadStage('🔬 Layer 1: Running ELA + SRM + DCT visual analysis...'), 3000),
            setTimeout(() => setUploadStage('🕸️ Layer 2: Extracting spatial OCR bounding graph...'), 18000),
            setTimeout(() => setUploadStage('🧮 Layer 3: Running mathematical reconciliation audit...'), 35000),
            setTimeout(() => setUploadStage('⏳ Deep inference in progress — HF cold-start can take up to 2 min...'), 65000),
        ]
        const clearStageTimers = () => stageTimers.forEach(t => clearTimeout(t))

        try {
            const formData = new FormData()
            formData.append('file', file)

            const res = await fetch('/api/documents/upload', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('gv_token')}`
                },
                body: formData
            })

            clearStageTimers()
            if (!res.ok) throw new Error(`Server error: ${res.status}`)
            const data = await res.json()
            setResult(data)
            fetchHistory()
        } catch (err) {
            clearStageTimers()
            setError(err.message)
        } finally {
            setLoading(false)
            setUploadStage(null)
        }
    }



    return (
        <div style={styles.page}>
            {/* Ambient gradients */}
            <div style={styles.glowTop} />

            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerLeft}>
                    <div style={styles.logoBadge}>📊</div>
                    <div>
                        <h1 style={styles.headerTitle}>GraphVerify <span style={styles.gradientText}>AI</span></h1>
                        <p style={styles.headerSub}>SuRaksha Forensic Auditing Suite</p>
                    </div>
                </div>
                <div style={styles.headerRight}>
                    <a href={import.meta.env.VITE_PYTHON_SERVICE_URL ? `${import.meta.env.VITE_PYTHON_SERVICE_URL.replace(/\/$/, '')}/gallery` : "http://localhost:8000/gallery"} target="_blank" rel="noopener noreferrer" className="gallery-link">
                        🖼️ View Test Gallery
                    </a>
                    <button className="logout-btn" onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            </header>

            {/* Main */}
            <main style={styles.main}>
                <div style={styles.welcomeCard}>
                    <h2 style={styles.welcomeTitle}>Document Verification Workspace</h2>
                    <p style={styles.welcomeDesc}>
                        Run multi-layered deep learning visual, layout structural, and logic audit pipelines. Drag and drop any statement or ledger below to begin.
                    </p>
                </div>

                <div style={styles.workspaceGrid}>
                    {/* Left Pane: Actions and history list */}
                    <div style={styles.controlPane}>
                        <div style={styles.cardHeader}>
                            <span style={{ fontSize: '18px' }}>📤</span>
                            <h3 style={styles.cardTitle}>Ingestion</h3>
                        </div>
                        <UploadZone onUpload={handleUpload} loading={loading} />

                        {/* Live pipeline stage progress */}
                        {uploadStage && (
                            <div style={{ marginTop: '14px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#60a5fa', flexShrink: 0, animation: 'pulse 1.2s ease-in-out infinite' }} />
                                <span style={{ color: '#93c5fd', fontSize: '12px', fontWeight: '600', letterSpacing: '0.01em' }}>{uploadStage}</span>
                            </div>
                        )}

                        {error && (
                            <div style={styles.errorContainer}>
                                <span>❌ {error}</span>
                            </div>
                        )}

                        {historyError && (
                            <div style={{ marginTop: '16px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>⚠️</span>
                                <span>Scan history temporarily unavailable. Upload a file to begin a fresh analysis.</span>
                            </div>
                        )}

                        {history.length > 0 && (
                            <div style={{ marginTop: '28px' }}>
                                <div style={styles.cardHeader}>
                                    <span style={{ fontSize: '18px' }}>⏳</span>
                                    <h3 style={styles.cardTitle}>Recent Scan History</h3>
                                </div>
                                <div style={styles.historyList}>
                                    {history.slice(0, 8).map(doc => {
                                        const isDocFlagged = doc.status === 'flagged';
                                        return (
                                            <div
                                                key={doc._id}
                                                className="history-item"
                                                onClick={() => handleSelectHistory(doc._id)}
                                                title="Click to view detailed analysis results"
                                            >
                                                <span style={styles.historyIcon}>📄</span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={styles.historyName}>{doc.fileName}</p>
                                                    <p style={styles.historyDate}>
                                                        {new Date(doc.uploadDate).toLocaleDateString('en-IN', {
                                                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                                        })}
                                                    </p>
                                                </div>
                                                <span style={{
                                                    ...styles.historyBadge,
                                                    background: isDocFlagged ? 'var(--danger-glow)' : 'var(--success-glow)',
                                                    color: isDocFlagged ? 'var(--danger)' : 'var(--success)',
                                                    borderColor: isDocFlagged ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'
                                                }}>
                                                    {isDocFlagged ? 'Flagged' : 'Clean'}
                                                </span>
                                                <span style={{
                                                    ...styles.historyScore,
                                                    color: isDocFlagged ? 'var(--danger)' : '#9ca3af'
                                                }}>
                                                    {doc.forensicScore}%
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Pane: Live analysis panel results */}
                    <div style={styles.resultsPane}>
                        <div style={styles.cardHeader}>
                            <span style={{ fontSize: '18px' }}>🔍</span>
                            <h3 style={styles.cardTitle}>Real-time Forensic Diagnostic</h3>
                        </div>
                        {(!loading && !result) ? (
                            <div style={styles.emptyResults}>
                                <div style={styles.emptyIcon}>🧪</div>
                                <h4 style={styles.emptyTitle}>Awaiting Document Ingestion</h4>
                                <p style={styles.emptyDesc}>
                                    Please drag/upload a statement on the left. The 3-layer neural network diagnostics report will compile in real-time.
                                </p>
                            </div>
                        ) : (
                            <ResultPanel result={result} loading={loading} uploadedFile={uploadedFile} />
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}