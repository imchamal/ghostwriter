/**
 * ghostwriter
 * ----------
 * SillyTavern 입력창에 적힌 유저 초안을 버튼 한 번으로
 * "유저 시점의 3인칭" 문장으로 대필하는 테스트용 확장입니다.
 *
 * 이 파일에서 초보자가 주로 수정하게 될 부분:
 * 1. DEFAULT_SYSTEM_PROMPT: 대필 규칙을 바꾸는 곳
 * 2. setButtonIcon(): 버튼에 보이는 아이콘을 바꾸는 곳
 * 3. insertGhostwriterButton(): 버튼을 어디에 붙일지 조정하는 곳
 */

// 확장 내부에서 반복해서 쓰는 이름입니다.
// HTML id/class 이름을 만들 때 충돌을 줄이기 위해 사용합니다.
const EXTENSION_NAME = 'ghostwriter';

// 모델에게 전달할 기본 대필 지시문입니다.
// 핵심:
// 1. {{user}}는 대필 대상이고, {{char}}는 대필 대상이 아닙니다.
// 2. <USER> 안의 문장만 고쳐 쓰고, <BOT>이나 현재 캐릭터 관점으로 쓰면 안 됩니다.
// 3. 프로필의 성별 단서를 반영해 지시대명사를 고르되, 불명확하면 중립 표현을 씁니다.
// 4. 원문에 없는 이름을 새로 만들거나 현재 캐릭터 이름을 가져오면 안 됩니다.
// 5. 이어쓰기가 아니라 원문만 고쳐쓰기입니다.
const DEFAULT_SYSTEM_PROMPT = [
  'You are Ghostwriter, a rewriting tool for SillyTavern roleplay drafts.',
  '',
  'ROLE DEFINITIONS:',
  '- {{user}} / <USER> = the human user persona. This is the ONLY acting subject you may rewrite.',
  '- {{char}} / <BOT> = the assistant character, bot character, NPC, or current chat character. This is NEVER the acting subject of the rewrite.',
  '',
  'TASK:',
  '- Rewrite ONLY the text inside <USER_INPUT> as polished Korean third-person prose.',
  '- The rewritten sentence must describe {{user}} / <USER> doing, feeling, thinking, or saying the original input.',
  '- Treat the current chat character, {{char}}, <BOT>, and any assistant-side persona as the receiver or context only, never as the narrator or actor.',
  '',
  'PROFILE AND PRONOUN RULES:',
  '- Use the known profile information of {{user}} / {{User}} and {{char}} when choosing Korean pronouns, titles, and references.',
  '- If {{user}} / {{User}} has an explicit gender in the profile or context, choose a matching Korean third-person reference such as "그" for male, "그녀" for female, or another natural Korean equivalent.',
  '- If {{user}} / {{User}} has no clear gender, do not guess. Use neutral Korean phrasing such as "그 사람", a role/title, the persona name if it appears in <USER_INPUT>, or a natural omitted subject.',
  '- Use {{char}}\'s profile only to avoid confusing {{char}} with {{user}} / {{User}} and to choose correct references when {{char}} is mentioned as the receiver.',
  '- Never transfer {{char}}\'s gender, name, traits, or actions onto {{user}} / {{User}}.',
  '',
  'STRICT SUBJECT RULES:',
  '- Do NOT write from {{char}}\'s perspective.',
  '- Do NOT make {{char}} perform the user input.',
  '- Do NOT use the current character name unless that exact name appears inside <USER_INPUT>.',
  '- Do NOT invent a new name for {{user}} / {{User}}.',
  '- If <USER_INPUT> has no explicit {{user}} / {{User}} name, use a pronoun or neutral expression that matches the profile rules above.',
  '',
  'CONTENT RULES:',
  '- Preserve the original intent, action, emotion, tone, and meaning.',
  '- Do not continue the scene.',
  '- Do not add new events, dialogue, backstory, thoughts, or facts.',
  '- Do not answer as {{char}} or <BOT>.',
  '- Return only the rewritten Korean text, with no labels, notes, or explanations.'
].join('\n');

// 생성 중복 실행을 막기 위한 상태값입니다.
// 버튼을 빠르게 여러 번 눌러도 요청이 겹치지 않도록 합니다.
let isGenerating = false;

// 미리보기 창에서 사용할 원문과 대필 결과를 잠시 저장합니다.
// 사용자가 "덮어쓰기" 또는 "아래에 추가"를 누를 때 이 값을 사용합니다.
let latestPreviewOriginal = '';
let latestPreviewRewritten = '';

/**
 * 버튼 안의 아이콘을 설정합니다.
 *
 * 기본 아이콘:
 * <i class="fa-solid fa-ghost"></i>
 *
 * SillyTavern은 Font Awesome을 이미 쓰는 경우가 많아서,
 * 여기서는 별도 이미지 파일 없이 Font Awesome class만 사용합니다.
 */
