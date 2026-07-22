# ghostwriter

SillyTavern 입력창의 유저 초안을 버튼 한 번으로 "유저 시점의 3인칭" 문장으로 대필하는 테스트용 확장입니다.

## 현재 기능

- 입력창(`#send_textarea`)의 현재 내용을 읽습니다.
- SillyTavern에서 현재 활성화된 API 연결을 그대로 사용합니다.
- 원문 의도, 행동, 감정은 유지하고 유저가 조종하는 인물의 3인칭 문장으로 다시 씁니다.
- 원문에 없는 캐릭터 이름을 새로 만들거나 현재 채팅 캐릭터 이름을 가져오지 않도록 지시합니다.
- 결과는 바로 전송하지 않고 입력창에만 반영합니다.

## 파일 구조

```text
ghostwriter/
  manifest.json  # SillyTavern이 확장을 인식하는 설정 파일
  index.js       # 버튼 추가, 입력 읽기, 대필 요청, 결과 반영 담당
  style.css      # 버튼과 설정 패널의 최소 스타일
  README.md      # 사용법과 구조 설명
```

## 설치 위치

이 폴더를 SillyTavern의 서드파티 확장 폴더에 넣으면 됩니다.

```text
SillyTavern/public/scripts/extensions/third-party/ghostwriter
```

## 주로 수정할 곳

`index.js`의 `DEFAULT_SYSTEM_PROMPT`를 바꾸면 대필 규칙을 바꿀 수 있습니다.

`index.js`의 `setButtonIcon()`을 바꾸면 버튼 아이콘을 바꿀 수 있습니다.

`style.css`의 `.ghostwriter-button`을 바꾸면 버튼 모양을 조정할 수 있습니다.

## 다음 단계 후보

- 대필 전 미리보기 창 추가
- 원문 덮어쓰기 / 아래에 추가 옵션
- 대필용 연결 프로필 이름 저장
- 실행 전 특정 연결 프로필로 전환
- 실행 후 원래 연결 프로필로 복귀
