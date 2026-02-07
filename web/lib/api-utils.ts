/**
 * Shared API utilities
 */

import { NextRequest } from "next/server";

/**
 * Parse pagination parameters from request
 * @param request - Next.js request object
 * @param defaultLimit - Default items per page (default: 20)
 * @param maxLimit - Maximum items per page (default: 100)
 */
export function parsePagination(
  request: NextRequest,
  defaultLimit: number = 20,
  maxLimit: number = 100
) {
  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(parseInt(searchParams.get("limit") || String(defaultLimit)), maxLimit);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Create pagination response object
 */
export function createPaginationResponse(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
