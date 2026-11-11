export type ListPaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  count: number;
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  disabled?: boolean;
  getPageHref?: (page: number) => string;
};
import { Pagination, PaginationItem, Stack, TextField, Typography } from '@mui/material';

export const ListPagination = ({
  total,
  page,
  pageSize,
  count,
  label,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  getPageHref,
}: ListPaginationProps) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <Stack spacing={2} sx={{ mb: 2 }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}
      >
        <Typography variant="body2" color="text.secondary">
          {count ? (page - 1) * pageSize + 1 : 0}–{count ? (page - 1) * pageSize + count : 0} of{' '}
          {total} {label.toLowerCase()}
        </Typography>
        <TextField
          select
          label={`${label} per page`}
          value={pageSize}
          disabled={disabled}
          size="small"
          sx={{ minWidth: 155 }}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {[5, 10, 25].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </TextField>
      </Stack>
      <Stack component="nav" aria-label={`${label} pages`} sx={{ alignItems: 'center', gap: 1 }}>
        <Pagination
          count={pages}
          page={page}
          disabled={disabled}
          size="small"
          siblingCount={0}
          boundaryCount={1}
          onChange={(_, next) => {
            if (!getPageHref) onPageChange(next);
          }}
          renderItem={(item) => (
            <PaginationItem
              {...item}
              {...(getPageHref
                ? { component: 'a', href: getPageHref(Math.max(1, item.page ?? 1)) }
                : {})}
            />
          )}
        />
        <Typography variant="body2" color="text.secondary">
          Page {page} of {pages}
        </Typography>
      </Stack>
    </Stack>
  );
};
