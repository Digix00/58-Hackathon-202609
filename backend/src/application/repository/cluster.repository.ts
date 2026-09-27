import type {
  ClusterCatalogPage,
  ClusterCatalogQuery,
} from "../entity/cluster-catalog";

export interface ClusterRepository {
  listPublished(query: ClusterCatalogQuery): Promise<ClusterCatalogPage>;
}
