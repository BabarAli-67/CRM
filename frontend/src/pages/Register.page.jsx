import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import useAuth from '../hooks/useAuth.hook.js';

const inputClassName =
  'w-full rounded-xl border border-obsidian-border bg-obsidian-elevated px-4 py-3 text-ink outline-none transition placeholder:text-ink-soft focus:border-flash-secondary focus:ring-2 focus:ring-flash-secondary/30';

const ROLE_OPTIONS = [
  { value: 'sales_agent', label: 'Sales Agent' },
  { value: 'closer', label: 'Closer' },
  { value: 'cst_manager', label: 'CST Manager' },
  { value: 'tech_team', label: 'Tech Team' },
  { value: 'admin', label: 'Admin (Auditor)' },
];

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
  autoComplete = 'new-password',
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block font-display text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={8}
          value={value}
          onChange={onChange}
          className={`${inputClassName} pr-12`}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-zinc-400 transition hover:text-white"
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
        >
          {show ? (
            <EyeOff className="h-5 w-5" aria-hidden />
          ) : (
            <Eye className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [requestedRole, setRequestedRole] = useState('sales_agent');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    setLoading(true);

    try {
      await register({
        fullName: fullName.trim(),
        username: username.trim(),
        phone: phone.trim(),
        password,
        confirmPassword,
        requestedRole,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,91,75,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(0,197,146,0.12),_transparent_45%)]"
      />

      <div className="relative w-full max-w-md rounded-card border border-obsidian-border bg-obsidian-surface/95 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold italic tracking-wide text-flash-primary">
            FLASH TECH
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
            {submitted ? 'Request submitted' : 'Create account'}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {submitted
              ? 'Hang tight while an admin reviews your registration'
              : 'Register for Flash Digital CRM access'}
          </p>
        </div>

        {submitted ? (
          <div className="space-y-6 text-center">
            <div
              role="status"
              className="rounded-xl border border-flash-tertiary/40 bg-flash-tertiary/10 px-4 py-4 text-sm leading-relaxed text-ink"
            >
              Your registration has been submitted and is pending Admin approval. You&apos;ll be
              able to log in once your account is verified.
            </div>
            <Link
              to="/login"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-flash-secondary px-4 py-3 font-display text-sm font-semibold text-obsidian transition hover:bg-flash-primary"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <>
            {error ? (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-flash-primary/40 bg-flash-primary/10 px-4 py-3 text-sm text-flash-secondary"
              >
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="fullName"
                  className="mb-2 block font-display text-sm font-medium text-ink"
                >
                  Full name
                </label>
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className={inputClassName}
                  placeholder="Jane Doe"
                />
              </div>

              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block font-display text-sm font-medium text-ink"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9._\-]+"
                  title="3–32 characters: letters, numbers, dots, underscores, or hyphens"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className={inputClassName}
                  placeholder="jane.doe"
                />
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="mb-2 block font-display text-sm font-medium text-ink"
                >
                  Phone number
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className={inputClassName}
                  placeholder="+1234567890"
                />
              </div>

              <div>
                <label
                  htmlFor="requestedRole"
                  className="mb-2 block font-display text-sm font-medium text-ink"
                >
                  Role
                </label>
                <select
                  id="requestedRole"
                  required
                  value={requestedRole}
                  onChange={(event) => setRequestedRole(event.target.value)}
                  className={inputClassName}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <PasswordField
                id="password"
                label="New password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
                placeholder="At least 8 characters"
              />

              <PasswordField
                id="confirmPassword"
                label="Confirm new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                show={showConfirmPassword}
                onToggleShow={() => setShowConfirmPassword((v) => !v)}
                placeholder="Re-enter your password"
              />

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-11 w-full items-center justify-center rounded-xl bg-flash-secondary px-4 py-3 font-display text-sm font-semibold text-obsidian transition hover:bg-flash-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Submitting…' : 'Submit registration'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-ink-muted">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-medium text-flash-secondary transition hover:text-flash-primary"
              >
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
