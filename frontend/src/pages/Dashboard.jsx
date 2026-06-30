import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { LogOut, Copy, Check, ExternalLink, AlertCircle, Plus, X, Video, LogIn, Settings } from 'lucide-react';

export default function Dashboard() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const sessionRole = sessionStorage.getItem('sessionRole') || 'interviewer'; // 'interviewer' | 'candidate'
  const isInterviewerView = sessionRole === 'interviewer';

  const [activeTab, setActiveTab] = useState('bank'); // 'bank' or 'custom'
  
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  const [settingsActiveTab, setSettingsActiveTab] = useState('general'); // 'general' | 'security'
  const [settingsName, setSettingsName] = useState('');
  const [settingsEmail, setSettingsEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Sync settings form with user object when modal opens
  useEffect(() => {
    if (showSettingsModal && user) {
      setSettingsName(user.name || '');
      setSettingsEmail(user.email || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSettingsError('');
      setSettingsSuccess('');
    }
  }, [showSettingsModal, user]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSettingsError('');
    setSettingsSuccess('');
    setSettingsLoading(true);

    if (settingsActiveTab === 'general') {
      if (!settingsName.trim() || !settingsEmail.trim()) {
        setSettingsError('Name and Email are required.');
        setSettingsLoading(false);
        return;
      }
    } else {
      if (!currentPassword || !newPassword || !confirmPassword) {
        setSettingsError('All password fields are required.');
        setSettingsLoading(false);
        return;
      }
      if (newPassword !== confirmPassword) {
        setSettingsError('New passwords do not match.');
        setSettingsLoading(false);
        return;
      }
      if (newPassword.length < 6) {
        setSettingsError('New password must be at least 6 characters.');
        setSettingsLoading(false);
        return;
      }
    }

    try {
      const payload = {};
      if (settingsActiveTab === 'general') {
        payload.name = settingsName;
        payload.email = settingsEmail;
      } else {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const data = await apiFetch('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      login(data.token, data.user);
      setSettingsSuccess(data.message || 'Profile updated successfully!');
      
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setSettingsError(err.message || 'Failed to update profile.');
    } finally {
      setSettingsLoading(false);
    }
  };
  const [problems, setProblems] = useState([]);
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [selectedQuestions, setSelectedQuestions] = useState([]);

  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');

  const [duration, setDuration] = useState(45);
  const [language, setLanguage] = useState('javascript');

  const [createdRoomId, setCreatedRoomId] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [alertModal, setAlertModal] = useState(null); // { title: string, message: string }

  const [pastRooms, setPastRooms] = useState([]);

  const hostedRooms = pastRooms.filter(r => r.interviewerId === user?.id);
  const totalHosted = hostedRooms.length;
  const avgDuration = totalHosted > 0 
    ? Math.round(hostedRooms.reduce((acc, curr) => acc + Number(curr.duration || 0), 0) / totalHosted)
    : 0;

  const fetchProblems = async () => {
    try {
      const data = await apiFetch('/rooms/problems');
      setProblems(data.problems);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPastSessions = async () => {
    try {
      const data = await apiFetch('/rooms/past');
      setPastRooms(data.rooms);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProblems();
    fetchPastSessions();
  }, []);

  const handleAddCustomQuestion = () => {
    if (!customTitle.trim() || !customDesc.trim()) {
      setAlertModal({
        title: 'Incomplete Problem Details',
        message: 'Please specify both a title and a description for your custom problem.'
      });
      return;
    }
    setSelectedQuestions(prev => [...prev, {
      problemSource: 'custom',
      customProblem: { title: customTitle, description: customDesc },
      title: customTitle,
      topic: 'Custom',
      difficulty: 'Medium'
    }]);
    setCustomTitle('');
    setCustomDesc('');
  };

  const handleCreateRoom = async () => {
    try {
      const finalQuestions = [...selectedQuestions];
      
      // Fallback: If they haven't explicitly clicked "+ Add", add their currently active input/selection
      if (finalQuestions.length === 0) {
        if (activeTab === 'bank' && selectedProblem) {
          finalQuestions.push({
            problemSource: 'bank',
            problemId: selectedProblem._id,
            title: selectedProblem.title,
            topic: selectedProblem.topic,
            difficulty: selectedProblem.difficulty
          });
        } else if (activeTab === 'custom' && customTitle && customDesc) {
          finalQuestions.push({
            problemSource: 'custom',
            customProblem: { title: customTitle, description: customDesc },
            title: customTitle,
            topic: 'Custom',
            difficulty: 'Medium'
          });
        } else {
          setAlertModal({
            title: 'No Questions Selected',
            message: 'Please add at least one question to the session.'
          });
          return;
        }
      }

      const activeQ = finalQuestions[0];
      const payload = {
        problemSource: activeQ.problemSource,
        problemId: activeQ.problemSource === 'bank' ? activeQ.problemId : null,
        customProblem: activeQ.problemSource === 'custom' ? activeQ.customProblem : null,
        selectedQuestions: finalQuestions.map(q => ({
          problemSource: q.problemSource,
          problemId: q.problemId,
          customProblem: q.customProblem
        })),
        duration: Number(duration),
        defaultLanguage: language
      };

      const data = await apiFetch('/rooms/create', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      setCreatedRoomId(data.roomId);
    } catch (err) {
      setAlertModal({
        title: 'Error Creating Room',
        message: err.message
      });
    }
  };

  const copyLink = () => {
    const link = `${window.location.origin}/room/${createdRoomId}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(createdRoomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleJoinRoom = async () => {
    setJoinError('');
    if (!joinCode) return;
    
    // Extract room id if it's a full URL
    let roomId = joinCode.trim();
    if (roomId.includes('/room/')) {
      roomId = roomId.split('/room/')[1];
    }

    try {
      const data = await apiFetch(`/rooms/${roomId}`);
      if (data.room.status === 'ended') {
        navigate(`/report/${roomId}`);
      } else {
        navigate(`/room/${roomId}`);
      }
    } catch (err) {
      setJoinError('Room not found');
    }
  };

  const filteredProblems = problems.filter(p => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (topicFilter && p.topic !== topicFilter) return false;
    if (difficultyFilter && p.difficulty !== difficultyFilter) return false;
    return true;
  });

  const topics = [...new Set(problems.map(p => p.topic))];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-orange-500 tracking-tight">InterviewApp</h1>
        
        {/* Profile Dropdown Menu */}
        <div className="flex items-center gap-4 relative">
          <div className="relative">
            <button 
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition duration-150 cursor-pointer outline-none border border-transparent hover:border-gray-200"
            >
              {/* Initials Avatar */}
              <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 font-bold flex items-center justify-center text-sm">
                {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
              </div>
              <span className="font-medium text-sm text-gray-700 max-w-[120px] truncate">{user?.name}</span>
              <svg className={`w-4 h-4 text-gray-500 transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu List */}
            {showProfileDropdown && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowProfileDropdown(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Signed In As</p>
                    <p className="font-bold text-sm text-gray-800 truncate">{user?.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    
                    <div className="mt-2">
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isInterviewerView ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                      }`}>
                        {isInterviewerView ? 'Interviewer' : 'Candidate'}
                      </span>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setShowProfileDropdown(false);
                      setShowSettingsModal(true);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 flex items-center gap-2 transition cursor-pointer"
                  >
                    <Settings size={16} />
                    <span>Settings</span>
                  </button>
                  
                  <button 
                    onClick={() => {
                      setShowProfileDropdown(false);
                      logout();
                      sessionStorage.removeItem('sessionRole');
                      navigate('/login');
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition cursor-pointer border-t border-gray-100"
                  >
                    <LogOut size={16} />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Interviewer Welcome Card & CTA — shown only to Interviewers on the home page */}
        {isInterviewerView && (
          <div className="flex flex-col gap-6 h-full justify-center">
            {/* Welcome back card */}
            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden h-full min-h-[340px]">
              {/* Subtle background decoration */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full blur-2xl -mr-8 -mt-8 opacity-60" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-red-50 rounded-full blur-2xl -ml-8 -mb-8 opacity-40" />

              <div className="relative z-10 flex-1 flex flex-col">
                <div className="w-12 h-12 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mb-6 border border-orange-100 shadow-xs">
                  <Video size={24} />
                </div>
                
                <h2 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">
                  Welcome back, {user?.name || 'Interviewer'}!
                </h2>
                
                <p className="text-sm text-gray-600 leading-relaxed mb-6 max-w-md">
                  Ready to host a live interview session? Create a room to set up a shared coding environment with an interactive editor, collaborative whiteboard, video call, and AI feedback reports.
                </p>

                {/* Stats Dashboard */}
                <div className="grid grid-cols-2 gap-4 mb-6 shrink-0">
                  <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-4 flex flex-col justify-center shadow-xs">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">HOSTED SESSIONS</span>
                    <span className="text-2xl font-extrabold text-orange-600 font-mono leading-none">{totalHosted}</span>
                  </div>
                  <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-4 flex flex-col justify-center shadow-xs">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">AVG. DURATION</span>
                    <span className="text-2xl font-extrabold text-orange-600 font-mono leading-none">{avgDuration}<span className="text-xs font-normal text-gray-500 ml-1">mins</span></span>
                  </div>
                </div>

                {/* Features & Capabilities checklist */}
                <div className="border-t border-gray-100 pt-5 flex-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-3">WORKSPACE CAPABILITIES</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-orange-50 text-orange-505 font-semibold">📝</span>
                      <span>Private Interviewer Notes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-orange-50 text-orange-505 font-semibold">🎯</span>
                      <span>Pre-loaded Question Bank</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-orange-50 text-orange-505 font-semibold">🎨</span>
                      <span>Collaborative Whiteboard</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-orange-50 text-orange-505 font-semibold">🤖</span>
                      <span>Automated AI Evaluations</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="relative z-10 mt-6">
                <button
                  onClick={() => {
                    setSelectedQuestions([]);
                    setSelectedProblem(null);
                    setCustomTitle('');
                    setCustomDesc('');
                    setShowCreateModal(true);
                  }}
                  className="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold px-6 py-3.5 rounded-xl shadow-md transition-all hover:shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 w-full md:w-auto"
                >
                  <Plus size={18} />
                  <span>Create Interview Room</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Candidate Welcome Card & CTA — shown only to Candidates on the home page */}
        {!isInterviewerView && (
          <div className="flex flex-col gap-6 h-full justify-center">
            {/* Welcome card */}
            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between relative overflow-hidden h-full min-h-[340px]">
              {/* Subtle background decoration */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-2xl -mr-8 -mt-8 opacity-60" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-violet-50 rounded-full blur-2xl -ml-8 -mb-8 opacity-40" />

              <div className="relative z-10 flex-1 flex flex-col">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mb-6 border border-indigo-100 shadow-xs">
                  <LogIn size={24} />
                </div>
                
                <h2 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">
                  Ready for your interview, {user?.name || 'Candidate'}?
                </h2>
                
                <p className="text-sm text-gray-600 leading-relaxed mb-6 max-w-md">
                  Your interviewer will provide a room code or direct link to join the session. Once you have it, click "Join Interview Session" to enter your live coding room.
                </p>

                {/* What to expect list */}
                <div className="mt-2 border-t border-gray-100 pt-4 flex-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-3">WHAT'S INSIDE YOUR SESSION</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-indigo-50 text-indigo-500 font-semibold">🖥️</span>
                      <span>Real-time Code Editor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-indigo-50 text-indigo-500 font-semibold">🎨</span>
                      <span>Interactive Whiteboard</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-indigo-50 text-indigo-500 font-semibold">📹</span>
                      <span>Live Video &amp; Audio Call</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-indigo-50 text-indigo-500 font-semibold">📊</span>
                      <span>AI Feedback Report</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="relative z-10 mt-6">
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold px-6 py-3.5 rounded-xl shadow-md transition-all hover:shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 w-full md:w-auto"
                >
                  <LogIn size={18} />
                  <span>Join Interview Session</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Past Sessions Column */}
        <div className="flex flex-col gap-6 h-full">
          <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex-1 flex flex-col">
            <h2 className="text-lg font-bold mb-4">Past Sessions</h2>
            <div className="flex-1 overflow-y-auto min-h-[200px]">
              {pastRooms.length === 0 ? (
                <div className="text-center text-sm text-gray-500 mt-8">No sessions yet</div>
              ) : (
                <div className="space-y-3">
                  {pastRooms.map(r => {
                    const isInterviewer = (r.interviewerId?._id || r.interviewerId) === user?.id;
                    const isOngoing = r.status !== 'ended';
                    return (
                      <div 
                        key={r._id} 
                        onClick={() => navigate(isOngoing ? `/room/${r.roomId}` : `/report/${r.roomId}`)}
                        className={`border p-3 rounded flex flex-col gap-1 transition duration-150 cursor-pointer shadow-sm ${
                          isOngoing 
                            ? 'bg-green-50/40 border-green-200 hover:bg-green-50 hover:border-green-300' 
                            : 'bg-gray-50 border-gray-200 hover:bg-orange-50 hover:border-orange-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-sm text-gray-800 flex items-center gap-1.5">
                            {r.problemSource === 'bank' ? r.problemId?.title : r.customProblem?.title}
                            {isOngoing && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-800 border border-green-200 animate-pulse">
                                Live
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-gray-500">
                            {isOngoing ? 'Ongoing' : new Date(r.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${isInterviewer ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-purple-50 text-purple-700 border border-purple-100'}`}>
                              {isInterviewer ? 'Interviewer' : 'Candidate'}
                            </span>
                            <span className="text-xs text-gray-500 font-medium">
                              {isInterviewer 
                                ? `Candidate: ${r.candidateId?.name || 'Waiting to join...'}` 
                                : `Interviewer: ${r.interviewerId?.name || 'Unknown'}`}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {isOngoing ? (
                              <span className="text-green-700 font-semibold flex items-center gap-0.5">
                                Rejoin Room →
                              </span>
                            ) : (
                              `${r.duration} min`
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

      </main>

      {alertModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Top accent line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 to-red-500" />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center border border-orange-100 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <h3 className="text-lg font-bold text-gray-950">{alertModal.title}</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-6">{alertModal.message}</p>
              <div className="flex justify-end">
                <button 
                  onClick={() => setAlertModal(null)}
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold text-sm rounded-xl transition duration-150 shadow-sm cursor-pointer"
                >
                  Okay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-40 p-4 transition-all duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-xl w-full overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            {/* Top accent line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 to-red-500 shrink-0" />
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-950">
                {createdRoomId ? "Room Created Successfully" : "Set Up Interview Room"}
              </h3>
              <button 
                onClick={() => {
                  setShowCreateModal(false);
                  setCreatedRoomId(null);
                  setSelectedQuestions([]);
                }}
                className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col min-h-0">
              {!createdRoomId ? (
                <>
                  <div className="flex border-b mb-4 shrink-0">
                    <button 
                      className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${activeTab === 'bank' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                      onClick={() => setActiveTab('bank')}
                    >
                      Question Bank
                    </button>
                    <button 
                      className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${activeTab === 'custom' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                      onClick={() => setActiveTab('custom')}
                    >
                      Custom Problem
                    </button>
                  </div>

                  {/* Selected Questions Banner */}
                  {selectedQuestions.length > 0 && (
                    <div className="mb-4 bg-orange-50/50 border border-orange-200 rounded-xl p-3 shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
                      <label className="block text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-2">Selected Questions ({selectedQuestions.length})</label>
                      <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto pr-1">
                        {selectedQuestions.map((q, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 bg-white border border-orange-200 text-orange-850 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-xs">
                            <span>Q{idx + 1}: {q.title}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedQuestions(prev => prev.filter((_, i) => i !== idx))}
                              className="text-orange-400 hover:text-orange-600 transition ml-1 cursor-pointer flex items-center justify-center"
                              title="Remove"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'bank' ? (
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
                        {filteredProblems.map(p => {
                          const isAdded = selectedQuestions.some(q => q.problemSource === 'bank' && q.problemId === p._id);
                          return (
                            <div 
                              key={p._id} 
                              onClick={() => setSelectedProblem(p)}
                              className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-orange-50/50 transition-colors flex justify-between items-center ${selectedProblem?._id === p._id ? 'bg-orange-50 border-l-4 border-l-orange-500 font-semibold' : ''}`}
                            >
                              <div className="flex-1">
                                <div className="font-semibold text-sm text-gray-800">{p.title}</div>
                                <div className="flex gap-2 mt-1.5">
                                  <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">{p.topic}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${p.difficulty==='Easy'?'bg-green-100 text-green-700':p.difficulty==='Medium'?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{p.difficulty}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isAdded) {
                                    setSelectedQuestions(prev => prev.filter(q => !(q.problemSource === 'bank' && q.problemId === p._id)));
                                  } else {
                                    setSelectedQuestions(prev => [...prev, {
                                      problemSource: 'bank',
                                      problemId: p._id,
                                      title: p.title,
                                      topic: p.topic,
                                      difficulty: p.difficulty
                                    }]);
                                  }
                                }}
                                className={`ml-4 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                                  isAdded 
                                    ? 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100 hover:text-green-700 font-bold' 
                                    : 'bg-orange-500 border-transparent text-white hover:bg-orange-600'
                                }`}
                              >
                                {isAdded ? 'Added' : '+ Add'}
                              </button>
                            </div>
                          );
                        })}
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
                        className="flex-1 border border-gray-300 p-2.5 rounded-xl text-sm outline-none focus:border-orange-500 resize-none shadow-sm min-h-[120px]"
                        value={customDesc} onChange={e => setCustomDesc(e.target.value)}
                        maxLength={2000}
                      ></textarea>
                      <div className="flex justify-between items-center -mt-2">
                        <span className="text-xs text-gray-400">{customDesc.length}/2000</span>
                        <button
                          type="button"
                          onClick={handleAddCustomQuestion}
                          className="px-4 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-semibold rounded-xl transition cursor-pointer border border-orange-200 shadow-xs"
                        >
                          + Add Custom Question
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 mb-5 shrink-0">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Duration</label>
                      <select className="w-full border border-gray-300 p-2 rounded-xl text-sm outline-none bg-white cursor-pointer shadow-sm" value={duration} onChange={e => setDuration(e.target.value)}>
                        <option value="30">30 minutes</option>
                        <option value="45">45 minutes</option>
                        <option value="60">60 minutes</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Default Language</label>
                      <select className="w-full border border-gray-300 p-2 rounded-xl text-sm outline-none bg-white cursor-pointer shadow-sm" value={language} onChange={e => setLanguage(e.target.value)}>
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="cpp">C++</option>
                        <option value="java">Java</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={handleCreateRoom}
                    className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-3 rounded-xl transition shadow-sm hover:shadow-md active:scale-[0.99] cursor-pointer shrink-0"
                  >
                    Create Room
                  </button>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-orange-50/50 rounded-2xl border border-orange-100">
                  <div className="w-12 h-12 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mb-3 border border-orange-200 shadow-sm">
                    <Check size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-1">Room Created!</h3>
                  <p className="text-xs text-gray-500 mb-6 font-medium">Share either the code or link with the candidate:</p>
                  
                  {/* Room Code block */}
                  <div className="w-full mb-4 text-left">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Room Code</span>
                    <div className="flex items-center w-full bg-white border border-gray-300 rounded-xl overflow-hidden shadow-sm">
                      <span className="flex-1 p-2.5 font-mono font-bold text-gray-800 bg-transparent text-center select-all">
                        {createdRoomId}
                      </span>
                      <button 
                        onClick={copyCode} 
                        className="bg-gray-100 hover:bg-gray-200 px-4 py-2.5 border-l border-gray-300 flex items-center gap-1.5 text-xs font-semibold text-gray-700 transition cursor-pointer"
                      >
                        {copiedCode ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                        {copiedCode ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* Room Link block */}
                  <div className="w-full mb-6 text-left">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Direct Join Link</span>
                    <div className="flex items-center w-full bg-white border border-gray-300 rounded-xl overflow-hidden shadow-sm">
                      <input 
                        type="text" 
                        readOnly 
                        value={`${window.location.origin}/room/${createdRoomId}`} 
                        className="flex-1 p-2.5 text-xs text-gray-600 outline-none bg-transparent"
                      />
                      <button 
                        onClick={copyLink} 
                        className="bg-gray-100 hover:bg-gray-200 px-4 py-2.5 border-l border-gray-300 flex items-center gap-1.5 text-xs font-semibold text-gray-700 transition cursor-pointer"
                      >
                        {copiedLink ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                        {copiedLink ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={() => navigate(`/room/${createdRoomId}`)}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition shadow-sm hover:shadow cursor-pointer"
                  >
                    Enter Room as Interviewer <ExternalLink size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-40 p-4 transition-all duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200 flex flex-col">
            {/* Top accent line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 to-violet-500 shrink-0" />
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-950">
                Join Interview Room
              </h3>
              <button 
                onClick={() => {
                  setShowJoinModal(false);
                  setJoinCode('');
                  setJoinError('');
                }}
                className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                Enter the room code or paste the direct join link provided by your interviewer.
              </p>
              
              <div className="flex flex-col gap-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Room Code or Link
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. 64b8a21f... or https://..." 
                  className="w-full border border-gray-300 p-3 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-sm transition"
                  value={joinCode}
                  onChange={e => {
                    setJoinCode(e.target.value);
                    if (joinError) setJoinError('');
                  }}
                  autoFocus
                />
                {joinError && (
                  <div className="flex items-center gap-1.5 text-red-500 text-xs mt-1">
                    <AlertCircle size={14} />
                    <span>{joinError}</span>
                  </div>
                )}
              </div>
              
              <button 
                onClick={handleJoinRoom}
                className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-3 rounded-xl transition shadow-sm hover:shadow-md active:scale-[0.99] cursor-pointer mt-2 flex items-center justify-center gap-2"
              >
                <LogIn size={16} />
                <span>Join Room</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden transform transition-all scale-100 animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 to-red-500 shrink-0" />
            
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-950 flex items-center gap-2">
                <Settings className="text-orange-500" size={20} />
                <span>Account Settings</span>
              </h3>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 flex flex-col min-h-0">
              {/* Tabs */}
              <div className="flex border-b mb-5 shrink-0">
                <button 
                  className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${settingsActiveTab === 'general' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  onClick={() => {
                    setSettingsActiveTab('general');
                    setSettingsError('');
                    setSettingsSuccess('');
                  }}
                >
                  General Profile
                </button>
                <button 
                  className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${settingsActiveTab === 'security' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  onClick={() => {
                    setSettingsActiveTab('security');
                    setSettingsError('');
                    setSettingsSuccess('');
                  }}
                >
                  Security &amp; Password
                </button>
              </div>

              {settingsError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{settingsError}</span>
                </div>
              )}

              {settingsSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
                  <Check size={16} className="shrink-0" />
                  <span>{settingsSuccess}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                {settingsActiveTab === 'general' ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Full Name</label>
                      <input 
                        type="text" 
                        className="border border-gray-300 p-2.5 rounded-xl text-sm outline-none focus:border-orange-500 shadow-sm"
                        value={settingsName} 
                        onChange={e => setSettingsName(e.target.value)}
                        placeholder="Enter full name"
                        disabled={settingsLoading}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
                      <input 
                        type="email" 
                        className="border border-gray-300 p-2.5 rounded-xl text-sm outline-none focus:border-orange-500 shadow-sm"
                        value={settingsEmail} 
                        onChange={e => setSettingsEmail(e.target.value)}
                        placeholder="Enter email address"
                        disabled={settingsLoading}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Current Password</label>
                      <input 
                        type="password" 
                        className="border border-gray-300 p-2.5 rounded-xl text-sm outline-none focus:border-orange-500 shadow-sm"
                        value={currentPassword} 
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={settingsLoading}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">New Password</label>
                      <input 
                        type="password" 
                        className="border border-gray-300 p-2.5 rounded-xl text-sm outline-none focus:border-orange-500 shadow-sm"
                        value={newPassword} 
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={settingsLoading}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Confirm New Password</label>
                      <input 
                        type="password" 
                        className="border border-gray-300 p-2.5 rounded-xl text-sm outline-none focus:border-orange-500 shadow-sm"
                        value={confirmPassword} 
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={settingsLoading}
                      />
                    </div>
                  </>
                )}

                <button 
                  type="submit" 
                  disabled={settingsLoading}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-bold py-3 rounded-xl transition shadow-sm hover:shadow-md active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 mt-6"
                >
                  {settingsLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
