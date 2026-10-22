from app.config import Settings


def test_postgres_urls_use_psycopg_driver():
    for url in ("postgres://u:p@host/db", "postgresql://u:p@host/db?sslmode=require"):
        assert Settings(database_url=url).database_url.startswith("postgresql+psycopg://u:p@host/db")


def test_other_urls_are_unchanged():
    assert Settings(database_url="sqlite:///./x.db").database_url == "sqlite:///./x.db"
    url = "postgresql+psycopg://u:p@host/db"
    assert Settings(database_url=url).database_url == url
