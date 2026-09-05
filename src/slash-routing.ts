export function applySlashCompletion(draft: string, slashStart: number, replaceFrom: number, itemText: string): string {
  if (slashStart < 0) return draft
  const currentToken = draft.slice(slashStart)
  const replacement = replaceFrom > 1
    ? `${currentToken.slice(0, replaceFrom)}${itemText}`
    : itemText
  return `${draft.slice(0, slashStart)}${replacement} ${draft.slice(slashStart + currentToken.length)}`
}
