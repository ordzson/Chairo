import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = resolve('assets/password.md');
const outputPath = resolve('src/app/games/password/domain/word-bank.generated.ts');
const source = await readFile(sourcePath, 'utf8');
const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const words = [];
const seen = new Set();

for (const [index, word] of lines.entries()) {
  if (word.length > 32) {
    throw new Error(`Password: la entrada ${index + 1} supera 32 caracteres: «${word}».`);
  }
  const normalized = word.toLocaleLowerCase('es');
  if (!seen.has(normalized)) {
    seen.add(normalized);
    words.push(word);
  }
}

if (words.length < 2) {
  throw new Error(
    'Password: assets/password.md debe contener al menos dos palabras o frases distintas, una por línea (1–32 caracteres).'
  );
}

const generated = `/** Generado por scripts/generate-password-bank.mjs. No editar a mano. */\n` +
  `export const PASSWORD_WORDS = ${JSON.stringify(words, null, 2)} as const;\n`;

await writeFile(outputPath, generated, 'utf8');
console.log(`Password: ${words.length} entradas escritas en ${outputPath}.`);

