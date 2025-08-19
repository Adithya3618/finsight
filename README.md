# Stocks App (Backend + Frontend)

A full-stack project to search stocks by symbol or company name, get live quotes, and see autocomplete suggestions while typing.

This repo contains:
- Backend (Node/Express) using yahoo-finance2 to fetch quotes and search suggestions
- Frontend (React + MUI) with an autocomplete search UI (type partial names like "App" to see "Apple Inc. (AAPL)")
- Optional Python folder(s) used for experimentation/scraping; not required to run the app


## Features
- Search by symbol (AAPL) or company name (Apple, Microsoft, Aptiv)
- Autocomplete dropdown with top suggestions (symbol, name, exchange)
- Live quote details: price, change %, volume, market cap


## Project Structure
```
stocks/
├─ backend/            # Express server
│  ├─ server.js        # API endpoints (/api/stocks/:symbol, /api/search/:query)
│  ├─ package.json     # Backend dependencies/scripts
│  └─ .env             # Backend environment (PORT)
├─ frontend/           # React app
│  ├─ src/components/StockSearch.tsx  # Autocomplete UI
│  ├─ package.json     # Frontend dependencies/scripts
│  └─ .env             # Frontend environment (REACT_APP_API_URL)
├─ stock-scraper/ or src/ (Python)    # Optional python experiments
├─ index.js            # Optional demo server on port 3000 (static demo)
├─ package.json        # Root node config (not required to run the app)
└─ README.md
```


