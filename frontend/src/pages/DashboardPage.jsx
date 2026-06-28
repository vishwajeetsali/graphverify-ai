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

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/documents', {
                headers: { Authorization: `Bearer ${localStorage.getItem('gv_token')}` }
            })
            const data = await res.json()
            setHistory(data)
        } catch (err) {
            console.error('History fetch failed', err)
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

            if (!res.ok) throw new Error(`Server error: ${res.status}`)
            const data = await res.json()
            setResult(data)
            fetchHistory()
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
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



                        {error && (
                            <div style={styles.errorContainer}>
                                <span>❌ {error}</span>
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