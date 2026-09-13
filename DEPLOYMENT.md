# 배포 준비

## 현재 시연 주소

최신 외부 접속 주소는 `.artifacts/tunnel-error.log`에서 `https://...trycloudflare.com`을 확인합니다.

현재는 이 PC의 서버를 Cloudflare Quick Tunnel로 연결했습니다. PC를 종료하거나 절전 모드로 전환하면 접속할 수 없습니다. 터널을 다시 만들면 주소가 바뀔 수 있으며 상시 운영용 고정 주소가 아닙니다.

```sh
npm run share
npm run share:stop
```

`share`는 공식 Cloudflare 연결 프로그램을 `.tools`에 내려받고, 앱을 빌드한 뒤 숨김 창으로 서버와 터널을 실행합니다. 공개 주소는 `.artifacts/tunnel-error.log`에 표시됩니다. 종료 명령은 이 프로젝트가 시작한 공유 프로세스만 종료하며 데이터베이스는 보존합니다.

현재 개발 미리보기는 http://localhost:5173, 공개용 빌드는 http://localhost:5174 입니다. 둘은 같은 DB를 사용하지만 주소별로 익명 접속 키가 분리됩니다. 서로 다른 주소에서 내 기록이 다르게 보이는 것은 정상입니다.

공식 안내: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

## 필요한 실행 환경

- Node.js 22.16 이상 (24 LTS 권장).
- 설치 명령: `npm ci`.
- 빌드 명령: `npm run build`.
- 시작 명령: `npm start`.
- Health check: `/api/health`.
- 외부 HTTPS 주소.
- SQLite 파일을 보존하는 영구 디스크 또는 볼륨.

## 환경 변수

| 변수            | 값                                                  |
| --------------- | --------------------------------------------------- |
| `NODE_ENV`      | `production`                                        |
| `PORT`          | 서비스가 제공하는 포트. 기본 5173                   |
| `DATABASE_PATH` | 영구 볼륨 내 `/data/song-bottle.db` 등              |
| `TRUST_PROXY`   | 서비스 앞에 신뢰하는 프록시가 정확히 1개인 경우 `1` |

프록시 개수는 해당 호스팅 구조에 맞춥니다. 접속 제한이 모든 사용자에게 함께 걸리면 프록시 구성을 확인하세요.

## 중요

이 프로젝트는 정적 사이트가 아닌 Node.js 서버입니다. GitHub Pages에 화면만 배포하면 음악 교환은 동작하지 않습니다.

영구 볼륨 없이 실행하면 재배포 시 DB가 사라질 수 있습니다. 서버리스 함수의 임시 파일 시스템은 SQLite 영구 저장소로 사용할 수 없습니다.

데이터 파일과 토큰을 Git에 넣지 않습니다. `.gitignore`에서 `data`, `.env`, 로그, 테스트 산출물을 제외합니다.

## 배포 후 확인

1. 공개 주소의 `/api/health`가 정상인지 확인합니다.
2. 서로 다른 브라우저에서 같은 주소를 엽니다.
3. 다른 곡, 같은 장르, 같은 해류로 실제 교환합니다. 무드는 달라도 교환되어야 합니다.
4. 서버 재시작 후 교환 기록이 유지되는지 확인합니다.

## Docker

`Dockerfile`도 제공됩니다. `/data`를 영구 볼륨에 연결하고 `PORT`로 지정한 포트를 노출합니다.
이미지 빌드만으로 외부 서비스가 생성되거나 유료 플랜이 신청되지는 않습니다.
