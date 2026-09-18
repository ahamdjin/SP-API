const isoInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function preserveIsoInstant(value: string) {
  const trimmed = value.trim();
  if (!isoInstantPattern.test(trimmed)) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

export function preserveIsoDate(value: string) {
  const trimmed = value.trim();
  const match = isoDatePattern.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  return trimmed;
}

export function parseCsvFields(line: string) {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (quoted) throw new Error("Unclosed quoted CSV field");
  fields.push(current.trim());
  return fields;
}
