const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    credentialID: { type: String, default: null },
    credentialPublicKey: { type: Buffer, default: null },
    counter: { type: Number, default: 0 },
    currentChallenge: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model('User', UserSchema)