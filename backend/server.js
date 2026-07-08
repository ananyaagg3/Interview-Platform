import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import setupSocket from './socket/socketHandler.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Robust CORS — allows localhost, Vercel, Railway, and any custom FRONTEND_URL
const allowedOrigin = (origin, callback) => {
  if (!origin) return callback(null, true); // non-browser requests (curl, Postman)

  const o = origin.replace(/\/$/, '');

  // Always allow localhost (any port)
  if (/^http:\/\/localhost(:\d+)?$/.test(o)) return callback(null, true);

  // Always allow Vercel preview/production domains
  if (/\.vercel\.app$/.test(o)) return callback(null, true);

  // Always allow Railway domains
  if (/\.railway\.app$/.test(o)) return callback(null, true);

  // Allow custom domain from FRONTEND_URL (e.g., whatisrecent.com)
  if (process.env.FRONTEND_URL) {
    try {
      const target = new URL(process.env.FRONTEND_URL).origin;
      if (o === target) return callback(null, true);
    } catch { /* ignore bad URL */ }
  }

  console.warn(`[CORS Blocked] Origin "${origin}" not in allowlist`);
  callback(new Error(`CORS: origin ${origin} not allowed`));
};

const corsConfig = { origin: allowedOrigin, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], credentials: true };

// CORS configuration for Express
app.use(cors(corsConfig));

// Parse JSON bodies — increase limit to handle base64 whiteboard snapshots
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure Socket.IO
const io = new Server(server, {
  cors: corsConfig,
  maxHttpBufferSize: 10 * 1024 * 1024 // 10MB — needed for whiteboard snapshot base64
});

// Setup Socket.IO logic
setupSocket(io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check — used by Railway to confirm service is up
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Debug endpoint — test if bcryptjs works
app.get('/api/debug', async (req, res) => {
  try {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash('test', 10);
    res.json({ bcrypt: 'bcryptjs', hashWorks: true, hash: hash.substring(0, 10) + '...' });
  } catch (err) {
    res.json({ bcrypt: 'error', message: err.message });
  }
});

// POST debug — test if POST body parsing works
app.post('/api/debug-post', (req, res) => {
  console.log('[debug-post] Body received:', JSON.stringify(req.body));
  res.json({ received: true, body: req.body, timestamp: new Date().toISOString() });
});

// Database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/interview-platform';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
