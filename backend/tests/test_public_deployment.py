"""Deployment-boundary regressions for the public site and PWA origins."""
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

import pytest
from pydantic import ValidationError

from app.config import SiteSettings
from app.models import WebPage
from app.web.renderer import render_document


def test_public_site_url_is_an_https_origin():
    assert SiteSettings(public_url="https://www.example.cz/").public_url == "https://www.example.cz"
    assert SiteSettings(public_url="https://www.example.cz:8443").public_url == "https://www.example.cz:8443"
    assert SiteSettings(public_url="http://localhost:8090/").public_url == "http://localhost:8090"

    for invalid in (
        "http://www.example.cz",
        "https://user:secret@www.example.cz",
        "https://www.example.cz/subpath",
        "https://www.example.cz?preview=1",
    ):
        with pytest.raises(ValidationError):
            SiteSettings(public_url=invalid)


def test_render_document_emits_safe_social_metadata():
    document = render_document(
        "<main>Obsah</main>",
        title='Stránka "A"',
        description="Popis & obsah",
        canonical_url="https://www.example.cz/stranka",
        og_image="https://www.example.cz/media/1/file",
        og_type="article",
        site_name="Oddíl & přátelé",
    )

    assert '<link rel="canonical" href="https://www.example.cz/stranka">' in document
    assert '<meta property="og:type" content="article">' in document
    assert '<meta property="og:url" content="https://www.example.cz/stranka">' in document
    assert '<meta property="og:image" content="https://www.example.cz/media/1/file">' in document
    assert '<meta name="twitter:card" content="summary_large_image">' in document
    assert 'Oddíl &amp; přátelé' in document


def test_sitemap_and_robots_use_configured_absolute_origin(db_session, monkeypatch):
    import app.site_app as site_module

    page = WebPage(
        title="Kontakt",
        slug="kontakt",
        path_segment="kontakt",
        path="/kontakt",
        published=True,
    )
    db_session.add(page)
    db_session.commit()
    monkeypatch.setattr(site_module, "SessionLocal", sessionmaker(bind=db_session.bind))
    monkeypatch.setattr(site_module.settings.site, "public_url", "https://www.example.cz")
    site = TestClient(site_module.app)

    sitemap = site.get("/sitemap.xml", headers={"host": "attacker.example"})
    assert sitemap.status_code == 200
    assert "<loc>https://www.example.cz/kontakt</loc>" in sitemap.text
    assert "attacker.example" not in sitemap.text
    assert sitemap.headers["cache-control"].startswith("public, max-age=300")

    robots = site.get("/robots.txt", headers={"host": "attacker.example"})
    assert robots.status_code == 200
    assert "Sitemap: https://www.example.cz/sitemap.xml" in robots.text
    assert robots.headers["cache-control"] == "public, max-age=3600"


def test_request_origin_is_development_fallback_for_sitemap(db_session, monkeypatch):
    import app.site_app as site_module

    db_session.add(WebPage(
        title="Program", slug="program", path_segment="program", path="/program", published=True,
    ))
    db_session.commit()
    monkeypatch.setattr(site_module, "SessionLocal", sessionmaker(bind=db_session.bind))
    monkeypatch.setattr(site_module.settings.site, "public_url", "")
    site = TestClient(site_module.app)

    sitemap = site.get("/sitemap.xml", headers={"host": "localhost:8090"})
    assert "<loc>http://localhost:8090/program</loc>" in sitemap.text
    robots = site.get("/robots.txt", headers={"host": "localhost:8090"})
    assert "Sitemap: http://localhost:8090/sitemap.xml" in robots.text
