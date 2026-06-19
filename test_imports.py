import sys
try:
    import fastapi
    import uvicorn
    import yfinance
    import pandas
    import numpy
    import sklearn
    import requests
    import bs4
    import sqlite3
    print("All imports succeeded!")
    print(f"Python: {sys.version}")
    print(f"fastapi: {fastapi.__version__}")
    print(f"yfinance: {yfinance.__version__}")
    print(f"pandas: {pandas.__version__}")
    print(f"numpy: {numpy.__version__}")
    print(f"sklearn: {sklearn.__version__}")
except Exception as e:
    print(f"Import failed: {e}")
    sys.exit(1)
