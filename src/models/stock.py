class Stock:
    def __init__(self, symbol: str, name: str, price: float, currency: str, change: float, timestamp: str):
        self.symbol = symbol
        self.name = name
        self.price = price
        self.currency = currency
        self.change = change
        self.timestamp = timestamp

    def __str__(self):
        try:
            return (
                f"\nStock: {self.symbol}\n"
                f"Current Price: {self.currency} {self.price:,.2f}\n"
                f"24h Change: {self.change:+.2f}%\n"
                f"Last Updated: {self.timestamp}"
            )
        except (ValueError, TypeError):
            return f"\nError displaying data for {self.symbol}"