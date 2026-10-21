# @gw/gateway

The hot path. Every millisecond here is added to every user request.

**Does:**
1. Hash the gateway key and look it up (Redis cache, Postgres fallback)
2. Check rate limit and budget in Redis (reserve estimated cost)
3. Decrypt the provider key and forward the request
4. Stream the response back
5. On stream end (or disconnect), read token usage and enqueue a log job

**Does not:** write to Postgres directly, compute rollups, send emails.

**Auth:** gateway keys only (`Authorization: Bearer gw_live_...`).
