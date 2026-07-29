const BOUNDED_A1 = /^(?:'([^']|'')+'|[^!]+)!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/u;

export interface A1RangeSize {
  range: string;
  rows: number;
  columns: number;
  cells: number;
}

export function inspectBoundedA1Range(range: string): A1RangeSize {
  const match = BOUNDED_A1.exec(range.trim());
  if (!match) {
    throw new Error(`Sheets range must include a bounded sheet, columns, and rows: ${range}`);
  }

  const startColumn = columnNumber(match[2] ?? '');
  const startRow = Number(match[3]);
  const endColumn = columnNumber(match[4] ?? '');
  const endRow = Number(match[5]);

  if (endColumn < startColumn || endRow < startRow) {
    throw new Error(`Sheets range is reversed: ${range}`);
  }

  const rows = endRow - startRow + 1;
  const columns = endColumn - startColumn + 1;
  return { range, rows, columns, cells: rows * columns };
}

export function validateBoundedRanges(ranges: string[], maxCellsPerRange = 10_000): A1RangeSize[] {
  if (ranges.length === 0) throw new Error('At least one Sheets range is required');
  if (!Number.isSafeInteger(maxCellsPerRange) || maxCellsPerRange < 1) {
    throw new Error('maxCellsPerRange must be a positive safe integer');
  }

  return ranges.map((range) => {
    const size = inspectBoundedA1Range(range);
    if (size.cells > maxCellsPerRange) {
      throw new Error(`Sheets range exceeds ${maxCellsPerRange} cells: ${range}`);
    }
    return size;
  });
}

function columnNumber(column: string): number {
  if (!/^[A-Z]+$/u.test(column)) throw new Error(`Invalid Sheets column: ${column}`);
  let value = 0;
  for (const character of column) value = value * 26 + character.charCodeAt(0) - 64;
  return value;
}
