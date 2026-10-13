# Hisaab Aunty

Chat-first money coach for young Indians. A small language model only understands odd messages; code does all the maths.

- Rules for AI assistants: [CLAUDE.md](CLAUDE.md)
- Docs: [docs/](docs)
- Runnable prototype: [prototype/](prototype)

## Run the prototype
```bash
cd prototype
node build.js && node run-tests.js
node serve.js   # http://localhost:5177
```

## Link the small model
Copy `.env.example` to `.env` (never commit it), then see [docs/SLM_INTEGRATION.md](docs/SLM_INTEGRATION.md).
