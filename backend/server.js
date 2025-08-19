const express = require('express');
const cors = require('cors');
const yahooFinance = require('yahoo-finance2').default;
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
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

// Helper: simple https GET returning parsed JSON (no extra deps)
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (resp) => {
                let data = '';
                resp.on('data', (chunk) => (data += chunk));
                resp.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json);
                    } catch (e) {
                        reject(e);
                    }
                });
            })
            .on('error', (err) => reject(err));
    });
}

// Indian stocks via Moneycontrol (Python integration)
app.get('/api/in/stocks/:query', async (req, res) => {
    try {
        const raw = (req.params.query || '').trim();
        if (!raw) return res.status(400).json({ error: 'Missing query' });

        const scriptPath = path.join(__dirname, 'scripts', 'indian_stock.py');
        const py = spawn(process.env.PYTHON_BIN || 'python', [scriptPath, raw], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            try { py.kill('SIGKILL'); } catch {}
        }, 15000);

        py.stdout.on('data', (d) => (stdout += d.toString()));
        py.stderr.on('data', (d) => (stderr += d.toString()));

        py.on('close', (code) => {
            clearTimeout(timer);
            try {
                const data = JSON.parse(stdout.trim());
                if (!data || data.error) {
                    return res.status(404).json({ error: data?.error || 'Stock not found' });
                }
                return res.json(data);
            } catch (e) {
                console.error('Moneycontrol parse error:', e, 'stderr:', stderr);
                return res.status(500).json({ error: 'Failed to fetch Indian stock via Moneycontrol' });
            }
        });
    } catch (error) {
        console.error('Error in /api/in/stocks:', error);
        res.status(500).json({ error: 'Failed to fetch Indian stock' });
    }
});

