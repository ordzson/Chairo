import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/Banco Jeopardy.md', import.meta.url), 'utf8');
const levels = { 'NIVEL 1': 'easy', 'NIVEL 2': 'medium', 'NIVEL 3': 'hard', 'NIVEL 4': 'extreme' };
let level = null;
let category = null;
const questions = [];

for (const rawLine of source.split(/\r?\n/)) {
  const heading = rawLine.match(/^# (NIVEL [1-4])\b/);
  if (heading) {
    level = levels[heading[1]];
    category = null;
    continue;
  }
  if (/^# (CATEGORÍA|APÉNDICE)/.test(rawLine)) {
    level = null;
    category = null;
    continue;
  }
  const categoryMatch = rawLine.match(/^## [FMDE]-[A-H] · (.+)$/);
  if (categoryMatch && level) {
    category = categoryMatch[1].trim();
    continue;
  }
  if (!level || !category) continue;
  const question = rawLine.match(/^\d+\. (.+?) — \*\*(.+?)\*\*(?: \*\((.+?)\)\*)?(?: ⚠.*)?$/);
  if (!question) continue;
  questions.push({ level, category, prompt: question[1].trim(), answer: question[2].trim(), reference: question[3]?.trim() ?? '' });
}

if (questions.length < 300) throw new Error(`Solo se analizaron ${questions.length} preguntas`);

const output = `// Generado desde assets/Banco Jeopardy.md. No editar a mano.\n` +
  `import type { JeopardyQuestion } from './jeopardy';\n\n` +
  `export const JEOPARDY_BANK: readonly JeopardyQuestion[] = ${JSON.stringify(questions, null, 2)} as const;\n`;
writeFileSync(new URL('../src/app/games/jeopardy/domain/question-bank.generated.ts', import.meta.url), output);
console.log(`Generadas ${questions.length} preguntas de Jeopardy.`);
