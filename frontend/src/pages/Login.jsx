import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';

// ─── tiny icon components (inline SVG so no extra deps) ───────────────────────
const BriefcaseIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="12" y1="12" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12" y2="16"/>
  </svg>
);

const UserIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

// ─── role config ──────────────────────────────────────────────────────────────
const ROLES = {
  interviewer: {
    label: 'Interviewer',
    tagline: 'Set up sessions, choose problems, and evaluate candidates.',
    accent: '#FF6B35',
    accentLight: '#FFF7F0',
    accentBorder: '#FFE0CC',
    gradient: 'linear-gradient(135deg, #FF6B35 0%, #E85A28 100%)',
    icon: <BriefcaseIcon />,
  },
  candidate: {
    label: 'Candidate',
    tagline: 'Join your interview session and showcase your skills.',
    accent: '#6366F1',
    accentLight: '#EEF2FF',
    accentBorder: '#C7D2FE',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    icon: <UserIcon />,
  },
};

export default function Login() {
  const [step, setStep] = useState('role'); // 'role' | 'form' | 'forgot-request' | 'forgot-reset'
  const [role, setRole] = useState(null);   // 'interviewer' | 'candidate'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  // Forgot password specific states
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const cfg = role ? ROLES[role] : null;

  const handleRoleSelect = (r) => {
    setRole(r);
    setStep('form');
    setError('');
  };

  const handleBack = () => {
    setStep('role');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      // store role alongside token so Dashboard can adapt
      localStorage.setItem('sessionRole', role);
      login(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail }),
      });
      setSuccessMessage('A 6-digit reset code has been sent! Check your backend console.');
      setTimeout(() => {
        setStep('forgot-reset');
        setError('');
        setSuccessMessage('');
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail, code: resetCode, newPassword }),
      });
      setSuccessMessage('Password reset successfully! Redirecting to login...');
      setTimeout(() => {
        setStep('form');
        setError('');
        setSuccessMessage('');
        setPassword('');
        setResetCode('');
        setNewPassword('');
        setConfirmPassword('');
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Decorative background blobs */}
      <div style={styles.blob1} />
      <div style={styles.blob2} />

      <div style={styles.card}>
        {/* ── STEP 1: Role Selection ─────────────────────────────────────── */}
        {step === 'role' && (
          <div style={styles.roleStep}>
            <div style={styles.logoRow}>
              <span style={styles.logoText}>InterviewApp</span>
            </div>
            <h1 style={styles.heading}>Welcome back</h1>
            <p style={styles.subheading}>How are you logging in today?</p>

            <div style={styles.roleGrid}>
              {Object.entries(ROLES).map(([key, r]) => (
                <button
                  key={key}
                  onClick={() => handleRoleSelect(key)}
                  style={styles.roleCard}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = `0 12px 32px ${r.accent}33`;
                    e.currentTarget.style.borderColor = r.accent;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)';
                    e.currentTarget.style.borderColor = '#E5E7EB';
                  }}
                >
                  <div style={{ ...styles.roleIconWrap, background: r.accentLight, color: r.accent }}>
                    {r.icon}
                  </div>
                  <div style={styles.roleLabel}>{r.label}</div>
                  <div style={styles.roleTagline}>{r.tagline}</div>
                  <div style={{ ...styles.rolePill, background: r.gradient }}>
                    Continue as {r.label} →
                  </div>
                </button>
              ))}
            </div>

            <p style={styles.switchText}>
              Don't have an account?{' '}
              <Link to="/signup" style={styles.link}>Sign up</Link>
            </p>
          </div>
        )}

        {/* ── STEP 2: Login Form ────────────────────────────────────────── */}
        {step === 'form' && cfg && (
          <div style={styles.formStep}>
            {/* Top colour bar */}
            <div style={{ ...styles.topBar, background: cfg.gradient }} />

            <div style={styles.formInner}>
              <button onClick={handleBack} style={styles.backBtn}>
                <ArrowLeftIcon /> Back
              </button>

              <div style={{ ...styles.roleBadge, background: cfg.accentLight, color: cfg.accent, borderColor: cfg.accentBorder }}>
                {cfg.label}
              </div>

              <h2 style={styles.formHeading}>
                Sign in as <span style={{ color: cfg.accent }}>{cfg.label}</span>
              </h2>
              <p style={styles.formSubheading}>{cfg.tagline}</p>

              <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.field}>
                  <label style={styles.label}>Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    style={styles.input}
                    onFocus={e => { e.target.style.borderColor = cfg.accent; e.target.style.boxShadow = `0 0 0 3px ${cfg.accent}22`; }}
                    onBlur={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                <div style={styles.field}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={styles.label}>Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('forgot-request');
                        setForgotEmail(email);
                        setError('');
                        setSuccessMessage('');
                      }}
                      style={{ ...styles.forgotLink, color: cfg.accent }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    style={styles.input}
                    onFocus={e => { e.target.style.borderColor = cfg.accent; e.target.style.boxShadow = `0 0 0 3px ${cfg.accent}22`; }}
                    onBlur={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                {error && <div style={styles.errorBox}>{error}</div>}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ ...styles.submitBtn, background: cfg.gradient, opacity: loading ? 0.7 : 1 }}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                >
                  {loading ? 'Signing in…' : `Sign in as ${cfg.label}`}
                </button>
              </form>

              <p style={styles.switchText}>
                Don't have an account?{' '}
                <Link to="/signup" style={{ ...styles.link, color: cfg.accent }}>Sign up</Link>
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 3: Forgot Password Request ────────────────────────────── */}
        {step === 'forgot-request' && cfg && (
          <div style={styles.formStep}>
            <div style={{ ...styles.topBar, background: cfg.gradient }} />
            <div style={styles.formInner}>
              <button 
                type="button"
                onClick={() => {
                  setStep('form');
                  setError('');
                  setSuccessMessage('');
                }} 
                style={styles.backBtn}
              >
                <ArrowLeftIcon /> Back to Login
              </button>

              <div style={{ ...styles.roleBadge, background: cfg.accentLight, color: cfg.accent, borderColor: cfg.accentBorder }}>
                {cfg.label}
              </div>

              <h2 style={styles.formHeading}>
                Forgot password?
              </h2>
              <p style={styles.formSubheading}>
                Enter your email address and we'll send you a 6-digit code to reset your password.
              </p>

              <form onSubmit={handleForgotRequest} style={styles.form}>
                <div style={styles.field}>
                  <label style={styles.label}>Email address</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    style={styles.input}
                    onFocus={e => { e.target.style.borderColor = cfg.accent; e.target.style.boxShadow = `0 0 0 3px ${cfg.accent}22`; }}
                    onBlur={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                {error && <div style={styles.errorBox}>{error}</div>}
                {successMessage && <div style={styles.successBox}>{successMessage}</div>}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ ...styles.submitBtn, background: cfg.gradient, opacity: loading ? 0.7 : 1 }}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                >
                  {loading ? 'Sending code…' : 'Send Reset Code'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── STEP 4: Forgot Password Reset ──────────────────────────────── */}
        {step === 'forgot-reset' && cfg && (
          <div style={styles.formStep}>
            <div style={{ ...styles.topBar, background: cfg.gradient }} />
            <div style={styles.formInner}>
              <button 
                type="button"
                onClick={() => {
                  setStep('forgot-request');
                  setError('');
                  setSuccessMessage('');
                }} 
                style={styles.backBtn}
              >
                <ArrowLeftIcon /> Back to Email
              </button>

              <div style={{ ...styles.roleBadge, background: cfg.accentLight, color: cfg.accent, borderColor: cfg.accentBorder }}>
                {cfg.label}
              </div>

              <h2 style={styles.formHeading}>
                Reset password
              </h2>
              <p style={styles.formSubheading}>
                Enter the 6-digit code logged on your server console, and choose a new password.
              </p>

              <form onSubmit={handleForgotReset} style={styles.form}>
                <div style={styles.field}>
                  <label style={styles.label}>Verification Code</label>
                  <input
                    type="text"
                    value={resetCode}
                    onChange={e => setResetCode(e.target.value)}
                    required
                    maxLength={6}
                    placeholder="123456"
                    style={{ ...styles.input, letterSpacing: '4px', textAlign: 'center', fontSize: '18px', fontWeight: 'bold' }}
                    onFocus={e => { e.target.style.borderColor = cfg.accent; e.target.style.boxShadow = `0 0 0 3px ${cfg.accent}22`; }}
                    onBlur={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    style={styles.input}
                    onFocus={e => { e.target.style.borderColor = cfg.accent; e.target.style.boxShadow = `0 0 0 3px ${cfg.accent}22`; }}
                    onBlur={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    style={styles.input}
                    onFocus={e => { e.target.style.borderColor = cfg.accent; e.target.style.boxShadow = `0 0 0 3px ${cfg.accent}22`; }}
                    onBlur={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                {error && <div style={styles.errorBox}>{error}</div>}
                {successMessage && <div style={styles.successBox}>{successMessage}</div>}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ ...styles.submitBtn, background: cfg.gradient, opacity: loading ? 0.7 : 1 }}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                >
                  {loading ? 'Resetting password…' : 'Reset Password'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #F0F4FF 0%, #FFF7F0 50%, #F5F3FF 100%)',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  blob1: {
    position: 'absolute', top: '-120px', right: '-100px',
    width: '480px', height: '480px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,107,53,0.12) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  blob2: {
    position: 'absolute', bottom: '-100px', left: '-80px',
    width: '400px', height: '400px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    width: '100%',
    maxWidth: '560px',
    background: '#FFFFFF',
    borderRadius: '20px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.10)',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },

  // ── Role step ──
  roleStep: { padding: '40px 40px 32px' },
  logoRow: { marginBottom: '28px' },
  logoText: { fontSize: '18px', fontWeight: 800, color: '#FF6B35', letterSpacing: '-0.3px' },
  heading: { fontSize: '28px', fontWeight: 800, color: '#111827', margin: '0 0 8px', letterSpacing: '-0.5px' },
  subheading: { fontSize: '15px', color: '#6B7280', margin: '0 0 32px' },
  roleGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' },
  roleCard: {
    background: '#FAFAFA',
    border: '2px solid #E5E7EB',
    borderRadius: '16px',
    padding: '24px 20px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
    display: 'flex', flexDirection: 'column', gap: '10px',
  },
  roleIconWrap: {
    width: '64px', height: '64px', borderRadius: '14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  roleLabel: { fontSize: '17px', fontWeight: 700, color: '#111827' },
  roleTagline: { fontSize: '12.5px', color: '#6B7280', lineHeight: 1.5 },
  rolePill: {
    marginTop: 'auto', display: 'inline-block', color: '#fff',
    fontSize: '12px', fontWeight: 600, padding: '6px 14px',
    borderRadius: '100px',
  },

  // ── Form step ──
  formStep: { display: 'flex', flexDirection: 'column' },
  topBar: { height: '6px', width: '100%' },
  formInner: { padding: '32px 40px 36px' },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '13px', color: '#6B7280', padding: 0, marginBottom: '20px',
    fontWeight: 500, transition: 'color 0.15s',
  },
  roleBadge: {
    display: 'inline-block', fontSize: '12px', fontWeight: 700,
    padding: '4px 12px', borderRadius: '100px', border: '1.5px solid',
    marginBottom: '16px', letterSpacing: '0.3px',
  },
  formHeading: { fontSize: '24px', fontWeight: 800, color: '#111827', margin: '0 0 6px', letterSpacing: '-0.4px' },
  formSubheading: { fontSize: '13.5px', color: '#6B7280', margin: '0 0 28px' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#374151' },
  input: {
    padding: '10px 14px', borderRadius: '10px',
    border: '1.5px solid #D1D5DB', fontSize: '14px',
    outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
    background: '#FAFAFA', color: '#111827',
  },
  errorBox: {
    background: '#FEF2F2', border: '1px solid #FECACA',
    borderRadius: '8px', padding: '10px 14px',
    fontSize: '13px', color: '#DC2626',
  },
  successBox: {
    background: '#ECFDF5', border: '1px solid #A7F3D0',
    borderRadius: '8px', padding: '10px 14px',
    fontSize: '13px', color: '#059669',
  },
  submitBtn: {
    padding: '12px', borderRadius: '12px', border: 'none',
    color: '#fff', fontSize: '15px', fontWeight: 700,
    cursor: 'pointer', transition: 'filter 0.2s, opacity 0.2s',
    letterSpacing: '0.1px',
  },
  forgotLink: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '12.5px', fontWeight: 600, padding: 0, textDecoration: 'none',
    transition: 'opacity 0.15s',
  },

  // shared
  switchText: { fontSize: '13px', color: '#6B7280', textAlign: 'center', marginTop: '20px' },
  link: { color: '#FF6B35', textDecoration: 'none', fontWeight: 600 },
};
