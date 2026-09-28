"""The development mailbox: http://localhost:8000/api/dev/outbox (or through the web app's proxy at
http://localhost:5173/api/dev/outbox). Lists the emails the console mailer "sent", with working
links. In development every email is copied here, even when real delivery is on. Never mounted
outside APP_ENV=development."""

from html import escape

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.tenancy.deps import StateDep

router = APIRouter(prefix="/api/dev", include_in_schema=False)


@router.get("/outbox", response_class=HTMLResponse)
async def outbox(state: StateDep) -> HTMLResponse:
    items = []
    for sent_at, email in state.mailer.outbox:
        items.append(
            f'<article><header><b>{escape(email.subject)}</b><span>to {escape(email.to)} · '
            f'{sent_at:%H:%M:%S} UTC</span></header><div class="mail">{email.html}</div></article>'
        )
    body = "".join(items) or '<p class="empty">No emails yet. Sign up or ask for a reset link.</p>'
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>Astro dev mailbox</title>
<meta http-equiv="refresh" content="5"><style>
body{{margin:0;background:#070b16;color:#dce2f0;font:14px system-ui,Segoe UI,sans-serif}}
main{{max-width:760px;margin:0 auto;padding:28px 16px}} h1{{font-size:18px;letter-spacing:.14em}}
article{{background:#0e1528;border:1px solid #1f2a45;border-radius:12px;margin:14px 0;overflow:hidden}}
header{{display:flex;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #1f2a45}}
header span{{color:#8b95b0;font-size:12px}} .mail{{background:#fff}} .empty{{color:#8b95b0}}
</style></head><body><main><h1>ASTRO · DEV MAILBOX</h1><p style="color:#8b95b0">Emails sent in development land
here instead of a real inbox. The page refreshes every 5 seconds.</p>{body}</main></body></html>"""
    return HTMLResponse(page, headers={"content-security-policy": "default-src 'none'; style-src 'unsafe-inline'"})
