export const CONCERN_CLUSTER_LABEL_MAX_LENGTH = 100;
export const CONCERN_CLUSTER_SUMMARY_MAX_LENGTH = 500;

export class ConcernClusterValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ConcernClusterValidationError";
    this.field = field;
  }
}

export interface ConcernClusterProps {
  id: string;
  label: string | null;
  summary: string | null;
  status?: string;
  modelVersion?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * AIによる分類結果を表す共有エンティティ。
 * label/summaryは表示用生成が完了するまでnullを許容する。
 */
export class ConcernCluster {
  readonly id: string;
  readonly label: string | null;
  readonly summary: string | null;
  readonly status: string;
  readonly modelVersion: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;

  constructor(props: ConcernClusterProps) {
    const status = props.status?.trim() || "ready";
    const label = props.label?.trim() || null;
    if (
      (status === "ready" && label === null) ||
      (label !== null && label.length > CONCERN_CLUSTER_LABEL_MAX_LENGTH)
    ) {
      throw new ConcernClusterValidationError(
        "label",
        `label must be set for a ready cluster and at most ${CONCERN_CLUSTER_LABEL_MAX_LENGTH} characters`,
      );
    }

    const summary = props.summary?.trim() || null;
    if (
      (status === "ready" && summary === null) ||
      (summary !== null && summary.length > CONCERN_CLUSTER_SUMMARY_MAX_LENGTH)
    ) {
      throw new ConcernClusterValidationError(
        "summary",
        `summary must be set for a ready cluster and at most ${CONCERN_CLUSTER_SUMMARY_MAX_LENGTH} characters`,
      );
    }

    this.id = props.id;
    this.label = label;
    this.summary = summary;
    this.status = status;
    this.modelVersion = props.modelVersion ?? null;
    this.createdAt = props.createdAt ?? null;
    this.updatedAt = props.updatedAt ?? null;
  }
}
