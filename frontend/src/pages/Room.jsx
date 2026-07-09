import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { socket } from '../utils/socket';
import { apiFetch } from '../utils/api';
import Editor from '@monaco-editor/react';
import Peer from 'simple-peer';
import Whiteboard from '../components/Whiteboard';
import Markdown from '../components/Markdown';
import { Video, VideoOff, Mic, MicOff, AlertCircle, Play, Sparkles, X } from 'lucide-react';

// ─── localStorage helpers for room state persistence ───────────────────────
const ROOM_STATE_KEY = (id) => `room_state_${id}`;

export default function Room() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Restore persisted state from localStorage on first render
  const getPersistedRoomState = () => {
    try {
      const raw = localStorage.getItem(ROOM_STATE_KEY(roomId));
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  };
  const persisted = getPersistedRoomState();

  const [room, setRoom] = useState(null);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('waiting');
  const [code, setCode] = useState(persisted?.code || '');
  const [language, setLanguage] = useState(persisted?.language || 'javascript');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [disconnected, setDisconnected] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // If we have persisted state (user already joined this room), skip the preview screen
  const [hasJoined, setHasJoined] = useState(Boolean(persisted?.hasJoined));
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [micVolume, setMicVolume] = useState(0);
  const [iceServers, setIceServers] = useState([{ urls: 'stun:stun.l.google.com:19302' }]);
  const [turnLoaded, setTurnLoaded] = useState(false);
  const [videoStatus, setVideoStatus] = useState('waiting');
  const [remoteUserName, setRemoteUserName] = useState('');
  const [activeTab, setActiveTab] = useState('code');

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);

  const [notes, setNotes] = useState(persisted?.notes || '');
  const [viewedQuestionIndex, setViewedQuestionIndex] = useState(0);

  useEffect(() => {
    if (!room || !room.selectedQuestions) return;
    const activeIdx = room.selectedQuestions.findIndex(q => {
      return (q.problemSource === 'bank' && room.problemSource === 'bank' &&
              (q.problemId?._id?.toString() === room.problemId?._id?.toString() || q.problemId?.toString() === room.problemId?.toString() || q.problemId?._id === room.problemId)) ||
             (q.problemSource === 'custom' && room.problemSource === 'custom' &&
              q.customProblem?.title === room.customProblem?.title);
    });
    if (activeIdx !== -1) {
      setViewedQuestionIndex(activeIdx);
    }
  }, [room?.problemId, room?.customProblem, room?.selectedQuestions]);

  const [showChangeQuestionModal, setShowChangeQuestionModal] = useState(false);
  const [problems, setProblems] = useState([]);
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [modalActiveTab, setModalActiveTab] = useState('bank');

  const editorRef = useRef(null);
  const isRemoteChange = useRef(false);
  const roomFetched = useRef(false);
  const localStreamRef = useRef(null);
  const iceServersRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);
  const isMutedRef = useRef(false);
  const remoteParticipantRef = useRef({ socketId: null, userId: null });

  const peerRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const pendingSignalsRef = useRef([]);
  const reconnectTimerRef = useRef(null);
  const whiteboardCanvasRef = useRef(null);
  // DOM refs for video elements — avoids stale srcObject on re-render
  const localVideoDomRef = useRef(null);
  const remoteVideoDomRef = useRef(null);
  // Flag: when hasJoined is restored from localStorage but stream wasn't ready yet,
  // we set this so WebRTC is initiated once the stream arrives
  const pendingRejoinPeerRef = useRef(false);

  const setRemoteParticipant = useCallback(({ socketId = null, userId = null, userName = '' } = {}) => {
    remoteParticipantRef.current = { socketId, userId };
    if (socketId) {
      remoteSocketIdRef.current = socketId;
    }
    if (userName) {
      setRemoteUserName(userName);
    }
    console.log('[RemoteMic] tracking remote participant', { socketId, userId, userName });
  }, []);

  const syncLocalMicState = useCallback((muted) => {
    const eventName = muted ? 'participant-mic-muted' : 'participant-mic-unmuted';
    const payload = { roomId };
    console.log('[RemoteMic] Socket event emitted', { eventName, payload });
    socket.emit(eventName, payload);
  }, [roomId]);

  useEffect(() => {
    if (isRemoteMuted) {
      console.log('[RemoteMic] Remote mute icon rendered', { isRemoteMuted });
    }
  }, [isRemoteMuted]);

  useEffect(() => {
    if (roomFetched.current) return;
    roomFetched.current = true;

    const fetchRoom = async () => {
      try {
        const data = await apiFetch(`/rooms/${roomId}`);
        setRoom(data.room);
        setLanguage(data.room.currentLanguage || data.room.defaultLanguage);
      } catch {
        setError('Room not found');
      }
    };
    fetchRoom();
  }, [roomId]);

  useEffect(() => {
    const fetchTurn = async () => {
      try {
        const turnData = await apiFetch('/rooms/turn-credentials');
        if (turnData.iceServers && turnData.iceServers.length > 0) {
          setIceServers(turnData.iceServers);
        }
      } catch (err) {
        console.error('Error fetching TURN credentials, using STUN fallback:', err);
      } finally {
        setTurnLoaded(true);
      }
    };
    if (hasJoined) {
      fetchTurn();
    }
  }, [hasJoined]);

  const getSignalType = (signalData) => {
    if (!signalData) return 'unknown';
    return signalData.type || (signalData.candidate ? 'candidate' : 'unknown');
  };

  const destroyPeer = useCallback((reason = 'cleanup') => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const peer = peerRef.current;
    if (peer) {
      console.log(`[WebRTC] Destroying peer: ${reason}`);
      peer.removeAllListeners();
      peer.destroy();
      peerRef.current = null;
    }

    pendingSignalsRef.current = [];
    remoteParticipantRef.current = { socketId: null, userId: null };
    remoteSocketIdRef.current = null;
    setRemoteStream(null);
    setIsRemoteMuted(false);
    setVideoStatus('waiting');
  }, []);

  const initiatePeer = useCallback((initiator, targetSocketId = remoteSocketIdRef.current) => {
    const currentStream = localStreamRef.current;
    if (!currentStream) {
      console.warn('[WebRTC] initiatePeer called before local media was ready');
      return null;
    }

    if (!targetSocketId) {
      console.warn('[WebRTC] initiatePeer called without a target socket id');
    }

    if (peerRef.current && !peerRef.current.destroyed) {
      destroyPeer('new negotiation starting');
    }

    remoteSocketIdRef.current = targetSocketId;
    setVideoStatus('reconnecting');

    console.log('[WebRTC] Creating peer', {
      initiator,
      targetSocketId,
      iceServers: iceServersRef.current,
      audioTracks: currentStream.getAudioTracks().length,
      videoTracks: currentStream.getVideoTracks().length
    });

    const peer = new Peer({
      initiator,
      trickle: true,
      config: { iceServers: iceServersRef.current },
      stream: currentStream
    });

    peer.on('signal', (data) => {
      console.log(`[WebRTC] Local signal generated: ${getSignalType(data)}`, { to: remoteSocketIdRef.current });
      socket.emit('signal', { roomId, to: remoteSocketIdRef.current, signalData: data });
    });

    peer.on('stream', (stream) => {
      console.log('[WebRTC] Remote stream received', {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length
      });
      setRemoteStream(stream);
      setVideoStatus('connected');
    });

    peer.on('track', (track, stream) => {
      console.log(`[WebRTC] Remote track received: ${track.kind}`, { streamId: stream?.id });
    });

    peer.on('connect', () => {
      console.log('[WebRTC] Data channel connected');
      setVideoStatus('connected');
    });

    peer.on('close', () => {
      console.log('[WebRTC] Peer closed connection');
      if (peerRef.current === peer) {
        peerRef.current = null;
      }
      setRemoteStream(null);
      setIsRemoteMuted(false);
      setVideoStatus('reconnecting');
    });

    peer.on('error', (err) => {
      console.error('[WebRTC] Peer connection error:', err);
      if (peerRef.current === peer) {
        peerRef.current = null;
      }
      setRemoteStream(null);
      setIsRemoteMuted(false);
      setVideoStatus('reconnecting');
    });

    const pc = peer._pc;
    if (pc) {
      pc.addEventListener('connectionstatechange', () => {
        console.log(`[WebRTC] connectionState=${pc.connectionState}`);
        if (pc.connectionState === 'connected') setVideoStatus('connected');
        if (['failed', 'disconnected'].includes(pc.connectionState)) setVideoStatus('reconnecting');
      });
      pc.addEventListener('iceconnectionstatechange', () => {
        console.log(`[WebRTC] iceConnectionState=${pc.iceConnectionState}`);
      });
      pc.addEventListener('signalingstatechange', () => {
        console.log(`[WebRTC] signalingState=${pc.signalingState}`);
      });
      pc.addEventListener('icegatheringstatechange', () => {
        console.log(`[WebRTC] iceGatheringState=${pc.iceGatheringState}`);
      });
    }

    peerRef.current = peer;
    return peer;
  }, [destroyPeer, roomId]);

  // Preview screen: request camera with mic volume analyser
  useEffect(() => {
    if (hasJoined) return;

    let audioContext = null;
    let analyser = null;
    let animationFrameId = null;

    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        setPermissionGranted(true);
        setPermissionError('');

        try {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioContext.createMediaStreamSource(stream);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          const checkVolume = () => {
            if (!analyser) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i];
            }
            const average = sum / bufferLength;
            setMicVolume(average);
            animationFrameId = requestAnimationFrame(checkVolume);
          };
          checkVolume();
        } catch (audioErr) {
          console.error('Audio analyser failed:', audioErr);
        }
      } catch (err) {
        console.error('Permission error:', err);
        setPermissionGranted(false);
        setPermissionError('Camera and microphone access is required to join this session');
      }
    };

    getMedia();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (audioContext) audioContext.close();
    };
  }, [hasJoined]);

  // Refresh/rejoin case: hasJoined is restored from localStorage as true,
  // but the camera stream was lost — request it again silently.
  useEffect(() => {
    if (!hasJoined) return; // handled by preview effect above
    if (localStreamRef.current) return; // already have a stream

    // Mark that we need to initiate the peer connection once the stream is ready
    pendingRejoinPeerRef.current = true;

    const getMediaForRejoin = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        setPermissionGranted(true);
        console.log('[Refresh] Camera/mic re-acquired after page refresh');
      } catch (err) {
        console.warn('[Refresh] Could not re-acquire camera/mic after refresh:', err);
        pendingRejoinPeerRef.current = false;
        // Still allow the room to work without video — audio-only or view-only
        setPermissionGranted(false);
      }
    };

    getMediaForRejoin();
  }, [hasJoined]);

  // Stable DOM ref callbacks — the actual stream assignment is done via useEffect below
  const localVideoRef = useCallback((node) => {
    localVideoDomRef.current = node;
    if (node && localStream) {
      node.srcObject = localStream;
      node.play().catch(() => {});
    }
  }, [localStream]);

  const remoteVideoRef = useCallback((node) => {
    remoteVideoDomRef.current = node;
    if (node && remoteStream) {
      node.srcObject = remoteStream;
      node.play().catch(() => {});
    }
  }, [remoteStream]);

  // Keep video srcObject in sync whenever streams change (handles cases where DOM node
  // persists across renders but the stream object itself is replaced)
  useEffect(() => {
    const node = localVideoDomRef.current;
    if (!node) return;
    if (localStream && !isCameraOff) {
      if (node.srcObject !== localStream) {
        node.srcObject = localStream;
        node.play().catch(() => {});
      }
    } else {
      node.srcObject = null;
    }
  }, [localStream, isCameraOff]);

  useEffect(() => {
    const node = remoteVideoDomRef.current;
    if (!node) return;
    if (remoteStream) {
      if (node.srcObject !== remoteStream) {
        node.srcObject = remoteStream;
        node.play().catch(() => {});
      }
    } else {
      node.srcObject = null;
    }
  }, [remoteStream]);

  useEffect(() => {
    localStreamRef.current = localStream;
    // If we were waiting for a stream (back-button rejoin) and the socket is
    // already connected, re-emit join-room so the server re-advertises us
    // and triggers the peer-joined / existing-peers flow.
    if (localStream && pendingRejoinPeerRef.current && socket.connected) {
      pendingRejoinPeerRef.current = false;
      console.log('[Refresh] Stream ready — re-emitting join-room for peer renegotiation');
      socket.emit('join-room', { roomId, userId: user?.id, userName: user?.name });
    }
  }, [localStream, roomId, user]);

  useEffect(() => {
    iceServersRef.current = iceServers;
  }, [iceServers]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  // Persist room state to localStorage so refreshing the page restores it
  const persistRoomState = useCallback((updates) => {
    try {
      const existing = (() => {
        try { return JSON.parse(localStorage.getItem(ROOM_STATE_KEY(roomId)) || '{}'); } catch { return {}; }
      })();
      localStorage.setItem(ROOM_STATE_KEY(roomId), JSON.stringify({ ...existing, ...updates }));
    } catch { /* ignore quota errors */ }
  }, [roomId]);

  // Clear persisted room state (on leave or session end)
  const clearRoomState = useCallback(() => {
    try { localStorage.removeItem(ROOM_STATE_KEY(roomId)); } catch { /* ignore */ }
  }, [roomId]);

  useEffect(() => {
    if (!room || !hasJoined || !turnLoaded) return;

    const joinRoom = () => {
      console.log('[Socket] Joining room', { roomId, userId: user.id, userName: user.name });
      socket.emit('join-room', { roomId, userId: user.id, userName: user.name });
    };

    const onRoomState = (state) => {
      console.log('[Socket] room-state received', state);
      if (state.currentCode) {
        isRemoteChange.current = true;
        setCode(state.currentCode);
        persistRoomState({ code: state.currentCode });
      }
      if (state.currentLanguage) {
        setLanguage(state.currentLanguage);
        persistRoomState({ language: state.currentLanguage });
      }
      setStatus(state.status);
      setRole(state.role);
      if (typeof state.isMicMuted === 'boolean') {
        setIsMuted(state.isMicMuted);
      }
    };

    const onCodeChange = ({ code: newCode, language: newLang }) => {
      isRemoteChange.current = true;
      setCode(newCode);
      setLanguage(newLang);
      // Persist server code changes so refresh shows the latest code
      persistRoomState({ code: newCode, language: newLang });
    };

    const onTimerUpdate = (seconds) => {
      setElapsed(seconds);
    };

    const onStatusUpdate = (newStatus) => {
      setStatus(newStatus);
    };

    const onQuestionChanged = ({ problemSource, problemId, customProblem, selectedQuestions }) => {
      setRoom(prev => ({
        ...prev,
        problemSource,
        problemId,
        customProblem,
        selectedQuestions: selectedQuestions || prev.selectedQuestions
      }));
    };

    const onSessionEnded = () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      destroyPeer('session ended');
      clearRoomState();
      navigate(`/report/${roomId}`);
    };

    const onExistingPeers = (peers = []) => {
      console.log('[Socket] existing-peers received', peers);
      const [peer] = peers;
      if (!peer) return;
      setRemoteParticipant({ socketId: peer.socketId, userId: peer.userId, userName: peer.userName || 'Peer' });
      console.log('[RemoteMic] Remote React state updated from existing peer', { micMuted: Boolean(peer.micMuted) });
      setIsRemoteMuted(Boolean(peer.micMuted));
      // Clear any pending signals from a previous connection cycle
      pendingSignalsRef.current = [];
      setVideoStatus('reconnecting');
      // Do NOT initiate here — the existing peer (who receives peer-joined) will
      // call initiatePeer(true, ...) which sends an offer. We act as the answerer.
    };

    const onPeerJoined = ({ socketId, userId, userName: peerName, micMuted }) => {
      console.log('[Socket] peer-joined received', { socketId, userId, peerName, micMuted });
      if (!socketId) return;
      setRemoteParticipant({ socketId, userId, userName: peerName || 'Peer' });
      pendingSignalsRef.current = [];
      console.log('[RemoteMic] Remote React state updated from peer join', { micMuted: Boolean(micMuted) });
      setIsRemoteMuted(Boolean(micMuted));
      setVideoStatus('reconnecting');

      reconnectTimerRef.current = setTimeout(() => {
        initiatePeer(true, socketId);
      }, 150);
    };

    const onSignal = (payload) => {
      const signalData = payload?.signalData || payload;
      const from = payload?.from;
      const signalType = getSignalType(signalData);

      console.log('[WebRTC] Remote signal received', { from, signalType });

      if (!signalData) return;
      if (from) {
        if (remoteSocketIdRef.current && remoteSocketIdRef.current !== from) {
          console.warn('[WebRTC] Ignoring signal from non-active peer', { from, activePeer: remoteSocketIdRef.current });
          return;
        }
        setRemoteParticipant({ socketId: from, userId: payload.userId, userName: payload.userName });
      }

      let peer = peerRef.current;
      if (!peer || peer.destroyed) {
        if (signalData.type !== 'offer') {
          console.log('[WebRTC] Queueing signal until offer creates the peer', { signalType });
          pendingSignalsRef.current.push(signalData);
          return;
        }
        peer = initiatePeer(false, from || remoteSocketIdRef.current);
      }

      if (!peer || peer.destroyed) return;

      try {
        peer.signal(signalData);
        const queuedSignals = pendingSignalsRef.current.splice(0);
        queuedSignals.forEach((queuedSignal) => {
          console.log('[WebRTC] Applying queued signal', { signalType: getSignalType(queuedSignal) });
          peer.signal(queuedSignal);
        });
      } catch (err) {
        console.error('[WebRTC] Error applying signal:', err);
      }
    };

    const onPeerLeft = ({ socketId, userId }) => {
      console.log('[Socket] peer-left received', { socketId, userId });
      const tracked = remoteParticipantRef.current;
      if (!socketId || socketId === tracked.socketId || (userId && userId === tracked.userId)) {
        destroyPeer('remote peer left');
      }
    };

    const matchesRemoteParticipant = ({ socketId, userId }) => {
      const tracked = remoteParticipantRef.current;
      if (tracked.socketId && socketId && tracked.socketId === socketId) return true;
      if (tracked.userId && userId && tracked.userId === userId) return true;
      return !tracked.socketId && !tracked.userId;
    };

    const onParticipantMicMuted = ({ socketId, userId, userName, muted }) => {
      console.log('[RemoteMic] Socket event received', { eventName: 'participant-mic-muted', socketId, userId, userName, muted });
      if (!matchesRemoteParticipant({ socketId, userId })) return;
      setRemoteParticipant({ socketId, userId, userName });
      console.log('[RemoteMic] Remote React state updated', { isRemoteMuted: true });
      setIsRemoteMuted(true);
    };

    const onParticipantMicUnmuted = ({ socketId, userId, userName, muted }) => {
      console.log('[RemoteMic] Socket event received', { eventName: 'participant-mic-unmuted', socketId, userId, userName, muted });
      if (!matchesRemoteParticipant({ socketId, userId })) return;
      setRemoteParticipant({ socketId, userId, userName });
      console.log('[RemoteMic] Remote React state updated', { isRemoteMuted: false });
      setIsRemoteMuted(false);
    };

    const onError = (msg) => {
      setError(msg);
      if (msg === 'Room not found' || msg === 'Room is full') {
        setTimeout(() => navigate('/dashboard'), 2000);
      }
    };

    const onDisconnect = () => {
      console.warn('[Socket] disconnected');
      setDisconnected(true);
      destroyPeer('socket disconnected');
    };

    const onConnect = () => {
      console.log('[Socket] connected / reconnected');
      setDisconnected(false);
      joinRoom();
      // Re-broadcast mic state after reconnection so remote sees correct status
      if (isMutedRef.current) {
        socket.emit('participant-mic-muted', { roomId });
      }
    };

    socket.on('room-state', onRoomState);
    socket.on('code-change', onCodeChange);
    socket.on('timer-update', onTimerUpdate);
    socket.on('status-update', onStatusUpdate);
    socket.on('question-changed', onQuestionChanged);
    socket.on('session-ended', onSessionEnded);
    socket.on('existing-peers', onExistingPeers);
    socket.on('peer-joined', onPeerJoined);
    socket.on('signal', onSignal);
    socket.on('peer-left', onPeerLeft);
    socket.on('participant-mic-muted', onParticipantMicMuted);
    socket.on('participant-mic-unmuted', onParticipantMicUnmuted);
    socket.on('error', onError);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    if (socket.connected) {
      joinRoom();
    } else {
      socket.connect();
    }

    return () => {
      socket.off('room-state', onRoomState);
      socket.off('code-change', onCodeChange);
      socket.off('timer-update', onTimerUpdate);
      socket.off('status-update', onStatusUpdate);
      socket.off('question-changed', onQuestionChanged);
      socket.off('session-ended', onSessionEnded);
      socket.off('existing-peers', onExistingPeers);
      socket.off('peer-joined', onPeerJoined);
      socket.off('signal', onSignal);
      socket.off('peer-left', onPeerLeft);
      socket.off('participant-mic-muted', onParticipantMicMuted);
      socket.off('participant-mic-unmuted', onParticipantMicUnmuted);
      socket.off('error', onError);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
      destroyPeer('room component cleanup');
      // NOTE: Do NOT call socket.disconnect() here — the socket is a module-level
      // singleton. Disconnecting it prevents reconnection on back-button rejoin.
      // The socket will naturally disconnect/reconnect through its own lifecycle.
    };
  }, [roomId, hasJoined, turnLoaded, initiatePeer, destroyPeer, setRemoteParticipant, navigate, syncLocalMicState, user.id, user.name, persistRoomState, clearRoomState]);

  useEffect(() => {
    if (!hasJoined || !socket.connected) return;
    syncLocalMicState(isMuted);
  }, [hasJoined, isMuted, syncLocalMicState]);

  // Stop media tracks and destroy WebRTC on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      destroyPeer('component unmounted');
    };
  }, [destroyPeer]);

  // Handle browser back-button / page close without going through End Session.
  // Gracefully disconnect the socket so the server emits `peer-left` immediately.
  useEffect(() => {
    if (!hasJoined) return;

    const handleBeforeUnload = () => {
      // Use sendBeacon-compatible disconnect: tell socket to disconnect immediately
      // so the server's disconnect handler fires fast instead of waiting for the
      // socket timeout (which causes the stale-peer glitch on rejoin).
      if (socket.connected) {
        socket.disconnect();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    // pagehide fires on mobile / bfcache scenarios
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [hasJoined]);

  const handleEditorChange = useCallback((value) => {
    if (isRemoteChange.current) {
      isRemoteChange.current = false;
      return;
    }
    setCode(value);
    socket.emit('code-change', { roomId, code: value, language });
    persistRoomState({ code: value });
  }, [roomId, language, persistRoomState]);

  const handleLanguageChange = useCallback((e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    socket.emit('code-change', { roomId, code, language: newLang });
    persistRoomState({ language: newLang });
  }, [roomId, code, persistRoomState]);

  const handleEndSession = () => {
    setShowEndConfirm(true);
  };

  const handleLeaveSession = () => {
    setShowLeaveConfirm(true);
  };

  const openChangeQuestionModal = async () => {
    setShowChangeQuestionModal(true);
    if (problems.length === 0) {
      try {
        const data = await apiFetch('/rooms/problems');
        setProblems(data.problems);
      } catch (err) {
        console.error('Failed to load problems in Room:', err);
      }
    }
  };

  const handleChangeQuestionConfirm = () => {
    if (modalActiveTab === 'bank') {
      if (!selectedProblem) return;
      socket.emit('change-question', {
        roomId,
        problemSource: 'bank',
        problemId: selectedProblem._id
      });
    } else {
      if (!customTitle.trim() || !customDesc.trim()) return;
      socket.emit('change-question', {
        roomId,
        problemSource: 'custom',
        customProblem: { title: customTitle, description: customDesc }
      });
    }
    setSelectedProblem(null);
    setCustomTitle('');
    setCustomDesc('');
    setShowChangeQuestionModal(false);
  };

  const filteredProblems = problems.filter(p => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (topicFilter && p.topic !== topicFilter) return false;
    if (difficultyFilter && p.difficulty !== difficultyFilter) return false;
    return true;
  });

  const topics = [...new Set(problems.map(p => p.topic))];

  const confirmEndSession = () => {
    setShowEndConfirm(false);
    clearRoomState();
    const canvas = whiteboardCanvasRef.current;
    const whiteboardSnapshot = canvas ? canvas.toDataURL('image/png') : null;
    socket.emit('end-session', {
      roomId,
      notes,
      whiteboardSnapshot
    });
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const nextMuted = !audioTrack.enabled;
        console.log('[RemoteMic] Local user muted toggle', { nextMuted, trackEnabled: audioTrack.enabled });
        setIsMuted(nextMuted);
      }
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center border border-red-100">
          <AlertCircle size={28} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">{error === 'Room not found' ? 'Session Not Found' : 'Something went wrong'}</h2>
        <p className="text-sm text-gray-500 text-center max-w-xs">
          {error === 'Room not found'
            ? 'This interview session has ended or is no longer available.'
            : error}
        </p>
        <button
          onClick={() => { clearRoomState(); navigate('/dashboard'); }}
          className="mt-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition cursor-pointer"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!room) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;

  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-6 select-none font-sans">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-lg w-full overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 to-red-500" />

          <div className="p-8 flex flex-col items-center">
            <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mb-4 border border-orange-100">
              <Sparkles size={24} className="animate-pulse" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">Before you join</h2>
            <p className="text-sm text-gray-500 text-center mb-6">
              Confirm your camera and microphone are working correctly.
            </p>

            <div className="w-full aspect-video bg-gray-900 rounded-xl relative overflow-hidden mb-5 border border-gray-800 shadow-inner flex items-center justify-center">
              {permissionGranted && localStream ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center p-4">
                  {permissionError ? (
                    <div className="flex flex-col items-center text-red-400 gap-2">
                      <AlertCircle size={32} />
                      <span className="text-xs font-semibold max-w-[280px] leading-relaxed">{permissionError}</span>
                    </div>
                  ) : (
                    <div className="text-gray-400 text-xs font-medium animate-pulse flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                      Requesting camera & microphone access...
                    </div>
                  )}
                </div>
              )}
            </div>

            {permissionGranted && (
              <div className="w-full mb-6">
                <div className="flex justify-between items-center text-xs font-semibold text-gray-500 mb-1">
                  <span>Microphone Volume</span>
                  <span className="text-[10px] text-gray-400 font-mono">Test by speaking</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-75"
                    style={{ width: `${Math.min(100, micVolume * 3.5)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="w-full flex flex-col gap-2">
              <button
                disabled={!permissionGranted}
                onClick={() => { setHasJoined(true); persistRoomState({ hasJoined: true }); }}
                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition duration-200 shadow-sm ${
                  permissionGranted
                    ? 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white cursor-pointer'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                Join Session <Play size={16} fill="currentColor" />
              </button>

              {!permissionGranted && permissionError && (
                <>
                  <button
                    onClick={() => { setHasJoined(true); persistRoomState({ hasJoined: true }); }}
                    className="w-full py-2.5 bg-orange-50 border border-orange-200 text-orange-700 font-semibold text-xs rounded-xl hover:bg-orange-100 active:bg-orange-200 transition cursor-pointer"
                  >
                    Join without Camera
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold text-xs rounded-xl hover:bg-gray-50 active:bg-gray-100 transition cursor-pointer"
                  >
                    Retry Permissions
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const targetDuration = room.duration || 45;
  const remoteUserLabel = () => {
    if (role === 'Interviewer') {
      return `${room.candidateId?.name || remoteUserName || 'Candidate'} (Candidate)`;
    }
    return `${room.interviewerId?.name || remoteUserName || 'Interviewer'} (Interviewer)`;
  };

  const getViewedQuestion = () => {
    if (!room) return null;
    if (room.selectedQuestions && room.selectedQuestions.length > 0 && viewedQuestionIndex >= 0 && viewedQuestionIndex < room.selectedQuestions.length) {
      const q = room.selectedQuestions[viewedQuestionIndex];
      return q.problemSource === 'bank' ? q.problemId : q.customProblem;
    }
    return room.problemSource === 'bank' ? room.problemId : room.customProblem;
  };

  const viewedQ = getViewedQuestion();
  const isViewedQBank = room?.selectedQuestions && room.selectedQuestions.length > 0 && viewedQuestionIndex >= 0 && viewedQuestionIndex < room.selectedQuestions.length
    ? room.selectedQuestions[viewedQuestionIndex].problemSource === 'bank'
    : room?.problemSource === 'bank';

  const handleTabClick = (idx, q) => {
    setViewedQuestionIndex(idx);
    if (role === 'Interviewer') {
      socket.emit('change-question', {
        roomId,
        problemSource: q.problemSource,
        problemId: q.problemSource === 'bank' ? (q.problemId?._id || q.problemId) : undefined,
        customProblem: q.problemSource === 'custom' ? q.customProblem : undefined
      });
    }
  };

  const renderMuteIndicator = () => (
    <div className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow">
      <MicOff size={10} />
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-white select-none font-sans">
      {disconnected && (
        <div className="bg-yellow-100 text-yellow-800 text-sm text-center py-2 font-semibold">
          Connection lost - attempting to reconnect...
        </div>
      )}

      <header className="h-14 border-b border-gray-200 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-800">Room: {roomId}</span>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${status === 'active' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
            {status.toUpperCase()}
          </span>
        </div>

        <div className="font-mono text-gray-700 font-semibold flex items-center gap-2">
          {status === 'active' ? (
            <span className={elapsed >= targetDuration * 60 ? 'text-red-500' : ''}>
              {formatTime(elapsed)} / {targetDuration}:00
            </span>
          ) : (
            <span className="text-xs text-gray-500 font-sans">Waiting for candidate...</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${role === 'Interviewer' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-purple-50 text-purple-700 border border-purple-200'}`}>
            {role}
          </span>
          {role === 'Interviewer' ? (
            <button
              onClick={handleEndSession}
              className="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm transition cursor-pointer"
            >
              End Session
            </button>
          ) : (
            <button
              onClick={handleLeaveSession}
              className="bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 text-xs font-bold px-4 py-2 rounded-xl border border-gray-300 shadow-sm transition cursor-pointer"
            >
              Leave Room
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[30%] border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 flex flex-col">
            {room.selectedQuestions && room.selectedQuestions.length > 1 && (
              <div className="flex border-b border-gray-200 mb-4 overflow-x-auto scrollbar-none shrink-0 gap-1 pr-1">
                {room.selectedQuestions.map((q, idx) => {
                  const isRoomActive = (q.problemSource === 'bank' && room.problemSource === 'bank' &&
                                        (q.problemId?._id?.toString() === room.problemId?._id?.toString() || q.problemId?.toString() === room.problemId?.toString() || q.problemId?._id === room.problemId)) ||
                                       (q.problemSource === 'custom' && room.problemSource === 'custom' &&
                                        q.customProblem?.title === room.customProblem?.title);

                  const qDetails = q.problemSource === 'bank'
                    ? { title: q.problemId?.title || 'Loading...', topic: q.problemId?.topic || '' }
                    : { title: q.customProblem?.title || 'Custom Problem', topic: 'Custom' };

                  const isViewed = viewedQuestionIndex === idx;

                  return (
                    <button
                      key={idx}
                      onClick={() => handleTabClick(idx, q)}
                      className={`px-3 py-2 text-xs font-semibold rounded-t-xl transition-all cursor-pointer border-t border-x -mb-[1px] whitespace-nowrap flex items-center gap-1.5 ${
                        isViewed
                          ? 'bg-white border-gray-200 text-orange-600 font-bold border-b-white'
                          : 'bg-gray-100/50 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 border-b-gray-200'
                      }`}
                    >
                      <span>Q{idx + 1}: {qDetails.title.length > 12 ? qDetails.title.substring(0, 12) + '...' : qDetails.title}</span>
                      {isRoomActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 ring-2 ring-green-100 animate-pulse" title="Active Question" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <h2 className="text-lg font-bold text-gray-950 mb-2">
              {viewedQ?.title || 'No Question Selected'}
            </h2>
            {isViewedQBank && viewedQ && (
              <div className="flex gap-1.5 mb-4 shrink-0">
                <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">{viewedQ.topic}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${viewedQ.difficulty === 'Easy' ? 'bg-green-100 text-green-700' : viewedQ.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                  {viewedQ.difficulty}
                </span>
              </div>
            )}
            <div className="text-gray-800 text-sm leading-relaxed flex-1">
              <Markdown content={viewedQ?.description} />
            </div>
            {role === 'Interviewer' && (
              <button
                onClick={openChangeQuestionModal}
                className="mt-6 w-full py-2 bg-orange-50 hover:bg-orange-100 active:bg-orange-200 text-orange-600 font-semibold text-xs rounded-xl border border-orange-200 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shrink-0"
              >
                Change/Switch Question
              </button>
            )}
          </div>

          {role === 'Interviewer' && (
            <div className="border-t border-gray-200 bg-white p-4 shrink-0 flex flex-col">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Your Notes (private)</label>
              <textarea
                className="w-full h-32 border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-orange-500 resize-none font-sans text-gray-800 shadow-inner"
                placeholder="Write down observations, coding design critique, etc. Candidate will not see this."
                value={notes}
                onChange={(e) => { setNotes(e.target.value); persistRoomState({ notes: e.target.value }); }}
              />
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col bg-white">
          <div className="h-11 border-b border-gray-200 bg-gray-50 flex items-center px-4 shrink-0 justify-between">
            <div className="flex border-b border-transparent h-full">
              <button
                onClick={() => setActiveTab('code')}
                className={`px-4 h-full text-xs font-bold transition-all relative border-b-2 ${
                  activeTab === 'code'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Code Editor
              </button>
              <button
                onClick={() => setActiveTab('whiteboard')}
                className={`px-4 h-full text-xs font-bold transition-all relative border-b-2 ${
                  activeTab === 'whiteboard'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Whiteboard
              </button>
            </div>

            <div className={activeTab === 'code' ? 'block' : 'hidden'}>
              <select
                value={language}
                onChange={handleLanguageChange}
                className="bg-white border border-gray-300 rounded-lg py-1 px-3 text-xs font-bold outline-none text-gray-700 cursor-pointer shadow-sm focus:border-orange-500"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </select>
            </div>
          </div>

          <div className={activeTab === 'code' ? 'flex-1 flex flex-col h-full overflow-hidden' : 'hidden'}>
            <Editor
              height="100%"
              language={language}
              theme="vs"
              value={code}
              onChange={handleEditorChange}
              onMount={(editor) => { editorRef.current = editor; }}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: 'on',
                padding: { top: 16 }
              }}
            />
          </div>

          <div className={activeTab === 'whiteboard' ? 'flex-1 h-full' : 'hidden'}>
            <Whiteboard
              roomId={roomId}
              socket={socket}
              canvasRef={whiteboardCanvasRef}
            />
          </div>
        </div>

        <div className="w-[280px] bg-gray-50 flex flex-col border-l border-gray-200 shrink-0 p-4 justify-between">
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Remote Feed</span>
              <div className="w-full aspect-video bg-gray-950 rounded-xl relative overflow-hidden border border-gray-900 shadow flex items-center justify-center">
                {remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3">
                    {videoStatus === 'reconnecting' ? (
                      <div className="flex flex-col items-center text-yellow-500 gap-2 animate-pulse">
                        <AlertCircle size={24} />
                        <span className="text-[10px] font-bold">Reconnecting video...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-gray-500 gap-2">
                        <div className="w-5 h-5 rounded-full border border-gray-500 border-t-transparent animate-spin" />
                        <span className="text-[10px] font-semibold">Waiting for peer...</span>
                      </div>
                    )}
                  </div>
                )}
                {isRemoteMuted && renderMuteIndicator()}
                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] text-white font-medium">
                  {remoteUserLabel()}
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Your Feed</span>
              <div className="w-full aspect-video bg-gray-950 rounded-xl relative overflow-hidden border border-gray-900 shadow flex items-center justify-center">
                {localStream && !isCameraOff ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gray-900 flex items-center justify-center text-gray-500">
                    <VideoOff size={24} />
                  </div>
                )}
                {isMuted && renderMuteIndicator()}
                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] text-white font-medium">
                  You ({role})
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4 mt-4 shrink-0 flex items-center justify-center gap-3">
            <button
              onClick={toggleMute}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition border ${
                isMuted
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
              }`}
              title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              onClick={toggleCamera}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition border ${
                isCameraOff
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
              }`}
              title={isCameraOff ? 'Show Camera' : 'Hide Camera'}
            >
              {isCameraOff ? <VideoOff size={16} /> : <Video size={16} />}
            </button>
          </div>
        </div>
      </div>

      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-orange-500" />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center border border-red-100 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <h3 className="text-lg font-bold text-gray-950">End Interview Session?</h3>
              </div>
              <p className="text-sm text-gray-650 leading-relaxed mb-6">
                Are you sure you want to conclude this session? This will lock the workspace, capture the whiteboard canvas, and automatically generate a candidate evaluation report using AI.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="px-4 py-2 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold text-sm rounded-xl transition duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmEndSession}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-sm rounded-xl transition duration-150 shadow-sm cursor-pointer"
                >
                  Yes, End Session
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="h-1.5 w-full bg-gradient-to-r from-gray-300 to-gray-400" />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center border border-gray-100 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <h3 className="text-lg font-bold text-gray-950">Leave Interview Room?</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-6">
                Are you sure you want to leave this session? You can rejoin later using the same link or room code, as long as the interviewer has not ended the session.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="px-4 py-2 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold text-sm rounded-xl transition duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    clearRoomState();
                    navigate('/dashboard');
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white font-semibold text-sm rounded-xl transition duration-150 shadow-sm cursor-pointer"
                >
                  Yes, Leave Room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showChangeQuestionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-xl w-full overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 to-red-500 shrink-0" />

            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-950">
                Change Active Question
              </h3>
              <button
                onClick={() => {
                  setShowChangeQuestionModal(false);
                  setSelectedProblem(null);
                  setCustomTitle('');
                  setCustomDesc('');
                }}
                className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col min-h-0">
              <div className="flex border-b mb-4 shrink-0">
                <button
                  className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${modalActiveTab === 'bank' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setModalActiveTab('bank')}
                >
                  Question Bank
                </button>
                <button
                  className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${modalActiveTab === 'custom' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setModalActiveTab('custom')}
                >
                  Custom Problem
                </button>
              </div>

              {modalActiveTab === 'bank' ? (
                <div className="flex-1 flex flex-col min-h-[250px] mb-4">
                  <div className="flex flex-wrap gap-2 mb-3 shrink-0">
                    <input
                      type="text" placeholder="Search..."
                      className="flex-[2] min-w-[120px] border border-gray-300 p-2 rounded-xl text-sm outline-none focus:border-orange-500 shadow-sm"
                      value={search} onChange={e => setSearch(e.target.value)}
                    />
                    <select className="flex-1 min-w-[110px] border border-gray-300 p-2 rounded-xl text-sm outline-none bg-white cursor-pointer shadow-sm" value={topicFilter} onChange={e => setTopicFilter(e.target.value)}>
                      <option value="">All Topics</option>
                      {topics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select className="flex-1 min-w-[110px] border border-gray-300 p-2 rounded-xl text-sm outline-none bg-white cursor-pointer shadow-sm" value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)}>
                      <option value="">All Difficulties</option>
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                  <div className="border border-gray-200 rounded-xl flex-1 overflow-y-auto max-h-[200px] shadow-inner bg-gray-50">
                    {filteredProblems.map(p => (
                      <div
                        key={p._id}
                        onClick={() => setSelectedProblem(p)}
                        className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-orange-50/50 transition-colors ${selectedProblem?._id === p._id ? 'bg-orange-50 border-l-4 border-l-orange-500 font-semibold' : ''}`}
                      >
                        <div className="font-semibold text-sm text-gray-800">{p.title}</div>
                        <div className="flex gap-2 mt-1.5">
                          <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">{p.topic}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${p.difficulty === 'Easy' ? 'bg-green-100 text-green-700' : p.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{p.difficulty}</span>
                        </div>
                      </div>
                    ))}
                    {filteredProblems.length === 0 && <div className="p-4 text-center text-sm text-gray-500">No problems found.</div>}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-3 min-h-[250px] mb-4">
                  <input
                    type="text" placeholder="Problem Title"
                    className="border border-gray-300 p-2.5 rounded-xl text-sm outline-none focus:border-orange-500 shadow-sm"
                    value={customTitle} onChange={e => setCustomTitle(e.target.value)}
                  />
                  <textarea
                    placeholder="Problem Description"
                    className="flex-1 border border-gray-300 p-2.5 rounded-xl text-sm outline-none focus:border-orange-500 resize-none shadow-sm min-h-[140px]"
                    value={customDesc} onChange={e => setCustomDesc(e.target.value)}
                    maxLength={2000}
                  ></textarea>
                  <div className="text-xs text-right text-gray-400 -mt-2">{customDesc.length}/2000</div>
                </div>
              )}

              <button
                onClick={handleChangeQuestionConfirm}
                className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-3 rounded-xl transition shadow-sm hover:shadow-md active:scale-[0.99] cursor-pointer shrink-0"
              >
                Change Active Question
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
