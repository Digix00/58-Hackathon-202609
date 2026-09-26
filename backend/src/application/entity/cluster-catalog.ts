import { ConcernCluster, type ConcernClusterProps } from "./concern-cluster";

/** 公開済み・分類完了の声を持つテーマと、その投稿件数。 */
export class PublishedConcernCluster extends ConcernCluster {
  readonly concernCount: number;
  constructor(props: ConcernClusterProps, concernCount: number) {
    super(props);
    this.concernCount = concernCount;
    if (
      this.status !== "ready" ||
      !Number.isInteger(concernCount) ||
      concernCount < 1
    ) {
      throw new TypeError("公開テーマには分類済みの投稿が必要です");
    }
  }
}

export interface ClusterCatalogQuery {
  limit: number;
  afterId?: string;
  clusterId?: string;
  regionCode?: string;
  gender?: string;
}

export interface ClusterCatalogPage {
  items: PublishedConcernCluster[];
  hasMore: boolean;
}
