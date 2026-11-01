# MyVault — Phase 1: Architecture, Threat Model, Key Management

Status: design only. No application code exists yet.
Rule applied throughout: *could a DB attacker, compromised browser, malicious user or compromised server get plaintext?* Where the answer was "yes" and avoidable, the design below differs from the brief. Those deviations are in section 0.

---

## 0. Where I'm overriding the brief (and why)

| Brief said | Design does | Reason |
|---|---|---|
| Searchable plaintext metadata (title, tags, category) | **Everything is encrypted**, including title, tags, category, website, username, links. Search runs client-side over decrypted metadata. | Plaintext titles ("Chase Bank", "Binance", "Hostinger") are a map of your accounts. After a DB leak that is a ready-made phishing/targeting list and tells the attacker which accounts are worth attacking. A personal vault (hundreds–low thousands of items) needs no server-side search, so the leak buys nothing. Blind indexes (HMAC of tokens) were rejected: they leak token equality/frequency for no benefit at this scale. |
| `Category` and `Tag` tables | **Dropped.** Categories and tags live inside the encrypted blobs; custom category list lives in an encrypted settings blob. | A table of category names is plaintext metadata. Same reason as above. |
| Separate "account password" and "master password" | **One master password.** Two independent keys are derived from it (auth key, wrapping key). | The server cannot protect the vault with a second password it never sees; a separate account password only protects server access, not data. Two passwords = more to forget, no extra data protection. |
| "Forgot password" email reset | **No email reset of the master password.** Recovery = a **Recovery Key** generated at registration. Lose password *and* Recovery Key → vault is unrecoverable; account can only be wiped and recreated. | Any email-based reset that preserves the vault requires the server to hold a decryption path (escrow). That defeats zero-knowledge. |
| `AUTH_SECRET`, `ENCRYPTION_CONFIGURATION` env vars | Neither exists. Sessions are opaque random tokens in the DB (no JWT signing secret). The server has **no** encryption key. | Fewer secrets on the server = less to steal. See section 11. |
| "Vault locked" enforced by the server | Lock is **client-side only** (key discarded from memory). The server enforces *step-up re-authentication* for sensitive endpoints instead. | A zero-knowledge server cannot know or enforce whether you have the key. Pretending otherwise would be fake security. |
| "Account lockout" | **Progressive delay + per-IP and per-account throttling**, no hard lockout. | Hard lockout lets anyone who knows your email lock you out forever (DoS). |
| `server/repositories/` layer | Dropped; replaced by a mandatory user-scoped DB accessor. | The MongoDB driver's collections already are the repository. The layer that matters is the one that makes IDOR impossible (section 7). |
| Auth.js / library sessions | **Own opaque server-side sessions** (~100 lines). Not JWT. | The login protocol is non-standard (client sends a derived `authKey`, never the password). Auth libraries' credentials flows assume a password and often force JWT sessions. Opaque DB-backed sessions are the secure pattern, trivially revocable, and need no signing secret. |

### Honest limits of a *web-delivered* zero-knowledge design
1. **The server ships the JavaScript that handles your master password.** A compromised server (or CDN, or build pipeline) can serve modified JS that exfiltrates the password. Zero-knowledge protects against *DB-only* leaks and honest-but-curious operators, **not** against a fully compromised, actively malicious server. Mitigations: strict CSP, no third-party scripts, pinned/minimal dependencies, self-hosting you control. The only real fix is a signed distribution channel (browser extension / desktop wrapper) — noted as future work, not v1.
2. **XSS = game over while unlocked.** A non-extractable `CryptoKey` stops *key theft* but not an attacker running code in the page calling `decrypt()`. CSP + Trusted Types + no raw HTML rendering are therefore load-bearing, not optional.
3. **Server can withhold, delete, or roll back ciphertext** (it cannot read or forge it). AAD binding stops swapping blobs between items/users; it does not stop replaying an older valid version of an item. Accepted for a personal vault; your encrypted backups are the defense.
4. **Clipboard and JS memory can't be truly cleaned** (section 5.6).

---

## 1. System architecture

```
 Browser (trusted for crypto)                    Next.js server (NOT trusted with plaintext)           MongoDB
┌──────────────────────────────────┐   TLS     ┌───────────────────────────────────────┐        ┌──────────────────┐
│ UI (Client Components)           │◀────────▶│ Route Handlers  (JSON, ciphertext only)│◀──────▶│ User, Vault,     │
│ crypto Web Worker                │           │  guard(): origin → session → reauth →  │        │ SecretItem,      │
│  - Argon2id (noble/hashes)       │           │   rate-limit → zod → handler           │        │ Session, Audit,  │
│  - HKDF / AES-256-GCM (WebCrypto)│           │ Server Components: shell + session     │        │ RateLimit,       │
│  - search index (decrypted meta) │           │  check only, never secrets             │        │ EmailToken       │
│  - password analysis (zxcvbn)    │           │ mongodb (scoped accessor)            │        └──────────────────┘
│ Master/vault keys: memory only   │           └───────────────────────────────────────┘
└──────────────────────────────────┘
```

