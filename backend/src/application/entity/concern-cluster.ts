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
  label: string;
  summary: string;
  status?: string;
  modelVersion?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * AIによる分類結果を表す共有エンティティ。
 * #74では表示用のlabel/summaryを利用し、生成・検査・保存の処理は#71で追加する。
 */
export class ConcernCluster {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly status: string;
  readonly modelVersion: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;

  constructor(props: ConcernClusterProps) {
    const label = props.label.trim();
    if (label.length === 0 || label.length > CONCERN_CLUSTER_LABEL_MAX_LENGTH) {
      throw new ConcernClusterValidationError(
        "label",
        `label must be a non-empty string of at most ${CONCERN_CLUSTER_LABEL_MAX_LENGTH} characters`,
      );
    }

    const summary = props.summary.trim();
    if (
      summary.length === 0 ||
      summary.length > CONCERN_CLUSTER_SUMMARY_MAX_LENGTH
    ) {
      throw new ConcernClusterValidationError(
        "summary",
        `summary must be a non-empty string of at most ${CONCERN_CLUSTER_SUMMARY_MAX_LENGTH} characters`,
      );
    }

    this.id = props.id;
    this.label = label;
    this.summary = summary;
    this.status = props.status?.trim() || "ready";
    this.modelVersion = props.modelVersion ?? null;
    this.createdAt = props.createdAt ?? null;
    this.updatedAt = props.updatedAt ?? null;
  }
}
