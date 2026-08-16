"""Authenticated CMS media routes."""
import json

from .routes_common import *  # noqa: F403

router = APIRouter(prefix="/web", tags=["web"])


# ---------------------------------------------------------------- media


class MediaOut(BaseModel):
    id: int
    filename: str
    mime: str | None = None
    size: int = 0
    url: str = ""
    album: str | None = None
    folder_id: int | None = None
    alt: str | None = None
    caption: str | None = None
    note: str | None = None
    is_public: bool = False
    is_image: bool = False
    created_at: str | None = None
    uploaded_by: dict | None = None


def _media_out(record: WebMedia, db: Session | None = None) -> MediaOut:
    uploaded_by = None
    if record.uploaded_by_id and db is not None:
        user = db.query(User).filter_by(id=record.uploaded_by_id).one_or_none()
        if user:
            uploaded_by = {"id": user.id, "username": user.username, "real_name": user.real_name}
    return MediaOut(
        id=record.id,
        filename=record.filename,
        mime=record.mime,
        size=record.size,
        url=f"/api/web/media/{record.id}/file",
        album=record.album,
        folder_id=record.folder_id,
        alt=record.alt,
        caption=record.caption,
        note=record.note,
        is_public=bool(record.is_public),
        is_image=bool(record.mime and record.mime.startswith("image/")),
        created_at=record.created_at.isoformat() if record.created_at else None,
        uploaded_by=uploaded_by,
    )


def _media_has_published_reference(db: Session, media_id: int) -> bool:
    from .data_sources import is_media_published
    return is_media_published(db, media_id)


@router.get("/media")
def list_media(
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    folder_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user),
):
    _require_action(db, current_user, "web.media.manage")
    query = db.query(WebMedia)
    if folder_id is not None:
        query = query.filter(WebMedia.folder_id == folder_id)
    items = [
        _media_out(m, db).model_dump()
        for m in query.order_by(WebMedia.created_at.desc()).offset(offset).limit(limit).all()
    ]
    return {"items": items, "total": query.count(), "limit": limit, "offset": offset}


class MediaMetaPayload(BaseModel):
    folder_id: int | None = Field(default=None, ge=1)
    filename: str | None = Field(default=None, min_length=1, max_length=255)
    note: str | None = Field(default=None, max_length=1000)


