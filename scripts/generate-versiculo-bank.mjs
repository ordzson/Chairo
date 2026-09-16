import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../assets/versiculo-o-inventiculo.md', import.meta.url);
const outputPath = new URL(
  '../src/app/games/versiculo-o-inventiculo/domain/question-bank.generated.ts',
  import.meta.url
);

const difficultyByHeading = new Map([
  ['V-F · Fácil', 'easy'],
  ['V-M · Media', 'medium'],
  ['V-D · Difícil', 'hard'],
  ['V-E · Extrema', 'extreme'],
  // Tres preguntas de cultura visual completan el mínimo de 30 para Fácil.
  ['V-P · Lo que "todos saben" (bloque nuevo)', 'easy']
]);

const markdown = await readFile(sourcePath, 'utf8');
let difficulty = null;
const counts = new Map();
const questions = [];

for (const rawLine of markdown.split(/\r?\n/)) {
  const heading = rawLine.match(/^##\s+(.+)$/)?.[1];
  if (heading) {
    difficulty = difficultyByHeading.get(heading) ?? null;
    continue;
  }
  if (!difficulty) continue;

  const line = rawLine.replace(/^✦\s*/, '');
  const match = line.match(/^"(.+)"\s+—\s+\*\*(VERSÍCULO|INVENTÍCULO)(?:\s+como cita)?\.?\*\*\s*(.*)$/);
  if (!match) continue;

  const [, statement, verdict, remainder] = match;
  const referenceMatch = remainder.match(/^\(([^)]+)\)\s*(.*)$/);
  const reference = referenceMatch?.[1] ?? null;
  const explanation = (referenceMatch?.[2] ?? remainder)
    .replace(/^\s*[.!]\s*/, '')
    .trim() || (verdict === 'VERSÍCULO'
      ? 'La frase aparece en la Biblia.'
      : 'La frase no aparece así en la Escritura.');

  const next = (counts.get(difficulty) ?? 0) + 1;
  counts.set(difficulty, next);
  questions.push({
    id: `${difficulty}-${String(next).padStart(2, '0')}`,
    difficulty,
    statement,
    isVerse: verdict === 'VERSÍCULO',
    reference,
    explanation
  });
}

for (const level of ['easy', 'medium', 'hard', 'extreme']) {
  if ((counts.get(level) ?? 0) < 30) {
    throw new Error(`El banco ${level} solo tiene ${counts.get(level) ?? 0} preguntas.`);
  }
}

const body = `/*\n * Generado desde assets/versiculo-o-inventiculo.md.\n * Ejecuta \`node scripts/generate-versiculo-bank.mjs\` después de editar el banco.\n */\nimport type { GameQuestion } from './match';\n\nexport const QUESTION_BANK: readonly GameQuestion[] = ${JSON.stringify(questions, null, 2)} as const;\n`;

await writeFile(outputPath, body);
console.log(`Banco generado: ${questions.length} preguntas (${[...counts].map(([key, value]) => `${key}: ${value}`).join(', ')}).`);
