export function normalizePhone(phone: string) {
  return phone.replace(/[^\d]/g, "");
}
