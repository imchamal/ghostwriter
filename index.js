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
  '- {{user}} / {{User}} / <USER> = the human user persona. This is the ONLY acting subject you may rewrite.',
  '- {{char}} / <BOT> = the assistant character, bot character, NPC, or current chat character. This is NEVER the acting subject of the rewrite.',
  '',
  'TASK:',
  '- Rewrite ONLY the text inside <USER_INPUT> as polished Korean third-person prose.',
  '- The rewritten sentence must describe {{user}} / {{User}} / <USER> doing, feeling, thinking, or saying the original input.',
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

// 채팅별로 저장할 대필 기록 개수입니다.
// 요청대로 옵션 없이 항상 최신 3개만 보여주고 저장합니다.
const MAX_HISTORY_ITEMS = 3;

// SillyTavern 확장 설정에 저장할 기본값입니다.
// 현재는 대필용 연결 프로필 이름만 저장합니다.
const DEFAULT_SETTINGS = {
  profileName: ''
};

// 마지막으로 패널을 그린 채팅 키입니다.
// 유저가 다른 채팅으로 이동했는지 감지할 때 사용합니다.
let lastRenderedChatKey = '';

// 사용자가 직접 닫은 패널인지 기억합니다.
// 대필 기록이 있어도 닫기 버튼을 누르면 숨기고, 새 대필이 생성되면 다시 열립니다.
let isHistoryPanelClosed = false;

/**
 * ghostwriter 설정을 가져옵니다.
 *
 * SillyTavern의 extensionSettings에 저장하므로,
 * 브라우저를 새로고침해도 설정이 유지됩니다.
 */
function getSettings() {
  const context = getSillyTavernContext();

  if (!context?.extensionSettings) {
    return { ...DEFAULT_SETTINGS };
  }

  if (!context.extensionSettings[EXTENSION_NAME]) {
    context.extensionSettings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS };
  }

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!Object.hasOwn(context.extensionSettings[EXTENSION_NAME], key)) {
      context.extensionSettings[EXTENSION_NAME][key] = DEFAULT_SETTINGS[key];
    }
  }

  return context.extensionSettings[EXTENSION_NAME];
}

/**
 * 설정을 SillyTavern에 저장하도록 요청합니다.
 *
 * saveSettingsDebounced는 짧은 시간 안의 여러 변경을 묶어서 저장해 줍니다.
 */
function saveSettings() {
  const context = getSillyTavernContext();
  context?.saveSettingsDebounced?.();
}

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
 * slash command 인자에 공백이나 따옴표가 있어도 안전하게 전달하기 위해 감쌉니다.
 *
 * 예:
 * My Profile -> "My Profile"
 * Bob's "Fast" API -> "Bob's \"Fast\" API"
 */
