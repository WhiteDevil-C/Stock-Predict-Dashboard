// Application State
const state = {
  stocks: [],
  watchlist: [],
  selectedTicker: null,
  activeCategory: 'all',
  chart: null,
  updateInterval: null,
  user: null,
  session: null
};

const API_BASE = window.location.origin;
let supabase = null;

// DOM Elements
const stocksListEl = document.getElementById('stocksList');
const searchInputEl = document.getElementById('searchInput');
const searchResultsEl = document.getElementById('searchResults');
const tabButtons = document.querySelectorAll('.tab-btn');
const watchlistTab = document.getElementById('watchlistTab');

const stockNameEl = document.getElementById('stockName');
const stockTickerPathEl = document.getElementById('stockTickerPath');
const currentPriceEl = document.getElementById('currentPrice');
const changeIndicatorEl = document.getElementById('changeIndicator');
const forecastVerdictEl = document.getElementById('forecastVerdict');
const growwLinkEl = document.getElementById('growwLink');

const metricAccuracyEl = document.getElementById('metricAccuracy');
const metricF1El = document.getElementById('metricF1');
const metricPrecisionEl = document.getElementById('metricPrecision');
const metricRecallEl = document.getElementById('metricRecall');
const metricAucEl = document.getElementById('metricAuc');

const matrixTPEl = document.getElementById('matrixTP');
const matrixTNEl = document.getElementById('matrixTN');
const matrixFPEl = document.getElementById('matrixFP');
const matrixFNEl = document.getElementById('matrixFN');
const featuresListEl = document.getElementById('featuresList');

// Auth DOM
const authButton = document.getElementById('authButton');
const userProfile = document.getElementById('userProfile');
const userEmail = document.getElementById('userEmail');
const signOutBtn = document.getElementById('signOutBtn');
const authModal = document.getElementById('authModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const authForm = document.getElementById('authForm');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authSwitchBtn = document.getElementById('authSwitchBtn');
const authSwitchText = document.getElementById('authSwitchText');
const modalTitle = document.getElementById('modalTitle');
const authError = document.getElementById('authError');
const toggleWatchlistBtn = document.getElementById('toggleWatchlistBtn');
const watchlistIcon = document.getElementById('watchlistIcon');

let isSignUp = false;

// ── INITIALIZATION ──
document.addEventListener('DOMContentLoaded', async () => {
  await initSupabase();
  setupEventListeners();
  setupAuthListeners();
  startRealTimeUpdates();
});

async function initSupabase() {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    const config = await res.json();
    if (config.supabase_url && config.supabase_anon_key && window.supabase) {
      supabase = window.supabase.createClient(config.supabase_url, config.supabase_anon_key);

      // Check initial session
      const { data: { session } } = await supabase.auth.getSession();
      await handleAuthChange(session);

      // Listen for changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        await handleAuthChange(session);
      });
    } else {
      console.error("Supabase config missing. Auth will not work.");
      fetchStocksList(); // Load stocks without auth
    }
  } catch (err) {
    console.error("Failed to load config", err);
    fetchStocksList();
  }
}

async function handleAuthChange(session) {
  state.session = session;
  state.user = session?.user || null;

  if (state.user) {
    if (authButton) authButton.style.display = 'none';
    if (userProfile) userProfile.style.display = 'flex';
    if (userEmail) userEmail.textContent = state.user.email;
    if (watchlistTab) watchlistTab.style.display = 'inline-block';

    // Fetch watchlist and then stocks
    await fetchWatchlist();
    await fetchStocksList();
    if (state.selectedTicker) updateWatchlistButtonState();
  } else {
    if (authButton) authButton.style.display = 'block';
    if (userProfile) userProfile.style.display = 'none';
    if (watchlistTab) watchlistTab.style.display = 'none';
    state.watchlist = [];

    if (state.activeCategory === 'watchlist') {
      state.activeCategory = 'all';
      document.querySelector('[data-category="all"]').click();
    }

    if (toggleWatchlistBtn) toggleWatchlistBtn.style.display = 'none';
    await fetchStocksList();
  }
}

