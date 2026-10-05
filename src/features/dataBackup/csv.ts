/** Strict CSV state machine. Quoted fields retain their original CR/LF characters. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let state: 'start' | 'bare' | 'quoted' | 'closed' = 'start'
  function finishField() { row.push(field); field = ''; state = 'start' }
  function finishRow() { finishField(); rows.push(row); row = [] }
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (state === 'quoted') {
      if (character === '"') state = 'closed'
      else field += character
    } else if (state === 'closed' && character === '"') {
      field += '"'; state = 'quoted'
    } else if (character === ',') finishField()
    else if (character === '\r' || character === '\n') {
      finishRow()
      if (character === '\r' && text[index + 1] === '\n') index++
    } else if (state === 'closed') throw new Error(`Malformed CSV: unexpected text after a closing quote near character ${index + 1}.`)
    else if (character === '"') {
      if (state !== 'start') throw new Error(`Malformed CSV: a quote inside an unquoted field near character ${index + 1}.`)
      state = 'quoted'
    } else { field += character; state = 'bare' }
  }
  if (state === 'quoted') throw new Error('Malformed CSV: a quoted field was not closed.')
  if (state !== 'start' || row.length || field.length) finishRow()
  return rows
}
export function writeCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
  return [headers, ...rows].map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n'
}

// Protect every non-empty text cell, including IDs and dates. The marker makes reversal unambiguous.
export const csvTextEncoding = 'my-finance-apostrophe-v1'
export function protectCsvText(value: string): string { return value ? `'${value}` : '' }
export function unprotectCsvText(value: string): string {
  if (!value) return ''
  if (!value.startsWith("'")) throw new Error('Text fields must use the My Finance apostrophe encoding. Use a My Finance export or the documented CSV schema.')
  return value.slice(1)
}
