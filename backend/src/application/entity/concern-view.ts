export interface ConcernViewProps {
  concernId: string;
  userId: string;
  firstViewedAt: string;
  lastViewedAt: string;
  viewCount?: number;
}

export class ConcernViewValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ConcernViewValidationError";
    this.field = field;
  }
}

/** 推薦履歴にも利用する、ユーザーごとの投稿既読集約。 */
export class ConcernView {
  readonly concernId: string;
  readonly userId: string;
  readonly firstViewedAt: string;
  readonly lastViewedAt: string;
  readonly viewCount: number;

  constructor(props: ConcernViewProps) {
    if (props.concernId.trim().length === 0) {
      throw new ConcernViewValidationError(
        "concernId",
        "concernId is required",
      );
    }
    if (props.userId.trim().length === 0) {
      throw new ConcernViewValidationError("userId", "userId is required");
    }
    if (!Number.isInteger(props.viewCount ?? 1) || (props.viewCount ?? 1) < 1) {
      throw new ConcernViewValidationError(
        "viewCount",
        "viewCount must be a positive integer",
      );
    }

    this.concernId = props.concernId;
    this.userId = props.userId;
    this.firstViewedAt = props.firstViewedAt;
    this.lastViewedAt = props.lastViewedAt;
    this.viewCount = props.viewCount ?? 1;
  }
}
