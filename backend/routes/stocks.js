const express = require('express');
const router = express.Router();
const Stock = require('../models/Stock');
const yahooFinance = require('yfinance');
 
// Get all watchlist stocks
router.get('/watchlist', async (req, res) => {
    try {
        const stocks = await Stock.find({ isWatched: true });
        const stocksWithPrice = await Promise.all(stocks.map(async (stock) => {
            const quote = await yahooFinance.quote(stock.symbol);
            return {
                ...stock._doc,
                currentPrice: quote.regularMarketPrice,
                priceChange: quote.regularMarketChangePercent
            };
        }));
        res.json(stocksWithPrice);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Add stock to watchlist
router.post('/watchlist', async (req, res) => {
    const stock = new Stock({
        symbol: req.body.symbol,
        name: req.body.name
    });

    try {
        const newStock = await stock.save();
        res.status(201).json(newStock);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Remove stock from watchlist
router.delete('/watchlist/:symbol', async (req, res) => {
    try {
        await Stock.findOneAndDelete({ symbol: req.params.symbol });
        res.json({ message: 'Stock removed from watchlist' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
