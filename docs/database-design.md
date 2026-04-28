# Database Design (Supabase/Postgres)

이 문서는 현재 `index.html` 단일 툴을 **주문관리 사이트**로 확장하기 위한 DB 구조 초안이다.

> 이번 단계는 **스키마 준비만** 포함하며, 실제 Supabase 연결 코드는 아직 작성하지 않는다.

## 목표

- eBay 주문 단위(`orders`)와 상품 단위(`order_items`)를 분리 저장
- 실제 배송 건(`shipments`)과 주문-배송 매핑(`shipment_orders`)으로 combined shipping 지원
- 주문 처리상태(`process_status`)와 배송상태(`shipping_status`)를 분리 관리
- 향후 우체국/배송사 데이터(트래킹, 접수상태) 역반영 가능

## 테이블 개요

## 1) `orders`

eBay 주문 1건의 마스터 데이터.

주요 컬럼:
- `order_no` (UNIQUE): eBay 주문번호. PDF 중복 업로드 시 중복 저장 방지
- 수취인/주소/국가/연락처 필드
- `address_key`: 정규화된 주소 키
  - 목적 1: combined shipping 후보 탐지
  - 목적 2: 배송사 수신 데이터 역매칭 보조
- `process_status`:
  - `ready`, `pending`, `refund`, `contact`, `cancelled`, `completed`
- `shipping_status`:
  - `not_exported`, `exported`, `reserved`, `accepted`, `tracking_added`, `shipped`, `issue`

## 2) `order_items`

주문 내 상품 라인 저장.

주요 컬럼:
- `order_id` FK -> `orders.id`
- `item_id`, `title`, `option_text`
- `quantity`, `item_price`, `item_total`
- `content_type`, `hscode`

## 3) `shipments`

실제 배송 1건 레코드.

주요 컬럼:
- `carrier` (text, default `korea_post`)
  - 현재는 우체국 기준이지만 추후 타 배송사 확장 가능
- `shipment_status`: `reserved`, `accepted`, `tracking_added`, `shipped`, `issue`
- `tracking_number`
- `external_payload` (jsonb): 외부 시스템 응답 저장용

## 4) `shipment_orders`

배송건과 주문건의 N:M 매핑.

주요 컬럼:
- `shipment_id` FK -> `shipments.id`
- `order_id` FK -> `orders.id`
- `is_primary`: 대표 주문 여부

`unique (shipment_id, order_id)`로 중복 연결 방지.

## 상태 분리 원칙

- `process_status`: 내부 처리 업무 단계
  - 예) ready -> pending 확인 -> completed
- `shipping_status`: 운송 라이프사이클
  - 예) not_exported -> exported -> reserved -> accepted -> tracking_added -> shipped

두 상태를 분리하면,
- 내부 업무 상태와
- 운송/접수 상태를
서로 독립적으로 운영할 수 있다.

## address_key 권장 생성 규칙

앱 레이어에서 다음 값을 정규화 후 해시/조합 문자열로 저장 권장:

- 수취인명(특수문자 제거, lower)
- 국가코드(upper)
- 우편번호(공백/하이픈 제거)
- 상세주소(특수문자 제거, 공백 정규화, lower)

예시(개념):

`lower(recipient_name)|upper(country_code)|normalized_postal|lower(normalized_address1)`

## 마이그레이션 적용

Supabase SQL Editor 또는 migration 파일로 `supabase/schema.sql`을 적용한다.

## 비범위 (이번 PR에서 안 하는 것)

- Supabase JS 클라이언트 연결 코드
- RLS 정책 상세 설계
- API 엔드포인트/백엔드 구현
- 기존 `index.html` 파서/CSV 포맷 변경