// ── AUTH LISTENERS ──
function setupAuthListeners() {
  if (authButton) authButton.onclick = () => {
    if (authModal) authModal.style.display = 'flex';
    isSignUp = false;
    updateModalUI();
  };

  if (closeModalBtn) closeModalBtn.onclick = () => {
    if (authModal) authModal.style.display = 'none';
    if (authError) authError.style.display = 'none';
  };

  if (authSwitchBtn) authSwitchBtn.onclick = () => {
    isSignUp = !isSignUp;
    updateModalUI();
  };

  if (googleSignInBtn) googleSignInBtn.onclick = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  if (signOutBtn) signOutBtn.onclick = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  if (authForm) authForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!supabase) return;

    const email = emailInput.value;
    const password = passwordInput.value;
    authError.style.display = 'none';
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = "Processing...";

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // if email confirmation is on, user won't be logged in yet
        authModal.style.display = 'none';
        alert("Check your email for the confirmation link!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        authModal.style.display = 'none';
      }
    } catch (err) {
      authError.textContent = err.message;
      authError.style.display = 'block';
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = isSignUp ? "Sign Up" : "Sign In";
    }
  };
}

function updateModalUI() {
  modalTitle.textContent = isSignUp ? "Create Account" : "Sign In";
  authSubmitBtn.textContent = isSignUp ? "Sign Up" : "Sign In";
  authSwitchText.textContent = isSignUp ? "Already have an account?" : "Don't have an account?";
  authSwitchBtn.textContent = isSignUp ? "Sign In" : "Sign Up";
  authError.style.display = 'none';
}

function setupEventListeners() {
  // Category tabs
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.activeCategory = e.target.dataset.category;
      renderStocksSidebar();
    });
  });

  // Debounced search
  let debounceTimeout;
  if (searchInputEl) searchInputEl.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
      searchResultsEl.style.display = 'none';
      return;
    }

    debounceTimeout = setTimeout(() => {
      performSearch(query);
    }, 400);
  });

  // Close search dropdown on clicking outside
  document.addEventListener('click', (e) => {
    if (searchInputEl && searchResultsEl && !searchInputEl.contains(e.target) && !searchResultsEl.contains(e.target)) {
      searchResultsEl.style.display = 'none';
    }
  });

  // Watchlist toggle
  if (toggleWatchlistBtn) toggleWatchlistBtn.onclick = async () => {
    if (!state.user || !state.selectedTicker) return;
    const ticker = state.selectedTicker;
    const isWatched = state.watchlist.some(w => w.ticker === ticker);

    // Optimistic UI update
    const previousWatchlist = [...state.watchlist];
    if (isWatched) {
      state.watchlist = state.watchlist.filter(w => w.ticker !== ticker);
    } else {
      state.watchlist.push({ ticker });
    }
    updateWatchlistButtonState();

    try {
      if (isWatched) {
        await fetch(`${API_BASE}/api/watchlist/${ticker}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${state.session.access_token}` }
        });
      } else {
        await fetch(`${API_BASE}/api/watchlist?ticker=${ticker}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.session.access_token}`
          }
        });
      }
      // Refresh full watchlist to get stock details correctly
      await fetchWatchlist();
      if (state.activeCategory === 'watchlist') {
        renderStocksSidebar();
      }
    } catch (err) {
      console.error("Watchlist error", err);
      // Revert optimistic update
      state.watchlist = previousWatchlist;
      updateWatchlistButtonState();
    }
  };
}

// ── FETCH & RENDER SIDEBAR ──
async function fetchWatchlist() {
  if (!state.user) return;
  try {
    const response = await fetch(`${API_BASE}/api/watchlist`, {
      headers: { 'Authorization': `Bearer ${state.session.access_token}` }
    });
    const result = await response.json();
    if (result.success) {
      state.watchlist = result.data;
    }
  } catch (error) {
    console.error("Error fetching watchlist:", error);
  }
}

