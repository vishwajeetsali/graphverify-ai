import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import axios from 'axios'
import { styles } from './LoginPage.styles.js'

export default function LoginPage() {
    const navigate = useNavigate()
    const [username, setUsername] = useState('demo-officer')
    const [status, setStatus] = useState('idle')
    const [message, setMessage] = useState('')

    const handleBypass = async () => {
        setStatus('loading')
        setMessage('')
        try {
            const res = await axios.post('/auth/demo-login', { username })
            localStorage.setItem('gv_token', res.data.token)
            navigate('/dashboard')
        } catch (err) {
            console.error(err)
            setMessage('Demo login failed: ' + (err.response?.data?.error || err.message))
            setStatus('error')
        }
    }

    const handleRegisterBiometrics = async () => {
        if (!username.trim()) {
            setMessage('Please enter a username first.')
            setStatus('error')
            return
        }
        setStatus('loading')
        setMessage('Generating registration keys...')
        try {
            const optionsRes = await axios.get(`/auth/generate-registration-options?username=${username}`)
            const options = optionsRes.data

            setMessage('Please authenticate via your device biometrics prompt...')
            const regResp = await startRegistration({ optionsJSON: options })

            setMessage('Verifying registration on server...')
            const verifyRes = await axios.post('/auth/verify-registration', {
                username,
                registrationResponse: regResp
            })

            if (verifyRes.data.verified) {
                localStorage.setItem('gv_token', verifyRes.data.token)
                setMessage('Biometrics registered successfully!')
                setTimeout(() => navigate('/dashboard'), 1000)
            }
        } catch (err) {
            console.error(err)
            setMessage('Biometric registration failed: ' + (err.response?.data?.error || err.message))
            setStatus('error')
        }
    }

    const handleBiometricLogin = async () => {
        if (!username.trim()) {
            setMessage('Please enter your username.')
            setStatus('error')
            return
        }
        setStatus('loading')
        setMessage('Retrieving credential keys...')
        try {
            const optionsRes = await axios.get(`/auth/generate-authentication-options?username=${username}`)
            const options = optionsRes.data

            setMessage('Please scan your biometrics (fingerprint/Face ID/Windows Hello)...')
            const authResp = await startAuthentication({ optionsJSON: options })

            setMessage('Verifying signature on server...')
            const verifyRes = await axios.post('/auth/verify-authentication', {
                username,
                authenticationResponse: authResp
            })

            if (verifyRes.data.verified) {
                localStorage.setItem('gv_token', verifyRes.data.token)
                setMessage('Authenticated successfully!')
                setTimeout(() => navigate('/dashboard'), 1000)
            }
        } catch (err) {
            console.error(err)
            setMessage('Biometric login failed. Make sure you registered biometrics for this username first: ' + (err.response?.data?.error || err.message))
            setStatus('error')
        }
    }

    return (
        <div className="login-container">
            {/* Background glowing blobs */}
            <div className="login-glow-blue" />
            <div className="login-glow-indigo" />

            <div className="login-card">
                <div style={styles.iconContainer}>
                    <span style={styles.icon}>🔐</span>
                </div>
                
                <h1 style={styles.title}>GraphVerify <span style={styles.gradientText}>AI</span></h1>
                <p style={styles.subtitle}>SuRaksha Document Forensics Suite</p>
                <div style={styles.bankTag}>Canara Bank Underwriter Portal</div>

                <p style={styles.desc}>
                    Access the secure underwriter portal using device-native biometric authentication.
                </p>

                <div style={styles.inputContainer}>
                    <label style={styles.label}>Underwriter Username</label>
                    <input
                        type="text"
                        className="login-input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. demo-officer"
                        disabled={status === 'loading'}
                    />
                </div>

                <div style={styles.actions}>
                    <button
                        className="login-btn login-btn-biometrics"
                        style={{
                            opacity: status === 'loading' ? 0.7 : 1
                        }}
                        onClick={handleBiometricLogin}
                        disabled={status === 'loading'}
                    >
                        🔑 Login with Biometrics
                    </button>

                    <button
                        className="login-btn login-btn-register"
                        style={{
                            opacity: status === 'loading' ? 0.7 : 1
                        }}
                        onClick={handleRegisterBiometrics}
                        disabled={status === 'loading'}
                    >
                        🪪 Register Device Biometrics
                    </button>

                    <button
                        className="login-btn login-btn-bypass"
                        style={{
                            opacity: status === 'loading' ? 0.7 : 1
                        }}
                        onClick={handleBypass}
                        disabled={status === 'loading'}
                    >
                        ⚡ Demo Quick Bypass (No hardware req.)
                    </button>
                </div>

                {message && (
                    <div style={{
                        ...styles.statusMessage,
                        color: status === 'error' ? '#f43f5e' : '#10b981',
                        backgroundColor: status === 'error' ? 'rgba(244,63,94,0.06)' : 'rgba(16,185,129,0.06)',
                        borderColor: status === 'error' ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)'
                    }}>
                        {status === 'loading' && <div style={styles.miniSpinner} />}
                        <span>{message}</span>
                    </div>
                )}

                <p style={styles.note}>
                    Fully local WebAuthn protocol active (secured context)
                </p>
            </div>
        </div>
    )
}