function setButtonIcon(button, isWorking = false) {
  if (!button) {
    return;
  }

  button.innerHTML = isWorking
    ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>'
    : '<i class="fa-solid fa-ghost" aria-hidden="true"></i>';
}

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
 * 입력창의 기존 내용 아래에 대필 결과를 덧붙입니다.
 *
 * 원문을 보존한 채 비교하거나, 결과를 일부만 가져다 쓰고 싶을 때 유용합니다.
 */
function appendInputTextareaValue(text) {
  const textarea = getInputTextarea();

  if (!textarea) {
    toastr?.error?.('입력창을 찾지 못했어요.');
    return;
  }

  const currentText = textarea.value.trimEnd();
  const nextText = currentText ? `${currentText}\n\n${text}` : text;
  setInputTextareaValue(nextText);
}

/**
 * 대필 결과를 클립보드에 복사합니다.
 *
 * 브라우저 보안 정책 때문에 clipboard API가 막힐 수 있어,
 * 실패하면 임시 textarea를 사용하는 예비 방식을 시도합니다.
 */
async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

/**
 * 모델에 보낼 실제 프롬프트를 만듭니다.
 *
 * originalText는 유저가 입력창에 쓴 원문입니다.
 * 이 함수만 수정해도 대필 스타일을 크게 바꿀 수 있습니다.
 */
function buildRewritePrompt(originalText) {
  return [
    'Rewrite the following SillyTavern draft.',
    '',
    '<ROLE_MAP>',
    '{{user}} = <USER> = the human user persona who wrote the draft.',
    '{{char}} = <BOT> = the current chat character / assistant character. Do not make this character perform the draft.',
    '</ROLE_MAP>',
    '',
    '<PRONOUN_RULE>',
    'Use {{user}} profile gender for the third-person Korean reference when it is explicit.',
    'Use {{char}} profile only when referring to {{char}} as the receiver, never as the actor.',
    'If {{user}} gender is unclear, do not guess; use neutral Korean phrasing or a natural omitted subject.',
    '</PRONOUN_RULE>',
    '',
    '<USER_INPUT>',
    originalText,
    '</USER_INPUT>',
    '',
    'Output requirement:',
    'Write only the rewritten Korean third-person prose where {{user}} / <USER> is the actor.'
  ].join('\n');
}

/**
 * 미리보기 창 DOM을 한 번만 만듭니다.
 *
 * 창 안의 버튼:
 * - 덮어쓰기: 입력창 원문을 대필 결과로 교체합니다.
 * - 아래에 추가: 입력창 원문 아래에 대필 결과를 붙입니다.
 * - 복사: 입력창은 그대로 두고 결과만 클립보드에 복사합니다.
 * - 닫기: 아무것도 적용하지 않고 창만 닫습니다.
 */
function ensurePreviewModal() {
  let modal = document.querySelector(`#${EXTENSION_NAME}-preview`);

  if (modal) {
    return modal;
  }

  modal = document.createElement('div');
  modal.id = `${EXTENSION_NAME}-preview`;
  modal.className = 'ghostwriter-preview ghostwriter-preview-hidden';
  modal.innerHTML = `
    <div class="ghostwriter-preview-backdrop" data-ghostwriter-close="true"></div>
    <div class="ghostwriter-preview-card" role="dialog" aria-modal="true" aria-labelledby="ghostwriter-preview-title">
      <div class="ghostwriter-preview-header">
        <div id="ghostwriter-preview-title" class="ghostwriter-preview-title">ghostwriter 미리보기</div>
        <button type="button" class="ghostwriter-preview-icon-button" data-ghostwriter-close="true" aria-label="미리보기 닫기">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      <div class="ghostwriter-preview-section">
        <div class="ghostwriter-preview-label">원문</div>
        <div class="ghostwriter-preview-text" data-ghostwriter-original></div>
      </div>
      <div class="ghostwriter-preview-section">
        <div class="ghostwriter-preview-label">대필 결과</div>
        <textarea class="ghostwriter-preview-result" data-ghostwriter-result></textarea>
      </div>
      <div class="ghostwriter-preview-actions">
        <button type="button" class="menu_button ghostwriter-preview-action" data-ghostwriter-action="replace">덮어쓰기</button>
        <button type="button" class="menu_button ghostwriter-preview-action" data-ghostwriter-action="append">아래에 추가</button>
        <button type="button" class="menu_button ghostwriter-preview-action" data-ghostwriter-action="copy">복사</button>
        <button type="button" class="menu_button ghostwriter-preview-action ghostwriter-preview-secondary" data-ghostwriter-close="true">닫기</button>
      </div>
    </div>
  `;

  modal.addEventListener('click', handlePreviewClick);
  document.body.appendChild(modal);
  return modal;
}

