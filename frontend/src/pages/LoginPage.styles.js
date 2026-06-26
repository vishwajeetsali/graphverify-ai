export const styles = {
    iconContainer: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '72px',
        height: '72px',
        borderRadius: '20px',
        background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(99,102,241,0.05) 100%)',
        border: '1px solid rgba(59,130,246,0.2)',
        marginBottom: '20px'
    },
    icon: { fontSize: '32px' },
    title: { 
        fontSize: '30px', 
        fontWeight: '800', 
        color: '#fff', 
        marginBottom: '6px', 
        letterSpacing: '-0.02em' 
    },
    gradientText: {
        background: 'linear-gradient(to right, #3b82f6, #60a5fa)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    subtitle: { 
        color: '#60a5fa', 
        fontSize: '14px', 
        fontWeight: '600', 
        marginBottom: '8px', 
        letterSpacing: '0.02em',
        textTransform: 'uppercase'
    },
    bankTag: {
        display: 'inline-block',
        fontSize: '11px',
        fontWeight: '700',
        color: '#9ca3af',
        background: 'rgba(255, 255, 255, 0.05)',
        padding: '4px 12px',
        borderRadius: '30px',
        marginBottom: '28px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        border: '1px solid rgba(255, 255, 255, 0.04)'
    },
    desc: { 
        color: '#9ca3af', 
        fontSize: '14px', 
        lineHeight: '1.6', 
        marginBottom: '28px' 
    },
    inputContainer: {
        textAlign: 'left',
        marginBottom: '24px'
    },
    label: {
        display: 'block',
        fontSize: '11px',
        color: '#9ca3af',
        fontWeight: '700',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    },
    actions: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '24px'
    },
    statusMessage: {
        fontSize: '13px',
        lineHeight: '1.5',
        marginBottom: '20px',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px solid',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px'
    },
    miniSpinner: {
        width: '16px',
        height: '16px',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        borderTopColor: 'inherit',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite'
    },
    note: { color: '#4b5563', fontSize: '11px', marginTop: '12px' }
}
