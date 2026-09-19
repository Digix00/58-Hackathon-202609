/** Health 確認の結果を表す Application 層のモデル。 */
export interface HealthStatus {
  status: "ok";
  checkedAt: string;
  database: "ok" | "error";
}
