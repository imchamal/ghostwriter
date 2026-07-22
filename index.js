/**
 * ghostwriter
 * ----------
 * SillyTavern 입력창에 적힌 유저 초안을 버튼 한 번으로
 * "유저 시점의 3인칭" 문장으로 대필하는 테스트용 확장입니다.
 *
 * 이 파일에서 초보자가 주로 수정하게 될 부분:
 * 1. DEFAULT_SYSTEM_PROMPT: 대필 규칙을 바꾸는 곳
 * 2. BUTTON_LABEL: 버튼에 보이는 이름을 바꾸는 곳
 * 3. insertGhostwriterButton(): 버튼을 어디에 붙일지 조정하는 곳
 */

// 확장 내부에서 반복해서 쓰는 이름입니다.
// HTML id/class 이름을 만들 때 충돌을 줄이기 위해 사용합니다.
const EXTENSION_NAME = 'ghostwriter';

// 버튼에 표시될 문구입니다.
// 너무 길면 입력창 주변 UI가 좁아질 수 있으니 짧게 유지하는 편이 좋습니다.
const BUTTON_LABEL = '3인칭 대필';

// 모델에게 전달할 기본 대필 지시문입니다.
// 핵심은 "이어쓰기"가 아니라 "유저가 쓴 문장을 3인칭으로 고쳐쓰기"라는 점입니다.
const DEFAULT_SYSTEM_PROMPT = [
  'You rewrite the user roleplay input into natural third-person prose from the user character perspective.',
  'Keep the original intent, actions, emotion, and meaning.',
  'Use third-person narration for the user character.',
  'Do not continue the story.',
  'Do not add new events, dialogue, thoughts, or facts.',
  'Return only the rewritten text.'
].join('\n');

// 생성 중복 실행을 막기 위한 상태값입니다.
// 버튼을 빠르게 여러 번 눌러도 요청이 겹치지 않도록 합니다.
let isGenerating = false;

/**
 * SillyTavern 확장 API를 가져옵니다.
 *
 * SillyTavern은 확장에 getContext()를 제공하며,
 * 여기서 generateRaw 같은 생성 함수를 사용할 수 있습니다.
 */
function getSillyTavernContext() {
  if (typeof SillyTavern !== 'undefined' && SillyTavern?.getContext) {
    return SillyTavern.getContext();
  }

  if (typeof window !== 'undefined' && window.SillyTavern?.getContext) {
    return window.SillyTavern.getContext();
  }

  return null;
}

/**
 * 현재 유저가 글을 쓰는 입력창을 찾습니다.
 *
 * SillyTavern 기본 입력창 id는 #send_textarea 입니다.
 * 나중에 SillyTavern 구조가 바뀌면 이 selector를 먼저 확인하면 됩니다.
 */
function getInputTextarea() {
  return document.querySelector('#send_textarea');
}

/**
 * 입력창 값을 안전하게 바꿉니다.
 *
 * value만 바꾸면 SillyTavern이 입력 변경을 감지하지 못할 수 있어서,
 * input 이벤트를 함께 발생시킵니다.
 */
