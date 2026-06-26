/**
 * Centralized Configuration keys
 */
module.exports = {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-prod'
}
