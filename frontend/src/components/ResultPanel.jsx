import { useState, useEffect } from 'react'
import { styles } from './ResultPanel.styles.js'

const getImgSrc = (src, defaultPrefix = 'data:image/png;base64,') => {
    if (!src) return null
    if (src.startsWith('http') || src.startsWith('/uploads') || src.startsWith('data:')) {
        return src
    }
    return `${defaultPrefix}${src}`
}

export default function ResultPanel({ result, loading, uploadedFile }) {
    const [activeTab, setActiveTab] = useState('visual')
    const [visualMode, setVisualMode] = useState('heatmap')
    const [heatmapOpacity, setHeatmapOpacity] = useState(0.85)
    const [scoreAnim, setScoreAnim] = useState(0)
    const [reportStatus, setReportStatus] = useState('idle') // idle | generating | done | error

    // Determine the document image preview source
    const [livePreviewSrc, setLivePreviewSrc] = useState(null)
    const [isPDF, setIsPDF] = useState(false)

    useEffect(() => {
        if (!uploadedFile || uploadedFile.type === 'historical') {
            setLivePreviewSrc(null)
            setIsPDF(false)
            return
        }

        const isPdfFile = uploadedFile.type === 'application/pdf'
        setIsPDF(isPdfFile)

        const url = URL.createObjectURL(uploadedFile)
        setLivePreviewSrc(url)

        return () => {
            URL.revokeObjectURL(url)
        }
    }, [uploadedFile])

    // Animate score ring from 0 to actual score when result changes
    useEffect(() => {
        if (!result) { setScoreAnim(0); return }
        setScoreAnim(0)
        const target = result.forensicScore || 0
        let frame = 0
        const total = 40
        const tick = () => {
            frame++
            setScoreAnim(Math.round(target * (frame / total)))
            if (frame < total) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
    }, [result])

    if (loading) {
        return (
            <div style={styles.panel}>
                <div style={styles.skeletonBanner} />
                <div style={styles.skeletonLine} />
                <div style={{ ...styles.skeletonLine, width: '40%', marginTop: '10px' }} />
            </div>
        )
    }

    if (!result) return null

    const { forensicScore, status, heatmap, gradcam, logicalWarnings, logicalExplanation, structural, pdfMetadata, documentId, layer, originalImage } = result
    const isFlagged = status === 'flagged'
    const isDigitalPdf = layer === 'digital_pdf'
    const ttaScores = result.tta_scores || []

    // Score ring geometry
    const RING_R = 36, RING_STROKE = 7
    const circumference = 2 * Math.PI * RING_R
    const ringOffset = circumference - (scoreAnim / 100) * circumference
    const ringColor = scoreAnim > 60 ? '#f43f5e' : scoreAnim > 30 ? '#fbbf24' : '#10b981'

    // Generate forensic report and download as HTML file
    const generateReport = () => {
        try {
            setReportStatus('generating')
            const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
            const flagList = (logicalWarnings || []).map(w => `<li>${w?.message || w || ''}</li>`).join('')
            const structAnomalies = (structural?.anomalies || []).map(a =>
                `<li><strong>${a?.type || 'ANOMALY'}</strong> — ${a?.detail || ''} (${a?.severity || 'UNKNOWN'} severity)</li>`
            ).join('')
            const metaFlags = (pdfMetadata?.flags || []).map(f =>
                `<li><strong>${(f?.type || '').replace(/_/g,' ')}</strong> [${f?.severity || ''}] — ${f?.detail || ''}</li>`
            ).join('')
            const ttaList = (result.tta_scores || []).map((s,i) => `TTA Pass ${i+1}: ${((s||0)*100).toFixed(1)}%`).join(' | ')

            const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>GraphVerify AI — Forensic Report</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;margin:40px;color:#111;line-height:1.6;max-width:780px}
  h1{color:#1e3a5f;border-bottom:3px solid #1e3a5f;padding-bottom:8px}
  h2{color:#1e3a5f;margin-top:28px;font-size:15px;text-transform:uppercase;letter-spacing:1px}
  .verdict{font-size:22px;font-weight:800;padding:14px 20px;border-radius:8px;margin:16px 0}
  .forged{background:#fef2f2;color:#dc2626;border:2px solid #dc2626}
  .clean{background:#f0fdf4;color:#16a34a;border:2px solid #16a34a}
  .meta{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin:10px 0;font-size:13px}
  ul{margin:8px 0;padding-left:20px} li{margin:4px 0;font-size:13px}
  .score{font-size:32px;font-weight:900;color:${isFlagged?'#dc2626':'#16a34a'}}
  .footer{margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#6b7280}
  @media print{body{margin:20px}}
</style></head><body>
<h1>🔬 GraphVerify AI — Forensic Analysis Report</h1>
<div class="meta">
  <strong>Document:</strong> ${result?.fileName || uploadedFile?.name || 'Unknown'}<br>
  <strong>Scan ID:</strong> ${documentId || '—'}<br>
  <strong>Timestamp:</strong> ${ts}<br>
  <strong>Analysis Layer:</strong> ${layer || 'forensic'}
</div>
<div class="verdict ${isFlagged?'forged':'clean'}">
  ${isFlagged ? '🚨 POTENTIAL FORGERY DETECTED' : '✅ DOCUMENT VERIFIED — CLEAN'}
</div>
<h2>Layer 1 — Visual Forensic Score</h2>
<p class="score">${forensicScore || 0}%</p>
<p>Compression profile: <strong>${(forensicScore||0) > 50 ? 'Anomaly Detected' : 'Normal / Consistent'}</strong></p>
${ttaList ? `<p style="font-size:12px;color:#555">TTA Confidence Breakdown: ${ttaList}</p>` : ''}
<h2>Layer 2 — Structural Graph Analysis</h2>
<p>Risk Level: <strong>${structural?.risk_level || 'CLEAN'}</strong> | Layout Contradictions: <strong>${structural?.anomaly_count || 0}</strong> | Words Scanned: <strong>${structural?.words_found || 0}</strong></p>
${structAnomalies ? `<ul>${structAnomalies}</ul>` : '<p>No structural anomalies detected.</p>'}
<h2>Layer 3 — Mathematical Reconciliation</h2>
${flagList ? `<ul>${flagList}</ul>` : '<p>All transaction balances reconcile within ±₹1.00 tolerance.</p>'}
${logicalExplanation ? `<div class="meta"><strong>AI Audit Summary:</strong><br>${logicalExplanation}</div>` : ''}
${isDigitalPdf && pdfMetadata ? `
<h2>Layer 4 — PDF Metadata Forensics</h2>
<p>Metadata Risk: <strong>${pdfMetadata.risk_level || '—'}</strong> | Flags: <strong>${pdfMetadata.flag_count || 0}</strong></p>
${metaFlags ? `<ul>${metaFlags}</ul>` : '<p>No metadata tampering signals detected.</p>'}
<div class="meta" style="font-size:12px">
  Producer: ${pdfMetadata.raw_metadata?.producer||'—'} | Creator: ${pdfMetadata.raw_metadata?.creator||'—'}<br>
  Created: ${pdfMetadata.raw_metadata?.created||'—'} | Modified: ${pdfMetadata.raw_metadata?.modified||'—'}
</div>` : ''}
<div class="footer">
  Generated by GraphVerify AI — SuRaksha Forensic Auditing Suite<br>
  This report is for informational purposes. Findings should be reviewed by a qualified forensic analyst.
</div>
</body></html>`

            const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
            const url  = URL.createObjectURL(blob)
            const a    = document.createElement('a')
            a.href     = url
            a.download = `forensic-report-${documentId || 'scan'}.html`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            setReportStatus('done')
            setTimeout(() => setReportStatus('idle'), 3000)
        } catch (err) {
            console.error('[REPORT ERROR]', err)
            setReportStatus('error')
            alert(`Report generation failed: ${err.message}`)
            setTimeout(() => setReportStatus('idle'), 3000)
        }
    }


    // Fallback: If no live file uploaded (historical scan), use originalImage or the structural overlay as the base preview
    let previewSrc = livePreviewSrc
    if (!previewSrc) {
        if (originalImage) {
            previewSrc = getImgSrc(originalImage)
        } else if (structural?.overlay_b64) {
            previewSrc = getImgSrc(structural.overlay_b64, 'data:image/jpeg;base64,')
        }
    }

    return (
        <div style={styles.panel}>

            {/* Banner */}
            <div style={{
                ...styles.banner,
                background: isFlagged ? 'var(--danger-glow)' : 'var(--success-glow)',
                borderBottom: `1px solid ${isFlagged ? 'rgba(244,63,94,0.2)' : 'rgba(16,185,129,0.2)'}`
            }}>
                {/* Animated Score Ring */}
                <svg width="86" height="86" style={{ flexShrink: 0 }}>
                    <circle cx="43" cy="43" r={RING_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={RING_STROKE} />
                    <circle
                        cx="43" cy="43" r={RING_R}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth={RING_STROKE}
                        strokeDasharray={circumference}
                        strokeDashoffset={ringOffset}
                        strokeLinecap="round"
                        transform="rotate(-90 43 43)"
                        style={{ transition: 'stroke 0.3s', filter: `drop-shadow(0 0 6px ${ringColor})` }}
                    />
                    <text x="43" y="43" textAnchor="middle" dominantBaseline="central" fill={ringColor} fontSize="13" fontWeight="800">{scoreAnim}%</text>
                </svg>

                <div style={{ flex: 1 }}>
                    <h3 style={{ color: isFlagged ? 'var(--danger)' : 'var(--success)', fontSize: '15px', margin: 0, fontWeight: '800', letterSpacing: '0.01em' }}>
                        {isFlagged ? 'ANOMALIES & POTENTIAL FORGERY DETECTED' : 'DOCUMENT VERIFIED — CLEAN'}
                    </h3>
                    <p style={styles.bannerSub}>
                        Structural: <strong style={{ color: structural?.risk_level === 'HIGH' || structural?.risk_level === 'MEDIUM' ? 'var(--warning)' : 'var(--success)' }}>{structural?.risk_level || 'CLEAN'}</strong>
                        {' '}&nbsp;|&nbsp;{' '}
                        Logic Flags: <strong style={{ color: (logicalWarnings||[]).length > 0 ? 'var(--warning)' : 'var(--success)' }}>{(logicalWarnings||[]).length}</strong>
                        {' '}&nbsp;|&nbsp;{' '}
                        ID: <span style={{ color: '#fff' }}>{documentId}</span>
                    </p>
                </div>

                <button
                    onClick={generateReport}
                    disabled={reportStatus === 'generating'}
                    title="Download Forensic Report as HTML"
                    style={{ flexShrink: 0, background: reportStatus === 'done' ? 'rgba(16,185,129,0.15)' : reportStatus === 'error' ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.07)', border: `1px solid ${reportStatus === 'done' ? 'rgba(16,185,129,0.3)' : reportStatus === 'error' ? 'rgba(244,63,94,0.3)' : 'rgba(255,255,255,0.12)'}`, borderRadius: '8px', color: reportStatus === 'done' ? '#10b981' : reportStatus === 'error' ? '#f43f5e' : '#d1d5db', cursor: reportStatus === 'generating' ? 'wait' : 'pointer', fontSize: '11px', fontWeight: '700', padding: '7px 12px', letterSpacing: '0.02em', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                >
                    {reportStatus === 'generating' ? '⏳ Generating...' : reportStatus === 'done' ? '✓ Downloaded' : reportStatus === 'error' ? '✗ Failed' : '📄 Export Report'}
                </button>
            </div>

            {/* Split screen */}
            <div style={styles.split}>

                {/* Left — Visual Document Viewer */}
                <div style={styles.pane}>
                    <div style={styles.paneLabelContainer}>
                        <p style={styles.paneLabel}>Document Preview</p>
                        {activeTab === 'visual' && heatmap && (
                            <div style={styles.visualToggle}>
                                <button
                                    style={{ ...styles.toggleBtn, ...(visualMode === 'heatmap' ? styles.toggleBtnActive : {}) }}
                                    onClick={() => setVisualMode('heatmap')}
                                >
                                    🔥 Forgery Heatmap
                                </button>
                                {gradcam && (
                                    <button
                                        style={{ ...styles.toggleBtn, ...(visualMode === 'gradcam' ? styles.toggleBtnActiveGreen : {}) }}
                                        onClick={() => setVisualMode('gradcam')}
                                    >
                                        🧠 Grad-CAM Attention
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    
                    <div style={styles.docViewer}>
                        {isPDF ? (
                            <iframe
                                src={previewSrc}
                                style={{ width: '100%', height: '100%', border: 'none', borderRadius: '12px' }}
                                title='Document preview'
                            />
                                                ) : previewSrc ? (
                            <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {/* Base Document Image */}
                                <img
                                    src={(activeTab === 'visual' && visualMode === 'gradcam' && gradcam) ? getImgSrc(gradcam) : previewSrc}
                                    alt='Base document'
                                    onError={(e) => { e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }}
                                    style={{ maxWidth: 'calc(100% - 20px)', maxHeight: 'calc(100% - 20px)', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}
                                />

                                {/* Overlay Transparent Heatmap if on Visual Tab and heatmap exists */}
                                {activeTab === 'visual' && visualMode === 'heatmap' && heatmap && (
                                    <img
                                        src={getImgSrc(heatmap)}
                                        alt='Forgery heatmap overlay'
                                        onError={(e) => { e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }}
                                        style={{
                                            position: 'absolute',
                                            maxWidth: 'calc(100% - 20px)',
                                            maxHeight: 'calc(100% - 20px)',
                                            objectFit: 'contain',
                                            top: '50%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            pointerEvents: 'none',
                                            opacity: heatmapOpacity,
                                            borderRadius: '8px'
                                        }}
                                    />
                                )}

                                {/* Overlay Structural Bounding Boxes if on Structural Tab and overlay exists */}
                                {activeTab === 'structural' && structural?.overlay_b64 && (
                                    <img
                                        src={getImgSrc(structural.overlay_b64, 'data:image/jpeg;base64,')}
                                        alt='Structural topology boxes'
                                        onError={(e) => { e.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }}
                                        style={{
                                            position: 'absolute',
                                            maxWidth: 'calc(100% - 20px)',
                                            maxHeight: 'calc(100% - 20px)',
                                            objectFit: 'contain',
                                            top: '50%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            pointerEvents: 'none',
                                            borderRadius: '8px'
                                        }}
                                    />
                                )}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: '36px' }}>📄</span>
                                <p style={styles.mutedText}>No visual preview available</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right — 3-Layer AI Results */}
                <div style={styles.paneRight}>

                    {/* Tab Selection */}
                    <div style={styles.tabBar}>
                        <button
                            style={{ ...styles.tab, ...(activeTab === 'visual' ? styles.tabActive : {}) }}
                            onClick={() => setActiveTab('visual')}
                        >
                            🔍 Layer 1: Visual
                        </button>
                        <button
                            style={{ ...styles.tab, ...(activeTab === 'structural' ? styles.tabActive : {}) }}
                            onClick={() => setActiveTab('structural')}
                        >
                            🕸️ Layer 2: Structural
                        </button>
                        <button
                            style={{ ...styles.tab, ...(activeTab === 'logical' ? styles.tabActive : {}) }}
                            onClick={() => setActiveTab('logical')}
                        >
                            🧮 Layer 3: Logical
                        </button>
                        {isDigitalPdf && (
                            <button
                                style={{ ...styles.tab, ...(activeTab === 'metadata' ? styles.tabActive : {}), borderColor: pdfMetadata?.risk_level === 'HIGH' ? 'rgba(244,63,94,0.4)' : 'rgba(96,165,250,0.4)' }}
                                onClick={() => setActiveTab('metadata')}
                            >
                                📋 PDF Metadata
                                {pdfMetadata?.flag_count > 0 && (
                                    <span style={{ marginLeft: '6px', background: 'var(--danger)', color: '#fff', borderRadius: '999px', fontSize: '10px', padding: '1px 6px', fontWeight: '800' }}>
                                        {pdfMetadata.flag_count}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Tab Content */}
                    <div style={styles.tabContent}>

                        {/* Layer 1: Visual Forensic */}
                        {activeTab === 'visual' && (
                            <div style={styles.tabPanelWrapper}>
                                <div style={styles.layerHeader}>
                                    <h4 style={styles.layerTitle}>Neural Texture & Error Level Analysis</h4>
                                    <span style={{
                                        ...styles.badge,
                                        background: isDigitalPdf ? 'rgba(139,92,246,0.15)' : layer === 'forensic_classical_cv' ? 'var(--warning-glow)' : 'var(--primary-glow)',
                                        color: isDigitalPdf ? '#a78bfa' : layer === 'forensic_classical_cv' ? 'var(--warning)' : 'var(--primary-light)',
                                        borderColor: isDigitalPdf ? 'rgba(139,92,246,0.3)' : layer === 'forensic_classical_cv' ? 'rgba(251,191,36,0.3)' : 'rgba(96,165,250,0.3)'
                                    }}>
                                        {isDigitalPdf ? 'Bypassed — Digital PDF' : layer === 'forensic_classical_cv' ? 'Classical CV' : 'Deep CNN Mode'}
                                    </span>
                                </div>

                                {isDigitalPdf ? (
                                    <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', marginTop: '12px' }}>
                                        <p style={{ color: '#a78bfa', fontWeight: '700', fontSize: '13px', marginBottom: '8px' }}>🔄 Visual Analysis Rerouted</p>
                                        <p style={{ color: '#9ca3af', fontSize: '12px', lineHeight: '1.6' }}>
                                            This is a native digital PDF with selectable text. ELA (Error Level Analysis) is a JPEG-compression signal and is
                                            inapplicable to vector documents. The pipeline has automatically routed to <strong style={{color:'#c4b5fd'}}>PDF Metadata Forensics</strong> and
                                            <strong style={{color:'#c4b5fd'}}> Mathematical Reconciliation</strong> — both more reliable for digitally-native documents.
                                            Check the <strong style={{color:'#c4b5fd'}}>📋 PDF Metadata</strong> tab for cryptographic tampering signals.
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <p style={styles.layerDesc}>
                                            Evaluates pixel-level noise discrepancies, high-pass SRM frequency residuals, and local compression thresholds to flag spliced components.
                                        </p>

                                        {/* Opacity Control */}
                                        {heatmap && visualMode === 'heatmap' && (
                                            <div style={styles.opacityWrapper}>
                                                <span style={styles.opacityLabel}>Heatmap Opacity:</span>
                                                <input type="range" min="0" max="1" step="0.05" value={heatmapOpacity} onChange={(e) => setHeatmapOpacity(parseFloat(e.target.value))} style={styles.slider} />
                                                <span style={styles.opacityValue}>{Math.round(heatmapOpacity * 100)}%</span>
                                            </div>
                                        )}

                                        <div style={styles.metricRow}>
                                            <div style={styles.metricCard}>
                                                <p style={styles.metricLabel}>Visual Forgery Index</p>
                                                <p style={{ ...styles.metricValue, color: forensicScore > 50 ? 'var(--danger)' : 'var(--success)' }}>
                                                    {forensicScore}%
                                                </p>
                                            </div>
                                            <div style={styles.metricCard}>
                                                <p style={styles.metricLabel}>Compression Profile</p>
                                                <p style={{ ...styles.metricValueText, color: forensicScore > 50 ? 'var(--danger)' : 'var(--success)' }}>
                                                    {forensicScore > 50 ? 'Anomaly Detected' : 'Normal / Consistent'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* TTA Confidence Bar Chart */}
                                        {ttaScores.length > 0 && (
                                            <div style={{ marginTop: '14px', padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                                                <p style={{ color: '#6b7280', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>TTA Confidence — {ttaScores.length} Augmentation Passes</p>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '44px' }}>
                                                    {ttaScores.map((s, i) => {
                                                        const pct = Math.round(s * 100)
                                                        const barColor = pct > 60 ? '#f43f5e' : pct > 30 ? '#fbbf24' : '#10b981'
                                                        return (
                                                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                                <span style={{ fontSize: '9px', color: '#6b7280', fontWeight: '600' }}>{pct}%</span>
                                                                <div style={{ width: '100%', height: `${Math.max(4, pct * 0.36)}px`, background: barColor, borderRadius: '3px 3px 0 0', boxShadow: `0 0 6px ${barColor}55`, transition: 'height 0.4s ease' }} />
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                                    {ttaScores.map((_, i) => <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: '9px', color: '#374151' }}>P{i+1}</span>)}
                                                </div>
                                            </div>
                                        )}

                                        {heatmap ? (
                                            <div style={styles.hintContainer}>
                                                <span style={{ fontSize: '14px' }}>💡</span>
                                                <p style={styles.hintText}>
                                                    {visualMode === 'gradcam'
                                                        ? 'Grad-CAM Attention Highlights: Bright cyan/green spots reveal visual regions that the classifier focused on to make its judgment.'
                                                        : 'U-Net++ Forgery Segments: Glowing red boundaries pinpoint exact coordinates of digital modifications.'
                                                    }
                                                </p>
                                            </div>
                                        ) : (
                                            <div style={styles.emptyState}>
                                                <p style={{ color: 'var(--success)', margin: 0, fontWeight: '700' }}>No Visual Anomalies</p>
                                                <span style={styles.mutedText}>All frequency textures are structurally organic.</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* Layer 2: Structural Analyzer */}
                        {activeTab === 'structural' && (
                            <div style={styles.tabPanelWrapper}>
                                <div style={styles.layerHeader}>
                                    <h4 style={styles.layerTitle}>Spatial OCR Bounding Coordinates</h4>
                                    <span style={{
                                        ...styles.badge,
                                        background: structural?.risk_level === 'HIGH' || structural?.risk_level === 'MEDIUM' ? 'var(--danger-glow)' : 'var(--success-glow)',
                                        color: structural?.risk_level === 'HIGH' || structural?.risk_level === 'MEDIUM' ? 'var(--danger)' : 'var(--success)',
                                        borderColor: structural?.risk_level === 'HIGH' || structural?.risk_level === 'MEDIUM' ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'
                                    }}>
                                        {structural?.risk_level || 'CLEAN'} RISK
                                    </span>
                                </div>
                                <p style={styles.layerDesc}>
                                    Calculates structural coordinate relationships, column margin offsets, and OCR word sizes to detect floating, misaligned characters.
                                </p>

                                <div style={styles.metricRow}>
                                    <div style={styles.metricCard}>
                                        <p style={styles.metricLabel}>Layout Contradictions</p>
                                        <p style={{ ...styles.metricValue, color: structural?.anomaly_count > 0 ? 'var(--warning)' : 'var(--success)' }}>
                                            {structural?.anomaly_count || 0}
                                        </p>
                                    </div>
                                    <div style={styles.metricCard}>
                                        <p style={styles.metricLabel}>Extracted Bounding Nodes</p>
                                        <p style={styles.metricValueText}>{structural?.words_found || 0} words mapped</p>
                                    </div>
                                </div>

                                <div style={styles.anomalyScroll}>
                                    {structural?.anomalies && structural.anomalies.length > 0 ? (
                                        structural.anomalies.map((a, i) => (
                                            <div key={i} style={styles.anomalyItem}>
                                                <div style={styles.anomalyHeader}>
                                                    <span style={styles.anomalyType}>⚠️ {a.type.replace(/_/g, ' ')}</span>
                                                    <span style={{
                                                        ...styles.anomalySeverity,
                                                        background: a.severity === 'HIGH' ? 'var(--danger-glow)' : 'var(--warning-glow)',
                                                        color: a.severity === 'HIGH' ? 'var(--danger)' : 'var(--warning)'
                                                    }}>
                                                        {a.severity}
                                                    </span>
                                                </div>
                                                <p style={styles.anomalyDetail}>
                                                    Found <strong>"{a.text}"</strong> near {a.location} — {a.detail}
                                                </p>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={styles.emptyState}>
                                            <p style={{ color: 'var(--success)', margin: 0, fontWeight: '700' }}>Layout Fully Aligned</p>
                                            <span style={styles.mutedText}>No margin displacement or font anomalies identified.</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Layer 3: Logical Auditor */}
                        {activeTab === 'logical' && (
                            <div style={styles.tabPanelWrapper}>
                                <div style={styles.layerHeader}>
                                    <h4 style={styles.layerTitle}>Mathematical Reconciliation</h4>
                                    <span style={{
                                        ...styles.badge,
                                        background: logicalWarnings && logicalWarnings.length > 0 ? 'var(--danger-glow)' : 'var(--success-glow)',
                                        color: logicalWarnings && logicalWarnings.length > 0 ? 'var(--danger)' : 'var(--success)',
                                        borderColor: logicalWarnings && logicalWarnings.length > 0 ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'
                                    }}>
                                        {logicalWarnings && logicalWarnings.length > 0 ? 'Audit Discrepancy' : 'Audited Verified'}
                                    </span>
                                </div>
                                <p style={styles.layerDesc}>
                                    Performs transaction ledger summation checks (`Running Balance + Deposit - Withdrawal = Target Balance`) to uncover mathematical manipulation.
                                </p>

                                {/* Math Warnings List */}
                                <div style={{ marginBottom: '16px' }}>
                                    {logicalWarnings && logicalWarnings.length > 0 ? (
                                        <div style={styles.warningList}>
                                            <p style={{ color: 'var(--warning)', fontSize: '12px', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                Discrepancies Found:
                                            </p>
                                            {logicalWarnings.map((w, i) => (
                                                <div key={i} style={styles.warningItem}>
                                                    <span style={styles.warningNum}>{i + 1}</span>
                                                    <p style={styles.warningText}>{w}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ ...styles.emptyState, height: '110px' }}>
                                            <p style={{ color: 'var(--success)', margin: 0, fontWeight: '700' }}>Balance Math Verified</p>
                                            <span style={styles.mutedText}>All ledger entries sum up correctly.</span>
                                        </div>
                                    )}
                                </div>

                                {/* Ollama Explanation */}
                                <div style={styles.aiExplanationCard}>
                                    <div style={styles.aiExplanationHeader}>
                                        <span style={{ fontSize: '18px' }}>🤖</span>
                                        <h5 style={styles.aiExplanationTitle}>
                                            Local LLM Analysis (Phi-3 Mini)
                                        </h5>
                                    </div>
                                    <p style={styles.aiExplanationText}>
                                        {logicalExplanation ? (
                                            logicalExplanation
                                        ) : logicalWarnings && logicalWarnings.length > 0 ? (
                                            "No local AI explanation generated. Verify that Ollama is currently running 'ollama run phi3:mini' locally for automated ledger audit reports."
                                        ) : (
                                            "Perfect ledger continuity. No anomalies require semantic explanation."
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* PDF Metadata Forensics Tab — digital PDFs only */}
                        {activeTab === 'metadata' && isDigitalPdf && (
                            <div style={styles.tabPanelWrapper}>
                                <div style={styles.layerHeader}>
                                    <h4 style={styles.layerTitle}>PDF Metadata Forensics</h4>
                                    <span style={{
                                        ...styles.badge,
                                        background: pdfMetadata?.risk_level === 'HIGH' ? 'var(--danger-glow)' : pdfMetadata?.risk_level === 'MEDIUM' ? 'var(--warning-glow)' : 'var(--success-glow)',
                                        color: pdfMetadata?.risk_level === 'HIGH' ? 'var(--danger)' : pdfMetadata?.risk_level === 'MEDIUM' ? 'var(--warning)' : 'var(--success)',
                                        borderColor: pdfMetadata?.risk_level === 'HIGH' ? 'rgba(244,63,94,0.3)' : pdfMetadata?.risk_level === 'MEDIUM' ? 'rgba(251,191,36,0.3)' : 'rgba(16,185,129,0.3)'
                                    }}>
                                        {pdfMetadata?.risk_level || 'CLEAN'} RISK
                                    </span>
                                </div>
                                <p style={styles.layerDesc}>
                                    Inspects embedded PDF metadata for post-issuance modification timestamps, suspicious producer software, and structural integrity signals invisible to visual analysis.
                                </p>

                                {pdfMetadata?.flags && pdfMetadata.flags.length > 0 ? (
                                    <div style={styles.warningList}>
                                        <p style={{ color: 'var(--warning)', fontSize: '12px', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                            Tampering Signals Detected:
                                        </p>
                                        {pdfMetadata.flags.map((flag, i) => (
                                            <div key={i} style={{ ...styles.anomalyItem, marginBottom: '10px' }}>
                                                <div style={styles.anomalyHeader}>
                                                    <span style={styles.anomalyType}>⚠️ {flag.type.replace(/_/g, ' ')}</span>
                                                    <span style={{
                                                        ...styles.anomalySeverity,
                                                        background: flag.severity === 'HIGH' ? 'var(--danger-glow)' : 'var(--warning-glow)',
                                                        color: flag.severity === 'HIGH' ? 'var(--danger)' : 'var(--warning)'
                                                    }}>
                                                        {flag.severity}
                                                    </span>
                                                </div>
                                                <p style={styles.anomalyDetail}>{flag.detail}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ ...styles.emptyState, height: '80px' }}>
                                        <p style={{ color: 'var(--success)', margin: 0, fontWeight: '700' }}>✅ Metadata Integrity Verified</p>
                                        <span style={styles.mutedText}>No post-issuance modification or suspicious producer signals detected.</span>
                                    </div>
                                )}

                                {pdfMetadata?.raw_metadata && (
                                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '14px', marginTop: '12px' }}>
                                        <p style={{ color: '#6b7280', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Raw Metadata Dump</p>
                                        {[
                                            ['Producer', pdfMetadata.raw_metadata.producer || '—'],
                                            ['Creator',  pdfMetadata.raw_metadata.creator  || '—'],
                                            ['Created',  pdfMetadata.raw_metadata.created  || '—'],
                                            ['Modified', pdfMetadata.raw_metadata.modified || '—'],
                                            ['Pages',    pdfMetadata.raw_metadata.page_count ?? '—'],
                                            ['Encrypted',pdfMetadata.raw_metadata.encrypted ? 'Yes ⚠️' : 'No'],
                                        ].map(([label, value]) => (
                                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12px' }}>
                                                <span style={{ color: '#6b7280', fontWeight: '600' }}>{label}</span>
                                                <span style={{ color: '#d1d5db', fontFamily: 'monospace', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{String(value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>

                </div>
            </div>
        </div>
    )
}