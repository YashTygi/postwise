// Telegram Bot API is just HTTPS POST. A client library would be 400kB of
// node_modules to save these 40 lines.
const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export type Button = { text: string; callback_data: string }

async function tg(method: string, body: unknown) {
  const res = await fetch(`${API()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description}`)
  return data.result
}

/** Telegram hard-caps messages at 4096 chars. Split rather than fail. */
export async function send(chatId: string, text: string, buttons?: Button[][]) {
  const chunks = text.match(/[\s\S]{1,3900}/g) ?? ['']
  for (let i = 0; i < chunks.length; i++) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: chunks[i],
      // Buttons only on the final chunk, otherwise they scroll away.
      reply_markup: i === chunks.length - 1 && buttons ? { inline_keyboard: buttons } : undefined,
      link_preview_options: { is_disabled: true },
    })
  }
}

export async function answerCallback(id: string, text?: string) {
  await tg('answerCallbackQuery', { callback_query_id: id, text })
}

/** Download a voice note / document the user sent. */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const { file_path } = await tg('getFile', { file_id: fileId })
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file_path}`)
  return Buffer.from(await res.arrayBuffer())
}

export function setWebhook(url: string, secret: string) {
  return tg('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  })
}
