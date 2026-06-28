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
                <span style={styles.bannerIcon}>{isFlagged ? '🚨' : '✅'}</span>
                <div style={{ flex: 1 }}>
                    <h3 style={{ color: isFlagged ? 'var(--danger)' : 'var(--success)', fontSize: '15px', margin: 0, fontWeight: '800', letterSpacing: '0.01em' }}>
                        {isFlagged ? 'ANOMALIES & POTENTIAL FORGERY DETECTED' : 'DOCUMENT VERIFIED — CLEAN'}
                    </h3>
                    <p style={styles.bannerSub}>
                        Visual Risk: <strong style={{ color: isFlagged ? 'var(--danger)' : 'var(--success)' }}>{forensicScore}%</strong> | Structural: <strong style={{ color: structural?.risk_level === 'HIGH' || structural?.risk_level === 'MEDIUM' ? 'var(--warning)' : 'var(--success)' }}>{structural?.risk_level || 'CLEAN'}</strong> | ID: <span style={{ color: '#fff' }}>{documentId}</span>
                    </p>
                </div>
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