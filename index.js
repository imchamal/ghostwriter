/**
 * ghostwriter
 * ----------
 * SillyTavern 입력창에 적힌 유저 초안을 버튼 한 번으로
 * "유저 시점의 3인칭" 문장으로 대필하는 테스트용 확장입니다.
 *
 * 이 파일에서 초보자가 주로 수정하게 될 부분:
 * 1. DEFAULT_SYSTEM_PROMPT: 절대 깨지면 안 되는 기본 대필 규칙
 * 2. TONE_PRESETS / LANGUAGE_PRESETS / LENGTH_PRESETS / CONTEXT_PRESETS: 설정에서 고르는 옵션
 * 3. setButtonIcon(): 버튼에 보이는 아이콘
 * 4. insertGhostwriterButton(): 버튼 위치
 */

// 확장 내부에서 반복해서 쓰는 이름입니다.
// HTML id/class 이름을 만들 때 충돌을 줄이기 위해 사용합니다.
const EXTENSION_NAME = 'ghostwriter';

// 모델에게 전달할 기본 대필 지시문입니다.
// 핵심:
// 1. {{user}}는 대필 대상이고, {{char}}는 대필 대상이 아닙니다.
// 2. <USER> 안의 문장만 고쳐 쓰고, <BOT>이나 현재 캐릭터 관점으로 쓰면 안 됩니다.
// 3. 프로필의 성별 단서를 반영해 지시대명사를 고르되, 불명확하면 중립 표현을 씁니다.
// 4. {{user}} 페르소나 시트에서 성격, 습관, 말투, 행동 경향을 추출해 반영합니다.
// 5. 원문에 없는 이름을 새로 만들거나 현재 캐릭터 이름을 가져오면 안 됩니다.
// 6. 이어쓰기가 아니라 원문만 고쳐쓰기입니다.
const DEFAULT_SYSTEM_PROMPT = [
  'You are Ghostwriter, a rewriting tool for SillyTavern roleplay drafts.',
  '',
  'ROLE DEFINITIONS:',
  '- {{user}} / {{User}} / <USER> = the human user persona. This is the ONLY acting subject you may rewrite.',
  '- {{char}} / <BOT> = the assistant character, bot character, NPC, or current chat character. This is NEVER the acting subject of the rewrite.',
  '',
  'TASK:',
  '- Rewrite ONLY the text inside <USER_INPUT> as polished third-person roleplay prose in the selected output language.',
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
  'USER PERSONA STYLE EXTRACTION:',
  '- Before rewriting, silently inspect the available {{user}} / {{User}} persona profile or persona sheet.',
  '- Extract only durable style signals from the {{user}} persona: personality, habits, speech style, emotional restraint or expressiveness, body-language tendencies, social attitude, preferred vocabulary, and recurring mannerisms.',
  '- Apply those {{user}} persona signals to the rewrite so the result feels like prose written for that specific user persona, not generic third-person prose.',
  '- If the {{user}} persona is blunt, restrained, shy, proud, playful, formal, casual, poetic, awkward, cynical, gentle, or emotionally guarded, reflect that through word choice, rhythm, dialogue style, and body language.',
  '- Do not quote, summarize, or expose the persona sheet. Use it only as hidden style guidance.',
  '- If the persona sheet is unavailable or unclear, keep the rewrite neutral and infer only from <USER_INPUT> and recent context.',
  '- Never borrow {{char}}\'s personality, habits, speech style, or mannerisms for {{user}}.',
  '',
  'STYLE PRIORITY:',
  '- Priority 1: preserve <USER_INPUT> intent, action, dialogue, emotion, and meaning.',
  '- Priority 2: make {{user}} / {{User}} the acting subject.',
  '- Priority 3: reflect {{user}} / {{User}} persona style when available.',
  '- Priority 4: use recent context only for continuity, relationship, mood, and scene fit.',
  '- Priority 5: apply the selected tone, language, and length presets.',
  '- If a style preset conflicts with {{user}} persona, keep the persona recognizable and make the preset subtle.',
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
  '- Use past tense prose.',
  '- If writing in Korean, use natural Korean past-tense endings.',
  '- If writing in English, use natural English past tense.',
  '- Do not continue the scene.',
  '- Do not add new events, backstory, thoughts, or facts.',
  '- Do not add dialogue unless a later length preset explicitly allows brief situation-appropriate dialogue.',
  '- Do not answer as {{char}} or <BOT>.',
  '- Recent chat context is reference-only. Use it only to understand the scene, relationship, mood, and continuity.',
  '- Never copy, rewrite, answer, or continue recent context messages.',
  '- Return only the rewritten text, with no labels, notes, or explanations.'
].join('\n');