/**
 * 미리보기 창에서 버튼을 눌렀을 때 실행되는 함수입니다.
 */
async function handlePreviewClick(event) {
  const closeTarget = event.target.closest('[data-ghostwriter-close]');
  const actionTarget = event.target.closest('[data-ghostwriter-action]');

  if (closeTarget) {
    closePreviewModal();
    return;
  }

  if (!actionTarget) {
    return;
  }

  const modal = ensurePreviewModal();
  const resultTextarea = modal.querySelector('[data-ghostwriter-result]');
  const editedResult = resultTextarea?.value?.trim();

  if (!editedResult) {
    toastr?.warning?.('적용할 대필 결과가 비어 있어요.');
    return;
  }

  const action = actionTarget.dataset.ghostwriterAction;

  if (action === 'replace') {
    setInputTextareaValue(editedResult);
    closePreviewModal();
    toastr?.success?.('대필 결과로 입력창을 덮어썼어요.');
    return;
  }

  if (action === 'append') {
    appendInputTextareaValue(editedResult);
    closePreviewModal();
    toastr?.success?.('대필 결과를 입력창 아래에 추가했어요.');
    return;
  }

  if (action === 'copy') {
    try {
      await copyTextToClipboard(editedResult);
      toastr?.success?.('대필 결과를 클립보드에 복사했어요.');
    } catch (error) {
      console.error(`[${EXTENSION_NAME}] copy failed`, error);
      toastr?.error?.('클립보드 복사에 실패했어요.');
    }
  }
}

/**
 * 대필 결과 미리보기 창을 엽니다.
 *
 * 결과 textarea는 사용자가 직접 수정할 수 있게 해두었습니다.
 * 수정 후 덮어쓰기/아래에 추가/복사를 누르면 수정된 내용이 적용됩니다.
 */
function openPreviewModal(originalText, rewrittenText) {
  latestPreviewOriginal = originalText;
  latestPreviewRewritten = rewrittenText;

  const modal = ensurePreviewModal();
  const originalBox = modal.querySelector('[data-ghostwriter-original]');
  const resultTextarea = modal.querySelector('[data-ghostwriter-result]');

  originalBox.textContent = latestPreviewOriginal;
  resultTextarea.value = latestPreviewRewritten;
  modal.classList.remove('ghostwriter-preview-hidden');
  resultTextarea.focus();
}

/**
 * 미리보기 창을 닫습니다.
 */
function closePreviewModal() {
  const modal = document.querySelector(`#${EXTENSION_NAME}-preview`);
  modal?.classList.add('ghostwriter-preview-hidden');
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
    setButtonIcon(button, true);

    const rewrittenText = await context.generateRaw({
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      prompt: buildRewritePrompt(originalText)
    });

    if (typeof rewrittenText !== 'string' || !rewrittenText.trim()) {
      toastr?.warning?.('대필 결과가 비어 있어요.');
      return;
    }

    openPreviewModal(originalText, rewrittenText.trim());
    toastr?.success?.('대필 결과를 미리보기로 열었어요.');
  } catch (error) {
    console.error(`[${EXTENSION_NAME}] rewrite failed`, error);
    toastr?.error?.('대필 중 오류가 발생했어요. 콘솔을 확인해 주세요.');
  } finally {
    isGenerating = false;
    button?.classList.remove('ghostwriter-working');
    button?.removeAttribute('disabled');
    setButtonIcon(button);
  }
}

/**
 * 입력창 주변에 ghostwriter 버튼을 추가합니다.
 *
 * 목표 위치는 "전송 버튼 옆"입니다.
 * SillyTavern 버전에 따라 전송 버튼 id가 조금 다를 수 있어서,
 * 자주 쓰이는 selector들을 순서대로 찾아보고 가장 먼저 발견되는 버튼 옆에 붙입니다.
 */
function insertGhostwriterButton() {
  if (document.querySelector(`#${EXTENSION_NAME}-button`)) {
    return;
  }

  const sendButton = document.querySelector('#send_but, #send_button, #send');
  const fallbackContainer = document.querySelector('#send_form');
  const container = sendButton?.parentElement || fallbackContainer;

  if (!container) {
    console.warn(`[${EXTENSION_NAME}] send button container not found`);
    return;
  }

  const button = document.createElement('button');
  button.id = `${EXTENSION_NAME}-button`;
  button.type = 'button';
  button.className = 'menu_button ghostwriter-button';
  button.title = '입력창 내용을 유저 시점의 3인칭 문장으로 대필합니다.';
  button.setAttribute('aria-label', '유저 시점 3인칭 대필');
  button.addEventListener('click', rewriteCurrentInput);
  setButtonIcon(button);

  if (sendButton?.nextSibling) {
    container.insertBefore(button, sendButton.nextSibling);
  } else {
    container.appendChild(button);
  }
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
