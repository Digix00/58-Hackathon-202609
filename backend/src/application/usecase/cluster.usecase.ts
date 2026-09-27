import type {
  ClusterCatalogQuery,
  PublishedConcernCluster,
} from "../entity/cluster-catalog";
import type { ClusterRepository } from "../repository/cluster.repository";

/** テーマの目次を取得する。表示順は人気・反応件数に依存させない。 */
export class ClusterUseCase {
  private readonly repository: ClusterRepository;

  constructor(repository: ClusterRepository) {
    this.repository = repository;
  }

  readonly findPublishedById = async (
    clusterId: string,
  ): Promise<PublishedConcernCluster | null> => {
    const result = await this.repository.listPublished({ limit: 1, clusterId });
    return result.items[0] ?? null;
  };

  readonly listPublished = async (query: ClusterCatalogQuery) => {
    const result = await this.repository.listPublished(query);
    const last = result.items.at(-1);
    return {
      items: result.items,
      nextId: result.hasMore && last ? last.id : null,
    };
  };
}

export type IClusterUseCase = Pick<
  ClusterUseCase,
  "listPublished" | "findPublishedById"
>;