function quoteSlashArgument(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * slash command 실행 결과에서 실제 텍스트 결과를 꺼냅니다.
 *
 * SillyTavern 버전에 따라 반환값이 문자열이거나,
 * { pipe: "..." } 형태일 수 있어서 둘 다 처리합니다.
 */
function getSlashResultText(result) {
  if (typeof result === 'string') {
    return result.trim();
  }

  if (typeof result?.pipe === 'string') {
    return result.pipe.trim();
  }

  if (typeof result?.value === 'string') {
    return result.value.trim();
  }

  return '';
}

/**
 * SillyTavern slash command 실행 함수를 가져옵니다.
 *
 * 연결 프로필은 공식적으로 `/profile` slash command를 제공합니다.
 * 확장 context에 실행 함수가 있으면 그것을 먼저 쓰고,
 * 없으면 SillyTavern의 slash-commands 모듈을 동적으로 불러옵니다.
 */
async function getSlashCommandExecutor() {
  const context = getSillyTavernContext();

  if (typeof context?.executeSlashCommands === 'function') {
    return context.executeSlashCommands;
  }

  if (typeof window.executeSlashCommands === 'function') {
    return window.executeSlashCommands;
  }

  const slashCommandsModule = await import('/scripts/slash-commands.js');
  return slashCommandsModule.executeSlashCommands;
}

/**
 * slash command 하나를 실행하고 텍스트 결과만 반환합니다.
 */
async function executeSlashCommand(commandText) {
  const executeSlashCommands = await getSlashCommandExecutor();
  const result = await executeSlashCommands(commandText, true, null, true);
  return getSlashResultText(result);
}

/**
 * 현재 선택된 연결 프로필 이름을 가져옵니다.
 *
 * SillyTavern Connection Profiles 공식 slash command:
 * - /profile        현재 프로필 이름 반환
 * - /profile name   해당 프로필로 전환
 */
async function getCurrentConnectionProfileName() {
  return executeSlashCommand('/profile');
}

/**
 * SillyTavern에 저장된 연결 프로필 이름 목록을 가져옵니다.
 *
 * Connection Profiles 공식 slash command:
 * - /profile-list   저장된 프로필 이름 배열을 JSON 문자열로 반환
 */
async function getConnectionProfileNames() {
  const rawProfileList = await executeSlashCommand('/profile-list');

  if (!rawProfileList) {
    return [];
  }

  try {
    const parsedProfileList = JSON.parse(rawProfileList);
    return Array.isArray(parsedProfileList)
      ? parsedProfileList.filter((profileName) => typeof profileName === 'string')
      : [];
  } catch (error) {
    console.warn(`[${EXTENSION_NAME}] profile list parse failed`, error, rawProfileList);
    return [];
  }
}

/**
 * 지정한 연결 프로필로 전환합니다.
 */
async function switchConnectionProfile(profileName) {
  const trimmedProfileName = String(profileName || '').trim();

  if (!trimmedProfileName) {
    return '';
  }

  return executeSlashCommand(`/profile ${quoteSlashArgument(trimmedProfileName)}`);
}

/**
 * 설정된 대필용 연결 프로필로 전환합니다.
 *
 * 반환값:
 * - 원래 프로필 이름
 * - 전환 대상 프로필 이름
 * - 실제 전환 여부
 *
 * 프로필 이름이 비어 있으면 아무것도 전환하지 않습니다.
 */
async function switchToGhostwriterProfile() {
  const profileName = getSettings().profileName.trim();

  if (!profileName) {
    return {
      originalProfileName: '',
      targetProfileName: '',
      switched: false
    };
  }

  const originalProfileName = await getCurrentConnectionProfileName();

  if (originalProfileName && originalProfileName === profileName) {
    return {
      originalProfileName,
      targetProfileName: profileName,
      switched: false
    };
  }

  await switchConnectionProfile(profileName);

  return {
    originalProfileName,
    targetProfileName: profileName,
    switched: true
  };
}

/**
 * 대필 실행 전 프로필을 바꿨다면, 실행 후 원래 프로필로 복귀합니다.
 */
async function restoreConnectionProfile(profileState) {
  if (!profileState?.switched || !profileState.originalProfileName) {
    return;
  }

  await switchConnectionProfile(profileState.originalProfileName);
}

/**
 * 현재 채팅을 구분하기 위한 키를 만듭니다.
 *
 * SillyTavern 버전에 따라 context 안의 필드명이 다를 수 있어서,
 * 여러 후보를 순서대로 확인합니다.
 *
 * 우선순위:
 * 1. 그룹 채팅이면 groupId를 사용합니다.
 * 2. 일반 캐릭터 채팅이면 캐릭터 id와 채팅 id를 조합합니다.
 * 3. 그래도 찾지 못하면 global 키를 사용합니다.
 */
function getCurrentChatKey() {
  const context = getSillyTavernContext();

  const groupId = context?.groupId || context?.selected_group;
  if (groupId) {
    return `group:${groupId}`;
  }

  const characterId = context?.characterId ?? context?.this_chid ?? context?.chid;
  const chatId = context?.chatId || context?.chat_id || context?.chat?.id || context?.chat?.name;

  if (characterId !== undefined && characterId !== null) {
    return `character:${characterId}:chat:${chatId || 'current'}`;
  }

  return 'global';
}

/**
 * localStorage에 사용할 실제 저장 키를 만듭니다.
 *
 * 채팅 키 앞에 확장 이름을 붙여 다른 확장/사이트 데이터와 충돌하지 않게 합니다.
 */
function getHistoryStorageKey() {
  return `${EXTENSION_NAME}.history.${getCurrentChatKey()}`;
}

/**
 * 히스토리 패널 닫힘 상태를 저장하는 키를 만듭니다.
 *
 * 기록은 채팅별로 나뉘므로, 패널을 닫았는지도 채팅별로 따로 기억합니다.
 */
function getHistoryClosedStorageKey() {
  return `${EXTENSION_NAME}.historyClosed.${getCurrentChatKey()}`;
}

/**
 * 현재 채팅의 대필 기록을 불러옵니다.
 *
 * 저장 데이터가 깨졌거나 형식이 다르면 빈 배열로 처리합니다.
 */
function loadHistory() {
  try {
    const rawHistory = localStorage.getItem(getHistoryStorageKey());
    const parsedHistory = rawHistory ? JSON.parse(rawHistory) : [];
    return Array.isArray(parsedHistory) ? parsedHistory : [];
  } catch (error) {
    console.warn(`[${EXTENSION_NAME}] history load failed`, error);
    return [];
  }
}

/**
 * 현재 채팅의 대필 기록을 저장합니다.
 *
 * 최신 기록만 남기기 위해 MAX_HISTORY_ITEMS 개수로 잘라 저장합니다.
 */
function saveHistory(history) {
  try {
    const trimmedHistory = history.slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(getHistoryStorageKey(), JSON.stringify(trimmedHistory));
  } catch (error) {
    console.warn(`[${EXTENSION_NAME}] history save failed`, error);
  }
}

/**
 * 현재 채팅의 히스토리 패널 닫힘 상태를 불러옵니다.
 */
function loadHistoryPanelClosed() {
  return localStorage.getItem(getHistoryClosedStorageKey()) === 'true';
}

/**
 * 현재 채팅의 히스토리 패널 닫힘 상태를 저장합니다.
 */
function saveHistoryPanelClosed(isClosed) {
  localStorage.setItem(getHistoryClosedStorageKey(), String(isClosed));
}

/**
 * 대필이 성공했을 때 새 기록을 추가합니다.
 *
 * id는 시간값과 랜덤 문자열을 섞어서 만듭니다.
 * 나중에 특정 항목을 클릭했을 때 어떤 기록인지 찾는 데 사용합니다.
 */
function addHistoryItem(original, rewritten) {
  const history = loadHistory();
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    original,
    rewritten
  };

  saveHistory([item, ...history]);
  isHistoryPanelClosed = false;
  saveHistoryPanelClosed(false);
  renderHistoryPanel();
}

