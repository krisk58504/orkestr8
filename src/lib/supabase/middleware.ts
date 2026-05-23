/**
 * updateSession — refreshes the Supabase auth session on every request and
 * enforces coarse route protection. Fine-grained authorization (org + role)
 * is enforced by RLS in the database and by layout/page guards.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { perfEnd, perfStart } from "@/lib/perf";
import type { Database } from "@/lib/types/database";

const PUBLIC_PREFIXES = ["/login", "/signup", "/auth", "/error", "/invite"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  const perfT = perfStart();
  const path = request.nextUrl.pathname;

  try {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    // IMPORTANT: getUser() revalidates the token with Supabase Auth. Do not
    // place any logic between createServerClient and this call.
    const perfGetUser = perfStart();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    perfEnd("proxy.auth.getUser", perfGetUser, path);

    if (!user && !isPublicPath(path)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirectTo", path);
      return NextResponse.redirect(url);
    }

    if (user && (path === "/login" || path === "/signup")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } finally {
    perfEnd("proxy.updateSession", perfT, path);
  }
}
