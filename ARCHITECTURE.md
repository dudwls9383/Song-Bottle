# 구조와 데이터 흐름

## 한눈에 보기

```text
React 화면
    | /api 요청 + 익명 토큰
Express 서버
    | 입력 검증 + 소유권 확인
교환 서비스 (server/store.js)
    | 단일 트랜잭션
SQLite 파일 (data/song-bottle.db)
```

개발 때는 Express 안에서 Vite를 실행해 화면과 API를 같은 포트로 제공합니다.
배포 때는 Express가 빌드된 화면과 API를 함께 제공합니다.

## 화면

- `Home`: 입력과 대기 상태, 최신 도착 음악.
- `History`: 보낸 보틀과 받은 곡, 상태 필터.
- `Playlist`: 방향·플랫폼·무드·검색 필터, 즐겨찾기와 내보내기.
- `App`: 메뉴, 데이터 갱신, 결과 모달, 신고, 설정, 도움말.

## 데이터

`users`에는 익명 ID와 토큰의 SHA-256 해시를 저장합니다. 원본 토큰은 생성할 때만 반환합니다.

`bottles`에는 보낸 곡, 작성자 ID, 상태, 상대 보틀 ID, 해류, 생성·교환 시각을 저장합니다.
상대에게 작성자 ID나 인증 토큰을 반환하지 않습니다.

`reports`에는 신고자, 받은 보틀, 사유, 시각을 저장합니다.

## 동시성

교환은 `BEGIN IMMEDIATE` 트랜잭션 안에서 대기 대상 선택, 새 보틀 삽입, 양쪽 상태 갱신까지 마칩니다.
요청 ID와 사용자 ID 조합의 고유 제약으로 같은 제출의 재시도를 한 번만 처리합니다.
첫 사용자는 주기적 조회를 통해 상대가 나중에 보낸 결과를 받습니다.

## API

| 메서드 | 경로                      | 동작                  |
| ------ | ------------------------- | --------------------- |
| GET    | `/api/health`             | 서버 상태             |
| POST   | `/api/session`            | 익명 토큰 발급        |
| GET    | `/api/bottles`            | 내 기록과 바다 통계   |
| POST   | `/api/bottles`            | 보틀 생성과 매칭      |
| POST   | `/api/bottles/:id/cancel` | 본인의 대기 보틀 회수 |
| POST   | `/api/reports`            | 받은 곡 신고          |

세션과 상태 확인 외 API는 `Authorization: Bearer ...`가 필요합니다.
클라이언트는 토큰을 외부 음악 사이트로 보내지 않습니다.

## 운영 가정

작은 제출용 서비스를 위해 한 서버 프로세스와 하나의 영구 SQLite 디스크를 사용합니다.
서버가 종료되어도 DB 파일을 보존하면 기록은 남습니다. 여러 서버로 수평 확장할 때는 PostgreSQL 같은 공유 DB와 공통 요청 제한 저장소로 이전해야 합니다.

정확한 곡 제목 조회가 필요하면 임의 URL에 서버 요청을 보내는 대신 각 플랫폼 공식 API로 연결합니다.

참고: [Node.js SQLite](https://nodejs.org/api/sqlite.html), [Vite 서버 통합](https://vite.dev/guide/backend-integration).
