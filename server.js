/**
 * RVM Classes — AI Tutor Proxy Server
 * ------------------------------------
 * Sits between the frontend and Anthropic API.
 * The API key NEVER reaches the browser.
 *
 * Setup:
 *   1. npm install
 *   2. Create a .env file:  ANTHROPIC_API_KEY=sk-ant-…
 *   3. node server.js
 *
 * Deployed on any $5/mo VPS (DigitalOcean, Render, Railway, etc.)
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const fetch      = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────
app.use(express.json({ limit: '25mb' }));   // allow large base64 images/PDFs
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Serve the static site files from this same directory
app.use(express.static(path.join(__dirname)));

// CORS — in production lock this to your domain
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
}));

// ─── RATE LIMITING ────────────────────────────────────────
// 40 messages per IP per hour — generous for genuine students
const chatLimiter = rateLimit({
  windowMs : 60 * 60 * 1000,   // 1 hour window
  max      : 40,
  standardHeaders: true,
  legacyHeaders  : false,
  message  : {
    error: 'Too many questions in one hour. Take a short break and come back! 😊',
    code : 'RATE_LIMITED'
  }
});

// ─── CHAT ENDPOINT ───────────────────────────────────────
app.post('/api/chat', chatLimiter, async (req, res) => {
  const { messages, system } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array required.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set in environment!');
    return res.status(500).json({ error: 'Server configuration error. Please contact admin.' });
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method : 'POST',
      headers: {
        'Content-Type'      : 'application/json',
        'x-api-key'         : apiKey,
        'anthropic-version' : '2023-06-01',
        'anthropic-beta'    : 'pdfs-2024-09-25',   // enable PDF support
      },
      body: JSON.stringify({
        model     : 'claude-opus-4-5',
        max_tokens: 1024,
        system    : system || '',
        messages  : messages,
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      console.error('Anthropic API error:', data);
      return res.status(anthropicRes.status).json({
        error: data.error?.message || 'AI service error. Please try again.'
      });
    }

    return res.json(data);

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(503).json({ error: 'Could not reach AI service. Check your internet connection.' });
  }
});

// ─── HEALTH CHECK ────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'RVM Classes AI Tutor', timestamp: new Date().toISOString() });
});

// ─── SPA FALLBACK ────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎓 RVM Classes AI Tutor server running on http://localhost:${PORT}`);
  console.log(`   API key: ${process.env.ANTHROPIC_API_KEY ? '✓ loaded' : '✗ MISSING — set ANTHROPIC_API_KEY in .env'}\n`);
});
