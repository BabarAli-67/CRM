# Flash Digital CRM

Internal CRM with role-based access for Sales Agent, Closer, CST Manager, Tech Team, Auditor (`admin`), and Super Admin.

## Local development

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Setup

```bash
# Backend
cd backend
cp .env.example .env   # then fill in values
npm install
npm run dev            # http://localhost:5000

# Frontend (new terminal)
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:5000/api/v1
npm install
npm run dev            # http://localhost:5173
```

From repo root:

```bash
npm run dev:backend
npm run dev:frontend
```

### Default Super Admin
Created automatically on first backend boot from `backend/.env`:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

---

## Production deploy (Vercel + Render)

### 1) Backend on Render

1. Push this repo to GitHub.
2. In [Render](https://render.com): **New → Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/v1/health`
4. Environment variables:

| Key | Example / notes |
|-----|-----------------|
| `NODE_ENV` | `production` |
| `MONGO_URI` | Atlas `mongodb+srv://...` connection string |
| `JWT_SECRET` | long random string (Render can generate) |
| `JWT_EXPIRES_IN` | `7d` |
| `ADMIN_NAME` | `Super Admin` |
| `ADMIN_EMAIL` | your production admin email |
| `ADMIN_PASSWORD` | strong password |
| `CORS_ORIGIN` | your Vercel URL(s), comma-separated, e.g. `https://your-app.vercel.app` |

5. Deploy, then open `https://YOUR-API.onrender.com/api/v1/health` — expect `{ success: true, ... }`.

> Free Render services sleep when idle; the first request after sleep can take ~30–60s.

Optional: this repo includes `render.yaml` for Blueprint deploy.

### 2) Frontend on Vercel

1. In [Vercel](https://vercel.com): **Add New Project** → import the same GitHub repo.
2. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Environment variable (Production + Preview):

| Key | Value |
|-----|--------|
| `VITE_API_URL` | `https://YOUR-API.onrender.com/api/v1` |

4. Deploy. Copy the Vercel URL.
5. Go back to Render and set `CORS_ORIGIN` to that exact URL (no trailing slash), e.g. `https://flash-crm.vercel.app`. Redeploy backend if needed.
6. If you use a custom domain later, add it to `CORS_ORIGIN` as well (comma-separated).

### 3) Atlas checklist
- Database user with a strong password
- Network Access: allow Render IPs, or temporarily `0.0.0.0/0` (less secure)
- Never commit `.env` files

### 4) Smoke test after deploy
1. Open the Vercel site → Register a test user
2. Login as Super Admin → approve the user with a role
3. Login as that user → land on the correct dashboard
4. Auditor account can open `/admin/monitor` but cannot mutate users

---

## App routes

| Role | Path |
|------|------|
| Super Admin | `/admin` |
| Auditor (`admin`) | `/admin/monitor` |
| Sales Agent | `/dashboard/sales-agent` |
| Closer | `/dashboard/closer` |
| CST Manager | `/dashboard/cst-manager` |
| Tech Team | `/dashboard/tech-team` |

---

## Security notes
- Passwords are bcrypt-hashed; never stored in plaintext
- JWT is returned in the response body and as an httpOnly cookie (`SameSite=None; Secure` in production for Vercel ↔ Render)
- Do not commit secrets; rotate any credentials that were shared in chat or screenshots
