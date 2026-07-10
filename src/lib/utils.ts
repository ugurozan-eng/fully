export function formatPhone(phone: string | undefined): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (/^0\s*\(?\s*5/.test(trimmed)) {
    return '+90' + trimmed.slice(1);
  }
  return trimmed;
}
