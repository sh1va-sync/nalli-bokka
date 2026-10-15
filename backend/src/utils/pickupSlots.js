const INDIA_OFFSET_MINUTES = 330;
const INDIA_TIME_ZONE = 'Asia/Kolkata';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: INDIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function getIndiaDateParts(date) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(date)
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, Number(value)]));
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function getIndiaDateString(date = new Date()) {
  const { year, month, day } = getIndiaDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return null;
  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function timeToMinutes(value) {
  const match = /^([01]\d|2[0-3]):([03]0)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function indiaLocalTimeToUtc({ year, month, day }, minutes) {
  return new Date(Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60)
    - INDIA_OFFSET_MINUTES * 60_000);
}

export function getPickupSlots({ date, openingTime, closingTime, now = new Date() }) {
  const dateParts = parseDate(date);
  const opensAt = timeToMinutes(openingTime);
  const closesAt = timeToMinutes(closingTime);
  if (!dateParts || opensAt === null || closesAt === null || closesAt <= opensAt) return [];

  const slots = [];
  for (let startMinutes = opensAt; startMinutes + 30 <= closesAt; startMinutes += 30) {
    const startAt = indiaLocalTimeToUtc(dateParts, startMinutes);
    const endAt = indiaLocalTimeToUtc(dateParts, startMinutes + 30);
    if (startAt <= now) continue;
    slots.push({ startAt, endAt });
  }
  return slots;
}

export function isValidPickupTime({ pickupAt, openingTime, closingTime, now = new Date() }) {
  const requestedTime = new Date(pickupAt);
  if (!Number.isFinite(requestedTime.getTime())) return false;
  const date = getIndiaDateString(requestedTime);
  return getPickupSlots({ date, openingTime, closingTime, now })
    .some(({ startAt }) => startAt.getTime() === requestedTime.getTime());
}
