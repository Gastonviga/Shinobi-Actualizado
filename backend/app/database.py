"""
TitanNVR - Database Configuration
Async SQLAlchemy setup for PostgreSQL (production) with SQLite fallback (dev)

PostgreSQL provides:
- No "database is locked" errors with concurrent writes
- Better performance for multiple camera streams
- Proper connection pooling
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import get_settings

settings = get_settings()

# Determine database type and configure appropriately
is_sqlite = "sqlite" in settings.database_url

# Create async engine with appropriate settings
if is_sqlite:
    # SQLite: For local development only (limited concurrency)
    engine = create_async_engine(
        settings.database_url,
        echo=settings.debug,
        connect_args={"check_same_thread": False}
    )
else:
    # PostgreSQL: Production configuration with connection pooling
    engine = create_async_engine(
        settings.database_url,
        echo=settings.debug,
        pool_size=10,           # Concurrent connections
        max_overflow=20,        # Extra connections under load
        pool_pre_ping=True,     # Verify connections before use
        pool_recycle=300,       # Recycle connections every 5 minutes
    )

# Session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


async def get_db() -> AsyncSession:
    """Dependency to get database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
