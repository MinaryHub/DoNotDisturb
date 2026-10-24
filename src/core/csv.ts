// 아주 작은 CSV 파서 (따옴표·쉼표·"" 이스케이프 지원). 로컬라이제이션 문구 파일용.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** key,text 형식 CSV → { key: text } (첫 줄은 헤더) */
export function parseKeyTextCsv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of parseCsv(text).slice(1)) {
    if (key) out[key] = value ?? '';
  }
  return out;
}
