from pydantic import BaseModel, field_validator
from typing import Any, Dict, List, Optional, Literal


class ParseRequest(BaseModel):
    data: Any

    @field_validator("data")
    @classmethod
    def data_not_null(cls, v):
        if v is None:
            raise ValueError("data cannot be null")
        return v


class ColumnInfo(BaseModel):
    name: str
    dtype: Literal["numeric", "categorical"]
    null_count: int
    coverage: float
    sample_values: List[Any]
    cardinality: Optional[int] = None
    recommended_weight: Optional[float] = None


class ParseResponse(BaseModel):
    row_count: int
    columns: List[ColumnInfo]
    detected_path: str


class ClusterRequest(BaseModel):
    data: Any
    columns: List[str]
    group_by: Optional[str] = None          # categorical field → run 1 clustering per unique value
    weights: Optional[Dict[str, float]] = None
    algorithm: Literal["kmeans", "dbscan"] = "kmeans"
    n_clusters: Optional[int] = 3
    eps: Optional[float] = 0.5
    min_samples: Optional[int] = 5

    @field_validator("columns")
    @classmethod
    def columns_not_empty(cls, v):
        if not v:
            raise ValueError("Select at least one column")
        return v

    @field_validator("n_clusters")
    @classmethod
    def valid_k(cls, v):
        if v is not None and not (2 <= v <= 200):
            raise ValueError("n_clusters must be between 2 and 200")
        return v


class ClusterResponse(BaseModel):
    labels: List[int]
    cluster_counts: Dict[str, int]
    inertia: Optional[float]
    n_clusters_found: int
    points: List[Dict[str, Any]]
    pca_coords: Optional[List[Dict[str, float]]]
    pca_variance_explained: Optional[float]
    dims: int
    group_cluster_map: Optional[Dict[str, Any]] = None   # str(global_id) → {group, local}
    group_by_field: Optional[str] = None
