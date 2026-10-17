// Generic page-collection helper for PostgREST list queries. Supabase caps
// every response at db.max_rows (default 1000) and silently truncates - as a
// table grows, the NEWEST rows (highest ids, when ordered by id) are the ones
// that disappear. fetchAllPages keeps issuing .range() pages until a short
// page arrives, so callers see the complete dataset at any table size.

export async function fetchAllPages(fetchPage, pageSize = 1000) {
  const all = [];
  let from = 0;
  for (;;) {
    const page = (await fetchPage(from)) || [];
    all.push(...page);
    if (page.length < pageSize) return all;
    from += pageSize;
  }
}
