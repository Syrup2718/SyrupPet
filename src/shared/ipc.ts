/**
 * Central registry of IPC channel names. Keeping them here avoids typos and
 * makes the surface area between main <-> renderer easy to audit.
 *
 * Naming convention: "<domain>:<verb>".
 *  - invoke  : renderer -> main, returns a value (request/response)
 *  - send    : renderer -> main, fire-and-forget
 *  - emit    : main -> renderer, pushed events
 */
export const IPC = {
  // --- pet window control (renderer -> main) ---
  petDragStart: 'pet:drag-start',
  petDragMove: 'pet:drag-move', // { x, y } target window top-left (screen DIP)
  petDragEnd: 'pet:drag-end',
  petSetInteractive: 'pet:set-interactive',

  // --- chat / LLM (renderer -> main, invoke) ---
  chatSend: 'chat:send',
  clipboardAnalyze: 'clipboard:analyze',

  // --- config (renderer -> main, invoke) ---
  configGet: 'config:get',
  configSet: 'config:set',

  // --- windows ---
  windowClose: 'window:close',

  // --- main -> renderer events ---
  petSay: 'pet:say', // PetReply: bubble + expression + action
  petEmotion: 'pet:emotion', // Emotion: switch expression only
  cursorMove: 'cursor:move', // { x, y } global cursor for eye-follow
  environmentUpdate: 'environment:update', // EnvironmentSnapshot
  chatReply: 'chat:reply', // { request, reply } pushed to chat window
  chatThinking: 'chat:thinking' // boolean: show typing indicator
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
