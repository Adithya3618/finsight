import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import axios from 'axios';

// Types matching backend historical endpoint
interface QuotePoint {
  date: string; // ISO
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

interface IndicatorPoint { time: string; value: number; }

interface HistoricalResponse {
  symbol: string;
  range: string;
  quotes: QuotePoint[];
  indicators: {
    sma50: IndicatorPoint[];
    sma200: IndicatorPoint[];
    ema50: IndicatorPoint[];
    ema200: IndicatorPoint[];
  };
  events: {
    dividends: { time: string; amount: number }[];
    splits: { time: string; ratio: string | null }[];
    earnings: { time: string; type: string; text: string }[];
  };
  news: { title: string; url: string | null; providerPublishTime: number | null }[];
  ai: { markers: { time: string; direction: 'uptrend' | 'downtrend'; changePct: number; reason: string }[]; summary: Record<string, string> };
}

interface ChartSectionProps {
  symbol: string;
}

const ranges = [
  { key: '1d', label: '1 Day' },
  { key: '5d', label: '1 Week' },
  { key: '1mo', label: '1 Month' },
  { key: '6mo', label: '6 Months' },
  { key: '1y', label: '1 Year' },
  { key: '5y', label: '5 Years' },
  { key: 'max', label: 'Max' },
];

const keyOf = (iso: string) => (iso || '').split('T')[0];

// Simple path builder
function buildPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

const ChartSection: React.FC<ChartSectionProps> = ({ symbol }) => {
  const [range, setRange] = useState<string>('1y');
  const [data, setData] = useState<HistoricalResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedInfo, setSelectedInfo] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState<string[]>([]);
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(800);
  const height = 420;

