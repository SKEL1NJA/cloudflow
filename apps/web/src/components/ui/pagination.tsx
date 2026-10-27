import { formatCount } from '@/lib/format';
import { Button } from './button';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  noun: string;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, noun, onPageChange }: PaginationProps) {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-4 text-sm">
      <p className="text-muted-foreground">
        {formatCount(total)} {total === 1 ? noun : `${noun}s`} · Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