function setInputTextareaValue(text) {
  const textarea = getInputTextarea();

  if (!textarea) {
    toastr?.error?.('입력창을 찾지 못했어요.');
    return;
  }

  textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

/**
 * 모델에 보낼 실제 프롬프트를 만듭니다.
 *
 * originalText는 유저가 입력창에 쓴 원문입니다.
 * 이 함수만 수정해도 대필 스타일을 크게 바꿀 수 있습니다.
 */
function buildRewritePrompt(originalText) {
  return [
    'Rewrite the following user-written roleplay input in third person.',
    '',
    'Original input:',
    originalText
  ].join('\n');
}

/**
 * 입력창의 원문을 읽고, SillyTavern의 현재 연결 API로 대필을 요청합니다.
 *
 * 현재 버전은 별도 연결 프로필을 전환하지 않습니다.
 * 즉, SillyTavern에서 지금 선택되어 있는 API/모델/프리셋을 그대로 사용합니다.
 */
async function rewriteCurrentInput() {
  if (isGenerating) {
    return;
  }

  const textarea = getInputTextarea();
  const originalText = textarea?.value?.trim();

  if (!originalText) {
    toastr?.warning?.('대필할 입력문이 비어 있어요.');
    return;
  }

  const context = getSillyTavernContext();

  if (!context?.generateRaw) {
    toastr?.error?.('SillyTavern 생성 API를 찾지 못했어요.');
    return;
  }

  const button = document.querySelector(`#${EXTENSION_NAME}-button`);

  try {
    isGenerating = true;
    button?.classList.add('ghostwriter-working');
    button?.setAttribute('disabled', 'disabled');
    button && (button.textContent = '대필 중...');

    const rewrittenText = await context.generateRaw({
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      prompt: buildRewritePrompt(originalText)
    });

    if (typeof rewrittenText !== 'string' || !rewrittenText.trim()) {
      toastr?.warning?.('대필 결과가 비어 있어요.');
      return;
    }

    setInputTextareaValue(rewrittenText.trim());
    toastr?.success?.('3인칭 대필을 입력창에 반영했어요.');
  } catch (error) {
    console.error(`[${EXTENSION_NAME}] rewrite failed`, error);
    toastr?.error?.('대필 중 오류가 발생했어요. 콘솔을 확인해 주세요.');
  } finally {
    isGenerating = false;
    button?.classList.remove('ghostwriter-working');
    button?.removeAttribute('disabled');
    button && (button.textContent = BUTTON_LABEL);
  }
}

/**
 * 입력창 주변에 ghostwriter 버튼을 추가합니다.
 *
 * 우선 #send_form 안에 버튼을 붙입니다.
 * 설치 후 위치가 마음에 들지 않으면 이 함수의 container selector를 바꾸면 됩니다.
 */
function insertGhostwriterButton() {
  if (document.querySelector(`#${EXTENSION_NAME}-button`)) {
    return;
  }

  const container = document.querySelector('#send_form');

  if (!container) {
    console.warn(`[${EXTENSION_NAME}] #send_form not found`);
    return;
  }

  const button = document.createElement('button');
  button.id = `${EXTENSION_NAME}-button`;
  button.type = 'button';
  button.className = 'menu_button ghostwriter-button';
  button.textContent = BUTTON_LABEL;
  button.title = '입력창 내용을 유저 시점의 3인칭 문장으로 대필합니다.';
  button.addEventListener('click', rewriteCurrentInput);

  container.appendChild(button);
}

/**
 * 확장 설정 영역에 아주 작은 안내 패널을 추가합니다.
 *
 * 아직 설정값을 저장하지 않는 테스트 버전이므로,
 * 여기서는 현재 동작 방식만 보여줍니다.
 */
function insertSettingsPanel() {
  if (document.querySelector(`#${EXTENSION_NAME}-settings`)) {
    return;
  }

  const settingsRoot = document.querySelector('#extensions_settings2');

  if (!settingsRoot) {
    console.warn(`[${EXTENSION_NAME}] #extensions_settings2 not found`);
    return;
  }

  const panel = document.createElement('div');
  panel.id = `${EXTENSION_NAME}-settings`;
  panel.className = 'ghostwriter-settings';
  panel.innerHTML = `
    <div class="ghostwriter-settings-title">ghostwriter</div>
    <div class="ghostwriter-settings-body">
      현재 입력창의 초안을 SillyTavern의 활성 API 연결로 유저 시점 3인칭 문장으로 대필해요.
    </div>
  `;

  settingsRoot.appendChild(panel);
}

/**
 * SillyTavern 화면이 준비된 뒤 실행되는 시작점입니다.
 *
 * jQuery의 ready 함수를 쓰는 이유:
 * SillyTavern 확장 예제들이 흔히 사용하는 방식이고,
 * 입력창/설정 영역이 만들어진 뒤 버튼을 붙이기 쉽습니다.
 */
jQuery(() => {
  insertGhostwriterButton();
  insertSettingsPanel();
});
