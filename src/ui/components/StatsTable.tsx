import React, { useMemo, useState } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  title?: string; // tooltip / definition
  value: (row: T) => number | string | null | undefined;
  format?: (v: number | string | null | undefined, row: T) => string;
  align?: 'left' | 'right';
  /** Lower is better (e.g., ERA), used for sort direction default. */
  lowerIsBetter?: boolean;
}

export interface StatsTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  defaultSort?: string;
  highlight?: (row: T) => boolean;
  totalRow?: T;
  onRowClick?: (row: T) => void;
  emptyText?: string;
}

/** Sortable, horizontally scrollable statistics table with a sticky first column. */
export function StatsTable<T>({ rows, columns, rowKey, defaultSort, highlight, totalRow, onRowClick, emptyText = 'No data yet.' }: StatsTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSort);
  const [desc, setDesc] = useState(true);
  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      const na = va == null || va === '' ? null : typeof va === 'number' ? va : Number.isFinite(Number(va)) ? Number(va) : null;
      const nb = vb == null || vb === '' ? null : typeof vb === 'number' ? vb : Number.isFinite(Number(vb)) ? Number(vb) : null;
      if (na == null && nb == null) return String(va ?? '').localeCompare(String(vb ?? ''));
      if (na == null) return 1;
      if (nb == null) return -1;
      return desc ? nb - na : na - nb;
    });
  }, [rows, sortKey, desc, columns]);

  const click = (c: Column<T>) => {
    if (sortKey === c.key) setDesc(!desc);
    else {
      setSortKey(c.key);
      setDesc(!c.lowerIsBetter);
    }
  };
  const fmt = (c: Column<T>, row: T) => {
    const v = c.value(row);
    if (c.format) return c.format(v, row);
    if (v == null || v === '') return '-';
    return String(v);
  };

  if (!rows.length) return <div className="empty">{emptyText}</div>;
  return (
    <div className="table-wrap">
      <table className="stats">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} title={c.title} onClick={() => click(c)} style={{ textAlign: c.align ?? (columns[0] === c ? 'left' : 'right') }}>
                {c.label}
                {sortKey === c.key ? (desc ? ' ▾' : ' ▴') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className={highlight?.(row) ? 'focus' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
              {columns.map((c) => {
                const text = fmt(c, row);
                return (
                  <td key={c.key} className={text === '-' ? 'na' : ''} style={{ textAlign: c.align ?? (columns[0] === c ? 'left' : 'right') }}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
          {totalRow && (
            <tr className="total">
              {columns.map((c, i) => (
                <td key={c.key} style={{ textAlign: c.align ?? (i === 0 ? 'left' : 'right') }}>
                  {i === 0 ? 'Team' : fmt(c, totalRow)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
