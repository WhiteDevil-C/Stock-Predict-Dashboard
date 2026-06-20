import os
import re
import urllib.parse
import requests
from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import yfinance as yf
import jwt
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

import database
import forecaster

app = FastAPI(title="NSE Stock Trend Forecast API")

# Load environment variables
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://127.0.0.1:8000")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(
            credentials.credentials,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False}
        )
        return payload["sub"] # sub is the user_id in Supabase JWT
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def generate_groww_slug(company_name: str) -> str:
    """
    Generates a realistic Groww app slug from the company name.
    Example: "Tata Consultancy Services Ltd" -> "tata-consultancy-services-ltd"
    """
    # Normalize string
    name = company_name.lower().strip()
    
    # Remove common suffixes like Co., Ltd., Limited, Corp, Corporation, India
    name = re.sub(r'\b(ltd|limited|corp|corporation|co|inc|india|&|and)\b', '', name)
    
    # Remove special characters
    name = re.sub(r'[^a-z0-9\s-]', '', name)
    
    # Replace whitespace/underscores with hyphens
    name = re.sub(r'[\s_]+', '-', name)
    
    # Clean up double hyphens
    name = re.sub(r'-+', '-', name).strip('-')
    
    # Append -ltd as it's common for listed Indian companies on Groww
    return f"{name}-ltd"

def fetch_market_cap_and_name(ticker: str):
    """
    Uses yfinance basic_info or info to fetch the actual company name and market cap (in INR).
    """
    try:
        t = yf.Ticker(ticker)
        # Try to use fast basic_info first (yfinance >= 0.2)
        try:
            info = t.info
            name = info.get("longName") or info.get("shortName") or ticker.split(".")[0]
            mcap = info.get("marketCap", 0)
        except Exception:
            name = ticker.split(".")[0]
            mcap = 0
            
        return name, mcap
    except Exception as e:
        print(f"Error fetching metadata for {ticker}: {e}")
        return ticker.split(".")[0], 0

@app.get("/api/config")
def get_config():
    """
    Returns public Supabase configuration for the frontend to initialize its client.
    """
    return {
        "supabase_url": SUPABASE_URL,
        "supabase_anon_key": SUPABASE_ANON_KEY
    }

@app.get("/api/stocks")
def get_stocks():
    """
    Returns the list of all registered stocks.
    """
    stocks = database.get_all_stocks()
    return {"success": True, "data": stocks}

@app.get("/api/stocks/details/{ticker}")
def get_stock_details(ticker: str, refresh: bool = False):
    """
    Fetches the live details, historical chart data, and ML forecast for a stock.
    """
    stock_meta = database.get_stock(ticker)
    if not stock_meta:
        # If not registered but valid ticker, let's register it on the fly!
        name, mcap = fetch_market_cap_and_name(ticker)
        slug = generate_groww_slug(name)
        # Classify cap size
        category = "Smallcap"
        if mcap > 200_000_000_000: # 20,000 Crores INR
            category = "Largecap"
        elif mcap > 50_000_000_000: # 5,000 Crores INR
            category = "Midcap"
        
        database.add_stock(ticker, name, category, slug, mcap)
        stock_meta = database.get_stock(ticker)
        
    forecast = forecaster.get_forecast_data(ticker, refresh=refresh)
    
    # Add metadata to forecast response
    if forecast.get("success"):
        forecast["company_name"] = stock_meta["company_name"]
        forecast["category"] = stock_meta["category"]
        forecast["groww_slug"] = stock_meta["groww_slug"]
        forecast["market_cap_inr"] = stock_meta["market_cap_inr"]
        
    return forecast

