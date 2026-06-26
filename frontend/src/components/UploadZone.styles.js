export const styles = {
    center: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px'
    },
    icon: { 
        fontSize: '44px',
        marginBottom: '4px'
    },
    mainText: { 
        fontSize: '15px', 
        color: '#fff',
        fontWeight: '600',
        margin: 0
    },
    subText: { 
        fontSize: '12px', 
        color: '#9ca3af',
        margin: 0
    },
    loadingText: { 
        fontSize: '14px', 
        color: 'var(--primary-light)', 
        fontWeight: '700',
        margin: 0,
        animation: 'pulse 1.5s infinite'
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '3px solid rgba(255,255,255,0.05)',
        borderTopColor: 'var(--primary)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '4px'
    },
    stepsRow: {
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        margin: '6px 0'
    },
    stepDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        transition: 'all 0.4s ease'
    },
}
