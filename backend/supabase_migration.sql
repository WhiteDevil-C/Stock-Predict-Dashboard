-- Supabase Migration Script

-- Create the stocks table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.stocks (
    ticker TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    category TEXT NOT NULL,
    groww_slug TEXT NOT NULL,
    market_cap_inr DOUBLE PRECISION
);

-- Create the watchlists table
CREATE TABLE IF NOT EXISTS public.watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- normally references auth.users(id) if RLS is enabled, but we enforce via app logic
    ticker TEXT NOT NULL REFERENCES public.stocks(ticker) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, ticker)
);

-- Create the forecast cache table
CREATE TABLE IF NOT EXISTS public.forecast_cache (
    ticker TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Optional: Enable Row Level Security (RLS) on watchlists if we were using Supabase JS client for direct DB access.
-- But since we are accessing the DB through our FastAPI backend using a server-side connection, RLS is not strictly necessary unless you want defence-in-depth.
