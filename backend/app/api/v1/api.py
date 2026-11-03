"""Aggregates all v1 endpoint routers."""
from fastapi import APIRouter

from app.api.v1.endpoints import datasets, predict, status, tile_server

api_router = APIRouter()
api_router.include_router(status.router, tags=["status"])
api_router.include_router(predict.router, tags=["predict"])
api_router.include_router(datasets.router, tags=["datasets"])
api_router.include_router(tile_server.router, tags=["layers"])
