import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..dependencies import get_current_active_user, get_db, require_admin
from ..models import StaticPage, User
from ..schemas import StaticPagePublic, StaticPageUpdate

router = APIRouter(prefix="/pages", tags=["pages"])

_SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _normalize_slug(raw_slug: str) -> str:
    slug = raw_slug.strip().lower()
    if not slug or not _SLUG_PATTERN.fullmatch(slug):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid page identifier")
    return slug


def _get_or_create_page(db: Session, slug: str) -> StaticPage:
    page = db.query(StaticPage).filter(StaticPage.slug == slug).first()
    if page is None:
        page = StaticPage(slug=slug, content="")
        db.add(page)
        db.commit()
        db.refresh(page)
    return page


@router.get("/{slug}", response_model=StaticPagePublic)
def get_static_page(
    slug: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> StaticPagePublic:
    normalized = _normalize_slug(slug)
    page = _get_or_create_page(db, normalized)
    return page


@router.put("/{slug}", response_model=StaticPagePublic)
def upsert_static_page(
    slug: str,
    payload: StaticPageUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> StaticPagePublic:
    normalized = _normalize_slug(slug)
    page = db.query(StaticPage).filter(StaticPage.slug == normalized).first()
    if page is None:
        page = StaticPage(slug=normalized, content=payload.content)
    else:
        page.content = payload.content
    db.add(page)
    db.commit()
    db.refresh(page)
    return page
