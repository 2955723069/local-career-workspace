const ABSOLUTE_ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/;

export function assertAbsoluteIsoTimestamp(value: string, field: string): void {
  const match = ABSOLUTE_ISO_PATTERN.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid ${field}: expected an ISO timestamp`);
  }

  const [, year, month, day, hour, minute, second, zone, , offsetHour, offsetMinute] =
    match;
  const maximumDay = new Date(
    Date.UTC(Number(year), Number(month), 0),
  ).getUTCDate();
  const invalidCalendar =
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > maximumDay ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59;
  const invalidOffset =
    zone !== "Z" &&
    (Number(offsetHour) > 14 ||
      Number(offsetMinute) > 59 ||
      (Number(offsetHour) === 14 && Number(offsetMinute) !== 0));

  if (invalidCalendar || invalidOffset) {
    throw new Error(`Invalid ${field}: expected an ISO timestamp`);
  }
}

export function nextUpdatedTimestamp(candidate: string, previous: string): string {
  assertAbsoluteIsoTimestamp(candidate, "updatedAt");
  assertAbsoluteIsoTimestamp(previous, "previous updatedAt");
  if (Date.parse(candidate) > Date.parse(previous)) {
    return candidate;
  }
  return new Date(Date.parse(previous) + 1).toISOString();
}