@router.put("/media/{media_id}")
def update_media_meta(media_id: int, payload: MediaMetaPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.media.manage")
    record = db.query(WebMedia).filter_by(id=media_id).one_or_none()
    if not record:
        raise HTTPException(404, "Media not found")
    if payload.folder_id is not None:
        if not db.query(WebMediaFolder).filter_by(id=payload.folder_id).one_or_none():
            raise HTTPException(404, "Folder not found")
        record.folder_id = payload.folder_id
    if payload.filename is not None:
        record.filename = payload.filename.strip() or record.filename
    if payload.note is not None:
        record.note = payload.note.strip() or None
    db.commit()
    db.refresh(record)
    return _media_out(record, db).model_dump()


@router.get("/media/albums")
def list_media_albums(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.media.manage")
    albums = (
        db.query(WebMedia.album)
        .filter(WebMedia.album.isnot(None))
        .distinct()
        .order_by(WebMedia.album.asc())
        .all()
    )
    return [a[0] for a in albums]


class MediaFolderOut(BaseModel):
    id: int
    name: str
    parent_id: int | None = None
    created_at: str | None = None


class MediaFolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: int | None = None


class MediaFolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    parent_id: int | None = None


def _folder_out(folder: WebMediaFolder) -> dict:
    name = folder.name
    if name == "root":
        name = "Kořenový adresář"
    return {
        "id": folder.id,
        "name": name,
        "parent_id": folder.parent_id,
        "created_at": folder.created_at.isoformat() if folder.created_at else None,
        "is_root": folder.name == "root",
    }


def _folder_descendant_ids(db: Session, folder_id: int) -> set[int]:
    result: set[int] = set()
    frontier = [folder_id]
    while frontier:
        children = [row[0] for row in db.query(WebMediaFolder.id).filter(WebMediaFolder.parent_id.in_(frontier)).all()]
        children = [item for item in children if item not in result]
        result.update(children)
        frontier = children
    return result


def _validate_folder_parent(db: Session, folder_id: int, parent_id: int | None) -> None:
    if parent_id is None:
        return
    if parent_id == folder_id:
        raise HTTPException(400, "Folder cannot be its own parent")
    parent = db.query(WebMediaFolder).filter_by(id=parent_id).one_or_none()
    if not parent:
        raise HTTPException(404, "Parent folder does not exist")
    if parent_id in _folder_descendant_ids(db, folder_id):
        raise HTTPException(400, "Folder hierarchy cannot contain a cycle")



def _ensure_root_folder(db: Session) -> WebMediaFolder:
    """Idempotently return the root media folder (Kořenový adresář).

    Also repairs legacy data where non-root folders existed at the top level:
    every folder other than the root itself must be nested under the root.
    """
    from ..models import WebMediaFolder as WMF
    root = db.query(WMF).filter_by(name="root", parent_id=None).order_by(WMF.id.asc()).first()
    if root:
        # Repair orphaned top-level folders by attaching them to the root.
        orphans = db.query(WMF).filter(
            WMF.name != "root", WMF.parent_id.is_(None)
        ).all()
        if orphans:
            for folder in orphans:
                folder.parent_id = root.id
            db.commit()
        return root
    root = WMF(name="root", parent_id=None)
    db.add(root)
    db.commit()
    db.refresh(root)
    return root


def _folder_tree(db: Session) -> list[dict]:
    # Root folder is created on app startup; read-only here.
    folders = db.query(WebMediaFolder).order_by(WebMediaFolder.name.asc()).all()
    by_id = {folder.id: {**_folder_out(folder), "children": []} for folder in folders}
    roots = []
    for node in by_id.values():
        parent = node.get("parent_id")
        if parent and parent in by_id:
            by_id[parent]["children"].append(node)
        else:
            roots.append(node)

    def sort_children(node):
        node["children"].sort(key=lambda item: (not item.get("is_root", False), item["name"].lower()))
        for child in node["children"]:
            sort_children(child)

    # Root folder must always appear first in the top-level tree.
    roots.sort(key=lambda item: (not item.get("is_root", False), item["name"].lower()))
    for root in roots:
        sort_children(root)
    return roots


@router.get("/media/folders")
def list_media_folders(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.media.manage")
    return {"items": _folder_tree(db)}


@router.post("/media/folders", status_code=201)
def create_media_folder(payload: MediaFolderCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.media.manage")
    # All folders live under the root folder; a missing parent defaults to root.
    root = _ensure_root_folder(db)
    parent_id = payload.parent_id if payload.parent_id is not None else root.id
    _validate_folder_parent(db, 0, parent_id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(422, "Folder name is required")
    folder = WebMediaFolder(name=name, parent_id=parent_id, created_by_id=current_user.id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return _folder_out(folder)


@router.put("/media/folders/{folder_id}")
def update_media_folder(folder_id: int, payload: MediaFolderUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.media.manage")
    folder = db.query(WebMediaFolder).filter_by(id=folder_id).one_or_none()
    if not folder:
        raise HTTPException(404, "Folder not found")
    if folder.name == "root":
        # The root folder is a stable, required anchor; it cannot be renamed
        # or reparented (this also keeps delete/seed idempotency reliable).
        raise HTTPException(409, "The root folder cannot be modified")
    _validate_folder_parent(db, folder_id, payload.parent_id)
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(422, "Folder name is required")
        folder.name = name
    if payload.parent_id is not None:
        _validate_folder_parent(db, folder_id, payload.parent_id)
        folder.parent_id = payload.parent_id
    db.commit()
    db.refresh(folder)
    return _folder_out(folder)


@router.delete("/media/folders/{folder_id}", status_code=204)
def delete_media_folder(folder_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.media.manage")
    folder = db.query(WebMediaFolder).filter_by(id=folder_id).one_or_none()
    if not folder:
        raise HTTPException(404, "Folder not found")
    if folder.name == "root":
        raise HTTPException(409, "The root folder cannot be deleted")
    child_count = db.query(WebMediaFolder).filter_by(parent_id=folder_id).count()
    media_count = db.query(WebMedia).filter_by(folder_id=folder_id).count()
    if child_count or media_count:
        raise HTTPException(409, "Folder is not empty")
    db.delete(folder)
    db.commit()


@router.post("/media", status_code=201)
async def upload_media(
    file: UploadFile,
    album: str | None = Form(None),
    folder_id: int | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    _require_action(db, current_user, "web.media.manage")
    payload_album = album.strip() if album and album.strip() else None
    payload_folder_id = folder_id
    if payload_folder_id is None:
        root = _ensure_root_folder(db)
        payload_folder_id = root.id
    else:
        if not db.query(WebMediaFolder).filter_by(id=payload_folder_id).one_or_none():
            raise HTTPException(404, "Folder not found")
    chunks: list[bytes] = []
    size = 0
    while True:
        chunk = await file.read(min(1024 * 1024, MAX_MEDIA_SIZE + 1 - size))
        if not chunk:
            break
        chunks.append(chunk)
        size += len(chunk)
        if size > MAX_MEDIA_SIZE:
            raise HTTPException(413, "File is too large (maximum 10 MB)")
    content = b"".join(chunks)
    detected = _sniff_image(content)
    extension = ALLOWED_MEDIA_TYPES.get(detected or "")
    announced = (file.content_type or "").lower().split(";")[0].strip()
    if detected is None and announced in ALLOWED_MEDIA_TYPES:
        # Content does not have a reliable magic-byte signature (e.g. plain
        # CSV which is just text). Trust the browser-announced MIME and use
        # the appropriate extension.
        detected = announced
        extension = ALLOWED_MEDIA_TYPES[detected]
    if detected == "text/plain" and announced in ("text/plain", "text/csv", "application/octet-stream"):
        pass  # CSV often arrives as text/plain or octet-stream
    elif detected == "image/svg+xml" and announced in ("image/svg+xml", "text/xml", "application/xml", "text/plain", "application/octet-stream"):
        pass  # Browsers may announce SVG as text/xml or octet-stream
    elif not extension or detected != announced:
        raise HTTPException(415, "Unsupported file type or content mismatch")
    media_dir = _media_dir()
    stored_name = f"{uuid.uuid4().hex}{extension}"
    (media_dir / stored_name).write_bytes(content)
    record = WebMedia(
        filename=file.filename or stored_name,
        path=stored_name,
        mime=detected,
        size=size,
        uploaded_by_id=current_user.id,
        album=payload_album,
        folder_id=payload_folder_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _media_out(record, db).model_dump()


@router.get("/media/{media_id}/file")
def serve_media(media_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.media.manage")
    record = db.query(WebMedia).filter_by(id=media_id).one_or_none()
    if not record:
        raise HTTPException(404, "Media not found")
    path = _stored_media_path(record)
    if not path.is_file():
        raise HTTPException(404, "Media file is missing")
    filename = quote(record.filename or "file")
    return FileResponse(
        path,
        media_type=record.mime or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename*=UTF-8\'\'{filename}', "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/media/{media_id}", status_code=204)
def delete_media(media_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    _require_action(db, current_user, "web.media.manage")
    record = db.query(WebMedia).filter_by(id=media_id).one_or_none()
    if not record:
        raise HTTPException(404, "Media not found")
    if _media_has_published_reference(db, media_id):
        raise HTTPException(409, "Media is referenced by published content")
    try:
        _stored_media_path(record).unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(409, "Media file could not be removed") from exc
    db.delete(record)
    db.commit()
