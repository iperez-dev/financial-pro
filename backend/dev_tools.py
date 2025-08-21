"""
Developer tools CLI consolidating common auth/profile/categories/debug helpers.

Usage examples:
  python dev_tools.py auth-login --email you@example.com --password ********
  python dev_tools.py auth-signup --email you@example.com --password ********
  python dev_tools.py session-from-token --token <JWT>
  python dev_tools.py profile-ensure --user-id <UUID> --email you@example.com
  python dev_tools.py categories-list --user-id <UUID>
  python dev_tools.py categories-create --user-id <UUID> --name "Groceries" --keywords grocery,food --group "Shopping & Food"
  python dev_tools.py categories-defaults --user-id <UUID>
  python dev_tools.py debug-categories --user-id <UUID>
"""

import argparse
import json
import os
from getpass import getpass
from typing import List

from dotenv import load_dotenv

from supabase_client import supabase, supabase_admin, get_user_id_from_token, verify_user_token
from database_service import DatabaseService


def print_json(data) -> None:
    print(json.dumps(data, indent=2, default=str))


def cmd_auth_login(args: argparse.Namespace) -> None:
    email = args.email or input("Email: ")
    password = args.password or getpass("Password: ")
    try:
        res = supabase.auth.sign_in_with_password({"email": email, "password": password})
        if not res.user or not res.session:
            raise RuntimeError("Login failed")
        print("✅ Login successful")
        print_json({
            "user_id": res.user.id,
            "email": res.user.email,
            "access_token": res.session.access_token,
        })
    except Exception as e:
        print(f"❌ Login error: {e}")


def cmd_auth_signup(args: argparse.Namespace) -> None:
    email = args.email or input("Email: ")
    password = args.password or getpass("Password: ")
    try:
        res = supabase.auth.sign_up({"email": email, "password": password})
        if res.user:
            print("✅ Sign up successful (email confirmation may be required)")
            print_json({"user_id": res.user.id, "email": res.user.email})
        else:
            print("⚠️ Sign up submitted; check your inbox for confirmation")
    except Exception as e:
        print(f"❌ Sign up error: {e}")


def cmd_session_from_token(args: argparse.Namespace) -> None:
    token = args.token or input("JWT token: ")
    uid = get_user_id_from_token(token)
    info = verify_user_token(token)
    print_json({"user_id": uid, "verified": info.get("verified", False), "info": info})


def cmd_profile_ensure(args: argparse.Namespace) -> None:
    user_id = args.user_id
    email = args.email
    prof = DatabaseService.get_or_create_user_profile(user_id, email)
    print_json(prof or {"error": "Failed to get/create profile"})


def cmd_profile_show(args: argparse.Namespace) -> None:
    user_id = args.user_id
    prof = DatabaseService.get_or_create_user_profile(user_id)
    print_json(prof or {"error": "Profile not found"})


def cmd_categories_list(args: argparse.Namespace) -> None:
    user_id = args.user_id
    cats = DatabaseService.get_categories(user_id)
    print_json(cats)


def cmd_categories_create(args: argparse.Namespace) -> None:
    user_id = args.user_id
    name = args.name
    keywords: List[str] = [k.strip() for k in (args.keywords or "").split(",") if k.strip()]
    group = args.group or "Other"
    cat = DatabaseService.create_category(user_id, name, keywords, group)
    print_json(cat or {"error": "Failed to create category"})


def cmd_categories_defaults(args: argparse.Namespace) -> None:
    user_id = args.user_id
    created = DatabaseService.create_default_categories(user_id)
    print_json({"created": created})


def cmd_debug_categories(args: argparse.Namespace) -> None:
    user_id = args.user_id
    # Raw DB view
    db = DatabaseService.get_categories(user_id)
    # Legacy-mapped view used by API responses
    legacy = [
        {
            "id": str(c.get("id")),
            "name": c.get("name"),
            "keywords": c.get("keywords", []),
            "group": c.get("group_name", "Other"),
        }
        for c in db or []
    ]
    print_json({"db": db, "legacy": legacy, "counts": {"db": len(db or []), "legacy": len(legacy)}})


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Financial Pro Dev Tools")
    sub = p.add_subparsers(dest="cmd", required=True)

    # Auth
    sp = sub.add_parser("auth-login", help="Sign in and print token")
    sp.add_argument("--email")
    sp.add_argument("--password")
    sp.set_defaults(func=cmd_auth_login)

    sp = sub.add_parser("auth-signup", help="Sign up a new user")
    sp.add_argument("--email")
    sp.add_argument("--password")
    sp.set_defaults(func=cmd_auth_signup)

    sp = sub.add_parser("session-from-token", help="Inspect a JWT token")
    sp.add_argument("--token")
    sp.set_defaults(func=cmd_session_from_token)

    # Profile
    sp = sub.add_parser("profile-ensure", help="Ensure profile exists (create if missing)")
    sp.add_argument("--user-id", required=True)
    sp.add_argument("--email", required=False)
    sp.set_defaults(func=cmd_profile_ensure)

    sp = sub.add_parser("profile-show", help="Show profile")
    sp.add_argument("--user-id", required=True)
    sp.set_defaults(func=cmd_profile_show)

    # Categories
    sp = sub.add_parser("categories-list", help="List categories for user")
    sp.add_argument("--user-id", required=True)
    sp.set_defaults(func=cmd_categories_list)

    sp = sub.add_parser("categories-create", help="Create a category")
    sp.add_argument("--user-id", required=True)
    sp.add_argument("--name", required=True)
    sp.add_argument("--keywords", required=False)
    sp.add_argument("--group", required=False)
    sp.set_defaults(func=cmd_categories_create)

    sp = sub.add_parser("categories-defaults", help="Create default categories for user")
    sp.add_argument("--user-id", required=True)
    sp.set_defaults(func=cmd_categories_defaults)

    # Debug
    sp = sub.add_parser("debug-categories", help="Show categories in raw and legacy mapping")
    sp.add_argument("--user-id", required=True)
    sp.set_defaults(func=cmd_debug_categories)

    return p


def main() -> None:
    load_dotenv()
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()


