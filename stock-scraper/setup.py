from setuptools import setup, find_packages

setup(
    name='stock-scraper',
    version='0.1.0',
    author='Your Name',
    author_email='your.email@example.com',
    description='A web scraper for retrieving stock data from yfinance',
    packages=find_packages(where='src'),
    package_dir={'': 'src'},
    install_requires=[
        'yfinance',
        'requests',
    ],
    classifiers=[
        'Programming Language :: Python :: 3',
        'License :: OSI Approved :: MIT License',
        'Operating System :: OS Independent',
    ],
    python_requires='>=3.6',
)