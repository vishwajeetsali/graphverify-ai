const jwt = require('jsonwebtoken')
const User = require('../models/User')
const mongoose = require('mongoose')
const keys = require('../config/keys')
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server')

// Helper to dynamically extract origin and hostname (RP ID) from request headers
function _getWebAuthnConfig(req) {
    const origin = req.headers.origin || 'http://localhost:5173'
    let rpID = 'localhost'
    try {
        const url = new URL(origin)
        rpID = url.hostname
    } catch (e) {
        console.error('[WEBAUTHN CONFIG ERROR]', e.message)
    }
    return { origin, rpID }
}

// ── PHASE 1: Demo login (no biometrics) ───────────────────────────────────
// Left as a robust fallback in case biometric hardware is unavailable
exports.demoLogin = async (req, res) => {
    try {
        const { username = 'demo-officer' } = req.body

        let userId = '65d12345678901234567890a' // Static valid ObjectId for offline session
        let finalUsername = username

        if (mongoose.connection.readyState === 1) {
            let user = await User.findOne({ username })
            if (!user) {
                user = await User.create({ username })
            }
            userId = user._id
            finalUsername = user.username
        } else {
            console.warn('⚠️ [OFFLINE AUTH] MongoDB disconnected. Issuing transient token for demo.')
        }

        const token = jwt.sign(
            { userId: userId, username: finalUsername },
            keys.jwtSecret,
            { expiresIn: '8h' }
        )

        res.json({ token, username: finalUsername, offlineMode: mongoose.connection.readyState !== 1 })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

// ── PHASE 2: WebAuthn Implementation ───────────────────────────────────────

exports.generateRegistrationOptions = async (req, res) => {
    try {
        const { username } = req.query
        if (!username) {
            return res.status(400).json({ error: 'Username query parameter is required' })
        }

        let user = await User.findOne({ username })
        if (!user) {
            user = await User.create({ username })
        }

        const { origin, rpID } = _getWebAuthnConfig(req)

        const options = await generateRegistrationOptions({
            rpName: 'GraphVerify AI',
            rpID: rpID,
            userID: user._id.toString(),
            userName: user.username,
            userDisplayName: user.username,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'preferred',
                authenticatorAttachment: 'platform', // Force Touch ID / Windows Hello biometrics
            },
        })

        user.currentChallenge = options.challenge
        await user.save()

        res.json(options)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

exports.verifyRegistration = async (req, res) => {
    try {
        const { username, registrationResponse } = req.body
        if (!username || !registrationResponse) {
            return res.status(400).json({ error: 'Username and registrationResponse are required' })
        }

        const user = await User.findOne({ username })
        if (!user || !user.currentChallenge) {
            return res.status(400).json({ error: 'Registration challenge not found for user' })
        }

        const { origin, rpID } = _getWebAuthnConfig(req)

        const verification = await verifyRegistrationResponse({
            response: registrationResponse,
            expectedChallenge: user.currentChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        })

        if (!verification.verified) {
            return res.status(400).json({ error: 'Registration verification failed' })
        }

        const { credentialID, credentialPublicKey, counter } = verification.registrationInfo

        user.credentialID = Buffer.from(credentialID).toString('base64url')
        user.credentialPublicKey = Buffer.from(credentialPublicKey)
        user.counter = counter
        user.currentChallenge = null
        await user.save()

        const token = jwt.sign(
            { userId: user._id, username: user.username },
            keys.jwtSecret,
            { expiresIn: '8h' }
        )

        res.json({ verified: true, token, username: user.username })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

exports.generateAuthenticationOptions = async (req, res) => {
    try {
        const { username } = req.query
        if (!username) {
            return res.status(400).json({ error: 'Username query parameter is required' })
        }

        const user = await User.findOne({ username })
        if (!user || !user.credentialID) {
            return res.status(404).json({ error: 'User or biometrics credential not registered' })
        }

        const { origin, rpID } = _getWebAuthnConfig(req)

        const options = await generateAuthenticationOptions({
            rpID: rpID,
            allowCredentials: [{
                id: Buffer.from(user.credentialID, 'base64url'),
                type: 'public-key',
                transports: ['internal'], // Only search for internal biometrics (Windows Hello)
            }],
            userVerification: 'preferred',
        })

        user.currentChallenge = options.challenge
        await user.save()

        res.json(options)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

exports.verifyAuthentication = async (req, res) => {
    try {
        const { username, authenticationResponse } = req.body
        if (!username || !authenticationResponse) {
            return res.status(400).json({ error: 'Username and authenticationResponse are required' })
        }

        const user = await User.findOne({ username })
        if (!user || !user.currentChallenge || !user.credentialPublicKey) {
            return res.status(400).json({ error: 'Authentication challenge or public key not found' })
        }

        const { origin, rpID } = _getWebAuthnConfig(req)

        const verification = await verifyAuthenticationResponse({
            response: authenticationResponse,
            expectedChallenge: user.currentChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator: {
                credentialID: Buffer.from(user.credentialID, 'base64url'),
                credentialPublicKey: user.credentialPublicKey,
                counter: user.counter,
            },
        })

        if (!verification.verified) {
            return res.status(400).json({ error: 'Biometric verification failed' })
        }

        user.counter = verification.authenticationInfo.newCounter
        user.currentChallenge = null
        await user.save()

        const token = jwt.sign(
            { userId: user._id, username: user.username },
            keys.jwtSecret,
            { expiresIn: '8h' }
        )

        res.json({ verified: true, token, username: user.username })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}