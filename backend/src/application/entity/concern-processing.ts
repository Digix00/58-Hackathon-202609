import type { ConcernProcessingStatus } from "./concern";

export const CONCERN_REPRESENTATION_LOCALES = ["ja-Hira", "en"] as const;
export type ConcernRepresentationLocale =
  (typeof CONCERN_REPRESENTATION_LOCALES)[number];
export type ConcernRepresentationStatus = "ready" | "failed";

export interface ConcernRepresentationProps {
  concernId: string;
  locale: ConcernRepresentationLocale;
  body: string;
  status: ConcernRepresentationStatus;
  errorCode?: string | null;
  updatedAt: string;
}

/** A generated text representation attached to one concern. */
export class ConcernRepresentation {
  readonly concernId: string;
  readonly locale: ConcernRepresentationLocale;
  readonly body: string;
  readonly status: ConcernRepresentationStatus;
  readonly errorCode: string | null;
  readonly updatedAt: string;

  constructor(props: ConcernRepresentationProps) {
    const concernId = props.concernId.trim();
    const body = props.body.trim();
    if (concernId.length === 0 || body.length === 0) {
      throw new TypeError("concernId and body are required");
    }
    if (!CONCERN_REPRESENTATION_LOCALES.includes(props.locale)) {
      throw new TypeError("locale is invalid");
    }

    this.concernId = concernId;
    this.locale = props.locale;
    this.body = body;
    this.status = props.status;
    this.errorCode = props.errorCode ?? null;
    this.updatedAt = props.updatedAt;
  }
}

export interface ConcernProcessingProps {
  concernId: string;
  status: ConcernProcessingStatus;
  clusterId?: string | null;
  modelVersion?: string | null;
  embeddingVersion?: string | null;
  representations?: readonly ConcernRepresentation[];
  updatedAt: string;
}

/** Processing state and generated representations for one concern. */
export class ConcernProcessing {
  readonly concernId: string;
  readonly status: ConcernProcessingStatus;
  readonly clusterId: string | null;
  readonly modelVersion: string | null;
  readonly embeddingVersion: string | null;
  readonly representations: readonly ConcernRepresentation[];
  readonly updatedAt: string;

  constructor(props: ConcernProcessingProps) {
    const concernId = props.concernId.trim();
    if (concernId.length === 0) {
      throw new TypeError("concernId is required");
    }
    if (
      props.representations?.some(
        (representation) => representation.concernId !== concernId,
      )
    ) {
      throw new TypeError("representations must belong to the concern");
    }

    this.concernId = concernId;
    this.status = props.status;
    this.clusterId = props.clusterId?.trim() || null;
    this.modelVersion = props.modelVersion ?? null;
    this.embeddingVersion = props.embeddingVersion ?? null;
    this.representations = props.representations ?? [];
    this.updatedAt = props.updatedAt;
  }
}
