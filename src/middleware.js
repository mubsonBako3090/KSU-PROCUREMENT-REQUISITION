import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/register-admin",
  "/forgot-password",
  "/reset-password",
];

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const isApiAuth = pathname.startsWith("/api/auth");
  const isStaticAsset = pathname.startsWith("/_next") || pathname.startsWith("/images");

  if (isPublic || isApiAuth || isStaticAsset) {
    return NextResponse.next();
  }

  // API routes (everything under /api except /api/auth) get a JSON 401
  // instead of a redirect. axios follows redirects by default, so a
  // redirect here would silently hand the client login-page HTML instead
  // of an error it can actually detect and act on (e.g. after a session
  // expires mid-use, or a token invalidated by password change).
  const isApi = pathname.startsWith("/api");

  const token = request.cookies.get("token")?.value;

  if (!token) {
    if (isApi) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch (err) {
    if (isApi) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
