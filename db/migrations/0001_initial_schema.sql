-- ============================================================================
-- Migration: 0001_initial_schema.sql
-- Autonomous Enterprise Resource Manager (Spec 6)
-- ============================================================================

-- Policies table
CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY,
    source_text TEXT NOT NULL,
    compiled JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mandates table (Intent & Cart)
CREATE TABLE IF NOT EXISTS mandates (
    id UUID PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('intent', 'cart')),
    parent_id UUID REFERENCES mandates(id) ON DELETE SET NULL,
    issuer TEXT NOT NULL,
    payload JSONB NOT NULL,
    payload_hash TEXT NOT NULL,
    signature JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired', 'used')) DEFAULT 'active',
    nonce TEXT UNIQUE NOT NULL,
    not_before TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revocations table (for kill switch and manual revocations)
CREATE TABLE IF NOT EXISTS revocations (
    mandate_id UUID PRIMARY KEY REFERENCES mandates(id) ON DELETE CASCADE,
    reason TEXT,
    revoked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hardware & Physical Assets
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY,
    asset_tag TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    sku TEXT,
    purchased_at DATE NOT NULL,
    replace_after_months INT NOT NULL DEFAULT 36,
    status TEXT NOT NULL DEFAULT 'active',
    assigned_to TEXT,
    purchase_price NUMERIC(12, 2)
);

-- SaaS Subscriptions
CREATE TABLE IF NOT EXISTS saas_subscriptions (
    id UUID PRIMARY KEY,
    app TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    paypal_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    paypal_subscription_id TEXT,
    seat_price NUMERIC(12, 2),
    seat_count INT DEFAULT 0,
    monthly_cost NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
);

-- SaaS Seats (per-user utilization)
CREATE TABLE IF NOT EXISTS seats (
    id UUID PRIMARY KEY,
    subscription_id UUID NOT NULL REFERENCES saas_subscriptions(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    last_active_at TIMESTAMPTZ NOT NULL,
    weekly_sessions_13w JSONB
);

-- Agent Autonomous Runs
CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY,
    trigger TEXT NOT NULL CHECK (trigger IN ('cron', 'manual', 'arena')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'awaiting_approval', 'completed', 'failed', 'halted')) DEFAULT 'queued',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    mode TEXT CHECK (mode IN ('shadow', 'suggest', 'auto_under_cap'))
);

-- Generated Proposals
CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY,
    run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('purchase', 'cancel')),
    payload JSONB NOT NULL,
    benchmark JSONB,
    verdict TEXT NOT NULL CHECK (verdict IN ('auto_approved', 'needs_approval', 'blocked')),
    failing_rules TEXT[] DEFAULT '{}',
    reason TEXT,
    status TEXT NOT NULL CHECK (status IN ('needs_approval', 'auto_approved', 'blocked', 'executed', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Executed Purchase Orders
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
    mandate_id UUID REFERENCES mandates(id) ON DELETE SET NULL,
    vendor_id TEXT NOT NULL,
    paypal_order_id TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription Cancellations
CREATE TABLE IF NOT EXISTS cancellations (
    id UUID PRIMARY KEY,
    proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES saas_subscriptions(id) ON DELETE SET NULL,
    savings_monthly NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Append-Only Cryptographic Audit Ledger
CREATE TABLE IF NOT EXISTS ledger (
    seq BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    ref_id UUID,
    data JSONB NOT NULL,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safety Circuit Breaker Events
CREATE TABLE IF NOT EXISTS breaker_events (
    id UUID PRIMARY KEY,
    rule TEXT NOT NULL,
    details JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Arena Test Runs
CREATE TABLE IF NOT EXISTS arena_runs (
    id UUID PRIMARY KEY,
    case_id TEXT NOT NULL,
    input TEXT NOT NULL,
    outcome TEXT NOT NULL,
    failing_rule TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backtest Evaluation Runs
CREATE TABLE IF NOT EXISTS backtest_runs (
    id UUID PRIMARY KEY,
    days INT NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mandates_status ON mandates(status);
CREATE INDEX IF NOT EXISTS idx_mandates_nonce ON mandates(nonce);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_seats_sub_id ON seats(subscription_id);
CREATE INDEX IF NOT EXISTS idx_ledger_seq ON ledger(seq);
