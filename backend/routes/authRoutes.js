import express from 'express';
import { signup, login, forgotPassword, resetPassword, updateProfile, getMe } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.put('/profile', requireAuth, updateProfile);
router.get('/me', requireAuth, getMe);

export default router;

