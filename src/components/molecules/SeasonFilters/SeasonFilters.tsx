export type SeasonFiltersProps = {
  years: number[];
  year: number | null;
  period: string;
  onYearChange: (year: number | null) => void;
  onPeriodChange: (period: string) => void;
  allYears?: boolean;
};
import { TextField } from '@mui/material';
import { seasonPeriods } from '../../../game/seasonPeriods';

export const SeasonFilters = ({
  years,
  year,
  period,
  onYearChange,
  onPeriodChange,
  allYears = false,
}: SeasonFiltersProps) => {
  return (
    <>
      <TextField
        select
        size="small"
        label="Year"
        value={year ?? ''}
        sx={{ minWidth: 120 }}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        onChange={(event) => onYearChange(event.target.value ? Number(event.target.value) : null)}
      >
        {allYears && <option value="">All years</option>}
        {[...new Set([...years, ...(year ? [year] : [])])].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Season"
        value={period}
        sx={{ minWidth: 180 }}
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        onChange={(event) => onPeriodChange(event.target.value)}
      >
        <option value="all">All periods</option>
        {seasonPeriods.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </TextField>
    </>
  );
};
