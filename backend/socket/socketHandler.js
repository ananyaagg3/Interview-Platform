import Room from '../models/Room.js';

const activeRooms = new Map();
const whiteboardEvents = new Map();
let ioInstance = null;

export const getIo = () => ioInstance;

export default function setupSocket(io) {
  ioInstance = io;

  // Global timer interval that emits timer-update every second for active rooms
  setInterval(() => {
    for (const [roomId, startTime] of activeRooms.entries()) {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      io.to(roomId).emit('timer-update', elapsedSeconds);
    }
  }, 1000);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join-room', async ({ roomId, userId, userName }) => {
      try {
        const room = await Room.findOne({ roomId });
        if (!room) {
          socket.emit('error', 'Room not found');
          return;
        }

        let role = '';
        if (room.interviewerId.toString() === userId) {
          role = 'Interviewer';
          socket.join(roomId);
        } else if (!room.candidateId || room.candidateId.toString() === userId) {
          if (!room.candidateId) {
            room.candidateId = userId;
          }
          role = 'Candidate';
          socket.join(roomId);
        } else {
          socket.emit('error', 'Room is full');
          return;
        }

        if (room.interviewerId && room.candidateId && room.status === 'waiting') {
          room.status = 'active';
          room.sessionStartedAt = new Date();
          activeRooms.set(roomId, room.sessionStartedAt.getTime());
          io.to(roomId).emit('status-update', 'active');
        } else if (room.status === 'active' && !activeRooms.has(roomId)) {
          // Server restarted or memory cleared
          activeRooms.set(roomId, room.sessionStartedAt.getTime());
        }

        await room.save();

        socket.emit('room-state', {
          currentCode: room.currentCode,
          currentLanguage: room.currentLanguage,
          sessionStartedAt: room.sessionStartedAt,
          status: room.status,
          role
        });

        // Send current whiteboard history to the socket
        socket.emit('whiteboard-history', whiteboardEvents.get(roomId) || []);

        // If there is another client in the room, notify them to initiate WebRTC
        const clients = io.sockets.adapter.rooms.get(roomId);
        if (clients && clients.size > 1) {
          socket.to(roomId).emit('peer-joined', { userId, userName });
        }

      } catch (err) {
        console.error(err);
        socket.emit('error', 'Server error joining room');
      }
    });

    socket.on('code-change', async ({ roomId, code, language }) => {
      // Broadcast to others in the room
      socket.to(roomId).emit('code-change', { code, language });
      // Update DB asynchronously
      Room.updateOne({ roomId }, { currentCode: code, currentLanguage: language }).catch(console.error);
    });

    // Whiteboard drawing event
    socket.on('whiteboard-draw', ({ roomId, event }) => {
      if (!whiteboardEvents.has(roomId)) {
        whiteboardEvents.set(roomId, []);
      }
      whiteboardEvents.get(roomId).push(event);
      socket.to(roomId).emit('whiteboard-draw', event);
    });

    // Whiteboard clear event
    socket.on('whiteboard-clear', ({ roomId }) => {
      whiteboardEvents.set(roomId, []);
      io.to(roomId).emit('whiteboard-clear');
    });

    // WebRTC signaling
    socket.on('signal', ({ roomId, signalData }) => {
      socket.to(roomId).emit('signal', signalData);
    });

    // Change active question event
    socket.on('change-question', async ({ roomId, problemSource, problemId, customProblem }) => {
      try {
        const updateData = { problemSource };
        if (problemSource === 'bank') {
          updateData.problemId = problemId;
          updateData.customProblem = null;
        } else {
          updateData.problemId = null;
          updateData.customProblem = customProblem;
        }

        await Room.updateOne({ roomId }, updateData);
        const updatedRoom = await Room.findOne({ roomId }).populate('problemId');
        io.to(roomId).emit('question-changed', {
          problemSource: updatedRoom.problemSource,
          problemId: updatedRoom.problemId,
          customProblem: updatedRoom.customProblem
        });
      } catch (err) {
        console.error("Socket change-question error:", err);
      }
    });

    socket.on('end-session', async ({ roomId, notes, whiteboardSnapshot }) => {
      try {
        const room = await Room.findOne({ roomId });
        if (room && room.status !== 'ended') {
          room.status = 'ended';
          room.sessionEndedAt = new Date();
          room.interviewerNotes = notes || "";
          room.whiteboardSnapshot = whiteboardSnapshot || null;
          await room.save();
          activeRooms.delete(roomId);
          whiteboardEvents.delete(roomId); // Clean up in-memory whiteboard history
          io.to(roomId).emit('session-ended');

          // Asynchronously trigger AI feedback generation using dynamic import
          import('../controllers/roomController.js').then(({ generateFeedbackReport }) => {
            generateFeedbackReport(roomId).catch(console.error);
          });
        }
      } catch (err) {
        console.error(err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}

