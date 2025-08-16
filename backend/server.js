const express = require('express');
const cors = require('cors');
const yahooFinance = require('yahoo-finance2').default;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Search suggestions endpoint
app.get('/api/search/:query', async (req, res) => {
    try {
        const query = (req.params.query || '').trim();
        if (!query || query.length < 2) {
            return res.json({ suggestions: [] });
        }

        const results = await yahooFinance.search(query);
        const candidates = Array.isArray(results?.quotes) ? results.quotes : [];
        
        const suggestions = candidates
            .filter(c => c.symbol && ['EQUITY', 'ETF', 'MUTUALFUND'].includes(c.quoteType))
            .slice(0, 8)
            .map(c => ({
                symbol: c.symbol,
                name: c.longname || c.shortname || c.symbol,
                exchange: c.exchange || '',
                type: c.quoteType || 'EQUITY'
            }));

        res.json({ suggestions });
    } catch (error) {
        console.error('Error fetching search suggestions:', error);
        res.json({ suggestions: [] });
    }
});

app.get('/api/stocks/:symbol', async (req, res) => {
    try {
        const queryRaw = (req.params.symbol || '').trim();
        const query = queryRaw.toUpperCase();

        let q;
        let resolvedSymbol = null;

        // Try direct quote first (valid Yahoo symbol)
        try {
            q = await yahooFinance.quote(query);
            resolvedSymbol = q?.symbol || query;
        } catch (e) {
            // ignore and fallback to search
        }

        // If direct quote failed or lacks price, resolve symbol via search (handles names, alt exchanges)
        if (!q || q.regularMarketPrice == null) {
            try {
                const results = await yahooFinance.search(queryRaw);
                const candidates = Array.isArray(results?.quotes) ? results.quotes : [];
                const qLower = queryRaw.toLowerCase();

                // scoring function to pick best equity-like candidate
                const score = (c) => {
                    let s = 0;
                    const sn = (c.shortname || '').toLowerCase();
                    const ln = (c.longname || c.longName || '').toLowerCase();
                    const sym = (c.symbol || '').toUpperCase();

                    if (sym === query) s += 100;
                    if (sn === qLower || ln === qLower) s += 90;
                    if (sn.includes(qLower) || ln.includes(qLower)) s += 60;
                    if (c.quoteType === 'EQUITY' || c.typeDisp === 'Equity') s += 20;
                    return s;
                };

                const best = candidates
                    .filter(c => c.symbol)
                    .sort((a, b) => score(b) - score(a))[0];

                if (best?.symbol) {
                    resolvedSymbol = best.symbol;
                    q = await yahooFinance.quote(best.symbol);
                }
            } catch (e) {
                // ignore; we'll handle not found below
            }
        }

        // As a last resort, try quoteSummary if quote price is missing
        if (q && (q.regularMarketPrice == null)) {
            try {
                const qs = await yahooFinance.quoteSummary(resolvedSymbol || query, { modules: ['price'] });
                if (qs?.price?.regularMarketPrice != null) {
                    q.regularMarketPrice = qs.price.regularMarketPrice;
                    q.regularMarketChangePercent = qs.price.regularMarketChangePercent ?? q.regularMarketChangePercent;
                    q.regularMarketVolume = qs.price.regularMarketVolume ?? q.regularMarketVolume;
                    q.marketCap = qs.price.marketCap ?? q.marketCap;
                    q.longName = q.longName || qs.price.longName;
                    q.shortName = q.shortName || qs.price.shortName;
                }
            } catch (e) {
                // ignore
            }
        }

        if (!q || q.regularMarketPrice == null) {
            return res.status(404).json({ error: 'Stock not found' });
        }

        const stockData = {
            symbol: q.symbol || resolvedSymbol || query,
            name: q.longName || q.shortName || q.symbol || resolvedSymbol || query,
            price: q.regularMarketPrice,
            change: q.regularMarketChangePercent,
            volume: q.regularMarketVolume,
            marketCap: q.marketCap
        };

        res.json(stockData);
    } catch (error) {
        console.error('Error fetching stock data:', error);
        res.status(500).json({ error: 'Failed to fetch stock data' });
    }
});


