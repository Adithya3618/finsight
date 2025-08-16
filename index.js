const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
    res.json({ 
        message: 'Stock API Server is running!',
        timestamp: new Date().toISOString()
    });
});

// Example stocks route
app.get('/api/stocks', (req, res) => {
    res.json({
        message: 'Stocks endpoint',
        stocks: [
            { symbol: 'AAPL', name: 'Apple Inc.' },
            { symbol: 'GOOGL', name: 'Alphabet Inc.' },
            { symbol: 'TSLA', name: 'Tesla Inc.' }
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Stock server running on http://localhost:${PORT}`);
    console.log(`📊 API endpoints:`);
    console.log(`   - GET http://localhost:${PORT}/`);
    console.log(`   - GET http://localhost:${PORT}/api/stocks`);
});