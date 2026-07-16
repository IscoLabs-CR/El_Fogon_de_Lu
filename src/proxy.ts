import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// En Next 16 el middleware se llama proxy y exporta `proxy`, no `middleware`.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