@app.get("/api/stocks/search")
def search_stock(q: str = Query(..., min_length=1)):
    """
    Searches locally, and if missing, searches Yahoo Finance API to resolve,
    register, and return the new stock.
    """
    # 1. Search locally in database (case-insensitive)
    conn = database.get_connection()
    cursor = conn.cursor()
    search_pattern = f"%{q}%"
    cursor.execute("""
    SELECT ticker, company_name, category, groww_slug, market_cap_inr 
    FROM stocks 
    WHERE ticker ILIKE %s OR company_name ILIKE %s
    LIMIT 5
    """, (search_pattern, search_pattern))
    rows = cursor.fetchall()
    conn.close()
    
    if rows:
        results = []
        for r in rows:
            results.append({
                "ticker": r['ticker'],
                "company_name": r['company_name'],
                "category": r['category'],
                "groww_slug": r['groww_slug'],
                "market_cap_inr": r['market_cap_inr'],
                "source": "local"
            })
        return {"success": True, "results": results}
        
    # 2. Search online using Yahoo Finance search endpoint
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        encoded_q = urllib.parse.quote(q)
        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={encoded_q}&quotesCount=6&newsCount=0"
        
        response = requests.get(url, headers=headers, timeout=5)
        response.raise_for_status()
        data = response.json()
        
        quotes = data.get("quotes", [])
        if not quotes:
            raise HTTPException(status_code=404, detail="No matching stocks found on Yahoo Finance.")
            
        # Filter for NSE / BSE or general Indian stocks
        registered_new = []
        for quote in quotes:
            symbol = quote.get("symbol", "")
            is_indian = (
                symbol.endswith(".NS") or 
                symbol.endswith(".BO") or 
                quote.get("exchDisp", "").lower() in ["nse", "bse"]
            )
            
            # If search is specific, allow general stocks but default to Indian NSE if it exists
            if is_indian or (len(quotes) == 1) or ("NSE" in quote.get("exchange", "")):
                # Fetch metadata & register
                name = quote.get("shortname") or quote.get("longname") or symbol.split(".")[0]
                # Default to .NS if not specified for Indian markets
                if not symbol.endswith(".NS") and not symbol.endswith(".BO") and is_indian:
                    symbol = f"{symbol}.NS"
                    
                # Fetch official market cap & long name
                long_name, mcap = fetch_market_cap_and_name(symbol)
                if not long_name or long_name == symbol.split(".")[0]:
                    long_name = name
                    
                # Classify market cap size
                category = "Smallcap"
                # Assume mcap in INR or convert if USD (yfinance fetches in ticker currency, so NSE is INR)
                if mcap > 200_000_000_000:  # 20,000 Cr INR
                    category = "Largecap"
                elif mcap > 50_000_000_000:  # 5,000 Cr INR
                    category = "Midcap"
                    
                groww_slug = generate_groww_slug(long_name)
                
                # Add to DB
                database.add_stock(symbol, long_name, category, groww_slug, mcap)
                
                registered_new.append({
                    "ticker": symbol,
                    "company_name": long_name,
                    "category": category,
                    "groww_slug": groww_slug,
                    "market_cap_inr": mcap,
                    "source": "online"
                })
                
        if registered_new:
            return {"success": True, "results": registered_new}
            
    except Exception as e:
        print(f"Online search error: {e}")
        
    raise HTTPException(status_code=404, detail="No matching NSE stocks found.")

# --- Watchlist Endpoints ---

@app.get("/api/watchlist")
def get_watchlist(user_id: str = Depends(get_current_user)):
    data = database.get_user_watchlist(user_id)
    return {"success": True, "data": data}

@app.post("/api/watchlist")
def add_to_watchlist(ticker: str, user_id: str = Depends(get_current_user)):
    success = database.add_to_watchlist(user_id, ticker)
    if success:
        return {"success": True, "message": "Added to watchlist"}
    raise HTTPException(status_code=400, detail="Could not add to watchlist")

@app.delete("/api/watchlist/{ticker}")
def remove_from_watchlist(ticker: str, user_id: str = Depends(get_current_user)):
    success = database.remove_from_watchlist(user_id, ticker)
    if success:
        return {"success": True, "message": "Removed from watchlist"}
    raise HTTPException(status_code=400, detail="Could not remove from watchlist")

# Mount frontend static directory
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
