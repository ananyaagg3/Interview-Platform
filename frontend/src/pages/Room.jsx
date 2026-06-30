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

export default function Room() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('waiting');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [disconnected, setDisconnected] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // V2 Added States
  const [hasJoined, setHasJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [micVolume, setMicVolume] = useState(0);
  const [iceServers, setIceServers] = useState([{ urls: "stun:stun.l.google.com:19302" }]);
  const [turnLoaded, setTurnLoaded] = useState(false);
  const [videoStatus, setVideoStatus] = useState('waiting'); // 'waiting' | 'connected' | 'reconnecting'
  const [remoteUserName, setRemoteUserName] = useState('');
  const [activeTab, setActiveTab] = useState('code'); // 'code' | 'whiteboard'
  
  // Local stream controls
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  
  // Interviewer Notes
  const [notes, setNotes] = useState('');
  const [viewedQuestionIndex, setViewedQuestionIndex] = useState(0);

  // Auto-sync viewedQuestionIndex when the room active question changes
  useEffect(() => {
    if (!room || !room.selectedQuestions) return;
    const activeIdx = room.selectedQuestions.findIndex(q => {
      return (q.problemSource === 'bank' && room.problemSource === 'bank' && 
              (q.problemId?._id?.toString() === room.problemId?._id?.toString() || q.problemId?.toString() === room.problemId?.toString() || q.problemId?._id === room.problemId)) ||
             (q.problemSource === 'custom' && room.problemSource === 'custom' &&
              q.customProblem?.title === room.customProblem?.title);
    });
    if (activeIdx !== -1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewedQuestionIndex(activeIdx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.problemId, room?.customProblem, room?.selectedQuestions]);

  // Change Question Modal States
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
  const localStreamRef = useRef(null); // Ref to avoid stale closures
  const iceServersRef = useRef([{ urls: "stun:stun.l.google.com:19302" }]);
  
  // WebRTC Refs
  const peerRef = useRef(null);
  const whiteboardCanvasRef = useRef(null);

  // Fetch room data once on mount
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

  // Fetch TURN credentials once room has joined
  useEffect(() => {
    const fetchTurn = async () => {
      try {
        const turnData = await apiFetch('/rooms/turn-credentials');
        // Backend now returns { iceServers: [...] } array format
        if (turnData.iceServers && turnData.iceServers.length > 0) {
          setIceServers(turnData.iceServers);
        }
      } catch (err) {
        console.error("Error fetching TURN credentials, using STUN fallback:", err);
      } finally {
        setTurnLoaded(true);
      }
    };
    if (hasJoined) {
      fetchTurn();
    }
  }, [hasJoined]);

  // WebRTC Peer connection helper
  const initiatePeer = useCallback((initiator) => {
    const currentStream = localStreamRef.current;
    if (!currentStream) {
      console.warn("initiatePeer called but localStreamRef.current is null");
      return null;
    }
    console.log(`Initiating WebRTC Peer. Initiator: ${initiator}`);

    if (peerRef.current) {
      peerRef.current.destroy();
    }

    const peer = new Peer({
      initiator,
      trickle: false,
      config: { iceServers: iceServersRef.current },
      stream: currentStream
    });

    peer.on('signal', (data) => {
      socket.emit('signal', { roomId, signalData: data });
    });

    peer.on('stream', (stream) => {
      console.log('Remote stream received');
      setRemoteStream(stream);
      setVideoStatus('connected');
    });

    peer.on('close', () => {
      console.log('Peer closed connection');
      peer.destroy();
      if (peerRef.current === peer) {
        peerRef.current = null;
      }
      setRemoteStream(null);
      setVideoStatus('reconnecting');
    });

    peer.on('error', (err) => {
      console.error('Peer connection error:', err);
      peer.destroy();
      if (peerRef.current === peer) {
        peerRef.current = null;
      }
      setRemoteStream(null);
      setVideoStatus('reconnecting');
    });

    peerRef.current = peer;
    return peer;
  }, [roomId]);

  // Pre-session check stream acquisition and mic volume tracking
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

        // Audio analyser for mic testing
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
          console.error("Audio analyser failed:", audioErr);
        }

      } catch (err) {
        console.error("Permission error:", err);
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

  // Handle local video playback on video element refs via callback refs
  const localVideoRef = useCallback((node) => {
    if (node && localStream) {
      node.srcObject = localStream;
      node.play().catch(err => {
        console.error("Local video playback failed:", err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, isCameraOff]);

  // Handle remote video playback on video element refs via callback refs
  const remoteVideoRef = useCallback((node) => {
    if (node && remoteStream) {
      node.srcObject = remoteStream;
      node.play().catch(err => {
        console.error("Remote video playback failed:", err);
      });
    }
  }, [remoteStream]);

  // Keep localStreamRef in sync with state
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Keep iceServersRef in sync with state
  useEffect(() => {
    iceServersRef.current = iceServers;
  }, [iceServers]);

  // Main Socket room joining and event handling after Pre-session join clicked
  useEffect(() => {
    if (!room || !hasJoined || !turnLoaded) return;

    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('join-room', { roomId, userId: user.id, userName: user.name });

    const onRoomState = (state) => {
      if (state.currentCode) {
        isRemoteChange.current = true;
        setCode(state.currentCode);
      }
      if (state.currentLanguage) {
        setLanguage(state.currentLanguage);
      }
      setStatus(state.status);
      setRole(state.role);
    };

    const onCodeChange = ({ code: newCode, language: newLang }) => {
      isRemoteChange.current = true;
      setCode(newCode);
      setLanguage(newLang);
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
      // Release camera/mic on session end — use ref to avoid stale closure
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      navigate(`/report/${roomId}`);
    };

    const onPeerJoined = ({ userName: peerName }) => {
      console.log(`Peer joined: ${peerName}`);
      setRemoteUserName(peerName);
      // Wait a moment for connection parameters to align, then initiate
      setTimeout(() => initiatePeer(true), 500);
    };

    const onSignal = (signalData) => {
      const peer = peerRef.current;
      if (!peer) {
        if (signalData.type === 'offer') {
          const newPeer = initiatePeer(false);
          if (newPeer) {
            try {
              newPeer.signal(signalData);
            } catch (err) {
              console.error('Error signaling new peer:', err);
            }
          }
        }
        return;
      }

      const pc = peer._pc;
      const signalingState = pc ? pc.signalingState : null;

      if (peer.destroyed || peer.connected) return;
      if (signalingState === 'stable') return;

      try {
        peer.signal(signalData);
      } catch (err) {
        console.error('Error signaling existing peer:', err);
      }
    };

    const onError = (msg) => {
      setError(msg);
      if (msg === 'Room not found' || msg === 'Room is full') {
        setTimeout(() => navigate('/dashboard'), 2000);
      }
    };

    const onDisconnect = () => {
      setDisconnected(true);
    };

    const onReconnect = () => {
      setDisconnected(false);
      socket.emit('join-room', { roomId, userId: user.id, userName: user.name });
    };

    socket.on('room-state', onRoomState);
    socket.on('code-change', onCodeChange);
    socket.on('timer-update', onTimerUpdate);
    socket.on('status-update', onStatusUpdate);
    socket.on('question-changed', onQuestionChanged);
    socket.on('session-ended', onSessionEnded);
    socket.on('peer-joined', onPeerJoined);
    socket.on('signal', onSignal);
    socket.on('error', onError);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onReconnect);

    return () => {
      socket.off('room-state', onRoomState);
      socket.off('code-change', onCodeChange);
      socket.off('timer-update', onTimerUpdate);
      socket.off('status-update', onStatusUpdate);
      socket.off('question-changed', onQuestionChanged);
      socket.off('session-ended', onSessionEnded);
      socket.off('peer-joined', onPeerJoined);
      socket.off('signal', onSignal);
      socket.off('error', onError);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onReconnect);
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, hasJoined, turnLoaded, initiatePeer, user.id, user.name]);

  // Clean up media tracks on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, [localStream]);

  const handleEditorChange = useCallback((value) => {
    if (isRemoteChange.current) {
      isRemoteChange.current = false;
      return;
    }
    setCode(value);
    socket.emit('code-change', { roomId, code: value, language });
  }, [roomId, language]);

  const handleLanguageChange = useCallback((e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    socket.emit('code-change', { roomId, code, language: newLang });
  }, [roomId, code]);

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
        console.error("Failed to load problems in Room:", err);
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
    // Reset selections
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
    
    // Capture whiteboard snapshot if canvas is mounted
    const canvas = whiteboardCanvasRef.current;
    const whiteboardSnapshot = canvas ? canvas.toDataURL("image/png") : null;
    
    // Emit end session with V2 inputs
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
        setIsMuted(!audioTrack.enabled);
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
    return <div className="min-h-screen flex items-center justify-center text-red-500 font-medium">{error}</div>;
  }

  if (!room) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  // Render Pre-session check screen if user hasn't clicked join yet
  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-6 select-none font-sans">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-lg w-full overflow-hidden">
          {/* Accent Line */}
          <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 to-red-500" />
          
          <div className="p-8 flex flex-col items-center">
            <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mb-4 border border-orange-100">
              <Sparkles size={24} className="animate-pulse" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">Before you join</h2>
            <p className="text-sm text-gray-500 text-center mb-6">
              Confirm your camera and microphone are working correctly.
            </p>

            {/* Video preview container */}
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

            {/* Microphone test indicator */}
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

            {/* Action Buttons */}
            <div className="w-full flex flex-col gap-2">
              <button
                disabled={!permissionGranted}
                onClick={() => setHasJoined(true)}
                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition duration-200 shadow-sm ${
                  permissionGranted 
                    ? 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white cursor-pointer' 
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                Join Session <Play size={16} fill="currentColor" />
              </button>
              
              {!permissionGranted && permissionError && (
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 font-semibold text-xs rounded-xl hover:bg-gray-50 active:bg-gray-100 transition cursor-pointer"
                >
                  Retry Permissions
                </button>
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
    } else {
      return `${room.interviewerId?.name || remoteUserName || 'Interviewer'} (Interviewer)`;
    }
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

  return (
    <div className="h-screen flex flex-col bg-white select-none font-sans">
      {/* Disconnection banner */}
      {disconnected && (
        <div className="bg-yellow-100 text-yellow-800 text-sm text-center py-2 font-semibold">
          Connection lost — attempting to reconnect...
        </div>
      )}

      {/* Header */}
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

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Column 1: Left Panel (30%) */}
        <div className="w-[30%] border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
          {/* Problem description wrapper (scrollable) */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col">
            {/* Tabs for Selected Questions */}
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
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${viewedQ.difficulty==='Easy'?'bg-green-100 text-green-700':viewedQ.difficulty==='Medium'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>
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
          
          {/* Interviewer Notes (Only visible to Interviewer) */}
          {role === 'Interviewer' && (
            <div className="border-t border-gray-200 bg-white p-4 shrink-0 flex flex-col">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Your Notes (private)</label>
              <textarea
                className="w-full h-32 border border-gray-300 rounded-xl p-3 text-sm outline-none focus:border-orange-500 resize-none font-sans text-gray-800 shadow-inner"
                placeholder="Write down observations, coding design critique, etc. Candidate will not see this."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Column 2: Center Panel (Flex-1) */}
        <div className="flex-1 flex flex-col bg-white">
          {/* Tab bar */}
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

            {/* Language dropdown (only active/visible on editor tab) */}
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

          {/* Monaco Code Editor (live but conditionally visible via class) */}
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

          {/* Whiteboard (live but conditionally visible via class) */}
          <div className={activeTab === 'whiteboard' ? 'flex-1 h-full' : 'hidden'}>
            <Whiteboard 
              roomId={roomId} 
              socket={socket} 
              canvasRef={whiteboardCanvasRef} 
            />
          </div>
        </div>

        {/* Column 3: Right Panel (Video stack ~280px) */}
        <div className="w-[280px] bg-gray-50 flex flex-col border-l border-gray-200 shrink-0 p-4 justify-between">
          {/* Video Stack */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
            {/* Remote Peer Video */}
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
                {/* Username label overlay */}
                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] text-white font-medium">
                  {remoteUserLabel()}
                </div>
              </div>
            </div>

            {/* Local Video */}
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
                {/* Local Mute Indicator Overlay */}
                {isMuted && (
                  <div className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow">
                    <MicOff size={10} />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] text-white font-medium">
                  You ({role})
                </div>
              </div>
            </div>
          </div>

          {/* Video controls bar at the bottom */}
          <div className="border-t border-gray-200 pt-4 mt-4 shrink-0 flex items-center justify-center gap-3">
            <button
              onClick={toggleMute}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition border ${
                isMuted 
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
              }`}
              title={isMuted ? "Unmute Mic" : "Mute Mic"}
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
              title={isCameraOff ? "Show Camera" : "Hide Camera"}
            >
              {isCameraOff ? <VideoOff size={16} /> : <Video size={16} />}
            </button>
          </div>
        </div>

      </div>

      {/* End Session Confirmation Modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Top accent line */}
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

      {/* Leave Session Confirmation Modal (for Candidates) */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Top accent line */}
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

      {/* Change Question Modal (Interviewer Only) */}
      {showChangeQuestionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-xl w-full overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            {/* Top accent line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 to-red-500 shrink-0" />
            
            {/* Modal Header */}
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
            
            {/* Modal Body */}
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
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${p.difficulty==='Easy'?'bg-green-100 text-green-700':p.difficulty==='Medium'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{p.difficulty}</span>
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
