'use client';

import Pagination from '@mui/material/Pagination';
import PaginationItem from '@mui/material/PaginationItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ApiPageMetadata } from '../platform-administration.types';

interface PlatformPaginationProps {
  page: ApiPageMetadata;
  pathname: string;
  searchParams?: Record<string, string | undefined>;
}

export function PlatformPagination({ page, pathname, searchParams = {} }: PlatformPaginationProps) {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', mt: 2 }}
    >
      <Typography variant="body2" color="text.secondary">
        {`${page.totalItems} results · Page ${page.number + 1} of ${Math.max(page.totalPages, 1)}`}
      </Typography>
      <Pagination
        count={Math.max(page.totalPages, 1)}
        page={page.number + 1}
        renderItem={(item) => {
          if (!item.page || item.selected || item.disabled) {
            return <PaginationItem {...item} />;
          }
          const next = new URLSearchParams(params);
          next.set('page', String(item.page - 1));
          return <PaginationItem {...item} component="a" href={`${pathname}?${next.toString()}`} />;
        }}
      />
    </Stack>
  );
}
