from __future__ import annotations

import io
import json
import stat
import zipfile
from pathlib import Path

import pytest

from app.models import (
    WebPage,
    WebPreviewArtifact,
    WebReusableComponent,
    WebSiteStyle,
    WebTemplate,
    WebSection,
    WebTheme,
    WebThemeAsset,
    WebThemeVersion,
)
from app.web.theme_package import (
    ThemeConflictError,
    ThemeInUseError,
    ThemePackageError,
    activate_theme,
    inspect_theme,
    install_theme,
    list_themes,
    resolve_theme_asset_path,
    rewrite_theme_asset_urls,
    uninstall_theme,
)
from app.web.renderer import compile_project, render_project


def _manifest(version="1.0.0", resources=None):
    return {
        "schema_version": 1,
        "id": "org.scoutcomp.camp",
        "name": "Camp",
        "version": version,
        "author": "ScoutComp",
        "resources": resources or {
            "templates": [{"id": "page", "file": "templates/page.json", "name": "Default page"}],
            "components": [{"id": "event-card", "file": "components/event-card.json"}],
            "styles": ["styles/theme.css"],
            "assets": ["assets/marker.png"],
        },
    }


def _valid_files(version="1.0.0", css=".event { color: var(--site-primary); background: url(assets/marker.png) }"):
    manifest = _manifest(version)
    return {
        "manifest.json": json.dumps(manifest).encode(),
        "theme.json": json.dumps({
            "schema_version": 1,
            "tokens": {"colors": {"primary": "#123456"}},
            "styles": ["styles/theme.css"],
        }).encode(),
        "templates/page.json": json.dumps({
            "project_data": {"pages": [{"id": "page", "component": {"type": "main", "components": []}}]},
            "css": ".page { max-width: 70rem }",
        }).encode(),
        "components/event-card.json": json.dumps({
            "name": "Event card",
            "project_data": {"type": "article", "components": [{"type": "text", "content": "Event"}]},
        }).encode(),
        "styles/theme.css": css.encode(),
        "assets/marker.png": b"\x89PNG\r\n\x1a\nminimal-test-image",
    }


def _files_with_linked_part(version="1.0.0"):
    files = _valid_files(version)
    manifest = json.loads(files["manifest.json"])
    manifest["resources"]["parts"] = [
        {"id": "header", "file": "parts/header.json", "name": "Header", "kind": "header"}
    ]
    files["manifest.json"] = json.dumps(manifest).encode()
    files["parts/header.json"] = json.dumps({
        "project_data": {"type": "header", "components": [{"type": "text", "content": "Camp"}]},
    }).encode()
    files["templates/page.json"] = json.dumps({
        "project_data": {
            "pages": [{
                "id": "page",
                "component": {"type": "main", "components": [{"type": "sc-template-part", "resourceId": "header"}]},
            }],
        },
    }).encode()
    return files


def _files_with_linked_component(version="1.0.0"):
    files = _valid_files(version)
    files["components/event-card.json"] = json.dumps({
        "name": "Event card",
        "prop_schema": [{"id": "title", "type": "text", "required": True}],
        "default_props": {"title": "Event"},
        "project_data": {
            "type": "article",
            "components": [{
                "type": "sc-bind",
                "binding": {"scope": "props", "field": "title"},
            }],
        },
        "css": ".event-card{display:block}",
    }).encode()
    files["templates/page.json"] = json.dumps({
        "project_data": {
            "pages": [{
                "id": "page",
                "component": {"type": "main", "components": [{
                    "type": "sc-resource-instance",
                    "resourceId": "event-card",
                    "props": {"title": "Camp event"},
                }]},
            }],
        },
    }).encode()
    return files


def _zip(files, *, special=None):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            if special and name in special:
                info = special[name]
                archive.writestr(info, content)
            else:
                archive.writestr(name, content)
    return output.getvalue()


def _install(db_session, tmp_path, version="1.0.0", files=None):
    return install_theme(
        db_session,
        _zip(files or _valid_files(version)),
        storage_root=tmp_path / "themes",
    )


