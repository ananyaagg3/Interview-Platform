import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { socket } from '../utils/socket';
import Editor from '@monaco-editor/react';
import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { FileText, ChevronDown, ChevronUp, Download, ArrowLeft, Award, CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';

// react-pdf Styles
const pdfStyles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', backgroundColor: '#ffffff', color: '#1f2937' },
  header: { borderBottomWidth: 2, borderBottomColor: '#f97316', paddingBottom: 15, marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  metaContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  metaText: { fontSize: 9, color: '#4b5563' },
  scoreSection: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff7ed', padding: 15, borderRadius: 8, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#f97316' },
  scoreLabel: { fontSize: 12, fontWeight: 'bold', color: '#4b5563', flex: 1 },
  scoreVal: { fontSize: 24, fontWeight: 'bold', color: '#ea580c' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  card: { border: '1 solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 6, marginBottom: 6 },
  cardTitle: { fontSize: 11, fontWeight: 'bold', color: '#1f2937' },
  cardScore: { fontSize: 11, fontWeight: 'bold', color: '#ea580c' },
  cardText: { fontSize: 9, color: '#4b5563', lineHeight: 1.4 },
  codeSection: { marginTop: 15 },
  codeTitle: { fontSize: 11, fontWeight: 'bold', color: '#1f2937', marginBottom: 5 },
  codeBox: { backgroundColor: '#f9fafb', border: '1 solid #e5e7eb', borderRadius: 4, padding: 8 },
  codeLine: { fontSize: 7, color: '#374151', fontFamily: 'Courier' }
});

// react-pdf Component
const ReportPDF = ({ report, room, code }) => {
  const candidateName = room.candidateId?.name || "Candidate";
  const interviewerName = room.interviewerId?.name || "Interviewer";
  const problemTitle = room.problemSource === 'bank' ? room.problemId?.title : room.customProblem?.title;
  const dateStr = new Date(room.createdAt).toLocaleDateString();

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.title}>{problemTitle} - Interview Feedback Report</Text>
          <View style={pdfStyles.metaContainer}>
            <Text style={pdfStyles.metaText}>Date: {dateStr}</Text>
            <Text style={pdfStyles.metaText}>Candidate: {candidateName}</Text>
            <Text style={pdfStyles.metaText}>Interviewer: {interviewerName}</Text>
          </View>
        </View>

        {report.overallScore && (
          <View style={pdfStyles.scoreSection}>
            <Text style={pdfStyles.scoreLabel}>OVERALL ASSESSMENT RATING</Text>
            <Text style={pdfStyles.scoreVal}>{report.overallScore}/10</Text>
          </View>
        )}

        <View style={{ marginBottom: 15 }}>
          <Text style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>Executive Summary</Text>
          <Text style={{ fontSize: 9, color: '#374151', lineHeight: 1.4 }}>{report.summary}</Text>
        </View>

        <Text style={pdfStyles.sectionTitle}>Evaluation Categories</Text>
        {report.categories?.map((cat, idx) => (
          <View key={idx} style={pdfStyles.card} wrap={false}>
            <View style={pdfStyles.cardHeader}>
              <Text style={pdfStyles.cardTitle}>{cat.name}</Text>
              {cat.score !== null && cat.score !== undefined && (
                <Text style={pdfStyles.cardScore}>Score: {cat.score}/10</Text>
              )}
            </View>
            <Text style={pdfStyles.cardText}>{cat.feedback}</Text>
          </View>
        ))}

        <View style={pdfStyles.codeSection} wrap={false}>
          <Text style={pdfStyles.codeTitle}>Submitted Source Code</Text>
          <View style={pdfStyles.codeBox}>
            <Text style={pdfStyles.codeLine}>{code}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default function Report() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [alertModal, setAlertModal] = useState(null); // { title: string, message: string }
  
  const [codeOpen, setCodeOpen] = useState(false);
  const pollingInterval = useRef(null);

  const fetchReport = async () => {
    try {
      const data = await apiFetch(`/rooms/${roomId}/report`);
      
      if (data.status === 'generating') {
        // Still generating, keep loading active
        setLoading(true);
        return false;
      }
      
      setReport(data.feedbackReport);
      setRoom(data.room);
      setLoading(false);
      
      // Stop polling if report successfully fetched
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
      return true;
    } catch (err) {
      setError(err.message || 'Failed to fetch report');
      setLoading(false);
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
      return true;
    }
  };

  useEffect(() => {
    let socketConnected = false;

    const onReportReady = () => {
      fetchReport();
    };

    // Initial fetch
    fetchReport().then((done) => {
      if (!done) {
        // Connect Socket as primary notification for report-ready
        socket.connect();
        socket.emit('join-room', { roomId, userId: user.id, userName: user.name });
        socket.on('report-ready', onReportReady);
        socketConnected = true;

        // Fallback: poll every 3 seconds
        pollingInterval.current = setInterval(() => {
          fetchReport();
        }, 3000);
      }
    });

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
      if (socketConnected) {
        socket.off('report-ready', onReportReady);
        socket.disconnect();
      }
    };
  }, [roomId, user.id, user.name]);

  const handleDownloadPDF = async () => {
    if (!report || !room) return;
    try {
      const doc = <ReportPDF report={report} room={room} code={room.currentCode} />;
      const asBlob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(asBlob);
      const link = document.createElement('a');
      link.href = url;
      
      const problemTitle = room.problemSource === 'bank' ? room.problemId?.title : room.customProblem?.title;
      const candidateName = room.candidateId?.name || 'Candidate';
      const filename = `${candidateName}_${problemTitle}_Report.pdf`.replace(/\s+/g, '_');
      
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
      setAlertModal({
        title: "PDF Generation Failed",
        message: "We encountered an error while rendering the PDF evaluation report. Please try again."
      });
    }
  };

  const getDuration = () => {
    if (!room || !room.sessionStartedAt || !room.sessionEndedAt) return '00:00';
    const start = new Date(room.sessionStartedAt).getTime();
    const end = new Date(room.sessionEndedAt).getTime();
    const diffSec = Math.max(0, Math.floor((end - start) / 1000));
    const m = Math.floor(diffSec / 60).toString().padStart(2, '0');
    const s = (diffSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 select-none font-sans">
        <div className="flex flex-col items-center max-w-sm text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-full border-4 border-orange-100 border-t-orange-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-orange-500">
              <Sparkles size={20} className="animate-pulse" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Analyzing Session</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Gemini is compiling interviewer notes, whiteboard snapshots, and codebase structures into a detailed evaluation report. This will take a few seconds...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
        <div className="bg-white rounded-2xl p-8 shadow-md border border-red-100 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Access Error</h3>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl transition cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Handle Gemini evaluation errors/fallbacks
  if (report?.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="text-gray-500 hover:text-gray-800 transition">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Session Evaluation</h1>
        </header>
        
        <main className="flex-1 max-w-3xl mx-auto w-full p-6 flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle size={24} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Report Unavailable</h2>
            <p className="text-sm text-gray-600 leading-relaxed max-w-md mb-4">
              {report.message || "We encountered an issue generating this session's feedback report."}
            </p>
            <p className="text-xs text-gray-400">
              You can still review the candidate's final submitted source code below.
            </p>
          </div>

          {/* Collapsible Code View */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <button
              onClick={() => setCodeOpen(!codeOpen)}
              className="w-full px-6 py-4 flex items-center justify-between font-bold text-gray-800 hover:bg-gray-50 transition"
            >
              <span className="flex items-center gap-2 text-sm"><FileText size={16} /> View Submitted Code</span>
              {codeOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {codeOpen && (
              <div className="h-[400px] border-t border-gray-200">
                <Editor
                  height="100%"
                  language={room?.currentLanguage || 'javascript'}
                  theme="vs"
                  value={room?.currentCode || ''}
                  options={{ readOnly: true, fontSize: 13, minimap: { enabled: false } }}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  const problemTitle = room.problemSource === 'bank' ? room.problemId?.title : room.customProblem?.title;
  const candidateName = room.candidateId?.name || "Candidate";
  const interviewerName = room.interviewerId?.name || "Interviewer";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans select-none pb-12">
      {/* Header Bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="text-gray-500 hover:text-gray-800 transition cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-md font-bold text-gray-900 leading-none">{problemTitle}</h1>
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Evaluation Report</span>
          </div>
        </div>

        <button
          onClick={handleDownloadPDF}
          className="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-2 transition cursor-pointer"
        >
          <Download size={14} /> Download PDF
        </button>
      </header>

      {/* Main Report Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-6 flex flex-col gap-6">
        
        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Rating circle */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center justify-center shadow-sm">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4">Overall Score</span>
            <div className="relative w-28 h-28 flex items-center justify-center">
              {/* Circular gauge */}
              <svg className="absolute w-full h-full transform -rotate-90">
                <circle cx="56" cy="56" r="48" stroke="#fff7ed" strokeWidth="8" fill="transparent" />
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  stroke="#f97316"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 48}
                  strokeDashoffset={2 * Math.PI * 48 * (1 - (report.overallScore || 0) / 10)}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-3xl font-extrabold text-orange-600 font-mono">{report.overallScore || 0}<span className="text-sm text-gray-400 font-normal">/10</span></span>
            </div>
          </div>

          {/* Session Overview Details */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 md:col-span-2 flex flex-col justify-between shadow-sm">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Session Summary</span>
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <span className="text-[11px] text-gray-500 block font-medium">Candidate</span>
                <span className="font-bold text-gray-800">{candidateName}</span>
              </div>
              <div>
                <span className="text-[11px] text-gray-500 block font-medium">Interviewer</span>
                <span className="font-bold text-gray-800">{interviewerName}</span>
              </div>
              <div>
                <span className="text-[11px] text-gray-500 block font-medium">Date</span>
                <span className="font-bold text-gray-800">{new Date(room.createdAt).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-[11px] text-gray-500 block font-medium">Session Duration</span>
                <span className="font-bold text-gray-800">{getDuration()} mins</span>
              </div>
            </div>
            
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-xs leading-relaxed text-orange-800">
              <strong>Evaluation summary:</strong> {report.summary}
            </div>
          </div>
        </div>

        {/* Categories Section */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-extrabold text-gray-800 uppercase tracking-wider">Evaluation Breakdown</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.categories?.map((cat, idx) => {
              const hasScore = cat.score !== null && cat.score !== undefined;
              return (
                <div 
                  key={idx} 
                  className={`bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col justify-between ${
                    !hasScore ? 'md:col-span-2 border-l-4 border-l-orange-500' : ''
                  }`}
                >
                  <div className="mb-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-gray-900 text-sm">{cat.name}</h4>
                      {hasScore && (
                        <span className="bg-orange-50 text-orange-600 font-bold font-mono text-xs px-2.5 py-1 rounded-lg border border-orange-100">
                          {cat.score}/10
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 text-xs leading-relaxed">{cat.feedback}</p>
                  </div>
                  
                  {hasScore && (
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${cat.score * 10}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Collapsible Source Code View */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <button
            onClick={() => setCodeOpen(!codeOpen)}
            className="w-full px-6 py-4 flex items-center justify-between font-bold text-gray-800 hover:bg-gray-50 transition cursor-pointer"
          >
            <span className="flex items-center gap-2 text-sm"><FileText size={16} /> View Submitted Code</span>
            {codeOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {codeOpen && (
            <div className="h-[400px] border-t border-gray-200">
              <Editor
                height="100%"
                language={room.currentLanguage || 'javascript'}
                theme="vs"
                value={room.currentCode}
                options={{ readOnly: true, fontSize: 13, minimap: { enabled: false } }}
              />
            </div>
          )}
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
                  <AlertTriangle size={20} />
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
    </div>
  );
}
