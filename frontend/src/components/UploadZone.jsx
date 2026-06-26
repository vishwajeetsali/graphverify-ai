import { useCallback, useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { styles } from './UploadZone.styles.js'

const STEPS = [
    { label: 'Running Error Level Analysis (ELA)...', duration: 3000 },
    { label: 'EfficientNet-B4 classifying forgery...', duration: 3000 },
    { label: 'U-Net++ segmenting tampered pixels...', duration: 3000 },
    { label: 'Local LLM auditing ledger math...', duration: 2000 },
]

export default function UploadZone({ onUpload, loading }) {
    const [stepIndex, setStepIndex] = useState(0)

    useEffect(() => {
        if (!loading) { setStepIndex(0); return }
        const timer = setInterval(() => {
            setStepIndex(prev => (prev < STEPS.length - 1 ? prev + 1 : prev))
        }, 3000)
        return () => clearInterval(timer)
    }, [loading]);

    const onDrop = useCallback((acceptedFiles) => {
        if (acceptedFiles.length > 0 && !loading) {
            onUpload(acceptedFiles[0])
        }
    }, [onUpload, loading])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.jpg', '.jpeg', '.png'],
            'application/pdf': ['.pdf']
        },
        maxFiles: 1,
        disabled: loading
    })

    return (
        <div
            {...getRootProps()}
            className="upload-zone"
            style={{
                borderColor: isDragActive ? 'var(--primary)' : undefined,
                background: isDragActive ? 'rgba(59, 130, 246, 0.04)' : 'rgba(18, 25, 41, 0.45)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.9 : 1,
                boxShadow: isDragActive ? '0 0 24px rgba(59, 130, 246, 0.15)' : 'none'
            }}
        >
            <input {...getInputProps()} />

            {loading ? (
                <div style={styles.center}>
                    <div style={styles.spinner} />
                    <p style={styles.loadingText}>{STEPS[stepIndex].label}</p>
                    <div style={styles.stepsRow}>
                        {STEPS.map((s, i) => (
                            <div key={i} style={{
                                ...styles.stepDot,
                                background: i < stepIndex ? 'var(--success)' : i === stepIndex ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                                boxShadow: i === stepIndex ? '0 0 8px var(--primary)' : 'none'
                            }} />
                        ))}
                    </div>
                    <span style={styles.subText}>Layer {stepIndex + 1} of {STEPS.length} Processing...</span>
                </div>
            ) : isDragActive ? (
                <div style={styles.center}>
                    <span style={styles.icon}>📂</span>
                    <p style={styles.mainText}>Drop document here to start audit...</p>
                    <span style={styles.subText}>Release to upload and scan</span>
                </div>
            ) : (
                <div style={styles.center}>
                    <span style={styles.icon}>📄</span>
                    <p style={styles.mainText}>Drag & drop document or <span style={{ color: 'var(--primary-light)', textDecoration: 'underline' }}>browse</span></p>
                    <span style={styles.subText}>Supports JPG, PNG, PDF (Statements, Ledgers)</span>
                </div>
            )}
        </div>
    )
}