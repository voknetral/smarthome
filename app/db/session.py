import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from threading import BoundedSemaphore
from app.core.config import settings
from app.core.logging import logger

# Global connection pool (if using pool) or just simple connection for now
# Ideally use a Pool (psycopg2.pool.SimpleConnectionPool)
from psycopg2 import pool

db_pool = None
pool_semaphore = None

def init_pool():
    global db_pool, pool_semaphore
    if db_pool is None:
        try:
            db_pool = pool.ThreadedConnectionPool(
                settings.DB_POOL_MIN,
                settings.DB_POOL_MAX,
                **settings.DB_CONFIG
            )
            pool_semaphore = BoundedSemaphore(settings.DB_POOL_MAX)
            logger.info(f"Database pool initialized (Min: {settings.DB_POOL_MIN}, Max: {settings.DB_POOL_MAX}).")
        except Exception as e:
            print(f"Error initializing DB pool: {e}")
            raise e

def close_pool():
    global db_pool, pool_semaphore
    if db_pool:
        db_pool.closeall()
        logger.info("Database pool closed.")
        db_pool = None
        pool_semaphore = None

@contextmanager
def get_cursor():
    """Get a cursor from the connection pool"""
    global db_pool, pool_semaphore
    if not db_pool:
        init_pool()
    
    # Block until a connection is available
    pool_semaphore.acquire()
    try:
        conn = db_pool.getconn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SET TIME ZONE 'Asia/Jakarta'")
                yield cur
                conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            db_pool.putconn(conn)
    finally:
        pool_semaphore.release()

def check_database_exists():
    """Check if the configured database exists"""
    try:
        # Connect to postgres default db to check existence
        conn_params = settings.DB_CONFIG.copy()
        conn_params["dbname"] = "postgres"
        
        with psycopg2.connect(**conn_params) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (settings.DB_NAME,))
                return cur.fetchone() is not None
    except Exception as e:
        logger.error(f"DB Check Failed: {e}")
        return False

def create_database():
    """Create the configured database if it doesn't exist"""
    conn = None
    try:
        # Connection must be to 'postgres' or similar to create another DB
        # Also, autocommit must be True to run CREATE DATABASE
        conn_params = settings.DB_CONFIG.copy()
        target_db = conn_params["dbname"]
        conn_params["dbname"] = "postgres"
        
        # Don't use connection context manager here as it handles transactions
        conn = psycopg2.connect(**conn_params)
        conn.autocommit = True
        
        with conn.cursor() as cur:
            logger.info(f"Creating database '{target_db}'...")
            cur.execute(f'CREATE DATABASE "{target_db}"')
            logger.info(f"Database '{target_db}' created successfully.")
            return True
    except Exception as e:
        logger.error(f"Failed to create database '{settings.DB_NAME}': {e}")
        raise e
    finally:
        if conn:
            conn.close()
