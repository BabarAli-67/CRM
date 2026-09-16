import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth.hook.js';

const inputClassName =
  'w-full rounded-xl border border-obsidian-border bg-obsidian-elevated px-4 py-3 text-ink outline-none transition placeholder:text-ink-soft focus:border-flash-secondary focus:ring-2 focus:ring-flash-secondary/30';

export default function RegisterPage() {
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register({ fullName, email, phone, password });
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
                  htmlFor="email"
                  className="mb-2 block font-display text-sm font-medium text-ink"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClassName}
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="mb-2 block font-display text-sm font-medium text-ink"
                >
                  Phone
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
                  htmlFor="password"
                  className="mb-2 block font-display text-sm font-medium text-ink"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClassName}
                  placeholder="At least 8 characters"
                />
              </div>

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
