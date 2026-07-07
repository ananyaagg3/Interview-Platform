import express from 'express';
import { createRoom, getRoom, getPastSessions, getProblems, getRoomReport, getTurnCredentials, deleteRoom } from '../controllers/roomController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(requireAuth);

router.post('/create', createRoom);
router.get('/past', getPastSessions);
router.get('/problems', getProblems);
router.get('/turn-credentials', getTurnCredentials);
router.get('/:roomId/report', getRoomReport);
router.delete('/:roomId', deleteRoom);
router.get('/:roomId', getRoom);

export default router;
