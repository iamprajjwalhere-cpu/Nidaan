# db package — exposes initialize_database and DB_PATH for the rest of the app
from db.init_db import initialize_database, DB_PATH

__all__ = ["initialize_database", "DB_PATH"]
