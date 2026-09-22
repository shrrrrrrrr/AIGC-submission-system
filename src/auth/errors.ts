export class AuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export const GENERIC_AUTH_ERROR = "邮箱或密码不正确";
