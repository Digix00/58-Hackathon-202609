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
const PHONE_NUMBER_PATTERN =
  /(?<!\d)(?:0(?:[\s‐‑‒–—−-]?\d){9,10}|\+81[\s‐‑‒–—−-]?[1-9](?:[\s‐‑‒–—−-]?\d){8,9})(?!\d)/u;
const PERSON_NAME_PATTERN = /([\p{Script=Han}]{2,4})(?:さん|氏|くん|ちゃん)/gu;
const GENERIC_PERSON_REFERENCES = new Set([
  "患者",
  "保護者",
  "看護師",
  "医師",
  "教師",
  "先生",
  "教授",
  "生徒",
  "学生",
  "職員",
  "社員",
  "店員",
  "上司",
  "同僚",
  "友人",
  "先輩",
  "後輩",
  "担当者",
  "相談員",
  "支援員",
  "利用者",
  "管理者",
  "児童",
  "家族",
  "保育士",
  "相談者",
]);
const PERSONAL_INFORMATION_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  PHONE_NUMBER_PATTERN,
  /(?:https?:\/\/|www\.)\S+/i,
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

function containsLikelyPersonName(value: string): boolean {
  for (const match of value.matchAll(PERSON_NAME_PATTERN)) {
    const candidate = match[1];
    if (candidate && !GENERIC_PERSON_REFERENCES.has(candidate)) {
      return true;
    }
  }
  return false;
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

  if (
    PERSONAL_INFORMATION_PATTERNS.some((pattern) => pattern.test(value)) ||
    containsLikelyPersonName(value)
  ) {
    throw new ConcernClusterValidationError(
      field,
      `${field} contains contact information or a person name`,
    );
  }
}