// Helper: simple linear regression prediction from daily closes
function predictNextDay(closeSeries) {
    const data = closeSeries.filter(v => typeof v === 'number' && !Number.isNaN(v));
    const n = data.length;
    if (n < 10) {
        return null; // not enough data
    }
    const xs = Array.from({ length: n }, (_, i) => i);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = data.reduce((a, b) => a + b, 0);
    const sumXY = data.reduce((acc, y, i) => acc + xs[i] * y, 0);
    const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return null;

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const meanY = sumY / n;
    const ssTot = data.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0);
    const ssRes = data.reduce((acc, y, i) => acc + Math.pow(y - (slope * xs[i] + intercept), 2), 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    const lastClose = data[n - 1];
    const nextX = n; // next day index
    const predictedPrice = slope * nextX + intercept;
    const predictedChangePct = lastClose ? ((predictedPrice - lastClose) / lastClose) * 100 : null;

    return {
        model: 'linear_regression_90d',
        lastClose,
        predictedPrice,
        predictedChangePct,
        slope,
        r2
    };
}

function computeSMA(series, window) {
    if (!Array.isArray(series) || series.length < window) return null;
    const slice = series.slice(-window);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / window;
}

function computeVolatility(series, window = 20) {
    if (!Array.isArray(series) || series.length < window + 1) return null;
    const slice = series.slice(-window - 1);
    const rets = [];
    for (let i = 1; i < slice.length; i++) {
        const prev = slice[i - 1];
        const cur = slice[i];
        if (prev && cur) {
            rets.push((cur - prev) / prev);
        }
    }
    if (rets.length === 0) return null;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / rets.length;
    return Math.sqrt(variance); // daily std dev
}

