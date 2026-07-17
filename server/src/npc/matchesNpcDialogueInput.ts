export function matchesNpcDialogueInput(
  input: string,
  alternatives: ReadonlyArray<ReadonlyArray<string>>,
): boolean {
  const inputWords = words(input);
  return alternatives.some((keywords) => {
    let nextIndex = 0;
    for (const keyword of keywords) {
      const keywordWords = words(keyword);
      const foundAt = findSequence(inputWords, keywordWords, nextIndex);
      if (foundAt === -1) return false;
      nextIndex = foundAt + keywordWords.length;
    }
    return true;
  });
}

function words(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function findSequence(
  input: ReadonlyArray<string>,
  wanted: ReadonlyArray<string>,
  start: number,
): number {
  if (wanted.length === 0) return -1;
  for (let index = start; index <= input.length - wanted.length; index++) {
    if (wanted.every((word, offset) => input[index + offset] === word)) {
      return index;
    }
  }
  return -1;
}
