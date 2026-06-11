// Minimal Slack Web API helpers using the modern external-upload flow.
// Requires a bot token (xoxb-) with scopes: chat:write, files:write, im:write.

const SLACK_API = "https://slack.com/api";

function token() {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) throw new Error("Missing SLACK_BOT_TOKEN environment variable.");
  return t;
}

async function slackGet(method: string, params: Record<string, string>) {
  const url = new URL(`${SLACK_API}/${method}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token()}` },
  });
  return res.json();
}

async function slackPostJson(method: string, body: any) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Post a plain text message to a channel or user.
export async function postMessage(channel: string, text: string) {
  const data = await slackPostJson("chat.postMessage", { channel, text });
  if (!data.ok) throw new Error(`slack chat.postMessage: ${data.error}`);
  return data;
}

// Open a DM channel with a user and return its channel id.
export async function openDm(userId: string): Promise<string> {
  const data = await slackPostJson("conversations.open", { users: userId });
  if (!data.ok) throw new Error(`slack conversations.open: ${data.error}`);
  return data.channel.id;
}

// Upload a PNG image to a channel with an initial comment.
// Uses files.getUploadURLExternal -> upload -> files.completeUploadExternal.
export async function uploadImage(
  channel: string,
  filename: string,
  bytes: Uint8Array,
  initialComment?: string,
  title?: string
) {
  // 1) Get an upload URL
  const getUrl = await slackGet("files.getUploadURLExternal", {
    filename,
    length: String(bytes.byteLength),
  });
  if (!getUrl.ok) throw new Error(`slack getUploadURLExternal: ${getUrl.error}`);
  const { upload_url, file_id } = getUrl;

  // 2) PUT/POST the bytes to the upload URL
  const put = await fetch(upload_url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!put.ok) {
    throw new Error(`slack file upload failed: ${put.status}`);
  }

  // 3) Complete the upload and share into the channel
  const complete = await slackPostJson("files.completeUploadExternal", {
    files: [{ id: file_id, title: title || filename }],
    channel_id: channel,
    initial_comment: initialComment,
  });
  if (!complete.ok) {
    throw new Error(`slack completeUploadExternal: ${complete.error}`);
  }
  return complete;
}
