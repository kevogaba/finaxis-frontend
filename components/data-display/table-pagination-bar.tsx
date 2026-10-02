'use client';

import TablePagination from '@mui/material/TablePagination';
import { PAGE_SIZES } from '@/lib/api/paging';
import type { PageMetadata } from '@/lib/api/wire';
import { useListNavigation } from './use-list-navigation';

interface TablePaginationBarProps {
  page: PageMetadata;
  rowsPerPageOptions?: readonly number[];
}

/** Server-side pagination (prototype `.pagination`): writes 0-based `page` and `size` to the URL. */
export function TablePaginationBar({
  page,
  rowsPerPageOptions = PAGE_SIZES,
}: TablePaginationBarProps) {
  const go = useListNavigation();

  return (
    <TablePagination
      component="div"
      count={page.totalItems}
      page={page.number}
      rowsPerPage={page.size}
      rowsPerPageOptions={[...rowsPerPageOptions]}
      onPageChange={(_event, next) => {
        go((params) => {
          if (next === 0) params.delete('page');
          else params.set('page', String(next));
        });
      }}
      onRowsPerPageChange={(event) => {
        go((params) => {
          params.set('size', event.target.value);
          params.delete('page');
        });
      }}
      sx={{ borderTop: 1, borderColor: 'divider' }}
    />
  );
}