/**
 * 타임스탬프를 사람이 보기 쉬운 짧은 시간으로 바꿉니다.
 */
function formatHistoryTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
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
    '{{user}} = {{User}} = <USER> = the human user persona who wrote the draft.',
    '{{char}} = <BOT> = the current chat character / assistant character. Do not make this character perform the draft.',
    '</ROLE_MAP>',
    '',
    '<PRONOUN_RULE>',
    'Use {{user}} / {{User}} profile gender for the third-person Korean reference when it is explicit.',
    'Use {{char}} profile only when referring to {{char}} as the receiver, never as the actor.',
    'If {{user}} / {{User}} gender is unclear, do not guess; use neutral Korean phrasing or a natural omitted subject.',
    '</PRONOUN_RULE>',
    '',
    '<USER_INPUT>',
    originalText,
    '</USER_INPUT>',
    '',
    'Output requirement:',
    'Write only the rewritten Korean third-person prose where {{user}} / {{User}} / <USER> is the actor.'
  ].join('\n');
}

/**
 * 입력창 바로 위에 들어갈 히스토리 패널을 만듭니다.
 *
 * 큰 팝업 대신 입력창이 위로 살짝 확장된 것처럼 보이게 하려면,
 * #send_form의 바로 앞에 패널을 끼워 넣는 방식이 가장 단순합니다.
 */
function insertHistoryPanel() {
  if (document.querySelector(`#${EXTENSION_NAME}-history`)) {
    return;
  }

  const sendForm = document.querySelector('#send_form');

  if (!sendForm?.parentElement) {
    console.warn(`[${EXTENSION_NAME}] #send_form parent not found`);
    return;
  }

  const panel = document.createElement('div');
  panel.id = `${EXTENSION_NAME}-history`;
  panel.className = 'ghostwriter-history ghostwriter-history-hidden';
  panel.innerHTML = `
    <div class="ghostwriter-history-header">
      <div class="ghostwriter-history-title">
        <i class="fa-solid fa-ghost" aria-hidden="true"></i>
        <span>ghostwriter</span>
      </div>
      <div class="ghostwriter-history-tools">
        <div class="ghostwriter-history-count" data-ghostwriter-history-count>최근 대필 0개</div>
        <button type="button" class="ghostwriter-history-close" data-ghostwriter-history-close="true" aria-label="대필 기록 패널 닫기">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    </div>
    <div class="ghostwriter-history-list" data-ghostwriter-history-list></div>
  `;

  panel.addEventListener('click', handleHistoryPanelClick);
  sendForm.parentElement.insertBefore(panel, sendForm);
}

/**
 * 히스토리 패널을 현재 채팅 기록에 맞게 다시 그립니다.
 *
 * 기록이 없으면 패널을 숨깁니다.
 * 기록이 있으면 최신 MAX_HISTORY_ITEMS개를 입력창 위에 보여줍니다.
 */
