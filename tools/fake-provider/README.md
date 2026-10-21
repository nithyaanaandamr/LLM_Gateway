# @gw/fake-provider

A fake LLM provider for local dev and tests. Tests never spend real money.

**Must support:**
- Chat completions, non-streaming and streaming, with usage in the response
- Configurable behaviour per request: delay, error status, mid-stream disconnect, slow stream
