import { useEffect, useState } from "react";

type BirthdaySelectProps = {
  value: string;
  onChange: (value: string) => void;
};

const months = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 1899 }, (_, index) => String(currentYear - index));

export default function BirthdaySelect({ value, onChange }: BirthdaySelectProps) {
  const [initialYear = "", initialMonth = "", initialDay = ""] = value.split("-");
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [day, setDay] = useState(initialDay);
  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth }, (_, index) => String(index + 1).padStart(2, "0"));

  useEffect(() => {
    const [nextYear = "", nextMonth = "", nextDay = ""] = value.split("-");
    setYear(nextYear);
    setMonth(nextMonth);
    setDay(nextDay);
  }, [value]);

  const updateBirthday = (nextYear: string, nextMonth: string, nextDay: string) => {
    setYear(nextYear);
    setMonth(nextMonth);
    setDay(nextDay);

    if (!nextYear || !nextMonth || !nextDay) {
      onChange("");
      return;
    }

    const maxDay = new Date(Number(nextYear), Number(nextMonth), 0).getDate();
    const safeDay = String(Math.min(Number(nextDay), maxDay)).padStart(2, "0");
    setDay(safeDay);
    onChange(`${nextYear}-${nextMonth}-${safeDay}`);
  };

  return (
    <fieldset className="birthday-picker">
      <legend>Birthday</legend>
      <label>
        <span>Month</span>
        <select value={month} onChange={(event) => updateBirthday(year, event.target.value, day || "01")} required>
          <option value="">Month</option>
          {months.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Day</span>
        <select value={day} onChange={(event) => updateBirthday(year, month, event.target.value)} required>
          <option value="">Day</option>
          {days.map((item) => (
            <option key={item} value={item}>
              {Number(item)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Year</span>
        <select value={year} onChange={(event) => updateBirthday(event.target.value, month, day || "01")} required>
          <option value="">Year</option>
          {years.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
