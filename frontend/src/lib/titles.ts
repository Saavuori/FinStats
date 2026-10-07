/** Table titles arrive as "11rb -- Population…"; drop the leading code. */
export function cleanTitle(text: string): string {
  return text.replace(/^\w+\s*--\s*/, '')
}
