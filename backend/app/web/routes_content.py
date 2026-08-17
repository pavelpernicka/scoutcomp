"""Authenticated CMS content routes."""
from .routes_common import *  # noqa: F403

router = APIRouter(prefix="/web", tags=["web"])

from .routes_pages import PublishPayload
from .pages import rebuild_published_page_artifacts


def _require_post_manage(db: Session, user: User) -> None:
    permissions = permission_keys(db, user)
    if not ({"web.posts.manage", "core.posts.manage"} & permissions):
        raise HTTPException(403, "Missing core.posts.manage")


def _require_post_publish(db: Session, user: User) -> None:
    permissions = permission_keys(db, user)
    if not ({"web.publish", "core.posts.publish"} & permissions):
        raise HTTPException(403, "Missing core.posts.publish")


# ---------------------------------------------------------------- menus


class MenuItemPayload(BaseModel):
    id: int | None = None
    label: str = Field(min_length=1, max_length=100)
    page_slug: str | None = None
    url: str | None = None
    parent_id: int | None = None
    position: int = 0
    item_type: str = "external"
    page_id: int | None = None
    post_id: int | None = None
    target: str | None = None
    rel: str | None = None


def _build_menu_tree(items: list[WebMenuItem], parent_id: int | None = None) -> list[dict]:
    children = [
        item
        for item in items
        if item.parent_id == parent_id
    ]
    children.sort(key=lambda i: i.position)
    return [
        {
            "id": item.id,
            "menu_id": item.menu_id,
            "label": item.label,
            "page_slug": item.page_slug,
            "url": item.url,
            "item_type": item.item_type,
            "page_id": item.page_id,
            "post_id": item.post_id,
            "target": item.target,
            "rel": item.rel,
            "parent_id": item.parent_id,
            "position": item.position,
            "children": _build_menu_tree(items, item.id),
        }
        for item in children
    ]


def _serialize_menus(db: Session) -> list[dict]:
    menus = db.query(WebMenu).order_by(WebMenu.id.asc()).all()
    result = []
    for menu in menus:
        items = db.query(WebMenuItem).filter_by(menu_id=menu.id).all()
        result.append({
            "id": menu.id,
            "name": menu.name,
            "location": menu.location,
            "items": _build_menu_tree(items),
            "draft_version": menu.draft_version,
            "published_revision_id": menu.published_revision_id,
        })
    return result