async function fetchStocksList() {
  try {
    const response = await fetch(`${API_BASE}/api/stocks`);
    const result = await response.json();
    if (result.success) {
      state.stocks = result.data;
      renderStocksSidebar();

      // Default selection (Reliance)
      if (state.stocks.length > 0 && !state.selectedTicker) {
        selectStock(state.stocks[0].ticker);
      }
    }
  } catch (error) {
    console.error("Error fetching stocks:", error);
  }
}

function renderStocksSidebar() {
  if (!stocksListEl) return;
  stocksListEl.innerHTML = '';

  let filtered = [];
  if (state.activeCategory === 'watchlist') {
    filtered = state.watchlist;
    if (filtered.length === 0) {
      stocksListEl.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center; font-size:12px;">Your watchlist is empty.</div>';
      return;
    }
  } else {
    filtered = state.stocks.filter(s => {
      if (state.activeCategory === 'all') return true;
      return s.category.toLowerCase() === state.activeCategory.toLowerCase();
    });
  }

  filtered.forEach(stock => {
    const isSelected = stock.ticker === state.selectedTicker;
    const item = document.createElement('div');
    item.className = `stock-item ${isSelected ? 'active' : ''}`;
    item.onclick = () => selectStock(stock.ticker);

    const capClass = stock.category.toLowerCase().replace('cap', '');

    item.innerHTML = `
      <div class="stock-item-info">
        <span class="stock-item-ticker">${stock.ticker}</span>
        <span class="stock-item-name">${stock.company_name}</span>
      </div>
      <div class="stock-item-meta">
        <span class="cap-badge ${capClass}">${stock.category}</span>
      </div>
    `;
    stocksListEl.appendChild(item);
  });
}

function updateWatchlistButtonState() {
  if (!toggleWatchlistBtn || !watchlistIcon) return;

  if (!state.user) {
    toggleWatchlistBtn.style.display = 'none';
    return;
  }
  toggleWatchlistBtn.style.display = 'block';
  const isWatched = state.watchlist.some(w => w.ticker === state.selectedTicker);
  if (isWatched) {
    watchlistIcon.className = 'fa-solid fa-star';
    toggleWatchlistBtn.classList.add('active');
    toggleWatchlistBtn.title = 'Remove from Watchlist';
  } else {
    watchlistIcon.className = 'fa-regular fa-star';
    toggleWatchlistBtn.classList.remove('active');
    toggleWatchlistBtn.title = 'Add to Watchlist';
  }
}

