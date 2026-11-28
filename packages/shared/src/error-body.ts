// Error response shape shared by admin-api and the dashboard (types only)
export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "INTERNAL";

export type ValidationDetail = { path: string; message: string };

export type ErrorBody = {
  error: { code: ErrorCode; message: string; requestId: string; details?: ValidationDetail[] };
};
