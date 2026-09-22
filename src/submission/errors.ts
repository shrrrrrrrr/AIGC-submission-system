export class SubmissionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429,
    message: string,
    public readonly details?: Array<{ field: string; reason: string }>,
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}
