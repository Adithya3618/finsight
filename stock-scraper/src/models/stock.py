from datetime import datetime

class Stock:
    def __init__(self, symbol: str, name: str, price: float, currency: str, change: float, timestamp: str):
        self.symbol = symbol
        self.name = name
        self.price = price
        self.currency = currency
        self.change = change
        self.timestamp = timestamp

    def __str__(self):
        return (f"\nStock: {self.name} ({self.symbol})\n"
                f"Price: {self.currency} {self.price:.2f}\n"
                f"Change: {self.change:.2f}%\n"
                f"Last Updated: {self.timestamp}")
