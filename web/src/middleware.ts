const host = request.headers.get("host") ?? "";
const pathname = request.nextUrl.pathname;

if (host === "ddoga.site" || host === "www.ddoga.site") {
  if (
    pathname === "/" ||
    pathname.startsWith("/public-request") ||
    pathname.startsWith("/public-request-status") ||
    pathname.startsWith("/api/public-request")
  ) {
    return NextResponse.next();
  }
}


import { NextRequest, NextResponse } from "next/server";

const PASSWORD = "1021"; // 원하는 비밀번호

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // 이미 인증했으면 통과
  const auth = req.cookies.get("simple_auth");

  if (auth?.value === PASSWORD) {
    return NextResponse.next();
  }

  // login 파라미터로 들어오면 쿠키 저장
  const pw = url.searchParams.get("pw");

  if (pw === PASSWORD) {
    const res = NextResponse.redirect(new URL("/", req.url));

    res.cookies.set("simple_auth", PASSWORD, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  }

  return new NextResponse(
    `
      <html>
        <body style="font-family:sans-serif;padding:40px">
          <h2>비밀번호 입력</h2>
          <form method="GET">
            <input
              type="password"
              name="pw"
              style="padding:8px;font-size:16px"
            />
            <button type="submit" style="padding:8px 12px">
              들어가기
            </button>
          </form>
        </body>
      </html>
    `,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    }
  );
}

export const config = {
  matcher: "/:path*",
};
