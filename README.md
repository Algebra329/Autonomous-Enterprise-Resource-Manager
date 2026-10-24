# Autonomous Enterprise Resource Manager

PayPal AI Hackathon 2026. Docs: `docs/` (PRD v3.1, Technical Specification).

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env            # fill in sandbox credentials
cp apps/web/.env.example apps/web/.env
cp apps/ml/.env.example apps/ml/.env
```

First-time dependency install (run once, then commit `pnpm-lock.yaml`):

```bash
pnpm add -Dw typescript tsx vitest eslint typescript-eslint prettier @types/node
pnpm --filter @rm/api add fastify zod drizzle-orm pg ai
pnpm --filter @rm/web add react react-dom ag-studio ag-studio-react @simplewebauthn/browser
pnpm --filter @rm/web add -D vite @vitejs/plugin-react @types/react @types/react-dom
pnpm --filter @rm/guard add canonicalize jose
pnpm --filter @rm/shared add zod
pnpm --filter @rm/paypal add @paypal/agent-toolkit
pnpm --filter @rm/channel3 add @channel3/sdk
pnpm --filter @rm/agent add ai zod
```

Install ag-studio and ag-studio-react at the same version.

## Common commands

`pnpm dev:api` `pnpm dev:web` `pnpm lint` `pnpm typecheck` `pnpm test` `pnpm arena:run` `pnpm demo:reset`

ML service: `cd apps/ml && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload`

## Rules

- `packages/guard` is pure TypeScript with no network, DB, PayPal or LLM imports (enforced by ESLint).
- `@rm/paypal/vendor` is imported only by vendor services.
- The LLM never gets a spend-capable tool. ML scores are advisory; the verifier decides.
- Sandbox credentials only. Never commit `.env`.
