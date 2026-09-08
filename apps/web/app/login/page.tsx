'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HexLogo } from '../../components/primitives/HexLogo';
import { User, Lock, Eye, EyeOff, ShieldCheck, LockKeyhole, Cpu, AlertCircle, KeyRound, Check } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { api, ApiError } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login, setUser } = useAuthStore();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('sovereign2026');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forced password change state
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const user = await login(username, password, keepSignedIn);
      if (user.must_change_password) {
        setNeedsPasswordChange(true);
      } else {
        router.push('/');
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError(null);

    if (newPassword.length < 6) {
      setChangeError('New password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangeError('New passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      const updatedUser = await api.changePassword(password, newPassword);
      setUser(updatedUser);
      router.push('/');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setChangeError(err.message);
      } else if (err instanceof Error) {
        setChangeError(err.message);
      } else {
        setChangeError('Failed to update password. Please try again.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden bg-[#0A0C10]">
      {/* Background Graphic: Industrial refinery silhouettes & subtle radial glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-900/10 rounded-full blur-[140px]" />
        
        {/* SVG Silhouette representation of an industrial refinery */}
        <svg
          className="absolute bottom-0 w-full h-[65vh] opacity-25 object-cover"
          viewBox="0 0 1440 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Refinery Columns */}
          <rect x="180" y="160" width="45" height="440" fill="#171B22" />
          <rect x="185" y="140" width="35" height="20" fill="#2E3542" />
          <line x1="180" y1="220" x2="225" y2="220" stroke="#35C08A" strokeWidth="2" strokeDasharray="3 3" />
          <line x1="180" y1="300" x2="225" y2="300" stroke="#4DA3FF" strokeWidth="2" />
          
          <rect x="280" y="240" width="80" height="360" rx="6" fill="#11141A" />
          <rect x="300" y="180" width="40" height="60" fill="#171B22" />
          
          <rect x="780" y="120" width="60" height="480" fill="#11141A" />
          <circle cx="810" cy="110" r="15" fill="#232833" />
          <line x1="810" y1="120" x2="810" y2="80" stroke="#E5484D" strokeWidth="2" />
          
          <rect x="920" y="200" width="55" height="400" fill="#171B22" />
          <rect x="1100" y="150" width="70" height="450" fill="#11141A" />
          
          {/* Pipe bridges */}
          <path d="M225 240 L780 240" stroke="#232833" strokeWidth="4" />
          <path d="M360 320 L780 320" stroke="#2E3542" strokeWidth="3" />
          <path d="M840 280 L1100 280" stroke="#232833" strokeWidth="4" />
          <path d="M840 200 L920 200" stroke="#4DA3FF" strokeWidth="2" strokeOpacity="0.4" />
        </svg>

        {/* Gradient dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0C10] via-[#0A0C10]/80 to-transparent" />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-10 w-full px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HexLogo size={36} withText={true} />
        </div>
        <div className="text-xs font-mono text-text-secondary tracking-wide hidden sm:block">
          Built for Bharat <span className="text-text-tertiary">|</span> Secure by Design
        </div>
      </header>

      {/* Center Hero & Sign In Card */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto w-full">
        {/* Hero Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-2">
            Sovereign AI Workbench
          </h1>
          <p className="text-sm text-text-secondary font-medium tracking-wide mb-1">
            Secure • Private • Your Infrastructure • Your Intelligence
          </p>
          <p className="text-xs text-text-tertiary">
            On-premise. Open models. Real impact.
          </p>
        </div>

        {/* Sign In / Password Change Box */}
        <div className="w-full bg-[#11141A]/90 backdrop-blur-md border border-border p-6 sm:p-8 rounded-lg shadow-2xl">
          {!needsPasswordChange ? (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-text-primary">Sign in to continue</h2>
                <p className="text-xs text-text-secondary">Access your secure AI workbench</p>
              </div>

              {errorMessage && (
                <div className="mb-4 p-3 rounded bg-red-950/40 border border-red-800/50 flex items-start gap-2.5 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Username */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Username</label>
                  <div className="relative flex items-center">
                    <User className="absolute left-3 w-4 h-4 text-text-tertiary" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Username"
                      className="w-full bg-[#171B22] border border-border focus:border-accent text-text-primary text-xs rounded-md pl-9 pr-3 py-2.5 outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Password</label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-3 w-4 h-4 text-text-tertiary" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full bg-[#171B22] border border-border focus:border-accent text-text-primary text-xs rounded-md pl-9 pr-10 py-2.5 outline-none transition-colors font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 text-text-tertiary hover:text-text-secondary"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {loading ? 'Authenticating locally...' : 'Sign In'}
                </button>

                {/* Keep me signed in */}
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id="keep-signed-in"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-border bg-[#171B22] text-accent focus:ring-0 focus:ring-offset-0"
                  />
                  <label htmlFor="keep-signed-in" className="text-xs text-text-secondary select-none cursor-pointer">
                    Keep me signed in
                  </label>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6">
                <div className="flex items-center gap-2 text-warning mb-1">
                  <KeyRound className="w-5 h-5" />
                  <h2 className="text-lg font-semibold text-text-primary">Update Temporary Password</h2>
                </div>
                <p className="text-xs text-text-secondary">
                  Your administrator provided a temporary one-time password. Please establish a personal password to continue.
                </p>
              </div>

              {changeError && (
                <div className="mb-4 p-3 rounded bg-red-950/40 border border-red-800/50 flex items-start gap-2.5 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{changeError}</span>
                </div>
              )}

              <form onSubmit={handlePasswordChangeSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">New Password</label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-3 w-4 h-4 text-text-tertiary" />
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full bg-[#171B22] border border-border focus:border-accent text-text-primary text-xs rounded-md pl-9 pr-3 py-2.5 outline-none transition-colors font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">Confirm New Password</label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-3 w-4 h-4 text-text-tertiary" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full bg-[#171B22] border border-border focus:border-accent text-text-primary text-xs rounded-md pl-9 pr-3 py-2.5 outline-none transition-colors font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={changingPassword}
                  className="w-full mt-2 py-2.5 px-4 rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{changingPassword ? 'Setting password...' : 'Set Password & Enter Workbench'}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Bottom Feature Badges */}
      <footer className="relative z-10 w-full px-6 py-6 border-t border-border/50 bg-[#0A0C10]/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
            <div className="flex items-center gap-2 text-xs text-text-secondary font-medium">
              <ShieldCheck className="w-4 h-4 text-ok" />
              <span>100% On-Premise</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary font-medium">
              <LockKeyhole className="w-4 h-4 text-accent" />
              <span>No Data Leaves Your Network</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary font-medium">
              <Cpu className="w-4 h-4 text-modality-vision" />
              <span>Supports Multiple Open Models</span>
            </div>
          </div>
          <div className="text-xs font-mono text-text-tertiary">
            Powering a Self-Reliant Tomorrow
          </div>
        </div>
      </footer>
    </div>
  );
}
