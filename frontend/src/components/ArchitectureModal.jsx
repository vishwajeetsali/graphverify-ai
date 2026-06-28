import { useEffect } from 'react'

const LAYERS = [
    {
        icon: '🔬',
        color: '#3b82f6',
        glow: 'rgba(59,130,246,0.15)',
        border: 'rgba(59,130,246,0.25)',
        title: 'Layer 1 — Visual Neural Forensics',
        badge: 'EfficientNet-B4 + U-Net++',
        points: [
            'Error Level Analysis (ELA) — detects JPEG re-compression artifacts left by digital edits',
            'SRM (Steganalysis Rich Model) — extracts high-frequency noise residuals invisible to the human eye',
            'DCT Coefficient Analysis — reveals inconsistent quantization tables across image blocks',
            'EfficientNet-B4 classifier fuses all 3 streams → forgery probability score',
            'U-Net++ segmenter generates a pixel-level heatmap of tampered regions',
            '5× Test-Time Augmentation (TTA) for confidence stability',
        ]
    },
    {
        icon: '🕸️',
        color: '#8b5cf6',
        glow: 'rgba(139,92,246,0.15)',
        border: 'rgba(139,92,246,0.25)',
        title: 'Layer 2 — Spatial Graph Analysis',
        badge: 'Tesseract OCR + Graph Engine',
        points: [
            'Tesseract OCR extracts every word with its bounding box coordinates (300 DPI)',
            'Builds a spatial topology graph of all text elements',
            'Detects floating characters — text whose Y-position breaks column alignment',
            'Flags font-size anomalies where a digit is statistically larger/smaller than neighbors',
            'Identifies orphaned words with no column-consistent neighbors',
            'Deduplicates overlapping anomalies by (type, location) for clean reporting',
        ]
    },
    {
        icon: '🧮',
        color: '#10b981',
        glow: 'rgba(16,185,129,0.15)',
        border: 'rgba(16,185,129,0.25)',
        title: 'Layer 3 — Mathematical Reconciliation',
        badge: 'Transaction Ledger Audit',
        points: [
            'Extracts transaction rows using date-signature regex across 6 Indian date formats',
            'Sliding-window balance continuity check: prev_balance ± debit/credit = curr_balance',
            'Tolerance of ±₹1.0 for floating-point rounding across banks',
            'Detects sign flips — debits appearing as credits and vice versa',
            'Flags suspiciously large single transactions (>2× running balance)',
            'Phi-3 Mini LLM generates a semantic audit explanation for each anomaly',
        ]
    },
    {
        icon: '📋',
        color: '#f59e0b',
        glow: 'rgba(245,158,11,0.15)',
        border: 'rgba(245,158,11,0.25)',
        title: 'Layer 4 — PDF Metadata Forensics',
        badge: 'Digital PDFs only',
        points: [
            'Active only for native digital PDFs — where pixel ELA is inapplicable',
            'Compares PDF creation vs modification timestamps for post-issuance edits',
            'Flags suspicious producer software (Word, LibreOffice, Photoshop, Canva)',
            'Detects PDF cross-reference table repairs (sign of unauthorized binary edits)',
            'Checks unexpected encryption state on bank statements',
        ]
    }
]

export default function ArchitectureModal({ onClose }) {
    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [onClose])

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(6,9,19,0.85)',
                backdropFilter: 'blur(12px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px',
                overflowY: 'auto',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#0c111d',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '20px',
                    width: '100%',
                    maxWidth: '860px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    padding: '36px',
                    boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.1)',
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
                    <div>
                        <h2 style={{ color: '#f3f4f6', fontSize: '22px', fontWeight: '800', margin: 0, letterSpacing: '-0.01em' }}>
                            ⚡ GraphVerify AI — System Architecture
                        </h2>
                        <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '6px' }}>
                            4-layer forensic pipeline · React → Node.js → FastAPI/PyTorch · MongoDB Atlas
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#9ca3af', cursor: 'pointer', fontSize: '18px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >×</button>
                </div>

                {/* Pipeline flow */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '28px', flexWrap: 'wrap' }}>
                    {['React (Vercel)', '→', 'Node.js (Render)', '→', 'FastAPI/PyTorch (HF Spaces)', '→', 'MongoDB Atlas'].map((s, i) => (
                        s === '→'
                            ? <span key={i} style={{ color: '#374151', fontSize: '18px', fontWeight: '700' }}>→</span>
                            : <span key={i} style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', color: '#60a5fa', fontWeight: '600' }}>{s}</span>
                    ))}
                </div>

                {/* Layers */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {LAYERS.map((layer, i) => (
                        <div key={i} style={{ background: layer.glow, border: `1px solid ${layer.border}`, borderRadius: '14px', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                                <span style={{ fontSize: '22px' }}>{layer.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ color: '#f3f4f6', fontSize: '14px', fontWeight: '800', margin: 0 }}>{layer.title}</h3>
                                </div>
                                <span style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${layer.border}`, borderRadius: '6px', padding: '3px 10px', fontSize: '11px', color: layer.color, fontWeight: '700', whiteSpace: 'nowrap' }}>
                                    {layer.badge}
                                </span>
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {layer.points.map((pt, j) => (
                                    <li key={j} style={{ color: '#9ca3af', fontSize: '12px', lineHeight: '1.6' }}>{pt}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Stats footer */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
                    {[
                        ['Model', 'EfficientNet-B4 + ResNet34 U-Net++'],
                        ['Training Data', '5,000+ synthetic forgery samples'],
                        ['Inference', 'TTA × 5 passes per document'],
                        ['Confidence Threshold', '15% cascade bypass'],
                    ].map(([label, value]) => (
                        <div key={label} style={{ flex: 1, minWidth: '160px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px 14px' }}>
                            <p style={{ color: '#6b7280', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>{label}</p>
                            <p style={{ color: '#d1d5db', fontSize: '12px', fontWeight: '600', margin: 0 }}>{value}</p>
                        </div>
                    ))}
                </div>

                <p style={{ textAlign: 'center', color: '#374151', fontSize: '11px', marginTop: '20px' }}>
                    Press Esc or click outside to close
                </p>
            </div>
        </div>
    )
}
