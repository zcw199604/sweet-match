import { randomInt } from 'node:crypto';
import { Room } from '@colyseus/core';

// 房间码：5 位，去掉容易看混的 I O 0 1。只在本进程内保证不重复（单进程部署）。
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codesInUse = new Set();
function newCode() {
  for (;;) {
    const code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    if (!codesInUse.has(code)) { codesInUse.add(code); return code; }
  }
}

// 带房间码的房间：创建者凭一次性密钥入座（密钥只在创建者手里，不进 metadata、不发给任何客户端），其余人必须带对房间码。
// 配合 defineRoom(...).filterBy(['code'])：加入时按房间码找房间。
export class CodeRoom extends Room {
  initCode({ hostKey } = {}) {
    this.code = newCode();
    this.setMetadata({ code: this.code });
    this.hostKey = typeof hostKey === 'string' && hostKey.length >= 16 ? hostKey : null;
    this.hostSeated = false;
  }

  // 返回值会作为 onJoin 的第三个参数：host 表示这是创建者。
  onAuth(client, options = {}) {
    if (this.hostKey && !this.hostSeated && options.hostKey === this.hostKey) { this.hostSeated = true; return { host: true }; }
    if (options.code === this.code) return { host: false };
    throw new Error('房间码不对');
  }

  onDispose() {
    codesInUse.delete(this.code);
  }
}
