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
 * Parse a bounded integer from a query parameter
 * Returns defaultVal if the value is missing or NaN, clamped to [min, max]
 */
export function parseBoundedInt(value: string | undefined | null, defaultVal: number, min: number, max: number): number {
  const parsed = parseInt(value || String(defaultVal), 10);
  return Math.min(Math.max(isNaN(parsed) ? defaultVal : parsed, min), max);
}

/**
 * Parse a bounded float from a query parameter
 * Returns defaultVal if the value is missing or NaN, clamped to [min, max]
 */
export function parseBoundedFloat(value: string | undefined | null, defaultVal: number, min: number, max: number): number {
  const parsed = parseFloat(value || String(defaultVal));
  return Math.min(Math.max(isNaN(parsed) ? defaultVal : parsed, min), max);
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
