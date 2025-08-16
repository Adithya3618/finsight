import unittest
from src.scraper.yfinance_scraper import YFinanceScraper

class TestYFinanceScraper(unittest.TestCase):

    def setUp(self):
        self.scraper = YFinanceScraper()

    def test_fetch_data(self):
        data = self.scraper.fetch_data('AAPL')
        self.assertIsNotNone(data)
        self.assertIn('AAPL', data)

    def test_parse_data(self):
        raw_data = {
            'symbol': 'AAPL',
            'price': 150.00,
            'name': 'Apple Inc.'
        }
        parsed_data = self.scraper.parse_data(raw_data)
        self.assertEqual(parsed_data['symbol'], 'AAPL')
        self.assertEqual(parsed_data['name'], 'Apple Inc.')
        self.assertIn('price', parsed_data)

if __name__ == '__main__':
    unittest.main()