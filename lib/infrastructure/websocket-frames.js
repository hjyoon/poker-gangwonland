import crypto from "node:crypto";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function makeWebSocketFrame(payload, opcode = 0x1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const firstByte = 0x80 | opcode;
  const header =
    body.length < 126
      ? Buffer.from([firstByte, body.length])
      : body.length < 65536
        ? Buffer.from([firstByte, 126, body.length >> 8, body.length & 0xff])
        : null;

  if (!header) {
    throw new Error("WebSocket frame too large");
  }

  return Buffer.concat([header, body]);
}

export function parseWebSocketFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    }
    if (length === 127) {
      break;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (offset + frameLength > buffer.length) {
      break;
    }

    const mask = masked ? buffer.subarray(offset + headerLength, offset + headerLength + 4) : null;
    const dataStart = offset + headerLength + maskLength;
    const payload = Buffer.from(buffer.subarray(dataStart, dataStart + length));
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    if (opcode === 0x8) {
      frames.push({ type: "close" });
    } else if (opcode === 0x9) {
      frames.push({ type: "ping", payload });
    } else if (opcode === 0x1) {
      frames.push({ type: "text", payload: payload.toString("utf8") });
    }

    offset += frameLength;
  }

  return { frames, remaining: buffer.subarray(offset) };
}

export function webSocketHandshakeResponse(key) {
  const accept = crypto.createHash("sha1").update(`${key}${WEBSOCKET_GUID}`).digest("base64");
  return [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n");
}
