/** Нормализация номера (РФ: +7XXXXXXXXXX) */
function normalizePhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

function phonePlaceholderEmail(normalizedPhone) {
  const digits = normalizedPhone.replace(/\D/g, '');
  return `phone_${digits}@phone.myway.local`;
}

module.exports = { normalizePhone, phonePlaceholderEmail };
