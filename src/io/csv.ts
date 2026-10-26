/**
 * Minimal RFC 4180 CSV parser and writer.
 *
 * Handles quoted fields, doubled quotes inside quoted fields, CRLF and LF line
 * endings, a leading UTF-8 BOM, and a trailing newline (which does not create
 * an extra empty row). Blank lines are kept as empty rows so callers can see
 * section breaks (GameChanger puts a blank row before its Glossary row).
 */

export function parseCsv(text: string): string[][] {
  let src = text;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = src.length;

  while (i < n) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      // CRLF or lone CR
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += src[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Last field / row (no trailing newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A blank line in the middle produces [''] from the splitter above; normalize to [] so
  // callers can test `row.length === 0` for blank rows.
  return rows.map((r) => (r.length === 1 && r[0] === '' ? [] : r));
}

function escapeField(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows: Array<Array<unknown>>): string {
  return rows.map((r) => r.map(escapeField).join(',')).join('\r\n') + '\r\n';
}