def test_install_lists_and_inspects_immutable_theme(db_session, tmp_path):
    installed = _install(db_session, tmp_path)

    assert installed.version == "1.0.0"
    assert installed.package_hash
    assert (tmp_path / "themes" / installed.install_path / "manifest.json").is_file()
    assert db_session.query(WebThemeAsset).filter_by(theme_version_id=installed.id).count() == 6

    template = db_session.query(WebTemplate).filter_by(theme_version_id=installed.id).one()
    component = db_session.query(WebReusableComponent).filter_by(theme_version_id=installed.id).one()
    assert template.qualified_key == "org.scoutcomp.camp@1.0.0:templates:page"
    assert template.published_project_data == template.project_data
    assert component.qualified_key == "org.scoutcomp.camp@1.0.0:components:event-card"
    assert component.is_locked is True
    assert component.published_project_data == component.project_data
    assert component.published_version == 1

    catalogue = list_themes(db_session)
    assert catalogue[0]["stable_key"] == "org.scoutcomp.camp"
    assert catalogue[0]["versions"][0]["active"] is False
    detail = inspect_theme(db_session, installed.id)
    assert detail["theme"]["name"] == "Camp"
    assert {asset["path"] for asset in detail["assets"]} == set(_valid_files())


def test_theme_package_accepts_declared_fonts_and_rejects_spoofing(db_session, tmp_path):
    files = _valid_files(css="@font-face{font-family:Theme;src:url(assets/theme.woff) format('woff')}")
    manifest = json.loads(files["manifest.json"])
    manifest["resources"]["assets"].append("assets/theme.woff")
    files["manifest.json"] = json.dumps(manifest).encode()
    files["assets/theme.woff"] = b"wOFF" + (b"\0" * 64)
    installed = install_theme(db_session, _zip(files), storage_root=tmp_path / "themes")
    assert resolve_theme_asset_path(
        installed, "assets/theme.woff", storage_root=tmp_path / "themes",
    ).read_bytes().startswith(b"wOFF")

    invalid = _valid_files(
        version="1.0.1",
        css="@font-face{font-family:Theme;src:url(assets/theme.woff)}",
    )
    invalid_manifest = json.loads(invalid["manifest.json"])
    invalid_manifest["resources"]["assets"].append("assets/theme.woff")
    invalid["manifest.json"] = json.dumps(invalid_manifest).encode()
    invalid["assets/theme.woff"] = b"<script>not a font</script>"
    with pytest.raises(ThemePackageError, match="Font content"):
        install_theme(db_session, _zip(invalid), storage_root=tmp_path / "themes")


def test_install_generates_preview_artifacts_for_immutable_package_resources(
    db_session, tmp_path, monkeypatch,
):
    """Package originals must be visible in the catalog without cloning."""
    from app.web import previews

    monkeypatch.setattr(previews, "PREVIEW_DATA_DIR", tmp_path / "previews")
    monkeypatch.setattr(previews, "render_png_preview", lambda _html: None)

    installed = _install(db_session, tmp_path)
    template = db_session.query(WebTemplate).filter_by(theme_version_id=installed.id).one()
    component = db_session.query(WebReusableComponent).filter_by(theme_version_id=installed.id).one()

    for kind, resource_id in (("templates", template.id), ("components", component.id)):
        artifact = db_session.query(WebPreviewArtifact).filter_by(
            resource_kind=kind, resource_id=resource_id, status="current",
        ).one()
        assert (tmp_path / "previews" / artifact.storage_path).is_file()


