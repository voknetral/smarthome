#!/usr/bin/env python3
"""
Standalone Database Initialization Script
Initializes the database schema and seeds default data.
"""
import sys
import os

# Add the current directory to path so it can find the 'app' module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import init_pool, close_pool, check_database_exists, create_database
from app.utils import init_db
from app.core.logging import logger

def main():
    print("----------------------------------------------")
    print("       NUSA HOME API - DB INITIALIZER")
    print("----------------------------------------------")
    
    try:
        print("\n[*] Checking database identity...")
        if not check_database_exists():
            print("[!] Database not found. Attempting to create it...")
            create_database()
        else:
            print("[+] Database already exists.")

        print("\n[*] Initializing database connection pool...")
        init_pool()
        
        print("[*] Running schema initialization and seeding...")
        # Existing logic in app.utils handles table creation and defaults
        init_db()
        
        print("\n[+] Database initialization completed successfully!")
        print("[!] Default relays and settings have been applied.")
        
    except Exception as e:
        print(f"\n[!] ERROR: Failed to initialize database.")
        print(f"    Details: {e}")
        sys.exit(1)
    finally:
        print("[*] Closing database connections...")
        close_pool()
        print("\nDone.")

if __name__ == "__main__":
    main()
