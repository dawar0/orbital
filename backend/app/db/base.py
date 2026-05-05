from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base declarative class for all ORM models."""


# Import models so Alembic sees a complete metadata graph.

