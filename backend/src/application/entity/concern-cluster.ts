export const CONCERN_CLUSTER_LABEL_MAX_LENGTH = 100;
export const CONCERN_CLUSTER_SUMMARY_MAX_LENGTH = 500;
export const CONCERN_CLUSTER_SUMMARY_INPUT_LIMIT = 10;
export const CONCERN_CLUSTER_SUMMARY_INPUT_MAX_CHARACTERS = 20_000;

const FORBIDDEN_CLUSTER_TERMS = [
  "死ね",
  "くたばれ",
  "殺してやる",
  "馬鹿",
  "ばか",
  "クズ",
];
const PERSONAL_INFORMATION_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:\+?81[\s-]?)?0\d{1,4}(?:[\s-]?\d{1,4}){1,2}/u,
  /(?:https?:\/\/|www\.)\S+/i,
  /[\p{Script=Han}]{2,4}(?:さん|氏|くん|ちゃん)/u,
];

export class ConcernClusterValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ConcernClusterValidationError";
    this.field = field;
  }
}

export interface ConcernClusterSummaryInputProps {
  clusterId: string;
  concernBodies: readonly string[];
}

/** Bounded, public concern text supplied to the cluster summary model. */
export class ConcernClusterSummaryInput {
  readonly clusterId: string;
  readonly concernBodies: readonly string[];

  constructor(props: ConcernClusterSummaryInputProps) {
    const clusterId = props.clusterId.trim();
    const concernBodies = props.concernBodies.map((body) => body.trim());
    const inputCharacters = concernBodies.reduce(
      (total, body) => total + body.length,
      0,
    );
    if (
      clusterId.length === 0 ||
      concernBodies.length === 0 ||
      concernBodies.length > CONCERN_CLUSTER_SUMMARY_INPUT_LIMIT ||
      concernBodies.some((body) => body.length === 0) ||
      inputCharacters > CONCERN_CLUSTER_SUMMARY_INPUT_MAX_CHARACTERS
    ) {
      throw new TypeError("cluster summary input is invalid");
    }

    this.clusterId = clusterId;
    this.concernBodies = concernBodies;
  }
}

export interface ConcernClusterSummaryProps {
  label: string;
  summary: string;
}

/** Validated display text returned by the cluster summary model. */
export class ConcernClusterSummary {
  readonly label: string;
  readonly summary: string;

  constructor(props: ConcernClusterSummaryProps) {
    const label = props.label.trim();
    const summary = props.summary.trim();
    validateGeneratedText("label", label, CONCERN_CLUSTER_LABEL_MAX_LENGTH);
    validateGeneratedText(
      "summary",
      summary,
      CONCERN_CLUSTER_SUMMARY_MAX_LENGTH,
    );

    this.label = label;
    this.summary = summary;
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

function validateGeneratedText(
  field: "label" | "summary",
  value: string,
  maxLength: number,
): void {
  if (value.length === 0 || value.length > maxLength) {
    throw new ConcernClusterValidationError(
      field,
      `${field} must contain 1-${maxLength} characters`,
    );
  }

  if (
    FORBIDDEN_CLUSTER_TERMS.some((term) => value.includes(term)) ||
    /\b(?:fuck|shit|bitch)\b/i.test(value)
  ) {
    throw new ConcernClusterValidationError(
      field,
      `${field} contains a prohibited term`,
    );
  }

  if (PERSONAL_INFORMATION_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new ConcernClusterValidationError(
      field,
      `${field} contains contact information or a person name`,
    );
  }
}
