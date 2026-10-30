import bank from '../../../../../banco_jeopardy_informatica_400.json';
import type { JeopardyQuestion, QuestionLevel } from './jeopardy';

const levels: Record<number, QuestionLevel> = {
  100: 'easy', 200: 'medium', 300: 'hard', 400: 'extreme', 500: 'extreme'
};

export const SISTEMAS_BANK: readonly JeopardyQuestion[] = bank.preguntas.map(question => ({
  level: levels[question.puntaje]!,
  category: question.categoria,
  prompt: question.pregunta,
  answer: question.respuesta,
  reference: ''
}));
