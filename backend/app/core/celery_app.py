"""Celery application for background inference jobs.

If Redis is not reachable (e.g. local dev without a broker running), the
task queue falls back to eager (synchronous) execution via
CELERY_TASK_ALWAYS_EAGER in settings. If the `celery` package itself isn't
installed yet, a minimal in-process shim provides the same `.task` /
`.delay` / `AsyncResult` surface so the async prediction endpoints keep
working (synchronously) instead of crashing the whole API.
"""
from __future__ import annotations

import uuid
from typing import Any, Callable

from app.core.config import get_settings

settings = get_settings()

try:
    from celery import Celery

    celery_app = Celery(
        "sar_landslide_genai",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
    )
    celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        task_always_eager=settings.CELERY_TASK_ALWAYS_EAGER,
        task_eager_propagates=True,
    )
    CELERY_AVAILABLE = True

except ImportError:  # pragma: no cover - exercised when celery isn't installed yet
    CELERY_AVAILABLE = False

    class _EagerAsyncResult:
        def __init__(self, task_id: str, status: str, result: Any = None):
            self.id = task_id
            self.status = status
            self.result = result

        def successful(self) -> bool:
            return self.status == "SUCCESS"

        def failed(self) -> bool:
            return self.status == "FAILURE"

    class _InProcessTask:
        """Runs synchronously and remembers results by id, mimicking Celery's eager mode."""

        def __init__(self, func: Callable):
            self._func = func
            self._results: dict[str, _EagerAsyncResult] = {}

        def delay(self, *args, **kwargs) -> _EagerAsyncResult:
            task_id = uuid.uuid4().hex
            try:
                value = self._func(*args, **kwargs)
                result = _EagerAsyncResult(task_id, "SUCCESS", value)
            except Exception as exc:  # noqa: BLE001
                result = _EagerAsyncResult(task_id, "FAILURE", str(exc))
            self._results[task_id] = result
            return result

        def AsyncResult(self, task_id: str) -> _EagerAsyncResult:
            return self._results.get(task_id, _EagerAsyncResult(task_id, "PENDING"))

    class _InProcessCelery:
        def task(self, *_args, **_kwargs):
            def decorator(func: Callable) -> _InProcessTask:
                return _InProcessTask(func)

            return decorator

    celery_app = _InProcessCelery()
