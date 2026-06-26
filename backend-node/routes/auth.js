const express = require('express')
const router = express.Router()
const authController = require('../controllers/authController')

// Phase 1: demo login (no biometrics yet)
router.post('/demo-login', authController.demoLogin)

// Phase 2: WebAuthn registration
router.get('/generate-registration-options', authController.generateRegistrationOptions)
router.post('/verify-registration', authController.verifyRegistration)

// Phase 2: WebAuthn authentication
router.get('/generate-authentication-options', authController.generateAuthenticationOptions)
router.post('/verify-authentication', authController.verifyAuthentication)

module.exports = router