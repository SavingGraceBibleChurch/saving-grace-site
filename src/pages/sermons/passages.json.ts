// The passage index for the bookshelf picker and passage searches (loaded only when someone uses them).
import { passagePayload } from "../../lib/passage-index";

export function GET() {
  return new Response(JSON.stringify(passagePayload()), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
