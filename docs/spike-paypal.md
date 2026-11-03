# Spike 1: PayPal Integration Architecture & Decision Record

**Project:** Autonomous Enterprise Resource Manager  
**Hackathon:** PayPal AI Hackathon 2026  
**Author:** Backend / AI Engineer (BAI)  
**Status:** Completed  
**Companion Docs:** PRD v3.1, Technical Specification v1.0, Task Allocation (BAI Task B2)

---

## 1. Executive Summary & Architecture Decisions

| Decision Area | Selected Approach | Rationale |
| :--- | :--- | :--- |
| **Autonomous Spend Rail** | **Hybrid Rail A + Rail B** | **Rail A** (Vaulted Payment Method / Unattended Capture) powers in-policy autonomous execution under the Intent Mandate cap. **Rail B** (Interactive Approval Link) is reserved for human-signed Cart Mandates exceeding policy caps. |
| **Tool vs. REST Strategy** | **Isolated Vendor-Side Toolkit + REST** | The `@paypal/agent-toolkit` creates and captures orders as the *merchant*. Spend-capable tools are isolated exclusively to Vendor services (`vendor-a`, `vendor-b`). Buyer planner uses read-only REST queries. The LLM never touches payment capture tools directly. |
| **Guard Verifier Purity** | **Zero External Dependencies** | `@rm/guard` remains 100% pure TypeScript. It verifies cryptographically bound mandates and policies before any PayPal API or Vendor Interface call is dispatched. |
| **SaaS Subscription Cancellation** | **REST Direct (`v1/billing/subscriptions/{id}/cancel`)** | Whole-subscription cancellation verified against vendor plan IDs. Idempotent and logged to the tamper-evident hash chain ledger. |

---

## 2. Evaluation of Payment Rails

### Rail A: Vaulted Payer Payment Method (Unattended Capture)
* **How it works:** A manager establishes a vaulted payment method or pre-authorized billing agreement once during onboarding. Autonomous pipeline runs capture payments against this token when purchases pass `@rm/guard` verification without human intervention.
* **Fit with PRD / Spec:** Perfect match for the **Intent Mandate** story. Allows unattended execution under the \$1,500/unit and \$50,000/monthly cap.
* **Security Guardrail:** Cannot move money unless `@rm/guard` outputs `verdict.result === 'auto_approved'`.

### Rail B: Interactive Approval Link (Every Order)
* **How it works:** An order is created in `CREATED` state with an `approve` HATEOAS link. The manager visits the link or approves via WebAuthn/passkey in the UI.
* **Fit with PRD / Spec:** Perfect match for **Cart Mandate** out-of-policy purchases. When a proposal violates unit caps or benchmark margins (`needs_approval`), the manager reviews and approves, generating a signed Cart Mandate.

### Rail C: Payouts API
* **How it works:** Direct wallet-to-wallet transfer from Company account to Vendor merchant account.
* **Evaluation:** Rejected for primary merchant checkout because Payouts API requires special sandbox permissions and lacks standard e-commerce receipt/invoice lineage compared to Orders v2.

**Decision:** We use **Rail A** for autonomous execution and **Rail B** for the human approval queue.

---

## 3. Credential Isolation & Payee Architecture

In PayPal's sandbox ecosystem, API credentials define the actor:
1. **Buyer Account (`Company`):** Holds buyer credentials. Strictly read-only for transaction history and subscription discovery.
2. **Vendor Accounts (`Vendor A`, `Vendor B`):** Hold merchant credentials. Only vendor services can call `create_order`, `pay_order` (capture), and `cancel_subscription`.
3. **Manager Payer (`Personal`):** Sandbox personal account used for one-time vaulting and out-of-policy interactive approvals.

```mermaid
flowchart LR
    A[Workflows / Buyer Agent] -->|1. Request Quote| B[Vendor Interface]
    A -->|2. Verify Quote & Intent| G[@rm/guard Verifier]
    G -->|3. Auto-Approved| B
    B -->|4. Execute Capture| P[PayPal Sandbox Merchant API]
    P -->|5. Order Receipt| L[Tamper-Evident Ledger]
```

---

## 4. Webhooks & Ledger Immutability

* **Webhook Endpoint:** `POST /webhooks/paypal` verifies webhook event signatures and stores events immutably in the hash-chain ledger.
* **Supported Events:**
  - `PAYMENT.CAPTURE.COMPLETED`
  - `BILLING.SUBSCRIPTION.CANCELLED`
  - `CHECKOUT.ORDER.APPROVED`
* Every captured order is bundled into a cryptographic **ProofPack** containing `mandate_hash`, `cart_hash`, `vendor_quote`, `ledger_hash`, and `paypal_order_id`.

