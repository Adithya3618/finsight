import yfinance as yf
from datetime import datetime

class YFinanceScraper:
    def __init__(self):
        self.data = None

    def fetch_data(self, symbol):
        try:
            ticker = yf.Ticker(symbol)
            self.data = ticker.info
            return {
                'symbol': symbol,
                'name': self.data.get('longName', 'N/A'),
                'price': self.data.get('currentPrice', 'N/A'),
                'currency': self.data.get('currency', 'USD'),
                'change': self.data.get('regularMarketChangePercent', 'N/A'),
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
        except Exception as e:
            print(f"Error fetching data for {symbol}: {str(e)}")
            return None