// 대필 톤 프리셋입니다.
// label은 설정 화면에 보이는 이름이고, prompt는 모델에게 전달되는 실제 지시문입니다.
const TONE_PRESETS = {
  balanced: {
    label: '기본',
    prompt: 'Use a balanced, natural roleplay prose style.'
  },
  plain: {
    label: '담백함',
    prompt: 'Use plain, restrained prose. Avoid ornate metaphors and excessive emotion.'
  },
  delicate: {
    label: '섬세함',
    prompt: 'Use emotionally nuanced prose with subtle sensory and body-language detail.'
  },
  literary: {
    label: '문학적',
    prompt: 'Use polished literary prose with elegant rhythm, but do not become verbose or add new events.'
  },
  concise: {
    label: '짧고 간결함',
    prompt: 'Use compact prose with minimal elaboration.'
  }
};

// 출력 언어 프리셋입니다.
// 사용자가 고른 언어로만 결과를 반환하게 합니다.
const LANGUAGE_PRESETS = {
  ko: {
    label: '한국어',
    prompt: 'Write the rewritten output in Korean.'
  },
  en: {
    label: '영어',
    prompt: 'Write the rewritten output in English.'
  }
};

// 길이 프리셋입니다.
// 짧게/보통/길게가 체감상 확실히 다르도록 문장 수와 확장 범위를 명확히 나눕니다.
const LENGTH_PRESETS = {
  short: {
    label: '짧게',
    prompt: 'Write 1-2 sentences. Keep the rewrite naturally sized and close to the original input.'
  },
  medium: {
    label: '보통',
    prompt: 'Write 2-4 sentences. Slightly enrich the prose with natural expression, body language, and sensory detail, but do not add new events or facts.'
  },
  long: {
    label: '길게',
    prompt: 'Write 4-7 sentences. Enrich the prose with natural expression, body language, sensory detail, and emotional nuance. You may add brief dialogue only when it naturally fits the current situation and the user input, but do not add new events, new facts, backstory, or unrelated information.'
  }
};

// 최신 메시지 참고 범위 프리셋입니다.
// count는 <RECENT_CONTEXT>에 넣을 최근 채팅 메시지 개수입니다.
// 너무 많이 넣으면 모델이 대필이 아니라 이어쓰기를 하려는 경향이 생길 수 있어 최대 10개로 제한합니다.
const CONTEXT_PRESETS = {
  none: {
    label: '참고 안 함',
    count: 0,
    prompt: 'Do not use recent chat context.'
  },
  low: {
    label: '적게',
    count: 2,
    prompt: 'Use only the last 2 chat messages as reference context.'
  },
  normal: {
    label: '기본',
    count: 4,
    prompt: 'Use the last 4 chat messages as reference context.'
  },
  high: {
    label: '많게',
    count: 6,
    prompt: 'Use the last 6 chat messages as reference context.'
  },
  max: {
    label: '최대',
    count: 10,
    prompt: 'Use the last 10 chat messages as reference context, but still rewrite only <USER_INPUT>.'
  }
};

// 생성 중복 실행을 막기 위한 상태값입니다.
// 버튼을 빠르게 여러 번 눌러도 요청이 겹치지 않도록 합니다.
let isGenerating = false;

// 채팅별로 저장할 대필 기록 개수입니다.
// 요청대로 옵션 없이 항상 최신 3개만 보여주고 저장합니다.
const MAX_HISTORY_ITEMS = 3;

