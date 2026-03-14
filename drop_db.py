#!/usr/bin/env python3
"""
Standalone Database Drop Script
Drops all tables from the Nusa Home database.
"""
import sys
import os

# Add the current directory to path so it can find the 'app' module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import init_pool, close_pool, get_cursor
from app.utils import TABLES
from app.core.logging import logger

def main():
    print("----------------------------------------------")
    print("        NUSA HOME API - DB DROPPER")
    print("----------------------------------------------")
    print("WARNING: This will PERMANENTLY DELETE all data!")
    
    confirm = input("\nAre you sure you want to drop all tables? (type 'yes' to continue): ")
    if confirm.lower() != 'yes':
        print("Operation cancelled.")
        return

    try:
        print("\n[*] Initializing database connection pool...")
        init_pool()
        
        with get_cursor() as cur:
            # 1. Get List of all Application Tables
            # Standard tables
            app_tables = ['users', 'status_relay', 'app_history', 'app_settings']
            
            # Sensor tables from app.utils
            sensor_tables = list(TABLES.values())
            
            all_tables = app_tables + sensor_tables
            
            print(f"[*] Found {len(all_tables)} tables to drop: {', '.join(all_tables)}")
            
            # 2. Drop Tables
            for table in all_tables:
                print(f"[*] Dropping table: {table}...")
                cur.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")
            
            print("\n[+] All tables dropped successfully!")
            
    except Exception as e:
        print(f"\n[!] ERROR: Failed to drop database tables.")
        print(f"    Details: {e}")
        sys.exit(1)
    finally:
        print("[*] Closing database connections...")
        close_pool()
        print("\nDone.")

if __name__ == "__main__":
    main()
