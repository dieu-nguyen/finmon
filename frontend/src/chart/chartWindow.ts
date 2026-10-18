export const RANGE_OPTIONS = [
  { months: 12, label: "1 year" },
  { months: 15, label: "15 months" },
  { months: 18, label: "18 months" },
  { months: 21, label: "21 months" },
  { months: 24, label: "2 years" },
  { months: 36, label: "3 years" },
  { months: 48, label: "4 years" },
  { months: 60, label: "5 years" },
  { months: 72, label: "6 years" },
  { months: 84, label: "7 years" },
  { months: 96, label: "8 years" },
  { months: 108, label: "9 years" },
  { months: 120, label: "10 years" },
] as const;

export const BAR_OPTIONS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
] as const;

export type BarSize = (typeof BAR_OPTIONS)[number]["id"];

export const DEFAULT_RANGE_MONTHS = 12;
export const DEFAULT_BAR_SIZE: BarSize = "day";