// SillyTavern 확장 설정에 저장할 기본값입니다.
// profileName: 대필에 사용할 연결 프로필 이름입니다.
// tonePreset: 대필 문체를 고르는 값입니다.
// outputLanguage: 결과 언어를 고르는 값입니다.
// lengthPreset: 결과 길이를 고르는 값입니다.
// contextPreset: 최신 메시지를 몇 개 참고할지 고르는 값입니다.
const DEFAULT_SETTINGS = {
  profileName: '',
  tonePreset: 'balanced',
  outputLanguage: 'ko',
  lengthPreset: 'medium',
  contextPreset: 'normal'
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

  button.innerHTML = '<i class="fa-solid fa-ghost" aria-hidden="true"></i>';
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
 * 연결 프로필 전환 실패를 구분하기 위한 전용 오류를 만듭니다.
 *
 * 일반 대필 실패와 프로필 전환 실패는 사용자가 해야 할 조치가 다르므로,
 * 오류 코드로 나눠서 메시지를 다르게 보여줍니다.
 */
function createProfileError(message) {
  const error = new Error(message);
  error.name = 'GhostwriterProfileError';
  return error;
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

  let originalProfileName = '';

  try {
    originalProfileName = await getCurrentConnectionProfileName();
  } catch (error) {
    throw createProfileError(`현재 연결 프로필을 확인하지 못했어요. Connection Profiles가 활성화되어 있는지 확인해 주세요.`);
  }

  if (originalProfileName && originalProfileName === profileName) {
    return {
      originalProfileName,
      targetProfileName: profileName,
      switched: false
    };
  }

  try {
    await switchConnectionProfile(profileName);
  } catch (error) {
    throw createProfileError(`대필용 연결 프로필 "${profileName}"로 전환하지 못했어요. 프로필이 존재하는지 확인해 주세요.`);
  }

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
 * 대필용 연결 프로필로 잠깐 전환한 뒤 작업을 실행하고,
 * 작업이 끝나면 원래 연결 프로필로 복귀합니다.
 *
 * 이 helper를 쓰는 작업:
 * - 현재 입력창 대필
 * - 히스토리 항목 재대필
 * - 영어 히스토리 항목 한국어 번역
 */
async function runWithGhostwriterProfile(task) {
  let profileState = null;

  try {
    profileState = await switchToGhostwriterProfile();
    return await task();
  } finally {
    try {
      await restoreConnectionProfile(profileState);
    } catch (error) {
      console.error(`[${EXTENSION_NAME}] profile restore failed`, error);
      toastr?.warning?.('원래 연결 프로필로 복귀하지 못했어요.');
    }
  }
}

/**
 * 프리셋 객체를 <option> HTML로 바꿉니다.
 *
 * 설정 UI의 톤/언어/길이 드롭다운이 모두 같은 구조라서 공통 함수로 만들었습니다.
 */
function buildPresetOptions(presets) {
  return Object.entries(presets)
    .map(([value, preset]) => `<option value="${value}">${preset.label}</option>`)
    .join('');
}

/**
 * 대필 옵션만 기본값으로 되돌립니다.
 *
 * 유지하는 값:
 * - profileName: 유저가 고른 대필용 API 연결 프로필
 *
 * 초기화하는 값:
 * - tonePreset: 대필 톤
 * - outputLanguage: 출력 언어
 * - lengthPreset: 길이
 * - contextPreset: 참고할 최신 메시지
 */
function resetRewriteOptions(selects) {
  const settings = getSettings();
  settings.tonePreset = DEFAULT_SETTINGS.tonePreset;
  settings.outputLanguage = DEFAULT_SETTINGS.outputLanguage;
  settings.lengthPreset = DEFAULT_SETTINGS.lengthPreset;
  settings.contextPreset = DEFAULT_SETTINGS.contextPreset;

  selects.toneSelect.value = settings.tonePreset;
  selects.languageSelect.value = settings.outputLanguage;
  selects.lengthSelect.value = settings.lengthPreset;
  selects.contextSelect.value = settings.contextPreset;

  saveSettings();
  toastr?.success?.('대필 옵션을 기본값으로 되돌렸어요.');
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
 * 설정값으로 프리셋 객체를 안전하게 가져옵니다.
 *
 * 저장된 값이 오래됐거나 잘못된 값이면 기본값으로 되돌립니다.
 */
function getPresetValue(presets, presetKey, fallbackKey) {
  return presets[presetKey] || presets[fallbackKey];
}

/**
 * SillyTavern 채팅 메시지에서 화면에 넣을 텍스트만 꺼냅니다.
 *
 * SillyTavern 메시지 객체는 버전/상황에 따라 필드가 조금 다를 수 있습니다.
 * 그래서 mes, message, text 후보를 순서대로 확인합니다.
 */
function getChatMessageText(message) {
  const text = message?.mes ?? message?.message ?? message?.text ?? '';
  return String(text).replace(/\s+/g, ' ').trim();
}

/**
 * SillyTavern 채팅 메시지의 말한 주체를 <USER>/<BOT> 태그로 단순화합니다.
 *
 * 실제 이름을 그대로 많이 넣으면 모델이 그 이름을 주어로 오염시킬 수 있으므로,
 * 대필 대상 구분에 필요한 최소 태그만 사용합니다.
 */
function getChatMessageRole(message) {
  if (message?.is_user || message?.isUser) {
    return '<USER>';
  }

  return '<BOT>';
}

/**
 * 현재 채팅에서 최신 메시지를 참고용 텍스트로 추출합니다.
 *
 * 중요한 제한:
 * - 현재 입력창 원문은 아직 채팅에 전송된 메시지가 아니므로 여기에는 들어가지 않습니다.
 * - 최근 메시지는 참고용이며, 실제 rewrite 대상은 buildRewritePrompt()의 <USER_INPUT>입니다.
 */
function getRecentContextText() {
  const settings = getSettings();
  const contextPreset = getPresetValue(CONTEXT_PRESETS, settings.contextPreset, DEFAULT_SETTINGS.contextPreset);
  const messageCount = contextPreset.count;

  if (!messageCount) {
    return '';
  }

  const context = getSillyTavernContext();
  const chat = Array.isArray(context?.chat) ? context.chat : [];

  if (!chat.length) {
    return '';
  }

  return chat
    .slice(-messageCount)
    .map((message) => {
      const text = getChatMessageText(message);

      if (!text) {
        return '';
      }

      return `${getChatMessageRole(message)} ${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * 실제 생성에 사용할 system prompt를 조립합니다.
 *
 * 구조:
 * 1. DEFAULT_SYSTEM_PROMPT: 시점/주어/금지사항 같은 고정 안전 규칙
 * 2. TONE PRESET: 설정에서 고른 문체
 * 3. LANGUAGE PRESET: 설정에서 고른 출력 언어
 * 4. LENGTH PRESET: 설정에서 고른 길이
 * 5. CONTEXT PRESET: 최신 메시지를 몇 개 참고할지
 *
 * 고정 안전 규칙을 항상 앞에 두는 이유:
 * 톤이나 길이 옵션이 강해져도 {{char}} 시점으로 넘어가거나 새 사건을 만들지 않게 하기 위해서입니다.
 */
function buildSystemPrompt() {
  const settings = getSettings();
  const tonePreset = getPresetValue(TONE_PRESETS, settings.tonePreset, DEFAULT_SETTINGS.tonePreset);
  const languagePreset = getPresetValue(LANGUAGE_PRESETS, settings.outputLanguage, DEFAULT_SETTINGS.outputLanguage);
  const lengthPreset = getPresetValue(LENGTH_PRESETS, settings.lengthPreset, DEFAULT_SETTINGS.lengthPreset);
  const contextPreset = getPresetValue(CONTEXT_PRESETS, settings.contextPreset, DEFAULT_SETTINGS.contextPreset);

  return [
    DEFAULT_SYSTEM_PROMPT,
    '',
    'TONE PRESET:',
    tonePreset.prompt,
    '',
    'OUTPUT LANGUAGE:',
    languagePreset.prompt,
    '',
    'LENGTH PRESET:',
    lengthPreset.prompt,
    '',
    'RECENT CONTEXT PRESET:',
    contextPreset.prompt
  ].join('\n');
}

/**
 * 모델에 보낼 실제 프롬프트를 만듭니다.
 *
 * originalText는 유저가 입력창에 쓴 원문입니다.
 * 이 함수만 수정해도 대필 스타일을 크게 바꿀 수 있습니다.
 */
function buildRewritePrompt(originalText) {
  const recentContextText = getRecentContextText();
  const recentContextBlock = recentContextText
    ? ['<RECENT_CONTEXT>', recentContextText, '</RECENT_CONTEXT>', '']
    : ['<RECENT_CONTEXT>', 'No recent context was provided.', '</RECENT_CONTEXT>', ''];

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
    '<USER_PERSONA_STYLE_RULE>',
    'Silently read the available {{user}} / {{User}} persona sheet before rewriting.',
    'Extract durable {{user}} style signals: personality, habits, speech style, emotional expression, body language, social attitude, vocabulary, and recurring mannerisms.',
    'Use those signals to shape the rewrite, but do not reveal or summarize the persona sheet.',
    'Keep {{user}} recognizable even when tone, language, or length presets modify the prose.',
    'Never use {{char}} / <BOT> traits, habits, speech style, or emotions as {{user}} traits.',
    '</USER_PERSONA_STYLE_RULE>',
    '',
    '<CONTEXT_RULE>',
    'Recent context is reference-only.',
    'Use it only for scene continuity, relationship, mood, and immediate conversational context.',
    'Do not continue, answer, copy, or rewrite <RECENT_CONTEXT>.',
    'Rewrite only <USER_INPUT>.',
    '</CONTEXT_RULE>',
    '',
    ...recentContextBlock,
    '<USER_INPUT>',
    originalText,
    '</USER_INPUT>',
    '',
    'Output requirement:',
    'Write only the rewritten third-person prose where {{user}} / {{User}} / <USER> is the actor.',
    'The output should preserve the draft while sounding consistent with {{user}} / {{User}} persona style.'
  ].join('\n');
}

/**
 * 히스토리 결과가 영어인지 가볍게 판별합니다.
 *
 * 목적:
 * - 영어로 출력된 항목에만 "한국어 번역" 버튼을 보여주기
 *
 * 아주 정교한 언어 판별기는 아니지만,
 * 라틴 알파벳이 있고 한글이 없으면 영어 출력으로 간주합니다.
 */
function isLikelyEnglishText(text) {
  const value = String(text || '');
  const hasLatin = /[A-Za-z]/.test(value);
  const hasHangul = /[가-힣]/.test(value);
  return hasLatin && !hasHangul;
}

/**
 * 히스토리의 영어 대필 결과를 한국어로 번역할 때 쓰는 system prompt입니다.
 *
 * 번역은 새 대필이 아니라 의미 보존 작업이므로,
 * 새 사건/대사/정보를 만들지 않도록 제한합니다.
 */
function buildTranslateToKoreanSystemPrompt() {
  return [
    'You are Ghostwriter, a translation tool for roleplay prose.',
    'Translate only the text inside <TEXT> into natural Korean.',
    'Preserve meaning, tone, tense, emotion, and roleplay nuance.',
    'Do not add new events, dialogue, thoughts, facts, or explanations.',
    'Return only the Korean translation.'
  ].join('\n');
}

/**
 * 히스토리의 영어 대필 결과를 한국어로 번역할 때 쓰는 user prompt입니다.
 */
function buildTranslateToKoreanPrompt(text) {
  return [
    '<TEXT>',
    text,
    '</TEXT>'
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
        <button type="button" class="ghostwriter-history-reroll" data-ghostwriter-reroll-latest="true" aria-label="직전 입력 재대필" title="직전 입력을 현재 설정으로 다시 대필합니다.">
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        </button>
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

  if (!panel || !list) {
    return;
  }

  const history = loadHistory();
  lastRenderedChatKey = getCurrentChatKey();
  isHistoryPanelClosed = loadHistoryPanelClosed();
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

    const header = document.createElement('div');
    header.className = 'ghostwriter-history-item-header';

    const time = document.createElement('div');
    time.className = 'ghostwriter-history-time';
    time.textContent = formatHistoryTime(item.createdAt);

    // [히스토리 미리보기]
    // 예전에는 이 영역을 누르면 바로 입력창에 적용했지만,
    // 실수 클릭이 잦아서 이제는 읽기 전용 미리보기 텍스트로만 사용합니다.
    const rewritten = document.createElement('div');
    rewritten.className = 'ghostwriter-history-rewritten';
    rewritten.textContent = item.rewritten;
    rewritten.title = '대필 결과 미리보기입니다. 펼친 뒤 키보드 아이콘을 눌러 입력창에 적용합니다.';

    const translate = document.createElement('button');
    translate.type = 'button';
    translate.className = 'ghostwriter-history-translate';
    translate.dataset.ghostwriterHistoryTranslate = item.id;
    translate.innerHTML = '<i class="fa-solid fa-language" aria-hidden="true"></i>';
    translate.title = '이 영어 대필 결과를 한국어로 번역해서 패널 안에서 봅니다.';
    translate.setAttribute('aria-label', '한국어 번역 보기');

    if (!isLikelyEnglishText(item.rewritten)) {
      translate.hidden = true;
    }

    // [입력창 적용 버튼]
    // 히스토리 항목을 펼친 상태에서만 보이는 전용 버튼입니다.
    // 이 버튼을 눌렀을 때만 저장된 대필 결과를 입력창에 다시 넣습니다.
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'ghostwriter-history-apply';
    apply.dataset.ghostwriterHistoryApply = item.id;
    apply.innerHTML = '<i class="fa-solid fa-keyboard" aria-hidden="true"></i>';
    apply.title = '이 대필 결과를 입력창에 적용합니다.';
    apply.setAttribute('aria-label', '입력창에 적용');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ghostwriter-history-toggle';
    toggle.dataset.ghostwriterHistoryToggle = item.id;
    toggle.innerHTML = '<i class="fa-solid fa-angle-down" aria-hidden="true"></i>';
    toggle.setAttribute('aria-label', '대필 결과 전체보기');
    toggle.setAttribute('aria-expanded', 'false');

    const itemActions = document.createElement('div');
    itemActions.className = 'ghostwriter-history-item-actions';
    itemActions.append(translate, apply, toggle);

    const detail = document.createElement('div');
    detail.className = 'ghostwriter-history-detail';

    const detailText = document.createElement('div');
    detailText.className = 'ghostwriter-history-detail-text';
    detailText.textContent = item.rewritten;

    const translationText = document.createElement('div');
    translationText.className = 'ghostwriter-history-translation ghostwriter-history-translation-hidden';
    translationText.dataset.ghostwriterHistoryTranslation = item.id;

    detail.append(detailText, translationText);
    header.append(time, rewritten, itemActions);
    row.append(header, detail);
    list.appendChild(row);
  });
}

/**
 * 버튼 하나의 작업 중 상태를 켜고 끕니다.
 *
 * 일반 대필은 고스트 버튼을 움직이고,
 * 직전 입력 재대필은 상단 재대필 버튼을 움직이기 위해 공통 helper로 분리했습니다.
 */
function setButtonWorking(button, isWorking) {
  if (!button) {
    return;
  }

  if (isWorking) {
    button.classList.add('ghostwriter-working');
    button.setAttribute('disabled', 'disabled');
    return;
  }

  button.classList.remove('ghostwriter-working');
  button.removeAttribute('disabled');
}

/**
 * 메인 고스트 버튼의 작업 중 상태를 켜고 끕니다.
 */
function setGhostButtonWorking(isWorking) {
  setButtonWorking(document.querySelector(`#${EXTENSION_NAME}-button`), isWorking);
}

/**
 * 히스토리 id로 저장된 항목을 찾습니다.
 */
function findHistoryItem(itemId) {
  return loadHistory().find((historyItem) => historyItem.id === itemId);
}

/**
 * 히스토리에 저장된 영어 대필 결과를 한국어로 번역합니다.
 *
 * 번역 결과는 입력창이나 히스토리에 적용하지 않습니다.
 * 영어 항목의 의미를 확인하기 위한 보기용 텍스트로만 패널 안에 표시합니다.
 */
async function translateHistoryItem(itemId) {
  const item = findHistoryItem(itemId);

  if (!item) {
    toastr?.warning?.('번역할 대필 기록을 찾지 못했어요.');
    renderHistoryPanel();
    return;
  }

  if (!isLikelyEnglishText(item.rewritten)) {
    toastr?.warning?.('영어로 보이는 대필 결과에만 번역을 사용할 수 있어요.');
    return;
  }

  const context = getSillyTavernContext();

  if (!context?.generateRaw) {
    toastr?.error?.('SillyTavern 생성 API를 찾지 못했어요.');
    return;
  }

  const translatedText = await runWithGhostwriterProfile(() => context.generateRaw({
    systemPrompt: buildTranslateToKoreanSystemPrompt(),
    prompt: buildTranslateToKoreanPrompt(item.rewritten)
  }));

  if (typeof translatedText !== 'string' || !translatedText.trim()) {
    toastr?.warning?.('번역 결과가 비어 있어요.');
    return;
  }

  const translationBox = document.querySelector(`[data-ghostwriter-history-translation="${itemId}"]`);

  if (!translationBox) {
    toastr?.warning?.('번역을 표시할 히스토리 항목을 찾지 못했어요.');
    return;
  }

  translationBox.textContent = translatedText.trim();
  translationBox.classList.remove('ghostwriter-history-translation-hidden');
  toastr?.success?.('한국어 번역을 패널에 표시했어요.');
}

/**
 * 히스토리에 저장된 원문을 현재 설정으로 다시 대필합니다.
 *
 * 현재 입력창 내용은 사용하지 않습니다.
 * 저장된 item.original을 기준으로 다시 생성합니다.
 */
async function rewriteHistoryOriginal(itemId) {
  const item = findHistoryItem(itemId);

  if (!item) {
    toastr?.warning?.('재대필할 원문 기록을 찾지 못했어요.');
    renderHistoryPanel();
    return;
  }

  const context = getSillyTavernContext();

  if (!context?.generateRaw) {
    toastr?.error?.('SillyTavern 생성 API를 찾지 못했어요.');
    return;
  }

  const rewrittenText = await runWithGhostwriterProfile(() => context.generateRaw({
    systemPrompt: buildSystemPrompt(),
    prompt: buildRewritePrompt(item.original)
  }));

  if (typeof rewrittenText !== 'string' || !rewrittenText.trim()) {
    toastr?.warning?.('재대필 결과가 비어 있어요.');
    return;
  }

  const cleanedText = rewrittenText.trim();
  setInputTextareaValue(cleanedText);
  addHistoryItem(item.original, cleanedText);
  toastr?.success?.('저장된 원문을 다시 대필했어요.');
}

/**
 * 가장 최근 히스토리에 저장된 원문을 현재 설정으로 다시 대필합니다.
 *
 * 사용자가 말한 "직전 인풋"은 가장 최근 대필을 만들 때 입력창에 있던 원문입니다.
 * 히스토리에는 original로 저장되어 있으므로, 최신 항목의 original을 사용합니다.
 */
async function rewriteLatestOriginal() {
  const latestItem = loadHistory()[0];

  if (!latestItem?.original) {
    toastr?.warning?.('재대필할 직전 입력이 없어요.');
    return;
  }

  await rewriteHistoryOriginal(latestItem.id);
}

/**
 * 히스토리 패널 안의 버튼을 처리합니다.
 *
 * 동작:
 * - 닫기: 패널을 숨기고 현재 채팅에 닫힘 상태를 저장합니다.
 * - 토글 아이콘: 한 줄로 줄인 대필 결과를 전체 문장으로 펼치거나 접습니다.
 * - 적용 아이콘: 펼친 항목의 대필 결과를 입력창에 다시 적용합니다.
 */
async function handleHistoryPanelClick(event) {
  const closeButton = event.target.closest('[data-ghostwriter-history-close]');
  const rerollLatestButton = event.target.closest('[data-ghostwriter-reroll-latest]');
  const toggleButton = event.target.closest('[data-ghostwriter-history-toggle]');
  const applyButton = event.target.closest('[data-ghostwriter-history-apply]');
  const translateButton = event.target.closest('[data-ghostwriter-history-translate]');

  if (closeButton) {
    isHistoryPanelClosed = true;
    saveHistoryPanelClosed(true);
    document.querySelector(`#${EXTENSION_NAME}-history`)?.classList.add('ghostwriter-history-hidden');
    return;
  }

  if (rerollLatestButton) {
    if (isGenerating) {
      return;
    }

    try {
      isGenerating = true;
      setButtonWorking(rerollLatestButton, true);
      await rewriteLatestOriginal();
    } catch (error) {
      console.error(`[${EXTENSION_NAME}] latest rewrite failed`, error);

      if (error?.name === 'GhostwriterProfileError') {
        toastr?.error?.(error.message);
      } else {
        toastr?.error?.('직전 입력 재대필 중 오류가 발생했어요. 콘솔을 확인해 주세요.');
      }
    } finally {
      isGenerating = false;
      setButtonWorking(rerollLatestButton, false);
    }

    return;
  }

  if (toggleButton) {
    const row = toggleButton.closest('[data-ghostwriter-history-id]');
    const isExpanded = row?.classList.toggle('ghostwriter-history-item-expanded');

    toggleButton.innerHTML = isExpanded
      ? '<i class="fa-solid fa-angle-up" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-angle-down" aria-hidden="true"></i>';
    toggleButton.setAttribute('aria-label', isExpanded ? '대필 결과 접기' : '대필 결과 전체보기');
    toggleButton.setAttribute('aria-expanded', String(Boolean(isExpanded)));
    return;
  }

  if (translateButton) {
    if (isGenerating) {
      return;
    }

    try {
      isGenerating = true;
      setButtonWorking(translateButton, true);
      await translateHistoryItem(translateButton.dataset.ghostwriterHistoryTranslate);
    } catch (error) {
      console.error(`[${EXTENSION_NAME}] history action failed`, error);

      if (error?.name === 'GhostwriterProfileError') {
        toastr?.error?.(error.message);
      } else {
        toastr?.error?.('히스토리 작업 중 오류가 발생했어요. 콘솔을 확인해 주세요.');
      }
    } finally {
      isGenerating = false;
      setButtonWorking(translateButton, false);
    }

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
 * 설정에서 대필용 연결 프로필을 골랐다면,
 * 생성 직전에 해당 프로필로 전환하고 완료 후 원래 프로필로 복귀합니다.
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
    setButtonWorking(button, true);

    const rewrittenText = await runWithGhostwriterProfile(() => context.generateRaw({
      systemPrompt: buildSystemPrompt(),
      prompt: buildRewritePrompt(originalText)
    }));

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

    if (error?.name === 'GhostwriterProfileError') {
      toastr?.error?.(error.message);
    } else {
      toastr?.error?.('대필 중 오류가 발생했어요. 콘솔을 확인해 주세요.');
    }
  } finally {
    isGenerating = false;
    setButtonWorking(button, false);
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

  if (sendButton) {
    /*
     * [전송 버튼 옆 배치]
     * 전송 버튼은 하단 툴바의 오른쪽 끝 기준점인 경우가 많습니다.
     * 버튼을 sendButton 뒤에 붙이면 레이아웃에 따라 줄 끝/정렬 기준이 달라질 수 있어서,
     * 실제 화면에서는 전송 버튼 바로 왼쪽에 오도록 sendButton 직전에 삽입합니다.
     */
    container.insertBefore(button, sendButton);
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
          대필할 때만 이 프로필로 전환하고, 완료 후 원래 프로필로 돌아가요.
        </div>
        <label class="ghostwriter-settings-field" for="${EXTENSION_NAME}-tone-preset">
          <span>대필 톤</span>
          <select id="${EXTENSION_NAME}-tone-preset" class="text_pole">
            ${buildPresetOptions(TONE_PRESETS)}
          </select>
        </label>
        <label class="ghostwriter-settings-field" for="${EXTENSION_NAME}-output-language">
          <span>출력 언어</span>
          <select id="${EXTENSION_NAME}-output-language" class="text_pole">
            ${buildPresetOptions(LANGUAGE_PRESETS)}
          </select>
        </label>
        <label class="ghostwriter-settings-field" for="${EXTENSION_NAME}-length-preset">
          <span>길이</span>
          <select id="${EXTENSION_NAME}-length-preset" class="text_pole">
            ${buildPresetOptions(LENGTH_PRESETS)}
          </select>
        </label>
        <label class="ghostwriter-settings-field" for="${EXTENSION_NAME}-context-preset">
          <span>참고할 최신 메시지</span>
          <select id="${EXTENSION_NAME}-context-preset" class="text_pole">
            ${buildPresetOptions(CONTEXT_PRESETS)}
          </select>
        </label>
        <div class="ghostwriter-settings-hint">
          대필은 과거형 3인칭으로 고정돼요. 최신 메시지는 장면 참고용이며, 다시 쓰는 대상은 입력창 원문뿐이에요.
        </div>
        <div class="ghostwriter-settings-actions">
          <button
            type="button"
            class="menu_button ghostwriter-settings-reset"
            data-ghostwriter-reset-options="true"
          >
            옵션 초기화
          </button>
        </div>
      </div>
    </div>
  `;

  settingsRoot.appendChild(panel);

  const profileSelect = panel.querySelector(`#${EXTENSION_NAME}-profile-name`);
  const refreshButton = panel.querySelector('[data-ghostwriter-profile-refresh]');
  const toneSelect = panel.querySelector(`#${EXTENSION_NAME}-tone-preset`);
  const languageSelect = panel.querySelector(`#${EXTENSION_NAME}-output-language`);
  const lengthSelect = panel.querySelector(`#${EXTENSION_NAME}-length-preset`);
  const contextSelect = panel.querySelector(`#${EXTENSION_NAME}-context-preset`);
  const resetButton = panel.querySelector('[data-ghostwriter-reset-options]');

  profileSelect.addEventListener('change', () => {
    getSettings().profileName = profileSelect.value;
    saveSettings();
  });

  toneSelect.value = TONE_PRESETS[settings.tonePreset] ? settings.tonePreset : DEFAULT_SETTINGS.tonePreset;
  toneSelect.addEventListener('change', () => {
    getSettings().tonePreset = toneSelect.value;
    saveSettings();
  });

  languageSelect.value = LANGUAGE_PRESETS[settings.outputLanguage] ? settings.outputLanguage : DEFAULT_SETTINGS.outputLanguage;
  languageSelect.addEventListener('change', () => {
    getSettings().outputLanguage = languageSelect.value;
    saveSettings();
  });

  lengthSelect.value = LENGTH_PRESETS[settings.lengthPreset] ? settings.lengthPreset : DEFAULT_SETTINGS.lengthPreset;
  lengthSelect.addEventListener('change', () => {
    getSettings().lengthPreset = lengthSelect.value;
    saveSettings();
  });

  contextSelect.value = CONTEXT_PRESETS[settings.contextPreset] ? settings.contextPreset : DEFAULT_SETTINGS.contextPreset;
  contextSelect.addEventListener('change', () => {
    getSettings().contextPreset = contextSelect.value;
    saveSettings();
  });

  resetButton.addEventListener('click', () => {
    resetRewriteOptions({
      toneSelect,
      languageSelect,
      lengthSelect,
      contextSelect
    });
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
