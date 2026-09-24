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

/** Public concern text supplied to the cluster summary model. */
export class ConcernClusterSummaryInput {
  readonly clusterId: string;
  readonly concernBodies: readonly string[];

  constructor(props: ConcernClusterSummaryInputProps) {
    const clusterId = props.clusterId.trim();
    const concernBodies = props.concernBodies.map((body) => body.trim());
    if (
      clusterId.length === 0 ||
      concernBodies.length === 0 ||
      concernBodies.some((body) => body.length === 0)
    ) {
      throw new ConcernClusterValidationError(
        "input",
        "cluster summary input is invalid",
      );
    }

    this.clusterId = clusterId;
    this.concernBodies = concernBodies;
  }
}

export interface ConcernClusterSummaryClaimProps {
  input: ConcernClusterSummaryInput;
  claimedAt: string;
}

/** Lease ownership returned by the repository's atomic pending-to-generating claim. */
export class ConcernClusterSummaryClaim {
  readonly input: ConcernClusterSummaryInput;
  readonly claimedAt: string;

  constructor(props: ConcernClusterSummaryClaimProps) {
    const claimedAt = props.claimedAt.trim();
    if (claimedAt.length === 0) {
      throw new TypeError("cluster summary claim timestamp is required");
    }
    this.input = props.input;
    this.claimedAt = claimedAt;
  }
}

export interface ConcernClusterSummaryProps {
  label: string;
  summary: string;
}

/** Display text returned by the cluster summary model. */
export class ConcernClusterSummary {
  readonly label: string;
  readonly summary: string;

  constructor(props: ConcernClusterSummaryProps) {
    const label = props.label.trim();
    const summary = props.summary.trim();
    if (label.length === 0) {
      throw new ConcernClusterValidationError(
        "label",
        "label must not be empty",
      );
    }
    if (summary.length === 0) {
      throw new ConcernClusterValidationError(
        "summary",
        "summary must not be empty",
      );
    }

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
    if (status === "ready" && label === null) {
      throw new ConcernClusterValidationError(
        "label",
        "label must be set for a ready cluster",
      );
    }

    const summary = props.summary?.trim() || null;
    if (status === "ready" && summary === null) {
      throw new ConcernClusterValidationError(
        "summary",
        "summary must be set for a ready cluster",
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
