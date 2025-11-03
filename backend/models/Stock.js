const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
    symbol: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
    isWatched: { type: Boolean, default: true } 
}); 
module.exports = mongoose.model('Stock', stockSchema);
