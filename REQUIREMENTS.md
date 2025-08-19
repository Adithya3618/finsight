# Project Requirements and Setup

This document lists everything needed to run the Stocks/FinSight app (backend + frontend) and how to set it up locally and for deployment.


## Prerequisites
- Git
- Node.js (LTS recommended, e.g., v18+)
- npm (comes with Node)
- Optional: Python 3.10+ (only if you plan to work with the Python subfolders — not required for the Node/React app)


## Environment Variables
Create these files (they may already exist):

backend/.env
```
PORT=3001
NODE_ENV=development
```

frontend/.env
```
REACT_APP_API_URL=http://localhost:3001
```

Notes:
- Only variables prefixed with `REACT_APP_` are available to the React app.
- For production deployments, set `REACT_APP_API_URL` to your deployed backend URL (e.g., Render/Railway), not localhost.


## Install Dependencies
Run commands separately in PowerShell/Terminal (avoid chaining with `&&` if your shell doesn’t support it).

Backend:
```
cd backend
npm install
```

Frontend:
```
cd frontend
npm install
```


## Run Locally (Development)
Start the backend:
```
cd backend
npm start
```
Expected: `Server running on port 3001`

Start the frontend (in another terminal):
```
cd frontend
npm start
```
Open http://localhost:3000


## API Overview (Backend)
- GET `/api/search/:query` — Autocomplete suggestions (symbol, name, exchange)
- GET `/api/stocks/:symbolOrName` — Quote by symbol or company name (resolves names like "Apple" to AAPL)
- GET `/api/analysis/:symbolOrName` — Fundamentals (PE, EPS, market cap), sentiment from headlines, macro/geopolitical signals, SMA20/50, simple next-day prediction, and BUY/HOLD/SELL recommendation with target range and horizon
- GET `/api/historical/:symbol?range=1d|5d|1mo|6mo|1y|5y|max` — Chart data (price/volume, SMA/EMA overlays, events, AI markers)
  - Also available as `/api/historical?symbol=:symbol&range=...`


## Runtime Dependencies
You do not need to install these one-by-one; `npm install` in each folder installs them. Listed here for clarity.

Backend (Node/Express):
- express — web framework
- cors — CORS middleware
- dotenv — loads `.env`
- yahoo-finance2 — market data, quotes, news/insights

Frontend (React + MUI):
- react, react-dom — React
- typescript — TypeScript support (.tsx)
- @mui/material, @mui/icons-material — UI components
- @emotion/react, @emotion/styled — styling for MUI
- axios — HTTP requests

Dev (optional):
- nodemon — auto-restart backend during development


## Deployment (Recommended Path)
- Deploy the backend to Render/Railway as a Node web service:
  - Root Directory: `backend`
  - Build Command: `npm install`
  - Start Command: `node server.js`
  - Note the deployed URL (e.g., `https://finsight-api.onrender.com`)
- Deploy the frontend to Vercel:
  - Root Directory: `frontend`
  - Install: `npm install`
  - Build: `npm run build`
  - Output Directory: `build`
  - Set Environment Variable: `REACT_APP_API_URL=https://<your-backend-domain>`


## Troubleshooting
- My terminal shows `(.venv)`:
  - That’s a Python virtual environment; it doesn’t affect Node/React. Run `deactivate` or open a new terminal.
- PowerShell errors with `&&` or `curl`:
  - Run commands on separate lines. Use `curl.exe` instead of PowerShell’s `curl` alias if testing endpoints.
- Frontend shows blank or raw code on Vercel:
  - Ensure Vercel’s Root Directory is set to `frontend` and the build/output settings are correct.
  - Ensure `REACT_APP_API_URL` is set in Vercel’s environment variables.
- Backend route says `Cannot GET /api/analysis/...`:
  - Make sure you started the backend in `backend/` (port 3001) and not the demo server at the project root.
- CORS issues in production:
  - Backend currently uses permissive CORS via `app.use(cors())`. You can restrict it later to your Vercel domain.


## Optional (Python Subfolders)
If you plan to run Python experiments in `stock-scraper/` or `src/`, create a Python venv and install the listed packages (adjust as needed):
```
python -m venv .venv
.venv\Scripts\activate
pip install -r stock-scraper/requirements.txt
```
Common packages used for finance analysis in Python (for reference):
- yfinance, pandas, numpy
- ta or pandas_ta (technical indicators)
- prophet or statsmodels (forecasting)
- transformers[torch] (FinBERT/GPT-based sentiment)

These are not required to run the Node/React app.


## Quick Commands
- Backend: `cd backend`, `npm install`, `npm start`
- Frontend: `cd frontend`, `npm install`, `npm start`
- Local environment files:
  - `backend/.env` → `PORT=3001`
  - `frontend/.env` → `REACT_APP_API_URL=http://localhost:3001`
