function buildPageLink(req, page, limit) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  params.set('page', String(page));
  params.set('limit', String(limit));
  const path = `${req.baseUrl}${req.path === '/' ? '' : req.path}`;
  return `${path}?${params.toString()}`;
}

function withPaginationLinks(req, result) {
  const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / result.limit);
  return {
    ...result,
    total_pages: totalPages,
    links: {
      self: buildPageLink(req, result.page, result.limit),
      next: result.page < totalPages ? buildPageLink(req, result.page + 1, result.limit) : null,
      prev: result.page > 1 ? buildPageLink(req, result.page - 1, result.limit) : null,
    },
  };
}

module.exports = { withPaginationLinks };
