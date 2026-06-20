import { ACTIONS, EMOTIONS } from '@shared/types'
import type { ChatRequest, EnvironmentSnapshot } from '@shared/types'

/**
 * Builds the system prompt. The key idea of SyrupPet: the LLM must return a
 * JSON object with `text` + `emotion` + `action` so the body can come alive,
 * not just print text.
 */
export function buildSystemPrompt(persona: string): string {
  return [
    persona,
    '',
    '【輸出格式 — 非常重要】',
    '你必須只回覆一個 JSON 物件，不要有任何多餘文字或 markdown 程式碼框，格式如下：',
    '{',
    '  "text": "要說的話（繁體中文，簡短自然，1~3 句）",',
    `  "emotion": 從這些選一個 [${EMOTIONS.join(', ')}],`,
    `  "action": 從這些選一個 [${ACTIONS.join(', ')}]`,
    '}',
    '',
    '情緒對應（依當下心情挑最貼切的一個）：',
    '  normal=平常溫柔, happy=開心/有進展, confused=疑惑/需要確認, angry=被連點或可愛吐槽(別真兇),',
    '  thinking=分析問題/看錯誤/規劃中, sleepy=想睡/深夜/提醒休息,',
    '  shy=被誇獎或害羞, excited=很興奮/超開心跟著嗨, love=撒嬌/表達喜歡與陪伴, sad=心疼/擔心使用者。',
    '動作對應：idle=不動, wave=揮手打招呼, jump=開心跳, nod=點頭同意, shake=搖頭/吐槽, sleep=打瞌睡。',
    '請讓 emotion 和 action 真的符合你說的話，這樣你才有生命感。'
  ].join('\n')
}

function describeEnvironment(env: EnvironmentSnapshot): string {
  const parts: string[] = []
  if (env.activeProcess) parts.push(`目前前景程式：${env.activeProcess}`)
  if (env.activeTitle) parts.push(`視窗標題：${env.activeTitle}`)
  parts.push(env.isActive ? '使用者最近有在動（打字或滑鼠）' : `使用者閒置了約 ${env.idleSeconds} 秒`)
  return parts.join('；')
}

/** Wraps the actual user/clipboard content with intent-specific framing. */
export function buildUserPrompt(req: ChatRequest): string {
  const blocks: string[] = []

  if (req.context) {
    blocks.push(`（背景資訊，僅供參考，使用者沒有直接打這些字）：${describeEnvironment(req.context)}`)
  }

  switch (req.intent) {
    case 'clipboard':
      blocks.push(
        '使用者剛剛主動把下面這段內容複製到剪貼簿，想請你幫忙看一下、解釋或給建議：',
        '------',
        req.content,
        '------',
        '請用桌寵的口吻簡短說明你看到什麼、重點或建議。'
      )
      break
    case 'proactive':
      blocks.push(
        '（這是你「主動」開口，不是在回答問題。根據下面的情況，用小漿糖的口吻說一句自然、簡短、有節制的話——像朋友順口關心一下，不要太黏、不要說教、不要每次都問問題。）',
        req.content
      )
      break
    case 'chat':
    default:
      blocks.push(req.content)
      break
  }

  return blocks.join('\n')
}
