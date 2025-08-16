import React, { useState, useEffect, useRef } from 'react';
import { 
    Container, 
    TextField, 
    Button, 
    Paper, 
    Typography,
    Box,
    CircularProgress,
    Divider,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Popper,
    ClickAwayListener
} from '@mui/material';
import axios from 'axios';

// Define interfaces
interface StockData {
    symbol: string;
    name: string;
    price: number;
    change: number;
    volume: number;
    marketCap: number;
}

interface SearchSuggestion {
    symbol: string;
    name: string;
    exchange: string;
    type: string;
}

// Add error type
interface ApiError {
    error: string;
}

interface AnalysisPrediction {
    model: string;
    lastClose: number;
    predictedPrice: number;
    predictedChangePct: number | null;
    slope: number;
    r2: number;
}

interface AnalysisResponse {
    symbol: string;
    name: string;
    price: number | null;
    fundamentals: {
        marketCap: number | null;
        trailingPE: number | null;
        forwardPE: number | null;
        epsTTM: number | null;
        dividendYield: number | null;
        beta: number | null;
        profitMargins: number | null;
    };
    sentiment: {
        score: number;
        label: string;
        sampleHeadlines: string[];
    };
    geopolitics: {
        label: string;
        signals: string[];
    };
    technicals: {
        sma20: number | null;
        sma50: number | null;
        trend: string;
    };
    prediction: (AnalysisPrediction & { range: { min: number; max: number } }) | null;
    recommendation: {
        action: 'BUY' | 'HOLD' | 'SELL';
        rationale: string;
        horizon: string;
        targetRange: { min: number; max: number };
    };
}


