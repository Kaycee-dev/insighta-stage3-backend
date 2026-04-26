const PROFILE_EXPORT_COLUMNS = [
  'id',
  'name',
  'gender',
  'gender_probability',
  'age',
  'age_group',
  'country_id',
  'country_name',
  'country_probability',
  'created_at',
];

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function profilesToCsv(rows) {
  const lines = [PROFILE_EXPORT_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(PROFILE_EXPORT_COLUMNS.map((column) => escapeCsvValue(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

module.exports = { PROFILE_EXPORT_COLUMNS, profilesToCsv };
