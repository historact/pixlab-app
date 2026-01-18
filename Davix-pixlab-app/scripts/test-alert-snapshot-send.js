const fs = require('fs');
const path = require('path');
const { generateAlertSnapshot } = require('../utils/monitoringSnapshot');
const { prepareAttachments, prepareTelegramPhoto } = require('../utils/alerts');

async function main() {
  const ruleId = process.argv[2] || 'manual';
  const snapshotPath = await generateAlertSnapshot(ruleId);
  const stats = await fs.promises.stat(snapshotPath);
  if (!stats.size) {
    throw new Error(`Snapshot is empty at ${snapshotPath}`);
  }
  const buffer = await fs.promises.readFile(snapshotPath);
  const signature = buffer.subarray(0, 8).toString('hex');
  const pngSignature = '89504e470d0a1a0a';
  if (signature !== pngSignature) {
    throw new Error(`Snapshot is not PNG: ${signature}`);
  }

  const attachments = await prepareAttachments([
    { filename: path.basename(snapshotPath), path: snapshotPath, contentType: 'image/png' },
  ]);
  if (!attachments.length || !attachments[0].content) {
    throw new Error('Email attachment not prepared');
  }

  const telegramPhoto = await prepareTelegramPhoto({ path: snapshotPath, caption: 'test' });
  if (!telegramPhoto || !telegramPhoto.buffer) {
    throw new Error('Telegram photo not prepared');
  }

  console.log('PASS');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
