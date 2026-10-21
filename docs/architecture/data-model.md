# Data model *(draft)*

To be specified in Phase 1. Starting entities:

```
users ──< projects ──< gateway_keys
              │
              ├── provider_keys (encrypted)
              └── budget settings

model_pricing (provider, model, input_price, output_price, valid_from)

logs schema:
  request_logs (key, model, tokens in/out, cost in/out, latency, status, time)
  rollups_hourly, rollups_daily
```

Open questions:
- [ ] One provider key per project, or several?
- [ ] Budget at project level, key level, or both?
- [ ] Partition `request_logs` by month?
