from scraper.yfinance_scraper import YFinanceScraper
from models.stock import Stock
import time

def get_stock_info(symbol: str) -> Stock:
    scraper = YFinanceScraper()
    data = scraper.fetch_data(symbol)

    if data:
        return Stock(
            symbol=data['symbol'],
            name=data['name'],
            price=data['price'],
            currency=data['currency'],
            change=data['change'],
            timestamp=data['timestamp']
        )
    return None

def main():
    print("Welcome to Real-Time Stock Price Viewer!")
    print("----------------------------------------")
    
    while True:
        symbol = input("\nEnter stock symbol (or 'quit' to exit): ").upper()
        
        if symbol.lower() == 'quit':
            print("\nThank you for using Stock Price Viewer!")
            break
            
        stock = get_stock_info(symbol)
        
        if stock:
            print(stock)
        else:
            print(f"Could not fetch data for symbol: {symbol}")
        
        print("\nPress Enter to continue...")
        input()

if __name__ == "__main__":
    main()
