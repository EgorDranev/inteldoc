"""MinIO / S3-compatible object storage client (spec §9).

Presigned PUT into the quarantine prefix (write); backend-proxied GET for reads
(no long-lived presigned GET on clinical files — INV-RV-2). Object keys are
UUID-only — never PII (INV-RES-3). Full upload/preview flow lands in Slice B;
this module provides the client + a health check now.
"""

from __future__ import annotations

import uuid
from functools import lru_cache
from typing import TYPE_CHECKING

import boto3
from botocore.config import Config

from app.core.config import get_settings

if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client

QUARANTINE_PREFIX = "quarantine"
ACCEPTED_PREFIX = "accepted"


@lru_cache
def get_s3() -> S3Client:
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(signature_version="s3v4"),
    )


def head_bucket() -> bool:
    s3 = get_s3()
    s3.head_bucket(Bucket=get_settings().s3_bucket)
    return True


def new_quarantine_key() -> str:
    """UUID-only object key in the quarantine prefix — never PII (INV-RES-3)."""
    return f"{QUARANTINE_PREFIX}/{uuid.uuid4()}"


def generate_presigned_put(object_key: str, content_type: str | None = None) -> str:
    """Short-lived presigned PUT (≤5 min) into quarantine (§9.2). The file never
    travels through the app server on write."""
    settings = get_settings()
    params: dict[str, str] = {"Bucket": settings.s3_bucket, "Key": object_key}
    if content_type:
        params["ContentType"] = content_type
    return get_s3().generate_presigned_url(
        "put_object", Params=params, ExpiresIn=settings.s3_presign_ttl_seconds
    )


def put_bytes(object_key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    """Direct upload (tests/seed only; clients use the presigned PUT)."""
    get_s3().put_object(
        Bucket=get_settings().s3_bucket, Key=object_key, Body=data, ContentType=content_type
    )


def get_bytes(object_key: str) -> bytes:
    """Backend-proxied read (§9.3). No long-lived presigned GET on clinical files."""
    obj = get_s3().get_object(Bucket=get_settings().s3_bucket, Key=object_key)
    body: bytes = obj["Body"].read()
    return body


def object_exists(object_key: str) -> bool:
    from botocore.exceptions import ClientError

    try:
        get_s3().head_object(Bucket=get_settings().s3_bucket, Key=object_key)
        return True
    except ClientError:
        return False
