// Served at /feed/ by a host rewrite (see deploy/README.md), like WordPress.
import { postFeed } from "../../lib/rss";
export const GET = () => postFeed();
