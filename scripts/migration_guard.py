"""Stops the one-time migration scripts from silently overwriting content edited in the admin.

Sermons, descriptions, transcripts, events and studies are now edited through the admin, which
commits straight to src/data/. The import scripts rebuild those files from WordPress or the old
database, so running one again would throw those edits away.
"""
import sys

FLAG = "--overwrite-admin-edits"


def require_overwrite_flag(what: str) -> None:
    if FLAG not in sys.argv:
        sys.exit(
            f"Stopped: this script rewrites {what} from the old sources and would overwrite changes made in the admin.\n"
            f"It was a one-time migration. Run it again with {FLAG} only if you really mean to replace those edits."
        )
