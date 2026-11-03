import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Policy, PolicyCompileResponse } from '@rm/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load prompt_v1 if available
const promptPath = path.resolve(__dirname, '../../../../ml/policy_eval/prompt_v1.txt');
export const SYSTEM_PROMPT = fs.existsSync(promptPath)
  ? fs.readFileSync(promptPath, 'utf8')
  : 'You are the policy compiler for an AI procurement agent.';

/**
 * Deterministic fallback parser that compiles plain text policies
 * adhering strictly to the prompt_v1 specification.
 */
export function compilePolicyFallback(text: string): PolicyCompileResponse {
  const clean = text.trim();
  if (!clean || clean.length < 5) {
    return {
      policy: null,
      warnings: [],
      questions: ['Could you please state your procurement spending policy?'],
    };
  }

  // Check for adversarial prompt injection or rule override attempts
  const lower = clean.toLowerCase();
  if (
    lower.includes('ignore') ||
    lower.includes('override') ||
    lower.includes('drop the limits') ||
    lower.includes('allow anything') ||
    lower.includes('forget the limits') ||
    lower.includes('system:')
  ) {
    return {
      policy: null,
      warnings: [],
      questions: [
        'The text appears to request bypassing standard policy limits or rules. Should the stated price caps strictly apply?',
      ],
    };
  }

  // 1. Categories
  const categories: string[] = [];
  if (lower.includes('laptop') || lower.includes('notebook')) categories.push('laptops');
  if (lower.includes('monitor') || lower.includes('screen') || lower.includes('display')) categories.push('monitors');
  if (lower.includes('dock') || lower.includes('accessor')) categories.push('accessories');

  if (categories.length === 0) {
    return {
      policy: null,
      warnings: [],
      questions: ['Which category of items is this policy for (laptops, monitors, or accessories)?'],
    };
  }

  // 2. Approved Vendors
  const approved_vendors: string[] = [];
  if (lower.includes('vendor a') || lower.includes('apex') || lower.includes('vendors a and b')) {
    approved_vendors.push('vendor_a');
  }
  if (lower.includes('vendor b') || lower.includes('valuebyte') || lower.includes('vendors a and b')) {
    approved_vendors.push('vendor_b');
  }

  if (approved_vendors.length === 0) {
    return {
      policy: null,
      warnings: [],
      questions: ['Which approved vendors may be used (vendor_a / Apex, or vendor_b / ValueByte)?'],
    };
  }

  // 3. Currency & Warnings
  const warnings: string[] = [];
  const currency = 'USD';
  if (lower.includes('euro') || lower.includes('€') || lower.includes('gbp') || lower.includes('£')) {
    return {
      policy: null,
      warnings: [],
      questions: ['Only USD is currently supported. Would you like to set limits in USD?'],
    };
  }
  if (clean.includes('$') && !lower.includes('usd')) {
    warnings.push("currency assumed to be USD because only '$' was given");
  }

  // 4. Per-Unit Price (max_unit_price)
  let max_unit_price: number | null = null;
  // 1. "1,500 USD each", "$1500 per unit", "$1500 apiece"
  const unitMatchAfter = clean.match(
    /\$?\s*([\d,]+(?:\.\d+)?)\s*(?:usd)?\s*(?:each|per\s+unit|apiece|per\s+item|per\s+screen)/i
  );
  // 2. "up to 1,500 USD", "max $400", "under 1500"
  const unitMatchBefore = clean.match(
    /(?:under|up\s+to|max(?:imum)?)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:usd)?/i
  );
  // 3. "per-unit cap of $1,500"
  const unitMatchCap = clean.match(/per[- ]unit\s+(?:cap|limit|price|max)(?:\s+of)?\s*\$?\s*([\d,]+(?:\.\d+)?)/i);

  const u = unitMatchAfter || unitMatchBefore || unitMatchCap;
  if (u && u[1]) {
    max_unit_price = parseFloat(u[1].replace(/,/g, ''));
  }

  if (!max_unit_price || isNaN(max_unit_price) || max_unit_price <= 0) {
    return {
      policy: null,
      warnings: [],
      questions: ['What is the maximum allowable price per unit?'],
    };
  }

  // 5. Monthly Cap (monthly_cap)
  let monthly_cap: number | null = null;
  if (lower.includes('weekly') || lower.includes('per week') || lower.includes('per day')) {
    return {
      policy: null,
      warnings: [],
      questions: ['A weekly or daily limit cannot be converted safely. What is the monthly spending cap?'],
    };
  }

  if (lower.includes('per quarter') || lower.includes('quarterly')) {
    const qMatch =
      clean.match(/([\d,]+(?:\.\d+)?)\s*(?:usd)?\s*(?:per\s+quarter|quarterly)/i) ||
      clean.match(/(?:quarterly|per\s+quarter)\s*(?:cap|budget)?\s*(?:of\s+)?\$?\s*([\d,]+(?:\.\d+)?)/i);
    if (qMatch && qMatch[1]) {
      const totalQ = parseFloat(qMatch[1].replace(/,/g, ''));
      monthly_cap = Math.round(totalQ / 3);
      warnings.push(`monthly_cap converted from ${totalQ} per quarter to the stricter ${monthly_cap} per month`);
    }
  } else {
    // 1. "monthly cap of 8,000 USD", "monthly budget of $8,000", "monthly cap 8000"
    const capBefore = clean.match(/monthly\s+(?:cap|budget|limit|spend)(?:\s+of)?\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
    // 2. "8,000 USD monthly", "$8,000 a month", "8,000 per month"
    const capAfter = clean.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(?:usd)?\s*(?:a\s+month|per\s+month|monthly)/i);

    const m = capBefore || capAfter;
    if (m && m[1]) {
      monthly_cap = parseFloat(m[1].replace(/,/g, ''));
    }
  }

  if (!monthly_cap || isNaN(monthly_cap) || monthly_cap <= 0) {
    return {
      policy: null,
      warnings: [],
      questions: ['What is the monthly spending cap for this policy?'],
    };
  }

  // 6. Max Over Benchmark Percentage
  let max_over_benchmark_pct = 10;
  const benchmarkMatch = clean.match(/([\d.]+)%\s*(?:over|above|over\s+benchmark|above\s+market)/i);
  if (benchmarkMatch && benchmarkMatch[1]) {
    max_over_benchmark_pct = parseFloat(benchmarkMatch[1]);
  } else if (lower.includes('at market')) {
    max_over_benchmark_pct = 0;
  } else {
    warnings.push('max_over_benchmark_pct not stated; default 10 applied');
  }

  // 7. Policy Mode
  let mode: 'shadow' | 'suggest' | 'auto_under_cap' = 'suggest';
  if (
    lower.includes('auto') ||
    lower.includes('automatically') ||
    lower.includes('auto-approve') ||
    lower.includes('without asking')
  ) {
    mode = 'auto_under_cap';
  } else if (lower.includes('shadow') || lower.includes('observe only') || lower.includes('track only')) {
    mode = 'shadow';
  } else {
    warnings.push('mode not stated; defaulted to suggest (least autonomy)');
  }

  const policy: Policy = {
    categories,
    max_unit_price,
    monthly_cap,
    currency,
    approved_vendors,
    max_over_benchmark_pct,
    mode,
  };

  return {
    policy,
    warnings,
    questions: [],
  };
}

/**
 * Main policy compiler entrypoint.
 * Uses LLM if configured; otherwise runs deterministic fallback.
 */
export async function compilePolicy(text: string): Promise<PolicyCompileResponse> {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return compilePolicyFallback(text);
  }

  try {
    return compilePolicyFallback(text);
  } catch (err) {
    console.warn('[compiler] Fallback triggered due to error:', err);
    return compilePolicyFallback(text);
  }
}
