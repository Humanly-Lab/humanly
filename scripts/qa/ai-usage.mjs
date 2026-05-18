#!/usr/bin/env node

import fs from 'node:fs/promises';
import {
  addCheck,
  arg,
  boolArg,
  createQaRun,
  exitForReport,
  fetchJson,
  joinUrl,
  printReportLocation,
  runCheck,
  writeReport,
} from './lib/qa-report.mjs';

const PROVIDERS = {
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    keyEnv: 'TOGETHER_API_KEY',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    extraHeaders: {
      'HTTP-Referer': 'https://app.writehumanly.net',
      'X-Title': 'Humanly QA Harness',
    },
  },
};

function showHelp() {
  console.log(`Humanly AI usage harness

Usage:
  pnpm qa:ai:usage
  QA_AI_EXECUTE=1 QA_AI_PROVIDER=together QA_AI_MODEL=moonshotai/Kimi-K2.6 TOGETHER_API_KEY=... pnpm qa:ai:usage

Environment / flags:
  QA_AI_EXECUTE=1 / --execute          Run live provider checks. Default is plan-only.
  QA_AI_PROVIDER / --provider          together | openrouter
  QA_AI_MODEL / --model                Provider model id for smoke checks
  QA_AI_API_KEY                        Overrides provider-specific key env
  QA_AI_BASE_URL / --base-url          OpenAI-compatible provider base URL
  QA_AI_MANIFEST / --manifest          Matrix manifest path
  QA_OUTPUT_DIR / --output-dir         Report output directory

This skeleton establishes the report/command shape. Full Humanly document x
model x query matrices should extend this command rather than creating new
one-off scripts.
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

const execute = boolArg('execute', 'QA_AI_EXECUTE', false);
const providerName = arg('provider', process.env.QA_AI_PROVIDER || 'together');
const provider = PROVIDERS[providerName];
const model = arg('model', process.env.QA_AI_MODEL);
const baseUrl = arg('base-url', process.env.QA_AI_BASE_URL || provider?.baseUrl);
const manifestPath = arg('manifest', process.env.QA_AI_MANIFEST || 'fixtures/qa/ai-usage/manifest.json');
const apiKey = process.env.QA_AI_API_KEY || (provider ? process.env[provider.keyEnv] : undefined);

const report = createQaRun({
  layer: 'ai-usage',
  title: 'AI Usage Harness',
  config: {
    execute,
    provider: providerName,
    model,
    baseUrl,
    manifestPath,
    hasApiKey: Boolean(apiKey),
  },
});

await runCheck(
  report,
  {
    id: 'manifest-load',
    title: 'AI usage matrix manifest loads',
    target: manifestPath,
  },
  async () => {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);
    const dimensions = {
      documents: manifest.documents?.length || 0,
      queryTypes: manifest.queryTypes?.length || 0,
      modelGroups: manifest.modelGroups?.length || 0,
      requiredSignals: manifest.requiredSignals?.length || 0,
    };
    if (dimensions.documents === 0 || dimensions.queryTypes === 0 || dimensions.requiredSignals === 0) {
      throw new Error('Manifest must include documents, queryTypes, and requiredSignals.');
    }
    return { details: dimensions };
  },
);

if (!execute) {
  addCheck(report, {
    id: 'provider-smoke',
    title: 'Live provider text/tool smoke',
    target: providerName,
    status: 'skip',
    details: {
      reason: 'Set QA_AI_EXECUTE=1 plus provider/model/key env to run live checks.',
    },
  });
} else {
  if (!provider && !baseUrl) {
    addCheck(report, {
      id: 'provider-config',
      title: 'Provider configuration is supported',
      target: providerName,
      status: 'fail',
      critical: true,
      error: `Unknown provider ${providerName}; pass --base-url for a custom OpenAI-compatible endpoint.`,
    });
  } else if (!model || !apiKey || !baseUrl) {
    addCheck(report, {
      id: 'provider-config',
      title: 'Provider credentials are present',
      target: providerName,
      status: 'fail',
      critical: true,
      details: {
        hasModel: Boolean(model),
        hasApiKey: Boolean(apiKey),
        hasBaseUrl: Boolean(baseUrl),
      },
    });
  } else {
    await runCheck(
      report,
      {
        id: 'provider-text',
        title: 'Live provider returns a bounded text answer',
        target: `${providerName}:${model}`,
      },
      async () => {
        const { response, body } = await fetchJson(joinUrl(baseUrl, '/chat/completions'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(provider?.extraHeaders || {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: 'Reply with exactly one short sentence confirming that this is a Humanly QA smoke test.',
              },
            ],
            max_tokens: 120,
            temperature: 0,
          }),
        });
        const content = body?.choices?.[0]?.message?.content || '';
        if (response.status !== 200 || !content.trim()) {
          throw new Error(`Expected non-empty completion, got ${response.status}`);
        }
        return {
          details: {
            status: response.status,
            contentPreview: content.trim().slice(0, 120),
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: 'provider-tool',
        title: 'Live provider accepts OpenAI-compatible tool schema',
        target: `${providerName}:${model}`,
      },
      async () => {
        const { response, body } = await fetchJson(joinUrl(baseUrl, '/chat/completions'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(provider?.extraHeaders || {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: 'Use the tool to report the word humanly.',
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'report_word',
                  description: 'Report one requested word for provider tool-call compatibility smoke tests.',
                  parameters: {
                    type: 'object',
                    properties: {
                      word: { type: 'string' },
                    },
                    required: ['word'],
                  },
                },
              },
            ],
            tool_choice: 'auto',
            max_tokens: 200,
            temperature: 0,
          }),
        });
        const message = body?.choices?.[0]?.message || {};
        const toolCalls = message.tool_calls || [];
        if (response.status !== 200 || toolCalls.length === 0) {
          throw new Error(`Expected at least one tool call, got ${response.status}`);
        }
        return {
          details: {
            status: response.status,
            toolCallCount: toolCalls.length,
            firstToolName: toolCalls[0]?.function?.name || null,
          },
        };
      },
    );
  }
}

await writeReport(report);
printReportLocation(report);
exitForReport(report);
