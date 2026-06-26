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

// Allow any localhost Vite port (5173-5180) in dev, or FRONTEND_URL in production
const allowedOrigin = (origin, callback) => {
  if (!origin) return callback(null, true); // allow non-browser requests (curl, etc.)
  
  const normalizedOrigin = origin.replace(/\/$/, '');
  const targetFrontend = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : null;

  console.log(`[CORS Request] Origin: "${origin}" (Normalized: "${normalizedOrigin}"), Expected FRONTEND_URL: "${process.env.FRONTEND_URL}" (Normalized: "${targetFrontend}")`);

  if (targetFrontend && normalizedOrigin === targetFrontend) {
    return callback(null, true);
  }
  // Allow any localhost port in the Vite range
  if (/^http:\/\/localhost:(517[3-9]|518[0-9])$/.test(normalizedOrigin)) {
    return callback(null, true);
  }
  console.warn(`[CORS Blocked] Origin "${origin}" does not match FRONTEND_URL or localhost`);
  callback(new Error(`CORS: origin ${origin} not allowed`));
};

// CORS configuration for Express
app.use(cors({ origin: allowedOrigin, methods: ['GET', 'POST'], credentials: true }));

// Parse JSON bodies — increase limit to handle base64 whiteboard snapshots
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure Socket.IO
const io = new Server(server, {
  cors: { origin: allowedOrigin, methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 10 * 1024 * 1024 // 10MB — needed for whiteboard snapshot base64
});

// Setup Socket.IO logic
setupSocket(io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/interview-platform';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