// Helper function to format large numbers
const formatLargeNumber = (num: number): string => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toFixed(2)}`;
};

const StockSearch: React.FC = () => {
    const [symbol, setSymbol] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [stockData, setStockData] = useState<StockData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
    const [searchLoading, setSearchLoading] = useState<boolean>(false);

    // Analysis state
    const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
    const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

        
    const textFieldRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

    // Debounced search suggestions
    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (symbol.length >= 2) {
            setSearchLoading(true);
            debounceRef.current = setTimeout(async () => {
                try {
                    const response = await axios.get(`${API_URL}/api/search/${encodeURIComponent(symbol)}`);
                    setSuggestions(response.data.suggestions || []);
                    setShowSuggestions(true);
                } catch (err) {
                    setSuggestions([]);
                } finally {
                    setSearchLoading(false);
                }
            }, 300);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
            setSearchLoading(false);
        }

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [symbol, API_URL]);

    const handleSearch = async (searchSymbol?: string) => {
        const targetSymbol = searchSymbol || symbol;
        if (!targetSymbol) return;
        
        setLoading(true);
        setError(null);
        setShowSuggestions(false);
        
        try {
            const response = await axios.get<StockData>(`${API_URL}/api/stocks/${encodeURIComponent(targetSymbol)}`);
            setStockData(response.data);
            // Load analysis and chat for the resolved symbol
            const resolved = response.data.symbol || targetSymbol;
            loadAnalysis(resolved);
        } catch (err) {
            setError('Failed to fetch stock data');
            setStockData(null);
        } finally {
            setLoading(false);
        }
    };

    const handleSuggestionClick = (suggestion: SearchSuggestion) => {
        setSymbol(suggestion.symbol);
        setShowSuggestions(false);
        handleSearch(suggestion.symbol);
    };

    const handleClickAway = () => {
        setShowSuggestions(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const loadAnalysis = async (sym: string) => {
        setAnalysis(null);
        setAnalysisError(null);
        setAnalysisLoading(true);
        try {
            const resp = await axios.get<AnalysisResponse>(`${API_URL}/api/analysis/${encodeURIComponent(sym)}`);
            setAnalysis(resp.data);
        } catch (e) {
            setAnalysisError('Failed to load analysis');
        } finally {
            setAnalysisLoading(false);
        }
    };

    
    return (
        <Container maxWidth="md">
            <Paper sx={{ p: 3, mt: 4 }}>
                <Typography variant="h5" gutterBottom>
                    Stock Search
                </Typography>
                
                <ClickAwayListener onClickAway={handleClickAway}>
                    <Box sx={{ position: 'relative', mb: 3 }}>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField
                                ref={textFieldRef}
                                fullWidth
                                label="Stock Symbol or Company Name"
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Enter stock symbol or company name (e.g. AAPL, Apple, Microsoft)"
                                InputProps={{
                                    endAdornment: searchLoading && <CircularProgress size={20} />
                                }}
                            />
                            <Button 
                                variant="contained" 
                                onClick={() => handleSearch()}
                                disabled={loading || !symbol}
                            >
                                {loading ? <CircularProgress size={24} /> : 'Search'}
                            </Button>
                        </Box>

                        <Popper
                            open={showSuggestions && suggestions.length > 0}
                            anchorEl={textFieldRef.current}
                            placement="bottom-start"
                            style={{ width: textFieldRef.current?.offsetWidth, zIndex: 1300 }}
                        >
                            <Paper elevation={3} sx={{ maxHeight: 300, overflow: 'auto' }}>
                                <List dense>
                                    {suggestions.map((suggestion, index) => (
                                        <ListItem key={`${suggestion.symbol}-${index}`} disablePadding>
                                            <ListItemButton
                                                onClick={() => handleSuggestionClick(suggestion)}
                                                sx={{
                                                    '&:hover': {
                                                        backgroundColor: 'action.hover'
                                                    }
                                                }}
                                            >
                                                <ListItemText
                                                primary={
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Typography variant="body1" fontWeight="bold">
                                                            {suggestion.symbol}
                                                        </Typography>
                                                        <Typography variant="caption" color="textSecondary">
                                                            {suggestion.exchange}
                                                        </Typography>
                                                    </Box>
                                                }
                                                secondary={
                                                    <Typography variant="body2" color="textSecondary" noWrap>
                                                        {suggestion.name}
                                                    </Typography>
                                                }
                                            />
                                            </ListItemButton>
                                        </ListItem>
                                    ))}
                                </List>
                            </Paper>
                        </Popper>
                    </Box>
                </ClickAwayListener>

                {error && (
                    <Typography color="error" sx={{ mb: 2 }}>
                        {error}
                    </Typography>
                )}

                {stockData && (
                    <Box>
                        <Typography variant="h4" gutterBottom>{stockData.name}</Typography>
                        <Typography variant="h6" gutterBottom>{stockData.symbol}</Typography>
                        
                        {/* First row of metrics */}
                        <Box sx={{ 
                            display: 'flex', 
                            flexWrap: 'wrap', 
                            gap: 3, 
                            mt: 2,
                            '& > *': { 
                                flex: '1 1 200px',
                                minWidth: '150px'
                            }
                        }}>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Price</Typography>
                                <Typography variant="h6">${stockData.price.toFixed(2)}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Change</Typography>
                                <Typography 
                                    variant="h6"
                                    sx={{ color: stockData.change >= 0 ? 'success.main' : 'error.main' }}
                                >
                                    {stockData.change.toFixed(2)}%
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Volume</Typography>
                                <Typography variant="h6">
                                    {stockData.volume.toLocaleString()}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Market Cap</Typography>
                                <Typography variant="h6">
                                    {formatLargeNumber(stockData.marketCap)}
                                </Typography>
                            </Box>
                        </Box>

                        <Divider sx={{ my: 3 }} />

                        {/* Second row of metrics */}
                        <Box sx={{ 
                            display: 'flex', 
                            flexWrap: 'wrap', 
                            gap: 3,
                            '& > *': { 
                                flex: '1 1 200px',
                                minWidth: '150px'
                            }
                        }}>
                            {/* Additional metrics can be added here if needed */}
                        </Box>
                    </Box>
                )}

                {/* Analysis Section */}
                <Divider sx={{ my: 3 }} />
                <Typography variant="h5" gutterBottom>Analysis</Typography>
                {analysisLoading && <Typography>Analyzing...</Typography>}
                {analysisError && <Typography color="error">{analysisError}</Typography>}
                {analysis && (
                    <Box>
                        {/* Fundamentals */}
                        <Typography variant="h6" sx={{ mt: 1 }}>Fundamentals</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Market Cap</Typography>
                                <Typography>{analysis.fundamentals.marketCap ? formatLargeNumber(analysis.fundamentals.marketCap) : 'N/A'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Trailing P/E</Typography>
                                <Typography>{analysis.fundamentals.trailingPE ?? 'N/A'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Forward P/E</Typography>
                                <Typography>{analysis.fundamentals.forwardPE ?? 'N/A'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">EPS (TTM)</Typography>
                                <Typography>{analysis.fundamentals.epsTTM ?? 'N/A'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Dividend Yield</Typography>
                                <Typography>{analysis.fundamentals.dividendYield != null ? (analysis.fundamentals.dividendYield * 100).toFixed(2) + '%' : 'N/A'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Beta</Typography>
                                <Typography>{analysis.fundamentals.beta ?? 'N/A'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Profit Margins</Typography>
                                <Typography>{analysis.fundamentals.profitMargins != null ? (analysis.fundamentals.profitMargins * 100).toFixed(2) + '%' : 'N/A'}</Typography>
                            </Box>
                        </Box>

                        {/* Sentiment */}
                        <Typography variant="h6" sx={{ mt: 3 }}>Investor Sentiment</Typography>
                        <Typography sx={{ color: analysis.sentiment.label === 'Positive' ? 'success.main' : analysis.sentiment.label === 'Negative' ? 'error.main' : 'text.primary' }}>
                            {analysis.sentiment.label} ({analysis.sentiment.score}%)
                        </Typography>
                        <List dense>
                            {analysis.sentiment.sampleHeadlines.map((h, i) => (
                                <ListItem key={`hl-${i}`}>
                                    <ListItemText primary={h} />
                                </ListItem>
                            ))}
                        </List>

                        {/* Geopolitics */}
                        <Typography variant="h6" sx={{ mt: 3 }}>Geopolitics & Macro</Typography>
                        <Typography>{analysis.geopolitics.label}</Typography>
                        {analysis.geopolitics.signals.length > 0 && (
                            <Typography variant="body2" color="textSecondary">Signals: {analysis.geopolitics.signals.join(', ')}</Typography>
                        )}

                        {/* Technicals */}
                        <Typography variant="h6" sx={{ mt: 3 }}>Technicals</Typography>
                        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">SMA 20</Typography>
                                <Typography>{analysis.technicals.sma20 ? analysis.technicals.sma20.toFixed(2) : 'N/A'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">SMA 50</Typography>
                                <Typography>{analysis.technicals.sma50 ? analysis.technicals.sma50.toFixed(2) : 'N/A'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" color="textSecondary">Trend</Typography>
                                <Typography sx={{ textTransform: 'capitalize' }}>{analysis.technicals.trend}</Typography>
                            </Box>
                        </Box>

                        {/* Prediction */}
                        {analysis.prediction && (
                            <Box sx={{ mt: 3 }}>
                                <Typography variant="h6">Prediction (next day)</Typography>
                                <Typography>Predicted Price: ${analysis.prediction.predictedPrice.toFixed(2)}</Typography>
                                <Typography sx={{ color: (analysis.prediction.predictedChangePct ?? 0) >= 0 ? 'success.main' : 'error.main' }}>
                                    Change: {analysis.prediction.predictedChangePct?.toFixed(2)}%
                                </Typography>
                                <Typography>Range: ${analysis.prediction.range.min.toFixed(2)} - ${analysis.prediction.range.max.toFixed(2)}</Typography>
                                <Typography variant="caption" color="textSecondary">Model: {analysis.prediction.model}, R²: {analysis.prediction.r2.toFixed(3)}</Typography>
                            </Box>
                        )}

                        {/* Recommendation */}
                        <Box sx={{ mt: 3 }}>
                            <Typography variant="h6">Recommendation</Typography>
                            <Typography sx={{ color: analysis.recommendation.action === 'BUY' ? 'success.main' : analysis.recommendation.action === 'SELL' ? 'error.main' : 'warning.main' }}>
                                {analysis.recommendation.action}
                            </Typography>
                            <Typography>{analysis.recommendation.rationale}</Typography>
                            <Typography variant="body2" color="textSecondary">Horizon: {analysis.recommendation.horizon}</Typography>
                            <Typography>Target Range: ${analysis.recommendation.targetRange.min.toFixed(2)} - ${analysis.recommendation.targetRange.max.toFixed(2)}</Typography>
                        </Box>
                    </Box>
                )}

                            </Paper>
        </Container>
    );
};

export default StockSearch;