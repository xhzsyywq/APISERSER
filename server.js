const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3456;

// ========= SERVER-SIDE API KEYS (never sent to frontend) =========
const API_KEYS = {
  deepseek: 'sk-fd1273ba8ce94e62b2ac994f6cacd274',
  minimax: 'sk-cvxrajun38ydujatgfprk3btaur8xf4vrx2fgcrckkhels2f',
  zhipu: ''
};

// ========= API Base URLs =========
const API_BASE = {
  deepseek: 'https://api.deepseek.com',
  minimax: 'https://api.minimax.chat/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4'
};

// ========= Rate Limiting =========
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 30;   // max requests per minute per IP
const RATE_WINDOW = 60000;    // 1 minute

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const timestamps = rateLimitMap.get(ip).filter(function(t) { return now - t < RATE_WINDOW; });
  if (timestamps.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests, slow down.' });
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  next();
}

app.use(cors());
app.use(express.json());
app.use(rateLimit);

// ========= Health =========
app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', providers: Object.keys(API_KEYS).filter(function(k) { return API_KEYS[k]; }) });
});

// ========= Usage Proxy =========
app.get('/api/usage/:provider', async function(req, res) {
  var provider = req.params.provider;
  var apiKey = API_KEYS[provider];

  if (!apiKey) {
    return res.status(400).json({ error: 'Unknown provider: ' + provider });
  }

  try {
    var data = await fetchProviderUsage(provider, apiKey);
    res.json(data);
  } catch (err) {
    console.error('[' + provider + '] Fetch error:', err.message);
    res.status(502).json({ error: 'Failed to fetch usage data: ' + err.message });
  }
});

// ========= Provider-specific fetch logic =========
async function fetchProviderUsage(provider, apiKey) {
  switch (provider) {
    case 'deepseek':
      return await fetchDeepSeekUsage(apiKey);
    case 'minimax':
      return await fetchMiniMaxUsage(apiKey);
    case 'zhipu':
      return await fetchZhipuUsage(apiKey);
    default:
      throw new Error('Unsupported provider');
  }
}

// --- DeepSeek ---
// API Doc: GET https://api.deepseek.com/user/balance
async function fetchDeepSeekUsage(apiKey) {
  var resp = await fetch('https://api.deepseek.com/user/balance', {
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' }
  });

  if (!resp.ok) {
    var errText = await resp.text();
    throw new Error('DeepSeek API error ' + resp.status + ': ' + errText);
  }

  var json = await resp.json();
  // DeepSeek returns: { is_available, balance_infos: [{ currency, total_balance, topped_up_balance, granted_balance }] }
  var balanceInfos = json.balance_infos || [];
  var cny = balanceInfos.find(function(b) { return b.currency === 'CNY'; }) || balanceInfos[0] || {};

  return sanitize({
    provider: 'deepseek',
    balance: parseFloat(cny.total_balance || cny.topped_up_balance || 0),
    granted_balance: parseFloat(cny.granted_balance || 0),
    topped_up_balance: parseFloat(cny.topped_up_balance || 0),
    currency: cny.currency || 'CNY',
    is_available: json.is_available !== false,
    today_tokens: 0,     // DeepSeek balance API doesn't provide token usage; frontend estimates
    month_tokens: 0,
    daily_history: []    // frontend tracks via localStorage
  });
}

// --- MiniMax ---
async function fetchMiniMaxUsage(apiKey) {
  // MiniMax doesn't have a public balance endpoint like DeepSeek
  // We return a structured response; frontend can track usage via localStorage
  return sanitize({
    provider: 'minimax',
    balance: 0,
    currency: 'CNY',
    today_tokens: 0,
    month_tokens: 0,
    daily_history: [],
    _note: 'MiniMax balance API not publicly available; showing locally tracked data'
  });
}

// --- Zhipu (智谱) ---
async function fetchZhipuUsage(apiKey) {
  if (!apiKey) {
    return sanitize({
      provider: 'zhipu',
      balance: 0,
      currency: 'CNY',
      today_tokens: 0,
      month_tokens: 0,
      daily_history: [],
      _note: 'No API key configured for Zhipu'
    });
  }
  // Zhipu billing endpoint (trial)
  try {
    var resp = await fetch('https://open.bigmodel.cn/api/paas/v4/user/balance', {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });
    if (resp.ok) {
      var json = await resp.json();
      return sanitize({
        provider: 'zhipu',
        balance: parseFloat(json.balance || 0),
        currency: 'CNY',
        today_tokens: 0,
        month_tokens: 0,
        daily_history: []
      });
    }
  } catch (e) { /* fall through */ }

  return sanitize({
    provider: 'zhipu',
    balance: 0,
    currency: 'CNY',
    today_tokens: 0,
    month_tokens: 0,
    daily_history: [],
    _note: 'Zhipu balance fetch failed'
  });
}

// ========= Sanitize: strip any sensitive fields =========
function sanitize(data) {
  // Ensure no API key, token, or sensitive account info leaks
  var safe = {
    provider: data.provider || 'unknown',
    balance: typeof data.balance === 'number' ? Math.round(data.balance * 100) / 100 : 0,
    currency: data.currency || 'CNY',
    today_tokens: data.today_tokens || 0,
    month_tokens: data.month_tokens || 0,
    daily_history: data.daily_history || [],
    is_available: data.is_available !== false,
    timestamp: new Date().toISOString()
  };

  // Pass through grant info from DeepSeek
  if (typeof data.granted_balance === 'number') safe.granted_balance = data.granted_balance;
  if (typeof data.topped_up_balance === 'number') safe.topped_up_balance = data.topped_up_balance;

  return safe;
}

// ========= Start =========
app.listen(PORT, function() {
  console.log('API Usage Proxy running on http://localhost:' + PORT);
  console.log('Available providers: ' + Object.keys(API_KEYS).filter(function(k) { return API_KEYS[k]; }).join(', '));
});
