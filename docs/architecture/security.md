# Security

## Bring Your Own Key (BYOK)

- Users paste their own provider key. No money passes through us.
- Provider keys are encrypted at rest with **AES-GCM**. Stored as `nonce + ciphertext + tag`.
- The master key lives in a secret store (later KMS with envelope encryption), never in code or the DB.

## Gateway keys

- Format: `gw_live_<random>` (32 random bytes).
- Shown **once** at creation. Only the SHA-256 hash is stored.
- Revocable. Revocation must also clear the Redis key cache.

## Two kinds of auth

| Surface | Credential | Never accepts |
|---|---|---|
| Gateway | Gateway key (Bearer) | Session cookies |
| Admin API | Session cookie | Gateway keys |

## Privacy

- Default logs are metadata only: tokens, cost, latency, model, status.
- Prompt and response logging is opt-in per project.

## Abuse protection

Rate limits, input length limits, budget caps, keys kept server-side only.

## Before going public

Read each provider's usage policy.
