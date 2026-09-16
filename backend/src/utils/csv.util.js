export const toCsv = (rows, columns) => {
  const escapeCell = (value) => {
    if (value === null || value === undefined) {
      return '';
    }

    const str = String(value);

    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  };

  const header = columns.map((c) => c.label).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCell(row[c.key])).join(',')
  );

  return [header, ...lines].join('\n');
};