- **All cryptography on vault data runs in the browser.** The server stores and returns opaque blobs.
- **Server-side crypto is limited to**: hashing the derived `authKey`, hashing session/email tokens, HMAC for fake pre-login salts.
- **Runtime**: Node.js runtime (not Edge) — native Argon2 for `authKey` hashing.
- **Next.js rules**: App Router; `import 'server-only'` on everything under `lib/server/**`; `import 'client-only'` on `lib/crypto/**` so neither can cross the boundary. Auth is checked **inside every handler/page via the data-access layer — never solely in middleware/proxy** (middleware-bypass vulnerabilities have existed in Next.js). Middleware/proxy is used only for the CSP nonce and header injection.
- **All state-changing calls are JSON Route Handlers** behind one `guard()` wrapper (consistent CSRF/auth/rate-limit/validation), not scattered Server Actions.

---

## 2. Key hierarchy and encryption design

### 2.1 Derivation

```
password (NFKC-normalised) ──Argon2id(salt, m=64MiB, t=3, p=1)──▶ masterKey (32 B)     [never leaves browser]
masterKey ──HKDF-SHA256(info="myvault/v1/auth")──▶ authKey (32 B)   → sent to server for login
masterKey ──HKDF-SHA256(info="myvault/v1/kek") ──▶ KEK    (32 B)   → wraps the Vault Key, never sent

VK  = random 256-bit key generated in the browser at registration (CSPRNG)
wrappedVK = AES-256-GCM(KEK, VK, aad = "mv1|vk|<userId>")           → stored on server

Recovery Key (RK) = random 160-bit, shown once, formatted base32 (user prints/stores it offline)
RK ──HKDF(info="myvault/v1/rk-kek")──▶ rkKEK;  recoveryWrappedVK = AES-GCM(rkKEK, VK)
RK ──HKDF(info="myvault/v1/rk-auth")──▶ rkAuthKey  → server stores hash of it (proof of possession for recovery)
```

- **Domain separation via HKDF** means the server, which receives `authKey` and stores `hash(authKey)`, learns nothing usable about `KEK` (HKDF is one-way). A DB attacker has `wrappedVK` and must brute-force the master password through Argon2id *offline* — this is the real strength boundary, so the password-strength gate (zxcvbn ≥ 3, min 12 chars, passphrase encouraged) is enforced client-side, and Argon2id parameters are stored per user so they can be raised later (re-wrap at next login).
- **Why VK is separate from the master password**: changing the master password only re-wraps VK — no re-encryption of items. *But* an old DB copy + the old password still opens the vault, so after a *suspected master-password compromise* you must also **rotate VK** (re-encrypt all items; supported as an explicit "Rotate vault key" action, atomic bulk update).
- **Argon2id placement**: Web Crypto has no Argon2. Use `@noble/hashes` argon2id (audited, zero-dep) inside a Web Worker so the UI doesn't freeze; benchmark and tune to ~0.5–1 s. WASM alternative (`hash-wasm`) is faster but less audited; revisit if unlock latency is poor. Parameters are never lower than OWASP minimums (19 MiB, t=2, p=1); target 64 MiB / t=3.
- **No custom crypto**: only Argon2id, HKDF-SHA256, AES-256-GCM, CSPRNG. Nothing hand-rolled.

### 2.2 Ciphertext envelope (versioned, self-describing)

```
byte 0        : suite id      0x01 = AES-256-GCM, 96-bit random IV, 128-bit tag
bytes 1..12   : IV  (crypto.getRandomValues, fresh per encryption)
bytes 13..    : ciphertext || GCM tag
AAD           : "mv1|<kind>|<userId>|<itemId>|<field>"   kind ∈ {vk,item,settings}, field ∈ {overview,secret}
plaintext     : UTF-8 JSON, length-prefixed and padded to a multiple of 256 B (hides exact field lengths)
```

- **Nonce safety**: random 96-bit IVs are safe up to ~2³² encryptions per key (NIST SP 800-38D). A personal vault performs thousands. VK rotation resets the budget. IVs are never derived, reused, or client-supplied counters.
- **AAD binding** prevents the server (or a bug) from moving a valid blob to another item, field, or user — decryption fails.
- **Upgradability**: `suite id` selects the cipher; items are re-encrypted lazily on next write; a "migrate all" action does the rest. The backup file and KDF params carry their own version fields.
- Stored as a single `Bytes` column per blob — no separate iv/tag columns to get out of sync.

