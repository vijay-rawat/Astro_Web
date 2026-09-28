"""One error shape for the whole API: {"error": {"code", "message", "fields"?}}.

The web app reads `code` to decide what to do (for example `email_unverified` offers to resend the
link) and shows `message` as is.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, headers: dict[str, str] | None = None,
                 fields: dict[str, str] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers
        self.fields = fields


def error_body(code: str, message: str, fields: dict[str, str] | None = None) -> dict:
    error: dict = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return {"error": error}


def unauthenticated() -> ApiError:
    return ApiError(401, "unauthenticated", "Please sign in.")


def forbidden(message: str = "You don't have access to this.") -> ApiError:
    return ApiError(403, "forbidden", message)


def too_many(retry_after: int) -> ApiError:
    return ApiError(429, "rate_limited", "Too many attempts. Try again in a moment.",
                    headers={"Retry-After": str(max(1, retry_after))})


_HTTP_CODES = {401: "unauthenticated", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_req: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(error_body(exc.code, exc.message, exc.fields), status_code=exc.status,
                            headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_req: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
            key = loc[-1] if loc else "request"
            fields.setdefault(key, str(err.get("msg", "Invalid value")).removeprefix("Value error, "))
        first = next(iter(fields.values()), "Check the highlighted fields.")
        return JSONResponse(error_body("invalid_input", first, fields), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_req: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(error_body(_HTTP_CODES.get(exc.status_code, "error"), str(exc.detail)),
                            status_code=exc.status_code, headers=getattr(exc, "headers", None))
