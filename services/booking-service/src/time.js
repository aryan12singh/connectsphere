// Require millisecond precision and an unambiguous instant. Date.parse alone
// silently normalizes bad days and truncates finer fractional seconds.
function instant(value, field) {
  const parts = typeof value === 'string'
    ? value.match(/^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/)
    : null;
  if (!parts) throw new RangeError(`${field} must be an ISO date-time with an explicit offset and at most millisecond precision`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const parsed = Date.parse(value);
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59
    || !Number.isFinite(parsed)) {
    throw new RangeError(`${field} must be a valid ISO date-time`);
  }
  return parsed;
}

module.exports = { instant };
