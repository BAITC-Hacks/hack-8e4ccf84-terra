import {AppError} from "../../../agent/errors";

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, value);
  }
  return value;
}

function partsAt(instant: Date, timeZone: string) {
  const parts = formatter(timeZone).formatToParts(instant);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function assertTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", {timeZone}).format();
  } catch {
    throw new AppError("invalid_timezone", `Unknown IANA time zone: ${timeZone}.`);
  }
}

export function localTimestampToUtc(value: string, timeZone: string): Date {
  assertTimeZone(timeZone);
  const match = TIMESTAMP.exec(value.trim());
  if (!match)
    throw new AppError(
      "invalid_timestamp",
      `Timestamp '${value}' must match yyyy-MM-dd HH:mm:ss.`,
    );
  const [, year, month, day, hour, minute, second] = match;
  const wanted = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
  if (
    wanted.month < 1 || wanted.month > 12 || wanted.day < 1 ||
    wanted.day > 31 || wanted.hour > 23 || wanted.minute > 59 || wanted.second > 59
  ) throw new AppError("invalid_timestamp", `Timestamp '${value}' is invalid.`);

  const wallClockUtc = Date.UTC(
    wanted.year,
    wanted.month - 1,
    wanted.day,
    wanted.hour,
    wanted.minute,
    wanted.second,
  );
  let candidate = wallClockUtc;
  for (let attempt = 0; attempt < 3; attempt++) {
    const shown = partsAt(new Date(candidate), timeZone);
    const shownAsUtc = Date.UTC(
      Number(shown.year),
      Number(shown.month) - 1,
      Number(shown.day),
      Number(shown.hour),
      Number(shown.minute),
      Number(shown.second),
    );
    candidate += wallClockUtc - shownAsUtc;
  }
  const result = new Date(candidate);
  const roundTrip = partsAt(result, timeZone);
  if (
    Number(roundTrip.year) !== wanted.year ||
    Number(roundTrip.month) !== wanted.month ||
    Number(roundTrip.day) !== wanted.day ||
    Number(roundTrip.hour) !== wanted.hour ||
    Number(roundTrip.minute) !== wanted.minute ||
    Number(roundTrip.second) !== wanted.second
  ) throw new AppError("invalid_timestamp", `Timestamp '${value}' does not exist in ${timeZone}.`);
  return result;
}
