import fs from 'fs';
import path from 'path';

// Parse .env using Node built-ins
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const clean = line.trim();
      if (!clean || clean.startsWith('#')) continue;
      const idx = clean.indexOf('=');
      if (idx !== -1) {
        const key = clean.substring(0, idx).trim();
        let val = clean.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

async function testLLM() {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || 'deepseek-flash';

  console.log('===========================================================');
  console.log('  Testing DeepSeek LLM API Key');
  console.log('===========================================================');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Model:    ${model}`);
  console.log(`API Key:  ${apiKey ? apiKey.substring(0, 7) + '...' + apiKey.substring(apiKey.length - 4) : 'MISSING'}\n`);

  if (!apiKey) {
    console.error('Error: LLM_API_KEY is not defined in .env');
    process.exit(1);
  }

  const endpoint = `${baseUrl}/chat/completions`;
  const startTime = Date.now();
  console.log(`Sending test prompt to ${endpoint}...`);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant. Answer concisely in one sentence.',
          },
          {
            role: 'user',
            content: 'Say hello to the hackathon team and give a quick greeting.',
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    const elapsed = Date.now() - startTime;

    if (!res.ok) {
      const errText = await res.text();
      console.error(`\nAPI Error (${res.status} ${res.statusText}):`);
      console.error(errText);
      process.exit(1);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const msg = json.choices?.[0]?.message;
    const content = msg?.content?.trim();
    const reasoning = msg?.reasoning_content?.trim();

    console.log('\nSUCCESS! DeepSeek responded in ' + elapsed + 'ms:');
    if (reasoning) {
      console.log(`[Thinking Process]: ${reasoning.substring(0, 150)}...`);
    }
    console.log(`\n> "${content || reasoning || '(No text returned)'}"\n`);

    if (json.usage) {
      console.log(`Tokens used: ${json.usage.total_tokens} (Prompt: ${json.usage.prompt_tokens}, Completion: ${json.usage.completion_tokens})`);
    }
  } catch (err) {
    console.error('\nNetwork or execution error:', err);
    process.exit(1);
  }
}

testLLM();