function renderHistoryPanel() {
  insertHistoryPanel();

  const panel = document.querySelector(`#${EXTENSION_NAME}-history`);
  const list = panel?.querySelector('[data-ghostwriter-history-list]');
  const count = panel?.querySelector('[data-ghostwriter-history-count]');

  if (!panel || !list || !count) {
    return;
  }

  const history = loadHistory();
  lastRenderedChatKey = getCurrentChatKey();
  isHistoryPanelClosed = loadHistoryPanelClosed();
  count.textContent = `최근 대필 ${history.length}개`;
  list.innerHTML = '';

  if (!history.length || isHistoryPanelClosed) {
    panel.classList.add('ghostwriter-history-hidden');
    return;
  }

  panel.classList.remove('ghostwriter-history-hidden');

  history.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'ghostwriter-history-item';
    row.dataset.ghostwriterHistoryId = item.id;

    const time = document.createElement('div');
    time.className = 'ghostwriter-history-time';
    time.textContent = formatHistoryTime(item.createdAt);

    const rewritten = document.createElement('button');
    rewritten.type = 'button';
    rewritten.className = 'ghostwriter-history-rewritten';
    rewritten.dataset.ghostwriterHistoryApply = item.id;
    rewritten.textContent = item.rewritten;
    rewritten.title = '이 대필 결과를 입력창에 다시 적용합니다.';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ghostwriter-history-toggle';
    toggle.dataset.ghostwriterHistoryToggle = item.id;
    toggle.textContent = '전체보기';
    toggle.setAttribute('aria-expanded', 'false');

    row.append(time, rewritten, toggle);
    list.appendChild(row);
  });
}

/**
 * 히스토리 패널 안의 버튼을 처리합니다.
 *
 * 동작:
 * - 닫기: 패널을 숨기고 현재 채팅에 닫힘 상태를 저장합니다.
 * - 전체보기: 한 줄로 줄인 대필 결과를 전체 문장으로 펼치거나 접습니다.
 * - 대필 기록 클릭: 해당 결과를 입력창에 다시 적용합니다.
 */
function handleHistoryPanelClick(event) {
  const closeButton = event.target.closest('[data-ghostwriter-history-close]');
  const toggleButton = event.target.closest('[data-ghostwriter-history-toggle]');
  const applyButton = event.target.closest('[data-ghostwriter-history-apply]');

  if (closeButton) {
    isHistoryPanelClosed = true;
    saveHistoryPanelClosed(true);
    document.querySelector(`#${EXTENSION_NAME}-history`)?.classList.add('ghostwriter-history-hidden');
    return;
  }

  if (toggleButton) {
    const row = toggleButton.closest('[data-ghostwriter-history-id]');
    const rewritten = row?.querySelector('[data-ghostwriter-history-apply]');
    const isExpanded = row?.classList.toggle('ghostwriter-history-item-expanded');

    toggleButton.textContent = isExpanded ? '접기' : '전체보기';
    toggleButton.setAttribute('aria-expanded', String(Boolean(isExpanded)));
    rewritten?.focus();
    return;
  }

  if (!applyButton) {
    return;
  }

  const history = loadHistory();
  const item = history.find((historyItem) => historyItem.id === applyButton.dataset.ghostwriterHistoryApply);

  if (!item) {
    toastr?.warning?.('선택한 대필 기록을 찾지 못했어요.');
    renderHistoryPanel();
    return;
  }

  setInputTextareaValue(item.rewritten);
  toastr?.success?.('선택한 대필 결과를 입력창에 적용했어요.');
}

/**
 * 채팅 이동을 느슨하게 감지해서 히스토리 패널을 갱신합니다.
 *
 * SillyTavern의 내부 이벤트 이름은 버전에 따라 달라질 수 있으므로,
 * 테스트용 확장에서는 2초마다 현재 채팅 키가 바뀌었는지만 확인합니다.
 */