## Prerequisites
- Node.js LTS installed (https://nodejs.org)
- npm (comes with Node)
- Git (for sharing the project)
- Optional: Python for the .venv-related tooling; not required to run the Node/React app


## Environment Variables
Create these files (they likely already exist):

backend/.env
```
PORT=3001
NODE_ENV=development
```

frontend/.env
```
REACT_APP_API_URL=http://localhost:3001
```

Note: Only variables prefixed with REACT_APP_ are visible to the React app.


## Installation
Run these commands in separate terminals (Windows PowerShell recommended). Do not chain with `&&` on older PowerShell.

Backend install:
```
cd backend
npm install
```

Frontend install:
```
cd frontend
npm install
```


## Running the App (Development)
Start the backend first (port 3001):
```
cd backend
npm start
```
You should see: `Server running on port 3001`

Start the frontend next (usually on port 3000):
```
cd frontend
npm start
```
Your browser opens at http://localhost:3000


## API Endpoints
- GET `/api/search/:query`
  - Returns up to ~8 suggestions for the query (equities, ETFs, mutual funds)
  - Response shape:
    ```json
    {
      "suggestions": [
        { "symbol": "AAPL", "name": "Apple Inc.", "exchange": "NMS", "type": "EQUITY" }
      ]
    }
    ```

- GET `/api/stocks/:symbolOrName`
  - Accepts either a symbol (AAPL) or a company name (Apple)
  - Resolves to the best matching symbol then returns live quote:
    ```json
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "price": 231.59,
      "change": -0.51,
      "volume": 54864147,
      "marketCap": 3436888195072
    }
    ```

- GET `/api/analysis/:symbolOrName`
  - Returns an integrated analysis object that includes:
    - fundamentals (marketCap, P/E, EPS, dividendYield, beta, profitMargins)
    - sentiment (score/label and sample headlines)
    - geopolitics (label and triggered macro signals)
    - technicals (sma20, sma50, trend)
    - prediction (simple linear-regression next-day price with a min/max range)
    - recommendation (BUY/HOLD/SELL + rationale/horizon/targetRange)

- GET `/api/historical/:symbol?range=1d|5d|1mo|6mo|1y|5y|max`
  - Alternative query form: `/api/historical?symbol=:symbol&range=...`
  - Returns chart-ready time-series data:
    ```json
    {
      "symbol": "AAPL",
      "range": "1y",
      "quotes": [
        { "date": "2024-08-01T00:00:00.000Z", "open": 193.5, "high": 195.2, "low": 192.1, "close": 194.3, "volume": 54864147 }
      ],
      "indicators": {
        "sma50": [ { "time": "2024-08-01T00:00:00.000Z", "value": 189.1 } ],
        "sma200": [ ... ],
        "ema50": [ ... ],
        "ema200": [ ... ]
      },
      "events": {
        "dividends": [ { "time": "2024-05-10T00:00:00.000Z", "amount": 0.24 } ],
        "splits": [ { "time": "2020-08-31T00:00:00.000Z", "ratio": "4:1" } ],
        "earnings": [ { "time": "2024-07-25T00:00:00.000Z", "type": "earnings", "text": "Earnings" } ]
      },
      "ai": {
        "markers": [ { "time": "2024-06-14T00:00:00.000Z", "direction": "uptrend", "changePct": 5.8, "reason": "Upgrade" } ],
        "summary": { "1w": "Last 1 week: rose +1.2%.", "1y": "Over the last 1 year, stock rose +22.3%." }
      }
    }
    ```


## Frontend Usage
- Type 2+ characters (e.g., "App") to see suggestions in the dropdown
- Click a suggestion or press Enter to fetch and display the quote (works with names and tickers)
- Scroll down to the Analysis section:
  - You will see Fundamentals, Sentiment, Geopolitics, Technicals, Prediction, and Recommendation
  - At the end, the Chart Section renders:
    - Range toggles: 1D, 1W, 1M, 6M, 1Y, 5Y, Max
    - Price line with overlays: SMA(50), SMA(200), EMA(50), EMA(200)
    - Volume bars
    - Markers for Earnings (E), Dividends (D), Splits (S), and AI-detected significant moves
    - Click any marker dot to see a brief reason below the chart


## Troubleshooting
- Why is my prompt showing `(.venv)`?
  - That indicates a Python virtual environment is active in your terminal. It does not affect Node/React. You can deactivate it by running:
    - PowerShell: `deactivate`
  - Or simply open a new terminal without activating the Python venv.

- PowerShell complains about `&&` or `curl`:
  - Older Windows PowerShell doesn’t support `&&` between commands. Run commands on separate lines.
  - PowerShell aliases `curl` to `Invoke-WebRequest`. Use `curl.exe` for classic curl or test endpoints in your browser/Postman:
    - Example: `curl.exe http://localhost:3001/api/search/Apple`

- Make sure the correct server is running:
  - The real API is in `backend/server.js` (port 3001). Ensure it is started.
  - The root `index.js` on port 3000 is a demo and not required.


## Dependencies
You usually just run `npm install` in each folder. For reference:

Backend (backend/package.json):
- express
- cors
- dotenv
- yahoo-finance2

Frontend (frontend/package.json):
- react, react-dom, react-scripts (CRA) or Vite (depending on your setup)
- typescript (project uses .tsx)
- @mui/material, @mui/icons-material, @emotion/react, @emotion/styled
- axios

Dev (optional):
- nodemon (for backend hot reload)


## Git: Share this project
If this repo isn’t a git repo yet, initialize it and push to GitHub:
```
# From project root
git init

# Recommended .gitignore additions (create a .gitignore file)
# Node/React
node_modules/
backend/node_modules/
frontend/node_modules/

# Env files
.env
backend/.env
frontend/.env

# Builds
build/
dist/

# Python venv
.venv/

# OS/editor
.DS_Store
.vscode/

# Commit
git add .
git commit -m "Initial commit: stocks app with backend+frontend"

# Create a new repo on GitHub, then set the remote
# Replace USERNAME and REPO with your GitHub username and repository name
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```


## Notes
- Yahoo Finance does not require an API key for these endpoints, but it can rate-limit. Avoid excessive rapid requests.
- If you change backend port or host, update `frontend/.env` to point REACT_APP_API_URL accordingly.
- Name resolution and suggestion scoring prefer equities and exact/partial name matches.
