// Served at /sermons/feed/ by a host rewrite (see deploy/README.md), like WordPress.
import { sermonFeed } from "../../../lib/rss";
export const GET = () => sermonFeed();
