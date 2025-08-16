import React from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import StockSearch from './components/StockSearch';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#90caf9',
        },
        secondary: {
            main: '#f48fb1',
        },
        background: {
            default: '#121212',
            paper: '#1e1e1e',
        },
    },
});

function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <StockSearch />
        </ThemeProvider>
    );
}

export default App;