// ── SEARCH & AUTO REGISTRATION ──
async function performSearch(query) {
  try {
    const response = await fetch(`${API_BASE}/api/stocks/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      if (searchResultsEl) searchResultsEl.innerHTML = `<div class="search-result-item" style="color: var(--text-muted);">No stocks found</div>`;
      if (searchResultsEl) searchResultsEl.style.display = 'block';
      return;
    }
    const result = await response.json();

    if (result.success && result.results.length > 0) {
      if (searchResultsEl) searchResultsEl.innerHTML = '';
      result.results.forEach(item => {
        const row = document.createElement('div');
        row.className = 'search-result-item';
        row.innerHTML = `
          <div>
            <div class="symbol">${item.ticker}</div>
            <div class="name">${item.company_name}</div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end;">
            <span class="cap-badge ${item.category.toLowerCase().replace('cap', '')}">${item.category}</span>
            <span style="font-size: 8px; color: var(--text-muted); margin-top: 4px;">${item.source === 'online' ? 'Register New' : 'Listed'}</span>
          </div>
        `;
        row.onclick = () => {
          selectStock(item.ticker);
          if (searchResultsEl) searchResultsEl.style.display = 'none';
          if (searchInputEl) searchInputEl.value = '';
          // Refresh list to include newly registered stock
          fetchStocksList();
        };
        if (searchResultsEl) searchResultsEl.appendChild(row);
      });
      if (searchResultsEl) searchResultsEl.style.display = 'block';
    } else {
      if (searchResultsEl) searchResultsEl.style.display = 'none';
    }
  } catch (error) {
    console.error("Search error:", error);
    if (searchResultsEl) searchResultsEl.style.display = 'none';
  }
}

// ── SELECT STOCK ──
async function selectStock(ticker) {
  state.selectedTicker = ticker;

  // Highlight in sidebar
  const items = document.querySelectorAll('.stock-item');
  items.forEach(el => {
    const itemTicker = el.querySelector('.stock-item-ticker').textContent;
    if (itemTicker === ticker) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  fetchStockDetails(ticker);
  updateWatchlistButtonState();
}

// ── GET DETAILS & RENDER ──
async function fetchStockDetails(ticker, forceRefresh = false) {
  try {
    const url = `${API_BASE}/api/stocks/details/${ticker}` + (forceRefresh ? "?refresh=true" : "");
    const response = await fetch(url);
    const details = await response.json();

    if (details.success) {
      renderDetails(details);
    }
  } catch (error) {
    console.error("Error fetching details:", error);
  }
}

function renderDetails(data) {
  // Update header info
  if (stockNameEl) stockNameEl.textContent = data.company_name;
  if (stockTickerPathEl) stockTickerPathEl.textContent = `${data.ticker} · NSE · ${data.category}`;
  if (currentPriceEl) currentPriceEl.textContent = `₹${data.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  // Daily change indicator
  const sign = data.change_pct >= 0 ? '+' : '';
  const dir = data.change_pct >= 0 ? '▲' : '▼';
  if (changeIndicatorEl) {
    changeIndicatorEl.textContent = `${dir} ${sign}${data.change_pct}%`;
    if (data.change_pct >= 0) {
      changeIndicatorEl.className = 'change-indicator up';
    } else {
      changeIndicatorEl.className = 'change-indicator down';
    }
  }

  // Tomorrow model forecast
  if (forecastVerdictEl) {
    forecastVerdictEl.textContent = `${data.prediction} (${data.probability}%)`;
    if (data.prediction === 'BULLISH') {
      forecastVerdictEl.className = 'forecast-verdict bullish';
    } else {
      forecastVerdictEl.className = 'forecast-verdict bearish';
    }
  }

  // Groww Deep Link Integration
  if (growwLinkEl) growwLinkEl.href = `https://groww.in/stocks/${data.groww_slug}`;

  // Diagnostics metrics
  if (metricAccuracyEl) metricAccuracyEl.textContent = `${data.metrics.accuracy}%`;
  if (metricF1El) metricF1El.textContent = data.metrics.f1;
  if (metricPrecisionEl) metricPrecisionEl.textContent = `${data.metrics.precision}%`;
  if (metricRecallEl) metricRecallEl.textContent = `${data.metrics.recall}%`;
  if (metricAucEl) metricAucEl.textContent = data.metrics.auc_roc;

  // Confusion matrix
  if (matrixTPEl) matrixTPEl.textContent = data.confusion_matrix.tp;
  if (matrixTNEl) matrixTNEl.textContent = data.confusion_matrix.tn;
  if (matrixFPEl) matrixFPEl.textContent = data.confusion_matrix.fp;
  if (matrixFNEl) matrixFNEl.textContent = data.confusion_matrix.fn;

  // Feature Importance progress bars
  if (featuresListEl) {
    featuresListEl.innerHTML = '';
    data.feature_importances.forEach(feat => {
      const row = document.createElement('div');
      row.className = 'feature-row';
      row.innerHTML = `
        <div class="feature-name">${feat.name}</div>
        <div class="feature-bar-wrapper">
          <div class="feature-bar" style="width: 0%"></div>
        </div>
        <div class="feature-pct">${feat.importance}%</div>
      `;
      featuresListEl.appendChild(row);

      // Trigger animation frame for CSS transitions to work
      setTimeout(() => {
        row.querySelector('.feature-bar').style.width = `${feat.importance}%`;
      }, 50);
    });
  }

  // Render main chart
  renderChart(data);
}

// ── CHART.JS INTEGRATION ──
function renderChart(data) {
  const canvas = document.getElementById('chartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Prepare labels (Dates) and data series
  const labels = data.history.map(h => h.date);
  const prices = data.history.map(h => h.close);

  // Calculate a basic 5-day SMA for SMA line display
  const sma = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < 4) {
      sma.push(null); // padding for initial entries
    } else {
      const sum = prices.slice(i - 4, i + 1).reduce((a, b) => a + b, 0);
      sma.push(Number((sum / 5).toFixed(2)));
    }
  }

  // Projection / forecast tomorrow point
  const lastPrice = prices[prices.length - 1];
  const isUp = data.prediction === 'BULLISH';
  const targetChange = isUp ? 0.015 : -0.015; // Simulate target line delta (+/-1.5%)
  const predictedPrice = Number((lastPrice * (1 + targetChange)).toFixed(2));

  // Append future date for the forecast tick
  const todayDate = new Date(labels[labels.length - 1]);
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

  // Create copies for display
  const chartLabels = [...labels, tomorrowStr];
  const mainPrices = [...prices, null];
  const smaPrices = [...sma, null];

  // Forecast projection dataset (dotted segment linking today's close and tomorrow's forecast)
  const projectionPrices = Array(prices.length - 1).fill(null);
  projectionPrices.push(lastPrice); // link starting at today
  projectionPrices.push(predictedPrice); // forecast endpoint

  // Setup gradient fills for canvas chart
  const priceGradient = ctx.createLinearGradient(0, 0, 0, 320);
  priceGradient.addColorStop(0, 'rgba(0, 212, 255, 0.18)');
  priceGradient.addColorStop(1, 'rgba(0, 212, 255, 0.0)');

  // Clear existing chart
  if (state.chart) {
    state.chart.destroy();
  }

  // Initialize new Chart.js instance
  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Close Price (₹)',
          data: mainPrices,
          borderColor: '#00D4FF',
          borderWidth: 2,
          backgroundColor: priceGradient,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.1
        },
        {
          label: '5-Day SMA (₹)',
          data: smaPrices,
          borderColor: '#F59E0B',
          borderWidth: 1.5,
          borderDash: [2, 2],
          fill: false,
          pointRadius: 0,
          tension: 0.1
        },
        {
          label: 'Prediction Projection',
          data: projectionPrices,
          borderColor: isUp ? '#10B981' : '#EF4444',
          borderWidth: 2,
          borderDash: [4, 4],
          fill: false,
          pointRadius: 4,
          pointBackgroundColor: isUp ? '#10B981' : '#EF4444',
          tension: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#F8FAFC',
          bodyColor: '#F8FAFC',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          displayColors: false,
          callbacks: {
            title: function (context) {
              if (context[0].dataIndex === chartLabels.length - 1) {
                return 'MODEL FORECAST';
              }
              return context[0].label;
            },
            label: function (context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += '₹' + context.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 });
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)'
          },
          ticks: {
            font: {
              family: 'JetBrains Mono',
              size: 9
            },
            color: '#94A3B8',
            maxTicksLimit: 12
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)'
          },
          ticks: {
            font: {
              family: 'JetBrains Mono',
              size: 9
            },
            color: '#94A3B8',
            callback: function (value) {
              return '₹' + value.toLocaleString('en-IN');
            }
          }
        }
      }
    }
  });
}

// ── REAL TIME UPDATES SIMULATION ──
function startRealTimeUpdates() {
  // Clear any existing timer
  if (state.updateInterval) {
    clearInterval(state.updateInterval);
  }

  // Simulating live feeds by checking details endpoint periodically
  state.updateInterval = setInterval(() => {
    if (state.selectedTicker) {
      fetchStockDetails(state.selectedTicker);
    }
  }, 10000); // refresh details every 10 seconds
}

