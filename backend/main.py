from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from clustering_service import parse_schema, run_clustering
from models import ClusterRequest, ClusterResponse, ParseRequest, ParseResponse

app = FastAPI(title="ClusterUS API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/parse", response_model=ParseResponse)
def parse_endpoint(request: ParseRequest):
    try:
        return parse_schema(request.data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse error: {str(e)}")


@app.post("/api/cluster", response_model=ClusterResponse)
def cluster_endpoint(request: ClusterRequest):
    try:
        return run_clustering(request)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Clustering error: {str(e)}")
