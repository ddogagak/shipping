# web (Next.js + Supabase)

`web/` 폴더는 DB 기반 주문관리 사이트의 시작점입니다.

## 로컬 실행

1. 의존성 설치

```bash
npm install
```

2. 환경변수 파일 생성 (`web/.env.local`)

```bash
cp .env.example .env.local
```

필수 값:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (서버 전용)

3. 개발 서버 실행

```bash
npm run dev
```

기본 페이지:
- `/` : 안내 페이지
- `/orders` : orders 목록 화면
- `/import` : eBay Orders Report CSV 미리보기 + DB 저장


## 범위

- 루트 `index.html`(GitHub Pages용 변환기)는 이 웹앱 작업에서 수정하지 않습니다.
- DB 기반 확장 개발은 `web/` 폴더에서만 진행합니다.