def test_catalogue_backfills_missing_package_preview_artifacts(
    db_session, tmp_path, monkeypatch,
):
    """Existing installations get previews at first catalog access too."""
    from app.web import previews, routes_templates, theme_package

    monkeypatch.setattr(previews, "PREVIEW_DATA_DIR", tmp_path / "previews")
    monkeypatch.setattr(previews, "render_png_preview", lambda _html: None)
    monkeypatch.setattr(theme_package, "build_preview", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(routes_templates, "_require_action", lambda *_args: None)

    installed = _install(db_session, tmp_path)
    template = db_session.query(WebTemplate).filter_by(theme_version_id=installed.id).one()
    assert db_session.query(WebPreviewArtifact).filter_by(
        resource_kind="templates", resource_id=template.id,
    ).count() == 0

    activate_theme(db_session, installed.id)
    catalogue = routes_templates.list_templates(db_session, None)

    assert catalogue[0]["preview_url"].startswith("/api/web/preview-artifacts/")


def test_install_namespaces_linked_component_and_persists_typed_props(db_session, tmp_path):
    installed = _install(db_session, tmp_path, files=_files_with_linked_component())
    component = db_session.query(WebReusableComponent).filter_by(theme_version_id=installed.id).one()
    template = db_session.query(WebTemplate).filter_by(theme_version_id=installed.id).one()
    reference = template.project_data["pages"][0]["component"]["components"][0]
    assert reference["resourceId"] == component.qualified_key
    assert component.published_prop_schema == [{"id": "title", "type": "text", "required": True}]
    assert component.published_default_props == {"title": "Event"}
    assert "Camp event" in render_project(db_session, compile_project(template.project_data).tree)


def test_install_preserves_template_usage_and_legacy_page_template_alias(db_session, tmp_path):
    files = _valid_files()
    manifest = json.loads(files["manifest.json"])
    manifest["resources"].pop("templates")
    manifest["resources"]["page-templates"] = [{
        "id": "starter",
        "file": "page-templates/starter.json",
        "name": "Starter",
    }]
    files["manifest.json"] = json.dumps(manifest).encode()
    del files["templates/page.json"]
    files["page-templates/starter.json"] = json.dumps({
        "project_data": {"pages": [{"id": "page", "component": {"type": "main", "components": []}}]},
    }).encode()

    installed = _install(db_session, tmp_path, files=files)
    template = db_session.query(WebTemplate).filter_by(theme_version_id=installed.id).one()

    assert template.qualified_key == "org.scoutcomp.camp@1.0.0:templates:starter"
    assert template.usage_mode == "copy_on_create"


def test_identical_install_is_idempotent_but_version_is_immutable(db_session, tmp_path):
    archive = _zip(_valid_files())
    first = install_theme(db_session, archive, storage_root=tmp_path / "themes")
    again = install_theme(db_session, archive, storage_root=tmp_path / "themes")
    assert again.id == first.id

    changed = _valid_files()
    changed["templates/page.json"] = json.dumps({"project_data": {"pages": [], "changed": True}}).encode()
    with pytest.raises(ThemeConflictError):
        install_theme(db_session, _zip(changed), storage_root=tmp_path / "themes")
    assert db_session.query(WebThemeVersion).count() == 1


@pytest.mark.parametrize("unsafe_name", [
    "../outside.json",
    "/absolute.json",
    "assets\\windows.png",
    "assets/../../escape.png",
])
def test_archive_path_traversal_is_rejected_without_side_effects(db_session, tmp_path, unsafe_name):
    files = _valid_files()
    files[unsafe_name] = b"unsafe"
    with pytest.raises(ThemePackageError):
        install_theme(db_session, _zip(files), storage_root=tmp_path / "themes")
    assert db_session.query(WebTheme).count() == 0
    assert not (tmp_path / "outside.json").exists()


def test_archive_symlink_is_rejected(db_session, tmp_path):
    files = _valid_files()
    files["assets/link.png"] = b"../../outside"
    info = zipfile.ZipInfo("assets/link.png")
    info.create_system = 3
    info.external_attr = (stat.S_IFLNK | 0o777) << 16
    with pytest.raises(ThemePackageError, match="link or non-regular"):
        install_theme(db_session, _zip(files, special={"assets/link.png": info}), storage_root=tmp_path / "themes")
    assert db_session.query(WebTheme).count() == 0


def test_archive_rejects_case_and_unicode_duplicate_names(db_session, tmp_path):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, content in _valid_files().items():
            archive.writestr(name, content)
        archive.writestr("assets/Marker.png", b"duplicate")
    with pytest.raises(ThemePackageError, match="duplicate or ambiguous"):
        install_theme(db_session, output.getvalue(), storage_root=tmp_path / "themes")

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("assets/\u00e9.png", b"one")
        archive.writestr("assets/e\u0301.png", b"two")
    with pytest.raises(ThemePackageError, match="duplicate or ambiguous"):
        install_theme(db_session, output.getvalue(), storage_root=tmp_path / "themes")


def test_archive_rejects_high_compression_ratio_before_extraction(db_session, tmp_path):
    files = _valid_files()
    files["assets/marker.png"] = b"\x89PNG\r\n\x1a\n" + (b"0" * 500_000)
    with pytest.raises(ThemePackageError, match="compression ratio"):
        install_theme(db_session, _zip(files), storage_root=tmp_path / "themes")
    assert db_session.query(WebThemeVersion).count() == 0


@pytest.mark.parametrize("extension", [".svg", ".html", ".js", ".py", ".sh"])
def test_executable_or_active_asset_types_are_rejected(db_session, tmp_path, extension):
    resources = _manifest()["resources"]
    resources["assets"] = [f"assets/payload{extension}"]
    files = _valid_files()
    files["manifest.json"] = json.dumps(_manifest(resources=resources)).encode()
    del files["assets/marker.png"]
    files[f"assets/payload{extension}"] = b"<script>alert(1)</script>"
    message = "SVG contains active or external content" if extension == ".svg" else "Disallowed file type"
    with pytest.raises(ThemePackageError, match=message):
        install_theme(db_session, _zip(files), storage_root=tmp_path / "themes")


@pytest.mark.parametrize("css", [
    '@import "https://evil.example/x.css";',
    ".x { background: url(https://evil.example/track) }",
    ".x { background: url(data:image/svg+xml,bad) }",
    ".x { width: expression(alert(1)) }",
    ".x { behavior: url(assets/not-declared.htc) }",
    ".x { color: red }</style><script>alert(1)</script>",
    ".x { background: url(assets/not-declared.png) }",
])
def test_theme_css_rejects_import_urls_expression_and_style_breakout(db_session, tmp_path, css):
    with pytest.raises(ThemePackageError):
        _install(db_session, tmp_path, files=_valid_files(css=css))
    assert db_session.query(WebThemeVersion).count() == 0


def test_theme_css_allows_standard_scroll_behavior(db_session, tmp_path):
    installed = _install(
        db_session,
        tmp_path,
        files=_valid_files(css="html { scroll-behavior: smooth }"),
    )
    assert "scroll-behavior" in installed.base_css


@pytest.mark.parametrize("project_data", [
    {"type": "script", "script": "alert(1)"},
    {"tagName": "iframe", "attributes": {"src": "https://evil.example"}},
    {"type": "link", "attributes": {"href": "javascript:alert(1)"}},
    {"type": "image", "attributes": {"onerror": "alert(1)"}},
])
def test_project_resources_reject_executable_component_data(db_session, tmp_path, project_data):
    files = _valid_files()
    files["components/event-card.json"] = json.dumps({"project_data": project_data}).encode()
    with pytest.raises(ThemePackageError, match="executable|dangerous|event-handler"):
        _install(db_session, tmp_path, files=files)


@pytest.mark.parametrize("unsafe_project", [
    {"type": "image", "attributes": {"src": "https://tracker.example/pixel.png"}},
    {"type": "image", "src": "/outside-theme/image.png"},
    {"type": "image", "attributes": {"srcset": "assets/marker.png 1x, https://tracker.example/2x.png 2x"}},
])
def test_theme_project_static_assets_cannot_escape_namespace(db_session, tmp_path, unsafe_project):
    files = _valid_files()
    files["components/event-card.json"] = json.dumps({"project_data": unsafe_project}).encode()
    with pytest.raises(ThemePackageError, match="asset|namespace"):
        _install(db_session, tmp_path, files=files)


def test_theme_css_rejects_image_set_external_reference_bypass(db_session, tmp_path):
    css = '.track { background-image: image-set("https://tracker.example/pixel.png" 1x) }'
    with pytest.raises(ThemePackageError):
        _install(db_session, tmp_path, files=_valid_files(css=css))

    css = '.track { background-image: image("https://tracker.example/pixel.png") }'
    with pytest.raises(ThemePackageError):
        _install(db_session, tmp_path, files=_valid_files(css=css))


def test_theme_static_assets_are_namespaced_and_resolve_inside_package(db_session, tmp_path):
    files = _valid_files()
    files["components/event-card.json"] = json.dumps({
        "name": "Image card",
        "project_data": {"type": "image", "attributes": {"src": "assets/marker.png"}},
    }).encode()
    installed = _install(db_session, tmp_path, files=files)
    component = db_session.query(WebReusableComponent).filter_by(theme_version_id=installed.id).one()
    assert component.project_data["attributes"]["src"] == (
        f"/theme-assets/{installed.id}/assets/marker.png"
    )
    assert rewrite_theme_asset_urls(
        ".hero{background:url(assets/marker.png)}", installed.id,
    ) == f".hero{{background:url(/theme-assets/{installed.id}/assets/marker.png)}}"
    assert resolve_theme_asset_path(
        installed, "assets/marker.png", storage_root=tmp_path / "themes",
    ).is_file()


def test_activation_rejects_uncompilable_template_before_live_pointer_changes(db_session, tmp_path):
    installed = _install(db_session, tmp_path)
    template = db_session.query(WebTemplate).filter_by(theme_version_id=installed.id).one()
    template.published_project_data = {"pages": [{"component": {"tagName": "script"}}]}
    db_session.commit()

    with pytest.raises(ThemePackageError, match="invalid published template"):
        activate_theme(db_session, installed.id)
    assert db_session.get(WebSiteStyle, 1).active_theme_version_id is None


def test_activate_preserves_site_overrides_and_active_uninstall_is_blocked(db_session, tmp_path):
    installed = _install(db_session, tmp_path)
    style = db_session.get(WebSiteStyle, 1)
    assert style is not None
    style.draft_tokens = {"colors": {"primary": "#abcdef"}}
    style.draft_css = ".local { color: red }"
    style.published_tokens = {"colors": {"primary": "#fedcba"}}
    style.published_css = ".published-local { color: blue }"
    db_session.commit()

    activated = activate_theme(db_session, installed.id)
    assert activated.active_theme_version_id == installed.id
    assert activated.draft_tokens["colors"]["primary"] == "#abcdef"
    assert activated.published_css == ".published-local { color: blue }"
    from app.site_app import _published_style
    merged_tokens, _, _ = _published_style(db_session)
    assert merged_tokens["colors"] == {"primary": "#fedcba"}
    assert list_themes(db_session)[0]["versions"][0]["active"] is True

    with pytest.raises(ThemeInUseError):
        uninstall_theme(db_session, installed.id, storage_root=tmp_path / "themes")
    assert db_session.get(WebThemeVersion, installed.id) is not None


def test_activation_rejects_theme_without_usable_template(db_session, tmp_path):
    installed = _install(db_session, tmp_path)
    db_session.query(WebTemplate).filter_by(theme_version_id=installed.id).delete()
    db_session.commit()

    with pytest.raises(ThemePackageError, match="no usable published page template"):
        activate_theme(db_session, installed.id)


def test_linked_part_ids_are_namespaced_and_validated_on_activation(db_session, tmp_path):
    installed = _install(db_session, tmp_path, files=_files_with_linked_part())
    template = db_session.query(WebTemplate).filter_by(theme_version_id=installed.id).one()
    section = db_session.query(WebSection).filter_by(theme_version_id=installed.id).one()
    reference = template.project_data["pages"][0]["component"]["components"][0]["resourceId"]
    assert reference == section.qualified_key
    assert activate_theme(db_session, installed.id).active_theme_version_id == installed.id

    db_session.get(WebSiteStyle, 1).active_theme_version_id = None
    db_session.delete(section)
    db_session.commit()
    with pytest.raises(ThemePackageError, match="missing template part"):
        activate_theme(db_session, installed.id)


def test_uninstall_rejects_draft_linked_resource_reference(db_session, tmp_path):
    old = _install(db_session, tmp_path, version="1.0.0", files=_files_with_linked_part("1.0.0"))
    new = _install(db_session, tmp_path, version="2.0.0")
    activate_theme(db_session, new.id)
    imported = db_session.query(WebSection).filter_by(theme_version_id=old.id).one()
    page = WebPage(
        slug="linked-resource",
        title="Linked resource",
        data={"type": "sc-template-part", "resourceId": imported.qualified_key},
        published=False,
    )
    db_session.add(page)
    db_session.commit()

    with pytest.raises(ThemeInUseError, match="linked resource"):
        uninstall_theme(db_session, old.id, storage_root=tmp_path / "themes")
    assert db_session.get(WebThemeVersion, old.id) is not None


def test_uninstall_removes_theme_owned_legacy_clone_and_package_files(db_session, tmp_path):
    old = _install(db_session, tmp_path, version="1.0.0")
    new = _install(db_session, tmp_path, version="2.0.0")
    activate_theme(db_session, new.id)
    imported = db_session.query(WebReusableComponent).filter_by(theme_version_id=old.id).one()
    clone = WebReusableComponent(
        qualified_key="user:event-card",
        name="My event card",
        project_data={"type": "article", "components": [{"type": "text", "content": "Local"}]},
        css=".mine { color: green }",
        theme_version_id=None,
        origin_resource_id=imported.id,
        is_locked=False,
    )
    db_session.add(clone)
    db_session.commit()
    clone_id = clone.id
    old_path = tmp_path / "themes" / old.install_path

    uninstall_theme(db_session, old.id, storage_root=tmp_path / "themes")

    assert db_session.get(WebReusableComponent, clone_id) is None
    assert not old_path.exists()
    assert db_session.get(WebThemeVersion, new.id) is not None
