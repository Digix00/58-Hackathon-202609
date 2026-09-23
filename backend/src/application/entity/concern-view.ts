export interface ConcernViewProps {
  concernId: string;
  actorKey: string;
  viewedAt: string;
}

/** 投稿を認証済み利用者が読んだ記録。actorKey は内部 users.id を表す。 */
export class ConcernView {
  readonly concernId: string;
  readonly actorKey: string;
  readonly viewedAt: string;

  constructor(props: ConcernViewProps) {
    this.concernId = props.concernId;
    this.actorKey = props.actorKey;
    this.viewedAt = props.viewedAt;
  }
}
