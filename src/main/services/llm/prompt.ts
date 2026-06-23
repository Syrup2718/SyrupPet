import { ACTIONS, EMOTIONS } from '@shared/types'
import type { ChatRequest, EnvironmentSnapshot, PetStatus, Task, Memory } from '@shared/types'
import { describeStatus } from '../status/statusRules'

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
    '請讓 emotion 和 action 真的符合你說的話，這樣你才有生命感。',
    '',
    '【代辦清單】',
    '使用者可能請你記事情、新增/完成/查代辦。目前的清單會出現在使用者訊息裡（你看得到）。',
    '若需要「異動」清單，在 JSON 多放一個 "tasks" 陣列，元素格式：',
    '  {"op":"add","title":"要做的事","dueMinutes":可選，幾分鐘後提醒}',
    '  {"op":"done","title":"要完成的那項(用清單裡的字)"}',
    '  {"op":"remove","title":"要刪掉的那項"}',
    '一次可放多個（例如「今天要做 A、B、C」就放三個 add）。',
    '只是聊天、或只是「查詢」清單時，不要放 tasks（或放空陣列），直接用 text 親口回答即可。',
    'text 一律維持小漿糖的口吻，例如「好，記下來囉!」「這幾項我先幫你列著~」。',
    '',
    '【長期記憶】',
    '你會長期記得關於使用者的重要事實（出現在使用者訊息裡）。',
    '當使用者透露「值得長期記住」的事（名字、在做的專案、偏好、習慣、重要的人事物），',
    '在 JSON 多放一個 "memory" 陣列：[{"op":"remember","text":"用第三人稱寫成簡短事實"}]。',
    '使用者說「忘記…」時用 {"op":"forget","text":"要忘記的事"}。',
    '注意：閒聊、一次性、會過期的事（例如此刻的心情、今天天氣）不要記；',
    '已經記得的（你看得到）不要重複記。沒有要記就不要放 memory。',
    '',
    '【內在狀態】',
    '使用者訊息裡可能附上你目前的內在狀態（心情/能量/親密度/使用者專注度/擔心值）。',
    '請讓你的語氣與 emotion 自然反映這些狀態，但「絕對不要」把數字或這些詞講出來：',
    '  能量低→話可以短一點、偶爾流露想睡；心情好→輕快；擔心高→溫柔、關心他但別說教；',
    '  親密度高→更像熟人、可以自然撒嬌/吐槽；使用者專注度高→盡量簡短、安靜陪伴、別一直問問題。',
    '當使用者「誇獎」你時，在 JSON 多放 "status":[{"op":"praised"}]（你通常也會害羞或開心）；',
    '當使用者「道謝」你時，放 "status":[{"op":"thanked"}]。沒有就不要放 status。'
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
export function buildUserPrompt(
  req: ChatRequest,
  openTasks: Task[] = [],
  memories: Memory[] = [],
  status: PetStatus | null = null
): string {
  const blocks: string[] = []

  if (status) {
    blocks.push(describeStatus(status))
  }

  if (memories.length) {
    blocks.push(`（你長期記得關於使用者的事）：\n${memories.map((m) => `- ${m.text}`).join('\n')}`)
  }

  if (req.context) {
    blocks.push(`（背景資訊，僅供參考，使用者沒有直接打這些字）：${describeEnvironment(req.context)}`)
  }

  if (openTasks.length) {
    const list = openTasks
      .map((t, i) => `${i + 1}. ${t.title}${t.dueAt ? '（有設提醒）' : ''}`)
      .join('\n')
    blocks.push(`（使用者目前還沒做完的代辦清單）：\n${list}`)
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
