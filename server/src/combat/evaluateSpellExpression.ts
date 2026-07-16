import type { SpellExpression } from "./Spell";

export function evaluateSpellExpression(
  expression: SpellExpression,
  variables: Readonly<{
    level: number;
    magicLevel: number;
    skill: number;
    attack: number;
  }>,
): number {
  if (expression.type === "number") return expression.value;
  if (expression.type === "variable") return variables[expression.name];
  const left = evaluateSpellExpression(expression.left, variables);
  const right = evaluateSpellExpression(expression.right, variables);
  if (expression.operator === "add") return left + right;
  if (expression.operator === "subtract") return left - right;
  if (expression.operator === "multiply") return left * right;
  return right === 0 ? 0 : left / right;
}