function watchChatKeyChanges() {
  window.setInterval(() => {
    const currentChatKey = getCurrentChatKey();

    if (currentChatKey !== lastRenderedChatKey) {
      isHistoryPanelClosed = loadHistoryPanelClosed();
      renderHistoryPanel();
    }
  }, 2000);
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
  let profileState = null;

  try {
    isGenerating = true;
    button?.classList.add('ghostwriter-working');
    button?.setAttribute('disabled', 'disabled');
    setButtonIcon(button, true);

    profileState = await switchToGhostwriterProfile();

    const rewrittenText = await context.generateRaw({
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      prompt: buildRewritePrompt(originalText)
    });

    if (typeof rewrittenText !== 'string' || !rewrittenText.trim()) {
      toastr?.warning?.('대필 결과가 비어 있어요.');
      return;
    }

    const cleanedText = rewrittenText.trim();
    setInputTextareaValue(cleanedText);
    addHistoryItem(originalText, cleanedText);
    toastr?.success?.('대필 결과로 입력창을 덮어썼어요.');
  } catch (error) {
    console.error(`[${EXTENSION_NAME}] rewrite failed`, error);
    toastr?.error?.('대필 중 오류가 발생했어요. 콘솔을 확인해 주세요.');
  } finally {
    try {
      await restoreConnectionProfile(profileState);
    } catch (error) {
      console.error(`[${EXTENSION_NAME}] profile restore failed`, error);
      toastr?.warning?.('원래 연결 프로필로 복귀하지 못했어요.');
    }

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

  const settings = getSettings();
  const panel = document.createElement('div');
  panel.id = `${EXTENSION_NAME}-settings`;
  panel.className = 'ghostwriter-settings';
  panel.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>ghostwriter</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <label class="ghostwriter-settings-field" for="${EXTENSION_NAME}-profile-name">
          <span>대필용 연결 프로필(API)</span>
          <div class="ghostwriter-settings-profile-row">
            <select
            id="${EXTENSION_NAME}-profile-name"
            class="text_pole"
            disabled
          >
            <option value="">프로필 목록 불러오는 중...</option>
          </select>
            <button
              type="button"
              class="menu_button ghostwriter-settings-refresh"
              data-ghostwriter-profile-refresh="true"
              title="연결 프로필 목록 새로고침"
              aria-label="연결 프로필 목록 새로고침"
            >
              <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
            </button>
          </div>
        </label>
        <div class="ghostwriter-settings-hint">
          SillyTavern API 연결의 연결 프로필에 저장된 항목 중 하나를 선택해요. 비워두면 현재 연결을 그대로 사용해요.
        </div>
      </div>
    </div>
  `;

  settingsRoot.appendChild(panel);

  const profileSelect = panel.querySelector(`#${EXTENSION_NAME}-profile-name`);
  const refreshButton = panel.querySelector('[data-ghostwriter-profile-refresh]');

  profileSelect.addEventListener('change', () => {
    getSettings().profileName = profileSelect.value;
    saveSettings();
  });

  refreshButton.addEventListener('click', () => {
    populateConnectionProfileSelect(panel);
  });

  populateConnectionProfileSelect(panel, settings.profileName || '');
}

/**
 * 설정 드롭다운에 저장된 연결 프로필 목록을 채웁니다.
 *
 * 목록을 불러오지 못하면 선택 상자를 비활성화하고,
 * 유저에게 Connection Profiles 확장이 켜져 있는지 확인하라는 안내를 띄웁니다.
 */
async function populateConnectionProfileSelect(panel, preferredProfileName = getSettings().profileName || '') {
  const profileSelect = panel.querySelector(`#${EXTENSION_NAME}-profile-name`);
  const refreshButton = panel.querySelector('[data-ghostwriter-profile-refresh]');

  if (!profileSelect) {
    return;
  }

  profileSelect.disabled = true;
  refreshButton?.setAttribute('disabled', 'disabled');
  profileSelect.innerHTML = '<option value="">프로필 목록 불러오는 중...</option>';

  try {
    const profileNames = await getConnectionProfileNames();
    profileSelect.innerHTML = '';

    const currentOption = document.createElement('option');
    currentOption.value = '';
    currentOption.textContent = '현재 연결 그대로 사용';
    profileSelect.appendChild(currentOption);

    profileNames.forEach((profileName) => {
      const option = document.createElement('option');
      option.value = profileName;
      option.textContent = profileName;
      profileSelect.appendChild(option);
    });

    if (preferredProfileName && !profileNames.includes(preferredProfileName)) {
      const missingOption = document.createElement('option');
      missingOption.value = preferredProfileName;
      missingOption.textContent = `${preferredProfileName} (목록에 없음)`;
      profileSelect.appendChild(missingOption);
    }

    profileSelect.value = preferredProfileName;
    profileSelect.disabled = false;
  } catch (error) {
    console.error(`[${EXTENSION_NAME}] profile list load failed`, error);
    profileSelect.innerHTML = '<option value="">프로필 목록을 불러오지 못했어요</option>';
    toastr?.warning?.('연결 프로필 목록을 불러오지 못했어요. Connection Profiles가 활성화되어 있는지 확인해 주세요.');
  } finally {
    refreshButton?.removeAttribute('disabled');
  }
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
  insertHistoryPanel();
  renderHistoryPanel();
  watchChatKeyChanges();
  insertSettingsPanel();
});
