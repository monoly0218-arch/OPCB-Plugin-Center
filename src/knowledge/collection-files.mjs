export const FILE_KINDS = { document: '文档', image: '图片', video: '视频', audio: '音频', link: '链接' };
export async function readCollectedFile(service, identity, receipt, signal) {
  signal.throwIfAborted();
  if (!receipt || receipt.state !== 'complete' || receipt.owner !== identity.owner || !Number.isInteger(receipt.size) || receipt.size < 1 || receipt.size > 32 * 1024 * 1024) throw Error('入库文件不可读取');
  const bytes = new Uint8Array(receipt.size), count = Math.ceil(receipt.size / (128 * 1024));
  let at = 0;
  for (let seq = 0; seq < count; seq++) {
    const part = await service.collect(identity, { op: 'get', id: receipt.id, seq }, { signal });
    signal.throwIfAborted();
    if (part.state !== 'complete' || part.id !== receipt.id || part.owner !== identity.owner || part.sha256 !== receipt.sha256 || typeof part.chunk !== 'string') throw Error('入库文件回读未确认');
    const binary = atob(part.chunk);
    if (binary.length !== Math.min(128 * 1024, receipt.size - at)) throw Error('文件分块不完整');
    for (let i = 0; i < binary.length; i++) bytes[at++] = binary.charCodeAt(i);
  }
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  signal.throwIfAborted();
  if (hash !== receipt.sha256) throw Error('原文件校验失败');
  return bytes;
}
