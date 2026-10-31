# @gw/shared

Code used by more than one app.

- Zod schemas for API contracts (types are inferred from them)
- Cost calculation (tokens × dated price)
- Key format helpers (`gw_live_...`)
- Crypto helpers (AES-GCM encrypt/decrypt, key hashing)

No app-specific logic. No I/O.

## Crypto (`@gw/shared/crypto`)

- `parseMasterKey({ version, base64 })`: strict parser; turns the `MASTER_KEY` text into a `MasterKey` (exactly 32 bytes, held as a `KeyObject`).
- `encryptProviderKey({ plaintext, projectId, masterKey })`: locks a provider key (AES-256-GCM, fresh nonce, bound to the project).
- `decryptProviderKey({ encrypted, projectId, masterKeys })`: unlocks it; throws if the project, key or bytes don't match.
- `generateGatewayKey()`: new `gw_live_…` key plus its SHA-256 `keyHash` and display `keyPrefix`.
- `isGatewayKey(value)`: strict format check.
- `hashGatewayKey(key)`: SHA-256 of a valid gateway key (for the DB lookup).
- `InvalidMasterKeyError`, `UnknownMasterKeyVersionError`, `ProviderKeyDecryptError`: error classes; messages never contain secrets.

Notes:

- Master key: generate with `openssl rand -base64 32`. The app reads the env var and calls `parseMasterKey`; `shared` never reads env.
- Never log `key` from `generateGatewayKey` or a decrypted provider key.
- Not exported from the main entry (`@gw/shared`), so it stays browser-safe.