  useEffect(() => {
    const handle = () => {
      const w = containerRef.current?.clientWidth || 800;
      setWidth(w);
    };
    handle();
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      setFetchError(null);
      const bases = [API_URL, 'http://localhost:3001'];
      const tried: string[] = [];
      let success = false;
      for (const base of bases) {
        // Try path param style
        const url1 = `${base}/api/historical/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`;
        tried.push(url1);
        try {
          const resp1 = await axios.get<HistoricalResponse>(url1);
          console.log('Chart fetch', { url: url1, status: resp1.status, data: resp1.data });
          setData(resp1.data);
          setSelectedInfo(null);
          if (!resp1.data || !Array.isArray(resp1.data.quotes) || resp1.data.quotes.length === 0) {
            setFetchError(`No quotes returned for symbol=${resp1.data?.symbol || symbol}, range=${range}`);
          }
          success = true;
          break;
        } catch (e1: any) {
          if (e1?.response?.status && e1.response.status !== 404) {
            console.warn('Chart fetch error (path style) on', url1, e1);
            setFetchError(e1?.message || 'Failed to load chart');
            continue; // try next base
          }
          // Try query style on same base
          const url2 = `${base}/api/historical?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
          tried.push(url2);
          try {
            const resp2 = await axios.get<HistoricalResponse>(url2);
            console.log('Chart fetch', { url: url2, status: resp2.status, data: resp2.data });
            setData(resp2.data);
            setSelectedInfo(null);
            if (!resp2.data || !Array.isArray(resp2.data.quotes) || resp2.data.quotes.length === 0) {
              setFetchError(`No quotes returned for symbol=${resp2.data?.symbol || symbol}, range=${range}`);
            }
            success = true;
            break;
          } catch (e2: any) {
            console.warn('Chart fetch error (query style) on', url2, e2);
            setFetchError(e2?.message || 'Failed to load chart');
            continue; // next base
          }
        }
      }
      setAttempted(tried);
      if (!success && tried.length) {
        console.error('All chart fetch attempts failed', tried);
      }
    } catch (e: any) {
      console.error('Chart fetch error', e);
      setFetchError(e?.message || 'Failed to load chart');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!symbol) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, range]);

  const processed = useMemo(() => {
    if (!data || !data.quotes || data.quotes.length === 0) return null;

    const quotes = data.quotes;
    const dates = quotes.map(q => keyOf(q.date));

    // Build indicator maps
    const mapOf = (arr?: IndicatorPoint[]) => {
      const m = new Map<string, number>();
      (arr || []).forEach(p => m.set(keyOf(p.time), p.value));
      return m;
    };
    const sma50 = mapOf(data.indicators?.sma50);
    const sma200 = mapOf(data.indicators?.sma200);
    const ema50 = mapOf(data.indicators?.ema50);
    const ema200 = mapOf(data.indicators?.ema200);

    // Build info per date
    const infoMap = new Map<string, string[]>();
    const addInfo = (iso: string, msg: string) => {
      const k = keyOf(iso);
      const arr = infoMap.get(k) || [];
      arr.push(msg);
      infoMap.set(k, arr);
    };
    (data.events?.earnings || []).forEach(e => addInfo(e.time, e.text || 'Earnings'));
    (data.events?.dividends || []).forEach(d => addInfo(d.time, `Dividend: ${d.amount}`));
    (data.events?.splits || []).forEach(s => addInfo(s.time, `Split: ${s.ratio ?? ''}`));
    (data.ai?.markers || []).forEach(m => addInfo(m.time, `${m.direction === 'uptrend' ? 'Up' : 'Down'} ${m.changePct.toFixed(1)}%: ${m.reason}`));

    // Layout
    const margin = { top: 10, right: 40, bottom: 30, left: 50 };
    const volH = 90; // volume area height
    const priceH = height - margin.top - margin.bottom - volH;
    const priceTop = margin.top;
    const volTop = margin.top + priceH + 10;
    const W = Math.max(320, width);
    const left = margin.left;
    const right = W - margin.right;

    const n = quotes.length;
    const x = (i: number) => left + (i / Math.max(1, n - 1)) * (right - left);

    const priceVals: number[] = [];
    quotes.forEach(q => priceVals.push(q.close));
    const addIndicatorVals = (m: Map<string, number>) => {
      m.forEach((v) => {
        if (typeof v === 'number') priceVals.push(v);
      });
    };
    addIndicatorVals(sma50);
    addIndicatorVals(sma200);
    addIndicatorVals(ema50);
    addIndicatorVals(ema200);

    const minP = Math.min(...priceVals);
    const maxP = Math.max(...priceVals);
    const y = (p: number) => {
      if (maxP === minP) return priceTop + priceH / 2;
      return priceTop + (1 - (p - minP) / (maxP - minP)) * priceH;
    };

    const vols = quotes.map(q => q.volume || 0);
    const maxV = Math.max(1, ...vols);
    const yv = (v: number) => volTop + (1 - v / maxV) * (volH - 10);

    // Build series
    const pricePts = quotes.map((q, i) => ({ x: x(i), y: y(q.close) }));

    const lineOf = (m: Map<string, number>) =>
      dates.map((d, i) => {
        const v = m.get(d);
        return v != null ? { x: x(i), y: y(v) } : null;
      }).filter(Boolean) as { x: number; y: number }[];

    const sma50Pts = lineOf(sma50);
    const sma200Pts = lineOf(sma200);
    const ema50Pts = lineOf(ema50);
    const ema200Pts = lineOf(ema200);

    const bars = quotes.map((q, i) => {
      const barWidth = Math.max(1, (right - left) / Math.max(20, n) * 0.8);
      const cx = x(i);
      const bw = barWidth;
      const h0 = yv(0);
      const h1 = yv(q.volume || 0);
      const up = i > 0 ? q.close >= quotes[i - 1].close : true;
      return { x: cx - bw / 2, y: Math.min(h0, h1), w: bw, h: Math.abs(h0 - h1), color: up ? '#16a34a' : '#dc2626' };
    });

    // Marker dots at price series where info exists
    const markers = quotes.map((q, i) => {
      const k = dates[i];
      const info = infoMap.get(k);
      if (!info) return null;
      return { x: x(i), y: y(q.close), info: info.join(' | '), color: '#60a5fa' };
    }).filter(Boolean) as { x: number; y: number; info: string; color: string }[];

    // Build a few x-axis ticks
    const tickIdxs = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1]
      .filter((v, idx, arr) => v >= 0 && v < n && arr.indexOf(v) === idx);
    const xTicks = tickIdxs.map(i => ({ x: x(i), label: dates[i] }));

    // Price axis ticks
    const pTicksVals = [minP, (minP + maxP) / 2, maxP];
    const pTicks = pTicksVals.map(v => ({ y: y(v), label: v.toFixed(2) }));

    return {
      layout: { left, right, priceTop, priceH, volTop, volH, W },
      pricePts,
      sma50Pts,
      sma200Pts,
      ema50Pts,
      ema200Pts,
      bars,
      markers,
      xTicks,
      pTicks,
    };
  }, [data, width]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Price & Trend Analysis (with AI Insights)</Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
        {ranges.map(r => (
          <Button key={r.key} size="small" variant={range === r.key ? 'contained' : 'outlined'} onClick={() => setRange(r.key)}>{r.label}</Button>
        ))}
      </Stack>

      <Box ref={containerRef} sx={{ width: '100%', height, border: '1px solid #2A2A2A', borderRadius: 1, mb: 1, position: 'relative' }}>
        {processed ? (
          <svg width={processed.layout.W} height={height} style={{ display: 'block' }}>
            {/* Grid and axes */}
            <rect x={0} y={0} width={processed.layout.W} height={height} fill="#1e1e1e" />
            {/* Price area border */}
            <rect x={processed.layout.left} y={processed.layout.priceTop} width={processed.layout.right - processed.layout.left} height={processed.layout.priceH} fill="none" stroke="#2A2A2A" />
            {/* Volume area border */}
            <rect x={processed.layout.left} y={processed.layout.volTop} width={processed.layout.right - processed.layout.left} height={processed.layout.volH - 10} fill="none" stroke="#2A2A2A" />

            {/* X ticks */}
            {processed.xTicks.map((t, i) => (
              <g key={`xt-${i}`}>
                <line x1={t.x} y1={processed.layout.volTop + processed.layout.volH - 10} x2={t.x} y2={processed.layout.priceTop} stroke="#2A2A2A" strokeDasharray="2 4" />
                <text x={t.x} y={height - 8} fill="#9ca3af" fontSize={10} textAnchor="middle">{t.label}</text>
              </g>
            ))}

            {/* Price ticks */}
            {processed.pTicks.map((t, i) => (
              <g key={`pt-${i}`}>
                <line x1={processed.layout.left} y1={t.y} x2={processed.layout.right} y2={t.y} stroke="#2A2A2A" strokeDasharray="2 4" />
                <text x={8} y={t.y + 3} fill="#9ca3af" fontSize={10}>{t.label}</text>
              </g>
            ))}

            {/* Volume bars */}
            {processed.bars.map((b, i) => (
              <rect key={`vb-${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} opacity={0.8} />
            ))}

            {/* Overlays */}
            <path d={buildPath(processed.sma50Pts)} stroke="#f59e0b" strokeWidth={1} fill="none" />
            <path d={buildPath(processed.sma200Pts)} stroke="#eab308" strokeWidth={1} fill="none" />
            <path d={buildPath(processed.ema50Pts)} stroke="#a78bfa" strokeWidth={1} fill="none" />
            <path d={buildPath(processed.ema200Pts)} stroke="#8b5cf6" strokeWidth={1} fill="none" />

            {/* Price line */}
            <path d={buildPath(processed.pricePts)} stroke="#90caf9" strokeWidth={2} fill="none" />

            {/* Markers */}
            {processed.markers.map((m, i) => (
              <g key={`mk-${i}`} onClick={() => setSelectedInfo(m.info)} style={{ cursor: 'pointer' }}>
                <circle cx={m.x} cy={m.y} r={4} fill={m.color} stroke="#ffffff" strokeWidth={1} />
              </g>
            ))}
          </svg>
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2">{loading ? 'Loading chart...' : 'No data'}</Typography>
            {fetchError && (
              <Typography variant="caption" color="error" display="block">{fetchError}</Typography>
            )}
            {attempted.length > 0 && (
              <Typography variant="caption" color="textSecondary" display="block">Tried: {attempted.join(' , ')}</Typography>
            )}
          </Box>
        )}
      </Box>

      {/* Click insight */}
      {selectedInfo && (
        <Box sx={{ mt: 1, p: 1, border: '1px dashed #444', borderRadius: 1 }}>
          <Typography variant="body2">Reason: {selectedInfo}</Typography>
        </Box>
      )}

      {/* AI summary chips */}
      {data && (
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' as any }}>
          {data.ai.summary['1y'] && <Chip label={data.ai.summary['1y']} color="primary" variant="outlined" />}
          {data.ai.summary['1w'] && <Chip label={data.ai.summary['1w']} color="secondary" variant="outlined" />}
        </Stack>
      )}
    </Box>
  );
};

export default ChartSection;
