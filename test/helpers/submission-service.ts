import { SubmissionService as RealSubmissionService } from "../../src/submission/service.js";
// Existing workflow tests exercise the open contest, independently of the machine date.
// Deadline tests use the real service with their own advancing clock.
export class SubmissionService extends RealSubmissionService {
  constructor(...args: ConstructorParameters<typeof RealSubmissionService>) {
    super(args[0], args[1], args[2], args[3] ?? (() => new Date("2026-10-01T00:00:00Z")));
  }
}