### 2.3 Item split: overview vs secret

Each item has **two** encrypted blobs under the same VK:

| Blob | Contents | When decrypted |
|---|---|---|
| `overview` | title, category, tags, website, username/login email, favorite, `links[]` (relationships), 2FA method/enabled flag, hasRecoveryCodes flag, `pwFingerprint`, `pwStrength`, `pwChangedAt`, recovery email/phone *labels* | On unlock, in the worker, to build the list/search/graph |
| `secret` | password, API key/secret, recovery codes, security questions+answers, private notes, custom *secret* fields | **Only when the user reveals/copies/edits that item**; plaintext dropped after the reveal timeout |

This is the metadata/payload split you asked for, minus the leak: both halves are ciphertext to the server; the split exists to **keep passwords out of memory until needed**.

Recovery email/phone: stored as plaintext-within-`overview` (not `secret`) so relationship views work without decrypting secrets. They are PII, not credentials. Move to `secret` if you consider them sensitive.

### 2.4 Security-analysis without decrypting every password
At save time (in the browser) the app computes and stores inside `overview`:
- `pwFingerprint = HMAC-SHA256(fpKey, password)` truncated to 16 B, where `fpKey = HKDF(VK, "myvault/v1/fingerprint")` → reuse/duplicate detection by comparing fingerprints. Useless without VK, so an `overview` blob stolen *and* decrypted still doesn't enable dictionary attacks on passwords.
- `pwStrength` (zxcvbn score, bundled and run locally; no network).
- `pwChangedAt` → "old password" warning.
Warnings (reused, weak, old, missing recovery email/2FA/recovery codes, duplicate credentials) are computed client-side from `overview` data only.
HIBP breach checks (k-anonymity, sends 5 hash chars to a third party) are **off by default**, opt-in, clearly labelled as an external call.

### 2.5 Relationships
`overview.links = [{ itemId, role: "recovery-email" | "recovery-phone" | "login-email" | "2fa" | "recovery-codes" | ... }]`. The graph is built client-side; the server never learns it. Deleting an item makes the client prune dangling links. Phone numbers/authenticators are first-class items so they can be linked.

### 2.6 Client memory, lock, clipboard — what is and isn't achievable

- Keys: `VK` imported as **non-extractable** `CryptoKey`; held in a worker-module variable. **Not** React state, not localStorage/sessionStorage/IndexedDB, never serialised. `masterKey`/`KEK` bytes are zeroed (`fill(0)`) right after use.
- **Page reload ⇒ locked** (no persisted key; unlock = re-enter password + ~1 s Argon2id). Deliberate. (Future: passkey-PRF unlock.)
- **Lock** = discard `VK`, terminate the worker, clear decrypted overview index, clear React stores and revealed values, overwrite clipboard. Triggers: button, idle timer (5 / 15 / 30 / 60 min, default 15), optional `visibilitychange` hidden-tab lock (configurable grace), session logout. The timeout preference is stored in the encrypted settings blob (theme only goes in localStorage).
- **Reveal**: decrypt `secret` on demand → render in a masked field → auto-hide after N s (default 15) → drop reference. JS strings can't be zeroed and live until GC; this is *minimised*, not eliminated.
- **Clipboard**: `writeText` then best-effort overwrite with empty string after configurable delay (default 20 s). Works only while the page has focus. **Windows clipboard history/cloud clipboard and clipboard-sniffing malware can retain it; the app cannot prevent that** — the UI says so.

### 2.7 Password generator
`crypto.getRandomValues` with **rejection sampling** (no modulo bias); options: length, classes, ambiguous-character exclusion, multiple results; guarantees at least one char per selected class; strength via zxcvbn. No `Math.random()` anywhere (enforced by an ESLint `no-restricted-properties` rule).

---

## 3. Authentication architecture

**Protocol (derived-key login; password never transmitted):**

