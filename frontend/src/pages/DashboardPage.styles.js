export const styles = {
    page: {
        minHeight: '100vh',
        background: '#040711',
        position: 'relative',
        overflow: 'hidden'
    },
    glowTop: {
        position: 'absolute',
        width: '600px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, rgba(0,0,0,0) 80%)',
        top: '-150px',
        left: 'calc(50% - 300px)',
        pointerEvents: 'none'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 40px',
        background: 'rgba(10, 15, 30, 0.7)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 100
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
    },
    logoBadge: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '42px',
        height: '42px',
        background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(99,102,241,0.05) 100%)',
        border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: '12px',
        fontSize: '20px'
    },
    headerTitle: { 
        fontSize: '20px', 
        fontWeight: '800', 
        color: '#fff',
        letterSpacing: '-0.02em',
        margin: 0
    },
    gradientText: {
        background: 'linear-gradient(to right, #3b82f6, #60a5fa)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    headerSub: { 
        fontSize: '11px', 
        color: '#60a5fa', 
        margin: '2px 0 0 0',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    },
    headerRight: {
        display: 'flex',
        alignItems: 'center',
        gap: '18px'
    },
    main: {
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '32px 40px'
    },
    welcomeCard: {
        background: 'linear-gradient(135deg, rgba(12, 17, 29, 0.4) 0%, rgba(18, 25, 41, 0.4) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '20px',
        padding: '28px 32px',
        marginBottom: '32px',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.02)'
    },
    welcomeTitle: {
        fontSize: '22px',
        fontWeight: '800',
        color: '#fff',
        marginBottom: '6px',
        letterSpacing: '-0.01em'
    },
    welcomeDesc: {
        color: '#9ca3af',
        fontSize: '14px',
        lineHeight: '1.6',
        maxWidth: '900px',
        margin: 0
    },
    workspaceGrid: {
        display: 'grid',
        gridTemplateColumns: '400px 1fr',
        gap: '32px',
        alignItems: 'start'
    },
    controlPane: {
        display: 'flex',
        flexDirection: 'column'
    },
    resultsPane: {
        background: 'rgba(12, 17, 29, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '20px',
        padding: '28px',
        minHeight: '500px',
        display: 'flex',
        flexDirection: 'column'
    },
    cardHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px'
    },
    cardTitle: {
        fontSize: '16px',
        fontWeight: '700',
        color: '#fff',
        margin: 0
    },
    errorContainer: {
        color: 'var(--danger)',
        fontSize: '13px',
        background: 'var(--danger-glow)',
        border: '1px solid rgba(244,63,94,0.2)',
        borderRadius: '10px',
        padding: '12px 16px',
        marginTop: '12px',
        display: 'flex',
        alignItems: 'center'
    },
    historyList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
    },
    historyIcon: {
        fontSize: '20px',
        flexShrink: 0
    },
    historyName: {
        fontSize: '13px',
        color: '#fff',
        fontWeight: '600',
        margin: '0 0 2px 0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    historyDate: {
        fontSize: '11px',
        color: '#9ca3af',
        margin: 0
    },
    historyBadge: {
        padding: '3px 8px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: '700',
        whiteSpace: 'nowrap',
        border: '1px solid'
    },
    historyScore: {
        fontSize: '12px',
        fontWeight: '700',
        minWidth: '36px',
        textAlign: 'right'
    },
    emptyResults: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '40px 20px',
        border: '1px dashed rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        background: 'rgba(255, 255, 255, 0.01)'
    },
    emptyIcon: {
        fontSize: '44px',
        marginBottom: '16px',
        animation: 'pulse 2s infinite'
    },
    emptyTitle: {
        fontSize: '16px',
        fontWeight: '700',
        color: '#fff',
        marginBottom: '6px'
    },
    emptyDesc: {
        color: '#9ca3af',
        fontSize: '13px',
        lineHeight: '1.5',
        maxWidth: '380px',
        margin: 0
    }
}