@router.get("/menus")
def list_menus(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    # Page/template editors need the draft tree to render the atomic menu in
    # GrapesJS, but only ``web.menus.manage`` may mutate it.
    permissions = permission_keys(db, current_user)
    if not ({"web.menus.manage", "web.pages.manage", "web.templates.manage", "web.design.manage"} & permissions):
        raise HTTPException(403, "Missing web.menus.manage")
    return _serialize_menus(db)


class MenuPayload(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    location: str | None = None


@router.post("/menus", status_code=201)
def create_menu(payload: MenuPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.menus.manage")
    menu = WebMenu(name=payload.name.strip(), location=payload.location)
    db.add(menu)
    db.commit()
    db.refresh(menu)
    return {"id": menu.id, "name": menu.name, "location": menu.location, "items": []}


@router.delete("/menus/{menu_id}", status_code=204)
def delete_menu(menu_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.menus.manage")
    menu = db.query(WebMenu).filter_by(id=menu_id).one_or_none()
    if not menu:
        raise HTTPException(404, "Menu not found")
    if menu.published_revision_id:
        _require_action(db, current_user, "web.publish")
    db.query(WebMenuItem).filter_by(menu_id=menu_id).delete()
    db.delete(menu)
    db.commit()


class MenuItemsPayload(BaseModel):
    items: list[MenuItemPayload]
    expected_version: int | None = Field(default=None, ge=1)


@router.put("/menus/{menu_id}/items")
def replace_menu_items(menu_id: int, payload: MenuItemsPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.menus.manage")
    menu = db.query(WebMenu).filter_by(id=menu_id).one_or_none()
    if not menu:
        raise HTTPException(404, "Menu not found")
    if len(payload.items) > 200:
        raise HTTPException(422, "Menu has too many items")
    if payload.expected_version is None:
        raise HTTPException(428, "expected_version is required")
    expected = payload.expected_version
    if expected != menu.draft_version:
        raise HTTPException(409, "Menu was changed by another editor")
    previous_tree = _build_menu_tree(db.query(WebMenuItem).filter_by(menu_id=menu.id).all())
    revision_number = int(db.query(func.max(WebMenuRevision.revision_number)).filter_by(menu_id=menu.id).scalar() or 0) + 1
    db.add(WebMenuRevision(
        menu_id=menu.id, revision_number=revision_number, source_version=menu.draft_version,
        tree=previous_tree, reason="autosave", created_by_id=current_user.id,
    ))
    db.flush()
    updated = db.query(WebMenu).filter(
        WebMenu.id == menu.id, WebMenu.draft_version == expected,
    ).update({WebMenu.draft_version: expected + 1}, synchronize_session=False)
    if updated != 1:
        db.rollback(); raise HTTPException(409, "Menu was changed by another editor")
    db.refresh(menu)
    db.query(WebMenuItem).filter_by(menu_id=menu_id).delete()
    db.flush()
    id_map: dict[int, int] = {}
    depth_map: dict[int, int] = {}
    for i, item in enumerate(payload.items):
        item_type = "page" if item.item_type == "external" and item.page_slug else item.item_type
        if item_type not in {"page", "post", "external"}:
            db.rollback(); raise HTTPException(422, "Unknown menu item type")
        parent_id = None
        depth = 0
        if item.parent_id is not None:
            if item.parent_id not in id_map:
                db.rollback(); raise HTTPException(422, "Menu parent must precede its children")
            parent_id = id_map[item.parent_id]
            depth = depth_map[item.parent_id] + 1
            if depth > 8:
                db.rollback(); raise HTTPException(422, "Menu nesting is too deep")
        url, page_id, post_id = item.url, item.page_id, item.post_id
        if item_type == "page":
            target_page = (
                db.query(WebPage).filter_by(id=page_id, deleted_at=None).one_or_none()
                if page_id else db.query(WebPage).filter_by(slug=item.page_slug, deleted_at=None).one_or_none()
            )
            if not target_page:
                db.rollback(); raise HTTPException(422, "Menu page does not exist")
            url = target_page.path or f"/{target_page.slug}"
            post_id = None
        elif item_type == "post":
            target_post = db.query(WebPost).filter_by(id=post_id, deleted_at=None).one_or_none()
            if not target_post:
                db.rollback(); raise HTTPException(422, "Menu post does not exist")
            url = f"/post/{target_post.slug}"
            page_id = None
        else:
            parsed = urlparse(url or "")
            if parsed.scheme not in {"http", "https", "mailto", "tel"} and not str(url or "").startswith(("/", "#")):
                db.rollback(); raise HTTPException(422, "External menu URL is unsafe")
            page_id = post_id = None
        if item.target not in {None, "", "_self", "_blank"}:
            db.rollback(); raise HTTPException(422, "Menu target is invalid")
        new_item = WebMenuItem(
            menu_id=menu_id,
            label=item.label.strip(),
            page_slug=item.page_slug,
            url=url,
            item_type=item_type,
            page_id=page_id,
            post_id=post_id,
            target=item.target or None,
            rel="noopener noreferrer" if item.target == "_blank" else item.rel,
            parent_id=parent_id,
            position=i,
        )
        db.add(new_item)
        db.flush()
        if item.id is not None:
            id_map[item.id] = new_item.id
            depth_map[item.id] = depth
    db.commit()
    return _serialize_menus(db)


@router.post("/menus/{menu_id}/publish")
def publish_menu(menu_id: int, payload: PublishPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.menus.manage")
    _require_action(db, current_user, "web.publish")
    menu = db.query(WebMenu).filter_by(id=menu_id).one_or_none()
    if not menu or menu.draft_version != payload.expected_version:
        raise HTTPException(409, "Menu was changed by another editor")
    tree = _build_menu_tree(db.query(WebMenuItem).filter_by(menu_id=menu.id).all())
    number = int(db.query(func.max(WebMenuRevision.revision_number)).filter_by(menu_id=menu.id).scalar() or 0) + 1
    revision = WebMenuRevision(
        menu_id=menu.id, revision_number=number, source_version=menu.draft_version,
        tree=tree, reason="publish", created_by_id=current_user.id,
    )
    db.add(revision); db.flush()
    updated = db.query(WebMenu).filter(
        WebMenu.id == menu.id, WebMenu.draft_version == payload.expected_version,
    ).update({WebMenu.published_revision_id: revision.id}, synchronize_session=False)
    if updated != 1:
        db.rollback(); raise HTTPException(409, "Menu was changed by another editor")
    rebuild_published_page_artifacts(db)
    db.commit(); db.refresh(menu)
    return {"menu_id": menu.id, "published_revision_id": revision.id}


# ---------------------------------------------------------------- posts


class PostPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    slug: str | None = None
    excerpt: str | None = None
    body: str | None = None
    cover_media_id: int | None = None
    event_id: int | None = None
    published: bool = False
    published_at: str | None = None
    expected_version: int | None = None
    seo_title: str | None = None
    meta_description: str | None = None
    canonical_url: str | None = None
    og_image_id: int | None = None
    noindex: bool = False
    sitemap_include: bool = True


def _serialize_post(post: WebPost) -> dict:
    return {
        "id": post.id,
        "title": post.title,
        "slug": post.slug,
        "excerpt": post.excerpt,
        "body": post.body,
        "cover_media_id": post.cover_media_id,
        "event_id": post.event_id,
        "published": post.published,
        "draft_version": post.draft_version,
        "published_revision_id": post.published_revision_id,
        "published_at": post.published_at.isoformat() if post.published_at else None,
        "created_by": post.created_by.username if post.created_by else None,
        "updated_at": post.updated_at.isoformat() if post.updated_at else None,
        "seo_title": post.seo_title,
        "meta_description": post.meta_description,
        "canonical_url": post.canonical_url,
        "og_image_id": post.og_image_id,
        "noindex": post.noindex,
        "sitemap_include": post.sitemap_include,
    }


def _next_post_revision(db: Session, post_id: int) -> int:
    return int(db.query(func.max(WebPostRevision.revision_number)).filter_by(post_id=post_id).scalar() or 0) + 1


def _snapshot_post(db: Session, post: WebPost, user_id: int, reason: str, publication: bool = False) -> WebPostRevision:
    revision = WebPostRevision(
        post_id=post.id, revision_number=_next_post_revision(db, post.id),
        source_version=post.draft_version or 1, title=post.title, slug=post.slug,
        excerpt=post.excerpt, body=post.body, cover_media_id=post.cover_media_id, event_id=post.event_id,
        compiled_html=render_article_body(post.body) if publication else None,
        reason=reason, is_publication=publication, seo_title=post.seo_title,
        meta_description=post.meta_description, canonical_url=post.canonical_url,
        og_image_id=post.og_image_id, noindex=post.noindex,
        sitemap_include=post.sitemap_include, created_by_id=user_id,
    )
    db.add(revision)
    return revision


def _publish_post(db: Session, post: WebPost, expected_version: int, user_id: int) -> WebPostRevision:
    if expected_version != (post.draft_version or 1):
        raise HTTPException(409, "Draft was changed by another editor")
    conflicting_publication = (
        db.query(WebPostRevision.id)
        .join(WebPost, WebPost.published_revision_id == WebPostRevision.id)
        .filter(
            WebPost.id != post.id,
            WebPost.published.is_(True),
            WebPost.deleted_at.is_(None),
            WebPostRevision.is_publication.is_(True),
            WebPostRevision.slug == post.slug,
        )
        .first()
    )
    if conflicting_publication:
        raise HTTPException(409, "A published post already uses this slug")
    revision = _snapshot_post(db, post, user_id, "publish", True)
    db.flush()
    updated = db.query(WebPost).filter(
        WebPost.id == post.id, WebPost.draft_version == expected_version,
    ).update({
        WebPost.published_revision_id: revision.id,
        WebPost.published: True,
        WebPost.published_at: datetime.now(timezone.utc),
    }, synchronize_session=False)
    if updated != 1:
        db.rollback()
        raise HTTPException(409, "Draft was changed by another editor")
    rebuild_published_page_artifacts(db)
    db.commit()
    db.refresh(post)
    return revision


@router.get("/posts")
def list_posts(
    status: str = Query("all"),
    sort: str = Query("updated_desc"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user),
):
    _require_post_manage(db, current_user)
    if status not in {"all", "published", "draft"}:
        raise HTTPException(422, "Invalid post status")
    if sort not in {"updated_desc", "updated_asc", "title_asc", "title_desc", "published_desc"}:
        raise HTTPException(422, "Invalid post sort")
    query = db.query(WebPost).filter(WebPost.deleted_at.is_(None))
    if status == "published":
        query = query.filter(WebPost.published.is_(True))
    elif status == "draft":
        query = query.filter(WebPost.published.is_(False))
    order_by = {
        "updated_desc": (WebPost.updated_at.desc(), WebPost.id.desc()),
        "updated_asc": (WebPost.updated_at.asc(), WebPost.id.asc()),
        "title_asc": (WebPost.title.asc(), WebPost.id.asc()),
        "title_desc": (WebPost.title.desc(), WebPost.id.desc()),
        "published_desc": (WebPost.published_at.desc(), WebPost.id.desc()),
    }[sort]
    total = query.count()
    posts = query.order_by(*order_by).offset(offset).limit(limit).all()
    return {
        "items": [{
            "id": p.id,
            "title": p.title,
            "slug": p.slug,
            "excerpt": p.excerpt,
            "cover_media_id": p.cover_media_id,
            "event_id": p.event_id,
            "published": p.published,
            "draft_version": p.draft_version,
            "published_at": p.published_at.isoformat() if p.published_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "author": p.created_by.real_name if p.created_by else None,
            "author_avatar": p.created_by.avatar if p.created_by else None,
        } for p in posts],
        "total": total,
        "limit": limit,
        "offset": offset,
        "page": (offset // limit) + 1,
        "pages": max(1, (total + limit - 1) // limit),
    }


def _require_post_read(db: Session, user: User) -> None:
    permissions = permission_keys(db, user)
    if not ({"core.posts.read", "core.posts.manage", "web.posts.manage", "web.manage"} & permissions):
        raise HTTPException(403, "Missing core.posts.read")


def _serialize_linked_event(db: Session, event_id: int | None, user: User) -> dict | None:
    if event_id is None:
        return None
    event = db.query(ScoutEvent).filter_by(id=event_id).one_or_none()
    if event is None:
        return None
    permissions = permission_keys(db, user)
    is_leader = "core.is_leader" in permissions
    if (event.audience == "leaders" and not is_leader) or (
        event.team_id is not None and event.team_id != user.team_id and not is_leader
    ):
        return None
    planned = db.query(ScoutAttendance).filter_by(
        event_id=event.id, user_id=user.id, mode="planned",
    ).one_or_none()
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "kind": event.kind,
        "starts_at": event.starts_at.isoformat() if event.starts_at else None,
        "ends_at": event.ends_at.isoformat() if event.ends_at else None,
        "location": event.location,
        "requires_planned": bool(event.requires_planned),
        "planned_deadline": event.planned_deadline.isoformat() if event.planned_deadline else None,
        "planned_status": planned.status if planned else None,
        "planned_registered_at": planned.created_at.isoformat() if planned and planned.created_at else None,
    }


def _article_excerpt(body: str | None, limit: int = 190) -> str | None:
    """Derive feed teasers from the article; manual perexes are no longer used."""
    text = re.sub(r"<[^>]+>", " ", body or "")
    text = re.sub(r"[`*_>#~]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return None
    return f"{text[:limit].rsplit(' ', 1)[0]}…" if len(text) > limit else text


def _serialize_feed_post(db: Session, post: WebPost, user: User, include_body: bool = False) -> dict:
    """Read the immutable publication snapshot, never a potentially newer draft."""
    revision = (
        db.query(WebPostRevision)
        .filter_by(id=post.published_revision_id, post_id=post.id, is_publication=True)
        .one_or_none()
    )
    source = revision or post
    author = post.created_by.real_name if post.created_by and post.created_by.real_name else (
        post.created_by.username if post.created_by else None
    )
    result = {
        "id": post.id,
        "title": source.title,
        "slug": source.slug,
        "excerpt": _article_excerpt(source.body),
        "cover_media_id": source.cover_media_id,
        "published_at": post.published_at.isoformat() if post.published_at else None,
        "author": author,
        "author_avatar": post.created_by.avatar if post.created_by else None,
        "event": _serialize_linked_event(db, source.event_id, user),
    }
    if include_body:
        result["body"] = source.body or ""
    return result


@router.get("/posts/feed")
def list_post_feed(
    limit: int = Query(12, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user),
):
    """Authenticated reader feed. Only published posts are intentionally exposed."""
    _require_post_read(db, current_user)
    query = db.query(WebPost).filter(
        WebPost.deleted_at.is_(None), WebPost.published.is_(True),
    )
    total = query.count()
    posts = query.order_by(WebPost.published_at.desc(), WebPost.id.desc()).offset(offset).limit(limit).all()
    return {
        "items": [_serialize_feed_post(db, post, current_user) for post in posts],
        "total": total,
        "limit": limit,
        "offset": offset,
        "page": (offset // limit) + 1,
        "pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/posts/feed/{post_id}")
def get_post_feed_item(
    post_id: int,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user),
):
    _require_post_read(db, current_user)
    post = db.query(WebPost).filter(
        WebPost.id == post_id, WebPost.deleted_at.is_(None), WebPost.published.is_(True),
    ).one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")
    return _serialize_feed_post(db, post, current_user, include_body=True)


@router.post("/posts", status_code=201)
def create_post(payload: PostPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_post_manage(db, current_user)
    slug = _slugify(payload.slug or payload.title)
    base, counter = slug, 1
    while db.query(WebPost).filter_by(slug=slug).one_or_none():
        counter += 1
        slug = f"{base}-{counter}"
    if payload.event_id is not None and not db.query(ScoutEvent.id).filter_by(id=payload.event_id).first():
        raise HTTPException(404, "Event not found")
    post = WebPost(
        slug=slug,
        title=payload.title.strip(),
        excerpt=payload.excerpt,
        body=payload.body,
        cover_media_id=payload.cover_media_id,
        event_id=payload.event_id,
        published=False,
        draft_version=1,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
        seo_title=payload.seo_title, meta_description=payload.meta_description,
        canonical_url=payload.canonical_url, og_image_id=payload.og_image_id,
        noindex=payload.noindex, sitemap_include=payload.sitemap_include,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    if payload.published:
        _require_post_publish(db, current_user)
        _publish_post(db, post, post.draft_version, current_user.id)
    return _serialize_post(post)


@router.get("/posts/{post_id}")
def get_post(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_post_manage(db, current_user)
    post = db.query(WebPost).filter_by(id=post_id, deleted_at=None).one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")
    return _serialize_post(post)


@router.put("/posts/{post_id}")
def update_post(post_id: int, payload: PostPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_post_manage(db, current_user)
    post = db.query(WebPost).filter_by(id=post_id, deleted_at=None).one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")
    if payload.expected_version is None:
        raise HTTPException(428, "expected_version is required")
    expected = payload.expected_version
    if expected != (post.draft_version or 1):
        raise HTTPException(409, "Draft was changed by another editor")
    _snapshot_post(db, post, current_user.id, "autosave")
    db.flush()
    updated = db.query(WebPost).filter(WebPost.id == post.id, WebPost.draft_version == expected).update(
        {WebPost.draft_version: expected + 1}, synchronize_session=False,
    )
    if updated != 1:
        db.rollback()
        raise HTTPException(409, "Draft was changed by another editor")
    db.refresh(post)
    post.title = payload.title.strip()
    post.excerpt = payload.excerpt
    post.body = payload.body
    post.cover_media_id = payload.cover_media_id
    if payload.event_id is not None and not db.query(ScoutEvent.id).filter_by(id=payload.event_id).first():
        raise HTTPException(404, "Event not found")
    post.event_id = payload.event_id
    post.updated_by_id = current_user.id
    post.seo_title = payload.seo_title
    post.meta_description = payload.meta_description
    post.canonical_url = payload.canonical_url
    post.og_image_id = payload.og_image_id
    post.noindex = payload.noindex
    post.sitemap_include = payload.sitemap_include
    if payload.slug and payload.slug.strip() and payload.slug.strip() != post.slug:
        slug = _slugify(payload.slug)
        if db.query(WebPost).filter(WebPost.slug == slug, WebPost.id != post_id).one_or_none():
            raise HTTPException(400, "Slug is already used")
        post.slug = slug
    db.commit()
    db.refresh(post)
    if payload.published:
        _require_post_publish(db, current_user)
        _publish_post(db, post, post.draft_version, current_user.id)
    return _serialize_post(post)


@router.post("/posts/{post_id}/publish")
def publish_post(post_id: int, payload: PublishPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_post_manage(db, current_user)
    _require_post_publish(db, current_user)
    post = db.query(WebPost).filter_by(id=post_id, deleted_at=None).one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")
    revision = _publish_post(db, post, payload.expected_version, current_user.id)
    return {"post": _serialize_post(post), "published_revision_id": revision.id}


@router.post("/posts/{post_id}/unpublish")
def unpublish_post(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_post_manage(db, current_user)
    _require_post_publish(db, current_user)
    post = db.query(WebPost).filter_by(id=post_id, deleted_at=None).one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")
    post.published = False
    post.published_at = None
    rebuild_published_page_artifacts(db)
    db.commit()
    db.refresh(post)
    return _serialize_post(post)


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_post_manage(db, current_user)
    post = db.query(WebPost).filter_by(id=post_id, deleted_at=None).one_or_none()
    if not post:
        raise HTTPException(404, "Post not found")
    if post.published_revision_id or post.published:
        _require_post_publish(db, current_user)
    post.deleted_at = datetime.now(timezone.utc)
    post.published = False
    db.commit()


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
