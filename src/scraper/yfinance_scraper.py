import yfinance as yf
from datetime import datetime
import time

class YFinanceScraper:
    def __init__(self):
        self.last_request = 0
        self.cooldown = 2  # Seconds between requests

    def _wait_for_cooldown(self):
        elapsed = time.time() - self.last_request
        if elapsed < self.cooldown:
            time.sleep(self.cooldown - elapsed)
        self.last_request = time.time()

    def fetch_data(self, symbol):
        try:
            self._wait_for_cooldown()
            
            # Create a Ticker object
            ticker = yf.Ticker(symbol)
            
            # Get today's data
            today_data = ticker.history(period='1d')
            
            if today_data.empty:
                raise ValueError(f"No data available for {symbol}")
            
            current_price = float(today_data['Close'][0])
            
            # Get basic info
            info = ticker.info
            name = info.get('shortName', symbol)
            
            return {
                'symbol': symbol,
                'name': name,
                'price': current_price,
                'currency': info.get('currency', 'USD'),
                'change': info.get('regularMarketChangePercent', 0.0),
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }

        except Exception as e:
            print(f"\nError fetching data for {symbol}:")
            print(f"Type: {type(e).__name__}")
            print(f"Details: {str(e)}")
            return None