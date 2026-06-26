export const styles = {
    panel: { 
        background: 'rgba(12, 18, 32, 0.45)', 
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)', 
        borderRadius: '20px', 
        overflow: 'hidden',
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)'
    },
    skeletonBanner: { 
        height: '64px', 
        background: 'rgba(255,255,255,0.02)', 
        margin: '20px', 
        borderRadius: '12px', 
        animation: 'pulse 1.5s infinite' 
    },
    skeletonLine: { 
        height: '16px', 
        width: '70%', 
        background: 'rgba(255,255,255,0.02)', 
        margin: '0 20px 20px 20px', 
        borderRadius: '6px',
        animation: 'pulse 1.5s infinite' 
    },
    banner: { 
        display: 'flex', 
        alignItems: 'center', 
        gap: '16px', 
        padding: '20px 28px' 
    },
    bannerIcon: {
        fontSize: '28px'
    },
    bannerSub: { 
        fontSize: '13px', 
        color: '#9ca3af', 
        margin: 0,
        marginTop: '6px',
        fontWeight: '500'
    },
    split: { 
        display: 'grid', 
        gridTemplateColumns: '1fr 1.1fr', 
        borderTop: '1px solid rgba(255, 255, 255, 0.06)'
    },
    pane: { 
        padding: '24px', 
        display: 'flex', 
        flexDirection: 'column',
        gap: '16px'
    },
    paneRight: {
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        borderLeft: '1px solid rgba(255, 255, 255, 0.06)'
    },
    paneLabelContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '30px'
    },
    paneLabel: { 
        fontSize: '11px', 
        fontWeight: '800', 
        color: '#9ca3af', 
        textTransform: 'uppercase', 
        letterSpacing: '0.08em', 
        margin: 0 
    },
    docViewer: { 
        background: 'rgba(5, 7, 12, 0.6)', 
        borderRadius: '16px', 
        height: '420px', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        overflow: 'hidden', 
        border: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.5)'
    },
    mutedText: { 
        fontSize: '13px', 
        color: '#9ca3af', 
        marginTop: '4px',
        margin: 0
    },
    tabBar: { 
        display: 'flex', 
        gap: '8px',
        background: 'rgba(0,0,0,0.2)',
        padding: '4px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.04)'
    },
    tab: { 
        padding: '10px 14px', 
        background: 'transparent', 
        color: '#9ca3af', 
        borderRadius: '10px', 
        fontSize: '12px', 
        fontWeight: '700', 
        cursor: 'pointer', 
        flex: 1, 
        whiteSpace: 'nowrap',
        textAlign: 'center'
    },
    tabActive: { 
        background: 'rgba(59, 130, 246, 0.1)', 
        color: '#60a5fa', 
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        border: '1px solid rgba(59, 130, 246, 0.2)'
    },
    tabContent: { 
        background: 'rgba(18, 25, 41, 0.3)', 
        borderRadius: '16px', 
        padding: '20px', 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        border: '1px solid rgba(255, 255, 255, 0.06)' 
    },
    tabPanelWrapper: {
        display: 'flex',
        flexDirection: 'column',
        flex: 1
    },
    layerHeader: { 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '10px', 
        gap: '8px' 
    },
    layerTitle: { 
        fontSize: '14px', 
        fontWeight: '800', 
        color: '#fff', 
        margin: 0 
    },
    layerDesc: { 
        fontSize: '12px', 
        color: '#9ca3af', 
        margin: '0 0 20px 0', 
        lineHeight: '1.5' 
    },
    badge: { 
        padding: '4px 10px', 
        borderRadius: '30px', 
        fontSize: '11px', 
        fontWeight: '700', 
        whiteSpace: 'nowrap',
        border: '1px solid'
    },
    opacityWrapper: {
        margin: '0 0 20px 0', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px',
        background: 'rgba(0,0,0,0.15)',
        padding: '10px 14px',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.03)'
    },
    opacityLabel: { 
        fontSize: '11px', 
        color: '#9ca3af', 
        minWidth: '100px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.02em'
    },
    slider: { 
        flex: 1,
        cursor: 'pointer'
    },
    opacityValue: { 
        fontSize: '12px', 
        color: '#fff', 
        minWidth: '32px',
        fontWeight: '700',
        textAlign: 'right'
    },
    metricRow: { 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '16px' 
    },
    metricCard: { 
        flex: 1, 
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid rgba(255,255,255,0.06)', 
        borderRadius: '12px', 
        padding: '14px', 
        textAlign: 'center' 
    },
    metricLabel: { 
        fontSize: '10px', 
        color: '#9ca3af', 
        margin: '0 0 6px 0', 
        textTransform: 'uppercase', 
        fontWeight: '800',
        letterSpacing: '0.05em'
    },
    metricValue: { 
        fontSize: '24px', 
        fontWeight: '800', 
        margin: 0,
        letterSpacing: '-0.02em'
    },
    metricValueText: { 
        fontSize: '13px', 
        fontWeight: '700', 
        margin: '4px 0 0 0' 
    },
    emptyState: { 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '180px', 
        gap: '8px', 
        textAlign: 'center', 
        background: 'rgba(255,255,255,0.01)', 
        border: '1px dashed rgba(255, 255, 255, 0.08)', 
        borderRadius: '12px' 
    },
    anomalyScroll: { 
        marginTop: '8px', 
        maxHeight: '170px', 
        overflowY: 'auto', 
        paddingRight: '6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    anomalyItem: { 
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid rgba(255,255,255,0.06)', 
        borderRadius: '10px', 
        padding: '10px 14px'
    },
    anomalyHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px'
    },
    anomalyType: { 
        fontSize: '11px', 
        fontWeight: '700', 
        textTransform: 'uppercase',
        letterSpacing: '0.02em'
    },
    anomalySeverity: { 
        fontSize: '10px', 
        fontWeight: '700',
        padding: '2px 6px',
        borderRadius: '6px'
    },
    anomalyDetail: { 
        fontSize: '12px', 
        color: '#d1d5db', 
        margin: 0, 
        lineHeight: '1.4' 
    },
    warningList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    warningItem: { 
        display: 'flex', 
        gap: '10px', 
        alignItems: 'center', 
        padding: '10px 14px', 
        background: 'var(--danger-glow)', 
        border: '1px solid rgba(244,63,94,0.15)', 
        borderRadius: '10px'
    },
    warningNum: { 
        background: 'var(--danger)', 
        color: '#fff', 
        fontSize: '10px', 
        fontWeight: '800', 
        width: '18px', 
        height: '18px', 
        borderRadius: '50%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        flexShrink: 0 
    },
    warningText: { 
        fontSize: '12px', 
        color: '#fca5a5', 
        margin: 0,
        lineHeight: '1.4'
    },
    aiExplanationCard: { 
        background: 'rgba(59, 130, 246, 0.03)', 
        border: '1px solid rgba(59, 130, 246, 0.1)', 
        borderRadius: '12px', 
        padding: '14px' 
    },
    aiExplanationHeader: { 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginBottom: '10px' 
    },
    aiExplanationTitle: { 
        margin: 0, 
        fontSize: '12px', 
        color: '#60a5fa', 
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: '0.04em'
    },
    aiExplanationText: { 
        fontSize: '12px', 
        color: '#d1d5db', 
        margin: 0, 
        lineHeight: '1.5', 
        fontStyle: 'italic' 
    },
    visualToggle: { 
        display: 'flex', 
        gap: '6px'
    },
    toggleBtn: { 
        padding: '6px 12px', 
        background: 'rgba(255,255,255,0.03)', 
        color: '#9ca3af', 
        borderRadius: '8px', 
        fontSize: '11px', 
        fontWeight: '700', 
        border: '1px solid rgba(255,255,255,0.06)', 
        cursor: 'pointer', 
        transition: 'all 0.2s ease' 
    },
    toggleBtnActive: { 
        background: 'var(--danger-glow)', 
        color: 'var(--danger)', 
        borderColor: 'rgba(244,63,94,0.3)' 
    },
    toggleBtnActiveGreen: { 
        background: 'var(--success-glow)', 
        color: 'var(--success)', 
        borderColor: 'rgba(16,185,129,0.3)' 
    },
    hintContainer: {
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        background: 'rgba(255, 255, 255, 0.02)',
        padding: '12px 14px',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.04)',
        marginTop: '10px'
    },
    hintText: {
        color: '#9ca3af',
        fontSize: '11px',
        lineHeight: '1.4',
        margin: 0
    }
}
