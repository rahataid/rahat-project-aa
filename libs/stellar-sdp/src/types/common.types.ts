export interface PaginationParams {
  page?: number;
  page_limit?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
  q?: string;
  created_at_after?: string;
  created_at_before?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    pages: number;
    total: number;
  };
}
