from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.models import RoleEnum, User, WebMedia, WebPreviewArtifact, WebReusableComponent
from app.web import previews, routes_design, routes_templates
from app.web.routes_design import DesignResourcePayload
from app.web.routes_pages import PublishPayload
from app.web.routes_templates import TemplatePayload


def _project(label: str) -> dict:
    return {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{
            "component": {
                "type": "wrapper",
                "components": [{"type": "text", "tagName": "p", "content": label}],
            },
            "styles": [],
        }]}],
    }


@pytest.fixture
def preview_context(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(previews, "PREVIEW_DATA_DIR", tmp_path / "previews")
    monkeypatch.setattr(previews, "render_png_preview", lambda _html: None)
    monkeypatch.setattr(routes_design, "_require_action", lambda *_args: None)
    monkeypatch.setattr(routes_templates, "_require_action", lambda *_args: None)
    user = User(
        username="preview-admin",
        real_name="Preview Admin",
        password_hash="not-used",
        role=RoleEnum.ADMIN,
        preferred_language="cs",
        is_active=True,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db_session.add(user)
    db_session.commit()
    return user, tmp_path / "previews"


def test_design_preview_artifacts_persist_cache_and_serve(db_session, preview_context):
    user, preview_storage = preview_context
    media = WebMedia(filename="manual.png", path="manual.png", mime="image/png", size=1)
    db_session.add(media)
    db_session.commit()

    resource = routes_design.create_design_resource(
        "components",
        DesignResourcePayload(
            qualified_key="site:component:preview-card",
            name="Preview card",
            project_data=_project("first"),
            css=".card { color: navy; }",
            preview_media_id=media.id,
        ),
        db_session,
        user,
    )
    assert resource["preview_url"].startswith("/api/web/preview-artifacts/")
    artifact = db_session.query(WebPreviewArtifact).filter_by(
        resource_kind="components", resource_id=resource["id"], status="current",
    ).one()
    assert artifact.mime == "image/svg+xml"
    artifact_path = preview_storage / artifact.storage_path
    assert artifact_path.read_text().startswith("<svg")

    response = routes_design.serve_preview_artifact(artifact.id, db_session, user)
    assert response.media_type == "image/svg+xml"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert artifact_path == response.path
    assert b"Preview card" in artifact_path.read_bytes()

    with pytest.raises(HTTPException) as immutable:
        routes_design.update_design_resource(
            "components",
            resource["id"],
            DesignResourcePayload(
                qualified_key="site:component:renamed",
                name="Preview card",
                project_data=_project("first"),
                expected_version=resource["draft_version"],
            ),
            db_session,
            user,
        )
    assert immutable.value.status_code == 409

    updated = routes_design.update_design_resource(
        "components",
        resource["id"],
        DesignResourcePayload(
            qualified_key=resource["qualified_key"],
            name="Preview card updated",
            project_data=_project("second"),
            css=".card { color: green; }",
            preview_media_id=media.id,
            expected_version=resource["draft_version"],
        ),
        db_session,
        user,
    )
    assert updated["preview_url"] != resource["preview_url"]
    assert db_session.query(WebPreviewArtifact).filter_by(
        resource_kind="components", resource_id=resource["id"], status="current",
    ).count() == 1

    artifact_count = db_session.query(WebPreviewArtifact).filter_by(
        resource_kind="components", resource_id=resource["id"],
    ).count()
    routes_design.publish_design_resource(
        "components",
        resource["id"],
        PublishPayload(expected_version=updated["draft_version"]),
        db_session,
        user,
    )
    # Publishing unchanged source reuses the current cached artifact.
    assert db_session.query(WebPreviewArtifact).filter_by(
        resource_kind="components", resource_id=resource["id"],
    ).count() == artifact_count

    routes_design.regenerate_design_preview("components", resource["id"], db_session, user)
    assert db_session.query(WebPreviewArtifact).filter_by(
        resource_kind="components", resource_id=resource["id"],
    ).count() == artifact_count + 1

    current = db_session.query(WebPreviewArtifact).filter_by(
        resource_kind="components", resource_id=resource["id"], status="current",
    ).one()
    (preview_storage / current.storage_path).unlink()
    item = db_session.get(routes_design.WebReusableComponent, resource["id"])
    assert routes_design._design_out(db_session, item)["preview_url"] == (
        f"/api/web/media/{media.id}/file"
    )
    item.preview_media_id = None
    db_session.commit()
    assert routes_design._design_out(db_session, item)["preview_url"].startswith(
        "data:image/svg+xml;charset=utf-8,"
    )


def test_template_preview_regenerate_and_artifact_path_validation(db_session, preview_context):
    user, preview_storage = preview_context
    template = routes_templates.create_template(
        TemplatePayload(
            key="artifact-template",
            name="Artifact template",
            project_data=_project("template"),
            css="main { padding: 1rem; }",
        ),
        db_session,
        user,
    )
    assert template["preview_url"].startswith("/api/web/preview-artifacts/")

    regenerated = routes_templates.regenerate_template_preview(
        template["id"], db_session, user,
    )
    current = db_session.query(WebPreviewArtifact).filter_by(
        resource_kind="templates", resource_id=template["id"], status="current",
    ).one()
    assert regenerated["preview_url"] == f"/api/web/preview-artifacts/{current.id}/file"
    assert (preview_storage / current.storage_path).is_file()

    (preview_storage / current.storage_path).unlink()
    row = db_session.get(routes_templates.WebTemplate, template["id"])
    assert routes_templates._serialize_template(db_session, row)["preview_url"].startswith(
        "data:image/svg+xml;charset=utf-8,"
    )

    invalid = WebPreviewArtifact(
        resource_kind="templates",
        resource_id=template["id"],
        source_hash="0" * 64,
        viewport="1280x720",
        format="svg",
        storage_path="../../outside.svg",
        mime="image/svg+xml",
        status="current",
    )
    db_session.add(invalid)
    db_session.commit()
    with pytest.raises(HTTPException) as caught:
        routes_design.serve_preview_artifact(invalid.id, db_session, user)
    assert caught.value.status_code == 404


def test_preview_html_resolves_linked_resources_with_database_session(
    db_session,
    preview_context,
    monkeypatch,
):
    component = WebReusableComponent(
        qualified_key="site:linked-preview",
        name="Linked preview",
        project_data=_project("Linked content"),
        css=".linked { color: red; }",
    )
    db_session.add(component)
    db_session.commit()
    linked_project = {
        "scoutcomp": {"schemaVersion": 2},
        "pages": [{"frames": [{
            "component": {
                "type": "wrapper",
                "components": [{
                    "type": "sc-resource-instance",
                    "resourceKind": "component",
                    "resourceId": component.qualified_key,
                    "props": {},
                }],
            },
            "styles": [],
        }]}],
    }
    rendered_html = []

    def capture_html(value):
        rendered_html.append(value)
        return None

    monkeypatch.setattr(previews, "render_png_preview", capture_html)
    previews.build_preview(
        db_session, "sections", 999, linked_project, title="Linked section",
    )
    assert "Linked content" in rendered_html[0]
    assert ".linked { color: red; }" in rendered_html[0]
