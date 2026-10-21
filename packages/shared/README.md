# @gw/shared

Code used by more than one app.

- Zod schemas for API contracts (types are inferred from them)
- Cost calculation (tokens × dated price)
- Key format helpers (`gw_live_...`)
- Crypto helpers (AES-GCM encrypt/decrypt, key hashing)

No app-specific logic. No I/O.
