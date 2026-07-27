# GY DATA — Required Environment Variables

All secrets must be set in the deployment environment (never in source code or committed `.env` files).

---

## 🔴 REQUIRED — App will not start without these

| Variable | Description | Example |
|---|---|---|
| `SESSION_SECRET` | Random secret for signing session cookies. Use at least 32 random characters. | `openssl rand -base64 32` |
| `DATABASE_URL` | PostgreSQL connection string for the application database. | `postgresql://user:pass@host:5432/db` |
| `PORT` | TCP port the API server listens on. Defaults to `5000` when not provided. | `8080` |

---

## 🟠 REQUIRED for payment processing (Monnify)

Without these, wallet funding via Monnify is unavailable. The app still starts.

| Variable | Description | Where to find |
|---|---|---|
| `MONNIFY_API_KEY` | Monnify merchant API key | Monnify Dashboard → Settings → API Keys |
| `MONNIFY_SECRET_KEY` | Monnify merchant secret key | Monnify Dashboard → Settings → API Keys |
| `MONNIFY_CONTRACT_CODE` | Monnify contract/merchant code | Monnify Dashboard → Settings → Contract Code |
| `MONNIFY_BASE_URL` | Monnify API base URL | `https://api.monnify.com` (live) or `https://sandbox.monnify.com` (test) |

---

## 🟠 REQUIRED for data/airtime purchases (ClubKonnect)

Without these, data and airtime purchases are unavailable. The app still starts.

| Variable | Description | Where to find |
|---|---|---|
| `CLUBKONNECT_USER_ID` | ClubKonnect account user ID | ClubKonnect Dashboard → Profile → API Details |
| `CLUBKONNECT_API_KEY` | ClubKonnect API key | ClubKonnect Dashboard → Profile → API Details |

---

## 🟡 REQUIRED for WhatsApp integration (Meta)

Without these, WhatsApp messaging is unavailable. **In production, `WHATSAPP_APP_SECRET` is required — without it, all webhook POST requests are rejected.**

| Variable | Description | Where to find |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API permanent access token | Meta Developer Console → App → WhatsApp → API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID | Meta Developer Console → App → WhatsApp → API Setup |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account (WABA) ID | Meta Business Manager → WhatsApp Accounts |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | A secret string YOU choose, configured in both the deployment environment and Meta webhook settings | Any random string, e.g. `openssl rand -hex 16` |
| `WHATSAPP_APP_SECRET` | App secret for HMAC-SHA256 webhook signature verification | Meta Developer Console → App → Settings → Basic → App Secret |

---

## 🟢 OPTIONAL

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key used by the AI support assistant. | Disabled unless configured |
| `CORS_ORIGINS` | Comma-separated list of allowed frontend origins in production. | All origins allowed (set this in production!) |
| `ADMIN_EMAIL` | Bootstrap super-admin email. Only used on first startup. | `admin@gydata.ng` |
| `ADMIN_PIN` | Bootstrap super-admin PIN (6 digits). **Change immediately after first login.** Must not be `125125`. | None (seeding disabled if missing or insecure) |
| `LOG_LEVEL` | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` | `info` |

---

## Production Security Checklist

Before going live, verify:

- [ ] `SESSION_SECRET` is a random 32+ character string (not a dictionary word)
- [ ] `ADMIN_PIN` is set to a strong 6-digit PIN that is NOT `125125`
- [ ] `CORS_ORIGINS` is set to your production frontend domain
- [ ] `WHATSAPP_APP_SECRET` is set (mandatory in production)
- [ ] `MONNIFY_BASE_URL` is set to `https://api.monnify.com` (not sandbox)
- [ ] All secrets are stored in the deployment environment, not in code or committed `.env` files
- [ ] After first login as super admin, change the PIN via the admin panel
