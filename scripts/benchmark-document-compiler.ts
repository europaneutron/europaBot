import { config } from 'dotenv';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

interface ExpectedFact {
  key: string;
  value: unknown;
}

async function main() {
  const pdfPath = process.env.COMPILER_BENCHMARK_PDF;
  const truthPath = process.env.COMPILER_BENCHMARK_TRUTH;
  if (!pdfPath || !truthPath) {
    throw new Error('Define COMPILER_BENCHMARK_PDF y COMPILER_BENCHMARK_TRUTH');
  }

  const { getAiModel, getOpenAIClient } = await import('../src/services/ai/openai.service');
  const [client, capableModel] = await Promise.all([getOpenAIClient(), getAiModel('extraction')]);
  const economicModel = process.env.COMPILER_BENCHMARK_ECONOMIC_MODEL || await getAiModel('writing');
  const truth = JSON.parse(readFileSync(resolve(truthPath), 'utf8')) as ExpectedFact[];
  const fileData = `data:application/pdf;base64,${readFileSync(resolve(pdfPath)).toString('base64')}`;

  for (const model of [economicModel, capableModel]) {
    const startedAt = Date.now();
    const response = await client.responses.create({
      model,
      store: false,
      input: [{
        role: 'user',
        content: [
          { type: 'input_file', file_data: fileData, filename: 'benchmark.pdf' },
          { type: 'input_text', text: 'Extrae hechos atómicos. Devuelve JSON {"facts":[{"key":"...","value":...,"page":1}]}. No inventes y exige página.' },
        ],
      }],
      text: { format: { type: 'json_object' } },
    });
    const extracted = JSON.parse(response.output_text).facts as ExpectedFact[];
    const expected = new Set(truth.map(fact => JSON.stringify([fact.key, fact.value])));
    const actual = new Set(extracted.map(fact => JSON.stringify([fact.key, fact.value])));
    const matches = Array.from(expected).filter(fact => actual.has(fact)).length;
    const unsupported = Array.from(actual).filter(fact => !expected.has(fact)).length;
    console.log(JSON.stringify({
      model,
      elapsedMs: Date.now() - startedAt,
      expectedFacts: expected.size,
      matchedFacts: matches,
      unsupportedFacts: unsupported,
      recall: expected.size ? matches / expected.size : 0,
    }, null, 2));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