// Jobs data (Unemployment rate %) via World Bank API
app.get('/api/jobs/:country', async (req, res) => {
    try {
        const c = (req.params.country || '').toLowerCase();
        const iso3 = { in: 'IND', india: 'IND', us: 'USA', usa: 'USA' }[c];
        if (!iso3) return res.status(400).json({ error: 'Unsupported country. Use in or us.' });

        const indicator = 'SL.UEM.TOTL.ZS'; // Unemployment, total (% of total labor force) (modeled ILO estimate)
        const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${indicator}?format=json&per_page=70`;

        const body = await fetchJSON(url);
        const rows = Array.isArray(body) && Array.isArray(body[1]) ? body[1] : [];
        const series = rows
            .filter((d) => d && d.value != null)
            .map((d) => ({ year: Number(d.date), value: typeof d.value === 'number' ? d.value : Number(d.value) }))
            .sort((a, b) => a.year - b.year);
        const latest = series.length ? series[series.length - 1] : null;

        res.json({
            country: iso3,
            indicator: 'UNEMPLOYMENT_RATE_PERCENT',
            latest,
            series,
            source: 'World Bank SL.UEM.TOTL.ZS'
        });
    } catch (error) {
        console.error('Error in /api/jobs:', error);
        res.status(500).json({ error: 'Failed to fetch jobs data' });
    }
});




// Helper: compute EMA series
function computeEMA(series, window) {
    if (!Array.isArray(series) || series.length === 0) return [];
    const k = 2 / (window + 1);
    const ema = [];
    let prev;
    for (let i = 0; i < series.length; i++) {
        const v = series[i];
        if (typeof v !== 'number') { ema.push(null); continue; }
        if (prev == null) {
            // seed with SMA of first window if available, else first value
            const start = Math.max(0, i - window + 1);
            const slice = series.slice(start, i + 1).filter(x => typeof x === 'number');
            prev = slice.length > 0 ? slice.reduce((a,b)=>a+b,0) / slice.length : v;
        }
        const cur = v * k + prev * (1 - k);
        ema.push(cur);
        prev = cur;
    }
    return ema;
}

function computeSeriesSMA(series, window) {
    const out = new Array(series.length).fill(null);
    if (!Array.isArray(series) || series.length < window) return out;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < series.length; i++) {
        const v = series[i];
        if (typeof v === 'number') { sum += v; count++; }
        if (i >= window) {
            const old = series[i - window];
            if (typeof old === 'number') { sum -= old; count--; }
        }
        if (i >= window - 1 && count > 0) {
            out[i] = sum / count;
        }
    }
    return out;
}

function pctChange(a, b) {
    if (a == null || b == null || a === 0) return null;
    return ((b - a) / a) * 100;
}

function rangeToPeriod(range) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    // Use intervals supported by yahooFinance.historical: '1d', '1wk', '1mo'
    const map = {
        '1d': { period1: new Date(now - 7 * day), interval: '1d' },
        '5d': { period1: new Date(now - 10 * day), interval: '1d' },
        '1mo': { period1: new Date(now - 35 * day), interval: '1d' },
        '6mo': { period1: new Date(now - 182 * day), interval: '1d' },
        '1y': { period1: new Date(now - 365 * day), interval: '1d' },
        '5y': { period1: new Date(now - 5 * 365 * day), interval: '1wk' },
        'max': { period1: new Date(1990, 0, 1), interval: '1mo' }
    };
    return map[range] || map['1y'];
}

// Build AI insights for significant moves with simple heuristics
function buildAiInsights(quotes, news) {
    const markers = [];
    const closes = quotes.map(q => q.close);
    for (let i = 1; i < quotes.length; i++) {
        const p = closes[i - 1];
        const c = closes[i];
        if (typeof p !== 'number' || typeof c !== 'number') continue;
        const chg = pctChange(p, c);
        if (chg == null) continue;
        const abs = Math.abs(chg);
        const threshold = 4; // percent
        if (abs >= threshold) {
            // find nearest news within +/- 2 days
            const t = quotes[i].date;
            const tms = new Date(t).getTime();
            const win = 2 * 24 * 60 * 60 * 1000;
            const related = (news || []).filter(n => {
                const nt = (n.providerPublishTime || n.publishedAt || n.pubDate || 0) * 1000;
                if (!nt) return false;
                return Math.abs(nt - tms) <= win;
            });
            let reason = chg > 0 ? 'Positive catalyst' : 'Negative catalyst';
            const lex = {
                up: ['beat', 'upgrade', 'outperform', 'record', 'rally', 'surge', 'partnership', 'approval', 'policy'],
                down: ['miss', 'downgrade', 'probe', 'lawsuit', 'ban', 'guidance cut', 'layoff', 'weak', 'recall']
            };
            for (const n of related) {
                const t = (n.title || '').toLowerCase();
                if (chg > 0 && lex.up.some(w => t.includes(w))) { reason = n.title; break; }
                if (chg < 0 && lex.down.some(w => t.includes(w))) { reason = n.title; break; }
            }
            markers.push({ time: quotes[i].date, direction: chg > 0 ? 'uptrend' : 'downtrend', changePct: chg, reason });
        }
    }
    // Overall summaries
    const summary = {};
    const byDays = (n) => {
        const N = Math.max(2, Math.min(quotes.length, n));
        const a = quotes[quotes.length - N]?.close;
        const b = quotes[quotes.length - 1]?.close;
        const pct = pctChange(a, b);
        return pct;
    };
    const w = byDays(5);
    const y = byDays(252);
    const fmt = (pct) => pct == null ? 'N/A' : (pct >= 0 ? `rose +${pct.toFixed(1)}%` : `fell ${pct.toFixed(1)}%`);
    summary['1w'] = w == null ? 'Insufficient data.' : `Last 1 week: ${fmt(w)}.`;
    summary['1y'] = y == null ? 'Insufficient data.' : `Over the last 1 year, stock ${fmt(y)}.`;

    return { markers, summary };
}

// Historical and indicators endpoint
app.get('/api/historical/:symbol', async (req, res) => {
    try {
        const raw = (req.params.symbol || '').trim();
        if (!raw) return res.status(400).json({ error: 'Missing symbol' });
        const range = (req.query.range || '1y').toString();
        const { period1, interval } = rangeToPeriod(range);
        const period2 = new Date();

        // Resolve symbol first (to ensure valid Yahoo symbol)
        let resolved = (raw || '').trim();
        let q;
        try {
            q = await yahooFinance.quote(resolved);
            resolved = q?.symbol || resolved;
        } catch {}
        if (!q || !q.symbol) {
            try {
                const results = await yahooFinance.search(raw);
                const candidates = Array.isArray(results?.quotes) ? results.quotes : [];
                const qLower = (raw || '').toLowerCase();
                const score = (c) => {
                    let s = 0;
                    const sn = (c.shortname || '').toLowerCase();
                    const ln = (c.longname || c.longName || '').toLowerCase();
                    const sym = (c.symbol || '');
                    if (sym.toLowerCase() === qLower) s += 100;
                    if (sn === qLower || ln === qLower) s += 90;
                    if (sn.includes(qLower) || ln.includes(qLower)) s += 60;
                    if (c.quoteType === 'EQUITY' || c.typeDisp === 'Equity') s += 20;
                    return s;
                };
                const best = candidates.filter(c => c.symbol).sort((a,b) => score(b) - score(a))[0];
                if (best?.symbol) {
                    resolved = best.symbol;
                    try {
                        q = await yahooFinance.quote(resolved);
                    } catch {}
                }
            } catch {}
        }

        // Always fetch historical OHLCV using the stable API
        const hist = await yahooFinance.historical(resolved, { period1, period2, interval });
        const quotes = Array.isArray(hist) ? hist.map(h => ({
            date: (h.date instanceof Date ? h.date : new Date(h.date || Date.now())).toISOString(),
            open: h.open ?? null,
            high: h.high ?? null,
            low: h.low ?? null,
            close: h.close ?? h.adjClose ?? null,
            volume: h.volume ?? null
        })).filter(q => q.close != null) : [];

        // Try to fetch chart events (dividends/splits) separately; ignore failures
        let chart;
        try {
            chart = await yahooFinance.chart(resolved, { period1, period2, interval, events: 'div,split' });
        } catch (e) {
            chart = null;
        }

        if (!quotes.length) return res.json({ symbol: resolved, range, quotes: [], indicators: {}, events: {}, news: [], ai: { markers: [], summary: {} } });

        const closes = quotes.map(q => q.close);
        const sma50 = computeSeriesSMA(closes, 50);
        const sma200 = computeSeriesSMA(closes, 200);
        const ema50 = computeEMA(closes, 50);
        const ema200 = computeEMA(closes, 200);

        // Events: dividends & splits from chart events if available
        const dividends = [];
        const splits = [];
        try {
            const ev = chart?.events || chart?.meta?.events || {};
            const divs = ev.dividends || ev.dividend || {};
            const spls = ev.splits || ev.split || {};
            for (const k of Object.keys(divs)) {
                const d = divs[k];
                const ts = d?.date || d?.timestamp || Number(k);
                const amount = d?.amount ?? d?.dividend;
                if (ts) dividends.push({ time: new Date(ts * (ts > 1e12 ? 1 : 1000)).toISOString(), amount });
            }
            for (const k of Object.keys(spls)) {
                const s = spls[k];
                const ts = s?.date || s?.timestamp || Number(k);
                const ratio = s?.numerator && s?.denominator ? `${s.numerator}:${s.denominator}` : s?.splitRatio || null;
                if (ts) splits.push({ time: new Date(ts * (ts > 1e12 ? 1 : 1000)).toISOString(), ratio });
            }
        } catch {}

        // Earnings markers via quoteSummary/earnings module if available
        const earnings = [];
        try {
            const er = await yahooFinance.quoteSummary(resolved, { modules: ['earnings', 'calendarEvents'] });
            const hist = er?.earnings?.earningsChart?.quarterly || [];
            for (const e of hist) {
                const ts = e?.date ? new Date(e.date).toISOString() : null;
                if (ts) earnings.push({ time: ts, type: 'earnings', text: `Quarter: ${e.date}, surprise: ${e?.surprisePercent != null ? e.surprisePercent + '%' : 'N/A'}` });
            }
            const cal = er?.calendarEvents;
            const dts = [].concat(cal?.earningsDate || []).filter(Boolean);
            for (const d of dts) {
                const ts = d.raw ? new Date(d.raw * 1000).toISOString() : (d.fmt ? new Date(d.fmt).toISOString() : null);
                if (ts) earnings.push({ time: ts, type: 'earnings', text: 'Earnings' });
            }
        } catch {}

        // News
        let news = [];
        try {
            const ins = await yahooFinance.insights(resolved);
            news = Array.isArray(ins?.news) ? ins.news : [];
        } catch {}
        if (!news.length) {
            try {
                const s = await yahooFinance.search(resolved);
                news = Array.isArray(s?.news) ? s.news : [];
            } catch {}
        }

        const ai = buildAiInsights(quotes, news);

        res.json({
            symbol: resolved,
            range,
            quotes,
            indicators: {
                sma50: quotes.map((q, i) => (sma50[i] != null ? { time: q.date, value: sma50[i] } : null)).filter(Boolean),
                sma200: quotes.map((q, i) => (sma200[i] != null ? { time: q.date, value: sma200[i] } : null)).filter(Boolean),
                ema50: quotes.map((q, i) => (ema50[i] != null ? { time: q.date, value: ema50[i] } : null)).filter(Boolean),
                ema200: quotes.map((q, i) => (ema200[i] != null ? { time: q.date, value: ema200[i] } : null)).filter(Boolean)
            },
            events: { dividends, splits, earnings },
            news: (news || []).slice(0, 20).map(n => ({ title: n.title, url: n.link || n.linkUrl || n.url || null, providerPublishTime: n.providerPublishTime || n.publishedAt || n.pubDate || null })),
            ai
        });
    } catch (error) {
        console.error('Error in /api/historical:', error);
        res.status(500).json({ error: 'Failed to fetch historical data' });
    }
});

// Support /api/historical?symbol=... by redirecting to /api/historical/:symbol
app.get('/api/historical', (req, res) => {
    try {
        const symbol = (req.query.symbol || '').toString().trim();
        const range = (req.query.range || '').toString().trim();
        if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
        const q = range ? `?range=${encodeURIComponent(range)}` : '';
        return res.redirect(`/api/historical/${encodeURIComponent(symbol)}${q}`);
    } catch (e) {
        return res.status(500).json({ error: 'Failed to process request' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});