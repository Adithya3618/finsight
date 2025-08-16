import React from 'react';
import { TextField, Box } from '@mui/material';

interface SearchBarProps {
    onSearch: (query: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
    return (
        <Box sx={{ mb: 3, width: '100%' }}>
            <TextField
                fullWidth
                variant="outlined"
                label="Search stocks"
                placeholder="Enter stock symbol or company name..."
                onChange={(e) => onSearch(e.target.value)}
                sx={{
                    backgroundColor: 'background.paper',
                    '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                            borderColor: 'primary.main',
                        },
                        '&:hover fieldset': {
                            borderColor: 'primary.light',
                        },
                    },
                }}
            />
        </Box>
    );
};

export default SearchBar;