1. `POST /api/auth/prelogin {email}` → `{ salt, kdf params }`. For unknown emails return a **deterministic fake salt** (`HMAC(PRELOGIN_HMAC_KEY, email)`) and default params, so response shape/timing doesn't reveal account existence.
2. Browser derives `masterKey → authKey, KEK`.
3. `POST /api/auth/login {email, authKey}` → server verifies `argon2id.verify(authHash, authKey)` (constant-time; dummy verify for unknown users). On success: new session, and **only then** returns `{ wrappedVK, kdf }` (unauthenticated callers can't fetch material for offline cracking).
4. Browser unwraps `VK` with `KEK`. AES-GCM tag failure ⇒ wrong password (no server round-trip needed). Login and unlock use the same derivation; a valid session with a locked vault is the normal "logged in, vault locked" state.

**Sessions**
- 256-bit random token → cookie `__Host-mv_session` (`HttpOnly; Secure; SameSite=Strict; Path=/`, no Domain). DB stores `SHA-256(token)` only.
- Idle timeout 7 d (sliding, refreshed at most hourly), absolute 30 d. Rotated on login. Independent of vault auto-lock.
- Revocation = set `revokedAt`; "logout everywhere" and password change revoke all other sessions. Active-sessions page lists device/IP/last seen.
- **Step-up re-auth**: sensitive endpoints (change password, export-data, delete account, rotate VK, revoke-all) require a `reauthAt` within the last 5 min, obtained by `POST /api/auth/reauth {authKey}`.

**CSRF**: `SameSite=Strict` + server-side `Origin`/`Sec-Fetch-Site` verification on every non-GET + required custom header (`X-MV-CSRF: 1`, forces CORS preflight) + JSON-only content type. No cookies are ever accepted on cross-origin requests; no CORS headers are emitted.

**Throttling** (MongoDB collection with TTL index, works on single node or serverless; no Redis): keys `ip:<ip>` and `acct:<userId|emailHash>`, exponential backoff (1,2,4,… s up to ~15 min) on failures, reset on success; separate budgets for prelogin, login, register, reauth, recovery. Credential-stuffing resistance comes mostly from the fact that the attacker must run Argon2id client-side-equivalent work per guess *and* hit throttles.

**Registration**: `REGISTRATION_ENABLED` env flag; for a private personal instance, create your account then set it `false`. Email verification token (hashed, 1 h, single use).

**Recovery with security questions (as built, replaces the email flow; no SMTP)**: in Settings the user picks 3 questions and enters answers. Answers are normalised (case/spacing), stretched with a heavier Argon2id (m=64 MiB, t=5), and HKDF-split into `answersAuthKey` (server stores its hash, to verify the answers) and `answersKEK` (wraps the vault key; never sent). Setting them requires re-proving the master password. Recovery: email -> questions (stable fake ones for unknown accounts) -> answers verified by the server under per-account/IP throttling -> browser unwraps the vault key -> new password -> vault key re-wrapped, other sessions revoked. **Trade-off, stated plainly:** the vault is now only as strong as the *weakest* of {password, answers}; a database thief attacks the answers offline. Hence made-up long answers (>=10 chars), a heavier KDF, and a UI warning. The email-based flow below remains the design if SMTP is added later.

**Recovery (original design)**:
`POST /api/auth/recover/start {email}` (always 200, sends email with token if account exists) → user pastes Recovery Key in the browser → browser derives `rkAuthKey` + `rkKEK`, unwraps VK, chooses new password, derives new keys, re-wraps → `POST /api/auth/recover/finish {token, rkAuthKey, newAuthKey, newKdf, newWrappedVK, newRecovery}`. Needs **both** the emailed token and the Recovery Key; revokes all sessions. No Recovery Key ⇒ only "wipe vault and reset account" (email-verified, destructive, clearly worded).

Future (not v1, not to be done insecurely): TOTP for login (seed must be stored server-side → needs a server encryption key, a deliberate tradeoff), WebAuthn passkeys (PRF-based unlock), hardware keys, emergency access.

---

## 4. Database schema (MongoDB, official `mongodb` driver + Zod)

Driver choice: the official `mongodb` driver, not Prisma/Mongoose. Prisma's MongoDB mode requires a replica set and adds a generated-client layer for no gain here; the access surface is small and is wrapped by one scoped accessor (section 7). Validation is Zod at the API boundary (strict schemas) plus a Mongo `$jsonSchema` validator on each collection as a second line of defence. `_id` is `ObjectId` (items use the client-generated UUID string); ciphertext is BSON `Binary`. Multi-document transactions (password change, VK rotation, import) need a replica set, which Atlas always is.

```ts
// users                                  unique index: { email: 1 }  (lower-cased in app; collation strength 2)
{ _id, email, emailVerifiedAt?, authHash /* argon2id(authKey) */, createdAt }

// vaults                                 unique index: { userId: 1 }   (key envelope; one per user in v1)
{ _id, userId, kdf: { algo: "argon2id", salt: Binary, memKiB, iters, par },
  wrappedVk: Binary,                      // envelope v1
  recoveryWrappedVk: Binary, recoveryAuthHash,
  settings?: Binary,                      // encrypted: categories, auto-lock, UI prefs
  keyVersion: 1, updatedAt }

// items                                  index: { userId: 1, updatedAt: 1 }   <- the ONLY item index
{ _id,                                    // client-generated UUID string (needed for AAD before encryption)
  userId,
  overview: Binary, secret: Binary,       // envelope v1
  keyVersion: 1, rev: 1,                  // rev = optimistic concurrency
  createdAt, updatedAt, deletedAt? }      // soft delete / trash, purged after 30 d

// sessions                               unique: { tokenHash: 1 }; index: { userId: 1 }; TTL: { absoluteExpiresAt: 1 } expireAfterSeconds: 0
{ _id, userId, tokenHash: Binary /* SHA-256(token) */, createdAt, lastSeenAt,
  expiresAt, absoluteExpiresAt, reauthAt?, ip?, userAgent?, revokedAt? }

// auditLogs                              index: { userId: 1, createdAt: -1 }; TTL: { createdAt: 1 } expireAfterSeconds: AUDIT_RETENTION_DAYS*86400
{ _id, userId?, sessionId?, event, success, ip?, userAgent?,
  meta?, createdAt }                      // meta: allow-listed keys only (itemId, count) - never values

// rateLimits                             TTL: { expiresAt: 1 } expireAfterSeconds: 0
{ _id: "login:ip:1.2.3.4" | "login:acct:<id>", count, windowStart, blockedUntil?, expiresAt }

// emailTokens                            unique: { tokenHash: 1 }; TTL: { expiresAt: 1 } expireAfterSeconds: 0
{ _id, userId, type: "verify" | "recover", tokenHash: Binary, expiresAt, usedAt? }
```

MongoDB TTL indexes purge audit logs, expired sessions, rate-limit counters and email tokens, so no cleanup job is needed. Throttle counters use atomic `findOneAndUpdate` with `$inc` + upsert.

**NoSQL injection**: every query value is built from Zod-parsed primitives (`z.string()`, `z.uuid()`, `z.instanceof(Buffer)`); request JSON is never spread into a filter, and `$`-prefixed keys are rejected by strict schemas. `userId` always comes from the session, never from the body.

**What the DB attacker gets**: emails, argon2 hashes of random 256-bit values, KDF params, ciphertext blobs, timestamps, item count, approximate item sizes (padded to 256 B buckets), IPs/UAs in sessions & audit. **What they don't**: any title, service name, username, tag, category, relationship, or secret.
**Residual metadata leak** (accepted): number of items, creation/modification times, rough sizes. **Indexes**: only `(userId, updatedAt)` on items, `userId` on sessions, `(userId, createdAt)` on audit - nothing keyed on content.
**Audit retention**: default 90 days (`AUDIT_RETENTION_DAYS`, applied as the TTL index); full IP kept for forensics on a single-owner instance (truncate to /24 if you ever make this multi-user).

---

## 5. Audit log — what the server can honestly know

| Event | Source | Trust |
|---|---|---|
| login ok/fail, logout, session revoked, password changed, recovery used | server | authoritative |
| secret created/updated/deleted, export-data fetched, import performed | server (write endpoints) | authoritative |
| **vault unlocked / locked / secret revealed / copied** | client ping `POST /api/audit/client-event` | **advisory only** — a compromised client can omit them; the server cannot observe them. The UI labels them "client-reported". |

Never logged: any ciphertext, authKey, token, password, or request body. A global logger redaction list plus a rule that handlers never `console.log` request objects. Hash-chained tamper evidence is deferred (YAGNI for v1).

---

## 6. Search & dashboard

- At unlock: `GET /api/vault/items` returns **all `overview` blobs** (ciphertext, paginated, delta via `updatedAt` cursor). This is the one deliberate "return a lot" endpoint, justified because it's ciphertext and client-side search requires it. `secret` blobs are fetched per item (`GET /api/vault/items/:id`) on reveal/edit.
- A worker decrypts overviews and builds an in-memory index (MiniSearch or Fuse) → instant search ("Gmail", "GitHub", "Work Email"), category/tag filters, favorites, recent, link graph.
- Dashboard shows counts (accounts / passwords / API keys / notes by category), recent/modified, favorites and warnings — all derived from `overview`; it never contains secret values. When locked, the dashboard shows only "Vault locked".

---

## 7. API design & authorization

Every handler is `route({ auth, reauth?, limit, input: zodSchema }, handler)`; the wrapper executes, in order: **Origin/Sec-Fetch-Site check → session lookup (hash, expiry, revoked) → reauth recency (if required) → rate limit → Zod parse (`.strict()`, max sizes) → handler → generic error mapping (no stack/DB text to client, no input echo)**.

**IDOR/mass-assignment defence**: handlers receive `userId` only from the session. All DB access goes through `db.forUser(userId)` which wraps the collection so every item query *forces* `{ userId }` in the filter (and `_id` alongside it); there is no unscoped item query exported to handlers. Update = `updateOne({ _id, userId, rev }, { $set, $inc: { rev: 1 } })` → `matchedCount` 0 ⇒ 404/409. Client-supplied `userId`, `rev` bumps, timestamps are ignored by strict schemas. Blob size caps (e.g. 64 KiB overview/secret) prevent abuse.

| Route | Method | Notes |
|---|---|---|
| `/api/auth/prelogin` | POST | fake salt for unknown email; throttled |
| `/api/auth/register` | POST | flag-gated; stores kdf, `authHash`, `wrappedVk`, recovery material |
| `/api/auth/login` | POST | returns `wrappedVk` only after success |
| `/api/auth/logout`, `/logout-all` | POST | |
| `/api/auth/reauth` | POST | step-up |
| `/api/auth/password/change` | POST | reauth; atomic swap of authHash+wrappedVk+kdf; revokes other sessions |
| `/api/auth/recover/start`, `/finish` | POST | token + Recovery Key proof |
| `/api/vault/items` | GET / POST | list overviews (cursor) / create |
| `/api/vault/items/[id]` | GET / PUT / DELETE | GET returns `secret`; PUT requires `rev`; DELETE = soft |
| `/api/vault/items/[id]/restore` | POST | |
| `/api/vault/settings` | GET / PUT | encrypted settings blob |
| `/api/vault/import` | POST | batch of ciphertext only; max N items |
| `/api/vault/export-data` | GET | reauth; all blobs for client-side export |
| `/api/vault/rotate-key` | POST | reauth; atomic bulk re-encrypted write, bumps `keyVersion` |
| `/api/sessions`, `/api/sessions/[id]` | GET / DELETE | own sessions only |
| `/api/audit` | GET | own events, cursor |
| `/api/audit/client-event` | POST | advisory, allow-listed event types |
| `/api/account` | DELETE | reauth; cascades |

Security headers (middleware/proxy): `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'; require-trusted-types-for 'script'`, `Strict-Transport-Security` (preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (deny camera/mic/geo, allow `clipboard-write` self), `Cross-Origin-Opener-Policy: same-origin`, `Cache-Control: no-store` on all authenticated pages and API responses. Self-host fonts; zero third-party scripts/analytics. (Nonce CSP forces dynamic rendering — acceptable.)

XSS rules: no `dangerouslySetInnerHTML`; notes rendered as plain text (no Markdown→HTML in v1); website links validated to `http(s):` only, `rel="noopener noreferrer"`; React's default escaping everywhere else.

---

## 8. Backup / import / export

**Export (client-side only):**
1. Reauth, fetch all blobs via `/export-data`, decrypt locally.
2. User enters a **separate export passphrase** (must differ from master password; zxcvbn-gated). `exportKey = Argon2id(passphrase, newSalt, params)`.
3. File: `{ "format":"myvault-backup", "version":1, "kdf":{algo,salt,m,t,p}, "suite":1, "iv":…, "createdAt":… }` header + `AES-256-GCM(exportKey, JSON(items+settings), aad = canonical header)`. GCM tag covers header **and** body ⇒ integrity + corruption detection in one primitive. Extension `.mvbackup`; never plaintext by default. (A plaintext CSV export, if ever added, sits behind an explicit scary-confirmation flow and is not in v1.)
4. UI warning: backups are as strong as the passphrase; lose master password **and** Recovery Key (and have no backup+passphrase) ⇒ permanent data loss; there is no backdoor.

**Import (client-side parse):** size cap (e.g. 25 MB) → check `format`/`version` → derive key → decrypt (tag failure ⇒ "wrong passphrase or corrupted file", same message) → **only then** `JSON.parse` → strict Zod validation of every item → **assign fresh item IDs**, re-encrypt each under the current VK with new IVs/AAD → `POST /api/vault/import` (ciphertext only). The server never sees file plaintext, and no filesystem path is ever involved (so no path traversal); upload is read via `File.arrayBuffer()` in the browser.

---

## 9. Threat model

| # | Threat | Impact | Mitigation | Residual |
|---|---|---|---|---|
| 1 | **Database leak** | Attacker gets blobs, `wrappedVK` | Everything AES-GCM encrypted under a key unwrapped only by an Argon2id-derived KEK; server holds no key; `authHash` is hash of a random value | Offline guessing of the master password; strength depends on password → client-side strength gate, strong KDF, stored params upgradable |
| 2 | **Stolen session cookie** | Can call API as you | HttpOnly/Secure/`__Host-`/SameSite=Strict; IP/UA shown in sessions list; revocation; step-up reauth for sensitive ops | Attacker gets **ciphertext only** (no VK). Cannot decrypt, but can delete items (soft-delete + trash + backups) |
| 3 | **XSS** | Code in page can call decrypt while unlocked | Nonce+strict-dynamic CSP, Trusted Types, no raw HTML, no 3rd-party JS, input validation, `lint` ban on `innerHTML`, minimal dependency set | **Most serious residual risk.** Non-extractable key helps only vs. key exfiltration |
| 4 | **Malicious browser extension** | Reads DOM/clipboard/keystrokes | Cannot be fully mitigated; reveal timeouts, masked fields, short clipboard TTL | Accepted; recommend a dedicated browser profile |
| 5 | **Compromised device** (malware/keylogger) | Total | None possible at app layer; lock-on-idle limits window | Out of scope; documented |
| 6 | **Server compromise (active)** | Can serve malicious JS → steals master password | CSP, self-hosting, minimal deps, supply-chain pinning (`npm ci`, lockfile, no postinstall surprises) | Zero-knowledge is **not** guaranteed against an active malicious server (section 0). Real fix = signed client (extension/desktop) later |
| 7 | **Insider / DB admin** | Reads DB | Same as #1; audit; no plaintext; no escrow key | Can see email, IPs, item count/timing |
| 8 | **Brute-force login** | Guess authKey | Client must run Argon2id per guess; server throttles per IP+account with backoff; Argon2id on stored `authHash` | Distributed guessing slowed, not stopped; offline attacks are #1 |
| 9 | **Credential stuffing** | Reused passwords from other breaches | Same throttling; zxcvbn gate encourages unique master password; no email-reset path to abuse | Depends on user not reusing the master password |
| 10 | **CSRF** | Forced state change | SameSite=Strict + Origin/Sec-Fetch-Site check + custom header + JSON-only + no CORS | Low |
| 11 | **IDOR / mass assignment / privilege escalation** | Cross-user access | `userId` only from session; user-scoped DB accessor; `updateMany` with `(id,userId,rev)`; strict Zod; per-user AAD makes foreign blobs undecryptable anyway | Low (and cross-user data is ciphertext) |
| 12 | **Backup theft** | Offline attack on `.mvbackup` | Separate passphrase, Argon2id, AEAD, no plaintext default | Weak passphrase ⇒ crackable; UI warns |
| 13 | **Lost master password** | Permanent data loss | Recovery Key; encrypted backups; honest warnings; **no escrow** | By design |
| 14 | **Session hijacking / fixation** | Account takeover (ciphertext only) | Fresh token on login, hashed at rest, idle+absolute expiry, revoke-all | See #2 |
| 15 | **Clipboard leakage** | Copied secret read by other apps/history | Short TTL overwrite, only while focused; reveal-copy audit (advisory) | OS clipboard history/cloud sync cannot be cleared by a web app |
| 16 | **Browser memory exposure** | Dump shows secrets | Keys non-extractable, zeroed buffers, secret blobs decrypted on demand, auto-hide, lock destroys worker | JS strings can't be wiped; unlocked-state memory dump wins |
| 17 | **Logging leakage** | Secrets in logs/APM | No body logging; redaction list; errors normalised; ciphertext/keys never logged; client never sends plaintext so server has none to leak | Low |
| 18 | **Accidental plaintext storage** | Defeats design | Server only accepts envelope-shaped `Bytes` (suite byte + min length check); no plaintext fields exist in schema; test that API rejects non-envelope payloads; code review checklist | Server can't *verify* a blob is really ciphertext — enforced by client discipline + tests |
| 19 | **Enumeration** (emails) | Learn who has accounts | Fake deterministic prelogin salt; uniform responses on recover/register | Registration of an existing email is still distinguishable unless registration is closed (it is, after setup) |
| 20 | **Ciphertext replay/rollback by server** | Old valid item restored | AAD binding stops substitution; `rev` concurrency; encrypted backups | Rollback to an older valid version isn't cryptographically prevented |

---

## 10. Data flows

**Register**
```
Browser: choose password → zxcvbn gate → salt=rand(16) → masterKey=Argon2id → authKey,KEK
         VK=rand(32); wrappedVK=GCM(KEK,VK); RK=rand(20B); recoveryWrappedVK, rkAuthKey
         show RK once (force "I saved it" confirm + download)
   ──POST {email, authKey, kdf, salt, wrappedVK, recoveryWrappedVK, rkAuthKey}──▶ Server
Server:  validate (zod) → authHash=argon2id(authKey), recoveryAuthHash=argon2id(rkAuthKey) → insert → session → email verify
```

**Login + unlock**
```
Browser ─prelogin(email)─▶ Server ─ salt,kdf (real or fake) ─▶ Browser
Browser: masterKey → authKey, KEK
Browser ─login(email, authKey)─▶ Server: throttle → verify → session cookie → returns wrappedVK
Browser: unwrap VK (GCM tag = password check) → keep as non-extractable key in worker
         GET /vault/items → decrypt overviews → build search/graph/warnings   ⇒ UNLOCKED
```

**Create / edit**
```
Browser: form → split overview/secret → pad → AES-GCM(VK, fresh IV, AAD) ×2 → POST {id, overview, secret}
Server:  session → zod (envelope shape, size caps) → insert with userId from session → audit(secret.created, itemId only)
```

**Reveal / copy**
```
Browser (unlocked only): GET /vault/items/:id → secret blob → decrypt → masked field → Show/Copy
         → auto-hide/clear after timeout → drop reference → (advisory) client-event ping
```

**Lock**: idle timer / button / hidden-tab / logout → drop VK, kill worker, wipe stores & clipboard.

**Change master password**: reauth → unlock with old → new salt+params → new authKey/KEK → `wrappedVK'` (VK unchanged, items untouched) → server atomically swaps and revokes other sessions. Optional "also rotate vault key" re-encrypts every item.

**Recovery**: see section 3.

**Export / Import**: see section 8.

---

## 11. Environment variables (`.env.example`; real values never committed — `.gitignore` covers `.env*` except `.env.example`)

```
MONGODB_URI=                  # mongodb+srv://... (Atlas) or replica-set URI; DB user needs readWrite on one DB only
MONGODB_DB=myvault
APP_URL=                      # canonical origin, e.g. https://vault.example.com — used for Origin checks, cookie scope, email links
PRELOGIN_HMAC_KEY=            # 32+ random bytes (base64). Makes fake salts for unknown emails deterministic. Loss is harmless.
REGISTRATION_ENABLED=true     # set false after creating your account
AUDIT_RETENTION_DAYS=90
```

Not present on purpose: `AUTH_SECRET` (no JWTs), any encryption key (server is zero-knowledge). Compromise of every env var in this file reveals no vault plaintext.

---

## 12. Folder structure (trimmed from the brief)

```
app/
  (auth)/login  register  recover/
  (vault)/dashboard  vault  categories  settings  audit-log/   # server shells; auth via DAL; UI is client-side
  api/auth/…  api/vault/…  api/sessions/…  api/audit/…  api/account/
components/  auth/  vault/  dashboard/  security/  ui/
lib/
  crypto/            # 'client-only': kdf.ts, envelope.ts, keys.ts, generator.ts, fingerprint.ts, backup.ts, worker.ts
  vault-client/      # lock state, idle timer, search index, analysis (client-only)
  server/            # 'server-only': auth/{session,password,throttle}.ts, db/{client,scoped}.ts, audit.ts, guard.ts, email.ts
  validation/        # zod schemas shared by client & server (envelope, items, import file, auth)
types/
# (indexes + $jsonSchema validators live in lib/server/db/indexes.ts)
tests/               # unit (crypto vectors), integration (API/IDOR/CSRF/session), e2e (lock/backup)
```

---

## 13. Remaining phases (unchanged order, small adjustments)

2. Init: Next.js + TS + Tailwind + mongodb driver + Zod; CSP/proxy skeleton; ESLint bans (`Math.random`, `innerHTML`, `console.log` in server code).
3. Auth: derived-key register/login/logout, sessions, throttle, reauth.
4. Vault: crypto module **with known-answer + round-trip + tamper tests first**, then lock/unlock, item CRUD.
5. UI: dashboard, list/search, detail, generator, relationships.
6. Security: audit, session UI, headers, authorization tests.
7. Backup: export/import.
8. Tests: auth, IDOR, CSRF, XSS (CSP/escaping), rate limit, session invalidation, backup round-trip + corruption, lock behaviour.

## 14. Defaults I chose — tell me if any is wrong

- Node runtime + MongoDB (Atlas or self-hosted replica set); not Edge. Vercel + Atlas also works with this design.
- Single owner instance; multi-user is supported by the schema but registration closes after setup.
- Argon2id 64 MiB / t=3 / p=1, benchmarked on your real devices in Phase 2.
- Notes are plain text (no Markdown) in v1.
- Soft delete with 30-day trash.
- Reload locks the vault.
