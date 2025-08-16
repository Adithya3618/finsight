import React, { useState, useEffect } from 'react';
import { 
    Container, 
    Paper, 
    Table, 
    TableBody, 
    TableCell, 
    TableContainer, 
    TableHead, 
    TableRow, 
    Typography 
} from '@mui/material';
import axios from 'axios';
import SearchBar from './SearchBar';

interface Stock {
    symbol: string;
    name: string;
    price?: number;
    change?: number;
}

const StockDashboard: React.FC = () => {
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [filteredStocks, setFilteredStocks] = useState<Stock[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStocks = async () => {
            try {
                const response = await axios.get('http://localhost:3000/api/stocks');
                setStocks(response.data.stocks);
                setFilteredStocks(response.data.stocks);
                setLoading(false);
            } catch (err) {
                setError('Failed to fetch stocks data');
                setLoading(false);
            }
        };

        fetchStocks();
        const interval = setInterval(fetchStocks, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleSearch = (query: string) => {
        const searchTerm = query.toLowerCase();
        const filtered = stocks.filter(stock => 
            stock.symbol.toLowerCase().includes(searchTerm) ||
            stock.name.toLowerCase().includes(searchTerm)
        );
        setFilteredStocks(filtered);
    };

    if (loading) return <Typography>Loading...</Typography>;
    if (error) return <Typography color="error">{error}</Typography>;

    return (
        <Container maxWidth="md" sx={{ mt: 4 }}>
            <Typography variant="h4" gutterBottom>
                Stock Watchlist
            </Typography>
            <SearchBar onSearch={handleSearch} />
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Symbol</TableCell>
                            <TableCell>Company Name</TableCell>
                            <TableCell align="right">Price</TableCell>
                            <TableCell align="right">Change</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredStocks.map((stock) => (
                            <TableRow key={stock.symbol}>
                                <TableCell>{stock.symbol}</TableCell>
                                <TableCell>{stock.name}</TableCell>
                                <TableCell align="right">
                                    ${stock.price?.toFixed(2) || 'N/A'}
                                </TableCell>
                                <TableCell 
                                    align="right"
                                    sx={{ 
                                        color: (stock.change || 0) > 0 ? 'success.main' : 'error.main',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    {stock.change ? `${stock.change.toFixed(2)}%` : 'N/A'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Container>
    );
};

export default StockDashboard;