// Analysis endpoint: fundamentals, sentiment, macro signals, technicals, prediction, and recommendation
app.get('/api/analysis/:symbol', async (req, res) => {
    try {
        const raw = (req.params.symbol || '').trim();
        if (!raw) return res.status(400).json({ error: 'Missing symbol' });

        // Resolve to a valid yahoo symbol via search if needed
        let resolved = raw.toUpperCase();
        let quote;
        try {
            quote = await yahooFinance.quote(resolved);
            resolved = quote?.symbol || resolved;
        } catch (e) {
            try {
                const s = await yahooFinance.search(raw);
                const best = Array.isArray(s?.quotes) ? s.quotes.find(c => c.symbol) : null;
                if (best?.symbol) {
                    resolved = best.symbol;
                    quote = await yahooFinance.quote(resolved);
                }
            } catch {}
        }

        // Fetch fundamentals & stats
        const modules = [
            'price',
            'summaryDetail',
            'financialData',
            'defaultKeyStatistics',
            'recommendationTrend'
        ];
        const summary = await yahooFinance.quoteSummary(resolved, { modules });

        // Historical data for technicals and prediction
        const period1 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
        const hist = await yahooFinance.historical(resolved, { period1, interval: '1d' });
        const closes = Array.isArray(hist) ? hist.map(h => h.close).filter(v => v != null) : [];
        const lastClose = closes.length ? closes[closes.length - 1] : (quote?.regularMarketPrice ?? null);

        const sma20 = computeSMA(closes, 20);
        const sma50 = computeSMA(closes, 50);
        const vol = computeVolatility(closes, 20);
        const pred = predictNextDay(closes);

        // Sentiment from Yahoo finance insights/news
        let news = [];
        try {
            const insights = await yahooFinance.insights(resolved);
            news = Array.isArray(insights?.news) ? insights.news : [];
        } catch {}

        // Fallback to search-based news if insights lacks news
        if (news.length === 0) {
            try {
                const s = await yahooFinance.search(resolved);
                news = Array.isArray(s?.news) ? s.news : [];
            } catch {}
        }

        const sentimentLex = {
            positive: ['beat', 'beats', 'growth', 'surge', 'up', 'upgrade', 'outperform', 'record', 'profit', 'bull', 'win', 'rally'],
            negative: ['miss', 'falls', 'down', 'downgrade', 'lawsuit', 'probe', 'fraud', 'war', 'sanction', 'ban', 'risk', 'slump', 'bear', 'loss']
        };
        let pos = 0, neg = 0;
        const headlines = [];
        for (const n of news.slice(0, 15)) {
            const t = (n.title || '').toLowerCase();
            if (!t) continue;
            headlines.push(n.title);
            for (const w of sentimentLex.positive) { if (t.includes(w)) pos++; }
            for (const w of sentimentLex.negative) { if (t.includes(w)) neg++; }
        }
        const total = Math.max(1, pos + neg);
        const score = Math.round((pos / total) * 100);
        const sentimentLabel = score > 60 ? 'Positive' : score < 40 ? 'Negative' : 'Neutral';

        // Macro/geopolitical signal detection (keyword-based)
        const macroKeywords = ['war', 'election', 'tariff', 'sanction', 'inflation', 'rate hike', 'fed', 'ecb', 'oil', 'middle east', 'china', 'us'];
        const macroSignals = [];
        for (const h of headlines) {
            const tl = h.toLowerCase();
            for (const k of macroKeywords) {
                if (tl.includes(k)) { macroSignals.push(k); }
            }
        }
        const macroLabel = macroSignals.length >= 3 ? 'High impact' : macroSignals.length === 0 ? 'Neutral' : 'Some impact';

        // Technical trend and recommendation
        let trend = 'neutral';
        if (sma20 && sma50) {
            if (lastClose > sma20 && sma20 > sma50) trend = 'bullish';
            else if (lastClose < sma20 && sma20 < sma50) trend = 'bearish';
        }

        const basePrice = (pred?.predictedPrice ?? lastClose ?? quote?.regularMarketPrice ?? 0);
        const k = 1.0;
        const rangeMin = vol != null ? basePrice * (1 - k * vol) : basePrice * 0.97;
        const rangeMax = vol != null ? basePrice * (1 + k * vol) : basePrice * 1.03;

        let action = 'HOLD';
        let rationale = 'Mixed signals.';
        if ((trend === 'bullish' && score >= 50) || (pred?.predictedChangePct ?? 0) > 0) {
            action = 'BUY';
            rationale = 'Bullish technicals/sentiment with upward bias.';
        }
        if ((trend === 'bearish' && score <= 50) || (pred?.predictedChangePct ?? 0) < 0) {
            action = action === 'BUY' ? 'HOLD' : 'SELL';
            if (action === 'SELL') rationale = 'Bearish technicals/sentiment with downward bias.';
        }

        const horizon = action === 'BUY' && trend === 'bullish' ? 'short-term (1-2 weeks)' : action === 'SELL' ? 'short-term (days to weeks)' : 'long-term (1-3 months)';

        const fundamentals = {
            marketCap: summary?.summaryDetail?.marketCap ?? summary?.price?.marketCap ?? quote?.marketCap ?? null,
            trailingPE: summary?.summaryDetail?.trailingPE ?? summary?.defaultKeyStatistics?.trailingPE ?? null,
            forwardPE: summary?.summaryDetail?.forwardPE ?? summary?.defaultKeyStatistics?.forwardPE ?? null,
            epsTTM: summary?.defaultKeyStatistics?.trailingEps ?? summary?.financialData?.earningsPerShare ?? null,
            dividendYield: summary?.summaryDetail?.dividendYield ?? null,
            beta: summary?.defaultKeyStatistics?.beta ?? null,
            profitMargins: summary?.financialData?.profitMargins ?? null
        };

        const response = {
            symbol: resolved,
            name: summary?.price?.longName || summary?.price?.shortName || quote?.shortName || resolved,
            price: lastClose ?? quote?.regularMarketPrice ?? null,
            fundamentals,
            sentiment: {
                score,
                label: sentimentLabel,
                sampleHeadlines: headlines.slice(0, 5)
            },
            geopolitics: {
                label: macroLabel,
                signals: Array.from(new Set(macroSignals)).slice(0, 10)
            },
            technicals: {
                sma20,
                sma50,
                trend
            },
            prediction: pred ? {
                model: pred.model,
                lastClose: pred.lastClose,
                predictedPrice: pred.predictedPrice,
                predictedChangePct: pred.predictedChangePct,
                r2: pred.r2,
                range: { min: rangeMin, max: rangeMax }
            } : null,
            recommendation: {
                action,
                rationale,
                horizon,
                targetRange: { min: rangeMin, max: rangeMax }
            }
        };

        res.json(response);
    } catch (error) {
        console.error('Error in /api/analysis:', error);
        res.status(500).json({ error: 'Failed to analyze stock' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});