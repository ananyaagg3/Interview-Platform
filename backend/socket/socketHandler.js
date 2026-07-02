import Room from '../models/Room.js';

const activeRooms = new Map();
const whiteboardEvents = new Map();
const roomMicStates = new Map();
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

    const setRoomMicState = (roomId, userId, muted) => {
      if (!roomId || !userId) return;
      if (!roomMicStates.has(roomId)) {
        roomMicStates.set(roomId, new Map());
      }
      roomMicStates.get(roomId).set(userId, muted);
    };

    const getRoomMicState = (roomId, userId) => {
      if (!roomId || !userId) return false;
      return roomMicStates.get(roomId)?.get(userId) ?? false;
    };

    socket.on('join-room', async ({ roomId, userId, userName }) => {
      try {
        console.log(`[room:${roomId}] join-room from socket=${socket.id} user=${userId} name=${userName}`);
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

        socket.data.roomId = roomId;
        socket.data.userId = userId;
        socket.data.userName = userName;
        socket.data.role = role;
        socket.data.isMicMuted = getRoomMicState(roomId, userId);

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
        const otherSocketIds = clients ? [...clients].filter(id => id !== socket.id) : [];
        if (otherSocketIds.length > 0) {
          const peers = otherSocketIds
            .map(socketId => {
              const peerSocket = io.sockets.sockets.get(socketId);
              if (!peerSocket) return null;
              return {
                socketId,
                userId: peerSocket.data.userId,
                userName: peerSocket.data.userName,
                role: peerSocket.data.role,
                micMuted: getRoomMicState(roomId, peerSocket.data.userId)
              };
            })
            .filter(Boolean);

          console.log(`[room:${roomId}] notifying ${otherSocketIds.length} existing peer(s) about socket=${socket.id}`);
          socket.emit('existing-peers', peers);
          socket.to(roomId).emit('peer-joined', {
            socketId: socket.id,
            userId,
            userName,
            role,
            micMuted: getRoomMicState(roomId, userId)
          });
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
    socket.on('signal', ({ roomId, signalData, to }) => {
      const signalType = signalData?.type || (signalData?.candidate ? 'candidate' : 'unknown');
      console.log(`[room:${roomId}] signal ${signalType} from=${socket.id}${to ? ` to=${to}` : ' broadcast'}`);

      const payload = {
        from: socket.id,
        userId: socket.data.userId,
        userName: socket.data.userName,
        signalData
      };

      if (to && io.sockets.sockets.has(to)) {
        socket.to(to).emit('signal', payload);
        return;
      }

      socket.to(roomId).emit('signal', payload);
    });

    socket.on('mic-muted', ({ roomId }) => {
      if (!roomId || socket.data.roomId !== roomId) return;
      setRoomMicState(roomId, socket.data.userId, true);
      socket.data.isMicMuted = true;
      socket.to(roomId).emit('mic-muted', {
        socketId: socket.id,
        userId: socket.data.userId,
        userName: socket.data.userName
      });
    });

    socket.on('mic-unmuted', ({ roomId }) => {
      if (!roomId || socket.data.roomId !== roomId) return;
      setRoomMicState(roomId, socket.data.userId, false);
      socket.data.isMicMuted = false;
      socket.to(roomId).emit('mic-unmuted', {
        socketId: socket.id,
        userId: socket.data.userId,
        userName: socket.data.userName
      });
    });

    // Change active question event
    socket.on('change-question', async ({ roomId, problemSource, problemId, customProblem }) => {
      try {
        const room = await Room.findOne({ roomId });
        if (room) {
          room.problemSource = problemSource;
          if (problemSource === 'bank') {
            room.problemId = problemId;
            room.customProblem = undefined;
          } else {
            room.problemId = undefined;
            room.customProblem = customProblem;
          }

          // Initialize selectedQuestions if it's undefined
          if (!room.selectedQuestions) {
            room.selectedQuestions = [];
          }

          // Check if this question is already in selectedQuestions
          const alreadyExists = room.selectedQuestions.some(q => {
            if (q.problemSource !== problemSource) return false;
            if (problemSource === 'bank') {
              return q.problemId?.toString() === problemId?.toString();
            } else {
              return q.customProblem?.title === customProblem?.title;
            }
          });

          if (!alreadyExists) {
            room.selectedQuestions.push({
              problemSource,
              problemId: problemSource === 'bank' ? problemId : null,
              customProblem: problemSource === 'custom' ? customProblem : null
            });
          }

          await room.save();

          const updatedRoom = await Room.findOne({ roomId })
            .populate('problemId')
            .populate('selectedQuestions.problemId');

          const problemsToProcess = [];
          if (updatedRoom.problemId) problemsToProcess.push(updatedRoom.problemId);
          if (updatedRoom.selectedQuestions) {
            for (const sq of updatedRoom.selectedQuestions) {
              if (sq.problemSource === 'bank' && sq.problemId) {
                problemsToProcess.push(sq.problemId);
              }
            }
          }
          if (problemsToProcess.length > 0) {
            const { ensureProblemDescriptions } = await import('../controllers/roomController.js');
            await ensureProblemDescriptions(problemsToProcess);
          }

          io.to(roomId).emit('question-changed', {
            problemSource: updatedRoom.problemSource,
            problemId: updatedRoom.problemId,
            customProblem: updatedRoom.customProblem,
            selectedQuestions: updatedRoom.selectedQuestions
          });
        }
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
      if (socket.data.roomId) {
        socket.to(socket.data.roomId).emit('peer-left', {
          socketId: socket.id,
          userId: socket.data.userId,
          userName: socket.data.userName
        });
      }
    });
  });
}

