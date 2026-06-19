import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

def get_connection():
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable is not set")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def init_db():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Create tables
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS stocks (
            ticker TEXT PRIMARY KEY,
            company_name TEXT NOT NULL,
            category TEXT NOT NULL,
            groww_slug TEXT NOT NULL,
            market_cap_inr DOUBLE PRECISION
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS watchlists (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            UNIQUE(user_id, ticker)
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS forecast_cache (
            ticker TEXT PRIMARY KEY,
            payload JSONB NOT NULL,
            computed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
        """)
        
        # Seed data
        cursor.execute("SELECT COUNT(*) as count FROM stocks")
        if cursor.fetchone()['count'] == 0:
            initial_stocks = [
                # Largecap (Nifty 50)
                ("RELIANCE.NS", "Reliance Industries Ltd", "Largecap", "reliance-industries-ltd", 18500000000000),
                ("TCS.NS", "Tata Consultancy Services Ltd", "Largecap", "tata-consultancy-services-ltd", 13200000000000),
                ("HDFCBANK.NS", "HDFC Bank Ltd", "Largecap", "hdfc-bank-ltd", 11500000000000),
                ("INFY.NS", "Infosys Ltd", "Largecap", "infosys-ltd", 6400000000000),
                ("ICICIBANK.NS", "ICICI Bank Ltd", "Largecap", "icici-bank-ltd", 8100000000000),
                ("BHARTIARTL.NS", "Bharti Airtel Ltd", "Largecap", "bharti-airtel-ltd", 7800000000000),
                ("ITC.NS", "ITC Ltd", "Largecap", "itc-ltd", 5200000000000),
                ("SBIN.NS", "State Bank of India", "Largecap", "state-bank-of-india", 6900000000000),
                ("LTIM.NS", "LTIMindtree Ltd", "Largecap", "ltimindtree-ltd", 1500000000000),
                ("TATASTEEL.NS", "Tata Steel Ltd", "Largecap", "tata-steel-ltd", 2100000000000),
                
                # Midcap
                ("ZOMATO.NS", "Zomato Ltd", "Midcap", "zomato-ltd", 1800000000000),
                ("YESBANK.NS", "Yes Bank Ltd", "Midcap", "yes-bank-ltd", 680000000000),
                ("TATAELXSI.NS", "Tata Elxsi Ltd", "Midcap", "tata-elxsi-ltd", 480000000000),
                ("IRCTC.NS", "Indian Railway Catering & Tourism Corp Ltd", "Midcap", "indian-railway-catering-tourism-corp-ltd", 780000000000),
                ("DIXON.NS", "Dixon Technologies (India) Ltd", "Midcap", "dixon-technologies-india-ltd", 580000000000),
                ("MRF.NS", "MRF Ltd", "Midcap", "mrf-ltd", 540000000000),
                ("PAGEIND.NS", "Page Industries Ltd", "Midcap", "page-industries-ltd", 420000000000),
                ("POLYCAB.NS", "Polycab India Ltd", "Midcap", "polycab-india-ltd", 950000000000),
                ("NYKAA.NS", "FSN E-Commerce Ventures Ltd (Nykaa)", "Midcap", "fsn-e-commerce-ventures-ltd", 510000000000),
                ("PAYTM.NS", "One 97 Communications Ltd (Paytm)", "Midcap", "one-97-communications-ltd", 320000000000),

                # Smallcap
                ("SUZLON.NS", "Suzlon Energy Ltd", "Smallcap", "suzlon-energy-ltd", 690000000000),
                ("RVNL.NS", "Rail Vikas Nigam Ltd", "Smallcap", "rail-vikas-nigam-ltd", 610000000000),
                ("SJVN.NS", "SJVN Ltd", "Smallcap", "sjvn-ltd", 480000000000),
                ("IREDA.NS", "Indian Renewable Energy Development Agency Ltd", "Smallcap", "indian-renewable-energy-development-agency-ltd", 490000000000),
                ("IDEA.NS", "Vodafone Idea Ltd", "Smallcap", "vodafone-idea-ltd", 720000000000),
                ("TRIDENT.NS", "Trident Ltd", "Smallcap", "trident-ltd", 180000000000),
                ("IRFC.NS", "Indian Railway Finance Corp Ltd", "Smallcap", "indian-railway-finance-corp-ltd", 220000000000),
                ("NBCC.NS", "NBCC (India) Ltd", "Smallcap", "nbcc-india-ltd", 160000000000),
                ("HUDCO.NS", "Housing & Urban Development Corp Ltd", "Smallcap", "housing-urban-development-corp-ltd", 420000000000),
                ("ZENSARTECH.NS", "Zensar Technologies Ltd", "Smallcap", "zensar-technologies-ltd", 110000000000)
            ]
            cursor.executemany("""
            INSERT INTO stocks (ticker, company_name, category, groww_slug, market_cap_inr)
            VALUES (%s, %s, %s, %s, %s)
            """, initial_stocks)
            conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error initializing DB: {e}")

def get_all_stocks():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT ticker, company_name, category, groww_slug, market_cap_inr FROM stocks ORDER BY category, company_name")
    rows = cursor.fetchall()
    conn.close()
    return rows

def get_stock(ticker):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT ticker, company_name, category, groww_slug, market_cap_inr FROM stocks WHERE ticker = %s", (ticker,))
    row = cursor.fetchone()
    conn.close()
    return row

def add_stock(ticker, company_name, category, groww_slug, market_cap_inr):
    conn = get_connection()
    cursor = conn.cursor()
    success = False
    try:
        cursor.execute("""
        INSERT INTO stocks (ticker, company_name, category, groww_slug, market_cap_inr)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT(ticker) DO UPDATE SET
            company_name = EXCLUDED.company_name,
            category = EXCLUDED.category,
            groww_slug = EXCLUDED.groww_slug,
            market_cap_inr = EXCLUDED.market_cap_inr
        """, (ticker, company_name, category, groww_slug, market_cap_inr))
        conn.commit()
        success = True
    except Exception as e:
        print(f"Error registering stock: {e}")
        success = False
    finally:
        conn.close()
    return success

def get_forecast_cache(ticker):
    conn = get_connection()
    cursor = conn.cursor()
    # Return cache if less than 30 mins old
    cursor.execute("""
    SELECT payload FROM forecast_cache 
    WHERE ticker = %s AND computed_at > now() - interval '30 minutes'
    """, (ticker,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return row['payload']
    return None

def set_forecast_cache(ticker, payload):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO forecast_cache (ticker, payload, computed_at)
        VALUES (%s, %s, now())
        ON CONFLICT(ticker) DO UPDATE SET
            payload = EXCLUDED.payload,
            computed_at = EXCLUDED.computed_at
        """, (ticker, json.dumps(payload)))
        conn.commit()
    except Exception as e:
        print(f"Error caching forecast: {e}")
    finally:
        conn.close()

def get_user_watchlist(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT s.ticker, s.company_name, s.category, s.groww_slug, s.market_cap_inr 
    FROM watchlists w
    JOIN stocks s ON w.ticker = s.ticker
    WHERE w.user_id = %s
    ORDER BY w.created_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return rows

def add_to_watchlist(user_id, ticker):
    conn = get_connection()
    cursor = conn.cursor()
    success = False
    try:
        cursor.execute("""
        INSERT INTO watchlists (user_id, ticker)
        VALUES (%s, %s)
        ON CONFLICT(user_id, ticker) DO NOTHING
        """, (user_id, ticker))
        conn.commit()
        success = True
    except Exception as e:
        print(f"Error adding to watchlist: {e}")
    finally:
        conn.close()
    return success

def remove_from_watchlist(user_id, ticker):
    conn = get_connection()
    cursor = conn.cursor()
    success = False
    try:
        cursor.execute("DELETE FROM watchlists WHERE user_id = %s AND ticker = %s", (user_id, ticker))
        conn.commit()
        success = True
    except Exception as e:
        print(f"Error removing from watchlist: {e}")
    finally:
        conn.close()
    return success

# Skip auto DB init so we don't crash if DATABASE_URL isn't set on import
if DATABASE_URL:
    init_db()
