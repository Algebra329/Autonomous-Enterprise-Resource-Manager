# Autonomous Enterprise Resource Manager — API Documentation

**Fastify Backend API Specification**  
**Base URL (Local):** `http://localhost:3000`  
**Base URL (Production):** `https://<deployed-domain>.onrender.com`  
**Postman Collection:** [`postman_collection.json`](file:///c:/Users/HomePC/Documents/Autonomous-Enterprise-Resource-Manager/docs/api/postman_collection.json) *(Directly importable into Postman)*

---

## Quick Start for Frontend Engineers (SWE)

1. Open Postman $\rightarrow$ Click **Import** $\rightarrow$ Select `docs/api/postman_collection.json`.
2. The collection has a variable `{{baseUrl}}` set to `http://localhost:3000` by default.
3. Start the API locally:
   ```bash
   pnpm --filter @rm/api dev
   ```

---

## Endpoints Summary Table

| Method | Endpoint | Group | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | System | Health check & service metadata |
| `POST` | `/v1/policies/compile` | Policies | Compile natural language to Policy JSON (via DeepSeek LLM) |
| `POST` | `/v1/mandates/intent` | Mandates | Register an Intent Mandate signed by a manager |
| `GET` | `/v1/mandates` | Mandates | List active/revoked mandates |
| `POST` | `/v1/mandates/:id/revoke` | Mandates | Revoke a mandate by ID or nonce |
| `GET` | `/v1/keys/:issuer` | Mandates | Retrieve issuer's JWK public key |
| `GET` | `/v1/proposals` | Proposals | List proposals for the human Approval Queue |
| `POST` | `/v1/proposals/:id/approve` | Proposals | Approve out-of-policy proposal with WebAuthn passkey |
| `POST` | `/v1/proposals/:id/reject` | Proposals | Reject proposal from queue |
| `GET` | `/v1/orders/:id/proof-pack` | Orders | Retrieve cryptographic ProofPack for auditor review |
| `GET` | `/v1/ledger` | Audit | Query tamper-evident hash-chained ledger entries |
| `GET` | `/v1/dashboard/studio` | Dashboard | Studio summary metrics (spend, savings, queue size) |
| `GET` | `/v1/dashboard/backtest` | Dashboard | 90-day synthetic replay for backtest charts |
| `GET` | `/v1/dashboard/stream` | Dashboard | Server-Sent Events (SSE) live push stream |
| `GET` | `/v1/safety/breaker` | Safety | Circuit breaker status & rolling 1-hr velocity metrics |
| `POST` | `/v1/safety/kill-switch` | Safety | Emergency kill-switch to halt all runs and revoke mandates |
| `POST` | `/v1/runs` | Automation | Manually trigger autonomous 5-stage procurement run |
| `GET` | `/v1/runs` | Automation | List history of autonomous pipeline executions |
| `POST` | `/webhooks/paypal` | Webhooks | Ingest and audit PayPal webhooks |

---

## Detailed Endpoint Specifications

### 1. Policies

#### `POST /v1/policies/compile`
Compiles plain English procurement instructions into a strict, type-safe Policy object.

* **Request Body:**
  ```json
  {
    "text": "Buy ergonomic monitors and Mac laptops under $1800, max spend 25000 a month with vendor A."
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "policy": {
      "categories": ["monitors", "laptops"],
      "max_unit_price": 1800,
      "monthly_cap": 25000,
      "currency": "USD",
      "approved_vendors": ["vendor_a"],
      "max_over_benchmark_pct": 10,
      "mode": "auto_under_cap"
    },
    "warnings": [],
    "questions": []
  }
  ```

---

### 2. Proposals & Approval Queue

#### `GET /v1/proposals`
Lists purchase proposals and seat cancellations for the approval queue.
* **Query Parameters:** `status` (`needs_approval`, `auto_approved`, `executed`, `rejected`)
* **Response `200 OK`:**
  ```json
  [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "kind": "purchase",
      "status": "needs_approval",
      "payload": {
        "vendor_id": "vendor_a",
        "sku": "LAP-14",
        "quantity": 2,
        "unit_price": 1450,
        "currency": "USD",
        "quote_id": "quote-sample-01"
      },
      "benchmark": {
        "source": "channel3",
        "market_price": 1400,
        "checked_at": "2026-11-04T12:00:00Z",
        "title": "Business 14 Laptop"
      },
      "verdict": "needs_approval",
      "failing_rules": ["UNIT_PRICE_EXCEEDED"],
      "reason": "Above per-unit cap of $1400",
      "created_at": "2026-11-04T12:00:00Z"
    }
  ]
  ```

#### `POST /v1/proposals/:id/approve`
Approves an out-of-policy proposal with a WebAuthn passkey signature or ES256 signature. Executes the PayPal order and commits to the ledger.

* **Request Body:**
  ```json
  {
    "cart_mandate": {
      "type": "cart",
      "issuer": "alice@company.com",
      "parent": "parent-intent-id",
      "cart": {
        "vendor_id": "vendor_a",
        "sku": "LAP-14",
        "quantity": 2,
        "unit_price": 1450,
        "total": 2900,
        "currency": "USD",
        "quote_id": "quote-sample-01"
      },
      "nonce": "nonce-cart-01",
      "expires": "2026-12-31T23:59:59Z"
    },
    "signature": {
      "kind": "webauthn",
      "payload": {
        "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4/krbkhiEkfBQMWuu63lnQBAAAAAw==",
        "clientDataJSON": "eyJjaGFsbGVuZ2UiOiJjYXJ0LWhhc2gtMTIzNCJ9",
        "signature": "MEUCIQCv3bW5gP..."
      }
    }
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "status": "approved_and_executed",
    "order_id": "c1f7b992-...",
    "paypal_order_id": "PAYPAL-8F448148",
    "ledger_hash": "a4d3f8...",
    "amount": 2900,
    "currency": "USD"
  }
  ```

---

### 3. Orders & Proof Packs

#### `GET /v1/orders/:id/proof-pack`
Returns a standalone cryptographic ProofPack proving policy adherence, manager signature, and ledger inclusion.

* **Response `200 OK`:**
  ```json
  {
    "proof_pack": {
      "version": "1.0",
      "order_id": "c1f7b992-...",
      "mandate": { ... },
      "signature": { ... },
      "vendor_quote": { ... },
      "ledger_entry": {
        "hash": "a4d3f8...",
        "prev_hash": "...",
        "seq": 4
      },
      "generated_at": "2026-11-04T12:00:00Z"
    }
  }
  ```

---

### 4. Safety & Circuit Breaker

#### `GET /v1/safety/breaker`
Returns circuit breaker state and rolling 1-hour metrics.
* **Response `200 OK`:**
  ```json
  {
    "circuit_breaker": {
      "state": "closed",
      "last_tripped": null,
      "rules": {
        "max_orders_per_hour": 3,
        "max_spend_per_hour": 3000,
        "over_benchmark_pct": 10
      },
      "rolling_metrics": {
        "orders_last_hour": 1,
        "spend_last_hour": 25.00
      }
    },
    "kill_switch_active": false
  }
  ```

#### `POST /v1/safety/kill-switch`
Engages emergency kill-switch. Revokes all active mandates and halts all runs.
* **Response `200 OK`:**
  ```json
  {
    "status": "halted",
    "kill_switch_active": true,
    "circuit_breaker_open": true,
    "revoked_mandates_count": 5,
    "message": "Kill switch engaged. All active mandates revoked and autonomous runs halted."
  }
  ```

---

### 5. Tamper-Evident Ledger

#### `GET /v1/ledger`
Returns the append-only ledger entries linked by SHA-256 hash chains.
* **Response `200 OK`:**
  ```json
  [
    {
      "seq": 1,
      "type": "purchase_auto_executed",
      "ref_id": "order-123",
      "data": { ... },
      "prev_hash": "0000000000000000000000000000000000000000000000000000000000000000",
      "hash": "7a8b9c...",
      "timestamp": "2026-11-04T12:00:00Z"
    }
  ]
  ```

---

### 6. Dashboard & AG Studio

#### `GET /v1/dashboard/studio`
Returns summary metrics for the Next.js overview screen.
* **Response `200 OK`:**
  ```json
  {
    "total_spend": 12500,
    "total_savings": 2437.46,
    "pending_proposals_count": 3,
    "ledger_entries_count": 14,
    "breaker_state": "closed"
  }
  ```

#### `GET /v1/dashboard/stream`
Server-Sent Events (SSE) connection:
```javascript
const eventSource = new EventSource('http://localhost:3000/v1/dashboard/stream');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Live update:', data);
};
```

