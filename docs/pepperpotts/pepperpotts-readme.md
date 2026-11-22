# Pepperpotts — secure receipt prototype

## Scope

Pepperpotts is an independently testable acknowledgement backend and localhost demonstration. It overlays the repository's original `PurvaPhalguni Letterhead.pdf`; it does not redraw or replace the letterhead. PDFs use bundled Liberation Serif, remain A4, are generated on demand, receive an embedded CMS signature, and are independently verified before the server returns them. Generated customer PDFs and signing keys are never public assets or adapter records.

This branch is **not production-ready** and is not connected to PurvaPhalguni. The development adapter, loopback session, JSON index, in-memory rate limiter, and development certificate are deliberately local-only. `pepperpotts-firestore-adapter.mjs` is a testable server-side production adapter boundary, not a deployed route or configured Firebase connection.

## Run on Jack (Ubuntu, Node.js 24)

Dependencies must already be installed. Create a local development signing identity if one is not present:

```sh
mkdir -p .pepperpotts-local/signing
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout .pepperpotts-local/signing/private-key.pem \
  -out .pepperpotts-local/signing/certificate.pem \
  -subj '/CN=Pepperpotts Local Development' -days 30
PEPPERPOTTS_ENABLE_DEMO=1 npm --prefix packages/pepperpotts start
```

Open `http://127.0.0.1:8000`. The page establishes a random, HttpOnly, SameSite loopback session. It can show status, issue the eligible fictional booking exactly once, open/regenerate its signed PDF, open the QR verification result, and mark only the fictional record issued/refunded/revoked. State changes require the loopback session and a matching localhost Origin.

Run focused tests:

```sh
npm --prefix packages/pepperpotts test
```

## Security and data flow

The core receipt-access service requires an authenticated principal and an injected authorization decision. The host application must map its real customer/admin identity to this contract; Pepperpotts does not invent accounts or accept customer identity from request bodies. Authorization occurs before reference-based receipt loading. Production HTTP handlers should return indistinguishable safe responses for denied and nonexistent references.

Issuance accepts only a booking reference. The authoritative adapter supplies payment status, service acceptance, customer, amount, currency, dates, and service details. `VERIFIED` payment and `ACCEPTED` service are mandatory. The receipt identity equals the booking reference, and adapter `getOrCreateIssuance` must be transactional. No browser-supplied financial or eligibility fields participate.

The public QR lookup accepts a random 256-bit token and looks up its SHA-256 hash. It returns only reference, issuance date, service, amount/currency, and current status. It supports issued, refunded, revoked, and not-found states. QR verification checks the server record only; the embedded PDF signature separately checks PDF-byte integrity. A copied QR does not authenticate paper.

The local adapter records issuance/status audit events and uses an atomic JSON rename plus a lock to protect concurrent local requests and restarts. The server applies a small in-memory verification rate limit. Production requires durable transactional persistence, stale-lock-independent concurrency, distributed rate limiting/abuse monitoring, and a tamper-evident audit trail.

Payment display always uses the authoritative paid amount. Zero tax is omitted; configured nonzero tax remains supported. Pepperpotts does not calculate GST and labels the document a payment/service acknowledgement, not a GST tax invoice.

## Production dependencies

Before integration, provide and validate:

1. PurvaPhalguni authentication, receipt ownership/admin authorization, session security, and route-level CSRF/origin policy.
2. A production authoritative adapter backed by reconciled gateway/payment and accepted-service records.
3. Transactional issuance/token-hash persistence, protected token recovery for regeneration, lifecycle audit history, retention policy, and distributed rate limiting.
4. Managed signing keys/certificate outside source/public storage, certificate trust policy, rotation, and operational monitoring.
5. HTTPS official-domain routes, authenticated PDF delivery, safe 404/denial behavior, and security/logging review.
6. Legal/tax review of acknowledgement wording and any future GST configuration.

## Server adapter boundary

`pepperpotts-firestore-adapter.mjs` reads the public booking-reference index, booking, reconciled manual payment claim, and matched bank transaction through Firebase Admin transactions. It requires the host to inject the same `assertBankEvidence` and `receiptFromEvidence` functions used by the Node API, so a browser payment flag or UTR claim cannot become `VERIFIED`. It accepts service acceptance and ledger dates only from explicit host resolvers. No acceptance event or ledger date is inferred from appointment confirmation or bank verification; missing values leave the booking ineligible. The default tax breakdown is zero; a host may inject a reviewed breakdown that balances to the paid amount. The adapter never calculates GST.

Issuance and token-hash index records use deterministic Firestore document IDs and transactional creation. The random verification token is stored only through injected `protectToken`/`recoverToken` functions; production must connect these to a managed key service. Lifecycle changes update the record and append a subcollection audit event transactionally. Firebase Admin bypasses Firestore client rules, so the hosting API must still verify a fresh Firebase ID token, derive UID from it, enforce owner/admin policy, and use safe denial responses. The current branch does not provide that API route, admin policy, managed key service, distributed rate limiter, or production deployment configuration.

Do not transfer the root demo UI, `.pepperpotts-local/`, development keys, or the JSON development adapter into a production deployment.
