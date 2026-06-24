"""Aggregate ``/v1`` router. Sub-routers are mounted here as slices land."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import admin, auth, doctor, health, me, onboarding, plan, support, uploads

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(onboarding.router)
api_router.include_router(me.router)
api_router.include_router(uploads.router)
api_router.include_router(plan.router)
api_router.include_router(doctor.router)
api_router.include_router(admin.router)
api_router.include_router(support.router)
